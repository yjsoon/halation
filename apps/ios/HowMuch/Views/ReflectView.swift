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
          if let pace = monthToDate {
            ReflectCard(icon: "calendar", title: "Month to Date") {
              SpendingBreakdownDetailView()
            } content: {
              MonthToDateSummary(pace: pace, currencyFormat: model.currencyFormat)
            }
          }

          // Two columns on a regular-width iPad, in a Grid so each row's
          // cards share the taller one's height instead of floating at
          // their own sizes.
          if horizontalSizeClass == .regular {
            Grid(horizontalSpacing: 12, verticalSpacing: 12) {
              GridRow {
                spendingCard
                incomeCard
              }
              GridRow {
                netWorthCard
                ageCard
              }
            }
          } else {
            VStack(spacing: 12) {
              spendingCard
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

  private var spendingCard: some View {
    ReflectCard(icon: "chart.pie.fill", title: "Spending Breakdown") {
      SpendingBreakdownDetailView()
    } content: {
      spendingContent
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
  private var spendingContent: some View {
    if let report = model.spendingBreakdown {
      let split = ReflectMaths.split(report.groups)
      let rows = model.includeQuietSpending ? split.primary + split.quiet : split.primary
      let total = rows.map { abs($0.amount) }.saturatingSum()
      VStack(alignment: .leading, spacing: 12) {
        Text(Date.now.monthYearLabel)
          .font(.subheadline)
          .foregroundStyle(.secondary)
        Text(MoneyCodec.displayString(for: total, currencyFormat: model.currencyFormat))
          .font(.title.weight(.medium))
          .monospacedDigit()
          .foregroundStyle(Theme.textPrimary)
          .rollingNumber(total)

        if !rows.isEmpty {
          StackedShareBar(segments: ReflectMaths.shareSegments(rows, limit: 5))

          HStack {
            Text("Top Categories")
            Spacer()
            Text("Spent")
          }
          .font(.caption.weight(.semibold))
          .foregroundStyle(.secondary)

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
        } else {
          Text("No spending recorded this month.")
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
      }
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

  /// Running total at the end of each day so far.
  var cumulative: [Int] {
    daily.reduce(into: [Int]()) { totals, amount in totals.append((totals.last ?? 0) + amount) }
  }

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

/// The month-to-date card's body: the month so far as a cumulative line with
/// a dashed run to month end at the current daily average.
struct MonthToDateSummary: View {
  let pace: MonthToDate
  let currencyFormat: CurrencyFormat?
  var now: Date = .now

  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  private func money(_ milliunits: Int) -> String {
    MoneyCodec.displayString(for: milliunits, currencyFormat: currencyFormat)
  }

  private var monthName: String { now.formatted(.dateTime.month(.wide)) }

  private var monthEndLabel: String {
    now.endOfMonth().formatted(.dateTime.day().month(.abbreviated))
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .center, spacing: 12) {
        VStack(alignment: .leading, spacing: 2) {
          Text("Spent in \(monthName)")
            .font(.caption)
            .foregroundStyle(.secondary)
          Text(money(pace.total))
            .font(.title.weight(.medium))
            .monospacedDigit()
            .foregroundStyle(Theme.textPrimary)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .rollingNumber(pace.total)
        }
        Spacer(minLength: 0)
        MonthProgressRing(day: pace.day, daysInMonth: pace.daysInMonth)
      }

      MonthToDateChart(pace: pace)
        .frame(height: dynamicTypeSize.isAccessibilitySize ? 80 : 96)
        .accessibilityHidden(true)

      stats
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(accessibilitySummary)
  }

  @ViewBuilder
  private var stats: some View {
    if dynamicTypeSize.isAccessibilitySize {
      VStack(alignment: .leading, spacing: 10) { statColumns }
    } else {
      ViewThatFits(in: .horizontal) {
        HStack(alignment: .top, spacing: 12) { statColumns }
        VStack(alignment: .leading, spacing: 10) { statColumns }
      }
    }
  }

  @ViewBuilder
  private var statColumns: some View {
    stat("Today", money(pace.today))
    stat("Per day", money(pace.average)) {
      averageChange
    }
    stat("On track for", money(pace.projection)) {
      Text("by \(monthEndLabel)")
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }

  @ViewBuilder
  private var averageChange: some View {
    if let yesterday = pace.yesterdayAverage {
      let delta = pace.average - yesterday
      if delta == 0 {
        Text("Same as yesterday")
          .font(.caption)
          .foregroundStyle(.secondary)
      } else {
        HStack(spacing: 3) {
          Image(systemName: delta > 0 ? "arrow.up.right" : "arrow.down.right")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(delta > 0 ? Theme.outflow : Theme.inflow)
          Text("\(money(abs(delta))) on yesterday")
            .font(.caption)
            .foregroundStyle(.secondary)
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        }
      }
    }
  }

  private func stat(_ label: String, _ value: String) -> some View {
    stat(label, value) { EmptyView() }
  }

  private func stat(_ label: String, _ value: String, @ViewBuilder detail: () -> some View) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(label)
        .font(.caption)
        .foregroundStyle(.secondary)
      Text(value)
        .font(.subheadline.weight(.medium))
        .monospacedDigit()
        .foregroundStyle(Theme.textPrimary)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
      detail()
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var accessibilitySummary: String {
    var parts = [
      "Day \(pace.day) of \(pace.daysInMonth)",
      "Spent \(money(pace.total)) in \(monthName), \(money(pace.today)) today",
      "Averaging \(money(pace.average)) a day",
    ]
    if let yesterday = pace.yesterdayAverage, yesterday != pace.average {
      let delta = pace.average - yesterday
      parts.append("\(delta > 0 ? "up" : "down") \(money(abs(delta))) on yesterday")
    }
    parts.append("On track for \(money(pace.projection)) by \(monthEndLabel)")
    return parts.joined(separator: ". ")
  }
}

/// A ring that fills as the month goes by, with today's date in the middle.
private struct MonthProgressRing: View {
  let day: Int
  let daysInMonth: Int

  @ScaledMetric(relativeTo: .body) private var diameter: CGFloat = 46

  var body: some View {
    ZStack {
      Circle()
        .stroke(Theme.surfaceMuted, lineWidth: 4)
      Circle()
        .trim(from: 0, to: CGFloat(day) / CGFloat(max(daysInMonth, 1)))
        .stroke(Theme.accent, style: StrokeStyle(lineWidth: 4, lineCap: .round))
        .rotationEffect(.degrees(-90))
      VStack(spacing: -2) {
        Text("\(day)")
          .font(.subheadline.weight(.medium))
          .monospacedDigit()
          .foregroundStyle(Theme.textPrimary)
        Text("of \(daysInMonth)")
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
    .frame(width: diameter, height: diameter)
  }
}

/// Cumulative spend to today, then a dashed line to month end at the
/// current daily average. Three x ticks (the 1st, today, month end) and the
/// two labelled amounts carry the scale.
private struct MonthToDateChart: View {
  let pace: MonthToDate

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var progress: CGFloat = 0

  var body: some View {
    GeometryReader { proxy in
      let size = proxy.size
      let labelHeight: CGFloat = 16
      let plot = CGRect(x: 0, y: 4, width: size.width, height: max(size.height - labelHeight - 4, 1))
      let totals = pace.cumulative
      let top = Double(max(pace.projection, pace.total, 1))
      // Day d sits at the end of its own column: day 0 is the month's start.
      let point = { (day: Int, amount: Int) -> CGPoint in
        CGPoint(
          x: plot.minX + plot.width * CGFloat(day) / CGFloat(pace.daysInMonth),
          y: plot.maxY - plot.height * CGFloat(Double(amount) / top)
        )
      }
      let actual = [point(0, 0)] + totals.enumerated().map { point($0.offset + 1, $0.element) }
      let todayPoint = actual.last ?? point(0, 0)
      let endPoint = point(pace.daysInMonth, pace.projection)

      ZStack(alignment: .topLeading) {
        // Baseline.
        Path { path in
          path.move(to: CGPoint(x: plot.minX, y: plot.maxY))
          path.addLine(to: CGPoint(x: plot.maxX, y: plot.maxY))
        }
        .stroke(Theme.surfaceMuted, lineWidth: 1)

        // Today's hairline.
        Path { path in
          path.move(to: CGPoint(x: todayPoint.x, y: plot.minY))
          path.addLine(to: CGPoint(x: todayPoint.x, y: plot.maxY))
        }
        .stroke(Color.secondary.opacity(0.25), lineWidth: 1)

        Group {
          Path { path in
            path.move(to: CGPoint(x: plot.minX, y: plot.maxY))
            for p in actual { path.addLine(to: p) }
            path.addLine(to: CGPoint(x: todayPoint.x, y: plot.maxY))
            path.closeSubpath()
          }
          .fill(
            LinearGradient(
              colors: [Theme.accent.opacity(0.28), Theme.accent.opacity(0.04)],
              startPoint: .top,
              endPoint: .bottom
            )
          )

          Path { path in
            path.move(to: actual[0])
            for p in actual.dropFirst() { path.addLine(to: p) }
          }
          .stroke(Theme.accent, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
        }
        .mask(alignment: .leading) {
          Rectangle().frame(width: max(size.width * progress, 0.1))
        }

        if pace.day < pace.daysInMonth {
          Path { path in
            path.move(to: todayPoint)
            path.addLine(to: endPoint)
          }
          .stroke(Color.secondary.opacity(0.7), style: StrokeStyle(lineWidth: 1.5, lineCap: .round, dash: [3, 4]))
          .opacity(Double(progress))

          Circle()
            .strokeBorder(Color.secondary.opacity(0.7), lineWidth: 1.5)
            .background(Circle().fill(Theme.card))
            .frame(width: 7, height: 7)
            .position(endPoint)
            .opacity(Double(progress))
        }

        Circle()
          .fill(Theme.accent)
          .overlay(Circle().stroke(Theme.card, lineWidth: 2))
          .frame(width: 9, height: 9)
          .position(todayPoint)
          .opacity(Double(progress))

        HStack {
          axisLabel("1")
          Spacer()
          axisLabel("\(pace.daysInMonth)")
        }
        .frame(width: size.width, height: labelHeight)
        .offset(y: size.height - labelHeight)
        if pace.day > 3, pace.day < pace.daysInMonth - 3 {
          axisLabel("Today")
            .position(x: todayPoint.x, y: size.height - labelHeight / 2)
        }
      }
    }
    .onAppear {
      guard progress < 1 else { return }
      if reduceMotion {
        progress = 1
      } else {
        withAnimation(Theme.Motion.chart) { progress = 1 }
      }
    }
  }

  private func axisLabel(_ text: String) -> some View {
    Text(text)
      .font(.caption2)
      .foregroundStyle(.secondary)
      .monospacedDigit()
      .fixedSize()
  }
}
