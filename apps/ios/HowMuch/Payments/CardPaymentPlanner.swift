import Foundation
import UserNotifications

/// One reminder the planner wants pending. Pure data: the notifier turns it
/// into a `UNNotificationRequest` with a non-repeating calendar trigger.
struct PlannedCardNotification: Equatable {
  enum Touchpoint: String, CaseIterable {
    case statement
    case lead
    case lastSafe
    case snoozed
    case due
    case overdue
    case funds
  }

  enum Level: String {
    case passive
    case active
    case timeSensitive
  }

  let identifier: String
  let accountID: String
  let statementDate: String
  let touchpoint: Touchpoint
  /// Year, month, day, hour and minute in the device's calendar.
  let fire: DateComponents
  let fireDate: Date
  let title: String
  let body: String
  let categoryIdentifier: String?
  let level: Level
  let threadIdentifier: String
  let userInfo: [String: String]

  /// Changes whenever anything the person would see or act on changes, so a
  /// rebuild replaces a pending request whose copy or time went stale.
  var signature: String {
    [
      identifier, String(fireDate.timeIntervalSince1970), title, body,
      categoryIdentifier ?? "", level.rawValue,
      userInfo["fundingAccountId"] ?? "", userInfo["amountRule"] ?? "", userInfo["fixedAmount"] ?? "",
    ].joined(separator: "\u{1F}")
  }
}

/// Category identifiers. Whether Scheduled runs in the background is fixed
/// when a category is registered, so each has a `.setup` twin whose Scheduled
/// opens the app, for a card with no saved choices yet. Due and overdue
/// reminders use the urgent pair, which has no Snooze.
enum CardPaymentCategory {
  static let due = "halation.card.due"
  static let dueSetup = "halation.card.due.setup"
  static let urgent = "halation.card.urgent"
  static let urgentSetup = "halation.card.urgent.setup"

  enum Action {
    static let scheduled = "halation.card.scheduled"
    static let scheduledSetup = "halation.card.scheduled.setup"
    static let paid = "halation.card.paid"
    static let snooze = "halation.card.snooze"
    static let open = "halation.card.open"
  }
}

/// The local notification plan for card payments: the current and next cycle
/// of every card with reminders on, sorted by fire date and capped so the
/// Inbox keeps room in the 64 pending requests iOS allows.
enum CardPaymentPlanner {
  static let identifierPrefix = "halation.card."
  static let pendingLimit = 56
  /// Overdue reminders run daily for a week after the due date, at most three
  /// pending at once; a later rebuild adds the next.
  static let overdueDays = 7
  static let overduePending = 3
  static let fundsHour = 18

  struct Input {
    var view: CardPaymentsView
    var accountNames: [String: String]
    /// Accounts that can still pay a card: open, not the card itself.
    var openAccountIDs: Set<String>
    /// Statement cycle key (`accountID.statementDate`) to the ISO date the
    /// person snoozed it until.
    var snoozes: [String: String]
    var fingerprint: String
    var now: Date
    var calendar: Calendar = .current
    var money: (Int) -> String
  }

  struct Plan: Equatable {
    var requests: [PlannedCardNotification]
    /// True when the cap dropped later reminders.
    var truncated: Bool
  }

  static func identifier(accountID: String, statementDate: String, touchpoint: String) -> String {
    "\(identifierPrefix)\(accountID).\(statementDate).\(touchpoint)"
  }

  static func plan(_ input: Input) -> Plan {
    var planned: [PlannedCardNotification] = []
    for cycle in input.view.cycles {
      guard let terms = input.view.terms(for: cycle.accountID), terms.enabled else {
        continue
      }
      planned.append(contentsOf: plan(cycle: cycle, terms: terms, input: input))
    }
    planned.sort { ($0.fireDate, $0.identifier) < ($1.fireDate, $1.identifier) }
    let truncated = planned.count > pendingLimit
    return Plan(requests: Array(planned.prefix(pendingLimit)), truncated: truncated)
  }

  private static func plan(
    cycle: CardPaymentCycle,
    terms: CardPaymentTerms,
    input: Input
  ) -> [PlannedCardNotification] {
    let name = input.accountNames[cycle.accountID] ?? "Your card"
    let covered = cycle.coverage.isCovered
    // Only the current cycle's amounts are worth quoting: a next cycle's
    // balance is a projection that goes stale long before its reminders fire.
    let quotesAmounts = cycle.isCurrent && cycle.hasAmountDue
    let hasDefaults = terms.hasPaymentDefaults
      && terms.defaultFundingAccountID.map { input.openAccountIDs.contains($0) } == true
    let regularCategory = hasDefaults ? CardPaymentCategory.due : CardPaymentCategory.dueSetup
    let urgentCategory = hasDefaults ? CardPaymentCategory.urgent : CardPaymentCategory.urgentSetup
    let hour = terms.deliveryHour
    let recorded: String
    if case .partial(_, _, let paid, _) = cycle.coverage {
      recorded = "\(input.money(paid)) of \(input.money(cycle.statementBalance)) paid so far"
    } else {
      recorded = "\(input.money(cycle.statementBalance)) recorded so far"
    }
    let minimum = input.money(cycle.minimumDue)
    let dueLabel = CardPaymentFormat.weekdayDay(cycle.dueDate)
    let caveat = quotesAmounts ? "Check your statement for the actual amount." : "Open Halation to check what is due."
    let amountLine = quotesAmounts ? "\(recorded). Minimum \(minimum)." : ""
    func sentence(_ parts: String...) -> String {
      parts.filter { !$0.isEmpty }.joined(separator: " ")
    }
    let snoozedUntil = input.snoozes["\(cycle.accountID).\(cycle.statementDate)"]

    var result: [PlannedCardNotification] = []
    func add(
      _ touchpoint: PlannedCardNotification.Touchpoint,
      suffix: String? = nil,
      on day: String,
      hour: Int,
      title: String,
      body: String,
      category: String?,
      level: PlannedCardNotification.Level
    ) {
      guard let fire = fireComponents(day: day, hour: hour, calendar: input.calendar),
            fire.1 > input.now else {
        return
      }
      let components = fire.0
      let date = fire.1
      let id = identifier(
        accountID: cycle.accountID,
        statementDate: cycle.statementDate,
        touchpoint: suffix.map { "\(touchpoint.rawValue)\($0)" } ?? touchpoint.rawValue
      )
      var info: [String: String] = [
        "kind": "card",
        "accountId": cycle.accountID,
        "statementDate": cycle.statementDate,
        "dueDate": cycle.dueDate,
        "lastSafePayDate": cycle.lastSafePayDate,
        "touchpoint": touchpoint.rawValue,
        "connectionFingerprint": input.fingerprint,
        "statementBalance": String(cycle.statementBalance),
        "minimumDue": String(cycle.minimumDue),
        "currentBalance": String(cycle.currentBalance),
        "cardName": name,
        "amountRule": terms.defaultAmountRule.rawValue,
      ]
      if let funding = terms.defaultFundingAccountID {
        info["fundingAccountId"] = funding
      }
      if let fixed = terms.defaultAmountMilli {
        info["fixedAmount"] = String(fixed)
      }
      let planned = PlannedCardNotification(
        identifier: id,
        accountID: cycle.accountID,
        statementDate: cycle.statementDate,
        touchpoint: touchpoint,
        fire: components,
        fireDate: date,
        title: title,
        body: body,
        categoryIdentifier: category,
        level: level,
        threadIdentifier: "\(identifierPrefix)\(cycle.accountID)",
        userInfo: info
      )
      var signed = planned.userInfo
      signed["signature"] = planned.signature
      result.append(PlannedCardNotification(
        identifier: planned.identifier,
        accountID: planned.accountID,
        statementDate: planned.statementDate,
        touchpoint: planned.touchpoint,
        fire: planned.fire,
        fireDate: planned.fireDate,
        title: planned.title,
        body: planned.body,
        categoryIdentifier: planned.categoryIdentifier,
        level: planned.level,
        threadIdentifier: planned.threadIdentifier,
        userInfo: signed
      ))
    }

    func snoozedAway(_ day: String) -> Bool {
      guard let snoozedUntil else { return false }
      return day < snoozedUntil
    }

    // Statement notice: informational, so it goes out even once covered, and
    // even when nothing is recorded yet for a statement still to come.
    if !snoozedAway(cycle.statementDate) {
      add(
        .statement,
        on: cycle.statementDate,
        hour: hour,
        title: "Statement: \(name)",
        body: quotesAmounts
          ? "\(recorded). \(caveat) Due \(dueLabel). Minimum \(minimum)."
          : "Statement day for \(name). Open Halation to check what is due.",
        category: covered || !quotesAmounts ? nil : regularCategory,
        level: .active
      )
    }

    // Payment reminders need something owed at planning time, or a missed or
    // short payment the server reported.
    if !covered, cycle.needsPaying {
      let leadDay = CardCycleMaths.addDays(cycle.dueDate, -terms.leadDays)
      if terms.leadDays > 0, leadDay > cycle.statementDate, leadDay < cycle.lastSafePayDate,
         !snoozedAway(leadDay) {
        let days = terms.leadDays
        add(
          .lead,
          on: leadDay,
          hour: hour,
          title: "\(name): due \(dueLabel)",
          body: sentence(
            "\(days == 1 ? "1 day" : "\(days) days") left.",
            amountLine,
            caveat
          ),
          category: regularCategory,
          level: .active
        )
      }
      if cycle.lastSafePayDate < cycle.dueDate, cycle.lastSafePayDate > cycle.statementDate,
         !snoozedAway(cycle.lastSafePayDate) {
        add(
          .lastSafe,
          on: cycle.lastSafePayDate,
          hour: hour,
          title: "Pay \(name) today",
          body: sentence("Today is the last safe day to pay before it is due on \(dueLabel).", amountLine, caveat),
          category: regularCategory,
          level: .active
        )
      }
      // A snooze brings the reminder back on its day, unless another
      // reminder already lands then.
      if let snoozedUntil, snoozedUntil < cycle.dueDate, snoozedUntil != cycle.lastSafePayDate,
         terms.leadDays == 0 || snoozedUntil != leadDay {
        add(
          .snoozed,
          on: snoozedUntil,
          hour: hour,
          title: "\(name): due \(dueLabel)",
          body: sentence(amountLine, caveat),
          category: regularCategory,
          level: .active
        )
      }
      add(
        .due,
        on: cycle.dueDate,
        hour: hour,
        title: "\(name) is due today",
        body: sentence(amountLine, caveat),
        category: urgentCategory,
        level: .timeSensitive
      )
      // Overdue counts from the missed due date: this cycle's, or the
      // previous statement's when the server carried it over.
      let missed = cycle.coverage.overdueSince ?? cycle.dueDate
      var overdueCount = 0
      for offset in 1 ... overdueDays where overdueCount < overduePending {
        let day = CardCycleMaths.addDays(missed, offset)
        let before = result.count
        add(
          .overdue,
          suffix: offset == 1 ? nil : "\(offset)",
          on: day,
          hour: hour,
          title: "Overdue: \(name)",
          body: sentence(
            "Payment was due \(CardPaymentFormat.day(missed)).",
            quotesAmounts ? "\(recorded)." : "",
            "Late fees and interest may apply."
          ),
          category: urgentCategory,
          level: .timeSensitive
        )
        if result.count > before {
          overdueCount += 1
        }
      }
    }

    // The evening before a scheduled payment: check the money is there.
    switch cycle.coverage {
    case .scheduled(_, let payDate, let amount, let funding), .sending(let payDate, let amount, let funding):
      let fundingName = input.accountNames[funding] ?? "the paying account"
      add(
        .funds,
        on: CardCycleMaths.addDays(payDate, -1),
        hour: fundsHour,
        title: "\(name) is paid tomorrow",
        body: "\(input.money(amount)) from \(fundingName). Check there is enough in the account and that the payment is set up in your bank app.",
        category: nil,
        level: .passive
      )
    default:
      break
    }
    return result
  }

  /// The local time `hour:00` on `day` (ISO), in the device's calendar.
  static func fireComponents(day: String, hour: Int, calendar: Calendar) -> (DateComponents, Date)? {
    let parts = day.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    let components = DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: hour, minute: 0)
    guard let date = calendar.date(from: components) else { return nil }
    return (components, date)
  }

  /// Cards overdue or due today and not covered: the card payments badge.
  /// A previous statement carried over as overdue counts too.
  static func attentionCount(view: CardPaymentsView, today: String) -> Int {
    Set(view.cycles.filter { cycle in
      cycle.isCurrent
        && !cycle.coverage.isCovered
        && view.terms(for: cycle.accountID)?.enabled == true
        && (cycle.coverage.isOverdue || (cycle.needsPaying && cycle.dueDate <= today))
    }.map(\.accountID)).count
  }
}
