import SwiftUI

// Skyline, the Rewards board's layout: rows sized by urgency, cards that open in place onto a detail
// slip, and a quiet sky behind the title. The rows themselves are `RewardFilledRow`; this file holds
// the sky, the period's day rail and the slip.

/// The board's scroll position, kept out of `RewardsView`'s own state so that scrolling redraws the sky
/// alone and never rebuilds the board.
@MainActor
@Observable
final class RewardsSkyScroll {
  var offset: CGFloat = 0
}

/// A backdrop, not data: the rows' sky continued up behind the status bar, the large title and the
/// summary, dissolving into the canvas. It scrolls away with the content.
struct RewardsSky: View {
  let scroll: RewardsSkyScroll

  static let height: CGFloat = 190

  var body: some View {
    let offset = min(max(scroll.offset, 0), Self.height)
    let sky = Theme.Face.skyCashback
    ZStack {
      LinearGradient(
        stops: [
          .init(color: sky[0].opacity(0.55), location: 0),
          .init(color: sky[1].opacity(0.4), location: 0.42),
          .init(color: sky[2].opacity(0.25), location: 0.72),
          .init(color: sky[2].opacity(0), location: 1),
        ],
        startPoint: .top, endPoint: .bottom)
      // Where a sun would stand: a glow, never a disc.
      RadialGradient(
        colors: [Theme.Face.sunCore.opacity(0.28), Theme.Face.sunCore.opacity(0)],
        center: UnitPoint(x: 0.82, y: 0.42), startRadius: 0, endRadius: 110)
    }
    .frame(height: Self.height)
    .offset(y: -offset)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }
}

/// The period as a rail of days: a tick for each day, the elapsed part filled, a marker on the day the
/// minimum was met and the sun at the as-of day. `compact` is the iPad statement's short rail with no ticks.
struct RewardPeriodRail: View {
  enum Style {
    case full
    case compact
  }

  let position: RewardRowProjection.PeriodPosition
  var style: Style = .full

  @State private var railWidth: CGFloat = 0
  @State private var startWidth: CGFloat = 0
  @State private var endWidth: CGFloat = 0
  @Environment(\.legibilityWeight) private var legibilityWeight
  private var bold: Bool { legibilityWeight == .bold }
  @State private var todayWidth: CGFloat = 0

  /// Leaves room for the sun at either end.
  private static let inset: CGFloat = 6

  var body: some View {
    Group {
      switch style {
      case .compact:
        rail(height: 12, ticks: false)
      case .full:
        VStack(alignment: .leading, spacing: 3) {
          if let met = position.metDay, let metOn = position.metOn {
            Text("min met · \(short(metOn))")
              .font(CardType.sans(.regular, CardType.size(.caption2), relativeTo: .caption2, bold: bold))
              .foregroundStyle(Theme.rowSecondary)
              .fixedSize()
              .alignmentGuide(.leading) { centred(at: x(met), width: $0.width) }
          }
          rail(height: 16, ticks: position.length <= 62)
          // Every label is measured, and an end date is hidden only when it would touch today's label,
          // so the clearance follows the text size.
          ZStack(alignment: .topLeading) {
            let today = x(position.day)
            let todayLeft = -centred(at: today, width: todayWidth)
            label(short(position.start))
              .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { startWidth = $0 }
              .opacity(todayLeft >= startWidth + 6 ? 1 : 0)
            label(short(position.end))
              .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { endWidth = $0 }
              .alignmentGuide(.leading) { $0.width - railWidth }
              .opacity(todayLeft + todayWidth + 6 <= railWidth - endWidth ? 1 : 0)
            label("\(position.isLive ? "today" : "as of") · \(position.day)")
              .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { todayWidth = $0 }
              .alignmentGuide(.leading) { centred(at: today, width: $0.width) }
          }
        }
      }
    }
    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { railWidth = $0 }
    .accessibilityHidden(true)
  }

  private func label(_ text: String) -> some View {
    Text(text)
      .font(CardType.sans(.regular, CardType.size(.caption2), relativeTo: .caption2, bold: bold))
      .foregroundStyle(Theme.rowSecondary)
      .fixedSize()
  }

  /// A leading guide that centres a label of `width` on `x`, kept inside the rail.
  private func centred(at x: CGFloat, width: CGFloat) -> CGFloat {
    -min(max(0, x - width / 2), max(0, railWidth - width))
  }

  private func x(_ day: Int) -> CGFloat {
    Self.x(day, length: position.length, width: railWidth)
  }

  private static func x(_ day: Int, length: Int, width: CGFloat) -> CGFloat {
    let span = max(0, width - 2 * inset)
    guard length > 1 else { return inset + span / 2 }
    return inset + span * CGFloat(min(max(day, 1), length) - 1) / CGFloat(length - 1)
  }

  private func rail(height: CGFloat, ticks: Bool) -> some View {
    let position = position
    return Canvas { context, size in
      let y = size.height / 2
      let point = { (day: Int) in Self.x(day, length: position.length, width: size.width) }
      let today = point(position.day)
      var future = Path()
      future.move(to: CGPoint(x: today, y: y))
      future.addLine(to: CGPoint(x: size.width - Self.inset, y: y))
      context.stroke(future, with: .color(Theme.rowSecondary.opacity(0.4)), lineWidth: 1)
      var past = Path()
      past.move(to: CGPoint(x: Self.inset, y: y))
      past.addLine(to: CGPoint(x: today, y: y))
      context.stroke(past, with: .color(Theme.accent), style: StrokeStyle(lineWidth: 2, lineCap: .round))
      if ticks {
        for day in 1...max(1, position.length) {
          let tickX = point(day)
          let weekly = (day - 1) % 7 == 0
          let half: CGFloat = weekly ? 5 : 3
          var tick = Path()
          tick.move(to: CGPoint(x: tickX, y: y - half))
          tick.addLine(to: CGPoint(x: tickX, y: y + half))
          let ink = day <= position.day ? Theme.accent : Theme.rowSecondary.opacity(0.45)
          context.stroke(tick, with: .color(ink), lineWidth: 1)
        }
      }
      if let met = position.metDay {
        let m: CGFloat = 3.5
        let marker = Path(ellipseIn: CGRect(x: point(met) - m, y: y - m, width: 2 * m, height: 2 * m))
        context.fill(marker, with: .color(Theme.openCard))
        context.stroke(marker, with: .color(Theme.accent), lineWidth: 1.5)
      }
      let r: CGFloat = ticks ? 6 : 4.5
      let sun = Path(ellipseIn: CGRect(x: today - r, y: y - r, width: 2 * r, height: 2 * r))
      context.fill(
        sun,
        with: .linearGradient(
          Gradient(colors: [Theme.Face.sunDiscTop, Theme.Face.sunDiscBottom]),
          startPoint: CGPoint(x: today, y: y - r), endPoint: CGPoint(x: today, y: y + r)))
      context.stroke(sun, with: .color(Theme.Face.sunRim), lineWidth: 1)
    }
    .frame(height: height)
  }

  private func short(_ iso: String) -> String {
    RewardsCalendar.shortLabel(iso, referenceISO: RewardsCalendar.today())
  }
}

/// What unfolds under a board row when it is tapped: the period with its day rail, View Transactions,
/// the targets and the categories. The full detail sheet stays one step away, in the row's menu.
struct RewardCardSlip: View {
  enum Arrangement {
    /// The phone: one section under another.
    case stacked
    /// iPad portrait: Period and Targets side by side, Categories across the width under them.
    case twoColumns
    /// iPad landscape: the three sections side by side.
    case threeColumns
  }

  let row: RewardsCardRow
  let projection: RewardRowProjection
  let asOf: String?
  let currencyFormat: CurrencyFormat?
  var arrangement: Arrangement = .stacked
  /// Nil hides View Transactions.
  var onOpenAccount: (() -> Void)?

  @Environment(\.displayScale) private var displayScale
  @Environment(\.legibilityWeight) private var legibilityWeight
  private var bold: Bool { legibilityWeight == .bold }
  @Environment(\.layoutDirection) private var layoutDirection
  @ScaledMetric(relativeTo: .subheadline) private var barWidth: CGFloat = 64
  @ScaledMetric(relativeTo: .caption) private var rateWidth: CGFloat = 40

  var body: some View {
    content
      .padding(.horizontal, 16)
      .padding(.bottom, 6)
      .frame(maxWidth: .infinity, alignment: .leading)
  }

  @ViewBuilder
  private var content: some View {
    switch arrangement {
    case .stacked:
      VStack(alignment: .leading, spacing: 0) {
        periodSection
          .padding(.vertical, 12)
        if let onOpenAccount {
          rule
          transactionsLink(onOpenAccount)
            .padding(.vertical, 2)
        }
        rule
        targetsSection
          .padding(.vertical, 12)
        if hasCategories {
          rule
          categoriesSection
            .padding(.vertical, 12)
        }
      }
    case .twoColumns:
      VStack(alignment: .leading, spacing: 0) {
        HStack(alignment: .top, spacing: 20) {
          periodColumn
          columnRule
          targetsSection
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.vertical, 12)
        if hasCategories {
          rule
          categoriesSection
            .padding(.vertical, 12)
        }
      }
    case .threeColumns:
      HStack(alignment: .top, spacing: 20) {
        periodColumn
        columnRule
        targetsSection
          .frame(maxWidth: .infinity, alignment: .leading)
        if hasCategories {
          columnRule
          categoriesSection
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
      .fixedSize(horizontal: false, vertical: true)
      .padding(.vertical, 12)
    }
  }

  private var periodColumn: some View {
    VStack(alignment: .leading, spacing: 4) {
      periodSection
      if let onOpenAccount {
        rule
          .padding(.top, 8)
        transactionsLink(onOpenAccount)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var rule: some View {
    Rectangle()
      .fill(Theme.rowSecondary.opacity(0.25))
      .frame(height: 1 / displayScale)
  }

  private var columnRule: some View {
    Rectangle()
      .fill(Theme.rowSecondary.opacity(0.25))
      .frame(width: 1 / displayScale)
      .frame(maxHeight: .infinity)
  }

  private var calc: RewardsCalculation { row.calculation }

  private var hasCategories: Bool { !calc.flags.isEmpty }

  private var urgent: Color { RewardTonePalette.palette(for: .needsMinimum).ink }

  // MARK: Sections

  private func header(_ title: String, detail: String?) -> some View {
    ViewThatFits(in: .horizontal) {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        headerTitle(title)
        Spacer(minLength: 8)
        detail.map { headerDetail($0) }
      }
      VStack(alignment: .leading, spacing: 2) {
        headerTitle(title)
        detail.map { headerDetail($0) }
      }
    }
  }

  private func headerTitle(_ title: String) -> some View {
    Text(title)
      .font(.system(.title3, design: .serif))
      .foregroundStyle(Theme.textPrimary)
      .accessibilityAddTraits(.isHeader)
  }

  private func headerDetail(_ detail: String) -> Text {
    Text(detail)
      .font(CardType.mono(.regular, CardType.size(.caption), relativeTo: .caption, bold: bold))
      .foregroundStyle(Theme.rowSecondary)
  }

  private var periodSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      header("Period", detail: periodDetail)
      if let position = projection.period {
        RewardPeriodRail(position: position)
      }
      if let asOf, asOf < RewardsCalendar.today() {
        Label("Showing \(short(asOf))", systemImage: "clock.arrow.circlepath")
          .font(CardType.sans(.regular, CardType.size(.footnote), relativeTo: .footnote, bold: bold))
          .foregroundStyle(Theme.rowSecondary)
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Period")
    .accessibilityValue(spokenPeriod)
  }

  private var periodDates: (start: String, end: String)? {
    if let position = projection.period { return (position.start, position.end) }
    return calc.periods?.last.map { (start: $0.start, end: $0.end) }
  }

  private var periodDetail: String? {
    guard let dates = periodDates else { return nil }
    let span = "\(short(dates.start)) to \(short(dates.end))"
    guard let position = projection.period else { return span }
    return "\(span) · day \(position.day) of \(position.length)"
  }

  private var spokenPeriod: String {
    var parts: [String] = []
    if let dates = periodDates {
      parts.append("\(short(dates.start)) to \(short(dates.end))")
    }
    if let position = projection.period {
      parts.append("day \(position.day) of \(position.length)")
      if let metOn = position.metOn, position.metDay != nil {
        parts.append("minimum met \(short(metOn))")
      }
    }
    if let asOf, asOf < RewardsCalendar.today() {
      parts.append("showing \(short(asOf))")
    }
    return parts.joined(separator: ", ")
  }

  private func transactionsLink(_ action: @escaping () -> Void) -> some View {
    Button(action: action) {
      HStack(spacing: 8) {
        Text("View Transactions")
          .font(CardType.sans(.medium, CardType.size(.body), relativeTo: .body, bold: bold))
          .foregroundStyle(Theme.textPrimary)
        Spacer(minLength: 8)
        Image(systemName: "chevron.forward")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(Theme.rowSecondary)
          .accessibilityHidden(true)
      }
      .frame(minHeight: 44)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityHint("Opens this account's transactions.")
  }

  // MARK: Targets

  private enum TargetState {
    case met, pending, open, done, none
    /// A month that closed below its minimum: past mending, so never urgent.
    case missed
  }

  private struct Target: Identifiable {
    let id: String
    let label: String
    let amount: String?
    let state: String
    let status: TargetState
  }

  private var activeMonth: RewardsMonthlyQualification? {
    guard let asOf else { return nil }
    return calc.monthlyQualifications?.first(where: { $0.start <= asOf && asOf <= $0.end })
  }

  private var targets: [Target] {
    var list: [Target] = []
    let minimum = calc.minimumSpend ?? 0
    // A missed month forfeits the period, so nothing left to spend is urgent any more.
    let periodFailed = calc.qualificationStatus == "failed"
    if minimum > 0 {
      if calc.minimumSpendMet {
        let met = projection.period?.metOn.map { "met \(short($0))" } ?? "met"
        list.append(Target(id: "minimum", label: "Minimum", amount: money(minimum), state: met, status: .met))
      } else if calc.totalSpend >= minimum {
        // Spend has reached the figure but the server still withholds rewards: say why, without the amber.
        let state: String
        switch calc.qualificationStatus {
        case "pending"?: state = "reached, needs this month's minimum"
        case "failed"?: state = "reached, a month was missed"
        default: state = "reached"
        }
        list.append(Target(id: "minimum", label: "Minimum", amount: money(minimum), state: state, status: .open))
      } else {
        let left = RewardRowText.roundedUpToCent(minimum - calc.totalSpend)
        list.append(periodFailed
          ? Target(
            id: "minimum", label: "Minimum", amount: money(minimum),
            state: "\(money(left)) short, a month was missed", status: .open)
          : Target(
            id: "minimum", label: "Minimum", amount: money(minimum), state: "\(money(left)) to go", status: .pending))
      }
    }
    if let month = activeMonth {
      let met = month.spend >= month.minimumSpend
      let left = RewardRowText.roundedUpToCent(month.minimumSpend - month.spend)
      let state: String
      let status: TargetState
      if met {
        state = "met"
        status = .met
      } else if month.status == "failed" {
        state = "missed"
        status = .missed
      } else {
        state = "\(money(left)) to go"
        status = periodFailed ? .open : .pending
      }
      list.append(Target(
        id: "month", label: "This month", amount: money(month.minimumSpend), state: state, status: status))
    }
    if calc.hasNextSpendingTier == true, let threshold = calc.nextSpendingTierThreshold, threshold > calc.totalSpend {
      let left = RewardRowText.roundedUpToCent(threshold - calc.totalSpend)
      list.append(Target(
        id: "tier", label: "Next tier", amount: money(threshold), state: "\(money(left)) to go", status: .open))
    }
    let maximum = calc.maximumSpend ?? 0
    if maximum > 0 {
      if calc.maximumSpendExceeded {
        let beyond = RewardRowProjection.beyondCap(spend: calc.totalSpend, cap: maximum)
        let state = beyond > 0 ? "reached, \(money(beyond)) beyond" : "reached"
        list.append(Target(id: "cap", label: "Cap", amount: money(maximum), state: state, status: .done))
      } else {
        let left = max(0, maximum - calc.countedSpend)
        list.append(Target(id: "cap", label: "Cap", amount: money(maximum), state: "\(money(left)) left", status: .open))
      }
    } else {
      let categoriesCap = calc.flags.contains { ($0.maximumSpend ?? 0) > 0 }
      list.append(Target(
        id: "cap", label: "Cap", amount: nil,
        state: categoriesCap ? "none on the card, categories cap" : "none, keeps earning", status: .none))
    }
    return list
  }

  private var targetsSection: some View {
    VStack(alignment: .leading, spacing: 10) {
      header("Targets", detail: nil)
      ForEach(targets) { target in
        targetRow(target)
      }
      if calc.shouldStopUsing == true {
        Label("Consider another card", systemImage: "arrow.left.arrow.right")
          .font(CardType.sans(.semibold, CardType.size(.subheadline), relativeTo: .subheadline, bold: bold))
          .foregroundStyle(Theme.textPrimary)
      }
    }
  }

  private func targetRow(_ target: Target) -> some View {
    let symbol: String
    let ink: Color
    switch target.status {
    case .met:
      symbol = "checkmark.circle.fill"; ink = Theme.accent
    case .done:
      symbol = "checkmark.circle.fill"; ink = RewardTonePalette.palette(for: .complete).ink
    case .pending:
      symbol = "circle.dashed"; ink = urgent
    case .open, .none:
      symbol = "circle.dashed"; ink = Theme.rowSecondary
    case .missed:
      symbol = "xmark.circle"; ink = Theme.rowSecondary
    }
    let label = Text(target.label)
      .font(CardType.sans(.regular, CardType.size(.body), relativeTo: .body, bold: bold))
      .foregroundStyle(Theme.textPrimary)
    let amount = target.amount.map {
      Text($0)
        .font(CardType.mono(.medium, CardType.size(.body), relativeTo: .body, bold: bold))
        .foregroundStyle(Theme.textPrimary)
        .lineLimit(1)
        .fixedSize()
    }
    let state = Text(target.state)
      .font(CardType.sans(target.status == .pending ? .medium : .regular, CardType.size(.subheadline), relativeTo: .subheadline, bold: bold))
      .foregroundStyle(target.status == .pending ? urgent : Theme.rowSecondary)
    return HStack(alignment: .firstTextBaseline, spacing: 10) {
      Image(systemName: symbol)
        .foregroundStyle(ink)
        .accessibilityHidden(true)
      ViewThatFits(in: .horizontal) {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          label
          amount
          Spacer(minLength: 8)
          state
        }
        VStack(alignment: .leading, spacing: 2) {
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            label
            amount
          }
          state
        }
        VStack(alignment: .leading, spacing: 2) {
          label
          amount
          state
        }
      }
    }
    .accessibilityElement(children: .combine)
  }

  // MARK: Categories

  private var categoriesSection: some View {
    let earned = RewardRowText.reward(calc.rewardEarned, calc.rewardType, currencyFormat: currencyFormat)
    return VStack(alignment: .leading, spacing: 12) {
      header("Categories", detail: "\(money(calc.totalSpend)) · \(earned)")
      ForEach(RewardCategoryUsage.make(row: row)) { category in
        categoryRow(category)
      }
    }
  }

  private func categoryRow(_ category: RewardCategoryUsage) -> some View {
    let beyond = category.cap.map { RewardRowProjection.beyondCap(spend: category.spend, cap: $0) } ?? 0
    let over = beyond > 0
    let name = Text(category.flag.name)
      .font(CardType.sans(.medium, CardType.size(.subheadline), relativeTo: .subheadline, bold: bold))
      .foregroundStyle(over ? urgent : Theme.textPrimary)
    let amount = Text(money(category.spend))
      .font(CardType.mono(.medium, CardType.size(.subheadline), relativeTo: .subheadline, bold: bold))
      .foregroundStyle(over ? urgent : Theme.textPrimary)
    // Only the two figures are fixed, so a number never wraps; the bar gives way down to 24pt.
    let spent = amount
      .lineLimit(1)
      .fixedSize()
    let meter = HStack(alignment: .center, spacing: 10) {
      bar(category, over: over)
      Text(rate(category))
        .font(CardType.mono(.regular, CardType.size(.caption), relativeTo: .caption, bold: bold))
        .foregroundStyle(Theme.rowSecondary)
        .lineLimit(1)
        .fixedSize()
        .frame(minWidth: rateWidth, alignment: .trailing)
    }
    let figures = HStack(alignment: .center, spacing: 10) {
      spent
      meter
    }
    return VStack(alignment: .leading, spacing: 3) {
      ViewThatFits(in: .horizontal) {
        HStack(alignment: .center, spacing: 10) {
          name
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
          figures
            .layoutPriority(1)
        }
        VStack(alignment: .leading, spacing: 4) {
          name
            .fixedSize(horizontal: false, vertical: true)
          figures
        }
        // Accessibility sizes: the amount on its own line, the bar and rate under it.
        VStack(alignment: .leading, spacing: 4) {
          name
            .fixedSize(horizontal: false, vertical: true)
          spent
          meter
        }
      }
      if over, let cap = category.cap {
        let excess = Text(money(beyond))
          .font(CardType.mono(.medium, CardType.size(.caption), relativeTo: .caption, bold: bold))
          .foregroundStyle(urgent)
        Text("\(money(cap)) cap · \(excess) beyond")
          .font(CardType.sans(.regular, CardType.size(.caption), relativeTo: .caption, bold: bold))
          .foregroundStyle(Theme.rowSecondary)
      } else if category.excluded {
        Text("Excluded from rewards")
          .font(CardType.sans(.regular, CardType.size(.caption), relativeTo: .caption, bold: bold))
          .foregroundStyle(Theme.rowSecondary)
      }
      if !category.excluded, let minimum = category.flag.minimumSpend, minimum > 0 {
        Text("\(category.flag.minimumSpendMet == true ? "Minimum met" : "Minimum"): \(money(minimum))")
          .font(CardType.sans(.regular, CardType.size(.caption), relativeTo: .caption, bold: bold))
          .foregroundStyle(Theme.rowSecondary)
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(category.flag.name), \(money(category.spend)) spent")
    .accessibilityValue(spokenCategory(category, beyond: over ? beyond : 0))
  }

  private func bar(_ category: RewardCategoryUsage, over: Bool) -> some View {
    let fill = category.excluded ? 0 : category.fill
    let colour = over ? urgent : (Theme.flagColour(named: category.flag.flagColor) ?? Theme.accent)
    return ZStack {
      Capsule()
        .fill(Theme.rowSecondary.opacity(0.2))
      LeadingFill(fraction: fill, rightToLeft: layoutDirection == .rightToLeft)
        .fill(colour)
    }
    .clipShape(Capsule())
    .frame(minWidth: 24, idealWidth: barWidth, maxWidth: barWidth)
    .frame(height: 6)
    .accessibilityHidden(true)
  }

  private func rate(_ category: RewardCategoryUsage) -> String {
    if category.excluded { return "none" }
    guard let rate = category.flag.rewardRate else { return "" }
    return calc.rewardType == .cashback ? "\(rate.formatted())%" : "\(rate.formatted()) mi/$"
  }

  private func spokenCategory(_ category: RewardCategoryUsage, beyond: Double) -> String {
    if category.excluded { return "Excluded from rewards" }
    var parts: [String] = []
    if let cap = category.cap {
      parts.append(beyond > 0 ? "Cap \(money(cap)), \(money(beyond)) beyond it" : "Cap \(money(cap))")
    } else {
      parts.append("No cap")
    }
    let spokenRate = rate(category)
    if !spokenRate.isEmpty {
      parts.append("earns \(spokenRate)")
    }
    if let minimum = category.flag.minimumSpend, minimum > 0 {
      parts.append("\(category.flag.minimumSpendMet == true ? "Minimum met" : "Minimum not met"), \(money(minimum))")
    }
    return parts.joined(separator: ". ")
  }

  private func money(_ value: Double) -> String {
    MoneyCodec.displayString(forCurrencyUnits: value, currencyFormat: currencyFormat)
  }

  private func short(_ iso: String) -> String {
    RewardsCalendar.shortLabel(iso, referenceISO: RewardsCalendar.today())
  }
}
