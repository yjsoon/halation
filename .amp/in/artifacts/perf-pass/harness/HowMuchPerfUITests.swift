import XCTest

/// Benchmark-only UI tests for the perf pass. Installed into a throwaway target
/// by add-perf-target.rb; never part of the shipped project.
///
/// Environment (pass to xcodebuild as TEST_RUNNER_<NAME>):
///   PERF_MODE         local (default) or server
///   PERF_SERVER_URL   server mode: e.g. http://127.0.0.1:8899
///   PERF_USERNAME     server mode username
///   PERF_PASSWORD     server mode password
///   PERF_ITERATIONS   iterations per measured test (default 8)
final class HowMuchPerfUITests: XCTestCase {
  private var app: XCUIApplication!

  private var env: [String: String] { ProcessInfo.processInfo.environment }
  private var mode: String { env["PERF_MODE"] ?? "local" }
  private var iterations: Int { Int(env["PERF_ITERATIONS"] ?? "") ?? 8 }

  override func setUp() {
    continueAfterFailure = false
    app = XCUIApplication()
  }

  private func options(_ count: Int? = nil, manualStop: Bool = false, manualStart: Bool = false) -> XCTMeasureOptions {
    let options = XCTMeasureOptions()
    options.iterationCount = count ?? iterations
    var invocation: XCTMeasureOptions.InvocationOptions = []
    if manualStop {
      invocation.insert(.manuallyStop)
    }
    if manualStart {
      invocation.insert(.manuallyStart)
    }
    options.invocationOptions = invocation
    return options
  }

  // MARK: Handles

  private func button(containing text: String) -> XCUIElement {
    app.buttons.matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
  }

  private var everydayAccount: XCUIElement { button(containing: "Everyday Account") }
  private var quietAccount: XCUIElement { button(containing: "Savings Pot 2") }
  private var allTile: XCUIElement { app.buttons["All"].firstMatch }
  private var firstRegisterRow: XCUIElement {
    app.buttons.matching(
      NSPredicate(format: "label CONTAINS 'Synthetic Payee' OR label BEGINSWITH 'Transfer'")
    ).firstMatch
  }
  private var register: XCUIElement { app.collectionViews.firstMatch }
  private var loadOlder: XCUIElement { button(containing: "Load older transactions") }

  private func tab(_ name: String) -> XCUIElement {
    let tabBarButton = app.tabBars.buttons[name].firstMatch
    return tabBarButton.exists ? tabBarButton : app.buttons[name].firstMatch
  }

  /// After a register scroll the tab bar can stay minimised to the current
  /// tab, hiding the others. Tapping that tab or scrolling up expands it.
  private func expandedTab(_ name: String) -> XCUIElement {
    if !tab(name).exists, tab("Accounts").exists {
      tab("Accounts").tap()
    }
    var tries = 0
    while !tab(name).exists, tries < 3 {
      app.collectionViews.firstMatch.swipeDown(velocity: .slow)
      tries += 1
    }
    return tab(name)
  }

  @discardableResult
  private func waitFor(_ element: XCUIElement, _ what: String, timeout: TimeInterval = 20) -> XCUIElement {
    XCTAssertTrue(element.waitForExistence(timeout: timeout), "timed out waiting for \(what)")
    return element
  }

  private func goBack() {
    let bar = app.navigationBars.firstMatch
    for label in ["Accounts", "Back", "Reflect"] {
      let candidate = bar.buttons[label].firstMatch
      if candidate.exists {
        candidate.tap()
        return
      }
    }
    bar.buttons.element(boundBy: 0).tap()
  }

  private func launchToAccounts() {
    app.launch()
    waitFor(everydayAccount, "Everyday Account on Accounts")
  }

  // MARK: Setup (run once per install, before the measured tests)

  func test00_Setup() throws {
    app.launch()
    let start = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Start on this'")).firstMatch
    let connect = app.buttons["Connect to a server"].firstMatch
    if everydayAccount.waitForExistence(timeout: 8) {
      // Already set up.
    } else if mode == "local" {
      waitFor(start, "Start on this iPhone").tap()
    } else {
      waitFor(connect, "Connect to a server").tap()
      let server = waitFor(app.textFields["https://halation.example.com"].firstMatch, "server field")
      server.tap()
      server.typeText(env["PERF_SERVER_URL"] ?? "http://127.0.0.1:8899")
      let username = app.textFields["Username"].firstMatch
      username.tap()
      username.typeText(env["PERF_USERNAME"] ?? "perf")
      let password = app.secureTextFields["Password"].firstMatch
      password.tap()
      password.typeText(env["PERF_PASSWORD"] ?? "perf-bench-password-15")
      let signIn = app.buttons["Sign in"].firstMatch
      let deadline = Date().addingTimeInterval(20)
      while !signIn.isEnabled, Date() < deadline {
        Thread.sleep(forTimeInterval: 0.25)
      }
      signIn.tap()
      waitFor(app.staticTexts["Selected automatically."].firstMatch, "plan selected", timeout: 30)
      let save = app.buttons["Save"].firstMatch
      let saveDeadline = Date().addingTimeInterval(20)
      while !save.isEnabled, Date() < saveDeadline {
        Thread.sleep(forTimeInterval: 0.25)
      }
      save.tap()
    }
    waitFor(everydayAccount, "Everyday Account after setup", timeout: 60)
    // Let the first refresh finish and write its snapshot, and warm Reflect's
    // cache, so every measured launch below is a warm launch.
    allTile.tap()
    waitFor(firstRegisterRow, "first register row", timeout: 60)
    Thread.sleep(forTimeInterval: 5)
    goBack()
    tab("Reflect").tap()
    waitFor(app.staticTexts["Top Categories"].firstMatch, "Reflect spending card", timeout: 60)
    Thread.sleep(forTimeInterval: 3)
    tab("Accounts").tap()
    waitFor(everydayAccount, "Accounts again")
    app.terminate()
  }

  // MARK: Startup

  func test01_ColdLaunch() throws {
    measure(metrics: [XCTApplicationLaunchMetric(waitUntilResponsive: true)], options: options(10)) {
      app.launch()
    }
  }

  func test02_LaunchToAccountsContent() throws {
    measure(metrics: [XCTClockMetric(), XCTCPUMetric(application: app), XCTMemoryMetric(application: app)], options: options(10)) {
      launchToAccounts()
    }
  }

  // MARK: Screen open

  private func measureOpen(_ entry: @escaping () -> XCUIElement, until content: @escaping () -> XCUIElement, name: String) {
    launchToAccounts()
    // One unmeasured visit, so every measured one is a repeat visit.
    entry().tap()
    waitFor(content(), "\(name) content")
    goBack()
    waitFor(everydayAccount, "Accounts after \(name)")
    measure(metrics: [XCTClockMetric(), XCTCPUMetric(application: app)], options: options(manualStop: true)) {
      entry().tap()
      waitFor(content(), "\(name) content")
      stopMeasuring()
      goBack()
      waitFor(everydayAccount, "Accounts after \(name)")
    }
  }

  func test03_OpenAllRegister() throws {
    measureOpen({ self.allTile }, until: { self.firstRegisterRow }, name: "All register")
  }

  func test04_OpenBusyAccountRegister() throws {
    measureOpen({ self.everydayAccount }, until: { self.firstRegisterRow }, name: "Everyday Account register")
  }

  func test05_OpenQuietAccountRegister() throws {
    measureOpen({ self.quietAccount }, until: { self.firstRegisterRow }, name: "Savings Pot 2 register")
  }

  /// The first open of a register after a cold launch, which also pays for the
  /// launch refresh still in flight.
  func test06_FirstRegisterOpenAfterLaunch() throws {
    measure(metrics: [XCTClockMetric(), XCTCPUMetric(application: app)], options: options(manualStop: true)) {
      launchToAccounts()
      everydayAccount.tap()
      waitFor(firstRegisterRow, "Everyday Account first row")
      stopMeasuring()
    }
  }

  // MARK: Scrolling

  func test07_ScrollAllRegister() throws {
    launchToAccounts()
    allTile.tap()
    waitFor(firstRegisterRow, "All register rows")
    Thread.sleep(forTimeInterval: 3)
    let list = register
    measure(
      metrics: [
        XCTOSSignpostMetric.scrollDecelerationMetric,
        XCTOSSignpostMetric.scrollDraggingMetric,
        XCTCPUMetric(application: app),
      ],
      options: options(manualStop: true)
    ) {
      list.swipeUp(velocity: .fast)
      list.swipeUp(velocity: .fast)
      list.swipeUp(velocity: .fast)
      stopMeasuring()
      list.swipeDown(velocity: .fast)
      list.swipeDown(velocity: .fast)
      list.swipeDown(velocity: .fast)
      list.swipeDown(velocity: .fast)
    }
  }

  // MARK: Older content

  /// From the top of the All register, scroll (tapping Load older whenever it
  /// is on screen) until a row from six months back is visible.
  func test08_ReachSixMonthsBack() throws {
    let target = Self.monthLabel(monthsBack: 6)
    measure(metrics: [XCTClockMetric(), XCTCPUMetric(application: app)], options: options(3, manualStop: true, manualStart: true)) {
      launchToAccounts()
      allTile.tap()
      waitFor(firstRegisterRow, "All register rows")
      startMeasuring()
      walkBack(to: target, maxSteps: 300, scope: "All")
      stopMeasuring()
    }
  }

  /// The same walk in the quiet account's register, where most of each
  /// plan-wide page belongs to other accounts.
  func test08b_QuietAccountReachSixMonthsBack() throws {
    let target = Self.monthLabel(monthsBack: 6)
    measure(metrics: [XCTClockMetric(), XCTCPUMetric(application: app)], options: options(3, manualStop: true, manualStart: true)) {
      launchToAccounts()
      quietAccount.tap()
      waitFor(firstRegisterRow, "Savings Pot 2 rows")
      startMeasuring()
      walkBack(to: target, maxSteps: 300, scope: "Savings Pot 2")
      stopMeasuring()
    }
  }

  /// Flings down the register, tapping Load older whenever it is on screen,
  /// until a date header in `target` ("Apr 2026") shows. Every step counts
  /// towards the cap, and a tap that leaves the list unchanged three times in
  /// a row ends the walk with a failure and a screenshot rather than spinning.
  private func walkBack(to target: String, maxSteps: Int, scope: String) {
    let header = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", target)).firstMatch
    let loading = button(containing: "Loading older transactions")
    var steps = 0
    var idleTaps = 0
    while !header.exists, steps < maxSteps {
      steps += 1
      if loadOlder.exists, loadOlder.isHittable {
        let before = loadOlder.frame
        loadOlder.tap()
        _ = loading.waitForNonExistence(timeout: 30)
        if loadOlder.exists, loadOlder.isHittable, loadOlder.frame == before {
          idleTaps += 1
          if idleTaps >= 3 {
            let shot = XCTAttachment(screenshot: app.screenshot())
            shot.name = "load-older-no-op-\(scope)"
            shot.lifetime = .keepAlways
            add(shot)
            probeStuckLoadOlder(scope: scope)
            XCTFail("Load older did nothing three times in a row in \(scope) (step \(steps))")
            return
          }
        } else {
          idleTaps = 0
        }
      } else {
        register.swipeUp(velocity: .fast)
      }
    }
    XCTAssertTrue(header.exists, "never reached \(target) in \(scope) after \(steps) steps")
  }

  /// When Load older stops responding, records where the button and the bars
  /// around it are, then taps the button by screen coordinate at several
  /// points, so the log shows whether something else is taking the touch.
  private func probeStuckLoadOlder(scope: String) {
    let window = app.windows.firstMatch.frame
    let frame = loadOlder.frame
    var notes = ["window \(window)", "loadOlder \(frame) hittable=\(loadOlder.isHittable)"]
    for bar in [app.tabBars.firstMatch, app.navigationBars.firstMatch, app.toolbars.firstMatch] where bar.exists {
      notes.append("\(bar.elementType.rawValue) \(bar.frame)")
    }
    let origin = app.coordinate(withNormalizedOffset: .zero)
    for (name, x, y) in [("centre", 0.5, 0.5), ("left", 0.15, 0.5), ("right", 0.85, 0.5), ("top", 0.5, 0.15)] {
      let point = CGVector(dx: frame.minX + frame.width * x, dy: frame.minY + frame.height * y)
      origin.withOffset(point).tap()
      Thread.sleep(forTimeInterval: 2)
      let moved = !loadOlder.exists || loadOlder.frame != frame
      notes.append("coordinate tap \(name) at \(point): list changed=\(moved)")
      if moved { break }
    }
    let tree = XCTAttachment(string: notes.joined(separator: "\n") + "\n\n" + app.debugDescription)
    tree.name = "load-older-probe-\(scope)"
    tree.lifetime = .keepAlways
    add(tree)
    print("LOAD-OLDER-PROBE \(scope):\n" + notes.joined(separator: "\n"))
  }

  /// Load older pages: tap, then wait for the next page to settle.
  func test09_LoadOlderPage() throws {
    launchToAccounts()
    allTile.tap()
    waitFor(firstRegisterRow, "All register rows")
    Thread.sleep(forTimeInterval: 3)
    var swipes = 0
    while !(loadOlder.exists && loadOlder.isHittable), swipes < 120 {
      register.swipeUp(velocity: .fast)
      swipes += 1
    }
    let loading = button(containing: "Loading older transactions")
    measure(metrics: [XCTClockMetric(), XCTCPUMetric(application: app), XCTMemoryMetric(application: app)], options: options(5, manualStop: true)) {
      if loadOlder.exists, loadOlder.isHittable {
        loadOlder.tap()
      }
      // The page has landed once the loading label is gone.
      XCTAssertTrue(loading.waitForNonExistence(timeout: 30), "older page never finished loading")
      stopMeasuring()
      var more = 0
      while !(loadOlder.exists && loadOlder.isHittable), more < 60 {
        register.swipeUp(velocity: .fast)
        more += 1
      }
    }
  }

  // MARK: Reflect

  func test10_OpenReflectTab() throws {
    launchToAccounts()
    tab("Reflect").tap()
    waitFor(app.staticTexts["Top Categories"].firstMatch, "Reflect")
    tab("Accounts").tap()
    waitFor(everydayAccount, "Accounts")
    measure(metrics: [XCTClockMetric(), XCTCPUMetric(application: app)], options: options(manualStop: true)) {
      tab("Reflect").tap()
      waitFor(app.staticTexts["Top Categories"].firstMatch, "Reflect")
      stopMeasuring()
      tab("Accounts").tap()
      waitFor(everydayAccount, "Accounts")
    }
  }

  func test11_OpenSpendingBreakdown() throws {
    launchToAccounts()
    tab("Reflect").tap()
    waitFor(app.staticTexts["Top Categories"].firstMatch, "Reflect")
    let card = button(containing: "Spending Breakdown")
    measure(metrics: [XCTClockMetric(), XCTCPUMetric(application: app)], options: options(manualStop: true)) {
      card.tap()
      waitFor(app.navigationBars["Spending Breakdown"].firstMatch, "Spending Breakdown detail")
      stopMeasuring()
      goBack()
      waitFor(app.staticTexts["Top Categories"].firstMatch, "Reflect again")
    }
  }

  // MARK: Profiling tour (no measure block; run under xctrace)

  func testZZ_ProfileTour() throws {
    launchToAccounts()
    Thread.sleep(forTimeInterval: 2)
    allTile.tap()
    waitFor(firstRegisterRow, "All register rows")
    for _ in 0 ..< 6 { register.swipeUp(velocity: .fast) }
    var taps = 0
    var swipes = 0
    while taps < 4, swipes < 120 {
      if loadOlder.exists, loadOlder.isHittable {
        loadOlder.tap()
        taps += 1
        _ = button(containing: "Loading older transactions").waitForNonExistence(timeout: 30)
      } else {
        register.swipeUp(velocity: .fast)
        swipes += 1
      }
    }
    for _ in 0 ..< 4 { register.swipeDown(velocity: .fast) }
    goBack()
    waitFor(everydayAccount, "Accounts")
    everydayAccount.tap()
    waitFor(firstRegisterRow, "Everyday rows")
    for _ in 0 ..< 4 { register.swipeUp(velocity: .fast) }
    goBack()
    waitFor(quietAccount, "Accounts")
    quietAccount.tap()
    waitFor(firstRegisterRow, "quiet rows")
    goBack()
    waitFor(everydayAccount, "Accounts")
    expandedTab("Reflect").tap()
    waitFor(app.staticTexts["Top Categories"].firstMatch, "Reflect")
    button(containing: "Spending Breakdown").tap()
    waitFor(app.navigationBars["Spending Breakdown"].firstMatch, "Spending Breakdown detail")
    goBack()
    tab("Accounts").tap()
    waitFor(everydayAccount, "Accounts")
  }

  // MARK: Helpers

  /// "Apr 2026" for six months before an October 2026 run, matching the
  /// register's "EEE d MMM yyyy" date headers.
  static func monthLabel(monthsBack: Int, now: Date = Date()) -> String {
    let date = Calendar.current.date(byAdding: .month, value: -monthsBack, to: now) ?? now
    let formatter = DateFormatter()
    formatter.dateFormat = "MMM yyyy"
    return formatter.string(from: date)
  }
}
