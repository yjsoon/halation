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
      return cycle.statementBalance > 0 ? cycle.statementBalance : nil
    case .minimum:
      return cycle.minimumDue > 0 ? cycle.minimumDue : nil
    case .fixed:
      return fixedAmount
    }
  }

  /// The last safe day, or today once that has passed.
  func suggestedPayDate(today: String) -> String {
    max(today, cycle.lastSafePayDate)
  }
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
  /// notification action never blocks on the network.
  func scheduleCardPayment(
    accountID: String,
    statementDate: String,
    amount: Int,
    fundingAccountID: String,
    payDate: String,
    showsMessage: Bool = true
  ) async throws {
    guard amount > 0 else {
      throw APIClientError.validation("Enter an amount to pay.")
    }
    guard fundingAccountID != accountID else {
      throw APIClientError.validation("Choose another account to pay from.")
    }
    let key = CardPaymentFormat.idempotencyKey(accountID: accountID, statementDate: statementDate)
    let memo = "Card payment, statement \(CardPaymentFormat.day(statementDate))"
    let fundingName = account(withID: fundingAccountID)?.name ?? "your account"
    let message = CardPaymentNotifier.scheduledConfirmation(
      amount: MoneyCodec.displayString(for: amount, currencyFormat: currencyFormat),
      fundingName: fundingName,
      payDate: payDate
    )
    if settings.isLocal {
      let saved = try await apiClient.createScheduledTransaction(
        planID: settings.planID,
        idempotencyKey: key,
        request: Self.cardScheduleRequest(
          cardID: accountID, fundingAccountID: fundingAccountID, payDate: payDate, amount: amount, memo: memo
        )
      )
      adoptCardSchedule(saved)
      projectCardCoverage(
        accountID: accountID,
        statementDate: statementDate,
        coverage: .scheduled(scheduledTransactionID: saved.id, payDate: payDate, amount: amount, fundingAccountID: fundingAccountID)
      )
      if showsMessage {
        showSaveMessage(message)
      }
      await CardPaymentNotifier.shared.rebuild(model: self)
      requestCardPaymentsRefresh()
      return
    }
    CardScheduleQueue.add(
      QueuedCardSchedule(
        id: key,
        fingerprint: settings.connectionFingerprint,
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
    if showsMessage {
      showSaveMessage(message)
    }
    await CardPaymentNotifier.shared.rebuild(model: self)
    Task { @MainActor [weak self] in
      await self?.drainCardPaymentQueue()
    }
  }

  static func cardScheduleRequest(
    cardID: String,
    fundingAccountID: String,
    payDate: String,
    amount: Int,
    memo: String
  ) -> ScheduledTransactionWriteRequest {
    ScheduledTransactionWriteRequest(
      accountID: fundingAccountID,
      dateFirst: payDate,
      dateNext: payDate,
      frequency: ScheduleFrequency.never.rawValue,
      amount: -amount,
      payeeID: nil,
      categoryID: nil,
      transferAccountID: cardID,
      memo: memo,
      flagColor: nil,
      subtransactions: []
    )
  }

  /// Sends queued Scheduled taps for this connection. Offline leaves them
  /// queued; a conflict means the schedule already exists (the same key from
  /// another tap) and counts as done; any other refusal drops it and says so.
  func drainCardPaymentQueue() async {
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
    var changed = false
    queueLoop: for item in items {
      guard fingerprint == settings.connectionFingerprint else {
        break queueLoop
      }
      do {
        let saved = try await apiClient.createScheduledTransaction(
          planID: settings.planID,
          idempotencyKey: item.id,
          request: Self.cardScheduleRequest(
            cardID: item.accountID,
            fundingAccountID: item.fundingAccountID,
            payDate: item.payDate,
            amount: item.amount,
            memo: item.memo
          )
        )
        CardScheduleQueue.remove(id: item.id, fingerprint: fingerprint)
        adoptCardSchedule(saved)
        projectCardCoverage(
          accountID: item.accountID,
          statementDate: item.statementDate,
          coverage: .scheduled(
            scheduledTransactionID: saved.id, payDate: item.payDate, amount: item.amount, fundingAccountID: item.fundingAccountID
          )
        )
        changed = true
      } catch APIClientError.conflict(_) {
        CardScheduleQueue.remove(id: item.id, fingerprint: fingerprint)
        changed = true
      } catch let error as APIClientError {
        if case .authenticationExpired = error {
          break queueLoop
        }
        if case .httpStatus(let code) = error, code >= 500 || code == 408 || code == 429 {
          continue queueLoop
        }
        CardScheduleQueue.remove(id: item.id, fingerprint: fingerprint)
        let name = account(withID: item.accountID)?.name ?? "this card"
        showSaveMessage("Couldn’t schedule \(name): \(error.localizedDescription)", kind: .failure)
        changed = true
      } catch {
        // Offline or unreachable: keep it for the next drain.
        break queueLoop
      }
    }
    if changed {
      await refreshScheduledTransactions(quiet: true)
      await refreshCardPayments()
    }
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
    draft.memo = "Card payment, statement \(CardPaymentFormat.day(statementDate))"
    try commit(draft)
    projectCardCoverage(
      accountID: accountID,
      statementDate: statementDate,
      coverage: .paid(transactionID: draft.importID ?? "", amount: amount, date: Date.now.isoDateString)
    )
  }

  /// Writes the card's usual choices back to its terms, so the next cycle
  /// completes from the notification.
  func rememberCardPaymentDefaults(
    accountID: String,
    fundingAccountID: String,
    rule: CardAmountRule,
    fixedAmount: Int?,
    payDaysBeforeDue: Int?
  ) async throws {
    guard var terms = cardPayments.terms(for: accountID) else {
      return
    }
    terms.defaultFundingAccountID = fundingAccountID
    terms.defaultAmountRule = rule
    terms.defaultAmountMilli = rule == .fixed ? fixedAmount : nil
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
