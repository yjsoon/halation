import Foundation

/// How a card's due date moves when it lands on a weekend.
enum CardDueWeekendRule: String, Codable, CaseIterable, Identifiable, Hashable {
  case next
  case previous

  var id: String { rawValue }

  var title: String {
    switch self {
    case .next: "Next working day"
    case .previous: "Previous working day"
    }
  }
}

/// What the card is usually paid with.
enum CardAmountRule: String, Codable, CaseIterable, Identifiable, Hashable {
  case statement
  case minimum
  case fixed

  var id: String { rawValue }

  var title: String {
    switch self {
    case .statement: "Statement balance"
    case .minimum: "Minimum payment"
    case .fixed: "Fixed amount"
    }
  }
}

/// A card's payment terms, the Codable twin of the contract's
/// `CardPaymentTerms`. Amounts are milliunits.
struct CardPaymentTerms: Codable, Hashable, Identifiable {
  var accountID: String
  var statementDay: Int
  var dueGapDays: Int
  var dueWeekendRule: CardDueWeekendRule
  var defaultFundingAccountID: String?
  var defaultAmountRule: CardAmountRule
  var defaultAmountMilli: Int?
  var minimumFloorMilli: Int
  var minimumRateBp: Int
  var payDaysBeforeDue: Int
  var leadDays: Int
  var deliveryHour: Int
  var enabled: Bool

  var id: String { accountID }

  private enum CodingKeys: String, CodingKey {
    case accountID = "accountId"
    case statementDay
    case dueGapDays
    case dueWeekendRule
    case defaultFundingAccountID = "defaultFundingAccountId"
    case defaultAmountRule
    case defaultAmountMilli
    case minimumFloorMilli
    case minimumRateBp
    case payDaysBeforeDue
    case leadDays
    case deliveryHour
    case enabled
  }

  /// The server's defaults for a new card.
  static func defaults(accountID: String, statementDay: Int = 1) -> CardPaymentTerms {
    CardPaymentTerms(
      accountID: accountID,
      statementDay: statementDay,
      dueGapDays: 25,
      dueWeekendRule: .next,
      defaultFundingAccountID: nil,
      defaultAmountRule: .statement,
      defaultAmountMilli: nil,
      minimumFloorMilli: 50_000,
      minimumRateBp: 300,
      payDaysBeforeDue: 2,
      leadDays: 7,
      deliveryHour: 8,
      enabled: true
    )
  }

  /// Saved choices are enough to finish a Scheduled tap without the app.
  var hasPaymentDefaults: Bool {
    guard defaultFundingAccountID != nil else {
      return false
    }
    return defaultAmountRule != .fixed || (defaultAmountMilli ?? 0) > 0
  }
}

/// How a cycle is covered, best first.
enum CardPaymentCoverage: Codable, Hashable {
  case unscheduled
  case scheduled(scheduledTransactionID: String, payDate: String, amount: Int, fundingAccountID: String)
  case posted(transactionID: String, approved: Bool, amount: Int, date: String)
  case paid(transactionID: String, amount: Int, date: String)
  case overdue
  /// Local only: a Scheduled tap queued on this device and not yet confirmed
  /// by the server.
  case sending(payDate: String, amount: Int, fundingAccountID: String)

  private enum CodingKeys: String, CodingKey {
    case state
    case scheduledTransactionID = "scheduledTransactionId"
    case transactionID = "transactionId"
    case fundingAccountID = "fundingAccountId"
    case payDate
    case amount
    case approved
    case date
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let state = try container.decode(String.self, forKey: .state)
    switch state {
    case "scheduled":
      self = .scheduled(
        scheduledTransactionID: try container.decode(String.self, forKey: .scheduledTransactionID),
        payDate: try container.decode(String.self, forKey: .payDate),
        amount: try container.decode(Int.self, forKey: .amount),
        fundingAccountID: try container.decode(String.self, forKey: .fundingAccountID)
      )
    case "posted":
      self = .posted(
        transactionID: try container.decode(String.self, forKey: .transactionID),
        approved: try container.decodeIfPresent(Bool.self, forKey: .approved) ?? false,
        amount: try container.decode(Int.self, forKey: .amount),
        date: try container.decode(String.self, forKey: .date)
      )
    case "paid":
      self = .paid(
        transactionID: try container.decode(String.self, forKey: .transactionID),
        amount: try container.decode(Int.self, forKey: .amount),
        date: try container.decode(String.self, forKey: .date)
      )
    case "overdue":
      self = .overdue
    case "sending":
      self = .sending(
        payDate: try container.decode(String.self, forKey: .payDate),
        amount: try container.decode(Int.self, forKey: .amount),
        fundingAccountID: try container.decode(String.self, forKey: .fundingAccountID)
      )
    default:
      self = .unscheduled
    }
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    switch self {
    case .unscheduled:
      try container.encode("unscheduled", forKey: .state)
    case .scheduled(let id, let payDate, let amount, let funding):
      try container.encode("scheduled", forKey: .state)
      try container.encode(id, forKey: .scheduledTransactionID)
      try container.encode(payDate, forKey: .payDate)
      try container.encode(amount, forKey: .amount)
      try container.encode(funding, forKey: .fundingAccountID)
    case .posted(let id, let approved, let amount, let date):
      try container.encode("posted", forKey: .state)
      try container.encode(id, forKey: .transactionID)
      try container.encode(approved, forKey: .approved)
      try container.encode(amount, forKey: .amount)
      try container.encode(date, forKey: .date)
    case .paid(let id, let amount, let date):
      try container.encode("paid", forKey: .state)
      try container.encode(id, forKey: .transactionID)
      try container.encode(amount, forKey: .amount)
      try container.encode(date, forKey: .date)
    case .overdue:
      try container.encode("overdue", forKey: .state)
    case .sending(let payDate, let amount, let funding):
      try container.encode("sending", forKey: .state)
      try container.encode(payDate, forKey: .payDate)
      try container.encode(amount, forKey: .amount)
      try container.encode(funding, forKey: .fundingAccountID)
    }
  }

  /// Scheduled, posted, paid or on its way: the payment escalation stops.
  var isCovered: Bool {
    switch self {
    case .unscheduled, .overdue: false
    case .scheduled, .posted, .paid, .sending: true
    }
  }
}

/// One statement cycle for one card, as `GET card_payments` derives it.
struct CardPaymentCycle: Codable, Hashable, Identifiable {
  let accountID: String
  /// "current" or "next".
  let cycle: String
  let statementDate: String
  let dueDate: String
  let lastSafePayDate: String
  let defaultPayDate: String
  /// Owed at the end of the statement date, recorded so far. Positive means owed.
  let statementBalance: Int
  let minimumDue: Int
  /// Owed now. Positive means owed.
  let currentBalance: Int
  var coverage: CardPaymentCoverage

  var id: String { "\(accountID).\(statementDate)" }

  var isCurrent: Bool { cycle == "current" }

  /// A zero or credit statement balance gets no reminders.
  var hasAmountDue: Bool { statementBalance > 0 }

  private enum CodingKeys: String, CodingKey {
    case accountID = "accountId"
    case cycle
    case statementDate
    case dueDate
    case lastSafePayDate
    case defaultPayDate
    case statementBalance
    case minimumDue
    case currentBalance
    case coverage
  }

  func with(coverage: CardPaymentCoverage) -> CardPaymentCycle {
    var copy = self
    copy.coverage = coverage
    return copy
  }
}

/// Every card with terms, and its current and next cycle.
struct CardPaymentsView: Codable, Equatable {
  var asOf: String
  var cycles: [CardPaymentCycle]
  var terms: [CardPaymentTerms]

  static let empty = CardPaymentsView(asOf: "", cycles: [], terms: [])

  func terms(for accountID: String) -> CardPaymentTerms? {
    terms.first { $0.accountID == accountID }
  }

  func currentCycle(for accountID: String) -> CardPaymentCycle? {
    cycles.first { $0.accountID == accountID && $0.isCurrent }
  }

  func cycle(accountID: String, statementDate: String) -> CardPaymentCycle? {
    cycles.first { $0.accountID == accountID && $0.statementDate == statementDate }
  }
}

struct CardPaymentTermsListPayload: Decodable {
  let cardPaymentTerms: [CardPaymentTerms]
}

struct CardPaymentTermsPayload: Decodable {
  let cardPaymentTerms: CardPaymentTerms
}

struct CardPaymentTermsWriteEnvelope: Encodable {
  let cardPaymentTerms: CardPaymentTerms
}

struct CardPaymentsPayload: Decodable {
  let asOf: String
  let cycles: [CardPaymentCycle]
}

/// What the app icon number counts. A device setting.
enum AppBadgeMode: String, CaseIterable, Identifiable {
  case inbox
  case cardPayments
  case both

  var id: String { rawValue }

  var title: String {
    switch self {
    case .inbox: "Inbox only"
    case .cardPayments: "Card payments"
    case .both: "Both"
    }
  }

  static let defaultsKey = "halation.badge-mode"

  static var current: AppBadgeMode {
    get {
      UserDefaults.standard.string(forKey: defaultsKey).flatMap(AppBadgeMode.init(rawValue:)) ?? .inbox
    }
    set {
      UserDefaults.standard.set(newValue.rawValue, forKey: defaultsKey)
    }
  }

  func count(inbox: Int, cards: Int) -> Int {
    switch self {
    case .inbox: inbox
    case .cardPayments: cards
    case .both: inbox + cards
    }
  }
}

/// Bank presets for the terms sheet: the statement-to-due gap and the
/// weekend rule. The owner can change both.
enum CardBankPreset: String, CaseIterable, Identifiable {
  case dbs
  case ocbc
  case uob
  case other

  var id: String { rawValue }

  var title: String {
    switch self {
    case .dbs: "DBS / POSB"
    case .ocbc: "OCBC"
    case .uob: "UOB"
    case .other: "Other"
    }
  }

  var dueGapDays: Int? {
    switch self {
    case .dbs: 25
    case .ocbc: 23
    case .uob: 21
    case .other: nil
    }
  }

  var weekendRule: CardDueWeekendRule? {
    switch self {
    case .dbs, .uob: .next
    case .ocbc: .previous
    case .other: nil
    }
  }

  static func matching(gap: Int, rule: CardDueWeekendRule) -> CardBankPreset {
    allCases.first { $0.dueGapDays == gap && $0.weekendRule == rule } ?? .other
  }
}

/// The cycle date maths the terms sheet needs to show "Next: statement, due"
/// as the owner edits. Mirrors `apps/api/src/card-payments.ts`; the server's
/// view stays the source of truth for reminders.
enum CardCycleMaths {
  private static var calendar: Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
    return calendar
  }

  private static func date(_ iso: String) -> Date? {
    let parts = iso.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
  }

  private static func iso(_ date: Date) -> String {
    let parts = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 1, parts.day ?? 1)
  }

  static func addDays(_ value: String, _ count: Int) -> String {
    guard let base = date(value), let moved = calendar.date(byAdding: .day, value: count, to: base) else {
      return value
    }
    return iso(moved)
  }

  /// `monthIndex` is zero based and may run past either end of the year.
  static func statementDate(year: Int, monthIndex: Int, statementDay: Int) -> String {
    let normalisedYear = year + Int((Double(monthIndex) / 12).rounded(.down))
    let normalisedMonth = ((monthIndex % 12) + 12) % 12
    let first = calendar.date(from: DateComponents(year: normalisedYear, month: normalisedMonth + 1, day: 1)) ?? .now
    let length = calendar.range(of: .day, in: .month, for: first)?.count ?? 28
    return String(format: "%04d-%02d-%02d", normalisedYear, normalisedMonth + 1, min(statementDay, length))
  }

  static func isWorkingDay(_ value: String) -> Bool {
    guard let day = date(value) else { return true }
    let weekday = calendar.component(.weekday, from: day)
    return weekday != 1 && weekday != 7
  }

  static func dueDate(statementDate: String, gapDays: Int, rule: CardDueWeekendRule) -> String {
    var due = addDays(statementDate, gapDays)
    var guardCount = 0
    while !isWorkingDay(due), guardCount < 14 {
      due = addDays(due, rule == .previous ? -1 : 1)
      guardCount += 1
    }
    return due
  }

  /// The cycle the owner pays next: the current one while its due date is
  /// still ahead, otherwise the one after.
  static func upcoming(
    statementDay: Int,
    gapDays: Int,
    rule: CardDueWeekendRule,
    today: String
  ) -> (statement: String, due: String) {
    let year = Int(today.prefix(4)) ?? 2026
    var monthIndex = (Int(today.dropFirst(5).prefix(2)) ?? 1) - 1
    if statementDate(year: year, monthIndex: monthIndex, statementDay: statementDay) > today {
      monthIndex -= 1
    }
    let current = statementDate(year: year, monthIndex: monthIndex, statementDay: statementDay)
    let currentDue = dueDate(statementDate: current, gapDays: gapDays, rule: rule)
    if currentDue >= today {
      return (current, currentDue)
    }
    let next = statementDate(year: year, monthIndex: monthIndex + 1, statementDay: statementDay)
    return (next, dueDate(statementDate: next, gapDays: gapDays, rule: rule))
  }
}

enum CardPaymentFormat {
  /// "Fri 28 Nov"
  static func weekdayDay(_ iso: String) -> String {
    guard let date = Date(isoDateString: iso) else { return iso }
    return weekdayFormatter.string(from: date)
  }

  /// "28 Nov"
  static func day(_ iso: String) -> String {
    guard let date = Date(isoDateString: iso) else { return iso }
    return dayFormatter.string(from: date)
  }

  /// "3rd of the month"
  static func ordinalDay(_ day: Int) -> String {
    let suffix: String
    switch day % 100 {
    case 11, 12, 13: suffix = "th"
    default:
      switch day % 10 {
      case 1: suffix = "st"
      case 2: suffix = "nd"
      case 3: suffix = "rd"
      default: suffix = "th"
      }
    }
    return "\(day)\(suffix) of the month"
  }

  private static let weekdayFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_GB")
    formatter.dateFormat = "EEE d MMM"
    return formatter
  }()

  private static let dayFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_GB")
    formatter.dateFormat = "d MMM"
    return formatter
  }()

  /// The idempotency key the phone and the web both send for "schedule this
  /// statement's payment", so a second tap anywhere replays rather than
  /// doubles. A suffix makes a fresh key once that schedule was deleted and
  /// the statement is scheduled again.
  static func idempotencyKey(accountID: String, statementDate: String, suffix: String? = nil) -> String {
    let raw = (["card-pay", accountID, statementDate] + (suffix.map { [$0] } ?? [])).joined(separator: ":")
    let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._:-")
    let clean = String(String.UnicodeScalarView(raw.unicodeScalars.map { allowed.contains($0) ? $0 : "-" }))
    if clean.count <= 128 {
      return clean
    }
    var hash: UInt64 = 14_695_981_039_346_656_037
    for byte in clean.utf8 {
      hash ^= UInt64(byte)
      hash &*= 1_099_511_628_211
    }
    return "card-pay:\(String(hash, radix: 16)):\(statementDate)"
  }
}
