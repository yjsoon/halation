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

/// One follow-up as a chip: outlined when off, tinted when on.
struct FollowUpChip: View {
  enum Glyph {
    case text(String)
    case symbol(String)
  }

  let title: String
  let glyph: Glyph
  let tint: Color
  @Binding var isOn: Bool

  var body: some View {
    Button {
      isOn.toggle()
    } label: {
      HStack(spacing: 4) {
        switch glyph {
        case .text(let text):
          Text(text)
            .font(.subheadline.weight(.semibold).monospaced())
        case .symbol(let name):
          Image(systemName: name)
            .font(.caption.weight(.semibold))
        }
        Text(title)
          .font(.subheadline.weight(isOn ? .semibold : .regular))
          .fixedSize()
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 5)
      .foregroundStyle(isOn ? tint : Color.secondary)
      .background(Capsule().fill(isOn ? tint.opacity(0.14) : Color.clear))
      .overlay(Capsule().strokeBorder(isOn ? tint : Color.secondary.opacity(0.45), lineWidth: 1))
      .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(title)
    .accessibilityValue(isOn ? "On" : "Off")
    .sensoryFeedback(.selection, trigger: isOn)
  }
}

/// The "To claim" or "Claimed" tag a register row shows in place of the
/// memo's claim word.
struct MemoClaimTag: View {
  let claim: MemoClaim

  var body: some View {
    Text(claim.title)
      .font(.caption2.weight(.semibold))
      .padding(.horizontal, 6)
      .padding(.vertical, 1)
      .foregroundStyle(claim == .toClaim ? Theme.toClaim : Color.secondary)
      .background(
        Capsule().fill(claim == .toClaim ? Theme.toClaim.opacity(0.12) : Color.secondary.opacity(0.12))
      )
  }
}

/// The memo line of a register row, with the row's claim drawn as a tag.
struct RegisterMemoLine: View {
  let memo: String
  var claimStatus: String? = nil

  var body: some View {
    let claim = MemoClaim(status: claimStatus, memo: memo)
    let text = claim == nil ? memo : MemoClaim.displayText(memo)
    HStack(alignment: .firstTextBaseline, spacing: 6) {
      if let claim {
        MemoClaimTag(claim: claim)
      }
      if !text.isEmpty {
        Text(text)
          .font(.footnote)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }
    }
  }
}

/// The ≈ before an estimated amount.
struct EstimateMark: View {
  var body: some View {
    Text("≈")
      .font(.subheadline.weight(.semibold).monospaced())
      .foregroundStyle(Theme.toConfirm)
      .accessibilityLabel("Estimate, to confirm")
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

  /// The sidebar layout needs room in both directions: an iPad window, or the
  /// iPhone Duo inner display. Size classes, not idiom, decide it, so a phone
  /// that is regular in both directions gets it and a Pro Max in landscape
  /// (regular width, compact height) keeps the tab bar.
  static func usesSidebar(
    horizontalSizeClass: UserInterfaceSizeClass?,
    verticalSizeClass: UserInterfaceSizeClass?
  ) -> Bool {
    horizontalSizeClass == .regular && verticalSizeClass == .regular
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

  static func addControlInsets(usesSidebar: Bool) -> EdgeInsets {
    if usesSidebar {
      return EdgeInsets(top: 0, leading: 0, bottom: 28, trailing: 20)
    }
    return EdgeInsets(top: 0, leading: 0, bottom: compactTabRowClearance, trailing: 16)
  }

  static func toastBottomPadding(usesSidebar: Bool) -> CGFloat {
    if usesSidebar {
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

  /// The Accounts pane, kept here because opening or closing iPhone Duo (or
  /// resizing an iPad window) swaps the sidebar and compact trees, which
  /// rebuilds AccountsView and would otherwise drop the open register.
  var accountsPane: AccountsPane?
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
  @Environment(\.verticalSizeClass) private var verticalSizeClass
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
      horizontalSizeClass: horizontalSizeClass,
      verticalSizeClass: verticalSizeClass
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
  @Environment(\.verticalSizeClass) private var verticalSizeClass

  init(omitting: MoreDestination? = nil, @ViewBuilder leading: () -> Leading) {
    self.omitting = omitting
    self.leading = leading()
  }

  var body: some View {
    let overflowItems = MoreDestination.overflowItems(
      usesSidebar: RootChrome.usesSidebar(
        horizontalSizeClass: horizontalSizeClass,
        verticalSizeClass: verticalSizeClass
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
      let widths = Self.widths(for: segments.map(\.fraction), in: proxy.size.width)
      HStack(spacing: 2) {
        ForEach(segments.enumerated(), id: \.offset) { index, segment in
          RoundedRectangle(cornerRadius: 3, style: .continuous)
            .fill(segment.colour)
            .frame(width: widths[index])
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

  /// Segment widths that fit the bar with its gaps: each at least a sliver,
  /// the slivers' surplus taken from the largest segment, so a small share
  /// still shows instead of being pushed off the trailing end.
  static func widths(for fractions: [Double], in width: CGFloat) -> [CGFloat] {
    guard !fractions.isEmpty else { return [] }
    let available = max(width - 2 * CGFloat(fractions.count - 1), 0)
    var widths = fractions.map { max(4, available * CGFloat($0)) }
    let surplus = widths.reduce(0, +) - available
    if surplus > 0, let largest = widths.indices.max(by: { widths[$0] < widths[$1] }) {
      widths[largest] = max(4, widths[largest] - surplus)
    }
    return widths
  }
}

private extension UIContentSizeCategory {
  /// The UIKit category for a SwiftUI text size, to measure text as the
  /// view will draw it.
  init(_ size: DynamicTypeSize) {
    self = switch size {
    case .xSmall: .extraSmall
    case .small: .small
    case .medium: .medium
    case .large: .large
    case .xLarge: .extraLarge
    case .xxLarge: .extraExtraLarge
    case .xxxLarge: .extraExtraExtraLarge
    case .accessibility1: .accessibilityMedium
    case .accessibility2: .accessibilityLarge
    case .accessibility3: .accessibilityExtraLarge
    case .accessibility4: .accessibilityExtraExtraLarge
    case .accessibility5: .accessibilityExtraExtraExtraLarge
    @unknown default: .large
    }
  }
}

/// Shared x-axis row so net worth and income charts label months the same way.
private struct ChartAxisLabels: View {
  let labels: [String]
  var spacing: CGFloat = 6

  @State private var rowWidth: CGFloat = 0
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  var body: some View {
    let layout = plan
    HStack(alignment: .top, spacing: spacing) {
      ForEach(labels.indices, id: \.self) { index in
        let label = layout.labels[index]
        // The label overlays a text-height cell rather than filling it: a
        // weekly run gives each of fifty-odd cells a few points, which would
        // cut "W42" to "W", and the shown labels are several cells apart.
        Text(" ")
          .font(.caption2)
          .frame(maxWidth: .infinity)
          .overlay {
            Text(label ?? " ")
              .font(.caption2)
              .foregroundStyle(.secondary)
              .lineLimit(1)
              .fixedSize()
          }
          .accessibilityHidden(label == nil)
      }
    }
    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { rowWidth = $0 }
  }

  /// Which labels to draw: as many as fit the row at the current text
  /// size, up to about twelve, never two within a stride of each other.
  /// Year-bearing labels ("Jan 26") always win over plain ones so a long
  /// window keeps its year boundaries; the last label is always drawn, and
  /// takes the year itself when January sits right beside it, unless a
  /// month name just before it on a daily or weekly axis stands in for it.
  private var plan: (labels: [String?], shown: [Int]) {
    let count = labels.count
    guard count > 0 else { return ([], []) }
    let stride = max(1, Int(ceil(Double(count) / Double(budget))))
    let last = count - 1
    var shown: Set<Int> = [last]
    var labels = self.labels
    // Year ticks a stride apart, kept from the latest backwards, so a long
    // window keeps every other January rather than losing them all. A
    // January too close to the last label lends it the year instead and
    // takes no place in the spacing, so the January before it still shows
    // and no plain month reads as the wrong year.
    var years: [Int] = []
    var lent = false
    for year in labels.indices.reversed() where carriesYear(year) && year != last {
      if last - year < stride {
        if !lent, !carriesYear(last), let suffix = yearSuffix(labels[year]) {
          labels[last] += suffix
          lent = true
        }
      } else if years.allSatisfy({ $0 - year >= stride }) {
        years.append(year)
      }
    }
    shown.formUnion(years)
    // A daily or weekly axis mixes day numbers with month names; there a
    // name within the stride takes the tick, so the months stay readable.
    // That includes the end: a month that starts just before the last
    // column is drawn in its place, or the latest weeks read as the month
    // before.
    let mixesNumbers = labels.contains { Int($0) != nil }
    if mixesNumbers, years.isEmpty, Int(labels[last]) != nil,
       let named = (max(0, last - stride + 1) ..< last).last(where: { Int(labels[$0]) == nil }) {
      shown = [named]
    }
    // Fill the gaps between the fixed ticks a stride at a time, from the
    // left edge and from each year tick, so a long window keeps an even
    // rhythm rather than a sparse grid dodging the Januaries.
    var previous = -stride
    for next in shown.sorted() {
      var candidate = previous + stride
      while next - candidate >= stride {
        var tick = candidate
        if mixesNumbers {
          let window = candidate ..< min(candidate + stride, next - stride + 1)
          if let named = window.last(where: { Int(labels[$0]) == nil }) {
            tick = named
          }
        }
        shown.insert(tick)
        candidate = tick + stride
      }
      previous = next
    }
    return (labels.indices.map { shown.contains($0) ? labels[$0] : nil }, shown.sorted())
  }

  /// How many labels the row can hold, measured when the row has a width
  /// and estimated from label length until then.
  private var budget: Int {
    let longest = labels.map(\.count).max() ?? 0
    guard rowWidth > 0 else {
      return longest <= 4 ? 12 : max(4, 36 / longest)
    }
    // Measured for the view's own text size, so a size change re-plans
    // the row even when its width stays the same.
    let traits = UITraitCollection(preferredContentSizeCategory: UIContentSizeCategory(dynamicTypeSize))
    let font = UIFont.preferredFont(forTextStyle: .caption2, compatibleWith: traits)
    let widest = labels.map { ($0 as NSString).size(withAttributes: [.font: font]).width }.max() ?? 0
    return min(12, max(2, Int(rowWidth / (widest + 8))))
  }

  private func carriesYear(_ index: Int) -> Bool {
    yearSuffix(labels[index]) != nil
  }

  /// " 26" from "Jan 26".
  private func yearSuffix(_ label: String) -> String? {
    label.range(of: #"\s\d{2}$"#, options: .regularExpression).map { String(label[$0]) }
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

/// Line chart for a level that moves a little against a large base, such as
/// net worth. Columns from zero would draw a year of small gains as twelve
/// equal bars, so the value axis is fitted around the series' own range
/// instead, with both ends labelled so the scale is never hidden. A dashed
/// zero line appears when the series crosses zero. Points sit at the centre
/// of each period's cell, so the shared axis labels line up underneath.
struct TrendChart: View {
  struct Axis: Equatable {
    let low: Double
    let high: Double
    /// The round number the ends were snapped to; a tick label's resolution.
    let step: Double

    var range: ClosedRange<Double> {
      low ... high
    }
  }

  let values: [Double]
  var labels: [String] = []
  let voice: ChartVoice
  /// Short label for a tick, given its value and the axis step.
  let axisLabel: (_ value: Double, _ step: Double) -> String
  var colour: Color = Theme.accent
  var height: CGFloat = 90
  /// The narrowest value axis, in the series' units: one whole currency
  /// unit for money in milliunits, so a flat series still has two ticks.
  var minimumSpan: Double = 1

  @State private var progress: CGFloat = 0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// The value axis: fitted around the series so its movement shows, but
  /// never tighter than a twentieth of the largest value, so a few dollars'
  /// wobble on a six-figure net worth does not fill the plot. It takes in
  /// zero when the series is within one span of it, and its ends sit on
  /// round numbers for the ticks.
  static func axis(for values: [Double], minimumSpan: Double = 1) -> Axis {
    guard let lowest = values.min(), let highest = values.max() else {
      return Axis(low: 0, high: minimumSpan, step: minimumSpan)
    }
    let largest = max(abs(lowest), abs(highest))
    let span = max(highest - lowest, largest * 0.05, minimumSpan, 1)
    let pad = span * 0.1
    // At least the span, centred on the series, plus a little room each end.
    let middle = (lowest + highest) / 2
    var low = min(lowest - pad, middle - span / 2)
    var high = max(highest + pad, middle + span / 2)
    if lowest >= 0 {
      low = lowest < span ? 0 : max(low, 0)
    }
    if highest <= 0 {
      high = highest > -span ? 0 : min(high, 0)
    }
    let step = niceStep((high - low) / 8)
    low = (low / step).rounded(.down) * step
    high = (high / step).rounded(.up) * step
    if high <= low {
      // Every value at zero: the ends met there, so open one step above.
      let opened = max(step, minimumSpan)
      return Axis(low: low, high: low + opened, step: opened)
    }
    return Axis(low: low, high: high, step: step)
  }

  /// 1, 2 or 5 times a power of ten, at or above `raw`.
  static func niceStep(_ raw: Double) -> Double {
    guard raw > 0, raw.isFinite else {
      return 1
    }
    let base = pow(10, floor(log10(raw)))
    let fraction = raw / base
    let nice: Double = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
    return nice * base
  }

  var body: some View {
    let axis = Self.axis(for: values, minimumSpan: minimumSpan)
    let crossesZero = axis.low < 0 && axis.high > 0
    let ticks = [axisLabel(axis.high, axis.step), axisLabel(axis.low, axis.step)]

    VStack(spacing: 6) {
      HStack(alignment: .top, spacing: 8) {
        plot(axis: axis, crossesZero: crossesZero)
          .frame(height: height)
        // The ticks sit on the plot's top and bottom gridlines; the hidden
        // widest tick sizes the column, whichever end is longer.
        ZStack(alignment: .trailing) {
          ZStack {
            tickText(ticks[0])
            tickText(ticks[1])
          }
          .hidden()
          VStack(alignment: .trailing, spacing: 0) {
            tickText(ticks[0])
              .foregroundStyle(.secondary)
            Spacer(minLength: 0)
            tickText(ticks[1])
              .foregroundStyle(.secondary)
          }
        }
        .frame(height: height)
        .accessibilityHidden(true)
      }

      if labels.count == values.count, !labels.isEmpty {
        HStack(spacing: 8) {
          ChartAxisLabels(labels: labels, spacing: 0)
          // The same column width as above, whichever tick draws wider.
          ZStack {
            tickText(ticks[0])
            tickText(ticks[1])
          }
          .hidden()
        }
      }
    }
    .chartVoice(
      voice,
      summary: summary,
      series: [(name: voice.name, values: values)],
      isContinuous: true,
      valueRange: axis.range
    )
  }

  /// Leads with the change across the window, which is what the line shows,
  /// then the shared range, latest and extremes.
  private var summary: String {
    let shared = ChartSpeech.summary(names: voice.periodNames, values: values, describe: voice.describe)
    guard let first = values.first, let last = values.last, values.count > 1 else {
      return shared
    }
    let change = last - first
    let direction = change > 0 ? "Up" : change < 0 ? "Down" : "Unchanged"
    let amount = change == 0 ? "" : " \(voice.describe(abs(change)))"
    return "\(direction)\(amount) over the window. \(shared)"
  }

  private func plot(axis: Axis, crossesZero: Bool) -> some View {
    GeometryReader { proxy in
      let size = proxy.size
      let points = values.enumerated().map { index, value in
        CGPoint(
          x: size.width * (CGFloat(index) + 0.5) / CGFloat(values.count),
          y: y(for: value, axis: axis, height: size.height)
        )
      }
      ZStack(alignment: .topLeading) {
        gridline(at: 0.5, width: size.width)
        gridline(at: size.height - 0.5, width: size.width)
        if crossesZero {
          Path { path in
            let zero = y(for: 0, axis: axis, height: size.height)
            path.move(to: CGPoint(x: 0, y: zero))
            path.addLine(to: CGPoint(x: size.width, y: zero))
          }
          .stroke(Color.secondary.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
        }
        if points.count > 1 {
          Path { path in
            guard let first = points.first, let last = points.last else { return }
            path.move(to: CGPoint(x: first.x, y: size.height))
            path.addLine(to: first)
            for point in points.dropFirst() {
              path.addLine(to: point)
            }
            path.addLine(to: CGPoint(x: last.x, y: size.height))
            path.closeSubpath()
          }
          .fill(
            LinearGradient(
              colors: [colour.opacity(0.22), colour.opacity(0.02)],
              startPoint: .top,
              endPoint: .bottom
            )
          )
          .mask(alignment: .leading) {
            Rectangle().frame(width: size.width * progress)
          }
          Path { path in
            guard let first = points.first else { return }
            path.move(to: first)
            for point in points.dropFirst() {
              path.addLine(to: point)
            }
          }
          .trim(from: 0, to: progress)
          .stroke(colour, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
        }
        if let last = points.last {
          Circle()
            .fill(colour)
            .frame(width: 7, height: 7)
            .scaleEffect(progress)
            .opacity(Double(progress))
            .position(last)
        }
      }
    }
    .animation(reduceMotion ? nil : Theme.Motion.chart, value: values)
    .chartReveal($progress)
  }

  /// Its natural width, so the column is as wide as its ticks and no more.
  private func tickText(_ label: String) -> some View {
    Text(label)
      .font(.caption2)
      .monospacedDigit()
      .lineLimit(1)
      .fixedSize(horizontal: true, vertical: false)
  }

  private func gridline(at y: CGFloat, width: CGFloat) -> some View {
    Path { path in
      path.move(to: CGPoint(x: 0, y: y))
      path.addLine(to: CGPoint(x: width, y: y))
    }
    .stroke(Color.secondary.opacity(0.18), lineWidth: 1)
  }

  private func y(for value: Double, axis: Axis, height: CGFloat) -> CGFloat {
    let span = max(axis.high - axis.low, 0.000_001)
    let fraction = (value - axis.low) / span
    return height * (1 - CGFloat(min(max(fraction, 0), 1)))
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
  var valueRange: ClosedRange<Double>? = nil

  func makeChartDescriptor() -> AXChartDescriptor {
    let count = series.map(\.values.count).max() ?? 0
    // Categories must be distinct, or the graph merges periods.
    let categories = voice.periodNames.count == count && Set(voice.periodNames).count == count
      ? voice.periodNames
      : (0 ..< count).map { "Period \($0 + 1)" }
    let values = series.flatMap(\.values)
    let lowest = valueRange?.lowerBound ?? min(values.min() ?? 0, 0)
    let highest = max(valueRange?.upperBound ?? values.max() ?? 0, lowest + 1)
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
  /// `valueRange` is the drawn value axis when it is not anchored at zero,
  /// so the Audio Graph has the same shape as the line.
  func chartVoice(
    _ voice: ChartVoice,
    summary: String,
    series: [(name: String, values: [Double])],
    isContinuous: Bool = false,
    valueRange: ClosedRange<Double>? = nil
  ) -> some View {
    accessibilityElement(children: .ignore)
      .accessibilityLabel(voice.title)
      .accessibilityValue(summary)
      .accessibilityChartDescriptor(
        ChartDescriptor(
          voice: voice, summary: summary, series: series, isContinuous: isContinuous, valueRange: valueRange
        )
      )
  }
}
