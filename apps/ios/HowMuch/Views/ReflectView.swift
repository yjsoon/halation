import SwiftUI

struct ReflectView: View {
  @Environment(AppModel.self) private var model
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        if model.spendingBreakdown == nil, model.reportsPhase != .loaded {
          PhasePlaceholder(phase: model.reportsPhase) {
            await model.refreshReportsIfNeeded(force: true)
          }
        } else {
          // Reports from the cache or an earlier load stay up when a refresh
          // fails; say so, as Rewards does, rather than pass them off as fresh.
          if let message = model.reportsStaleMessage {
            Label(message, systemImage: "wifi.exclamationmark")
              .font(.footnote)
              .foregroundStyle(Theme.rowSecondary)
          }
          // Full width above the grid so it leads on iPad too.
          monthCard

          // Two columns on a regular-width iPad, in a Grid so each row's
          // cards share the taller one's height instead of floating at
          // their own sizes.
          if horizontalSizeClass == .regular {
            Grid(horizontalSpacing: 12, verticalSpacing: 12) {
              GridRow {
                incomeCard
                netWorthCard
              }
              GridRow {
                ageCard
                  .gridCellColumns(2)
              }
            }
          } else {
            VStack(spacing: 12) {
              incomeCard
              netWorthCard
              ageCard
            }
          }
        }
      }
      .padding(.horizontal, 16)
      .padding(.bottom, 24)
      .animation(Theme.Motion.arrive, value: model.reportsPhase)
    }
    .background(Theme.canvas)
    .navigationTitle("Reflect")
    .navigationBarTitleDisplayMode(.large)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        DestinationsMenu()
      }
    }
    // Reports are not fetched on launch (#180). This runs when Reflect
    // appears and whenever a local write marks them stale; the model skips the
    // fetch when neither the plan cursor nor this device's writes have moved.
    .task(id: model.reportsRefreshGeneration) {
      await model.refreshReportsIfNeeded()
    }
    .refreshable {
      await model.refresh(slices: TabRefresh.reflect, quiet: false, force: true)
    }
  }

  /// Month to date and the spending breakdown in one card: both are this
  /// month's spending and open the same detail screen, so the total shows once.
  private var monthCard: some View {
    ReflectCard(icon: "calendar", title: "Month to Date") {
      SpendingBreakdownDetailView()
    } content: {
      monthContent
    }
  }

  private var incomeCard: some View {
    ReflectCard(icon: "arrow.left.arrow.right", title: "Income vs Spending") {
      IncomeVsSpendingDetailView()
    } content: {
      incomeContent
    }
  }

  private var netWorthCard: some View {
    ReflectCard(icon: "building.columns.fill", title: "Net Worth") {
      NetWorthDetailView()
    } content: {
      netWorthContent
    }
  }

  private var ageCard: some View {
    ReflectCard(icon: "clock.fill", title: "Age of Money") {
      AgeOfMoneyDetailView()
    } content: {
      ageContent
    }
  }

  private var monthToDate: MonthToDate? {
    model.dailySpending.flatMap { MonthToDate($0, includeQuiet: model.includeQuietSpending, now: .now) }
  }

  @ViewBuilder
  private var monthContent: some View {
    if let report = model.spendingBreakdown {
      let split = ReflectMaths.split(report.groups)
      let rows = model.includeQuietSpending ? split.primary + split.quiet : split.primary
      if let pace = monthToDate {
        // Side by side when an iPad gives the card the room.
        if horizontalSizeClass == .regular, !dynamicTypeSize.isAccessibilitySize {
          HStack(alignment: .top, spacing: 24) {
            MonthToDateSummary(pace: pace, currencyFormat: model.currencyFormat)
            Divider()
            categories(rows)
          }
        } else {
          VStack(alignment: .leading, spacing: 16) {
            MonthToDateSummary(pace: pace, currencyFormat: model.currencyFormat)
            Divider()
            categories(rows)
          }
        }
      } else {
        // No daily figures for this month: the app stayed open past month
        // end, say. Show the breakdown with its own total, labelled with the
        // month it was fetched for rather than the new one.
        let total = rows.map { abs($0.amount) }.saturatingSum()
        VStack(alignment: .leading, spacing: 12) {
          Text(model.dailySpending.map { LedgerDate.periodLabel(String($0.monthStart.prefix(7))) } ?? Date.now.monthYearLabel)
            .font(.subheadline)
            .foregroundStyle(.secondary)
          Text(MoneyCodec.displayString(for: total, currencyFormat: model.currencyFormat))
            .font(.title.weight(.medium))
            .monospacedDigit()
            .foregroundStyle(Theme.textPrimary)
            .rollingNumber(total)
          categories(rows)
        }
      }
    }
  }

  @ViewBuilder
  private func categories(_ rows: [SpendingBreakdownGroup]) -> some View {
    if !rows.isEmpty {
      VStack(alignment: .leading, spacing: 12) {
        StackedShareBar(segments: ReflectMaths.shareSegments(rows, limit: 5))

        HStack {
          Text("Top Categories")
          Spacer()
          Text("Spent")
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)

        VStack(spacing: 8) {
          ForEach(rows.prefix(5).enumerated(), id: \.element.id) { index, group in
            HStack(spacing: 8) {
              Circle()
                .fill(Theme.chartColour(index))
                .frame(width: 8, height: 8)
              Text(group.categoryName)
                .font(.subheadline)
                .foregroundStyle(Theme.textPrimary)
                .lineLimit(1)
              Spacer()
              Text(MoneyCodec.displayString(for: abs(group.amount), currencyFormat: model.currencyFormat))
                .font(.subheadline)
                .monospacedDigit()
                .foregroundStyle(Theme.textPrimary)
            }
          }
          if rows.count > 5 {
            let remainder = rows.dropFirst(5).map { abs($0.amount) }.saturatingSum()
            HStack(spacing: 8) {
              Circle()
                .fill(Color.secondary.opacity(0.4))
                .frame(width: 8, height: 8)
              Text("All Others")
                .font(.subheadline)
                .foregroundStyle(.secondary)
              Spacer()
              Text(MoneyCodec.displayString(for: remainder, currencyFormat: model.currencyFormat))
                .font(.subheadline)
                .monospacedDigit()
                .foregroundStyle(.secondary)
            }
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    } else {
      Text("No spending recorded this month.")
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  @ViewBuilder
  private var netWorthContent: some View {
    if let report = model.netWorth, let latest = report.periods.last {
      let assets = latest.accounts.map(\.balance).filter { $0 > 0 }.saturatingSum()
      let debts = latest.accounts.map(\.balance).filter { $0 < 0 }.saturatingSum()
      VStack(alignment: .leading, spacing: 12) {
        Text(MoneyCodec.displayString(for: latest.netWorth, currencyFormat: model.currencyFormat))
          .font(.title.weight(.medium))
          .monospacedDigit()
          .foregroundStyle(Theme.textPrimary)
          .rollingNumber(latest.netWorth)

        HStack {
          Text("Assets")
            .foregroundStyle(Theme.accent)
          Spacer()
          Text(MoneyCodec.displayString(for: assets, currencyFormat: model.currencyFormat))
            .monospacedDigit()
            .foregroundStyle(Theme.textPrimary)
        }
        .font(.subheadline)
        HStack {
          Text("Debts")
            .foregroundStyle(Theme.outflow)
          Spacer()
          Text(MoneyCodec.displayString(for: debts, currencyFormat: model.currencyFormat))
            .monospacedDigit()
            .foregroundStyle(Theme.textPrimary)
        }
        .font(.subheadline)

        ColumnChart(
          values: report.periods.map { Double($0.netWorth) },
          labels: LedgerDate.periodAxisLabels(report.periods.map(\.period)),
          voice: .money("Net worth", periods: report.periods.map(\.period), currencyFormat: model.currencyFormat)
        )
      }
    }
  }

  @ViewBuilder
  private var incomeContent: some View {
    if let report = model.incomeVsSpending {
      let now = Date.now
      let year = Calendar.current.component(.year, from: now)
      let monthKey = IncomeVsSpendingMaths.currentMonthKey(from: now)
      let monthNet = report.periods.first { $0.period == monthKey }?.net ?? 0
      let monthActive = IncomeVsSpendingMaths.hasActivity(periods: report.periods, matching: monthKey)
      let yearNet = IncomeVsSpendingMaths.yearToDateNet(periods: report.periods, year: year)
      let yearActive = IncomeVsSpendingMaths.hasActivity(periods: report.periods, matching: String(year))
      VStack(alignment: .leading, spacing: 12) {
        headlinePair(
          monthName: IncomeVsSpendingMaths.monthName(from: now),
          monthNet: monthNet,
          monthActive: monthActive,
          year: year,
          yearNet: yearNet,
          yearActive: yearActive
        )

        if !report.periods.isEmpty {
          PairedColumnChart(
            pairs: report.periods.map { (Double($0.income), Double(abs($0.spending))) },
            labels: LedgerDate.periodAxisLabels(report.periods.map(\.period)),
            voice: .money(
              "Income and spending",
              periods: report.periods.map(\.period),
              currencyFormat: model.currencyFormat
            ),
            height: 90
          )
        }

        HStack(spacing: 16) {
          legendDot(colour: Theme.inflow, label: "Income")
          legendDot(colour: Theme.outflow, label: "Spending")
        }
      }
    }
  }

  @ViewBuilder
  private func headlinePair(
    monthName: String,
    monthNet: Int,
    monthActive: Bool,
    year: Int,
    yearNet: Int,
    yearActive: Bool
  ) -> some View {
    let stacked = dynamicTypeSize.isAccessibilitySize
    let pair = (monthName, monthNet, monthActive, year, yearNet, yearActive)
    Group {
      if stacked {
        VStack(alignment: .leading, spacing: 12) {
          headlineStat(label: "Net in \(pair.0)", net: pair.1, hasActivity: pair.2)
          headlineStat(label: "Net in \(pair.3) so far", net: pair.4, hasActivity: pair.5)
        }
      } else {
        ViewThatFits(in: .horizontal) {
          HStack(alignment: .top, spacing: 12) {
            headlineStat(label: "Net in \(pair.0)", net: pair.1, hasActivity: pair.2)
            headlineStat(label: "Net in \(pair.3) so far", net: pair.4, hasActivity: pair.5)
          }
          VStack(alignment: .leading, spacing: 12) {
            headlineStat(label: "Net in \(pair.0)", net: pair.1, hasActivity: pair.2)
            headlineStat(label: "Net in \(pair.3) so far", net: pair.4, hasActivity: pair.5)
          }
        }
      }
    }
  }

  private func headlineStat(label: String, net: Int, hasActivity: Bool) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(label)
        .font(.caption)
        .foregroundStyle(.secondary)
      Text(MoneyCodec.signedDisplayString(for: net, currencyFormat: model.currencyFormat))
        .font(.title.weight(.medium))
        .monospacedDigit()
        .foregroundStyle(Theme.signedReportColour(net))
        .rollingNumber(net)
      if !hasActivity {
        Text("No activity yet")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  @ViewBuilder
  private var ageContent: some View {
    if let report = model.ageOfMoney {
      let measured = report.periods.filter { $0.ageOfMoneyDays != nil }
      let ages = measured.compactMap(\.ageOfMoneyDays)
      VStack(alignment: .leading, spacing: 12) {
        if let latest = ages.last {
          Text(ReflectMaths.daysLabel(Int(latest.rounded()), capitalised: true))
            .font(.title.weight(.medium))
            .monospacedDigit()
            .foregroundStyle(Theme.textPrimary)
            .rollingNumber(Int(latest.rounded()))
        } else {
          Text("Not enough data yet")
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        if ages.count > 1 {
          Sparkline(
            values: ages,
            voice: .days("Age of money", periods: measured.map(\.period)),
            colour: Theme.inflow
          )
        }
      }
    }
  }

  private func legendDot(colour: Color, label: String) -> some View {
    HStack(spacing: 5) {
      Circle()
        .fill(colour)
        .frame(width: 8, height: 8)
      Text(label)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }
}

struct ReflectCard<Destination: View, Content: View>: View {
  let icon: String
  let title: String
  @ViewBuilder let destination: () -> Destination
  @ViewBuilder let content: () -> Content

  var body: some View {
    NavigationLink {
      destination()
    } label: {
      VStack(alignment: .leading, spacing: 12) {
        HStack {
          Label {
            Text(title)
              .font(.subheadline.weight(.semibold))
          } icon: {
            Image(systemName: icon)
              .font(.subheadline)
          }
          Spacer()
          Image(systemName: "chevron.forward")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.tertiary)
            .accessibilityHidden(true)
        }
        .foregroundStyle(Theme.accent)

        content()
      }
      .padding(16)
      // Fill the row's height in the iPad grid, content pinned to the top.
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .ynabCard()
      .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
    }
    .buttonStyle(.pressable)
  }
}

/// Orders a Reflect detail screen's report fetches so only the latest may
/// commit. `.task(id:)` cancels a fetch superseded by a filter change, but
/// Retry runs in its own `Task` that nothing cancels, so cancellation alone
/// cannot tell an obsolete request from the current one. A generation rather
/// than a filter key also rejects the first of two requests for the same
/// filter (A → B → A). A superseded or cancelled fetch must not overwrite or
/// clear the current report, nor flash an error, so `mayCommit` is the one
/// check a fetch makes before touching the screen.
struct ReportFetchGate {
  private(set) var generation = 0

  mutating func begin() -> Int {
    generation += 1
    return generation
  }

  func isCurrent(_ token: Int) -> Bool {
    token == generation
  }

  /// True only while `token` is the latest request and the calling task has
  /// not been cancelled.
  func mayCommit(_ token: Int) -> Bool {
    isCurrent(token) && !Task.isCancelled
  }
}

struct SpendingGroupSection: Identifiable {
  let id: String
  let name: String
  var amount: Int
  var rows: [SpendingBreakdownGroup]
}

extension ChartVoice {
  /// A chart of amounts in milliunits, one per report period key.
  static func money(_ name: String, periods: [String], currencyFormat: CurrencyFormat?) -> ChartVoice {
    ChartVoice(name: name, unit: "Amount", periodNames: periods.map(LedgerDate.spokenPeriodLabel)) {
      MoneyCodec.displayString(for: Int($0.rounded()), currencyFormat: currencyFormat)
    }
  }

  /// A chart of age of money in days, one per report period key.
  static func days(_ name: String, periods: [String]) -> ChartVoice {
    ChartVoice(name: name, unit: "Days", periodNames: periods.map(LedgerDate.spokenPeriodLabel)) {
      ReflectMaths.daysLabel(Int($0.rounded()))
    }
  }
}

enum ReflectMaths {
  /// "1 day" / "12 days", or "1 Day" / "12 Days" for headlines.
  static func daysLabel(_ days: Int, capitalised: Bool = false) -> String {
    let singular = abs(days) == 1
    let unit = capitalised ? (singular ? "Day" : "Days") : (singular ? "day" : "days")
    return "\(days) \(unit)"
  }

  /// Shared empty state for a report window with nothing to show.
  @MainActor
  static func emptyRange(title: String, systemImage: String) -> some View {
    ContentUnavailableView(
      title,
      systemImage: systemImage,
      description: Text("Adjust the dates or clear filters to show more transactions.")
    )
  }

  static func split(_ groups: [SpendingBreakdownGroup]) -> (primary: [SpendingBreakdownGroup], quiet: [SpendingBreakdownGroup]) {
    let primary = groups.filter { !CategoryGroup.isQuietName($0.categoryGroupName) }
    let quiet = groups.filter { CategoryGroup.isQuietName($0.categoryGroupName) }
    return (primary, quiet)
  }

  static func groupSections(_ rows: [SpendingBreakdownGroup]) -> [SpendingGroupSection] {
    var order: [String] = []
    var byGroup: [String: SpendingGroupSection] = [:]
    for row in rows {
      if byGroup[row.categoryGroupID] == nil {
        order.append(row.categoryGroupID)
        byGroup[row.categoryGroupID] = SpendingGroupSection(
          id: row.categoryGroupID, name: row.categoryGroupName, amount: 0, rows: []
        )
      }
      byGroup[row.categoryGroupID]?.amount += abs(row.amount)
      byGroup[row.categoryGroupID]?.rows.append(row)
    }
    return order.compactMap { byGroup[$0] }.sorted { $0.amount > $1.amount }
  }

  static func shareSegments(_ groups: [SpendingBreakdownGroup], limit: Int) -> [(colour: Color, fraction: Double)] {
    let total = groups.reduce(0.0) { $0 + abs(Double($1.amount)) }
    guard total > 0 else {
      return []
    }
    var segments: [(colour: Color, fraction: Double)] = groups.prefix(limit).enumerated().map { index, group in
      (colour: Theme.chartColour(index), fraction: abs(Double(group.amount)) / total)
    }
    let remainder = groups.dropFirst(limit).reduce(0.0) { $0 + abs(Double($1.amount)) }
    if remainder > 0 {
      segments.append((colour: Color.secondary.opacity(0.4), fraction: remainder / total))
    }
    return segments
  }
}

/// Month-to-date spending, worked out from `DailySpending` with the same
/// quiet-group rule as the spending breakdown so the two totals agree.
struct MonthToDate: Equatable {
  /// Today's day of the month, from 1.
  let day: Int
  let daysInMonth: Int
  /// Spending on each day from the 1st to today, in milliunits.
  let daily: [Int]

  init?(_ spending: DailySpending, includeQuiet: Bool, now: Date, calendar: Calendar = .current) {
    // The app can stay open into a new month without a refetch; last
    // month's days would read as nothing spent, so show no card until then.
    guard spending.monthStart == now.startOfMonth(calendar: calendar).isoDateString,
          let days = calendar.range(of: .day, in: .month, for: now)?.count
    else { return nil }
    let all = Self.byDate(spending.all)
    let quiet = includeQuiet ? [:] : spending.quiet.map(Self.byDate) ?? [:]
    // Walk the same dates the overview requested, from this calendar's month
    // start, and key them as the server does (ISO dates). The device calendar
    // need not be Gregorian, so its day numbers are not ISO day numbers.
    var amounts: [Int] = []
    var date = now.startOfMonth(calendar: calendar)
    while date <= now, amounts.count < days {
      let key = date.isoDateString
      amounts.append(max(0, (all[key] ?? 0) - (quiet[key] ?? 0)))
      guard let next = calendar.date(byAdding: .day, value: 1, to: date) else { break }
      date = next
    }
    guard !amounts.isEmpty else { return nil }
    day = amounts.count
    daysInMonth = days
    daily = amounts
  }

  private static func byDate(_ report: IncomeVsSpendingReport) -> [String: Int] {
    Dictionary(report.periods.map { ($0.period, abs($0.spending)) }, uniquingKeysWith: +)
  }

  var today: Int { daily.last ?? 0 }
  var total: Int { daily.saturatingSum() }

  var average: Int { Self.rounded(Double(total) / Double(day)) }

  /// The average as it stood at the end of yesterday; `nil` on the 1st.
  var yesterdayAverage: Int? {
    guard day > 1 else { return nil }
    return Self.rounded(Double(total - today) / Double(day - 1))
  }

  /// The month's total if every remaining day matches the average so far.
  var projection: Int { Self.rounded(Double(total) / Double(day) * Double(daysInMonth)) }

  /// Milliunits round to whole cents, as the server stores them.
  private static func rounded(_ milliunits: Double) -> Int {
    Int((milliunits / 10).rounded()) * 10
  }
}

/// The month-to-date card's body, in the shape of a daily summary: day of
/// the month, today, the month so far, the daily average then and yesterday,
/// and where the month ends at that pace.
struct MonthToDateSummary: View {
  let pace: MonthToDate
  let currencyFormat: CurrencyFormat?
  var now: Date = .now

  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  private func money(_ milliunits: Int) -> String {
    MoneyCodec.displayString(for: milliunits, currencyFormat: currencyFormat)
  }

  private var monthName: String { now.formatted(.dateTime.month(.wide)) }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      line("📅", "Day \(pace.day) of \(pace.daysInMonth)", nil)
      line("💸", "Spent today", money(pace.today))
      line("💰", "Spent this month", money(pace.total), emphasised: true)
      line("📊", "Daily average", "\(money(pace.average))/day")
      if let yesterday = pace.yesterdayAverage {
        line(pace.average > yesterday ? "📈" : "📉", "Yesterday's average", "\(money(yesterday))/day")
      }
      line("🎯", "Month projection", money(pace.projection))
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(accessibilitySummary)
  }

  @ViewBuilder
  private func line(_ emoji: String, _ label: String, _ value: String?, emphasised: Bool = false) -> some View {
    let labelText = HStack(alignment: .firstTextBaseline, spacing: 8) {
      Text(emoji)
        .frame(minWidth: 22, alignment: .leading)
      Text(label)
        .foregroundStyle(value == nil ? Theme.textPrimary : .secondary)
    }
    let valueText = value.map {
      Text($0)
        .fontWeight(emphasised ? .semibold : .regular)
        .monospacedDigit()
        .foregroundStyle(Theme.textPrimary)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
    Group {
      if dynamicTypeSize.isAccessibilitySize {
        VStack(alignment: .leading, spacing: 2) {
          labelText
          valueText
        }
      } else {
        HStack(alignment: .firstTextBaseline) {
          labelText
          Spacer(minLength: 8)
          valueText
        }
      }
    }
    .font(emphasised ? .body : .subheadline)
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var accessibilitySummary: String {
    var parts = [
      "Day \(pace.day) of \(pace.daysInMonth)",
      "Spent \(money(pace.today)) today, \(money(pace.total)) in \(monthName)",
      "Averaging \(money(pace.average)) a day",
    ]
    if let yesterday = pace.yesterdayAverage {
      parts.append("\(money(yesterday)) a day yesterday")
    }
    parts.append("Month projection \(money(pace.projection))")
    return parts.joined(separator: ". ")
  }
}
