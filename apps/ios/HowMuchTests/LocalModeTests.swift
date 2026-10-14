import SwiftUI
import XCTest
@testable import HowMuch

/// Local mode end to end: `APIClient` → `LocalEngine` → the bundled backend →
/// SQLite, with the same decoding and error mapping as a server.
final class LocalModeTests: XCTestCase {
  private var directory: URL!
  private var previousEngine: LocalEngine?
  private var defaults: UserDefaults!
  private var suiteName = ""

  override func setUpWithError() throws {
    try super.setUpWithError()
    directory = FileManager.default.temporaryDirectory
      .appending(path: "LocalModeTests-\(UUID().uuidString)", directoryHint: .isDirectory)
    previousEngine = LocalEngine.useShared(LocalEngine(databaseURL: directory.appending(path: "howmuch.sqlite")))
    suiteName = "HowMuch.LocalModeTests.\(UUID().uuidString)"
    defaults = UserDefaults(suiteName: suiteName)
  }

  override func tearDownWithError() throws {
    LocalEngine.useShared(previousEngine)
    defaults.removePersistentDomain(forName: suiteName)
    try? FileManager.default.removeItem(at: directory)
    try super.tearDownWithError()
  }

  func testServerErrorsMapAsTheyDoOverTheNetwork() async throws {
    let settings = APISettings.local(in: defaults)
    let client = APIClient(settings: settings)

    do {
      _ = try await client.fetchTransaction(planID: settings.planID, transactionID: "missing")
      XCTFail("Expected a not-found error")
    } catch APIClientError.notFound(let message) {
      XCTAssertFalse(message.isEmpty)
    }
  }

  private func starterNames(_ client: APIClient, planID: String) async throws -> [String] {
    try await client.fetchCategories(planID: planID)
      .filter { !$0.isQuiet }
      .flatMap { $0.categories.map(\.name) }
      .sorted()
  }

  func testStartingLocallySeedsCategoriesOnlyOnce() async throws {
    let settings = APISettings.local(in: defaults)
    let client = APIClient(settings: settings)
    try await LocalEngine.shared.prepare(config: settings.localEngineConfig)

    try await StarterCategories.seedIfNeeded(client: client, planID: settings.planID, defaults: defaults)
    try await StarterCategories.seedIfNeeded(client: client, planID: settings.planID, defaults: defaults)

    let names = try await starterNames(client, planID: settings.planID)
    XCTAssertEqual(names, StarterCategories.groups.flatMap(\.categories).sorted())
    XCTAssertTrue(defaults.bool(forKey: StarterCategories.completionKey(planID: settings.planID)))
  }

  /// A seed cut short resumes: the next run creates only what is missing, and
  /// a starter id that already exists counts as done rather than failing.
  func testAnInterruptedSeedCompletesWithoutDuplicates() async throws {
    let settings = APISettings.local(in: defaults)
    let client = APIClient(settings: settings)
    let planID = settings.planID
    try await LocalEngine.shared.prepare(config: settings.localEngineConfig)
    let steps = StarterCategories.steps(planID: planID)
    guard case .group(let groupID, let groupName) = steps[0],
          case .category(let categoryID, _, _) = steps[1]
    else {
      return XCTFail("The starter set must open with a group and its first category")
    }
    // The first run got this far, and the user renamed that category since.
    try await client.createCategoryGroup(planID: planID, id: groupID, name: groupName)
    try await client.createCategory(planID: planID, id: categoryID, groupID: groupID, name: "Food")

    try await StarterCategories.seedIfNeeded(client: client, planID: planID, defaults: defaults)

    var expected = StarterCategories.groups.flatMap(\.categories)
    expected[0] = "Food"
    let names = try await starterNames(client, planID: planID)
    XCTAssertEqual(names, expected.sorted())
    let groupCount = try await client.fetchCategories(planID: planID).filter { !$0.isQuiet }.count
    XCTAssertEqual(groupCount, StarterCategories.groups.count)
  }

  func testACompletedSeedNeverRecreatesACategoryTheUserRemoved() async throws {
    let settings = APISettings.local(in: defaults)
    let client = APIClient(settings: settings)
    let planID = settings.planID
    try await LocalEngine.shared.prepare(config: settings.localEngineConfig)
    try await StarterCategories.seedIfNeeded(client: client, planID: planID, defaults: defaults)
    guard case .category(let categoryID, _, _) = StarterCategories.steps(planID: planID)[1] else {
      return XCTFail("Expected a starter category")
    }
    let deleted = try await LocalEngine.shared.handle(
      config: settings.localEngineConfig,
      method: "DELETE",
      path: "/v1/plans/\(planID)/categories/\(categoryID)",
      query: nil,
      headers: ["Authorization": "Bearer \(settings.sessionToken)"],
      body: nil
    )
    XCTAssertTrue((200 ..< 300).contains(deleted.status), "delete answered \(deleted.status)")
    let afterDelete = try await starterNames(client, planID: planID)
    XCTAssertFalse(afterDelete.contains("Groceries"))

    try await StarterCategories.seedIfNeeded(client: client, planID: planID, defaults: defaults)
    // Even with the completion flag lost, the deleted id is not reused.
    defaults.removeObject(forKey: StarterCategories.completionKey(planID: planID))
    try await StarterCategories.seedIfNeeded(client: client, planID: planID, defaults: defaults)

    let afterReseed = try await starterNames(client, planID: planID)
    XCTAssertFalse(afterReseed.contains("Groceries"))
    XCTAssertEqual(afterReseed.count, StarterCategories.groups.flatMap(\.categories).count - 1)
  }

  /// Local mode has no session to revoke: an expiry notice must not sign it out.
  @MainActor
  func testLocalModeIgnoresAuthenticationExpiry() async throws {
    let settings = APISettings.local(in: defaults)
    let model = AppModel(
      outboxStore: .temporary(),
      settings: settings,
      viewPrefs: ViewPrefs(),
      snapshotStore: SnapshotStore(directory: directory.appending(path: "snapshots", directoryHint: .isDirectory)),
      hasSavedSettings: true
    )

    NotificationCenter.default.post(name: .howMuchAuthenticationExpired, object: settings.sessionToken)
    for _ in 0 ..< 20 {
      await Task.yield()
    }
    try await Task.sleep(nanoseconds: 100_000_000)

    XCTAssertTrue(model.settings.isAuthenticated)
    XCTAssertEqual(model.settings.authenticatedUserID, APISettings.localUserID)
    XCTAssertFalse(model.isShowingSettings)
  }

  /// Local mode writes land in the on-device engine straight away: the
  /// outbox sends at once, the engine never refuses for want of a network,
  /// and nothing is left waiting.
  @MainActor
  func testLocalWritesReachTheEngineAtOnce() async throws {
    let settings = APISettings.local(in: defaults)
    let client = APIClient(settings: settings)
    try await LocalEngine.shared.prepare(config: settings.localEngineConfig)
    let account = try await client.createAccount(
      planID: settings.planID, name: "Everyday", type: "checking", balance: 100_000, icon: nil, onBudget: true
    )
    let model = AppModel(
      outboxStore: .temporary(),
      settings: settings,
      viewPrefs: ViewPrefs(),
      snapshotStore: SnapshotStore(directory: directory.appending(path: "snapshots", directoryHint: .isDirectory)),
      hasSavedSettings: true
    )
    await model.refresh(slices: [.accounts, .ledger], quiet: false)

    var draft = TransactionDraft()
    draft.accountID = account.id
    draft.amountMagnitudeMilli = 12_340
    draft.payeeName = "Coffee"
    try model.commit(draft)
    await model.waitForOutboxDrain()

    let page = try await client.fetchTransactions(planID: settings.planID)
    let created = try XCTUnwrap(page.transactions.first)
    XCTAssertTrue(created.id.hasPrefix("txn_"), "the engine keeps the id the device minted")
    XCTAssertEqual(model.unsentChangeCount, 0)
    XCTAssertEqual(model.transactions.map(\.id), [created.id])

    try await model.toggleTransactionCleared(try XCTUnwrap(model.transactions.first))
    await model.waitForOutboxDrain()
    let toggled = try await client.fetchTransaction(planID: settings.planID, transactionID: created.id)
    XCTAssertEqual(toggled.cleared, .cleared)

    try await model.deleteTransaction(try XCTUnwrap(model.transactions.first))
    await model.waitForOutboxDrain()
    let afterDelete = try await client.fetchTransactions(planID: settings.planID)
    XCTAssertTrue(afterDelete.transactions.isEmpty)
    XCTAssertEqual(model.unsentChangeCount, 0)
    await model.refresh(slices: [.accounts])
    XCTAssertEqual(model.accounts.first?.balance, 100_000)
  }

  /// Failure mode: `URLQueryItem` leaves a "+" bare in the query, and the
  /// backend's `URLSearchParams` reads it as a space, so a search for
  /// "C+C" (or a "+12.50" inflow search) reaches the server as something else.
  func testRegisterSearchSendsAPlusSignIntact() async throws {
    let settings = APISettings.local(in: defaults)
    let client = APIClient(settings: settings)
    try await LocalEngine.shared.prepare(config: settings.localEngineConfig)
    let account = try await client.createAccount(
      planID: settings.planID, name: "Everyday", type: "checking", balance: 0, icon: nil, onBudget: true
    )
    _ = try await client.createTransaction(planID: settings.planID, request: TransactionWriteRequest(
      accountID: account.id, date: "2026-09-01", amount: -12_500, payeeID: nil, payeeName: "C+C Hardware",
      categoryID: nil, memo: nil, cleared: .uncleared, approved: true, flagColor: nil, subtransactions: []
    ))
    _ = try await client.createTransaction(planID: settings.planID, request: TransactionWriteRequest(
      accountID: account.id, date: "2026-09-02", amount: 12_500, payeeID: nil, payeeName: "Refund",
      categoryID: nil, memo: nil, cleared: .uncleared, approved: true, flagColor: nil, subtransactions: []
    ))

    let byName = try await client.fetchTransactions(planID: settings.planID, q: "C+C")
    XCTAssertEqual(byName.transactions.map(\.payeeName), ["C+C Hardware"])
    let inflows = try await client.fetchTransactions(planID: settings.planID, q: "+12.50")
    XCTAssertEqual(inflows.transactions.map(\.payeeName), ["Refund"])
  }

  /// Failure mode: one engine run enters at most 25 occurrences, as the
  /// Worker's daily cron does, and says `has_more` when more are due.
  @MainActor
  func testLocalCatchUpEntersEveryDueOccurrence() async throws {
    let settings = APISettings.local(in: defaults)
    let client = APIClient(settings: settings)
    try await LocalEngine.shared.prepare(config: settings.localEngineConfig)
    let account = try await client.createAccount(
      planID: settings.planID, name: "Everyday", type: "checking", balance: 0, icon: nil, onBudget: true
    )
    let start = try XCTUnwrap(Calendar.current.date(byAdding: .day, value: -29, to: .now)).isoDateString
    _ = try await client.createScheduledTransaction(
      planID: settings.planID,
      idempotencyKey: "local-catch-up",
      request: ScheduledTransactionWriteRequest(
        accountID: account.id, dateFirst: start, dateNext: start, frequency: "daily", amount: -1_000,
        payeeID: nil, categoryID: nil, transferAccountID: nil, memo: nil, flagColor: nil, subtransactions: []
      )
    )
    let model = AppModel(
      outboxStore: .temporary(),
      settings: settings,
      viewPrefs: ViewPrefs(),
      snapshotStore: SnapshotStore(directory: directory.appending(path: "snapshots", directoryHint: .isDirectory)),
      hasSavedSettings: true
    )

    await model.runLocalScheduledTransactions(refreshAfter: false)

    let page = try await client.fetchTransactions(planID: settings.planID)
    XCTAssertEqual(page.transactions.count, 30, "every day from \(start) through today")
  }

  /// Lost preferences with the ledger still on disk: starting again adopts
  /// that plan rather than creating an empty one beside it.
  func testLostPlanIDAdoptsThePlanAlreadyOnTheDevice() async throws {
    let first = APISettings.local(in: defaults)
    try await LocalEngine.shared.prepare(config: first.localEngineConfig)
    defaults.removeObject(forKey: APISettings.localPlanIDKey)

    let live = try await LocalEngine.shared.livePlanIDs()
    let recovered = APISettings.local(in: defaults, livePlanIDs: live)

    XCTAssertEqual(live, [first.planID])
    XCTAssertEqual(recovered.planID, first.planID)
  }

  func testNoDatabaseMeansNoLivePlans() async throws {
    let engine = LocalEngine(databaseURL: directory.appending(path: "absent.sqlite"))
    let live = try await engine.livePlanIDs()
    XCTAssertEqual(live, [])
    XCTAssertFalse(FileManager.default.fileExists(atPath: directory.appending(path: "absent.sqlite").path))
  }

  /// Opt-in visual check of the local-mode screens, driven through the real
  /// `AppModel` and engine. Set `TEST_RUNNER_HOWMUCH_LOCAL_SCREENSHOT_DIR` to
  /// a host directory to write PNGs there.
  @MainActor
  func testLocalModeScreensRender() async throws {
    guard let outputPath = ProcessInfo.processInfo.environment["HOWMUCH_LOCAL_SCREENSHOT_DIR"] else {
      throw XCTSkip("Set HOWMUCH_LOCAL_SCREENSHOT_DIR to write local-mode screenshots.")
    }
    let output = URL(fileURLWithPath: outputPath, isDirectory: true)
    let size = CGSize(width: 402, height: 874)
    let settings = APISettings.local(in: defaults)
    let client = APIClient(settings: settings)
    try await LocalEngine.shared.prepare(config: settings.localEngineConfig)
    try await StarterCategories.seedIfNeeded(client: client, planID: settings.planID, defaults: defaults)
    let model = AppModel(
      outboxStore: .temporary(),
      settings: settings,
      viewPrefs: ViewPrefs(),
      snapshotStore: SnapshotStore(directory: directory.appending(path: "snapshots", directoryHint: .isDirectory)),
      hasSavedSettings: false
    )

    func write(_ view: some View, named name: String, waitingFor text: [String]) async throws {
      let surface = try XCTUnwrap(SnapshotSurface(root: view.environment(model).environment(RootChromeState()), size: size))
      defer { surface.detach() }
      let capture = await surface.captureUntilOCR(contains: text, timeoutNanoseconds: 3_000_000_000)
      try XCTUnwrap(capture.image.pngData()).write(to: output.appending(path: "\(name).png"))
    }

    try await write(WelcomeView(), named: "local-1-welcome", waitingFor: ["Start on this"])

    let account = try await client.createAccount(planID: settings.planID, name: "Everyday", type: "checking", balance: 250_000, icon: nil, onBudget: true)
    let groceries = try await client.fetchCategories(planID: settings.planID)
      .flatMap(\.categories).first { $0.name == "Groceries" }
    _ = try await client.createTransaction(
      planID: settings.planID,
      request: TransactionWriteRequest(
        accountID: account.id, date: Date.now.isoDateString, amount: -42_500, payeeID: nil,
        payeeName: "FairPrice", categoryID: groceries?.id, memo: nil, cleared: .cleared,
        approved: true, flagColor: nil, subtransactions: []
      )
    )
    let started = Date.now
    await model.refreshAll()
    XCTAssertLessThan(Date.now.timeIntervalSince(started), 2, "A local refresh must not wait on a network")
    XCTAssertEqual(model.accounts.first?.balance, 207_500)

    try await write(NavigationStack { AccountsView(usesSplit: false) }, named: "local-2-accounts", waitingFor: ["Everyday"])
    try await write(NavigationStack { RegisterView(scope: .account(account.id)) }, named: "local-3-register", waitingFor: ["FairPrice"])
    try await write(SettingsView(settings: settings) { _ in }, named: "local-4-settings", waitingFor: ["Connect to a server"])
  }
}
