import Foundation
import SwiftUI

/// Pure layout/data helpers for the Income vs Spending card, list, and month detail.
enum IncomeVsSpendingMaths {
  struct PeriodRow: Equatable, Identifiable {
    var id: String { period }
    var period: String
    var from: String
    var to: String
    var income: Int
    var spending: Int
    var net: Int
    var isEmpty: Bool
  }

  struct YearSection: Equatable, Identifiable {
    var id: String { year }
    var year: String
    var net: Int
    var rows: [PeriodRow]
  }

  static func hasActivity(periods: [IncomeVsSpendingPeriod], matching prefix: String) -> Bool {
    periods.contains { $0.period.hasPrefix(prefix) && ($0.income != 0 || $0.spending != 0) }
  }

  static func currentMonthKey(from date: Date = .now, calendar: Calendar = LedgerDate.gregorian) -> String {
    String(date.startOfMonth(calendar: calendar).isoDateString.prefix(7))
  }

  static func monthName(from date: Date = .now, calendar: Calendar = LedgerDate.gregorian) -> String {
    calendar.monthSymbols[calendar.component(.month, from: date) - 1]
  }

  /// The register / groups window behind one period row. The row's bounds were
  /// already cut to the report window that produced its figures, so the
  /// drill-down covers the whole row: clamping it to today would drop
  /// future-dated activity the row counts, and would trap on a period that
  /// starts after today.
  static func drillDownRange(_ row: PeriodRow) -> ClosedRange<String> {
    row.from ... max(row.from, row.to)
  }

  /// Net as a share of income. The dash means "no income to compare with";
  /// overspending shows as a negative rate however deep it goes, so a month
  /// that spent three times its income is not confused with one that had none.
  static func savingsRateLabel(net: Int, income: Int) -> String {
    guard income > 0 else {
      return "—"
    }
    var rate = Double(net) / Double(income)
    if net > 0, net < income {
      // Something was spent, so the stat never rounds up to a full 100%.
      rate = min(rate, 0.999)
    }
    return rate.formatted(.percent.precision(.fractionLength(1)))
  }

  /// The row-sized phrase for the same ratio: "23% saved", "12% overspent",
  /// or nil when there was no income.
  static func savingsPhrase(net: Int, income: Int) -> String? {
    guard income > 0 else {
      return nil
    }
    if net == 0 {
      return "Broke even"
    }
    let percent = abs(Double(net)) / Double(income) * 100
    var shown = percent < 1 ? "< 1%" : "\(Int(percent.rounded()))%"
    if net > 0, net < income, percent.rounded() >= 100 {
      // Something was spent, so never claim all of it was saved.
      shown = "> 99%"
    }
    return net < 0 ? "\(shown) overspent" : "\(shown) saved"
  }

  /// How a period row is named. `soFar` marks the current period so the
  /// caller can set the suffix in a quieter colour.
  struct PeriodTitle: Equatable {
    var text: String
    var soFar: Bool

    var spoken: String { soFar ? "\(text) so far" : text }
    var display: String { soFar ? "\(text) · so far" : text }
  }

  /// Names a row by what it covers. A whole month or year keeps its name; a
  /// week is always its dates, because week numbers mean nothing to a reader;
  /// a row clipped by the range (the first two months of a Last 12 Months
  /// year, a custom range starting mid month) is named by its actual span.
  static func periodTitle(_ row: PeriodRow, interval: ReportInterval, today: String) -> PeriodTitle {
    let current = isCurrentPeriod(row.period, interval: interval, today: today)
    switch interval {
    case .day:
      return PeriodTitle(text: LedgerDate.periodLabel(row.period), soFar: false)
    case .week:
      // A current week clipped short of today (a range that ended earlier
      // this week) is finished as far as the figures go.
      return PeriodTitle(text: spanLabel(from: row.from, to: row.to), soFar: current && row.to >= today)
    case .month, .year:
      let natural = inferredBounds(of: row.period, interval: interval)
      let startsOnTime = row.from == natural.from
      let endsOnTime = row.to == natural.to || (current && row.to == today)
      if startsOnTime, endsOnTime {
        return PeriodTitle(text: LedgerDate.periodLabel(row.period), soFar: current)
      }
      return PeriodTitle(text: spanLabel(from: row.from, to: row.to), soFar: current && row.to == today)
    }
  }

  /// A human span for two ISO dates: "23 Oct 2026", "1–23 Oct 2026",
  /// "1 Jan – 23 Oct 2026", "29 Dec 2025 – 4 Jan 2026"; whole months read
  /// "Nov–Dec 2025" and whole years "2024–2026".
  static func spanLabel(from: String, to: String) -> String {
    guard let start = parseISO(from), let end = parseISO(to) else {
      return "\(from) – \(to)"
    }
    if start == end || from > to {
      return "\(start.day) \(shortMonthSymbol(start.month)) \(start.year)"
    }
    let wholeMonths = start.day == 1 && end.day == daysInMonth(year: end.year, month: end.month)
    if wholeMonths, start.month == 1, end.month == 12 {
      return start.year == end.year ? "\(start.year)" : "\(start.year)–\(end.year)"
    }
    if wholeMonths {
      if start.year == end.year, start.month == end.month {
        return "\(gregorian.monthSymbols[start.month - 1]) \(start.year)"
      }
      if start.year == end.year {
        return "\(shortMonthSymbol(start.month))–\(shortMonthSymbol(end.month)) \(start.year)"
      }
      return "\(shortMonthSymbol(start.month)) \(start.year) – \(shortMonthSymbol(end.month)) \(end.year)"
    }
    if start.year == end.year, start.month == end.month {
      return "\(start.day)–\(end.day) \(shortMonthSymbol(start.month)) \(start.year)"
    }
    if start.year == end.year {
      return "\(start.day) \(shortMonthSymbol(start.month)) – \(end.day) \(shortMonthSymbol(end.month)) \(start.year)"
    }
    return "\(start.day) \(shortMonthSymbol(start.month)) \(start.year) – \(end.day) \(shortMonthSymbol(end.month)) \(end.year)"
  }

  /// Days in the window, inclusive; nil when it is unbounded (All Time).
  static func windowDays(from: String?, to: String?) -> Int? {
    guard let from, let to, let start = parseISO(from), let end = parseISO(to) else {
      return nil
    }
    return civilDay(year: end.year, month: end.month, day: end.day)
      - civilDay(year: start.year, month: start.month, day: start.day) + 1
  }

  /// The groupings a window can carry without the paired chart turning into
  /// slivers and the list into hundreds of empty rows: days for up to a
  /// month, weeks for up to about six months, months and years always.
  static func allowedIntervals(from: String?, to: String?) -> [ReportInterval] {
    guard let days = windowDays(from: from, to: to) else {
      return [.month, .year]
    }
    if days <= 31 {
      return [.day, .week, .month, .year]
    }
    if days <= 190 {
      return [.week, .month, .year]
    }
    return [.month, .year]
  }

  /// The grouping actually used: the user's choice when the window allows it,
  /// otherwise the finest allowed one.
  static func effectiveInterval(_ chosen: ReportInterval, allowed: [ReportInterval]) -> ReportInterval {
    allowed.contains(chosen) ? chosen : (allowed.first ?? .month)
  }

  /// Where a row leads, for VoiceOver: a day opens its register, the rest a
  /// period detail.
  static func rowDestination(interval: ReportInterval) -> String {
    switch interval {
    case .day:
      return "the register for this day"
    case .week:
      return "week detail"
    case .month:
      return "month detail"
    case .year:
      return "year detail"
    }
  }

  static func zeroFill(
    periods: [IncomeVsSpendingPeriod],
    interval: ReportInterval,
    from: String?,
    to: String?
  ) -> [PeriodRow] {
    guard !periods.isEmpty else {
      return []
    }
    let start = from ?? inferredStart(of: periods[0].period, interval: interval)
    let end = to ?? inferredEnd(of: periods[periods.count - 1].period, interval: interval)
    guard let start, let end, start <= end else {
      return periods.map { row(from: $0, interval: interval) }
    }
    let byKey = Dictionary(uniqueKeysWithValues: periods.map { ($0.period, $0) })
    return enumeratePeriods(from: start, to: end, interval: interval).map { bounds in
      if let existing = byKey[bounds.key] {
        return PeriodRow(
          period: bounds.key,
          from: bounds.from,
          to: bounds.to,
          income: existing.income,
          spending: existing.spending,
          net: existing.net,
          isEmpty: existing.income == 0 && existing.spending == 0
        )
      }
      return PeriodRow(
        period: bounds.key,
        from: bounds.from,
        to: bounds.to,
        income: 0,
        spending: 0,
        net: 0,
        isEmpty: true
      )
    }
  }

  static func yearSections(rows: [PeriodRow]) -> [YearSection] {
    var order: [String] = []
    var grouped: [String: [PeriodRow]] = [:]
    for row in rows {
      let year = String(row.period.prefix(4))
      if grouped[year] == nil {
        order.append(year)
        grouped[year] = []
      }
      grouped[year]?.append(row)
    }
    return order.map { year in
      let yearRows = grouped[year] ?? []
      return YearSection(year: year, net: yearRows.map(\.net).saturatingSum(), rows: yearRows)
    }
  }

  static func isCurrentPeriod(_ key: String, interval: ReportInterval, today: String) -> Bool {
    periodKey(for: today, interval: interval) == key
  }

  static func filterLine(accountCount: Int, categoryCount: Int) -> String? {
    var parts: [String] = []
    if accountCount > 0 {
      parts.append("\(accountCount) account\(accountCount == 1 ? "" : "s")")
    }
    if categoryCount > 0 {
      parts.append("\(categoryCount) categor\(categoryCount == 1 ? "y" : "ies")")
    }
    guard !parts.isEmpty else {
      return nil
    }
    return parts.joined(separator: " · ")
  }

  /// One scale for every row's income and spending bars, so the bars compare
  /// across periods rather than each row filling its own width.
  static func barScale(rows: [PeriodRow]) -> Int {
    max(1, rows.map(\.income).max() ?? 0, rows.map { abs($0.spending) }.max() ?? 0)
  }

  /// The line under an empty tab: the period by its real span, with
  /// "so far" when it is still running. The tab's title says which side.
  static func emptyTabDescription(title: PeriodTitle) -> String {
    title.soFar ? "Nothing in \(title.text) so far." : "Nothing in \(title.text)."
  }

  static func txnShareLabel(count: Int, share: Double) -> String {
    let percent = share * 100
    let shareText = percent > 0 && percent < 1 ? "< 1%" : "\(Int(percent.rounded()))%"
    return "\(count == 1 ? "1 txn" : "\(count) txns") · \(shareText)"
  }

  static func voiceOverRowLabel(
    period: String,
    income: String,
    spending: String,
    net: String,
    savings: String?,
    destination: String
  ) -> String {
    let rate = savings.map { ", \($0)" } ?? ""
    return "\(period), income \(income), spending \(spending), net \(net)\(rate). Opens \(destination)."
  }

  static func enumeratePeriods(from: String, to: String, interval: ReportInterval) -> [(key: String, from: String, to: String)] {
    var results: [(key: String, from: String, to: String)] = []
    var cursor: String? = from
    var current: (key: String, from: String, to: String)?
    while let day = cursor, day <= to {
      let key = periodKey(for: day, interval: interval)
      if current?.key != key {
        if let current {
          results.append(current)
        }
        current = (key, day, day)
      } else {
        current?.to = day
      }
      cursor = nextISODate(day)
    }
    if let current {
      results.append(current)
    }
    return results
  }

  static func periodKey(for isoDate: String, interval: ReportInterval) -> String {
    switch interval {
    case .day:
      return isoDate
    case .month:
      return String(isoDate.prefix(7))
    case .year:
      return String(isoDate.prefix(4))
    case .week:
      return sqliteWeekKey(for: isoDate) ?? isoDate
    }
  }

  /// Monday-first week number matching SQLite `strftime('%Y-W%W', date)`.
  static func sqliteWeekKey(for isoDate: String) -> String? {
    guard let parts = parseISO(isoDate) else {
      return nil
    }
    let dayOfYear = ordinalDay(year: parts.year, month: parts.month, day: parts.day) - 1
    let jan1Weekday = weekdaySundayZero(year: parts.year, month: 1, day: 1)
    // SQLite: (yday + 7 - mondayBasedWeekday) / 7, so the first Monday starts W01.
    let mondayBased = (jan1Weekday + 6 + dayOfYear) % 7
    let week = (dayOfYear + 7 - mondayBased) / 7
    return String(format: "%04d-W%02d", parts.year, week)
  }

  static func nextISODate(_ iso: String) -> String? {
    guard let parts = parseISO(iso) else {
      return nil
    }
    var year = parts.year
    var month = parts.month
    var day = parts.day + 1
    let dim = daysInMonth(year: year, month: month)
    if day > dim {
      day = 1
      month += 1
    }
    if month > 12 {
      month = 1
      year += 1
    }
    return String(format: "%04d-%02d-%02d", year, month, day)
  }
}

private extension IncomeVsSpendingMaths {
  static func row(from period: IncomeVsSpendingPeriod, interval: ReportInterval) -> PeriodRow {
    let bounds = inferredBounds(of: period.period, interval: interval)
    return PeriodRow(
      period: period.period,
      from: bounds.from,
      to: bounds.to,
      income: period.income,
      spending: period.spending,
      net: period.net,
      isEmpty: period.income == 0 && period.spending == 0
    )
  }

  static func inferredStart(of period: String, interval: ReportInterval) -> String? {
    inferredBounds(of: period, interval: interval).from
  }

  static func inferredEnd(of period: String, interval: ReportInterval) -> String? {
    inferredBounds(of: period, interval: interval).to
  }

  static func inferredBounds(of period: String, interval: ReportInterval) -> (from: String, to: String) {
    switch interval {
    case .day:
      return (period, period)
    case .month:
      if let month = yearMonth(from: period) {
        let from = String(format: "%04d-%02d-01", month.year, month.month)
        let to = String(format: "%04d-%02d-%02d", month.year, month.month, daysInMonth(year: month.year, month: month.month))
        return (from, to)
      }
    case .year:
      if let year = Int(period) {
        return (String(format: "%04d-01-01", year), String(format: "%04d-12-31", year))
      }
    case .week:
      if let year = Int(period.prefix(4)), period.contains("W") {
        let start = String(format: "%04d-01-01", year)
        let end = String(format: "%04d-12-31", year)
        if let match = enumeratePeriods(from: start, to: end, interval: .week).first(where: { $0.key == period }) {
          return (match.from, match.to)
        }
      }
    }
    return (period, period)
  }

  static func yearMonth(from raw: String) -> (year: Int, month: Int)? {
    let parts = raw.split(separator: "-")
    guard parts.count == 2, !parts[1].hasPrefix("W"),
          let year = Int(parts[0]), let month = Int(parts[1]),
          (1 ... 12).contains(month) else {
      return nil
    }
    return (year, month)
  }

  static func parseISO(_ iso: String) -> (year: Int, month: Int, day: Int)? {
    let parts = iso.split(separator: "-")
    guard parts.count == 3,
          let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]) else {
      return nil
    }
    return (year, month, day)
  }

  static func daysInMonth(year: Int, month: Int) -> Int {
    let lengths = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    if month == 2, isLeapYear(year) {
      return 29
    }
    return lengths[month]
  }

  static func isLeapYear(_ year: Int) -> Bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
  }

  /// Days since 1970-01-01 for a proleptic Gregorian date (Hinnant's
  /// days_from_civil), so two ISO dates can be subtracted without a Calendar.
  static func civilDay(year: Int, month: Int, day: Int) -> Int {
    let shiftedYear = month <= 2 ? year - 1 : year
    let era = (shiftedYear >= 0 ? shiftedYear : shiftedYear - 399) / 400
    let yearOfEra = shiftedYear - era * 400
    let dayOfYear = (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5 + day - 1
    let dayOfEra = yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear
    return era * 146_097 + dayOfEra - 719_468
  }

  static func ordinalDay(year: Int, month: Int, day: Int) -> Int {
    let lengths = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    var total = day
    if month > 1 {
      for prior in 1 ..< month {
        total += lengths[prior]
      }
    }
    if month > 2, isLeapYear(year) {
      total += 1
    }
    return total
  }

  /// Sakamoto: 0 = Sunday.
  static func weekdaySundayZero(year: Int, month: Int, day: Int) -> Int {
    let table = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]
    var y = year
    if month < 3 {
      y -= 1
    }
    return (y + y / 4 - y / 100 + y / 400 + table[month - 1] + day) % 7
  }

  /// Period keys are Gregorian, so month names come from a Gregorian calendar
  /// in the device's language, whatever calendar the device otherwise uses.
  static let gregorian: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.locale = .current
    return calendar
  }()

  static func shortMonthSymbol(_ month: Int) -> String {
    gregorian.shortMonthSymbols[month - 1]
  }
}
