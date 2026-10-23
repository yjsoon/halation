import Accessibility
import SwiftUI
import UIKit

extension View {
  func ynabCard() -> some View {
    background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
      .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card, style: .continuous))
  }

  func rollingNumber(_ value: Int) -> some View {
    modifier(RollingNumber(value: value))
  }

  func flagRail(_ colour: Color?) -> some View {
    overlay(alignment: .trailing) {
      if let colour {
        Rectangle()
          .fill(colour)
          .frame(width: 3)
          .accessibilityHidden(true)
      }
    }
  }
}

struct FormCardRow<Content: View>: View {
  let icon: String
  var iconColor: Color = Theme.accent
  var alignment: VerticalAlignment = .center
  var rowIdentifier: String?
  @ViewBuilder var content: () -> Content

  var body: some View {
    HStack(alignment: alignment, spacing: Theme.FormRow.iconSpacing) {
      Image(systemName: icon)
        .foregroundStyle(iconColor)
        .frame(width: Theme.FormRow.iconColumn, alignment: .center)
      content()
    }
    .padding(.horizontal, Theme.FormRow.horizontalPadding)
    .padding(.vertical, Theme.FormRow.verticalPadding)
    .frame(minHeight: Theme.FormRow.height, alignment: .center)
    .contentShape(Rectangle())
    .modifier(OptionalAccessibilityIdentifier(rowIdentifier))
  }
}

private struct OptionalAccessibilityIdentifier: ViewModifier {
  var identifier: String?

  init(_ identifier: String?) {
    self.identifier = identifier
  }

  func body(content: Content) -> some View {
    if let identifier, !identifier.isEmpty {
      content.accessibilityIdentifier(identifier)
#if DEBUG
        .background {
          GeometryReader { geometry in
            Color.clear
              .preference(key: FormRowFramesKey.self, value: [identifier: geometry.frame(in: .global)])
          }
          .accessibilityHidden(true)
        }
#endif
    } else {
      content
    }
  }
}

#if DEBUG
/// Observe the padded SwiftUI row itself, not a native control or an ancestor
/// selected by the minimum height the snapshot test is supposed to verify.
struct FormRowFramesKey: PreferenceKey {
  static var defaultValue: [String: CGRect] { [:] }

  static func reduce(value: inout [String: CGRect], nextValue: () -> [String: CGRect]) {
    value.merge(nextValue(), uniquingKeysWith: { _, new in new })
  }
}
#endif

struct DisclosureValueRow: View {
  let icon: String
  let caption: String
  let value: String?
  var placeholder: String
  /// Card layouts draw this trailing chevron. Form and List `NavigationLink`s
  /// already supply one, so pass `false` there or the row shows a double `>`.
  var showsChevron = true
  /// Card rows apply the shared insets and minimum height. Form/List links
  /// inherit the list's own chrome, so they pass `false` with `showsChevron`.
  var appliesCardMetrics = true
  var rowIdentifier: String?

  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  init(
    icon: String,
    caption: String,
    value: String?,
    placeholder: String,
    showsChevron: Bool = true,
    appliesCardMetrics: Bool? = nil,
    rowIdentifier: String? = nil
  ) {
    self.icon = icon
    self.caption = caption
    self.value = value
    self.placeholder = placeholder
    self.showsChevron = showsChevron
    self.appliesCardMetrics = appliesCardMetrics ?? showsChevron
    self.rowIdentifier = rowIdentifier
  }

  var body: some View {
    HStack(alignment: .center, spacing: Theme.FormRow.iconSpacing) {
      Image(systemName: icon)
        .foregroundStyle(Theme.accent)
        .frame(width: Theme.FormRow.iconColumn, alignment: .center)

      titleAndValue

      if showsChevron {
        Image(systemName: "chevron.right")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(.tertiary)
      }
    }
    .padding(.horizontal, appliesCardMetrics ? Theme.FormRow.horizontalPadding : 0)
    .padding(.vertical, appliesCardMetrics ? Theme.FormRow.verticalPadding : 0)
    .frame(minHeight: appliesCardMetrics ? Theme.FormRow.height : nil, alignment: .center)
    .contentShape(Rectangle())
    .modifier(OptionalAccessibilityIdentifier(rowIdentifier))
  }

  private var hasValue: Bool {
    if let value, !value.isEmpty { return true }
    return false
  }

  @ViewBuilder
  private var titleAndValue: some View {
    if hasValue, let value {
      if dynamicTypeSize.isAccessibilitySize {
        VStack(alignment: .leading, spacing: 2) {
          Text(caption)
            .foregroundStyle(Theme.textPrimary)
          Text(value)
            .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      } else {
        HStack(spacing: 8) {
          Text(caption)
            .foregroundStyle(Theme.textPrimary)
            .layoutPriority(1)
          Spacer(minLength: 8)
          Text(value)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.trailing)
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
      }
    } else {
      Text(placeholder)
        .foregroundStyle(Theme.textPrimary.opacity(0.75))
      Spacer(minLength: 0)
    }
  }
}

private struct RollingNumber: ViewModifier {
  let value: Int
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func body(content: Content) -> some View {
    content
      .contentTransition(reduceMotion ? .identity : .numericText(value: Double(value)))
      .animation(reduceMotion ? nil : Theme.Motion.standard, value: value)
  }
}

/// Tappable cards and tiles sink slightly under the finger, so a tap that
/// pushes a screen or opens a sheet has visible touch-down feedback.
/// Avoid it on whole `List`/`Form` rows, which draw their own highlight.
struct PressableButtonStyle: ButtonStyle {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
      .opacity(configuration.isPressed ? 0.85 : 1)
      .animation(Theme.Motion.press, value: configuration.isPressed)
  }
}

extension ButtonStyle where Self == PressableButtonStyle {
  static var pressable: PressableButtonStyle { PressableButtonStyle() }
}

/// Rows stacked inside a `ynabCard()` highlight in place, like a List row,
/// instead of shrinking away from their neighbours.
struct CardRowButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background {
        if configuration.isPressed {
          Theme.surfaceMuted
        }
      }
      .animation(Theme.Motion.press, value: configuration.isPressed)
  }
}

extension ButtonStyle where Self == CardRowButtonStyle {
  static var cardRow: CardRowButtonStyle { CardRowButtonStyle() }
}

/// Divider aligned past the leading icon column of `DisclosureValueRow`.
struct CardDivider: View {
  var body: some View {
    Divider().padding(.leading, Theme.FormRow.dividerLeading)
  }
}

/// Wraps chips onto another line instead of compressing them off-screen.
struct WrappingHStack: Layout {
  var spacing: CGFloat = 8
  var lineSpacing: CGFloat = 8

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    arrange(in: proposal.width ?? 0, subviews: subviews).size
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    let origins = arrange(in: bounds.width, subviews: subviews).origins
    for (subview, origin) in zip(subviews, origins) {
      subview.place(
        at: CGPoint(x: bounds.minX + origin.x, y: bounds.minY + origin.y),
        proposal: .unspecified
      )
    }
  }

  private func arrange(in width: CGFloat, subviews: Subviews) -> (size: CGSize, origins: [CGPoint]) {
    var origins: [CGPoint] = []
    var x: CGFloat = 0
    var y: CGFloat = 0
    var rowHeight: CGFloat = 0
    var usedWidth: CGFloat = 0

    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if width > 0, x > 0, x + size.width > width {
        x = 0
        y += rowHeight + lineSpacing
        rowHeight = 0
      }
      origins.append(CGPoint(x: x, y: y))
      rowHeight = max(rowHeight, size.height)
      usedWidth = max(usedWidth, x + size.width)
      x += size.width + spacing
    }

    return (CGSize(width: usedWidth, height: y + rowHeight), origins)
  }
}

/// Capsule used by Reflect filter menus and scope pickers.
struct FilterChip: View {
  let label: String
  var isActive = false
  var showsChevron = true

  var body: some View {
    HStack(spacing: 5) {
      Text(label)
        .font(.footnote.weight(.medium))
      if showsChevron {
        Image(systemName: "chevron.down")
          .font(.caption.weight(.semibold))
          .accessibilityHidden(true)
      }
    }
    .foregroundStyle(isActive ? Theme.card : Theme.accent)
    .padding(.horizontal, 12)
    .padding(.vertical, 7)
    .background(isActive ? AnyShapeStyle(Theme.accent) : AnyShapeStyle(Theme.surfaceMuted), in: Capsule())
    .animation(Theme.Motion.standard, value: isActive)
    .animation(Theme.Motion.standard, value: label)
  }
}

/// `‹ June 2026 ›` month stepper, clamped to the current month.
struct MonthStepper: View {
  @Binding var monthAnchor: Date
  /// Direction of the last step, so the label rolls the way the user moved.
  @State private var steppedBack = false
  @State private var steps = 0

  var body: some View {
    HStack {
      stepButton(systemName: "chevron.left", monthDelta: -1)
      Spacer()
      Text(monthAnchor.monthYearLabel)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(Theme.accent)
        .contentTransition(.numericText(countsDown: steppedBack))
        .animation(Theme.Motion.standard, value: monthAnchor)
      Spacer()
      stepButton(systemName: "chevron.right", monthDelta: 1)
        .disabled(isCurrentMonth)
        .opacity(isCurrentMonth ? 0.3 : 1)
        .animation(Theme.Motion.standard, value: isCurrentMonth)
    }
    .padding(.horizontal, 8)
    .sensoryFeedback(.selection, trigger: steps)
  }

  private var isCurrentMonth: Bool {
    monthAnchor.startOfMonth() >= Date.now.startOfMonth()
  }

  private func stepButton(systemName: String, monthDelta: Int) -> some View {
    Button {
      if let next = LedgerDate.gregorian.date(byAdding: .month, value: monthDelta, to: monthAnchor) {
        steppedBack = monthDelta < 0
        steps += 1
        monthAnchor = next
      }
    } label: {
      Image(systemName: systemName)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(Theme.accent)
        .padding(8)
        .background(Theme.surfaceMuted, in: Circle())
        .contentShape(Circle())
    }
    .buttonStyle(.pressable)
  }
}

/// `‹ September 2026 ›` stepper for any report period, with 44pt chevrons.
struct PeriodStepper: View {
  let label: String
  var canGoBack: Bool
  var canGoForward: Bool
  var onBack: () -> Void
  var onForward: () -> Void
  @State private var steppedBack = false
  @State private var steps = 0

  var body: some View {
    HStack {
      stepButton(systemName: "chevron.left", enabled: canGoBack, back: true)
      Spacer()
      Text(label)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(Theme.accent)
        .multilineTextAlignment(.center)
        .contentTransition(.numericText(countsDown: steppedBack))
        .animation(Theme.Motion.standard, value: label)
      Spacer()
      stepButton(systemName: "chevron.right", enabled: canGoForward, back: false)
    }
    .padding(.horizontal, 8)
    .sensoryFeedback(.selection, trigger: steps)
  }

  private func stepButton(systemName: String, enabled: Bool, back: Bool) -> some View {
    Button {
      steppedBack = back
      steps += 1
      if back {
        onBack()
      } else {
        onForward()
      }
    } label: {
      Image(systemName: systemName)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(Theme.accent)
        .frame(minWidth: 44, minHeight: 44)
        .background(Theme.surfaceMuted, in: Circle())
        .contentShape(Circle())
    }
    .disabled(!enabled)
    .opacity(enabled ? 1 : 0.3)
    .buttonStyle(.pressable)
    .accessibilityLabel(back ? "Previous period" : "Next period")
  }
}

enum AppTab: Hashable, CaseIterable {
  case accounts
  case rewards
  case reflect
  case assistant

  static var compactDestinations: [AppTab] { CompactRootBar.destinationTabs }

  var isCompactDestination: Bool {
    Self.compactDestinations.contains(self)
  }

  var title: String {
    switch self {
    case .accounts: return "Accounts"
    case .rewards: return "Rewards"
    case .reflect: return "Insights"
    case .assistant: return "Assistant"
    }
  }

  var systemImage: String {
    switch self {
    case .accounts: return "building.columns"
    case .rewards: return "creditcard"
    case .reflect: return "chart.bar.fill"
    case .assistant: return "bubble.left.and.bubble.right"
    }
  }

  var captureSurface: CaptureSurface {
    switch self {
    case .accounts: return .accounts
    case .rewards: return .rewards
    case .reflect: return .reflect
    case .assistant: return .assistant
    }
  }

  var overflowDestination: MoreDestination? {
    switch self {
    case .assistant: return .assistant
    case .accounts, .rewards, .reflect: return nil
    }
  }

  var compactBarSelection: CompactBarSelection? {
    switch self {
    case .accounts: return .accounts
    case .rewards: return .rewards
    case .reflect: return .reflect
    case .assistant: return nil
    }
  }
}

enum CompactBarSelection: Hashable, CaseIterable {
  case accounts
  case rewards
  case reflect
  case addTransaction

  var tab: AppTab? {
    switch self {
    case .accounts: return .accounts
    case .rewards: return .rewards
    case .reflect: return .reflect
    case .addTransaction: return nil
    }
  }
}

enum CompactRootBar {
  static let destinations: (AppTab, AppTab, AppTab) = (.accounts, .rewards, .reflect)
  static let action = RootTrailingAction.addTransaction
  static let actionSelection = CompactBarSelection.addTransaction

  static var destinationTabs: [AppTab] {
    let (first, second, third) = destinations
    return [first, second, third]
  }
}

enum RootTrailingAction: Equatable {
  case addTransaction
  case assistant

  var title: String {
    switch self {
    case .addTransaction: return "Add Transaction"
    case .assistant: return "Assistant"
    }
  }

  var systemImage: String {
    switch self {
    case .addTransaction: return "plus"
    case .assistant: return "plus.bubble"
    }
  }
}

enum MoreDestination: Hashable, CaseIterable, Identifiable {
  case assistant

  var id: Self { self }

  var title: String {
    switch self {
    case .assistant: return "Assistant"
    }
  }

  var systemImage: String {
    switch self {
    case .assistant: return "bubble.left.and.bubble.right"
    }
  }

  var captureSurface: CaptureSurface {
    switch self {
    case .assistant: return .assistant
    }
  }

  var tab: AppTab {
    switch self {
    case .assistant: return .assistant
    }
  }

  static func menuItems(omitting: MoreDestination?) -> [MoreDestination] {
    allCases.filter { $0 != omitting }
  }

  static func overflowItems(
    usesSidebar: Bool,
    omitting: MoreDestination?
  ) -> [MoreDestination] {
    guard !usesSidebar else {
      return []
    }
    return menuItems(omitting: omitting)
  }
}

enum RootChrome {
  static let compactTabRowClearance: CGFloat = 90
  /// Space above the compact tab bar reserved for the floating Assistant.
  static let compactFloatingAssistantClearance = RootAddControl.diameter + 10
  static let compactToastGap: CGFloat = 12

  static func usesSidebar(
    idiom: UIUserInterfaceIdiom,
    horizontalSizeClass: UserInterfaceSizeClass?
  ) -> Bool {
    idiom == .pad && horizontalSizeClass == .regular
  }

  /// Compact iPhone / iPad-compact tab bar. Regular-width sidebar is unchanged.
  /// Includes a pushed Assistant conversation so this hide cannot restore
  /// `.automatic` over `AssistantView` / `AddTransactionsView`.
  static func hidesCompactTabBar(
    usesSidebar: Bool,
    hidesTabRowOverlay: Bool,
    assistantConversationPushed: Bool
  ) -> Bool {
    !usesSidebar && (hidesTabRowOverlay || assistantConversationPushed)
  }

  static func addControlInsets(
    idiom: UIUserInterfaceIdiom,
    horizontalSizeClass: UserInterfaceSizeClass?
  ) -> EdgeInsets {
    if usesSidebar(idiom: idiom, horizontalSizeClass: horizontalSizeClass) {
      return EdgeInsets(top: 0, leading: 0, bottom: 28, trailing: 20)
    }
    return EdgeInsets(top: 0, leading: 0, bottom: compactTabRowClearance, trailing: 16)
  }

  static func toastBottomPadding(
    idiom: UIUserInterfaceIdiom,
    horizontalSizeClass: UserInterfaceSizeClass?
  ) -> CGFloat {
    if usesSidebar(idiom: idiom, horizontalSizeClass: horizontalSizeClass) {
      return 28 + RootAddControl.diameter + 8
    }
    return compactToastGap
  }
}

struct RootSaveToastOverlay: View {
  @Environment(AppModel.self) private var model
  var bottomPadding: CGFloat

  var body: some View {
    Group {
      if let message = model.lastSaveMessage {
        // A failure stays up longer, so a tap dismisses it early. One view
        // for both kinds keeps the icon's replace transition.
        let isFailure = message.kind == .failure
        HStack(spacing: 8) {
          Image(systemName: isFailure ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
            .foregroundStyle(isFailure ? Theme.outflow : Theme.inflow)
            .contentTransition(.symbolEffect(.replace))
            .accessibilityHidden(true)
          Text(message.text)
            .foregroundStyle(isFailure ? Theme.outflow : Theme.textPrimary)
            // VoiceOver hears the whole message as an announcement.
            .lineLimit(3)
          if isFailure {
            Image(systemName: "xmark")
              .font(.caption.weight(.semibold))
              .foregroundStyle(.secondary)
              .accessibilityHidden(true)
          }
        }
        .font(.footnote.weight(.medium))
        .accessibilityElement(children: .combine)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .glassEffect(.regular, in: .capsule)
        // Clear margin lifts the tap target to the 44-point minimum.
        .padding(.vertical, 4)
        .contentShape(.rect)
        .onTapGesture {
          model.dismissSaveMessage()
        }
        .allowsHitTesting(isFailure)
        .accessibilityAddTraits(isFailure ? .isButton : [])
        .accessibilityHint(isFailure ? "Dismisses the message." : "")
        .accessibilityAction(.escape) {
          model.dismissSaveMessage()
        }
        .padding(.bottom, bottomPadding)
        .transition(
          .move(edge: .bottom)
            .combined(with: .opacity)
            .combined(with: .scale(scale: 0.9, anchor: .bottom))
        )
      }
    }
    .animation(Theme.Motion.arrive, value: model.lastSaveMessage?.id)
  }
}

@MainActor
@Observable
final class RootChromeState {
  var tab: AppTab = .accounts {
    didSet {
      if tab.isCompactDestination {
        lastCompactTab = tab
      }
    }
  }
  private var lastCompactTab: AppTab = .accounts
  private var overflowByTab: [AppTab: MoreDestination] = [:]

  func overflow(on tab: AppTab) -> MoreDestination? {
    overflowByTab[tab]
  }

  func openMore(_ destination: MoreDestination) {
    if overflowByTab[tab] == destination {
      return
    }
    overflowByTab[tab] = destination
  }

  func dismissMore() {
    overflowByTab[tab] = nil
  }

  /// A cross-tab link to an account register. Accounts consumes (clears) the
  /// request once it has acted on it.
  var pendingAccountID: String?
  /// An Inbox notification tap or link; Accounts consumes it.
  var pendingIntakeDestination: IntakeDestination?

  func showIntake(_ route: IntakeDestination) {
    overflowByTab[.accounts] = nil
    pendingIntakeDestination = route
    tab = .accounts
  }

  func showAccount(_ accountID: String) {
    overflowByTab[.accounts] = nil
    pendingAccountID = accountID
    tab = .accounts
  }

  func adoptSidebarLayout() {
    guard let overflow = overflow(on: tab) else {
      return
    }
    overflowByTab[tab] = nil
    tab = overflow.tab
  }

  func adoptCompactLayout() {
    guard let destination = tab.overflowDestination else {
      return
    }
    tab = lastCompactTab
    openMore(destination)
  }

  /// Compact TabView only hosts Accounts / Rewards / Reflect. Assistant
  /// stays in a More overlay, so the bar selection must never be that value.
  var compactBarTab: AppTab {
    tab.isCompactDestination ? tab : lastCompactTab
  }

  var captureSurface: CaptureSurface {
    if tab.isCompactDestination, let overflow = overflowByTab[tab] {
      return overflow.captureSurface
    }
    return tab.captureSurface
  }
}

/// Applies chrome inside the hosted view body. TabView drops modifiers
/// attached to `Tab` content, which otherwise crashes DestinationsMenu.
struct RootChromeScope<Content: View>: View {
  var chrome: RootChromeState
  var content: Content

  init(chrome: RootChromeState, @ViewBuilder content: () -> Content) {
    self.chrome = chrome
    self.content = content()
  }

  var body: some View {
    content.environment(chrome)
  }
}

/// Writes tab-bar visibility only on the compact path. The sidebar tree
/// must not get an explicit `.toolbar(..., for: .tabBar)`.
private struct CompactTabBarVisibility: ViewModifier {
  var hidden: Bool
  var enabled: Bool = true

  func body(content: Content) -> some View {
    if enabled {
      content.toolbar(hidden ? .hidden : .automatic, for: .tabBar)
    } else {
      content
    }
  }
}

/// Phone and iPad need separate TabView trees. `sidebarAdaptable` plus a
/// selection that is not in the current tab set fatal-errors on launch.
struct RootTabView: View {
  @Environment(AppModel.self) private var model
  @Bindable var chrome: RootChromeState
  var usesSidebar: Bool
  var workspace: CaptureWorkspace = .shared
  var presentingManually: (() -> Void)?

  var body: some View {
    @Bindable var router = CaptureRouter.shared
    @Bindable var workspace = workspace
    if usesSidebar {
      TabView(selection: $chrome.tab) {
        Tab(AppTab.accounts.title, systemImage: AppTab.accounts.systemImage, value: AppTab.accounts) {
          RootChromeScope(chrome: chrome) {
            RootTabHost(for: .accounts, workspace: workspace) {
              AccountsView(usesSplit: usesSidebar)
            }
          }
        }
        .badge(IntakeCoordinator.shared.attentionCount)
        Tab(AppTab.rewards.title, systemImage: AppTab.rewards.systemImage, value: AppTab.rewards) {
          RootChromeScope(chrome: chrome) {
            RootTabHost(for: .rewards, workspace: workspace) {
              NavigationStack {
                RewardsView()
              }
            }
          }
        }
        Tab(AppTab.reflect.title, systemImage: AppTab.reflect.systemImage, value: AppTab.reflect) {
          RootChromeScope(chrome: chrome) {
            RootTabHost(for: .reflect, workspace: workspace) {
              NavigationStack {
                ReflectView()
              }
            }
          }
        }
        Tab(AppTab.assistant.title, systemImage: AppTab.assistant.systemImage, value: AppTab.assistant) {
          RootChromeScope(chrome: chrome) {
            NavigationStack {
              AssistantView(workspace: workspace)
            }
          }
        }
      }
      .tabViewStyle(.sidebarAdaptable)
      .defaultAdaptableTabBarPlacement(.sidebar)
    } else {
      TabView(selection: compactBarSelection) {
        compactDestinationTab(CompactRootBar.destinations.0)
        compactDestinationTab(CompactRootBar.destinations.1)
        compactDestinationTab(CompactRootBar.destinations.2)
        RootCaptureTab()
      }
      .tabViewStyle(.tabBarOnly)
      .tabBarMinimizeBehavior(.onScrollDown)
      // TabView owns the iOS 26 pill/Add. RootTabHost writes the same
      // visibility: iOS 18+ keeps the value nearest the tab root, and
      // `.automatic` there would restore the bar over a pushed Assistant
      // conversation.
      .modifier(CompactTabBarVisibility(
        hidden: RootChrome.hidesCompactTabBar(
          usesSidebar: false,
          hidesTabRowOverlay: router.hidesTabRowOverlay,
          // A stale pending session on another tab must not leave the bar hidden.
          assistantConversationPushed: chrome.captureSurface == .assistant
            && workspace.pendingAssistantSessionID != nil
        )
      ))
      .overlay {
        RootTabBarFloatingAssistant(
          // The button lives on the window, above every SwiftUI overlay, so
          // onboarding (Welcome, and sign-in opened from it) hides it.
          isSuppressed: model.isShowingWelcome || (model.isShowingSettings && model.canReturnToWelcome),
          openAssistant: { chrome.openMore(.assistant) }
        )
        .allowsHitTesting(false)
        .accessibilityHidden(true)
      }
    }
  }

  @TabContentBuilder<CompactBarSelection>
  private func compactDestinationTab(_ tab: AppTab) -> some TabContent<CompactBarSelection> {
    Tab(tab.title, systemImage: tab.systemImage, value: tab.compactBarSelection ?? .accounts) {
      RootChromeScope(chrome: chrome) {
        RootTabHost(for: tab, workspace: workspace) {
          compactDestinationRoot(tab)
        }
      }
    }
    // Ready plus Needs you; zero hides the badge.
    .badge(tab == .accounts ? IntakeCoordinator.shared.attentionCount : 0)
  }

  @ViewBuilder
  private func compactDestinationRoot(_ tab: AppTab) -> some View {
    switch tab {
    case .accounts:
      AccountsView(usesSplit: usesSidebar)
    case .rewards:
      NavigationStack {
        RewardsView()
      }
    case .reflect:
      NavigationStack {
        ReflectView()
      }
    case .assistant:
      EmptyView()
    }
  }

  private var compactBarSelection: Binding<CompactBarSelection> {
    Binding(
      get: { chrome.compactBarTab.compactBarSelection ?? .accounts },
      set: { selection in
        if selection == CompactRootBar.actionSelection {
          presentManual()
          return
        }
        if let tab = selection.tab {
          chrome.tab = tab
        }
      }
    )
  }

  private func presentManual() {
    if let presentingManually {
      presentingManually()
      return
    }
    model.presentManualTransaction(origin: model.addTransactionsOrigin())
  }
}

/// The compact action stays separate from the destination pill.
struct RootCaptureTab: TabContent {
  private var role: TabRole {
    // `TabRole.prominent` ships in the iOS 27 SDK; Xcode 26 must still build.
    #if compiler(>=6.4)
    if #available(iOS 27.0, *) {
      // Search no longer guarantees the separate prominent treatment.
      return .prominent
    }
    #endif
    return .search
  }

  var body: some TabContent<CompactBarSelection> {
    Tab(
      CompactRootBar.action.title,
      systemImage: CompactRootBar.action.systemImage,
      value: CompactRootBar.actionSelection,
      role: role
    ) {
      Color.clear
    }
  }
}

struct RootTabBarFloatingAssistant: UIViewControllerRepresentable {
  var isSuppressed = false
  var openAssistant: () -> Void

  func makeUIViewController(context: Context) -> Controller {
    let controller = Controller()
    controller.openAssistant = openAssistant
    controller.isSuppressed = isSuppressed
    return controller
  }

  func updateUIViewController(_ controller: Controller, context: Context) {
    controller.openAssistant = openAssistant
    controller.isSuppressed = isSuppressed
    controller.startTracking()
    controller.install()
  }

  static func dismantleUIViewController(_ controller: Controller, coordinator: ()) {
    controller.stopTracking()
    controller.uninstall()
  }

  final class Controller: UIViewController {
    var openAssistant: () -> Void = {}
    var isSuppressed = false
    private var assistantButton: UIButton?
    private var displayLink: CADisplayLink?
    /// The tab bar the last search found. Display ticks read its frames
    /// instead of searching the window again.
    private weak var trackedTabBar: UITabBar?
    /// Starts due, so the first install searches straight away.
    private var ticksSinceSearch = Controller.ticksPerSearch
    /// Ticks between searches while no shown tab bar is tracked, so a bar
    /// that replaces a hidden one is picked up within about half a second.
    private static let ticksPerSearch = 5

    override func loadView() {
      view = UIView()
      view.isUserInteractionEnabled = false
      view.backgroundColor = .clear
      view.isAccessibilityElement = false
      view.accessibilityElementsHidden = true
    }

    override func viewDidAppear(_ animated: Bool) {
      super.viewDidAppear(animated)
      startTracking()
      install()
    }

    override func viewDidDisappear(_ animated: Bool) {
      stopTracking()
      super.viewDidDisappear(animated)
    }

    override func viewDidLayoutSubviews() {
      super.viewDidLayoutSubviews()
      install()
    }

    func install() {
      if isSuppressed || CaptureRouter.shared.hidesTabRowOverlay {
        hideAssistant()
        return
      }
      guard let window = view.window else {
        return
      }
      // Hide when the tab row's Add is gone, not when a leftover system
      // UITabBarController.tabBar happens to be hidden.
      guard let addFrame = addFrame(in: window) else {
        hideAssistant()
        return
      }
      startTracking()
      layoutAssistant(relativeTo: addFrame, in: window)
    }

    func uninstall() {
      hideAssistant()
      assistantButton = nil
    }

    private func hideAssistant() {
      assistantButton?.isHidden = true
      assistantButton?.removeFromSuperview()
    }

    private func layoutAssistant(relativeTo pin: CGRect, in window: UIWindow) {
      let button = assistantButton ?? makeAssistantButton()
      assistantButton = button
      if isSuppressed || CaptureRouter.shared.hidesTabRowOverlay {
        hideAssistant()
        return
      }
      if button.superview !== window {
        button.removeFromSuperview()
        window.addSubview(button)
      }
      button.tintColor = window.tintColor

      let gap: CGFloat = 10
      let side = max(44, min(max(pin.width, pin.height), 56))
      let size = CGSize(width: side, height: side)
      button.isHidden = false
      button.layer.cornerRadius = size.height / 2
      button.clipsToBounds = false
      button.frame = CGRect(
        x: pin.midX - size.width / 2,
        y: pin.minY - gap - size.height,
        width: size.width,
        height: size.height
      )
      window.bringSubviewToFront(button)
    }

    private func makeAssistantButton() -> UIButton {
      let button = UIButton(type: .system)
      var configuration = UIButton.Configuration.glass()
      configuration.image = UIImage(systemName: RootTrailingAction.assistant.systemImage)
      configuration.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(pointSize: 18, weight: .semibold)
      configuration.baseForegroundColor = .label
      configuration.cornerStyle = .capsule
      button.configuration = configuration
      button.accessibilityLabel = RootTrailingAction.assistant.title
      button.accessibilityTraits = .button
      button.isAccessibilityElement = true
      button.addAction(UIAction { [weak self] _ in
        self?.openAssistant()
      }, for: .touchUpInside)
      button.addAction(UIAction { [weak self] _ in
        self?.openAssistant()
      }, for: .primaryActionTriggered)
      return button
    }

    func startTracking() {
      guard displayLink == nil else { return }
      let link = CADisplayLink(target: self, selector: #selector(onDisplayTick))
      link.preferredFrameRateRange = CAFrameRateRange(minimum: 8, maximum: 15, preferred: 10)
      link.add(to: .main, forMode: .common)
      displayLink = link
    }

    func stopTracking() {
      displayLink?.invalidate()
      displayLink = nil
    }

    @objc private func onDisplayTick() {
      install()
    }

    /// The tab row's Add: the tab bar's trailing accessory, a glass circle
    /// beside the destinations' pill. Found by geometry, not by label: iOS 26
    /// tab buttons carry accessibility labels only while an accessibility
    /// client (VoiceOver, UI tests) is running, so a label search found
    /// nothing on most phones.
    private func addFrame(in window: UIWindow) -> CGRect? {
      guard let bar = tabBar(in: window), isShownInHierarchy(bar) else {
        return nil
      }
      let barFrame = bar.convert(bar.bounds, to: window)
      let maxSide = barFrame.width / 2
      let trailing = bar.effectiveUserInterfaceLayoutDirection == .leftToRight
      let accessories = bar.subviews.filter { isShownCircle($0, narrowerThan: maxSide) }
      guard
        let accessory = trailing
          ? accessories.max(by: { $0.frame.midX < $1.frame.midX })
          : accessories.min(by: { $0.frame.midX < $1.frame.midX })
      else {
        return nil
      }
      // Minimised, the bar keeps the accessory's frame and shows a smaller
      // circle inside it.
      let shown = accessory.subviews
        .filter { isShownCircle($0, narrowerThan: maxSide) }
        .max { $0.bounds.width < $1.bounds.width } ?? accessory
      let frame = shown.convert(shown.bounds, to: window)
      guard
        frame.midY > window.bounds.midY,
        trailing ? frame.midX > barFrame.midX : frame.midX < barFrame.midX,
        window.bounds.intersects(frame)
      else {
        return nil
      }
      return frame
    }

    /// The tracked tab bar while it is in this window and shown. Otherwise the
    /// window is searched again, at most every few ticks, preferring a shown
    /// bar over a leftover hidden one.
    private func tabBar(in window: UIWindow) -> UITabBar? {
      ticksSinceSearch += 1
      let tracked = trackedTabBar.flatMap { $0.window === window ? $0 : nil }
      if let tracked, isShownInHierarchy(tracked) {
        return tracked
      }
      if ticksSinceSearch < Self.ticksPerSearch {
        return tracked
      }
      ticksSinceSearch = 0
      let bars = tabBars(in: window).filter { $0.bounds.width > 1 && $0.bounds.height > 1 }
      trackedTabBar = bars.first { isShownInHierarchy($0) } ?? bars.first
      return trackedTabBar
    }

    private func isShownCircle(_ view: UIView, narrowerThan maxSide: CGFloat) -> Bool {
      let size = view.bounds.size
      return !view.isHidden
        && view.alpha > 0.01
        && size.width >= 30
        && size.height >= 30
        && size.width < maxSide
        && abs(size.width - size.height) <= size.height / 4
    }

    private func tabBars(in view: UIView) -> [UITabBar] {
      var found: [UITabBar] = []
      func walk(_ node: UIView) {
        if let bar = node as? UITabBar {
          found.append(bar)
        }
        for subview in node.subviews {
          walk(subview)
        }
      }
      walk(view)
      return found
    }

    private func isShownInHierarchy(_ view: UIView) -> Bool {
      var current: UIView? = view
      while let node = current {
        if node.isHidden || node.alpha <= 0.01 {
          return false
        }
        current = node.superview
      }
      return true
    }
  }
}

struct RootTabHost<Content: View>: View {
  @Environment(RootChromeState.self) private var chrome
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass
  let hostedTab: AppTab
  var workspace: CaptureWorkspace = .shared
  var content: Content

  init(
    for hostedTab: AppTab,
    workspace: CaptureWorkspace = .shared,
    @ViewBuilder content: () -> Content
  ) {
    self.hostedTab = hostedTab
    self.workspace = workspace
    self.content = content()
  }

  var body: some View {
    @Bindable var router = CaptureRouter.shared
    @Bindable var workspace = workspace
    let usesSidebar = RootChrome.usesSidebar(
      idiom: UIDevice.current.userInterfaceIdiom,
      horizontalSizeClass: horizontalSizeClass
    )
    let overflow = usesSidebar ? nil : chrome.overflow(on: hostedTab)
    let hidesTabBar = RootChrome.hidesCompactTabBar(
      usesSidebar: usesSidebar,
      hidesTabRowOverlay: router.hidesTabRowOverlay,
      assistantConversationPushed: chrome.captureSurface == .assistant
        && workspace.pendingAssistantSessionID != nil
    )
    ZStack(alignment: .bottom) {
      ZStack {
        content
          .allowsHitTesting(overflow == nil)
          .accessibilityHidden(overflow != nil)
        if let overflow {
          RootMoreHost(destination: overflow, workspace: workspace)
            .transition(.move(edge: .trailing))
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .animation(Theme.Motion.standard, value: overflow)
      .modifier(CompactTabBarVisibility(hidden: hidesTabBar, enabled: !usesSidebar))
      .safeAreaInset(edge: .bottom, spacing: 0) {
        if !usesSidebar,
           !router.hidesTabRowOverlay,
           workspace.pendingAssistantSessionID == nil
        {
          Color.clear
            .frame(height: RootChrome.compactFloatingAssistantClearance)
            .accessibilityHidden(true)
        }
      }

      if !usesSidebar, hostedTab == chrome.compactBarTab {
        RootSaveToastOverlay(bottomPadding: RootChrome.compactToastGap)
      }
    }
  }
}

struct RootMoreHost: View {
  @Environment(RootChromeState.self) private var chrome
  let destination: MoreDestination
  var workspace: CaptureWorkspace = .shared

  var body: some View {
    NavigationStack {
      destinationRoot
        .toolbar {
          ToolbarItem(placement: .topBarLeading) {
            Button {
              chrome.dismissMore()
            } label: {
              Label(chrome.tab.title, systemImage: "chevron.left")
            }
            .accessibilityLabel("Back")
          }
        }
    }
    .background(Theme.canvas)
  }

  @ViewBuilder
  private var destinationRoot: some View {
    switch destination {
    case .assistant:
      AssistantView(workspace: workspace)
    }
  }
}

struct RootAddControl: View {
  @Environment(AppModel.self) private var model
  @Environment(RootChromeState.self) private var chrome
  var workspace: CaptureWorkspace = .shared
  var presenting: (() -> Void)?
  var presentingManually: (() -> Void)?

  static let diameter: CGFloat = 56

  var body: some View {
    if isVisible {
      button
    }
  }

  private var isVisible: Bool {
    !(chrome.captureSurface == .assistant && workspace.pendingAssistantSessionID != nil)
  }

  private var button: some View {
    Button(action: addConversationally) {
      Image(systemName: "plus")
        .font(.title2.weight(.semibold))
        .foregroundStyle(.white)
        .frame(width: Self.diameter, height: Self.diameter)
        .background(Theme.accent, in: Circle())
        .shadow(color: .black.opacity(0.18), radius: 8, y: 4)
        .accessibilityHidden(true)
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Add Transactions")
    .accessibilityAddTraits(.isButton)
    .accessibilityAction(named: "Add manually", addManually)
    .contextMenu {
      Button("Add manually", systemImage: "square.and.pencil", action: addManually)
    }
    .frame(minWidth: 44, minHeight: 44)
  }

  private func addConversationally() {
    if let presenting {
      presenting()
      return
    }
    model.presentAddTransactions(origin: model.addTransactionsOrigin())
  }

  private func addManually() {
    if let presentingManually {
      presentingManually()
      return
    }
    model.presentManualTransaction(origin: model.addTransactionsOrigin())
  }
}

struct DestinationsMenu<Leading: View>: View {
  var omitting: MoreDestination?
  /// Screen-specific actions, shown as the first section.
  var leading: Leading
  @Environment(AppModel.self) private var model
  @Environment(RootChromeState.self) private var chrome
  @Environment(\.horizontalSizeClass) private var horizontalSizeClass

  init(omitting: MoreDestination? = nil, @ViewBuilder leading: () -> Leading) {
    self.omitting = omitting
    self.leading = leading()
  }

  var body: some View {
    let overflowItems = MoreDestination.overflowItems(
      usesSidebar: RootChrome.usesSidebar(
        idiom: UIDevice.current.userInterfaceIdiom,
        horizontalSizeClass: horizontalSizeClass
      ),
      omitting: omitting
    )
    Menu {
      Section {
        leading
      }
      if !overflowItems.isEmpty {
        ForEach(overflowItems) { destination in
          Button {
            chrome.openMore(destination)
          } label: {
            Label(destination.title, systemImage: destination.systemImage)
          }
        }
        Divider()
      }
      Button {
        model.isShowingSettings = true
      } label: {
        Label("Settings", systemImage: "gearshape")
      }
    } label: {
      Label("More", systemImage: "ellipsis.circle")
    }
    .tint(Theme.accent)
    .accessibilityLabel("More")
  }
}

extension DestinationsMenu where Leading == EmptyView {
  init(omitting: MoreDestination? = nil) {
    self.init(omitting: omitting) { EmptyView() }
  }
}

/// Loading / error placeholder for a surface driven by a `LoadPhase`.
struct PhasePlaceholder: View {
  let phase: LoadPhase
  let retry: @MainActor () async -> Void

  var body: some View {
    VStack(spacing: 12) {
      switch phase {
      case .loading, .idle:
        ProgressView()
      case .failed(let message):
        Image(systemName: "wifi.exclamationmark")
          .font(.title2)
          .foregroundStyle(.secondary)
        Text(message)
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
        Button("Retry") {
          Task { await retry() }
        }
        .buttonStyle(.borderedProminent)
        .tint(Theme.accent)
      case .loaded:
        EmptyView()
      }
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 40)
    .animation(Theme.Motion.arrive, value: phase)
  }
}

/// Grows a chart from nothing the first time it appears. Reduce Motion shows
/// the finished chart straight away.
private struct ChartReveal: ViewModifier {
  @Binding var progress: CGFloat
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func body(content: Content) -> some View {
    content.onAppear {
      guard progress < 1 else { return }
      if reduceMotion {
        progress = 1
      } else {
        withAnimation(Theme.Motion.chart) {
          progress = 1
        }
      }
    }
  }
}

private extension View {
  func chartReveal(_ progress: Binding<CGFloat>) -> some View {
    modifier(ChartReveal(progress: progress))
  }
}

/// Thin capsule meter for one row's share of the largest row.
struct ShareMeter: View {
  let fraction: Double
  var colour: Color = Theme.accent
  @State private var progress: CGFloat = 0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    GeometryReader { proxy in
      Capsule()
        .fill(Theme.surfaceMuted)
        .overlay(alignment: .leading) {
          Capsule()
            .fill(colour)
            .frame(width: max(4, proxy.size.width * min(max(fraction, 0), 1) * progress))
        }
    }
    .animation(reduceMotion ? nil : Theme.Motion.chart, value: fraction)
    .chartReveal($progress)
    .accessibilityHidden(true)
  }
}

/// Horizontal stacked bar showing each segment's share of a whole.
struct StackedShareBar: View {
  let segments: [(colour: Color, fraction: Double)]
  var height: CGFloat = 14
  @State private var progress: CGFloat = 0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    GeometryReader { proxy in
      HStack(spacing: 2) {
        ForEach(segments.enumerated(), id: \.offset) { _, segment in
          RoundedRectangle(cornerRadius: 3, style: .continuous)
            .fill(segment.colour)
            .frame(width: max(4, proxy.size.width * segment.fraction))
        }
      }
      .mask(alignment: .leading) {
        Rectangle()
          .frame(width: proxy.size.width * progress)
      }
    }
    .frame(height: height)
    .clipShape(RoundedRectangle(cornerRadius: height / 2, style: .continuous))
    .animation(reduceMotion ? nil : Theme.Motion.chart, value: segments.map { $0.fraction })
    .chartReveal($progress)
  }
}

/// Shared x-axis row so net worth and income charts label months the same way.
private struct ChartAxisLabels: View {
  let labels: [String]
  var spacing: CGFloat = 6

  var body: some View {
    let visible = visibleIndices
    HStack(alignment: .top, spacing: spacing) {
      ForEach(labels.indices, id: \.self) { index in
        let isVisible = visible.contains(index)
        Text(isVisible ? labels[index] : " ")
          .font(.caption2)
          .foregroundStyle(.secondary)
          .lineLimit(1)
          .minimumScaleFactor(0.65)
          .frame(maxWidth: .infinity)
          .accessibilityHidden(!isVisible)
      }
    }
  }

  /// About twelve ticks. If a window contains a year-bearing label
  /// (`Jan 26`), show that rather than the window start, so All Time
  /// does not drop the year boundary; failing that, a named label (a
  /// month among weekly day numbers) beats a bare number.
  private var visibleIndices: Set<Int> {
    let count = labels.count
    guard count > 0 else { return [] }
    let stride = max(1, Int(ceil(Double(count) / 12)))
    var visible: Set<Int> = [count - 1]
    var start = 0
    while start < count {
      let window = start ..< min(start + stride, count)
      let tick = window.first(where: carriesYear)
        ?? window.first(where: isNamed)
        ?? start
      visible.insert(tick)
      start += stride
    }
    return visible
  }

  private func carriesYear(_ index: Int) -> Bool {
    labels[index].range(of: #"\s\d{2}$"#, options: .regularExpression) != nil
  }

  private func isNamed(_ index: Int) -> Bool {
    Int(labels[index]) == nil
  }
}

/// Single-series column chart drawn with capsules; negatives drop below the axis.
struct ColumnChart: View {
  let values: [Double]
  var labels: [String] = []
  let voice: ChartVoice
  var positiveColour: Color = Theme.accent
  var negativeColour: Color = Theme.outflow
  var height: CGFloat = 90

  @State private var progress: CGFloat = 0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// Weekly ranges carry fifty-odd bars; tighter gaps keep them readable
  /// instead of spending the card's width on spacing.
  private var monthSpacing: CGFloat {
    switch values.count {
    case ..<19: 6
    case ..<37: 3
    default: 1
    }
  }

  var body: some View {
    let magnitude = max(values.map(abs).max() ?? 1, 1)
    VStack(spacing: 6) {
      HStack(alignment: .bottom, spacing: monthSpacing) {
        ForEach(values.enumerated(), id: \.offset) { _, value in
          VStack(spacing: 0) {
            Spacer(minLength: 0)
            // Capped so a short range on a wide card stays a column, not a blob.
            Capsule()
              .fill(value < 0 ? negativeColour : positiveColour)
              .frame(maxWidth: 24)
              .frame(height: max(3, height * abs(value) / magnitude * progress))
          }
          .frame(maxWidth: .infinity)
        }
      }
      .frame(height: height)
      .animation(reduceMotion ? nil : Theme.Motion.chart, value: values)
      .chartReveal($progress)

      if labels.count == values.count, !labels.isEmpty {
        ChartAxisLabels(labels: labels, spacing: monthSpacing)
      }
    }
    .chartVoice(
      voice,
      summary: ChartSpeech.summary(names: voice.periodNames, values: values, describe: voice.describe),
      series: [(name: voice.name, values: values)]
    )
  }
}

/// Paired income/spending columns per period.
struct PairedColumnChart: View {
  let pairs: [(income: Double, spending: Double)]
  var labels: [String] = []
  let voice: ChartVoice
  var height: CGFloat = 90

  @State private var progress: CGFloat = 0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// Paired columns need more room per period, so they tighten sooner.
  private var monthSpacing: CGFloat {
    switch pairs.count {
    case ..<13: 10
    case ..<25: 5
    default: 2
    }
  }

  private var pairSpacing: CGFloat {
    pairs.count < 25 ? 2 : 1
  }

  var body: some View {
    let magnitude = max(pairs.flatMap { [$0.income, $0.spending] }.max() ?? 1, 1)

    VStack(spacing: 6) {
      HStack(alignment: .bottom, spacing: monthSpacing) {
        ForEach(pairs.enumerated(), id: \.offset) { _, pair in
          HStack(alignment: .bottom, spacing: pairSpacing) {
            Capsule()
              .fill(Theme.inflow)
              .frame(maxWidth: 14)
              .frame(height: max(3, height * pair.income / magnitude * progress))
            Capsule()
              .fill(Theme.outflow)
              .frame(maxWidth: 14)
              .frame(height: max(3, height * pair.spending / magnitude * progress))
          }
          .frame(maxWidth: .infinity)
        }
      }
      .frame(height: height)
      .animation(reduceMotion ? nil : Theme.Motion.chart, value: pairs.flatMap { [$0.income, $0.spending] })
      .chartReveal($progress)

      if labels.count == pairs.count, !labels.isEmpty {
        ChartAxisLabels(labels: labels, spacing: monthSpacing)
      }
    }
    .chartVoice(
      voice,
      summary: ChartSpeech.pairedSummary(names: voice.periodNames, pairs: pairs, describe: voice.describe),
      series: [(name: "Income", values: pairs.map(\.income)), (name: "Spending", values: pairs.map(\.spending))]
    )
  }
}

/// Simple line sparkline for a small trend.
struct Sparkline: View {
  let values: [Double]
  let voice: ChartVoice
  var colour: Color = Theme.accent
  var height: CGFloat = 56
  @State private var progress: CGFloat = 0

  var body: some View {
    GeometryReader { proxy in
      let lowest = values.min() ?? 0
      let highest = values.max() ?? 1
      let span = max(highest - lowest, 0.001)
      let points = values.enumerated().map { index, value in
        CGPoint(
          x: values.count > 1 ? proxy.size.width * CGFloat(index) / CGFloat(values.count - 1) : proxy.size.width / 2,
          y: proxy.size.height * (1 - CGFloat((value - lowest) / span))
        )
      }
      ZStack {
        Path { path in
          guard let first = points.first else { return }
          path.move(to: first)
          for point in points.dropFirst() {
            path.addLine(to: point)
          }
        }
        .trim(from: 0, to: progress)
        .stroke(colour, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))

        if let last = points.last {
          Circle()
            .fill(colour)
            .frame(width: 6, height: 6)
            .scaleEffect(progress)
            .opacity(Double(progress))
            .position(last)
        }
      }
    }
    .frame(height: height)
    .chartReveal($progress)
    .chartVoice(
      voice,
      summary: ChartSpeech.summary(names: voice.periodNames, values: values, describe: voice.describe),
      series: [(name: voice.name, values: values)],
      isContinuous: true
    )
  }
}

/// What VoiceOver says for a chart: what it shows, a spoken name for each
/// period, and how to read a value aloud. Axis labels are too terse to speak
/// ("W23", "Aug 26"), so call sites pass `LedgerDate.spokenPeriodLabel` names.
struct ChartVoice {
  /// What the chart measures, such as "Net worth".
  let name: String
  /// The value axis, such as "Amount" or "Days".
  let unit: String
  var periodNames: [String] = []
  let describe: (Double) -> String

  var title: String {
    "\(name) chart"
  }
}

/// A short spoken summary of a chart. Weekly ranges carry fifty-odd values,
/// so it gives the range, the latest value and the extremes, not every bar.
enum ChartSpeech {
  static func summary(names: [String], values: [Double], describe: (Double) -> String) -> String {
    guard let last = values.indices.last else {
      return "No data yet."
    }
    let named = names.count == values.count
    func at(_ index: Int) -> String {
      named ? ", \(names[index])" : ""
    }
    if values.count == 1 {
      return named ? "\(names[0]): \(describe(values[0]))." : "\(describe(values[0]))."
    }
    let highest = latestPeak(values, by: >)
    let lowest = latestPeak(values, by: <)
    return [
      range(names: named ? names : [], count: values.count),
      "Latest: \(describe(values[last]))\(at(last)).",
      "Highest: \(describe(values[highest]))\(at(highest)).",
      "Lowest: \(describe(values[lowest]))\(at(lowest)).",
    ].joined(separator: " ")
  }

  static func pairedSummary(
    names: [String],
    pairs: [(income: Double, spending: Double)],
    describe: (Double) -> String
  ) -> String {
    guard let last = pairs.indices.last else {
      return "No data yet."
    }
    let named = names.count == pairs.count
    func at(_ index: Int) -> String {
      named ? ", \(names[index])" : ""
    }
    func both(_ index: Int) -> String {
      "income \(describe(pairs[index].income)), spending \(describe(pairs[index].spending))"
    }
    if pairs.count == 1 {
      return named ? "\(names[0]): \(both(0))." : "Latest: \(both(0))."
    }
    let income = latestPeak(pairs.map(\.income), by: >)
    let spending = latestPeak(pairs.map(\.spending), by: >)
    return [
      range(names: named ? names : [], count: pairs.count),
      named ? "Latest, \(names[last]): \(both(last))." : "Latest: \(both(last)).",
      "Most income: \(describe(pairs[income].income))\(at(income)).",
      "Most spending: \(describe(pairs[spending].spending))\(at(spending)).",
    ].joined(separator: " ")
  }

  private static func range(names: [String], count: Int) -> String {
    guard let first = names.first, let last = names.last else {
      return "\(count) periods."
    }
    return "\(count) periods, \(first) to \(last)."
  }

  /// The index of the extreme value; a tie names the most recent period.
  private static func latestPeak(_ values: [Double], by beats: (Double, Double) -> Bool) -> Int {
    var best = 0
    for index in values.indices where !beats(values[best], values[index]) {
      best = index
    }
    return best
  }
}

/// The Audio Graph behind a chart, so VoiceOver can play or explore it.
private struct ChartDescriptor: AXChartDescriptorRepresentable {
  let voice: ChartVoice
  let summary: String
  let series: [(name: String, values: [Double])]
  let isContinuous: Bool

  func makeChartDescriptor() -> AXChartDescriptor {
    let count = series.map(\.values.count).max() ?? 0
    // Categories must be distinct, or the graph merges periods.
    let categories = voice.periodNames.count == count && Set(voice.periodNames).count == count
      ? voice.periodNames
      : (0 ..< count).map { "Period \($0 + 1)" }
    let values = series.flatMap(\.values)
    let lowest = min(values.min() ?? 0, 0)
    let highest = max(values.max() ?? 0, lowest + 1)
    let describe = voice.describe
    return AXChartDescriptor(
      title: voice.title,
      summary: summary,
      xAxis: AXCategoricalDataAxisDescriptor(title: "Period", categoryOrder: categories),
      yAxis: AXNumericDataAxisDescriptor(
        title: voice.unit,
        range: lowest ... highest,
        gridlinePositions: [],
        valueDescriptionProvider: { describe($0) }
      ),
      additionalAxes: [],
      series: series.map { item in
        AXDataSeriesDescriptor(
          name: item.name,
          isContinuous: isContinuous,
          dataPoints: zip(categories, item.values).map { AXDataPoint(x: $0, y: $1) }
        )
      }
    )
  }

  /// A detail screen refetches in place when its range changes, so the
  /// graph must follow the new data rather than keep the first.
  func updateChartDescriptor(_ descriptor: AXChartDescriptor) {
    let fresh = makeChartDescriptor()
    descriptor.title = fresh.title
    descriptor.summary = fresh.summary
    descriptor.xAxis = fresh.xAxis
    descriptor.yAxis = fresh.yAxis
    descriptor.series = fresh.series
  }
}

private extension View {
  /// One VoiceOver element for the whole chart, read as its title and a
  /// summary, with an Audio Graph for the detail.
  func chartVoice(
    _ voice: ChartVoice,
    summary: String,
    series: [(name: String, values: [Double])],
    isContinuous: Bool = false
  ) -> some View {
    accessibilityElement(children: .ignore)
      .accessibilityLabel(voice.title)
      .accessibilityValue(summary)
      .accessibilityChartDescriptor(
        ChartDescriptor(voice: voice, summary: summary, series: series, isContinuous: isContinuous)
      )
  }
}
