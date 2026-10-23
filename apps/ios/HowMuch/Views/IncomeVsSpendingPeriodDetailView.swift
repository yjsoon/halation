import SwiftUI

enum IncomeSpendingTab: String, CaseIterable, Identifiable {
  case spending = "Spending"
  case income = "Income"

  var id: String { rawValue }
}

/// Four report figures in a row, or two by two once text is large enough
/// that four money strings no longer share a line.
struct ReportStatRow: View {
  struct Stat: Identifiable {
    var id: String { label }
    var label: String
    var value: String
    var colour: Color
  }

  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  let stats: [Stat]

  var body: some View {
    if dynamicTypeSize.isAccessibilitySize {
      // Two by two, then one under another once a single amount fills a column.
      let columns = dynamicTypeSize >= .accessibility2 ? 1 : 2
      LazyVGrid(
        columns: Array(repeating: GridItem(.flexible(), alignment: .leading), count: columns),
        alignment: .leading,
        spacing: 12
      ) {
        ForEach(stats) { stat in
          column(stat, alignment: .leading, singleLine: columns == 2)
        }
      }
    } else {
      HStack(alignment: .top, spacing: 8) {
        ForEach(Array(stats.enumerated()), id: \.element.id) { index, stat in
          if index > 0 {
            Spacer(minLength: 0)
          }
          column(stat, alignment: .center, singleLine: true)
        }
      }
    }
  }

  private func column(_ stat: Stat, alignment: HorizontalAlignment, singleLine: Bool) -> some View {
    VStack(alignment: alignment, spacing: 2) {
      Text(stat.label)
        .font(.caption)
        .foregroundStyle(.secondary)
      Text(stat.value)
        .font(.footnote.weight(.semibold))
        .monospacedDigit()
        .foregroundStyle(stat.colour)
        .lineLimit(singleLine ? 1 : nil)
        .minimumScaleFactor(singleLine ? 0.8 : 1)
    }
    .accessibilityElement(children: .combine)
  }
}

/// Income over spending as two bars on one scale, green above red. In the
/// list the scale is shared by every row; in a header it is the pair itself.
struct IncomeSpendingBars: View {
  let income: Int
  let spending: Int
  let scale: Int
  var height: CGFloat = 5
  var spacing: CGFloat = 4

  var body: some View {
    VStack(alignment: .leading, spacing: spacing) {
      ShareMeter(fraction: Double(income) / Double(max(scale, 1)), colour: income == 0 ? .clear : Theme.inflow)
        .frame(height: height)
      ShareMeter(fraction: Double(abs(spending)) / Double(max(scale, 1)), colour: spending == 0 ? .clear : Theme.outflow)
        .frame(height: height)
    }
    .accessibilityHidden(true)
  }
}

/// The counting rules, behind the info button on both Income vs Spending
/// screens so the reports themselves stay figures and bars.
struct IncomeVsSpendingInfoSheet: View {
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      List {
        rule("arrow.down.left.arrow.up.right", "Income is money in, spending is money out, counted per transaction line.")
        rule("arrow.left.arrow.right", "Transfers between your own accounts are left out, unless the transfer carries a category.")
        rule("percent", "Savings rate is net as a share of income.")
      }
      .navigationTitle("How it's counted")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") { dismiss() }
            .tint(Theme.accent)
        }
      }
    }
    .presentationDetents([.medium])
  }

  private func rule(_ systemImage: String, _ text: String) -> some View {
    Label {
      Text(text)
        .font(.subheadline)
        .foregroundStyle(Theme.textPrimary)
    } icon: {
      Image(systemName: systemImage)
        .foregroundStyle(Theme.accent)
    }
    .padding(.vertical, 4)
  }
}

/// A toolbar info button that opens `IncomeVsSpendingInfoSheet`.
struct IncomeVsSpendingInfoButton: View {
  @State private var isShowing = false

  var body: some View {
    Button {
      isShowing = true
    } label: {
      Image(systemName: "info.circle")
    }
    .tint(Theme.accent)
    .accessibilityLabel("How it's counted")
    .sheet(isPresented: $isShowing) {
      IncomeVsSpendingInfoSheet()
        .blocksCapturePresentation()
    }
  }
}

/// One period in the Income vs Spending list: the period and its net lead,
/// income and spending are bars on a scale shared by the whole list, and
/// the whole row is one tap target.
struct IncomeVsSpendingPeriodRow: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @ScaledMetric(relativeTo: .caption) private var meterWidth: CGFloat = 88
  let row: IncomeVsSpendingMaths.PeriodRow
  let interval: ReportInterval
  let allRows: [IncomeVsSpendingMaths.PeriodRow]
  /// `IncomeVsSpendingMaths.barScale` over the rows on screen.
  let barScale: Int
  let scope: ReportScope
  let currencyFormat: CurrencyFormat?
  @State private var haptic = 0

  var body: some View {
    let today = Date.now.isoDateString
    let title = IncomeVsSpendingMaths.periodTitle(row, interval: interval, today: today)
    let incomeText = MoneyCodec.displayString(for: row.income, currencyFormat: currencyFormat)
    let spendingText = MoneyCodec.displayString(for: abs(row.spending), currencyFormat: currencyFormat)
    let netText = MoneyCodec.signedDisplayString(for: row.net, currencyFormat: currencyFormat)
    // Under a category filter "income" is only that category's refunds, so
    // the ratio says nothing.
    let savings = scope.categoryIDs.isEmpty
      ? IncomeVsSpendingMaths.savingsPhrase(net: row.net, income: row.income)
      : nil
    NavigationLink {
      destination
        .onAppear { haptic += 1 }
    } label: {
      Group {
        // From xxLarge the fixed meter plus an amount no longer leaves the
        // net column room beside them, so the row stacks instead.
        if dynamicTypeSize >= .xxLarge {
          VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
              titleText(title)
              Spacer(minLength: 8)
              Image(systemName: "chevron.forward")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
            }
            netColumn(netText, savings: savings, alignment: .leading)
            bar(row.income, text: incomeText, colour: Theme.inflow, fullWidth: true)
            bar(row.spending, text: spendingText, colour: Theme.outflow, fullWidth: true)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        } else {
          HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
              titleText(title)
              bar(row.income, text: incomeText, colour: Theme.inflow, fullWidth: false)
              bar(row.spending, text: spendingText, colour: Theme.outflow, fullWidth: false)
            }
            Spacer(minLength: 8)
            netColumn(netText, savings: savings, alignment: .trailing)
            Image(systemName: "chevron.forward")
              .font(.footnote.weight(.semibold))
              .foregroundStyle(.tertiary)
              .padding(.top, 3)
              .accessibilityHidden(true)
          }
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 12)
      .contentShape(Rectangle())
    }
    .buttonStyle(.cardRow)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(
      IncomeVsSpendingMaths.voiceOverRowLabel(
        period: title.spoken,
        income: incomeText,
        spending: spendingText,
        net: netText,
        savings: savings,
        destination: IncomeVsSpendingMaths.rowDestination(interval: interval)
      )
    )
    .sensoryFeedback(.selection, trigger: haptic)
  }

  private func titleText(_ title: IncomeVsSpendingMaths.PeriodTitle) -> some View {
    (Text(title.text).foregroundStyle(Theme.textPrimary)
      + (title.soFar ? Text(" · so far").foregroundStyle(.secondary) : Text("")))
      .font(.subheadline.weight(.semibold))
  }

  private func netColumn(_ value: String, savings: String?, alignment: HorizontalAlignment) -> some View {
    VStack(alignment: alignment, spacing: 4) {
      Text(value)
        .font(.subheadline.weight(.semibold))
        .monospacedDigit()
        .foregroundStyle(Theme.signedReportColour(row.net))
        .lineLimit(1)
        .minimumScaleFactor(0.8)
      if let savings {
        Text(savings)
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
  }

  /// A bar on the list's shared scale with its amount beside or above it.
  /// Colour says which side; the totals card's legend names them once.
  @ViewBuilder
  private func bar(_ amount: Int, text: String, colour: Color, fullWidth: Bool) -> some View {
    // The meter keeps one width on every row so bars compare down the list;
    // a zero draws no stub. The amount never truncates: beside the meter it
    // takes its full width and the net column gives way; in the stacked
    // layout it sits above a meter that spans the row.
    let meter = ShareMeter(fraction: Double(abs(amount)) / Double(max(barScale, 1)), colour: amount == 0 ? .clear : colour)
    let label = Text(text)
      .font(.caption)
      .monospacedDigit()
      .foregroundStyle(amount == 0 ? Color.secondary : colour)
    if fullWidth {
      VStack(alignment: .leading, spacing: 4) {
        label
        meter.frame(height: 5)
      }
    } else {
      HStack(spacing: 8) {
        meter.frame(width: meterWidth, height: 5)
        label
          .lineLimit(1)
          .fixedSize(horizontal: true, vertical: false)
      }
    }
  }

  @ViewBuilder
  private var destination: some View {
    if interval == .day {
      // A day is too small for a breakdown: open its register, both sides.
      RegisterView(
        scope: .all,
        categoryIDs: scope.categoryIDs.isEmpty ? nil : scope.categoryIDs,
        dateRange: IncomeVsSpendingMaths.drillDownRange(row),
        accountIDs: scope.accountIDs.isEmpty ? nil : scope.accountIDs,
        excludePlainTransfers: true,
        title: LedgerDate.spokenPeriodLabel(row.period)
      )
    } else {
      IncomeVsSpendingPeriodDetailView(
        rows: allRows,
        selectedPeriod: row.period,
        initialTab: .spending,
        interval: interval,
        scope: scope
      )
    }
  }
}

struct IncomeVsSpendingPeriodDetailView: View {
  @Environment(AppModel.self) private var model
  let rows: [IncomeVsSpendingMaths.PeriodRow]
  @State private var selectedPeriod: String
  @State private var tab: IncomeSpendingTab
  let interval: ReportInterval
  let scope: ReportScope
  @State private var groups: IncomeVsSpendingGroupsReport?
  /// The window `groups` describes, so a step to another period drops the
  /// old breakdown instead of leaving it under the new header.
  @State private var loadedWindow: ClosedRange<String>?
  @State private var phase: LoadPhase = .idle
  @State private var fetchGate = ReportFetchGate()

  init(
    rows: [IncomeVsSpendingMaths.PeriodRow],
    selectedPeriod: String,
    initialTab: IncomeSpendingTab,
    interval: ReportInterval,
    scope: ReportScope
  ) {
    self.rows = rows
    _selectedPeriod = State(initialValue: selectedPeriod)
    _tab = State(initialValue: initialTab)
    self.interval = interval
    self.scope = scope
  }

  /// `rows` are newest first; the fallback is the oldest row.
  private var selectedRow: IncomeVsSpendingMaths.PeriodRow? {
    rows.first { $0.period == selectedPeriod } ?? rows.last
  }

  private var today: String { Date.now.isoDateString }

  private func title(_ row: IncomeVsSpendingMaths.PeriodRow) -> IncomeVsSpendingMaths.PeriodTitle {
    IncomeVsSpendingMaths.periodTitle(row, interval: interval, today: today)
  }

  var body: some View {
    let selected = selectedRow
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        if let selected {
          PeriodStepper(
            label: title(selected).display,
            canGoBack: canStep(from: selected, delta: -1),
            canGoForward: canStep(from: selected, delta: 1),
            onBack: { step(from: selected, delta: -1) },
            onForward: { step(from: selected, delta: 1) }
          )
          headerCard(selected)
        }

        Picker("Breakdown", selection: $tab) {
          ForEach(IncomeSpendingTab.allCases) { item in
            Text(item.rawValue).tag(item)
          }
        }
        .pickerStyle(.segmented)
        .frame(minHeight: 44)

        tabBody
          .gesture(
            DragGesture(minimumDistance: 24).onEnded { value in
              if value.translation.width < -40, tab == .spending {
                tab = .income
              } else if value.translation.width > 40, tab == .income {
                tab = .spending
              }
            }
          )
      }
      .padding(.horizontal, 16)
      .padding(.bottom, 24)
    }
    .background(Theme.canvas)
    .navigationTitle(selected.map { title($0).text } ?? "Income vs Spending")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        IncomeVsSpendingInfoButton()
      }
    }
    .task(id: selectedPeriod + "|" + scope.key) {
      await fetch()
    }
  }

  @ViewBuilder
  private var tabBody: some View {
    // Only the breakdown fetched for this period; after a step the old one
    // would otherwise sit under the new header for a frame, still tappable.
    if let groups, loadedWindow == selectedRow.map(IncomeVsSpendingMaths.drillDownRange) {
      switch tab {
      case .spending:
        spendingTab(groups)
      case .income:
        incomeTab(groups)
      }
    } else {
      PhasePlaceholder(phase: phase) {
        await fetch()
      }
    }
  }

  private func headerCard(_ selected: IncomeVsSpendingMaths.PeriodRow) -> some View {
    let saved = IncomeVsSpendingMaths.savingsRateLabel(net: selected.net, income: selected.income)
    let filter = IncomeVsSpendingMaths.filterLine(
      accountCount: scope.accountIDs.count,
      categoryCount: scope.categoryIDs.count
    )
    var stats = [
      ReportStatRow.Stat(
        label: "Income",
        value: MoneyCodec.displayString(for: selected.income, currencyFormat: model.currencyFormat),
        colour: selected.income == 0 ? .secondary : Theme.inflow
      ),
      ReportStatRow.Stat(
        label: "Spending",
        value: MoneyCodec.displayString(for: abs(selected.spending), currencyFormat: model.currencyFormat),
        colour: selected.spending == 0 ? .secondary : Theme.outflow
      ),
      ReportStatRow.Stat(
        label: "Net",
        value: MoneyCodec.signedDisplayString(for: selected.net, currencyFormat: model.currencyFormat),
        colour: Theme.signedReportColour(selected.net)
      ),
    ]
    if scope.categoryIDs.isEmpty {
      stats.append(ReportStatRow.Stat(
        label: "Savings rate",
        value: saved,
        colour: saved == "—" ? .secondary : Theme.signedReportColour(selected.net)
      ))
    }
    return VStack(alignment: .leading, spacing: 12) {
      ReportStatRow(stats: stats)
      IncomeSpendingBars(
        income: selected.income,
        spending: selected.spending,
        scale: max(selected.income, abs(selected.spending)),
        height: 8
      )
      if let filter {
        // Sighted users read the funnel; VoiceOver needs the word.
        Label(filter, systemImage: "line.3.horizontal.decrease")
          .font(.caption)
          .foregroundStyle(.secondary)
          .accessibilityLabel("Filtered to \(filter)")
      }
    }
    .padding(16)
    .ynabCard()
  }

  @ViewBuilder
  private func spendingTab(_ groups: IncomeVsSpendingGroupsReport) -> some View {
    if groups.spendingByCategory.isEmpty {
      emptyTab(kind: .spending)
    } else {
      VStack(alignment: .leading, spacing: 12) {
        HStack {
          Text("Spending by category")
            .font(.caption)
            .foregroundStyle(.secondary)
          Spacer()
          Text(MoneyCodec.displayString(for: groups.spending, currencyFormat: model.currencyFormat))
            .font(.subheadline.weight(.semibold))
            .monospacedDigit()
        }
        StackedShareBar(segments: spendingSegments(groups.spendingByCategory))
        VStack(spacing: 0) {
          ForEach(Array(groups.spendingByCategory.enumerated()), id: \.element.id) { index, group in
            NavigationLink {
              registerLink(categoryID: group.categoryID, amountFilter: .spending)
            } label: {
              spendingRow(group, index: index)
            }
            .buttonStyle(.cardRow)
            if index < groups.spendingByCategory.count - 1 {
              Divider().padding(.leading, 16)
            }
          }
        }
        .ynabCard()
      }
    }
  }

  @ViewBuilder
  private func incomeTab(_ groups: IncomeVsSpendingGroupsReport) -> some View {
    if groups.incomeByPayee.isEmpty {
      emptyTab(kind: .income)
    } else {
      VStack(alignment: .leading, spacing: 12) {
        HStack {
          Text("Income by payee")
            .font(.caption)
            .foregroundStyle(.secondary)
          Spacer()
          Text(MoneyCodec.displayString(for: groups.income, currencyFormat: model.currencyFormat))
            .font(.subheadline.weight(.semibold))
            .monospacedDigit()
        }
        StackedShareBar(segments: incomeSegments(groups.incomeByPayee))
        VStack(spacing: 0) {
          ForEach(Array(groups.incomeByPayee.enumerated()), id: \.element.id) { index, group in
            NavigationLink {
              registerLink(payee: group, amountFilter: .income)
            } label: {
              incomeRow(group, index: index)
            }
            .buttonStyle(.cardRow)
            if index < groups.incomeByPayee.count - 1 {
              Divider().padding(.leading, 16)
            }
          }
        }
        .ynabCard()
      }
    }
  }

  /// The share bar colours its first six segments and lumps the rest as
  /// grey, so rows past the sixth take the same grey instead of a palette
  /// colour the bar never shows.
  private static let colouredSegments = 6
  private static let remainderColour = Color.secondary.opacity(0.4)

  private func spendingSwatch(_ group: IncomeVsSpendingSpendingGroup, index: Int) -> Color {
    guard index < Self.colouredSegments else {
      return Self.remainderColour
    }
    return group.categoryID == CategoryGroup.uncategorisedCategoryID ? Theme.uncategorised : Theme.chartColour(index)
  }

  private func incomeSwatch(index: Int) -> Color {
    index < Self.colouredSegments ? Theme.inflowChartColour(index) : Self.remainderColour
  }

  private func spendingRow(_ group: IncomeVsSpendingSpendingGroup, index: Int) -> some View {
    HStack(spacing: 12) {
      Circle()
        .fill(spendingSwatch(group, index: index))
        .frame(width: 8, height: 8)
      Text(group.categoryName)
        .font(.subheadline)
        .foregroundStyle(Theme.textPrimary)
      Spacer()
      VStack(alignment: .trailing, spacing: 2) {
        Text(MoneyCodec.displayString(for: group.amount, currencyFormat: model.currencyFormat))
          .font(.subheadline)
          .monospacedDigit()
        Text(IncomeVsSpendingMaths.txnShareLabel(count: group.transactionCount, share: group.share))
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 11)
    .contentShape(Rectangle())
  }

  private func incomeRow(_ group: IncomeVsSpendingPayeeGroup, index: Int) -> some View {
    HStack(alignment: .top, spacing: 12) {
      Circle()
        .fill(incomeSwatch(index: index))
        .frame(width: 8, height: 8)
        .padding(.top, 6)
      VStack(alignment: .leading, spacing: 2) {
        Text(group.payeeName)
          .font(.subheadline)
          .foregroundStyle(Theme.textPrimary)
        Text(group.categoryName)
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      Spacer()
      VStack(alignment: .trailing, spacing: 2) {
        Text(MoneyCodec.displayString(for: group.amount, currencyFormat: model.currencyFormat))
          .font(.subheadline)
          .monospacedDigit()
        Text(IncomeVsSpendingMaths.txnShareLabel(count: group.transactionCount, share: group.share))
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 11)
    .contentShape(Rectangle())
  }

  @ViewBuilder
  private func emptyTab(kind: IncomeSpendingTab) -> some View {
    let name = selectedRow.map(title) ?? IncomeVsSpendingMaths.PeriodTitle(text: LedgerDate.periodLabel(selectedPeriod), soFar: false)
    let description = IncomeVsSpendingMaths.emptyTabDescription(title: name)
    switch kind {
    case .income:
      ContentUnavailableView(
        "No income",
        systemImage: "arrow.down.circle",
        description: Text(description)
      )
    case .spending:
      ContentUnavailableView(
        "No spending",
        systemImage: "arrow.up.circle",
        description: Text(description)
      )
    }
  }

  private func spendingSegments(_ groups: [IncomeVsSpendingSpendingGroup]) -> [(colour: Color, fraction: Double)] {
    var segments: [(colour: Color, fraction: Double)] = groups.prefix(Self.colouredSegments).enumerated().map { index, group in
      (spendingSwatch(group, index: index), group.share)
    }
    let remainder = groups.dropFirst(Self.colouredSegments).reduce(0.0) { $0 + $1.share }
    if remainder > 0 {
      segments.append((Self.remainderColour, remainder))
    }
    return segments
  }

  private func incomeSegments(_ groups: [IncomeVsSpendingPayeeGroup]) -> [(colour: Color, fraction: Double)] {
    var segments: [(colour: Color, fraction: Double)] = groups.prefix(Self.colouredSegments).enumerated().map { index, group in
      (incomeSwatch(index: index), group.share)
    }
    let remainder = groups.dropFirst(Self.colouredSegments).reduce(0.0) { $0 + $1.share }
    if remainder > 0 {
      segments.append((Self.remainderColour, remainder))
    }
    return segments
  }

  @ViewBuilder
  private func registerLink(categoryID: String? = nil, payee: IncomeVsSpendingPayeeGroup? = nil, amountFilter: RegisterAmountFilter) -> some View {
    if let selected = selectedRow {
      let dateRange = IncomeVsSpendingMaths.drillDownRange(selected)
      RegisterView(
        scope: .all,
        categoryID: categoryID,
        categoryIDs: scope.categoryIDs.isEmpty ? nil : scope.categoryIDs,
        payeeID: payee?.payeeID,
        payeeName: payee?.payeeName,
        missingPayee: payee.map { $0.payeeID == nil && $0.payeeName == "No payee" } ?? false,
        dateRange: dateRange,
        accountIDs: scope.accountIDs.isEmpty ? nil : scope.accountIDs,
        amountFilter: amountFilter,
        excludePlainTransfers: true
      )
    }
  }

  private func canStep(from selected: IncomeVsSpendingMaths.PeriodRow, delta: Int) -> Bool {
    guard let index = rows.firstIndex(where: { $0.period == selected.period }) else {
      return false
    }
    // rows are newest-first, so +1 is older.
    let next = index + (delta < 0 ? 1 : -1)
    return rows.indices.contains(next)
  }

  private func step(from selected: IncomeVsSpendingMaths.PeriodRow, delta: Int) {
    guard let index = rows.firstIndex(where: { $0.period == selected.period }) else {
      return
    }
    let next = index + (delta < 0 ? 1 : -1)
    guard rows.indices.contains(next) else {
      return
    }
    // The breakdown area shows the spinner from this frame, not a frame later.
    phase = .loading
    selectedPeriod = rows[next].period
  }

  private func fetch() async {
    let token = fetchGate.begin()
    phase = .loading
    guard let selected = selectedRow else {
      phase = .loaded
      return
    }
    // The same window as the row and its register links, so the tabs reconcile
    // to the headline figures instead of silently dropping future-dated lines.
    let window = IncomeVsSpendingMaths.drillDownRange(selected)
    if window != loadedWindow {
      // Stepping: the breakdown on screen belongs to the previous period.
      groups = nil
    }
    do {
      let next = try await model.apiClient.fetchIncomeVsSpendingGroups(
        planID: model.settings.planID,
        from: window.lowerBound,
        to: window.upperBound,
        accountIDs: Array(scope.accountIDs),
        categoryIDs: Array(scope.categoryIDs)
      )
      guard fetchGate.mayCommit(token) else { return }
      withAnimation(Theme.Motion.arrive) {
        groups = next
        loadedWindow = window
        phase = .loaded
      }
    } catch {
      guard fetchGate.mayCommit(token) else { return }
      withAnimation(Theme.Motion.arrive) {
        // A refetch of the breakdown already on screen (the view reappeared)
        // that fails keeps it; only a different period loses its figures.
        if loadedWindow != window {
          groups = nil
          loadedWindow = nil
        }
        phase = .failed(error.localizedDescription)
      }
    }
  }
}
