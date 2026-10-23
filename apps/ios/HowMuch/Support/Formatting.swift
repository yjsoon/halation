import Foundation

enum MoneyCodec {
  /// The largest magnitude typed digit by digit on the amount keypad:
  /// 999,999,999.99. Its + and − stop at `storableAmountCap`.
  static let typedAmountCap = 999_999_999_990

  /// The largest magnitude the server stores, in milliunits: one trillion
  /// units, as `MAX_AMOUNT_MILLIUNITS` in packages/money. Typed fields stop
  /// here, so a dong or rupiah balance past the keypad's cap still fits.
  static let storableAmountCap = 1_000_000_000_000_000

  static func milliunits(from input: String) -> Int? {
    let raw = input.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "[$,\\s]", with: "", options: .regularExpression)
    guard !raw.isEmpty else {
      return nil
    }

    let sign = raw.hasPrefix("-") ? -1 : 1
    let unsigned = raw.replacingOccurrences(of: "^[+-]", with: "", options: .regularExpression)
    let parts = unsigned.split(separator: ".", omittingEmptySubsequences: false)
    guard parts.count <= 2 else {
      return nil
    }

    let wholePart = String(parts.first ?? "0")
    let fractionalPart = parts.count == 2 ? String(parts[1]) : ""
    // Only one leading sign. `Int` would accept a second one, reading "--5"
    // as 5 and "1.-5" as 0.95.
    let isDigits = { (part: String) in part.allSatisfy { $0.isASCII && $0.isNumber } }
    guard isDigits(wholePart), isDigits(fractionalPart), !(wholePart + fractionalPart).isEmpty else {
      return nil
    }
    // Milliunits are the storage precision. Reject extra digits rather than
    // silently rounding or truncating a split allocation on save.
    guard fractionalPart.count <= 3 else {
      return nil
    }
    let paddedFraction = String(fractionalPart.padding(toLength: 3, withPad: "0", startingAt: 0).prefix(3))

    guard
      let whole = Int(wholePart.isEmpty ? "0" : wholePart),
      let fraction = Int(paddedFraction)
    else {
      return nil
    }

    let scaled = whole.multipliedReportingOverflow(by: 1000)
    guard !scaled.overflow else {
      return nil
    }
    let total = scaled.partialValue.addingReportingOverflow(fraction)
    guard !total.overflow else {
      return nil
    }
    if sign == -1 {
      let negated = total.partialValue.multipliedReportingOverflow(by: -1)
      return negated.overflow ? nil : negated.partialValue
    }
    return total.partialValue
  }

  /// An amount a person typed into a field. The system decimal pad shows the
  /// device's own decimal separator, so where that is a comma, "12,50" is
  /// twelve and a half, not 1,250. A comma is read as the decimal point only
  /// there, and only when the entry has one comma and no full stop; anything
  /// else reads exactly as `milliunits(from:)`.
  ///
  /// Typed amounts stop at `storableAmountCap`. With `decimalDigits` (the plan
  /// currency's), digits past the currency's minor unit must be zeros, so a
  /// yen amount cannot carry a fraction.
  static func milliunits(
    fromTyped input: String,
    decimalDigits: Int? = nil,
    decimalSeparator: String? = Locale.current.decimalSeparator
  ) -> Int? {
    let usesDecimalComma = decimalSeparator == ","
      && !input.contains(".")
      && input.filter({ $0 == "," }).count == 1
    guard
      let value = milliunits(from: usesDecimalComma ? input.replacingOccurrences(of: ",", with: ".") : input),
      value.magnitude <= storableAmountCap.magnitude
    else {
      return nil
    }
    if let decimalDigits, value % minorUnit(decimalDigits: decimalDigits) != 0 {
      return nil
    }
    return value
  }

  /// Milliunits in the currency's smallest unit: 10 for cents, 1,000 for a
  /// currency without a minor unit such as the yen.
  static func minorUnit(decimalDigits: Int) -> Int {
    var unit = 1
    for _ in 0..<(3 - min(max(decimalDigits, 0), 3)) {
      unit *= 10
    }
    return unit
  }

  static func editableString(for milliunits: Int) -> String {
    let magnitude = milliunits.magnitude
    let whole = magnitude / 1_000
    var fraction = String(magnitude % 1_000 + 1_000).dropFirst()
    if fraction.last == "0" {
      fraction.removeLast()
    }
    let sign = milliunits < 0 ? "-" : ""
    return "\(sign)\(whole).\(fraction)"
  }

  /// Model extractions may include `$`, `S$`, grouping commas, currency codes, or trailing words.
  /// Typed fields still go through `milliunits(from:)` and reject that junk.
  static func milliunits(fromExtraction input: String) -> Int? {
    var raw = input.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !raw.isEmpty else {
      return nil
    }
    raw = raw.replacingOccurrences(
      of: #"(?i)(?:\b(?:s|us|a|nz|hk)\$)|\b(?:sgd|usd)\b|\b(?:dollars?)\b|\$"#,
      with: "",
      options: .regularExpression
    )
    raw = raw.replacingOccurrences(of: ",", with: "")
    guard let match = raw.range(of: #"-?(?:\d+(?:\.\d+)?|\.\d+)"#, options: .regularExpression),
          let value = milliunits(from: String(raw[match])),
          value.magnitude <= storableAmountCap.magnitude
    else {
      return nil
    }
    // A card number read off a receipt is not an amount.
    return value
  }

  static func milliunits(from value: Decimal) -> Int? {
    let magnitude = value < 0 ? -value : value
    var scaled = magnitude * 1000
    var integerPart = Decimal()
    NSDecimalRound(&integerPart, &scaled, 0, .down)
    guard integerPart == scaled else {
      return nil
    }
    let number = NSDecimalNumber(decimal: integerPart)
    let milli = number.intValue
    guard NSDecimalNumber(value: milli) == number else {
      return nil
    }
    return milli
  }

  static func displayString(for milliunits: Int, currencyFormat: CurrencyFormat?) -> String {
    let formatter = formatter(for: currencyFormat)
    let decimalValue = Decimal(milliunits) / 1000
    return formatter.string(from: decimalValue as NSDecimalNumber)
      ?? decimalValue.formatted(.number.precision(.fractionLength(2)))
  }

  static func displayString(forCurrencyUnits units: Double, currencyFormat: CurrencyFormat?) -> String {
    displayString(for: Int((units * 1000).rounded()), currencyFormat: currencyFormat)
  }

  private static let formatterLock = NSLock()
  private static var formatters: [String: NumberFormatter] = [:]

  private static func formatter(for currencyFormat: CurrencyFormat?) -> NumberFormatter {
    let key = [
      String(currencyFormat?.decimalDigits ?? 2),
      currencyFormat?.currencySymbol ?? Locale.current.currencySymbol ?? "$",
      currencyFormat?.decimalSeparator ?? "",
      currencyFormat?.groupSeparator ?? "",
      currencyFormat?.symbolFirst.map { $0 ? "first" : "last" } ?? "",
      currencyFormat?.displaySymbol == false ? "hidden" : "",
    ].joined(separator: "\u{1f}")

    formatterLock.lock()
    if let cached = formatters[key] {
      formatterLock.unlock()
      return cached
    }
    formatterLock.unlock()

    let formatter = NumberFormatter()
    formatter.numberStyle = .currency
    let showsSymbol = currencyFormat?.displaySymbol ?? true
    if currencyFormat?.symbolFirst != nil || !showsSymbol {
      // The plan says where its symbol goes, or that it is hidden, as the web
      // app draws it; the device region's own pattern must not move it. Set
      // before the digits and separators, which a pattern would reset.
      let symbolFirst = currencyFormat?.symbolFirst ?? true
      let pattern = showsSymbol ? (symbolFirst ? "¤#,##0.00" : "#,##0.00¤") : "#,##0.00"
      formatter.positiveFormat = pattern
      formatter.negativeFormat = "-\(pattern)"
    }
    formatter.minimumFractionDigits = currencyFormat?.decimalDigits ?? 2
    formatter.maximumFractionDigits = currencyFormat?.decimalDigits ?? 2
    // Ties round away from zero, as the web shows them and as a new capture
    // is saved (`TransactionDraft.roundedToMinorUnit`): $12.345 reads $12.35.
    formatter.roundingMode = .halfUp
    formatter.currencySymbol = showsSymbol
      ? (currencyFormat?.currencySymbol ?? Locale.current.currencySymbol ?? "$")
      : ""
    // A currency pattern draws with the currency separators, which follow
    // the device region unless they are set too.
    if let decimalSeparator = currencyFormat?.decimalSeparator {
      formatter.decimalSeparator = decimalSeparator
      formatter.currencyDecimalSeparator = decimalSeparator
    }
    if let groupSeparator = currencyFormat?.groupSeparator {
      formatter.groupingSeparator = groupSeparator
      formatter.currencyGroupingSeparator = groupSeparator
    }

    formatterLock.lock()
    formatters[key] = formatter
    formatterLock.unlock()
    return formatter
  }

  /// Signed display with an explicit plus on inflows, for ledger-style rows.
  static func signedDisplayString(for milliunits: Int, currencyFormat: CurrencyFormat?) -> String {
    let base = displayString(for: milliunits, currencyFormat: currencyFormat)
    return milliunits > 0 ? "+\(base)" : base
  }

  /// Short money for a chart's value axis: "$579k", "$1.2M", "-$850". Keeps
  /// the plan's symbol on its side and drops the minor units; a tick only
  /// has to say what scale the chart is on.
  static func compactDisplayString(for milliunits: Int, currencyFormat: CurrencyFormat?) -> String {
    let units = abs(Double(milliunits)) / 1000
    let steps: [(limit: Double, divisor: Double, suffix: String)] = [
      (1_000_000_000, 1_000_000_000, "B"),
      (1_000_000, 1_000_000, "M"),
      (1_000, 1_000, "k"),
    ]
    var number = String(Int(units.rounded()))
    for step in steps where units >= step.limit {
      let scaled = units / step.divisor
      // One decimal under ten ("1.2M"), none above ("579k"); a value that
      // rounds up to the next step reads as that step ("1000k" is "1M").
      let digits = scaled < 10 ? 1 : 0
      let factor = pow(10, Double(digits))
      let rounded = (scaled * factor).rounded() / factor
      if rounded >= 1000, let next = steps.first(where: { $0.divisor == step.divisor * 1000 }) {
        number = "1" + next.suffix
      } else {
        var text = String(format: "%.\(digits)f", rounded)
        if let separator = currencyFormat?.decimalSeparator, separator != "." {
          text = text.replacingOccurrences(of: ".", with: separator)
        }
        number = text + step.suffix
      }
      break
    }
    let showsSymbol = currencyFormat?.displaySymbol ?? true
    let symbol = showsSymbol ? (currencyFormat?.currencySymbol ?? Locale.current.currencySymbol ?? "$") : ""
    let symbolFirst = currencyFormat?.symbolFirst ?? true
    let body = symbolFirst ? symbol + number : number + symbol
    return milliunits < 0 ? "-" + body : body
  }
}

/// Milliunit sums. The server stores amounts up to 1e15 milliunits each, so
/// plain `+` over a few thousand of them passes Int64 and traps.
extension Sequence where Element == Int {
  /// The sum, or nil when it would overflow.
  func checkedSum() -> Int? {
    var total = 0
    for value in self {
      let next = total.addingReportingOverflow(value)
      guard !next.overflow else {
        return nil
      }
      total = next.partialValue
    }
    return total
  }

  /// The sum for display, clamped to the Int range instead of trapping.
  func saturatingSum() -> Int {
    reduce(0) { total, value in
      let next = total.addingReportingOverflow(value)
      guard next.overflow else {
        return next.partialValue
      }
      return value < 0 ? Int.min : Int.max
    }
  }
}

enum TypedNumber {
  /// A plain number typed on the decimal pad, such as a reward rate. Where the
  /// device's decimal separator is a comma, the pad offers only a comma, so a
  /// single comma (and no full stop) is read as the decimal point.
  static func double(
    from input: String,
    decimalSeparator: String? = Locale.current.decimalSeparator
  ) -> Double? {
    var trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
    if decimalSeparator == ",",
       !trimmed.contains("."),
       trimmed.filter({ $0 == "," }).count == 1 {
      trimmed = trimmed.replacingOccurrences(of: ",", with: ".")
    }
    return Double(trimmed)
  }
}

enum LedgerDate {
  /// "Today", "Yesterday", or "Mon 8 Jun 2026" from an ISO `yyyy-MM-dd` string.
  static func friendlyString(fromISO isoDate: String) -> String {
    guard let date = parser.date(from: isoDate) else {
      return isoDate
    }
    if Calendar.current.isDateInToday(date) {
      return "Today"
    }
    if Calendar.current.isDateInYesterday(date) {
      return "Yesterday"
    }
    return display.string(from: date)
  }

  /// Human label for a report period key: `2026-06-10`, `2026-W23`, `2026-06`, or `2026`.
  static func periodLabel(_ raw: String) -> String {
    let parts = raw.split(separator: "-")
    if parts.count == 3 {
      return friendlyString(fromISO: raw)
    }
    if parts.count == 2, parts[1].hasPrefix("W") {
      return "Week \(parts[1].dropFirst()), \(parts[0])"
    }
    if parts.count == 2, let month = Int(parts[1]), (1 ... 12).contains(month) {
      return "\(Calendar.current.monthSymbols[month - 1]) \(parts[0])"
    }
    return raw
  }

  /// `periodLabel` with a dated day in place of "Today" or "Yesterday", so it
  /// reads in a sentence: "Highest: £90, Tue 21 Oct 2026", not "…, Today".
  static func spokenPeriodLabel(_ raw: String) -> String {
    if raw.split(separator: "-").count == 3, let date = parser.date(from: raw) {
      return display.string(from: date)
    }
    return periodLabel(raw)
  }

  /// Compact label for a report chart's horizontal axis.
  static func periodAxisLabel(_ raw: String) -> String {
    let parts = raw.split(separator: "-")
    if parts.count == 3, let date = parser.date(from: raw) {
      return axisDayDisplay.string(from: date)
    }
    if parts.count == 2, parts[1].hasPrefix("W") {
      return String(parts[1])
    }
    if parts.count == 2, let month = Int(parts[1]), (1 ... 12).contains(month) {
      return Calendar.current.shortMonthSymbols[month - 1]
    }
    return raw
  }

  /// Axis labels for a whole series. A monthly run that crosses a year
  /// gets a short year on the first column and on January, so two Augusts
  /// in a trailing-year net-worth chart stay distinguishable.
  static func periodAxisLabels(_ raws: [String]) -> [String] {
    let months = raws.compactMap(yearMonth(from:))
    let spansYears = Set(months.map { $0.year }).count > 1
    guard months.count == raws.count, spansYears else {
      return raws.map(periodAxisLabel)
    }
    return months.enumerated().map { index, item in
      let short = Calendar.current.shortMonthSymbols[item.month - 1]
      if index == 0 || item.month == 1 {
        return "\(short) \(String(item.year).suffix(2))"
      }
      return short
    }
  }

  private static func yearMonth(from raw: String) -> (year: Int, month: Int)? {
    let parts = raw.split(separator: "-")
    guard parts.count == 2, !parts[1].hasPrefix("W"),
          let year = Int(parts[0]), let month = Int(parts[1]),
          (1 ... 12).contains(month) else {
      return nil
    }
    return (year, month)
  }

  private static let parser: DateFormatter = {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .iso8601)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
  }()

  private static let display: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateFormat = "EEE d MMM yyyy"
    return formatter
  }()

  private static let axisDayDisplay: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateFormat = "d MMM"
    return formatter
  }()
}

extension Date {
  var isoDateString: String {
    Self.isoFormatter.string(from: self)
  }

  init?(isoDateString: String) {
    guard let parsed = Self.isoFormatter.date(from: isoDateString) else {
      return nil
    }
    self = parsed
  }

  func startOfMonth(calendar: Calendar = .current) -> Date {
    calendar.date(from: calendar.dateComponents([.year, .month], from: self)) ?? self
  }

  func endOfMonth(calendar: Calendar = .current) -> Date {
    guard
      let nextMonth = calendar.date(byAdding: .month, value: 1, to: startOfMonth(calendar: calendar)),
      let lastDay = calendar.date(byAdding: .day, value: -1, to: nextMonth)
    else {
      return self
    }
    return lastDay
  }

  /// "September 2025"
  var monthYearLabel: String {
    Self.monthYearFormatter.string(from: self)
  }

  /// "8 Jun 2026", for compact custom-range chips.
  var compactDateLabel: String {
    Self.compactDateFormatter.string(from: self)
  }

  private static let monthYearFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateFormat = "MMMM yyyy"
    return formatter
  }()

  private static let compactDateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateFormat = "d MMM yyyy"
    return formatter
  }()

  /// Local wall-clock dates: a transaction entered before 8am in Singapore
  /// must not land on yesterday's GMT date.
  private static let isoFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .iso8601)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
  }()
}
