import SwiftUI

struct RewardsBoardPreferences: Codable, Equatable {
  var hiddenCardIDs: Set<String> = []
  var cardOrder: [String] = []
  var collapsedGroups: Set<String> = []
  /// nil until chosen: Featured when any card is featured, otherwise All Cards.
  var featuredOnly: Bool? = nil
  var groupsByType = false

  private enum CodingKeys: String, CodingKey {
    case hiddenCardIDs, cardOrder, collapsedGroups, featuredOnly, groupsByType
  }

  func orderedIDs(_ available: [String]) -> [String] {
    var remaining = Set(available)
    return (cardOrder + available).filter { remaining.remove($0) != nil }
  }

  /// Reorders `ids` among the slots they already occupy, so moving cards in a
  /// filtered or grouped subset keeps every other card where it was.
  mutating func reorder(_ ids: [String], within available: [String]) {
    var seen = Set<String>()
    var sequence = (cardOrder + available).filter { seen.insert($0).inserted }
    let moved = Set(ids)
    let slots = sequence.indices.filter { moved.contains(sequence[$0]) }
    let known = Set(sequence)
    for (slot, id) in zip(slots, ids.filter { known.contains($0) }) {
      sequence[slot] = id
    }
    cardOrder = sequence
  }

  static func storageKey(planID: String) -> String { "howmuch.rewards.board.v1.\(planID)" }

  static func load(planID: String, from defaults: UserDefaults = .standard) -> Self {
    guard let data = defaults.data(forKey: storageKey(planID: planID)),
      let preferences = try? JSONDecoder().decode(Self.self, from: data) else { return Self() }
    return preferences
  }

  func save(planID: String, to defaults: UserDefaults = .standard) {
    guard let data = try? JSONEncoder().encode(self) else { return }
    defaults.set(data, forKey: Self.storageKey(planID: planID))
  }
}

extension RewardsBoardPreferences {
  /// Tolerates missing keys, so preferences saved before a field existed keep
  /// their hidden cards and ordering.
  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    hiddenCardIDs = try container.decodeIfPresent(Set<String>.self, forKey: .hiddenCardIDs) ?? []
    cardOrder = try container.decodeIfPresent([String].self, forKey: .cardOrder) ?? []
    collapsedGroups = try container.decodeIfPresent(Set<String>.self, forKey: .collapsedGroups) ?? []
    featuredOnly = try container.decodeIfPresent(Bool.self, forKey: .featuredOnly)
    groupsByType = try container.decodeIfPresent(Bool.self, forKey: .groupsByType) ?? false
  }
}

struct RewardsReportFilter {
  enum Mode: String, CaseIterable, Identifiable {
    case current = "Current card periods"
    case historical = "Historical range"

    var id: String { rawValue }
  }

  var mode: Mode = .current
  var useAsOfDate = false
  var asOfDate = Date()
  var range = ReportRange()
  var scope = ReportScope()

  /// The as-of day in Asia/Singapore, or nil for today (the server decides).
  var asOfISO: String? { useAsOfDate ? RewardsCalendar.isoString(asOfDate) : nil }

  // An omitted lower bound selects current card periods on the rewards API.
  // All Time must instead send a comparison-only lower bound for aggregation.
  var from: String? { mode == .current ? nil : (range.fromISO ?? "0001-01-01") }
  var to: String? { mode == .current ? asOfISO : range.toISO }
  var accountIDs: [String] { scope.accountIDs.sorted() }
  var key: String {
    "\(mode.rawValue)|\(useAsOfDate)|\(RewardsCalendar.isoString(asOfDate))|\(range.key)|\(scope.key)"
  }
}

enum RewardsSheet: Identifiable {
  case detail(String)
  case editor(RewardCardEditorDestination)
  case customise
  case valuation
  case importExport
  case accounts
  case asOfDate
  case newAccount

  var id: String {
    switch self {
    case .detail(let cardID):
      return "card-\(cardID)"
    case .editor(let destination):
      if let cardID = destination.cardID {
        return "card-\(cardID)"
      }
      return "editor-\(destination.id)"
    case .customise: return "customise"
    case .valuation: return "valuation"
    case .importExport: return "import-export"
    case .accounts: return "accounts"
    case .asOfDate: return "as-of-date"
    case .newAccount: return "new-account"
    }
  }
}

enum RewardsRoute: Hashable {
  case summary
  case rangeReport
}

/// One report's rows, ordered and filtered for the board.
private struct RewardsBoard {
  let ordered: [RewardRowProjection]
  let visible: [RewardRowProjection]
  let featuredIDs: Set<String>
  let featuredOnly: Bool
  let hiddenCount: Int
  let unhiddenCount: Int
  let summary: RewardsBoardSummary

  init(report: RewardsReport, preferences: RewardsBoardPreferences, currencyFormat: CurrencyFormat?) {
    let projections = report.cards.map { RewardRowProjection.make(row: $0, asOf: report.asOf, isRange: false) }
    let byID = Dictionary(projections.map { ($0.cardID, $0) }, uniquingKeysWith: { first, _ in first })
    ordered = preferences.orderedIDs(RewardsBoardOrdering.fallbackOrder(projections)).compactMap { byID[$0] }
    featuredIDs = Set(report.cards.filter(\.card.featured).map(\.id))
    featuredOnly = preferences.featuredOnly ?? !featuredIDs.isEmpty
    let hidden = preferences.hiddenCardIDs
    hiddenCount = ordered.filter { hidden.contains($0.cardID) }.count
    unhiddenCount = ordered.count - hiddenCount
    let featuredSet = self.featuredIDs
    let onlyFeatured = self.featuredOnly
    visible = ordered.filter { (!onlyFeatured || featuredSet.contains($0.cardID)) && !hidden.contains($0.cardID) }
    summary = RewardsBoardSummary(report: report, projections: projections, currencyFormat: currencyFormat)
  }
}

struct RewardsView: View {
  @Environment(AppModel.self) private var model
  @Environment(RootChromeState.self) private var chrome: RootChromeState?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var filter: RewardsReportFilter
  @State private var sheet: RewardsSheet?
  @State private var route: RewardsRoute?
  @State private var preferencesByPlan: [String: RewardsBoardPreferences] = [:]
  @State private var rewardAccountIDsByPlan: [String: Set<String>] = [:]

  /// Rows are capped and centred on wide screens.
  static let rowMaxWidth: CGFloat = 640

  init(filter: RewardsReportFilter = RewardsReportFilter()) {
    var board = filter
    board.mode = .current
    _filter = State(initialValue: board)
  }

  var body: some View {
    let board = currentReport.map {
      RewardsBoard(report: $0, preferences: preferences, currencyFormat: model.currencyFormat)
    }
    List {
      if let report = currentReport, let board {
        if !report.cards.isEmpty {
          summaryRow(board)
        }
        if let asOf = filter.asOfISO {
          pastDateBanner(asOf)
        }
        if !filter.scope.accountIDs.isEmpty {
          accountsBanner
        }
        if let message = model.rewardsPhase.errorMessage {
          errorRow(message)
        }
        boardRows(report, board: board)
      } else {
        PhasePlaceholder(phase: model.rewardsPhase) {
          await fetch()
        }
        .frame(maxWidth: .infinity, minHeight: 240)
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
      }
    }
    // Loaded data arrives with the shared motion, as the Reflect overview does.
    .animation(reduceMotion ? nil : Theme.Motion.arrive, value: model.rewardsPhase)
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .background(Theme.canvas)
    .navigationTitle("Rewards")
    .navigationBarTitleDisplayMode(.large)
    .toolbar {
      ToolbarItem(placement: .topBarLeading) {
        featuredMenu(board)
      }
      ToolbarItem(placement: .topBarTrailing) {
        dateMenu
      }
      ToolbarSpacer(.fixed, placement: .topBarTrailing)
      ToolbarItem(placement: .topBarTrailing) {
        DestinationsMenu {
          rewardsMenuItems
        }
      }
    }
    .navigationDestination(item: $route) { route in
      switch route {
      case .summary:
        RewardsReportScreen(filter: filter, allowsRange: false)
      case .rangeReport:
        RewardsReportScreen(filter: rangeFilter, allowsRange: true)
      }
    }
    .sheet(item: $sheet) { sheet in
      sheetContent(sheet)
    }
    .blocksCapturePresentation(when: sheet != nil)
    .task(id: fetchKey) {
      await fetch()
    }
    .refreshable {
      await fetch()
    }
  }

  /// The model holds the board's report, so the overview board (cached on
  /// disk) is on screen at launch while this view revalidates it. A report is
  /// shown only under the request that produced it.
  private var currentReport: RewardsReport? {
    model.rewardsReport(for: request)
  }

  private var request: RewardsRequest {
    RewardsRequest(
      planID: model.settings.planID,
      from: filter.from,
      to: filter.to,
      accountIDs: filter.accountIDs
    )
  }

  @ViewBuilder
  private func boardRows(_ report: RewardsReport, board: RewardsBoard) -> some View {
    if report.cards.isEmpty {
      if filter.scope.accountIDs.isEmpty, !hasRewardAccountChoice {
        // Set Up Rewards would open an editor with no account to pick.
        emptyState(
          "Add an Account First",
          systemImage: "building.columns",
          description: "Rewards follow spending on a card or bank account. Add one, then set up its rewards."
        ) {
          Button("New Account") { sheet = .newAccount }
            .buttonStyle(.borderedProminent)
            .tint(Theme.accent)
        }
      } else if filter.scope.accountIDs.isEmpty {
        emptyState(
          "No Reward Cards",
          systemImage: "creditcard",
          description: "Set up rewards on an existing account to track minimums and caps, or import your Rewards Tracker configuration."
        ) {
          Button("Set Up Rewards") { sheet = .editor(.create) }
            .buttonStyle(.borderedProminent)
            .tint(Theme.accent)
          Button("Import Rewards") { sheet = .importExport }
        }
      } else {
        emptyState(
          "No Cards in These Accounts",
          systemImage: "building.columns",
          description: "None of the selected accounts has a reward card."
        ) {
          Button("Show All Accounts") { filter.scope.accountIDs = [] }
        }
      }
    } else if board.visible.isEmpty {
      if board.unhiddenCount == 0 {
        emptyState(
          "All Cards Hidden",
          systemImage: "eye.slash",
          description: "Hidden cards still count in the totals above."
        ) {
          Button("Show Hidden Cards") { updatePreferences { $0.hiddenCardIDs = [] } }
        }
      } else {
        emptyState(
          "No Featured Cards",
          systemImage: "star",
          description: "None of the visible cards is featured."
        ) {
          Button("Show All Cards") { updatePreferences { $0.featuredOnly = false } }
        }
      }
    } else if preferences.groupsByType {
      typeSection("Cashback", kind: .cashback, rows: board.visible)
      typeSection("Miles", kind: .miles, rows: board.visible)
    } else {
      ForEach(Array(board.visible.enumerated()), id: \.element.cardID) { index, projection in
        boardRow(projection, index: index)
      }
    }
    if board.hiddenCount > 0, !board.visible.isEmpty {
      Button {
        sheet = .customise
      } label: {
        Text("\(board.hiddenCount) hidden · Show")
          .font(.footnote.weight(.medium))
          .foregroundStyle(Theme.accent)
          .frame(maxWidth: .infinity, minHeight: 44)
      }
      .buttonStyle(.plain)
      .listRowBackground(Color.clear)
      .listRowSeparator(.hidden)
      .accessibilityHint("Opens Customise Board to show hidden cards.")
    }
  }

  @ViewBuilder
  private func typeSection(_ title: String, kind: RewardKind, rows: [RewardRowProjection]) -> some View {
    let matching = rows.filter { $0.rewardType == kind }
    if !matching.isEmpty {
      let isExpanded = !preferences.collapsedGroups.contains(kind.rawValue)
      Button {
        updatePreferences {
          if isExpanded {
            _ = $0.collapsedGroups.insert(kind.rawValue)
          } else {
            _ = $0.collapsedGroups.remove(kind.rawValue)
          }
        }
      } label: {
        HStack {
          Text("\(title) · \(matching.count)")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Theme.rowSecondary)
          Spacer()
          Image(systemName: "chevron.down")
            .font(.caption.weight(.semibold))
            .foregroundStyle(Theme.rowSecondary)
            .rotationEffect(.degrees(isExpanded ? 0 : -90))
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .listRowInsets(EdgeInsets(top: 4, leading: 20, bottom: 0, trailing: 20))
      .listRowBackground(Color.clear)
      .listRowSeparator(.hidden)
      .accessibilityLabel("\(title), \(matching.count == 1 ? "1 card" : "\(matching.count) cards")")
      .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")
      if isExpanded {
        ForEach(Array(matching.enumerated()), id: \.element.cardID) { index, projection in
          boardRow(projection, index: index)
        }
      }
    }
  }

  private func boardRow(_ projection: RewardRowProjection, index: Int) -> some View {
    let text = RewardRowText(projection, currencyFormat: model.currencyFormat)
    return Button {
      sheet = .detail(projection.cardID)
    } label: {
      RewardFilledRow(
        projection: projection, icon: icon(for: projection.accountID), currencyFormat: model.currencyFormat,
        index: index)
    }
    .buttonStyle(.plain)
    // On iPad the board has no readable-width limit, and a 700pt strip turns into a thin ribbon.
    .frame(maxWidth: Self.rowMaxWidth)
    .frame(maxWidth: .infinity)
    .listRowInsets(EdgeInsets(top: 5, leading: 16, bottom: 5, trailing: 16))
    .listRowBackground(Color.clear)
    .listRowSeparator(.hidden)
    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
      Button {
        hide(projection.cardID)
      } label: {
        Label("Hide", systemImage: "eye.slash")
      }
      .tint(.gray)
    }
    .contextMenu {
      Button {
        sheet = .detail(projection.cardID)
      } label: {
        Label("Show Details", systemImage: "info.circle")
      }
      Button {
        sheet = .editor(.edit(projection.cardID))
      } label: {
        Label("Edit Rewards", systemImage: "pencil")
      }
      if let chrome {
        Button {
          chrome.showAccount(projection.accountID)
        } label: {
          Label("View Transactions", systemImage: "list.bullet.rectangle")
        }
      }
      Button {
        hide(projection.cardID)
      } label: {
        Label("Hide on This Device", systemImage: "eye.slash")
      }
    }
    .accessibilityLabel(projection.title)
    .accessibilityValue(text.accessibilityValue)
    .accessibilityHint("Shows details.")
    .accessibilityAction(named: "Edit Rewards") {
      sheet = .editor(.edit(projection.cardID))
    }
    .accessibilityAction(named: "Hide") {
      hide(projection.cardID)
    }
  }

  private func summaryRow(_ board: RewardsBoard) -> some View {
    var line = board.summary.line
    if board.visible.count < board.ordered.count {
      line += " · showing \(board.visible.count) of \(board.ordered.count)"
    }
    return Button {
      route = .summary
    } label: {
      Text("\(line)\u{00A0}\(Image(systemName: "chevron.forward"))")
        .font(.footnote)
        .foregroundStyle(Theme.rowSecondary)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity, minHeight: 44)
    }
    .buttonStyle(.plain)
    .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
    .listRowBackground(Color.clear)
    .listRowSeparator(.hidden)
    .accessibilityLabel("Summary for current periods, \(line)")
    .accessibilityHint("Opens totals and the breakdown.")
  }

  /// Side by side when they fit, and stacked when they do not (large text), so no word is split.
  private func pastDateBanner(_ asOf: String) -> some View {
    let label = Label(
      "Showing \(RewardsCalendar.shortLabel(asOf, referenceISO: RewardsCalendar.today()))",
      systemImage: "clock.arrow.circlepath"
    )
    .font(.subheadline)
    .foregroundStyle(Theme.textPrimary)
    let back = Button("Back to Today") {
      backToToday()
    }
    .buttonStyle(.borderless)
    .font(.subheadline.weight(.semibold))
    .tint(Theme.accent)
    .frame(minHeight: 44)
    return ViewThatFits(in: .horizontal) {
      HStack(spacing: 8) {
        label.fixedSize()
        Spacer(minLength: 8)
        back.fixedSize()
      }
      VStack(alignment: .leading, spacing: 4) {
        label.fixedSize(horizontal: false, vertical: true)
        back
      }
    }
    .listRowBackground(Color.clear)
    .listRowSeparator(.hidden)
  }

  private func errorRow(_ message: String) -> some View {
    Label(message, systemImage: "wifi.exclamationmark")
      .font(.footnote)
      .foregroundStyle(Theme.rowSecondary)
      .listRowBackground(Color.clear)
      .listRowSeparator(.hidden)
  }

  /// False only once accounts have loaded and none can carry a card: a
  /// rewards snapshot can paint before the accounts it belongs to.
  private var hasRewardAccountChoice: Bool {
    model.referencePhase != .loaded
      || !RewardCardAccounts.choices(accounts: model.accounts, takenIDs: [], keepingID: nil).isEmpty
  }

  private func emptyState<Actions: View>(
    _ title: String,
    systemImage: String,
    description: String,
    @ViewBuilder actions: () -> Actions
  ) -> some View {
    ContentUnavailableView {
      Label(title, systemImage: systemImage)
    } description: {
      Text(description)
    } actions: {
      actions()
    }
    .listRowBackground(Color.clear)
    .listRowSeparator(.hidden)
  }

  private func featuredMenu(_ board: RewardsBoard?) -> some View {
    let featuredOnly = board?.featuredOnly ?? (preferences.featuredOnly ?? true)
    let title = featuredOnly ? "Featured" : "All Cards"
    return Menu {
      Picker("Cards", selection: Binding(
        get: { featuredOnly },
        set: { value in updatePreferences { $0.featuredOnly = value } }
      )) {
        Text("Featured (\(board?.featuredIDs.count ?? 0))").tag(true)
        Text("All Cards (\(board?.ordered.count ?? 0))").tag(false)
      }
      .pickerStyle(.inline)
      Toggle("Group by Reward Type", isOn: Binding(
        get: { preferences.groupsByType },
        set: { value in updatePreferences { $0.groupsByType = value } }
      ))
    } label: {
      Text(title)
    }
    .accessibilityLabel("Cards, \(title)")
  }

  private var accountsBanner: some View {
    let count = filter.scope.accountIDs.count
    return HStack(spacing: 8) {
      Button {
        sheet = .accounts
      } label: {
        Label("\(count) Account\(count == 1 ? "" : "s")", systemImage: "building.columns")
          .font(.subheadline)
          .foregroundStyle(Theme.textPrimary)
          .frame(minHeight: 44)
      }
      .buttonStyle(.borderless)
      .accessibilityHint("Choose which accounts the report covers.")
      Spacer(minLength: 8)
      Button("Show All") {
        filter.scope.accountIDs = []
      }
      .buttonStyle(.borderless)
      .font(.subheadline.weight(.semibold))
      .tint(Theme.accent)
      .frame(minHeight: 44)
      .accessibilityLabel("Show all accounts")
    }
    .listRowBackground(Color.clear)
    .listRowSeparator(.hidden)
  }

  private var dateMenu: some View {
    let title = filter.asOfISO.map { RewardsCalendar.shortLabel($0, referenceISO: RewardsCalendar.today()) } ?? "Today"
    return Menu {
      if filter.useAsOfDate {
        Button {
          backToToday()
        } label: {
          Label("Back to Today", systemImage: "arrow.uturn.backward")
        }
      } else {
        Button {} label: {
          Label("Today", systemImage: "checkmark")
        }
      }
      Button {
        sheet = .asOfDate
      } label: {
        Label("Choose Date…", systemImage: "calendar")
      }
      Section {
        Button {
          route = .rangeReport
        } label: {
          Label("Range Report…", systemImage: "calendar.badge.clock")
        }
      }
    } label: {
      Label(title, systemImage: "calendar")
    }
    .accessibilityLabel("As of, \(title)")
  }

  @ViewBuilder
  private var rewardsMenuItems: some View {
    Button {
      sheet = .editor(.create)
    } label: {
      Label("Set Up Rewards", systemImage: "plus.rectangle.on.rectangle")
    }
    Button {
      sheet = .customise
    } label: {
      Label("Customise Board…", systemImage: "slider.horizontal.3")
    }
    Button {
      sheet = .accounts
    } label: {
      Text("Accounts…")
      Text(filter.scope.accountIDs.isEmpty ? "All accounts" : "\(filter.scope.accountIDs.count) selected")
      Image(systemName: "building.columns")
    }
    Button {
      sheet = .valuation
    } label: {
      Text("Miles Valuation…")
      if let valuation = currentReport?.milesValuation {
        Text("\(valuation.formatted()) per mile")
      }
      Image(systemName: "airplane")
    }
    Button {
      sheet = .importExport
    } label: {
      Label("Import & Export…", systemImage: "square.and.arrow.up.on.square")
    }
  }

  @ViewBuilder
  private func sheetContent(_ sheet: RewardsSheet) -> some View {
    switch sheet {
    case .detail(let cardID):
      detailSheet(cardID)
    case .editor(let destination):
      RewardCardEditorView(cardID: destination.cardID)
    case .customise:
      customiseSheet
    case .valuation:
      RewardsValuationSheet(current: currentReport?.milesValuation)
    case .importExport:
      NavigationStack {
        RewardsImportView()
      }
    case .accounts:
      AccountScopePicker(
        selection: $filter.scope.accountIDs,
        candidateIDs: rewardAccountIDsByPlan[model.settings.planID]
      )
    case .asOfDate:
      RewardsAsOfDateSheet(filter: $filter)
    case .newAccount:
      NewAccountSheet()
    }
  }

  @ViewBuilder
  private func detailSheet(_ cardID: String) -> some View {
    // Looked up live, so edits and refreshes update the open sheet.
    if let report = currentReport, let row = report.cards.first(where: { $0.id == cardID }) {
      RewardCardDetailSheet(
        row: row,
        asOf: report.asOf,
        icon: icon(for: row.accountId),
        currencyFormat: model.currencyFormat,
        canOpenAccount: chrome != nil,
        onEdit: { sheet = .editor(.edit(cardID)) },
        onOpenAccount: {
          sheet = nil
          chrome?.showAccount(row.accountId)
        }
      )
    } else {
      ContentUnavailableView(
        "Card Unavailable",
        systemImage: "creditcard",
        description: Text("This card is no longer in the report.")
      )
      .presentationDetents([.medium])
    }
  }

  private var customiseSheet: some View {
    let ordered = currentReport.map {
      RewardsBoard(report: $0, preferences: preferences, currencyFormat: model.currencyFormat).ordered
    } ?? []
    let available = ordered.map(\.cardID)
    return NavigationStack {
      List {
        Section {
          Text("Device-local for this plan. Drag to reorder, and show or hide cards, including cards excluded by Featured. These choices do not change rewards, totals or configuration exports.")
            .font(.footnote)
            .foregroundStyle(.secondary)
          Button("Show All Cards") { updatePreferences { $0.hiddenCardIDs = [] } }
          Button("Reset Display Preferences") { updatePreferences { $0 = RewardsBoardPreferences() } }
        }
        if preferences.groupsByType {
          customiseSection("Cashback", rows: ordered.filter { $0.rewardType == .cashback }, available: available)
          customiseSection("Miles", rows: ordered.filter { $0.rewardType == .miles }, available: available)
        } else {
          customiseSection("Cards", rows: ordered, available: available)
        }
      }
      .environment(\.editMode, .constant(.active))
      .navigationTitle("Customise Board")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          Button("Done") { sheet = nil }
        }
      }
    }
  }

  @ViewBuilder
  private func customiseSection(_ title: String, rows: [RewardRowProjection], available: [String]) -> some View {
    if !rows.isEmpty {
      Section(title) {
        ForEach(rows, id: \.cardID) { row in
          Toggle(isOn: Binding(
            get: { !preferences.hiddenCardIDs.contains(row.cardID) },
            set: { visible in
              updatePreferences {
                if visible {
                  _ = $0.hiddenCardIDs.remove(row.cardID)
                } else {
                  _ = $0.hiddenCardIDs.insert(row.cardID)
                }
              }
            }
          )) {
            HStack(spacing: 6) {
              if let icon = icon(for: row.accountID) {
                Text(icon).accessibilityHidden(true)
              }
              Text(row.title)
            }
          }
          .accessibilityLabel("Show \(row.title)")
        }
        .onMove { offsets, destination in
          var ids = rows.map(\.cardID)
          ids.move(fromOffsets: offsets, toOffset: destination)
          updatePreferences { $0.reorder(ids, within: available) }
        }
      }
    }
  }

  private var fetchKey: String {
    "\(model.settings.planID)|\(model.rewardsRefreshGeneration)|\(filter.key)"
  }

  private var rangeFilter: RewardsReportFilter {
    var range = RewardsReportFilter(mode: .historical)
    range.scope = filter.scope
    return range
  }

  private var preferences: RewardsBoardPreferences {
    preferencesByPlan[model.settings.planID] ?? .load(planID: model.settings.planID)
  }

  private func updatePreferences(_ change: (inout RewardsBoardPreferences) -> Void) {
    let planID = model.settings.planID
    var next = preferences
    change(&next)
    // Hiding, collapsing and filtering move rows rather than redrawing the board.
    withAnimation(Theme.Motion.standard) {
      preferencesByPlan[planID] = next
    }
    next.save(planID: planID)
  }

  private func hide(_ cardID: String) {
    updatePreferences { $0.hiddenCardIDs.insert(cardID) }
  }

  private func icon(for accountID: String) -> String? {
    model.accounts.first { $0.id == accountID }?.displayIcon
  }

  private func backToToday() {
    filter.useAsOfDate = false
    filter.asOfDate = Date()
  }

  private func fetch() async {
    let request = request
    let key = fetchKey
    guard let next = await model.refreshRewards(request),
          key == fetchKey,
          request.planID == model.settings.planID
    else {
      return
    }
    let planID = request.planID
    if request.accountIDs.isEmpty {
      rewardAccountIDsByPlan[planID] = Set(next.cards.map(\.accountId))
    }
  }
}

enum RewardCardEditorDestination: Identifiable {
  case create
  case edit(String)

  var id: String {
    switch self {
    case .create:
      return "new"
    case .edit(let cardID):
      return cardID
    }
  }

  var cardID: String? {
    switch self {
    case .create:
      return nil
    case .edit(let cardID):
      return cardID
    }
  }
}

struct RewardFilledRow: View {
  /// Where the row is drawn, which picks its layout (spec "What collapses when").
  enum Placement {
    /// The Rewards board: the strip, or the paper row with a scene band at accessibility sizes.
    case board
    /// An account's register: the paper row with a small print, or with a band at accessibility sizes.
    case register
    /// The detail sheet: the 3:2 hero over the slip. The sheet names the card itself.
    case sheet
  }

  let projection: RewardRowProjection
  var icon: String?
  let currencyFormat: CurrencyFormat?
  var placement: Placement = .board
  /// Which list this row is in, so the same card remembers its pose separately in each.
  var memoryScope = "board"
  /// The row's place in its list, for the staggered first showing.
  var index = 0
  /// The sheet slip's caps line: issuer, type and "Featured" when it is.
  var capsLine: String?

  @Environment(\.colorSchemeContrast) private var contrast
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.legibilityWeight) private var legibilityWeight
  /// Optional so a row drawn outside the app (a snapshot) still works; it only scopes the animation memory.
  @Environment(AppModel.self) private var model: AppModel?
  @ScaledMetric(relativeTo: .body) private var stripPadding = 9.0
  @ScaledMetric(relativeTo: .body) private var paperPadding = 14.0
  @ScaledMetric(relativeTo: .body) private var horizontalPadding = 16.0
  /// The icon's two rising slopes: the target horizon 14pt to 2pt under the name, the spend ridge
  /// lifting towards it, and a 10pt half-sun on the horizon at the right.
  @ScaledMetric(relativeTo: .body) private var skyBand = 34.0
  /// The caps line's 0.14em tracking, scaling with its text.
  @ScaledMetric(relativeTo: .caption2) private var capsTracking = 1.54
  /// The ridges follow the measured bottom of the name and top of the headline.
  @State private var nameBottom: CGFloat?
  @State private var footTop: CGFloat?
  @State private var width: CGFloat = 0

  /// Plan, list and card, so a plan switch never starts from another plan's remembered pose.
  private var memoryKey: String { "\(model?.settings.planID ?? "")|\(memoryScope)|\(projection.cardID)" }

  private static let space = "rewardExposure"
  /// The scene band above the words at accessibility sizes, in points: art, so it does not scale.
  private static let bandHeight: CGFloat = 64
  /// The register's thumbnail print, in points: art, so it does not scale.
  private static let printSize = CGSize(width: 90, height: 60)
  /// The hero's width on a wide sheet (iPad).
  private static let heroMaxWidth: CGFloat = 520

  private var bold: Bool { legibilityWeight == .bold }
  private var showsTitle: Bool { placement != .sheet }

  /// What the words sit on, which sets their inks.
  private enum Surface {
    /// The faces: dark ink on every light-mode sky, and light or dark by print in dark mode.
    case ridge
    case paper
  }

  var body: some View {
    let text = RewardRowText(projection, currencyFormat: currencyFormat)
    Group {
      if let exposure = RewardExposure(projection) {
        switch placement {
        case .board:
          if dynamicTypeSize.isAccessibilitySize {
            bandRow(text, exposure: exposure)
          } else {
            stripRow(text, exposure: exposure)
          }
        case .register:
          if dynamicTypeSize.isAccessibilitySize {
            bandRow(text, exposure: exposure)
          } else {
            printRow(text, exposure: exposure)
          }
        case .sheet:
          heroRow(text, exposure: exposure)
        }
      } else {
        paperRow(text)
      }
    }
    .contentShape(.rect(cornerRadius: Theme.Radius.card, style: .continuous))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(projection.title)
    .accessibilityValue(text.accessibilityValue)
  }

  private func stripRow(_ text: RewardRowText, exposure: RewardExposure) -> some View {
    VStack(spacing: 0) {
      VStack(alignment: .leading, spacing: 0) {
        nameBox
          .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named(Self.space)).maxY } action: { nameBottom = $0 }
          .padding(.bottom, skyBand)
        foot(text, surface: .ridge)
          .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named(Self.space)).minY } action: { footTop = $0 }
        exceptions(text, surface: .ridge)
      }
      .padding(.horizontal, horizontalPadding)
      .padding(.vertical, stripPadding)
      .frame(maxWidth: .infinity, alignment: .leading)
      .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
      .background {
        RewardExposureAnimator(
          exposure: exposure,
          layout: .strip(nameBottom: nameBottom.map { Double($0) }, footTop: footTop.map { Double($0) }),
          key: memoryKey, index: index)
      }
      .coordinateSpace(.named(Self.space))
      .clipShape(.rect(cornerRadius: Theme.Radius.card, style: .continuous))
      .overlay { outline }
    }
  }

  private func bandRow(_ text: RewardRowText, exposure: RewardExposure) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      RewardExposureAnimator(
        exposure: exposure, layout: .band, key: memoryKey, index: index
      )
      .frame(height: Self.bandHeight)
      paperContent(text)
    }
    .background(Theme.card)
    .clipShape(.rect(cornerRadius: Theme.Radius.card, style: .continuous))
    .overlay { outline }
  }

  /// The register: today's words on paper, with a small print of the whole scene on the trailing side,
  /// top-aligned with the name.
  private func printRow(_ text: RewardRowText, exposure: RewardExposure) -> some View {
    HStack(alignment: .top, spacing: 12) {
      paperText(text)
        .frame(maxWidth: .infinity, alignment: .leading)
      RewardExposureAnimator(exposure: exposure, layout: .photo, key: memoryKey, index: index)
        .frame(width: Self.printSize.width, height: Self.printSize.height)
        .clipShape(.rect(cornerRadius: Theme.Radius.inset, style: .continuous))
        .overlay {
          RoundedRectangle(cornerRadius: Theme.Radius.inset, style: .continuous)
            .strokeBorder(Color.primary.opacity(0.12), lineWidth: 0.5)
        }
    }
    .padding(.vertical, paperPadding)
    .padding(.horizontal, horizontalPadding)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Theme.card)
    .clipShape(.rect(cornerRadius: Theme.Radius.card, style: .continuous))
    .overlay { outline }
  }

  /// The detail sheet: a 3:2 print in a 6pt border, so it reads as a photograph, not a payment card,
  /// and the slip below it on the grouped background.
  private func heroRow(_ text: RewardRowText, exposure: RewardExposure) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      RewardExposureAnimator(exposure: exposure, layout: .photo, key: memoryKey, index: index)
        .aspectRatio(3 / 2, contentMode: .fit)
        .overlay(alignment: .topLeading) {
          // Fixed-size art that repeats the slip: hidden from VoiceOver, and at accessibility sizes.
          if !dynamicTypeSize.isAccessibilitySize {
            minimumTick(exposure)
          }
        }
        .overlay(alignment: .topLeading) {
          if let label = text.targetLabel, !dynamicTypeSize.isAccessibilitySize {
            Text(label)
              .font(CardType.fixedMono(11))
              .foregroundStyle(titleInk(.ridge))
              .padding(.leading, 10)
              .padding(.top, 8)
              .accessibilityHidden(true)
          }
        }
        .clipShape(.rect(cornerRadius: 10, style: .continuous))
        .padding(6)
        .background(Theme.card, in: .rect(cornerRadius: Theme.Radius.card, style: .continuous))
        .overlay {
          RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
            .strokeBorder(Color.primary.opacity(contrast == .increased ? 0.3 : 0.12), lineWidth: contrast == .increased ? 1 : 0.5)
        }
      VStack(alignment: .leading, spacing: 3) {
        if let capsLine, !capsLine.isEmpty {
          Text(capsLine)
            .font(CardType.sans(.semibold, 11, relativeTo: .caption2, bold: bold))
            .tracking(capsTracking)
            .textCase(.uppercase)
            .foregroundStyle(Theme.rowSecondary)
            .fixedSize(horizontal: false, vertical: true)
        }
        foot(text, surface: .paper)
        exceptions(text, surface: .paper)
      }
      .padding(.horizontal, 4)
    }
    // On a wide sheet the print and its slip stay one column, centred.
    .frame(maxWidth: Self.heroMaxWidth)
    .frame(maxWidth: .infinity)
  }

  /// In the minimum journey, a 4pt tick on the target horizon at the sun's column: where the sun will
  /// rest. Fixed-size art, hidden with the label at accessibility sizes.
  @ViewBuilder
  private func minimumTick(_ exposure: RewardExposure) -> some View {
    if exposure.stage == .gate {
      GeometryReader { proxy in
        let x = RewardExposure.column * proxy.size.width
        let y = proxy.size.height * BrandRise.at(BrandRise.backCrest, RewardExposure.column)
        Path { path in
          path.move(to: CGPoint(x: x, y: y))
          path.addLine(to: CGPoint(x: x, y: y + 4))
        }
        .stroke(Theme.Face.crest.opacity(0.6), lineWidth: 1)
      }
      .accessibilityHidden(true)
    }
  }

  private func paperRow(_ text: RewardRowText) -> some View {
    paperContent(text)
      .background(Theme.card)
      .clipShape(.rect(cornerRadius: Theme.Radius.card, style: .continuous))
      .overlay { outline }
  }

  private func paperContent(_ text: RewardRowText) -> some View {
    paperText(text)
      .padding(.vertical, paperPadding)
      .padding(.horizontal, horizontalPadding)
      .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func paperText(_ text: RewardRowText) -> some View {
    VStack(alignment: .leading, spacing: 3) {
      if showsTitle {
        titleLine(surface: .paper)
      }
      foot(text, surface: .paper)
      exceptions(text, surface: .paper)
    }
  }

  /// The name may run to 72% of the width: the sun's column at 85% stays clear of it, and a half-sun
  /// riding under the name's tail only grazes the line box. Without a name it is an empty line, so
  /// the ridges still have a sky.
  @ViewBuilder
  private var nameBox: some View {
    if showsTitle {
      titleLine(surface: .ridge)
        .frame(maxWidth: width > 0 ? width * 0.72 : .infinity, alignment: .leading)
    } else {
      Color.clear.frame(height: 0)
    }
  }

  @ViewBuilder
  private var outline: some View {
    if contrast == .increased {
      RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous)
        .strokeBorder(Color.primary.opacity(0.3), lineWidth: 1)
    }
  }

  /// Two lines on the strip, then a tail truncation; at accessibility sizes the paper row has the
  /// whole width and the name wraps as far as it needs.
  private func titleLine(surface: Surface) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 6) {
      if let icon {
        Text(icon)
          .font(.headline)
          .accessibilityHidden(true)
      }
      Text(projection.title)
        .font(CardType.name())
        .foregroundStyle(titleInk(surface))
        .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)
        .fixedSize(horizontal: false, vertical: true)
    }
  }

  private func foot(_ text: RewardRowText, surface: Surface) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      actionLine(text, surface: surface)
      if let basis = text.basisLine {
        Text(basis)
          .font(CardType.mono(.regular, 12, relativeTo: .caption, bold: bold))
          .foregroundStyle(secondaryInk(surface))
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .contentTransition(.opacity)
    .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: text.accessibilityValue)
  }

  /// On the strip the exceptions are more lines of the foot, on the ground in its own inks, so the
  /// card stays one surface; the frame grows a line for each.
  @ViewBuilder
  private func exceptions(_ text: RewardRowText, surface: Surface) -> some View {
    ForEach(Array(text.exceptionLines.enumerated()), id: \.element) { index, line in
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Image(systemName: "exclamationmark.triangle.fill")
          .accessibilityHidden(true)
        Text(line)
          .foregroundStyle(exceptionInk(at: index, surface: surface, forText: true))
          .fixedSize(horizontal: false, vertical: true)
      }
      .foregroundStyle(exceptionInk(at: index, surface: surface))
      .font(CardType.sans(.medium, 13, relativeTo: .footnote, bold: bold))
      .padding(.top, surface == .ridge ? 4 : 2)
    }
  }

  private func exceptionInk(at index: Int, surface: Surface, forText: Bool = false) -> Color {
    guard index < RewardRowText.visibleExceptionLimit, index < projection.exceptions.count else {
      return secondaryInk(surface)
    }
    switch projection.exceptions[index] {
    case .categoriesAtCap, .tierCapReached:
      if surface == .ridge { return forText ? Theme.Face.footInk : Theme.Face.urgentInk }
      return RewardTonePalette.palette(for: .complete).ink
    case .categoriesBelowMinimum, .minimumNotMet:
      if surface == .ridge { return forText ? Theme.Face.footInk : Theme.Face.urgentInk }
      return forText ? Theme.textPrimary : RewardTonePalette.palette(for: .needsMinimum).ink
    case .rewardsLocked:
      return secondaryInk(surface)
    }
  }

  private func titleInk(_ surface: Surface) -> Color {
    guard surface == .ridge else { return Theme.textPrimary }
    return projection.rewardType == .miles ? Theme.Face.inkMiles : Theme.Face.inkCashback
  }

  private func headlineInk(_ surface: Surface) -> Color {
    let failed = projection.tone == .failed
    switch surface {
    case .ridge: return failed ? Theme.Face.failedInk : Theme.Face.footInk
    case .paper: return failed ? RewardTonePalette.palette(for: .failed).ink : Theme.textPrimary
    }
  }

  private func secondaryInk(_ surface: Surface) -> Color {
    surface == .ridge ? Theme.Face.footInkSoft : Theme.rowSecondary
  }

  private func urgentInk(_ surface: Surface) -> Color {
    surface == .ridge ? Theme.Face.urgentInk : RewardTonePalette.palette(for: projection.tone).ink
  }

  @ViewBuilder
  private func actionLine(_ text: RewardRowText, surface: Surface) -> some View {
    let headline = headlineText(text, surface: surface)
    let deadline = text.deadline.map { value in
      Text(value)
        .font(CardType.sans(text.isUrgent ? .semibold : .regular, 13, relativeTo: .footnote, bold: bold))
        .foregroundStyle(text.isUrgent ? urgentInk(surface) : secondaryInk(surface))
    }
    let stacked = VStack(alignment: .leading, spacing: 2) {
      headline
        .fixedSize(horizontal: false, vertical: true)
      deadline
    }
    if dynamicTypeSize.isAccessibilitySize {
      stacked
    } else {
      ViewThatFits(in: .horizontal) {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
          headline
            .lineLimit(1)
          Spacer(minLength: 8)
          deadline
        }
        stacked
      }
    }
  }

  /// An unmet minimum's figure takes the urgent amber, the ink the deadline takes in its last days:
  /// the reward is at stake, not just a bonus.
  private func headlineText(_ text: RewardRowText, surface: Surface) -> Text {
    let ink = headlineInk(surface)
    if let amount = text.amount {
      let figure = Text(amount).font(CardType.mono(.medium, 17, relativeTo: .headline, bold: bold))
        .foregroundStyle(projection.tone == .needsMinimum ? urgentInk(surface) : ink)
      return Text("\(figure) \(text.actionLabel)")
        .font(CardType.sans(.regular, 15, relativeTo: .subheadline, bold: bold))
        .foregroundStyle(ink)
    }
    return Text(text.actionLabel)
      .font(CardType.sans(.semibold, 17, relativeTo: .headline, bold: bold))
      .foregroundStyle(ink)
  }
}

/// The leading part of a rect, square-edged so small values read as a quantity.
struct LeadingFill: Shape {
  var fraction: Double
  var rightToLeft = false

  var animatableData: Double {
    get { fraction }
    set { fraction = newValue }
  }

  func path(in rect: CGRect) -> Path {
    let width = rect.width * min(1, max(0, fraction))
    let x = rightToLeft ? rect.maxX - width : rect.minX
    return Path(CGRect(x: x, y: rect.minY, width: width, height: rect.height))
  }
}

struct RewardCardDetailSheet: View {
  @Environment(\.dismiss) private var dismiss
  @State private var contentHeight: CGFloat = 0
  let row: RewardsCardRow
  let asOf: String?
  let icon: String?
  let currencyFormat: CurrencyFormat?
  let canOpenAccount: Bool
  let onEdit: () -> Void
  let onOpenAccount: () -> Void

  var body: some View {
    let projection = RewardRowProjection.make(row: row, asOf: asOf, isRange: false)
    NavigationStack {
      List {
        Section {
          VStack(alignment: .leading, spacing: 12) {
            heading
            RewardFilledRow(
              projection: projection, icon: icon, currencyFormat: currencyFormat, placement: .sheet,
              memoryScope: "sheet", capsLine: capsLine
            )
          }
          // On a wide sheet the heading, print and slip share one centred column.
          .frame(maxWidth: 520)
          .frame(maxWidth: .infinity)
          .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
          .listRowBackground(Color.clear)
        }
        .listSectionSpacing(12)
        Section {
          if let period = currentPeriod {
            LabeledContent("Period", value: "\(short(period.start)) – \(short(period.end))")
          }
          if let asOf, asOf < RewardsCalendar.today() {
            Label("Showing \(short(asOf))", systemImage: "clock.arrow.circlepath")
              .foregroundStyle(.secondary)
          }
          if canOpenAccount {
            Button {
              onOpenAccount()
            } label: {
              Label("View Transactions", systemImage: "list.bullet.rectangle")
            }
          }
        }
        targetsSection
        tiersSection
        monthsSection
        categoriesSection
        periodsSection
      }
      .listStyle(.insetGrouped)
      .onScrollGeometryChange(for: CGFloat.self) { geometry in
        // Measure every visible section at the current width and text size.
        // The detent adds the bottom safe area; the top inset includes navigation.
        ceil(geometry.contentSize.height + geometry.contentInsets.top)
      } action: { _, height in
        if height > 0 { contentHeight = height }
      }
      // The name is the heading above the hero, where it can wrap; an inline bar title between Done
      // and Edit Rewards truncates any longer name.
      .navigationTitle(row.card.name)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar(removing: .title)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Done") { dismiss() }
        }
        ToolbarItem(placement: .primaryAction) {
          Button("Edit Rewards") { onEdit() }
        }
      }
    }
    .presentationDetents([contentHeight > 0 ? .height(contentHeight) : .large])
    .presentationDragIndicator(.visible)
    .presentationBackground(Color(.systemGroupedBackground))
  }

  private var calc: RewardsCalculation { row.calculation }

  private var heading: some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      if let icon {
        Text(icon)
          .font(.title3)
          .accessibilityHidden(true)
      }
      Text(row.card.name)
        .font(CardType.name(26, relativeTo: .title2))
        .foregroundStyle(Theme.textPrimary)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(.horizontal, 4)
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isHeader)
  }

  /// "DBS · Miles · Featured": the slip's caps line.
  private var capsLine: String {
    let type = row.card.type == .miles ? "Miles" : "Cashback"
    let issuer = row.card.issuer.trimmingCharacters(in: .whitespacesAndNewlines)
    return ([issuer.isEmpty ? nil : issuer, type, row.card.featured ? "Featured" : nil] as [String?])
      .compactMap { $0 }
      .joined(separator: " · ")
  }

  private var currentPeriod: RewardsCalculationPeriod? {
    guard let asOf else { return calc.periods?.last }
    return calc.periods?.last(where: { $0.start <= asOf && asOf <= $0.end })
  }

  private var activeMonth: RewardsMonthlyQualification? {
    guard let asOf else { return nil }
    return calc.monthlyQualifications?.first(where: { $0.start <= asOf && asOf <= $0.end })
  }

  @ViewBuilder
  private var targetsSection: some View {
    let minimum = calc.minimumSpend ?? 0
    let maximum = calc.maximumSpend ?? 0
    if minimum > 0 || maximum > 0 || activeMonth != nil || calc.nextSpendingTierThreshold != nil {
      Section("Targets") {
        if minimum > 0 {
          progressRow(
            calc.minimumSpendMet ? "Minimum met" : "Minimum",
            spend: calc.totalSpend,
            target: minimum,
            caption: "Qualifying spend before rounding.",
            tone: calc.minimumSpendMet ? .earning : .needsMinimum
          )
        }
        if let month = activeMonth {
          progressRow(
            "This month's minimum",
            spend: month.spend,
            target: month.minimumSpend,
            caption: "\(short(month.start)) – \(short(month.end)), net of refunds.",
            tone: month.spend >= month.minimumSpend ? .earning : .needsMinimum
          )
        }
        if calc.hasNextSpendingTier == true, let threshold = calc.nextSpendingTierThreshold {
          progressRow("Next tier", spend: calc.totalSpend, target: threshold, caption: nil, tone: .earning)
        }
        if maximum > 0 {
          progressRow(
            calc.maximumSpendExceeded ? "Cap reached" : "Cap",
            spend: calc.countedSpend,
            target: maximum,
            caption: (row.card.earningBlockSize ?? 0) > 0
              ? "Counts spend in whole earning blocks, so the room left can differ by up to one block."
              : nil,
            tone: calc.maximumSpendExceeded ? .complete : .earning
          )
        }
      }
    }
  }

  @ViewBuilder
  private var tiersSection: some View {
    let tiers = (row.card.spendingTiers ?? []).sorted { $0.spendThreshold < $1.spendThreshold }
    if !tiers.isEmpty {
      Section("Tiers") {
        ForEach(tiers) { tier in
          HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
              Text("From \(money(tier.spendThreshold))")
                .monospacedDigit()
              Text(tierDetail(tier))
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer()
            if tier.id == calc.activeSpendingTierId {
              Label("Active", systemImage: "checkmark.circle.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.inflow)
            } else if tier.id == calc.nextSpendingTierId {
              Text("Next")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            }
          }
          .accessibilityElement(children: .combine)
        }
      }
    }
  }

  @ViewBuilder
  private var monthsSection: some View {
    let months = calc.monthlyQualifications ?? []
    if !months.isEmpty {
      Section("Qualification") {
        ForEach(Array(months.enumerated()), id: \.offset) { _, month in
          HStack {
            Label {
              Text("\(short(month.start)) – \(short(month.end))")
            } icon: {
              Image(systemName: statusSymbol(month.status))
                .foregroundStyle(month.status == "failed" ? Theme.outflow : month.status == "met" ? Theme.inflow : Color.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
              Text("\(money(month.spend)) / \(money(month.minimumSpend))")
                .monospacedDigit()
              Text(month.status.replacingOccurrences(of: "_", with: " ").capitalized)
                .font(.caption)
                .foregroundStyle(.secondary)
            }
          }
          .accessibilityElement(children: .combine)
        }
      }
    }
  }

  @ViewBuilder
  private var categoriesSection: some View {
    if !calc.flags.isEmpty {
      Section("Categories") {
        RewardCategoryBreakdown(row: row, currencyFormat: currencyFormat)
          .listRowInsets(EdgeInsets(top: 12, leading: 12, bottom: 12, trailing: 12))
          .listRowBackground(Color.clear)
      }
    }
  }

  @ViewBuilder
  private var periodsSection: some View {
    let periods = calc.periods ?? []
    if periods.count > 1 {
      Section("Periods") {
        ForEach(Array(periods.enumerated()), id: \.offset) { _, period in
          LabeledContent("\(short(period.start)) – \(short(period.end))") {
            Text(money(period.calculation.totalSpend))
              .monospacedDigit()
          }
        }
      }
    }
  }

  private func progressRow(
    _ title: String, spend: Double, target: Double, caption: String?, tone: RewardRowProjection.Tone
  ) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text(title)
        Spacer()
        Text("\(money(spend)) / \(money(target))")
          .monospacedDigit()
          .foregroundStyle(.secondary)
      }
      ProgressView(value: target > 0 ? min(1, max(0, spend / target)) : 0)
        .tint(RewardTonePalette.palette(for: tone).ink)
      if let caption {
        Text(caption)
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .accessibilityElement(children: .combine)
  }

  private func tierDetail(_ tier: CardSpendingTier) -> String {
    var parts: [String] = []
    if let rate = tier.earningRate {
      parts.append(rateText(rate))
    }
    if let maximum = tier.maximumSpend {
      parts.append("cap \(money(maximum))")
    }
    return parts.isEmpty ? "Base rate" : parts.joined(separator: " · ")
  }

  private func rateText(_ rate: Double) -> String {
    calc.rewardType == .cashback ? "\(rate.formatted())%" : "\(rate.formatted()) miles/$"
  }

  private func statusSymbol(_ status: String) -> String {
    switch status {
    case "met": return "checkmark.circle.fill"
    case "failed": return "xmark.octagon.fill"
    default: return "clock"
    }
  }

  private func money(_ value: Double) -> String {
    MoneyCodec.displayString(forCurrencyUnits: value, currencyFormat: currencyFormat)
  }

  private func short(_ iso: String) -> String {
    RewardsCalendar.shortLabel(iso, referenceISO: RewardsCalendar.today())
  }
}

/// Actual spend is distinct from the rounded/capped amount eligible for rewards.
struct RewardCategoryUsage: Identifiable {
  let flag: RewardsFlagRow
  let excluded: Bool
  var id: String { flag.id }
  var spend: Double { flag.totalSpend ?? flag.eligibleSpend }
  var cap: Double? { excluded ? nil : flag.maximumSpend.flatMap { $0 > 0 ? $0 : nil } }
  var ratio: Double? { cap.map { max(0, spend / $0) } }
  var fill: Double { ratio.map { min(1, $0) } ?? (spend > 0 ? 1 : 0) }
  var warning: Bool { (ratio ?? 0) >= 0.9 }

  static func make(row: RewardsCardRow) -> [Self] {
    let excludedIDs = Set((row.card.subcategories ?? []).filter { $0.excludeFromRewards == true }.map(\.id))
    return row.calculation.flags.map { Self(flag: $0, excluded: excludedIDs.contains($0.id)) }
      .sorted { lhs, rhs in
        if lhs.excluded != rhs.excluded { return !lhs.excluded }
        if lhs.spend != rhs.spend { return lhs.spend > rhs.spend }
        return lhs.id < rhs.id
      }
  }
}

struct RewardCategoryBreakdown: View {
  @Environment(\.layoutDirection) private var layoutDirection
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let row: RewardsCardRow
  let currencyFormat: CurrencyFormat?

  var body: some View {
    let categories = RewardCategoryUsage.make(row: row)
    let total = categories.reduce(0) { $0 + max(0, $1.spend) }
    VStack(spacing: 6) {
      if total > 0 {
        GeometryReader { geometry in
          HStack(spacing: 0) {
            ForEach(categories) { category in
              colour(category)
                .frame(width: geometry.size.width * max(0, category.spend) / total)
            }
          }
        }
        .frame(height: 16)
        .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
        .accessibilityHidden(true)
        .padding(.bottom, 4)
      }
      ForEach(categories) { category in
        categoryRow(category)
      }
    }
    // Report swaps animate; under Reduce Motion the bar and fills just change.
    .transaction { transaction in
      if reduceMotion {
        transaction.animation = nil
      }
    }
  }

  private func categoryRow(_ category: RewardCategoryUsage) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      ViewThatFits(in: .horizontal) {
        HStack(spacing: 8) {
          categoryName(category)
            .fixedSize(horizontal: true, vertical: true)
          Spacer(minLength: 0)
          amounts(category)
            .fixedSize(horizontal: true, vertical: true)
        }
        VStack(alignment: .leading, spacing: 4) {
          categoryName(category)
          amounts(category)
        }
      }
      if !category.excluded, let minimum = category.flag.minimumSpend, minimum > 0 {
        Text("\(category.flag.minimumSpendMet == true ? "Minimum met" : "Minimum"): \(money(minimum))")
          .font(.caption)
          .foregroundStyle(Theme.rowSecondary)
      }
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 9)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background {
      LeadingFill(fraction: category.fill, rightToLeft: layoutDirection == .rightToLeft)
        .fill(colour(category).opacity(0.19))
    }
    .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.inset, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: Theme.Radius.inset, style: .continuous)
        .strokeBorder(colour(category).opacity(0.45), lineWidth: 1)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(category.flag.name), \(money(category.spend)) spent")
    .accessibilityValue(accessibilityDetail(category))
  }

  private func categoryName(_ category: RewardCategoryUsage) -> some View {
    HStack(spacing: 6) {
      Circle().fill(colour(category)).frame(width: 8, height: 8)
      Text(category.flag.name).fixedSize(horizontal: false, vertical: true)
    }
  }

  private func amounts(_ category: RewardCategoryUsage) -> some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: 5) {
        amountParts(category)
      }
      .fixedSize(horizontal: true, vertical: true)
      VStack(alignment: .leading, spacing: 4) {
        amountParts(category)
      }
    }
    .font(.subheadline)
    .monospacedDigit()
  }

  @ViewBuilder
  private func amountParts(_ category: RewardCategoryUsage) -> some View {
    Text(money(category.spend)).fontWeight(.semibold)
    if let cap = category.cap, let ratio = category.ratio {
      Text("/\(money(cap))").foregroundStyle(Theme.rowSecondary)
      Text("\(Int((ratio * 100).rounded()))%")
        // Darker than system red on the light tinted fills (normal-text contrast).
        .foregroundStyle(category.warning ? Color(light: 0xA82B24, dark: 0xFF6961) : Theme.rowSecondary)
    } else if !category.excluded {
      Text("No cap").foregroundStyle(Theme.rowSecondary)
    }
  }

  private func colour(_ category: RewardCategoryUsage) -> Color {
    Theme.flagColour(named: category.flag.flagColor) ?? .secondary
  }

  private func money(_ value: Double) -> String {
    MoneyCodec.displayString(forCurrencyUnits: value, currencyFormat: currencyFormat)
  }

  private func accessibilityDetail(_ category: RewardCategoryUsage) -> String {
    if category.excluded { return "Excluded from rewards" }
    var parts: [String] = []
    if let cap = category.cap, let ratio = category.ratio {
      parts.append("Cap \(money(cap)), \(Int((ratio * 100).rounded())) percent used")
    } else {
      parts.append("No cap")
    }
    if let minimum = category.flag.minimumSpend, minimum > 0 {
      parts.append("\(category.flag.minimumSpendMet == true ? "Minimum met" : "Minimum not met"), \(money(minimum))")
    }
    return parts.joined(separator: ". ")
  }
}

/// Totals and the breakdown table for the board's scope, or for a historical
/// range. A range never appears as progress rows.
struct RewardsReportScreen: View {
  @Environment(AppModel.self) private var model
  @State private var filter: RewardsReportFilter
  @State private var group: RewardGroupBy = .flag
  @State private var report: RewardsReport?
  @State private var reportPlanID: String?
  @State private var phase: LoadPhase = .idle
  let allowsRange: Bool

  init(filter: RewardsReportFilter, allowsRange: Bool) {
    _filter = State(initialValue: filter)
    self.allowsRange = allowsRange
  }

  var body: some View {
    List {
      Section {
        if allowsRange {
          ReportFilterBar(range: $filter.range, group: $group, scope: $filter.scope)
        } else {
          Text(scopeDescription)
            .font(.footnote)
            .foregroundStyle(.secondary)
          RewardGroupMenu(group: $group)
        }
      }
      .listRowBackground(Color.clear)
      .listRowSeparator(.hidden)

      if let report = reportPlanID == model.settings.planID ? report : nil {
        if let message = phase.errorMessage {
          Label(message, systemImage: "wifi.exclamationmark")
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
        totalsSection(report)
        if allowsRange, !report.cards.isEmpty {
          Section("Cards") {
            ForEach(report.cards) { row in
              RewardFilledRow(
                projection: .make(row: row, asOf: report.asOf, isRange: true),
                icon: model.accounts.first { $0.id == row.accountId }?.displayIcon,
                currencyFormat: model.currencyFormat,
                memoryScope: "range"
              )
              .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
              .listRowBackground(Color.clear)
            }
          }
        }
        groupsSection(report)
      } else {
        PhasePlaceholder(phase: phase) {
          await fetch()
        }
        .frame(maxWidth: .infinity, minHeight: 200)
        .listRowBackground(Color.clear)
      }
    }
    .listStyle(.insetGrouped)
    .scrollContentBackground(.hidden)
    .background(Theme.canvas)
    .navigationTitle(allowsRange ? "Range Report" : "Summary")
    .navigationBarTitleDisplayMode(.inline)
    .task(id: fetchKey) {
      await fetch()
    }
    .refreshable {
      await fetch()
    }
  }

  private var scopeDescription: String {
    let date = filter.asOfISO.map { "as of \(RewardsCalendar.shortLabel($0, referenceISO: RewardsCalendar.today()))" } ?? "as of today"
    let accounts = filter.scope.accountIDs.isEmpty
      ? "all accounts"
      : "\(filter.scope.accountIDs.count) account\(filter.scope.accountIDs.count == 1 ? "" : "s")"
    return "Current card periods, \(date), \(accounts). Includes hidden and non-featured cards."
  }

  private func totalsSection(_ report: RewardsReport) -> some View {
    Section("Totals") {
      if let asOf = report.asOf {
        LabeledContent("As of", value: RewardsCalendar.shortLabel(asOf, referenceISO: RewardsCalendar.today()))
      }
      LabeledContent("Qualifying spend") {
        Text(money(report.totals.spend)).monospacedDigit()
      }
      LabeledContent("Value") {
        Text(money(report.totals.rewardDollars))
          .monospacedDigit()
          .foregroundStyle(Theme.inflow)
      }
      if report.totals.cashback > 0 {
        LabeledContent("Cashback") {
          Text(money(report.totals.cashback)).monospacedDigit()
        }
      }
      if report.totals.miles > 0 {
        LabeledContent("Miles") {
          Text(RewardRowText.milesString(report.totals.miles)).monospacedDigit()
        }
      }
    }
  }

  @ViewBuilder
  private func groupsSection(_ report: RewardsReport) -> some View {
    if !report.groups.isEmpty {
      Section("By \(group.title) · \(report.groups.count)") {
        ForEach(report.groups) { row in
          HStack(spacing: 8) {
            Circle()
              .fill(Theme.flagColour(named: row.flagColor) ?? Color.secondary.opacity(0.4))
              .frame(width: 8, height: 8)
              .accessibilityHidden(true)
            Text(row.label)
              .lineLimit(1)
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
              Text(money(row.spend))
                .monospacedDigit()
              Text("\(money(row.rewardDollars)) · \(row.transactionCount) txn")
                .font(.caption)
                .monospacedDigit()
                .foregroundStyle(Theme.inflow)
            }
          }
          .accessibilityElement(children: .combine)
        }
      }
    }
  }

  private var fetchKey: String {
    "\(model.settings.planID)|\(model.rewardsRefreshGeneration)|\(filter.key)|\(group.rawValue)"
  }

  private func money(_ value: Double) -> String {
    MoneyCodec.displayString(forCurrencyUnits: value, currencyFormat: model.currencyFormat)
  }

  private func fetch() async {
    let planID = model.settings.planID
    let key = fetchKey
    phase = .loading
    do {
      let next = try await model.apiClient.fetchRewards(
        planID: planID,
        from: filter.from,
        to: filter.to,
        accountIDs: filter.accountIDs,
        group: group
      )
      guard key == fetchKey, planID == model.settings.planID else { return }
      withAnimation(Theme.Motion.arrive) {
        report = next
        reportPlanID = planID
        phase = .loaded
      }
    } catch {
      guard key == fetchKey, planID == model.settings.planID else { return }
      if error is CancellationError || (error as? URLError)?.code == .cancelled {
        return
      }
      phase = .failed(error.localizedDescription)
    }
  }
}

struct RewardsAsOfDateSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Binding var filter: RewardsReportFilter
  @State private var draft: Date

  init(filter: Binding<RewardsReportFilter>) {
    _filter = filter
    _draft = State(initialValue: filter.wrappedValue.useAsOfDate ? filter.wrappedValue.asOfDate : Date())
  }

  var body: some View {
    NavigationStack {
      // Pinned to Singapore so the chosen day is the day sent to the server,
      // whatever zone the device is in.
      DatePicker("As of", selection: $draft, in: ...Date(), displayedComponents: .date)
        .datePickerStyle(.graphical)
        .environment(\.timeZone, RewardsCalendar.timeZone)
        .environment(\.calendar, RewardsCalendar.calendar)
        .padding(.horizontal)
        .navigationTitle("Show Rewards As Of")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("Today") {
              filter.useAsOfDate = false
              filter.asOfDate = Date()
              dismiss()
            }
          }
          ToolbarItem(placement: .confirmationAction) {
            Button("Done") {
              apply()
              dismiss()
            }
          }
        }
    }
    .presentationDetents([.medium, .large])
  }

  private func apply() {
    if RewardsCalendar.isoString(draft) >= RewardsCalendar.today() {
      filter.useAsOfDate = false
      filter.asOfDate = Date()
    } else {
      filter.asOfDate = draft
      filter.useAsOfDate = true
    }
  }
}

struct RewardsValuationSheet: View {
  @Environment(AppModel.self) private var model
  @Environment(\.dismiss) private var dismiss
  @State private var text: String
  @State private var saving = false
  @State private var error: String?

  init(current: Double?) {
    _text = State(initialValue: current.map { String($0) } ?? "")
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("Miles valuation", text: $text)
            .keyboardType(.decimalPad)
            .accessibilityLabel("Miles valuation")
        } footer: {
          Text("Currency units per mile. Zero keeps miles but assigns no cash value.")
        }
        if let error {
          Section {
            Text(error)
              .foregroundStyle(Theme.outflow)
          }
        }
      }
      .navigationTitle("Miles Valuation")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(saving ? "Saving…" : "Save") {
            Task { await save() }
          }
          .disabled(saving)
        }
      }
    }
    .presentationDetents([.medium])
  }

  private func save() async {
    guard !saving else { return }
    guard let value = TypedNumber.double(from: text),
      value.isFinite, value >= 0 else {
      error = "Miles valuation must be a nonnegative number."
      return
    }
    let planID = model.settings.planID
    saving = true
    error = nil
    defer { saving = false }
    do {
      _ = try await model.apiClient.updateRewardSettings(planID: planID, milesValuation: value)
      guard planID == model.settings.planID else { return }
      model.noteRewardsBoardChanged()
      dismiss()
    } catch {
      guard planID == model.settings.planID else { return }
      self.error = error.localizedDescription
    }
  }
}

/// One reward row for an account, shown in its register so the limit is in
/// view while adding transactions. Details and editing stay over the register.
/// Each row is its own List row, so the List animates rows arriving.
struct RegisterRewardRow: View {
  @Environment(AppModel.self) private var model
  let accountID: String
  let row: RewardsCardRow
  let asOf: String?
  @State private var sheet: Sheet?

  private enum Sheet: Identifiable {
    case detail
    case editor

    var id: String { "rewards" }
  }

  var body: some View {
    let projection = RewardRowProjection.make(row: row, asOf: asOf, isRange: false)
    Button {
      sheet = .detail
    } label: {
      RewardFilledRow(
        projection: projection, currencyFormat: model.currencyFormat, placement: .register, memoryScope: "register")
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Rewards, \(projection.title)")
    .accessibilityValue(RewardRowText(projection, currencyFormat: model.currencyFormat).accessibilityValue)
    .accessibilityHint("Shows reward details for this account.")
    .sheet(item: $sheet) { destination in
      Group {
        switch destination {
        case .detail:
          RewardCardDetailSheet(
            row: row,
            asOf: asOf,
            icon: model.accounts.first { $0.id == accountID }?.displayIcon,
            currencyFormat: model.currencyFormat,
            canOpenAccount: false,
            onEdit: { sheet = .editor },
            onOpenAccount: {}
          )
        case .editor:
          RewardCardEditorView(cardID: row.id)
        }
      }
    }
    .blocksCapturePresentation(when: sheet != nil)
    .onChange(of: model.settings.planID) { _, _ in
      sheet = nil
    }
  }
}

extension View {
  /// Fetches the account's reward rows for its register, and again whenever
  /// its transactions change, so a new transaction moves the limit without
  /// leaving the register.
  func loadsRegisterRewards(accountID: String) -> some View {
    modifier(RegisterRewardsLoader(accountID: accountID))
  }
}

private struct RegisterRewardsLoader: ViewModifier {
  @Environment(AppModel.self) private var model
  let accountID: String

  func body(content: Content) -> some View {
    content.task(id: fetchKey) {
      guard let rewards = await model.fetchRegisterRewards(accountID: accountID) else { return }
      withAnimation(Theme.Motion.arrive) {
        model.storeRegisterRewards(rewards, accountID: accountID)
      }
    }
  }

  private var fetchKey: String {
    var hasher = Hasher()
    for transaction in model.transactions where transaction.accountID == accountID {
      hasher.combine(transaction)
    }
    return "\(model.settings.planID)|\(accountID)|\(model.rewardsRefreshGeneration)|\(hasher.finalize())"
  }
}
