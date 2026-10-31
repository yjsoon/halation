import Foundation

/// What an action needs to pay one cycle: the cycle and the card's saved
/// choices, from the fetched view or, after a cold background launch, from
/// the notification itself.
struct CardPaymentContext {
  let cycle: CardPaymentCycle
  let fundingAccountID: String?
  let amountRule: CardAmountRule
  let fixedAmount: Int?

  var defaultAmount: Int? {
    switch amountRule {
    case .statement:
      // What is still owed, as the web works it out: a carried statement
      // counts, and anything already paid in the window comes off.
      let owed = cycle.outstanding
      return owed > 0 ? owed : nil
    case .minimum:
      let minimum = cycle.minimumOutstanding
      return minimum > 0 ? minimum : nil
    case .fixed:
      return fixedAmount
    }
  }

  /// The server's suggested day (the last safe day, or today once that has
  /// passed), kept inside the cycle's payment window.
  func suggestedPayDate(today: String) -> String {
    CardPaymentFormat.clamp(max(today, cycle.defaultPayDate), cycle: cycle, today: today)
  }
}

/// Why a card payment schedule could not be created. A passing failure keeps
/// a queued tap for the next drain; a refusal drops it and says so.
enum CardScheduleSendError: LocalizedError {
  case transient(String)
  case refused(String)

  var errorDescription: String? {
    switch self {
    case .transient(let message), .refused(let message): message
    }
  }
}

/// What the background actions found when they checked the cycle first.
/// `due` carries the cycle to act on, which may be the current cycle when
/// the tapped statement was carried into it.
enum CardCycleCheck {
  case due(CardPaymentCycle?)
  case covered
  case gone
}

/// The outcome of one Scheduled tap.
enum CardDrainResult: Equatable {
  /// The server has the schedule.
  case scheduled(String)
  /// Already paid or scheduled elsewhere: nothing sent.
  case covered
  /// The statement is no longer due: nothing sent.
  case gone
  /// The server refused it.
  case refused(String)
  /// Still queued on this phone: offline, a passing failure, or not reached.
  case pending
}

/// The body of a card payment schedule, identical to what the web sends,
/// nulls included, so the same tap on either replays the same key.
struct CardScheduleWriteBody: Encodable, Equatable {
  let accountID: String
  let dateFirst: String
  let dateNext: String
  let frequency: String
  let amount: Int
  let transferAccountID: String
  let memo: String

  private enum CodingKeys: String, CodingKey {
    case accountID = "accountId"
    case dateFirst
    case dateNext
    case frequency
    case amount
    case payeeID = "payeeId"
    case categoryID = "categoryId"
    case transferAccountID = "transferAccountId"
    case memo
    case flagColor
    case subtransactions
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(accountID, forKey: .accountID)
    try container.encode(dateFirst, forKey: .dateFirst)
    try container.encode(dateNext, forKey: .dateNext)
    try container.encode(frequency, forKey: .frequency)
    try container.encode(amount, forKey: .amount)
    try container.encodeNil(forKey: .payeeID)
    try container.encodeNil(forKey: .categoryID)
    try container.encode(transferAccountID, forKey: .transferAccountID)
    try container.encode(memo, forKey: .memo)
    try container.encodeNil(forKey: .flagColor)
    try container.encode([String](), forKey: .subtransactions)
  }
}

struct CardScheduleWriteEnvelope: Encodable {
  let scheduledTransaction: CardScheduleWriteBody
}

extension AppModel {
  var hasCreditAccounts: Bool {
    openAccounts.contains { AccountKind(rawValue: $0.type)?.isCredit == true }
  }

  var hasCardPaymentTerms: Bool {
    !cardPayments.terms.isEmpty
  }

  /// Credit accounts that can carry terms.
  var creditAccounts: [Account] {
    openAccounts.filter { AccountKind(rawValue: $0.type)?.isCredit == true }
  }

  /// The fetched view with this phone's queued Scheduled taps laid over it.
  var effectiveCardPayments: CardPaymentsView {
    let fingerprint = settings.connectionFingerprint
    let queued = CardScheduleQueue.load().filter { $0.fingerprint == fingerprint }
    guard !queued.isEmpty else {
      return cardPayments
    }
    var view = cardPayments
    view.cycles = view.cycles.map { cycle in
      guard !cycle.coverage.isCovered,
            let item = queued.first(where: { $0.accountID == cycle.accountID && $0.statementDate == cycle.statementDate })
      else {
        return cycle
      }
      return cycle.with(coverage: .sending(payDate: item.payDate, amount: item.amount, fundingAccountID: item.fundingAccountID))
    }
    return view
  }

  /// A cold launch for a background action or refresh has no fetched view;
  /// the last one for this connection stands in until the fetch lands.
  func restoreCardPaymentsIfNeeded() {
    guard cardPayments.terms.isEmpty,
          let cached = CardPaymentsCache.load(fingerprint: settings.connectionFingerprint) else {
      return
    }
    cardPayments = cached
  }

  /// The memo the web writes too: "Card A statement 3 Oct".
  func cardPaymentMemo(accountID: String, statementDate: String) -> String {
    "\(account(withID: accountID)?.name ?? "Card") statement \(CardPaymentFormat.memoDay(statementDate))"
  }

  /// A background action checks the cycle before it writes: a short refresh
  /// (whatever lands within `timeout`), then the freshest view there is. A
  /// cycle another device or the web already covered, or that has left the
  /// view, is left alone.
  func checkCardCycleBeforeAction(
    accountID: String,
    statementDate: String,
    timeout: Duration = .seconds(5)
  ) async -> CardCycleCheck {
    restoreCardPaymentsIfNeeded()
    await refreshCardPaymentsBriefly(timeout: timeout)
    let view = effectiveCardPayments
    // A statement carried into the current cycle is paid there.
    if let cycle = view.payableCycle(accountID: accountID, statementDate: statementDate) {
      return cycle.coverage.isCovered ? .covered : .due(cycle)
    }
    // Only a view that knows this card can say the statement has gone.
    if !view.asOf.isEmpty, view.terms(for: accountID) != nil {
      return .gone
    }
    return .due(nil)
  }

  /// `refreshCardPayments()`, waited on for at most `timeout`. The fetch
  /// carries on past the deadline and lands when it lands.
  func refreshCardPaymentsBriefly(timeout: Duration) async {
    _ = await finishesBefore(ContinuousClock.now + timeout) { [weak self] in
      await self?.refreshCardPayments()
    }
  }

  /// Runs `operation` and waits for it until `deadline` at most. Returns
  /// whether it finished in time; when it did not, it keeps running.
  func finishesBefore(
    _ deadline: ContinuousClock.Instant,
    _ operation: @escaping @MainActor () async -> Void
  ) async -> Bool {
    let gate = CardRaceGate()
    return await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
      Task { @MainActor in
        await operation()
        if gate.claim() { continuation.resume(returning: true) }
      }
      Task { @MainActor in
        try? await Task.sleep(until: deadline, clock: .continuous)
        if gate.claim() { continuation.resume(returning: false) }
      }
    }
  }

  func cardPaymentContext(accountID: String, statementDate: String, info: [String: String] = [:]) -> CardPaymentContext? {
    let view = effectiveCardPayments
    let terms = view.terms(for: accountID)
    let cycle = view.cycle(accountID: accountID, statementDate: statementDate) ?? Self.cycle(from: info)
    guard let cycle else {
      return nil
    }
    if let terms {
      return CardPaymentContext(
        cycle: cycle,
        fundingAccountID: terms.defaultFundingAccountID,
        amountRule: terms.defaultAmountRule,
        fixedAmount: terms.defaultAmountMilli
      )
    }
    return CardPaymentContext(
      cycle: cycle,
      fundingAccountID: info["fundingAccountId"],
      amountRule: info["amountRule"].flatMap(CardAmountRule.init(rawValue:)) ?? .statement,
      fixedAmount: info["fixedAmount"].flatMap { Int($0) }
    )
  }

  private static func cycle(from info: [String: String]) -> CardPaymentCycle? {
    guard let accountID = info["accountId"],
          let statementDate = info["statementDate"],
          let dueDate = info["dueDate"],
          let lastSafe = info["lastSafePayDate"],
          let balance = info["statementBalance"].flatMap({ Int($0) }) else {
      return nil
    }
    return CardPaymentCycle(
      accountID: accountID,
      cycle: "current",
      statementDate: statementDate,
      dueDate: dueDate,
      lastSafePayDate: lastSafe,
      defaultPayDate: lastSafe,
      statementBalance: balance,
      minimumDue: info["minimumDue"].flatMap { Int($0) } ?? 0,
      currentBalance: info["currentBalance"].flatMap { Int($0) } ?? balance,
      coverage: .unscheduled
    )
  }

  // MARK: Reads

  /// Terms and cycles together, then a re-plan of the reminders.
  func refreshCardPayments() async {
    guard settings.isAuthenticated, !settings.planID.isEmpty else {
      return
    }
    cardPaymentsGeneration &+= 1
    let generation = cardPaymentsGeneration
    let planID = settings.planID
    let fingerprint = settings.connectionFingerprint
    let client = apiClient
    if cardPaymentsPhase != .loaded {
      cardPaymentsPhase = .loading
    }
    do {
      async let termsRequest = client.fetchCardPaymentTerms(planID: planID)
      async let viewRequest = client.fetchCardPayments(planID: planID)
      let (terms, payload) = try await (termsRequest, viewRequest)
      guard generation == cardPaymentsGeneration, planID == settings.planID,
            fingerprint == settings.connectionFingerprint else {
        return
      }
      let view = CardPaymentsView(asOf: payload.asOf, cycles: payload.cycles, terms: terms)
      cardPayments = view
      cardPaymentsPhase = .loaded
      CardPaymentsCache.save(view, fingerprint: fingerprint)
    } catch {
      guard generation == cardPaymentsGeneration else {
        return
      }
      cardPaymentsPhase = .failed(error.localizedDescription)
    }
    await CardPaymentNotifier.shared.rebuild(model: self)
  }

  /// The launch read: only a plan with a credit account (or terms from an
  /// earlier launch) asks for card payments at all.
  func refreshCardPaymentsAtLaunch() async {
    restoreCardPaymentsIfNeeded()
    if hasCreditAccounts || hasCardPaymentTerms {
      await drainCardPaymentQueue()
      await refreshCardPayments()
    } else if CardPaymentNotifier.shared.needsRebuild(for: settings.connectionFingerprint) {
      // A plan or server with no cards still clears what the last
      // connection left behind: its reminders, delivered notices and count.
      await CardPaymentNotifier.shared.rebuild(model: self)
    }
  }

  /// Foreground: send queued Scheduled taps and re-plan, so today's
  /// reminders and the badge match the day that has just started.
  func cardPaymentsSceneDidBecomeActive() async {
    guard settings.isAuthenticated else {
      return
    }
    await CardPaymentNotifier.shared.refreshAuthorisation()
    guard hasCardPaymentTerms else {
      return
    }
    await drainCardPaymentQueue()
    requestCardPaymentsRefresh()
  }

  /// A read that can move a balance or a schedule just landed. Only a plan
  /// with terms pays for the extra requests.
  func noteCardPaymentInputsChanged() {
    guard hasCardPaymentTerms else {
      return
    }
    requestCardPaymentsRefresh()
  }

  /// Coalesces back-to-back requests into one fetch.
  func requestCardPaymentsRefresh() {
    cardPaymentsRefreshToken &+= 1
    let token = cardPaymentsRefreshToken
    Task { @MainActor [weak self] in
      try? await Task.sleep(for: .milliseconds(300))
      guard let self, token == self.cardPaymentsRefreshToken else {
        return
      }
      await self.refreshCardPayments()
    }
  }

  // MARK: Terms

  func saveCardPaymentTerms(_ terms: CardPaymentTerms) async throws {
    let saved = try await apiClient.putCardPaymentTerms(
      planID: settings.planID,
      terms: terms,
      idempotencyKey: "ios-card-terms-\(UUID().uuidString.lowercased())"
    )
    var view = cardPayments
    view.terms.removeAll { $0.accountID == saved.accountID }
    view.terms.append(saved)
    cardPayments = view
    if saved.enabled {
      await CardPaymentNotifier.shared.requestAuthorisation()
    }
    await refreshCardPayments()
  }

  func deleteCardPaymentTerms(accountID: String) async throws {
    try await apiClient.deleteCardPaymentTerms(
      planID: settings.planID,
      accountID: accountID,
      idempotencyKey: "ios-card-terms-\(UUID().uuidString.lowercased())"
    )
    var view = cardPayments
    view.terms.removeAll { $0.accountID == accountID }
    view.cycles.removeAll { $0.accountID == accountID }
    cardPayments = view
    CardPaymentsCache.save(view, fingerprint: settings.connectionFingerprint)
    await refreshCardPayments()
  }

  // MARK: Scheduled and Paid

  /// Creates the one-off scheduled transfer from the paying account to the
  /// card on the pay day. Local mode writes to the on-device engine at once;
  /// server mode queues it on the phone and sends it without waiting, so a
  /// notification action never blocks on the network. With `sendsNow`
  /// (a background Scheduled) server mode sends it before returning, so the
  /// result says whether the server has it.
  @discardableResult
  func scheduleCardPayment(
    accountID: String,
    statementDate: String,
    amount: Int,
    fundingAccountID: String,
    payDate: String,
    showsMessage: Bool = true,
    sendsNow: Bool = false,
    deadline: ContinuousClock.Instant? = nil
  ) async throws -> CardDrainResult {
    guard amount > 0 else {
      throw APIClientError.validation("Enter an amount to pay.")
    }
    guard fundingAccountID != accountID else {
      throw APIClientError.validation("Choose another account to pay from.")
    }
    let key = CardPaymentFormat.idempotencyKey(accountID: accountID, statementDate: statementDate)
    let memo = cardPaymentMemo(accountID: accountID, statementDate: statementDate)
    let fundingName = account(withID: fundingAccountID)?.name ?? "your account"
    let message = CardPaymentNotifier.scheduledConfirmation(
      amount: MoneyCodec.displayString(for: amount, currencyFormat: currencyFormat),
      fundingName: fundingName,
      payDate: payDate
    )
    if settings.isLocal {
      let saved = try await createCardSchedule(
        accountID: accountID,
        statementDate: statementDate,
        body: Self.cardScheduleBody(
          cardID: accountID, fundingAccountID: fundingAccountID, payDate: payDate, amount: amount, memo: memo
        )
      )
      if let saved {
        adoptCardSchedule(saved)
        projectCardCoverage(
          accountID: accountID,
          statementDate: statementDate,
          coverage: .scheduled(scheduledTransactionID: saved.id, payDate: payDate, amount: amount, fundingAccountID: fundingAccountID)
        )
      }
      if showsMessage {
        showSaveMessage(message)
      }
      await CardPaymentNotifier.shared.rebuild(model: self)
      requestCardPaymentsRefresh()
      return saved.map { .scheduled($0.id) } ?? .covered
    }
    let fingerprint = settings.connectionFingerprint
    CardScheduleQueue.add(
      QueuedCardSchedule(
        id: key,
        fingerprint: fingerprint,
        accountID: accountID,
        statementDate: statementDate,
        fundingAccountID: fundingAccountID,
        payDate: payDate,
        amount: amount,
        memo: memo,
        createdAt: .now,
        warned: false
      )
    )
    cardDrainResults[key] = nil
    if showsMessage {
      showSaveMessage(message)
    }
    guard sendsNow else {
      await CardPaymentNotifier.shared.rebuild(model: self)
      Task { @MainActor [weak self] in
        await self?.drainCardPaymentQueue()
      }
      return .pending
    }
    // A drain already running loaded the queue before this tap: wait for it,
    // then drain again so this tap is sent now and its result is known.
    let limit = deadline ?? ContinuousClock.now + .seconds(20)
    while isDrainingCardQueue, ContinuousClock.now < limit {
      try? await Task.sleep(for: .milliseconds(100))
    }
    // The drain's requests can hang far longer than iOS waits; race it
    // against the deadline. A lost race leaves the tap queued (the drain
    // carries on) and reports it as pending.
    if ContinuousClock.now < limit {
      let finished = await finishesBefore(limit) { [weak self] in
        await self?.drainCardPaymentQueue(refreshAfter: false)
      }
      if !finished {
        return .pending
      }
    }
    if let result = cardDrainResults[key] {
      return result
    }
    let stillQueued = CardScheduleQueue.load().contains { $0.id == key && $0.fingerprint == fingerprint }
    return stillQueued ? .pending : .covered
  }

  /// Creates the schedule under the shared key. A replay of a schedule that
  /// was since deleted, or a 409 because the key was used for a different
  /// payment, retries with a fresh key, but only while the statement is
  /// still unpaid. Returns nil when it turned out to be covered already.
  /// Throws `CardScheduleSendError` for a server answer, `APIClientError`
  /// when the session expired, and the transport's error when offline.
  private func createCardSchedule(
    accountID: String,
    statementDate: String,
    body: CardScheduleWriteBody
  ) async throws -> ScheduledTransaction? {
    let planID = settings.planID
    let client = apiClient
    func send(_ key: String) async throws -> ScheduledTransaction? {
      let reply = try await client.cardScheduleCreate(planID: planID, idempotencyKey: key, body: body)
      switch reply.status {
      case 200 ..< 300:
        guard let saved = client.outboxScheduledTransaction(in: reply) else {
          // The same key replays it next time.
          throw CardScheduleSendError.transient("The server's reply could not be read.")
        }
        return saved
      case 401:
        throw APIClientError.authenticationExpired
      case 409:
        return nil
      case 408, 429, 500...:
        throw CardScheduleSendError.transient(reply.message)
      default:
        throw CardScheduleSendError.refused(reply.message)
      }
    }
    if let created = try await send(CardPaymentFormat.idempotencyKey(accountID: accountID, statementDate: statementDate)),
       !created.deleted {
      return created
    }
    let fresh: CardPaymentsPayload
    do {
      fresh = try await client.fetchCardPayments(planID: planID)
    } catch APIClientError.authenticationExpired {
      throw APIClientError.authenticationExpired
    } catch let error as APIClientError {
      throw CardScheduleSendError.transient(error.localizedDescription)
    }
    guard let cycle = fresh.cycles.first(where: { $0.accountID == accountID && $0.statementDate == statementDate }) else {
      throw CardScheduleSendError.refused("This statement is no longer due.")
    }
    if cycle.coverage.isCovered {
      return nil
    }
    let suffix = String(UUID().uuidString.lowercased().prefix(8))
    let retried = try await send(
      CardPaymentFormat.idempotencyKey(accountID: accountID, statementDate: statementDate, suffix: suffix)
    )
    guard let retried, !retried.deleted else {
      throw CardScheduleSendError.refused("The server would not take this schedule.")
    }
    return retried
  }

  static func cardScheduleBody(
    cardID: String,
    fundingAccountID: String,
    payDate: String,
    amount: Int,
    memo: String
  ) -> CardScheduleWriteBody {
    CardScheduleWriteBody(
      accountID: fundingAccountID,
      dateFirst: payDate,
      dateNext: payDate,
      frequency: ScheduleFrequency.never.rawValue,
      amount: -amount,
      transferAccountID: cardID,
      memo: memo
    )
  }

  /// Sends queued Scheduled taps for this connection and records each tap's
  /// outcome in `cardDrainResults`. It first reads a fresh view: a tap for a
  /// statement already covered, or no longer due, is dropped with a message;
  /// a tap for a statement carried into the current cycle is sent for that
  /// cycle, with a pay day inside its window. Offline, a 5xx, 408 or 429
  /// leave the tap queued; a conflict means the schedule already exists and
  /// counts as done; any other refusal drops it and says so.
  func drainCardPaymentQueue(refreshAfter: Bool = true) async {
    guard settings.isAuthenticated, !settings.isLocal, !isDrainingCardQueue else {
      return
    }
    let fingerprint = settings.connectionFingerprint
    let items = CardScheduleQueue.load().filter { $0.fingerprint == fingerprint }
    guard !items.isEmpty else {
      return
    }
    isDrainingCardQueue = true
    defer { isDrainingCardQueue = false }
    let fresh: CardPaymentsPayload
    do {
      fresh = try await apiClient.fetchCardPayments(planID: settings.planID)
    } catch {
      // Offline, signed out or a passing failure: keep every tap for later.
      return
    }
    let view = CardPaymentsView(asOf: fresh.asOf, cycles: fresh.cycles, terms: cardPayments.terms)
    let today = Date.now.isoDateString
    var changed = false
    queueLoop: for item in items {
      guard fingerprint == settings.connectionFingerprint else {
        break queueLoop
      }
      let name = account(withID: item.accountID)?.name ?? "this card"
      guard let cycle = view.payableCycle(accountID: item.accountID, statementDate: item.statementDate) else {
        CardScheduleQueue.remove(id: item.id, fingerprint: fingerprint)
        cardDrainResults[item.id] = .gone
        showSaveMessage("Didn’t schedule \(name): that statement is no longer due.")
        changed = true
        continue queueLoop
      }
      if cycle.coverage.isCovered {
        CardScheduleQueue.remove(id: item.id, fingerprint: fingerprint)
        cardDrainResults[item.id] = .covered
        showSaveMessage("Didn’t schedule \(name) again: it is already paid or scheduled.")
        changed = true
        continue queueLoop
      }
      let carried = cycle.statementDate != item.statementDate
      let payDate = carried ? CardPaymentFormat.clamp(item.payDate, cycle: cycle, today: today) : item.payDate
      let memo = carried ? cardPaymentMemo(accountID: item.accountID, statementDate: cycle.statementDate) : item.memo
      do {
        let saved = try await createCardSchedule(
          accountID: item.accountID,
          statementDate: cycle.statementDate,
          body: Self.cardScheduleBody(
            cardID: item.accountID,
            fundingAccountID: item.fundingAccountID,
            payDate: payDate,
            amount: item.amount,
            memo: memo
          )
        )
        CardScheduleQueue.remove(id: item.id, fingerprint: fingerprint)
        if let saved {
          cardDrainResults[item.id] = .scheduled(saved.id)
          adoptCardSchedule(saved)
          projectCardCoverage(
            accountID: item.accountID,
            statementDate: cycle.statementDate,
            coverage: .scheduled(
              scheduledTransactionID: saved.id, payDate: payDate, amount: item.amount, fundingAccountID: item.fundingAccountID
            )
          )
        } else {
          cardDrainResults[item.id] = .covered
        }
        changed = true
      } catch CardScheduleSendError.transient(_) {
        cardDrainResults[item.id] = .pending
        continue queueLoop
      } catch CardScheduleSendError.refused(let message) {
        CardScheduleQueue.remove(id: item.id, fingerprint: fingerprint)
        cardDrainResults[item.id] = .refused(message)
        showSaveMessage("Couldn’t schedule \(name): \(message)", kind: .failure)
        changed = true
      } catch {
        // Signed out, offline or unreachable: keep it for the next drain.
        cardDrainResults[item.id] = .pending
        break queueLoop
      }
    }
    if changed, refreshAfter {
      await refreshAfterCardScheduling()
    }
  }

  /// Schedules and card payments re-read after a drain changed something.
  func refreshAfterCardScheduling() async {
    await refreshScheduledTransactions(quiet: true)
    await refreshCardPayments()
  }

  /// Records a transfer dated today from the paying account to the card,
  /// through the outbox like any other new transaction.
  func recordCardPaymentPaid(
    accountID: String,
    statementDate: String,
    amount: Int,
    fundingAccountID: String
  ) throws {
    guard let payee = payees.first(where: { $0.transferAccountId == accountID && $0.deleted != true }) else {
      throw APIClientError.validation("Couldn’t find the card’s transfer payee. Refresh and try again.")
    }
    var draft = TransactionDraft()
    draft.accountID = fundingAccountID
    draft.direction = .outflow
    draft.amountMagnitudeMilli = amount
    draft.payeeID = payee.id
    draft.payeeName = payee.name
    draft.transferAccountID = accountID
    draft.date = .now
    draft.memo = cardPaymentMemo(accountID: accountID, statementDate: statementDate)
    try commit(draft)
    projectCardCoverage(
      accountID: accountID,
      statementDate: statementDate,
      coverage: .paid(transactionID: draft.importID ?? "", amount: amount, date: Date.now.isoDateString)
    )
  }

  /// Writes the card's usual choices back to its terms, so the next cycle
  /// completes from the notification. A nil `rule` (a one-off Other amount)
  /// keeps the amount rule as it is. The terms are read again first, so an
  /// edit made on the web since the last fetch is not reverted.
  func rememberCardPaymentDefaults(
    accountID: String,
    fundingAccountID: String,
    rule: CardAmountRule?,
    payDaysBeforeDue: Int?
  ) async throws {
    let latest = try await apiClient.fetchCardPaymentTerms(planID: settings.planID)
    guard var terms = latest.first(where: { $0.accountID == accountID }) else {
      // Removed on another device or the web: do not bring them back.
      throw APIClientError.validation("Payment reminders for this card were removed elsewhere, so these choices were not saved.")
    }
    terms.defaultFundingAccountID = fundingAccountID
    if let rule, rule != .fixed {
      terms.defaultAmountRule = rule
      terms.defaultAmountMilli = nil
    }
    if let payDaysBeforeDue {
      terms.payDaysBeforeDue = min(max(payDaysBeforeDue, 0), 10)
    }
    try await saveCardPaymentTerms(terms)
  }

  private func adoptCardSchedule(_ saved: ScheduledTransaction) {
    scheduledTransactions.removeAll { $0.id == saved.id }
    if !saved.deleted {
      scheduledTransactions.append(saved)
      scheduledTransactions.sort { ($0.dateNext, $0.id) < ($1.dateNext, $1.id) }
    }
  }

  /// Shows an action's effect before the next fetch confirms it.
  func projectCardCoverage(accountID: String, statementDate: String, coverage: CardPaymentCoverage) {
    var view = cardPayments
    view.cycles = view.cycles.map { cycle in
      cycle.accountID == accountID && cycle.statementDate == statementDate ? cycle.with(coverage: coverage) : cycle
    }
    cardPayments = view
  }
}

extension CardCycleMaths {
  /// Working days from `payDate` up to `dueDate`: the "pay N working days
  /// before" figure a chosen pay day implies.
  static func workingDays(from payDate: String, to dueDate: String) -> Int {
    guard payDate < dueDate else {
      return 0
    }
    var count = 0
    var day = dueDate
    while day > payDate, count < 31 {
      day = addDays(day, -1)
      if isWorkingDay(day) {
        count += 1
      }
    }
    return count
  }
}

/// Lets the first of two main-actor tasks resume a continuation, once.
@MainActor
final class CardRaceGate {
  private var claimed = false

  func claim() -> Bool {
    guard !claimed else { return false }
    claimed = true
    return true
  }
}
