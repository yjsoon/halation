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
      LazyVGrid(
        columns: [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)],
        alignment: .leading,
        spacing: 12
      ) {
        ForEach(stats) { stat in
          column(stat, alignment: .leading)
        }
      }
    } else {
      HStack(alignment: .top, spacing: 8) {
        ForEach(Array(stats.enumerated()), id: \.element.id) { index, stat in
          if index > 0 {
            Spacer(minLength: 0)
          }
          column(stat, alignment: .center)
        }
      }
    }
  }

  private func column(_ stat: Stat, alignment: HorizontalAlignment) -> some View {
    VStack(alignment: alignment, spacing: 2) {
      Text(stat.label)
        .font(.caption)
        .foregroundStyle(.secondary)
      Text(stat.value)
        .font(.footnote.weight(.semibold))
        .monospacedDigit()
        .foregroundStyle(stat.colour)
        .lineLimit(1)
        .minimumScaleFactor(0.8)
    }
    .accessibilityElement(children: .combine)
  }
}

/// One period in the Income vs Spending list: the period and its net lead,
/// income and spending sit under them, and the whole row is one tap target.
struct IncomeVsSpendingPeriodRow: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  let row: IncomeVsSpendingMaths.PeriodRow
  let interval: ReportInterval
  let allRows: [IncomeVsSpendingMaths.PeriodRow]
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
    // the ratio says nothing; the totals card explains the filter instead.
    let savings = scope.categoryIDs.isEmpty
      ? IncomeVsSpendingMaths.savingsPhrase(net: row.net, income: row.income)
      : nil
    NavigationLink {
      destination
        .onAppear { haptic += 1 }
    } label: {
      Group {
        if dynamicTypeSize.isAccessibilitySize {
          VStack(alignment: .leading, spacing: 6) {
            titleText(title)
            netColumn(netText, savings: savings, alignment: .leading)
            figure("Income", incomeText, colour: row.income == 0 ? .secondary : Theme.inflow)
            figure("Spending", spendingText, colour: row.spending == 0 ? .secondary : Theme.outflow)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        } else {
          HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
              titleText(title)
              HStack(spacing: 10) {
                figure("Income", incomeText, colour: row.income == 0 ? .secondary : Theme.inflow)
                figure("Spending", spendingText, colour: row.spending == 0 ? .secondary : Theme.outflow)
              }
              .lineLimit(1)
              .minimumScaleFactor(0.85)
            }
            Spacer(minLength: 8)
            netColumn(netText, savings: savings, alignment: .trailing)
              .layoutPriority(1)
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
      if let savings {
        Text(savings)
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
  }

  private func figure(_ label: String, _ value: String, colour: Color) -> some View {
    (Text(label).foregroundStyle(.secondary)
      + Text(" ")
      + Text(value).foregroundStyle(colour))
      .font(.caption)
      .monospacedDigit()
  }

  @ViewBuilder
  private var destination: some View {
    if interval == .day {
      // A day is too small for a breakdown: open its register, both sides.
      RegisterView(
        scope: .all,
        dateRange: IncomeVsSpendingMaths.drillDownRange(row),
        accountIDs: scope.accountIDs.isEmpty ? nil : scope.accountIDs,
        excludePlainTransfers: true
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

  /// `rows` are newest first; the fallback is the oldest row, which is also
  /// where the running net starts.
  private var selectedRow: IncomeVsSpendingMaths.PeriodRow? {
    rows.first { $0.period == selectedPeriod } ?? rows.last
  }

  private var today: String { Date.now.isoDateString }

  private func title(_ row: IncomeVsSpendingMaths.PeriodRow) -> IncomeVsSpendingMaths.PeriodTitle {
    IncomeVsSpendingMaths.periodTitle(row, interval: interval, today: today)
  }

  var body: some View {
    let chronological = Array(rows.reversed())
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
          headerCard(selected, chronological: chronological)
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
    .task(id: selectedPeriod + "|" + scope.key) {
      await fetch()
    }
  }

  @ViewBuilder
  private var tabBody: some View {
    if let groups {
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

  private func headerCard(_ selected: IncomeVsSpendingMaths.PeriodRow, chronological: [IncomeVsSpendingMaths.PeriodRow]) -> some View {
    let periodTitle = title(selected)
    let saved = IncomeVsSpendingMaths.savingsRateLabel(net: selected.net, income: selected.income)
    let filter = IncomeVsSpendingMaths.filterLine(
      accountCount: scope.accountIDs.count,
      categoryCount: scope.categoryIDs.count
    )
    let running = chronological.count > 1
      ? IncomeVsSpendingMaths.runningNet(rows: chronological, through: selected.period)
      : nil
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
    return VStack(alignment: .leading, spacing: 10) {
      ReportStatRow(stats: stats)
      if periodTitle.soFar {
        Text(IncomeVsSpendingMaths.inProgressCaption(from: selected.from, to: min(selected.to, today)))
          .font(.footnote)
          .foregroundStyle(.secondary)
      }
      if let running, let first = chronological.first {
        Text("Running net for \(IncomeVsSpendingMaths.runningSpanLabel(first: first, through: selected)): \(MoneyCodec.signedDisplayString(for: running, currencyFormat: model.currencyFormat))")
          .font(.footnote)
          .foregroundStyle(.secondary)
      }
      if let filter {
        Text(filter)
          .font(.footnote)
          .foregroundStyle(.secondary)
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
        Text("Money out, by transaction line. Transfers between your own accounts are left out unless they carry a category.")
          .font(.caption)
          .foregroundStyle(.secondary)
          .padding(16)
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
        Text("Money in, including refunds and reimbursements. Transfers between your own accounts are left out unless they carry a category.")
          .font(.caption)
          .foregroundStyle(.secondary)
          .padding(16)
      }
    }
  }

  /// The share bar colours its first six segments and lumps the rest as
  /// grey, so rows past the sixth take the same grey instead of a palette
  /// colour the bar never shows.
  private static let colouredSegments = 6
  private static let remainderColour = Color.secondary.opacity(0.4)

  private func spendingSwatch(_ group: IncomeVsSpendingSpendingGroup, index: Int) -> Color {
    if group.categoryID == CategoryGroup.uncategorisedCategoryID {
      return Theme.uncategorised
    }
    return index < Self.colouredSegments ? Theme.chartColour(index) : Self.remainderColour
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
    let description = IncomeVsSpendingMaths.emptyTabDescription(kind: kind, title: name)
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
        groups = nil
        loadedWindow = nil
        phase = .failed(error.localizedDescription)
      }
    }
  }
}
