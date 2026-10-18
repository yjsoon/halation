import Foundation
import Observation
import UIKit
import UserNotifications
import os

/// Asks the app to show the schedule sheet for one statement cycle.
struct CardScheduleRequest: Identifiable, Equatable {
  let accountID: String
  let statementDate: String

  var id: String { "\(accountID).\(statementDate)" }
}

/// A sheet a card notification asks the app to show.
enum CardSheetRoute: Identifiable, Equatable {
  /// The schedule sheet for one statement cycle.
  case schedule(CardScheduleRequest)
  /// The schedule editor for a payment a background Scheduled just made.
  case editSchedule(String)

  var id: String {
    switch self {
    case .schedule(let request): "schedule-\(request.id)"
    case .editSchedule(let id): "edit-\(id)"
    }
  }
}

/// One pending reminder, for the Settings list.
struct PendingCardReminder: Identifiable, Equatable {
  let id: String
  let title: String
  let fireDate: Date?
}

/// Device-only snoozes, keyed by connection fingerprint and statement cycle.
/// Snoozing on this phone never changes another device or the server.
enum CardPaymentSnoozeStore {
  static let defaultsKey = "halation.card.snoozes"

  private static func load() -> [String: [String: String]] {
    UserDefaults.standard.dictionary(forKey: defaultsKey) as? [String: [String: String]] ?? [:]
  }

  /// Cycle key (`accountID.statementDate`) to the ISO date the cycle is
  /// snoozed until. Snoozes that have passed are dropped.
  static func snoozes(fingerprint: String, today: String) -> [String: String] {
    let all = load()
    // A snooze until today still applies: its reminder fires later today,
    // and the planner drops fire times already past.
    let mine = (all[fingerprint] ?? [:]).filter { $0.value >= today }
    if mine.count != all[fingerprint]?.count ?? 0 {
      var next = all
      next[fingerprint] = mine.isEmpty ? nil : mine
      UserDefaults.standard.set(next, forKey: defaultsKey)
    }
    return mine
  }

  /// Drops every other connection's snoozes.
  static func prune(keeping fingerprint: String) {
    let all = load()
    guard all.keys.contains(where: { $0 != fingerprint }) else { return }
    let kept = all.filter { $0.key == fingerprint }
    if kept.isEmpty {
      UserDefaults.standard.removeObject(forKey: defaultsKey)
    } else {
      UserDefaults.standard.set(kept, forKey: defaultsKey)
    }
  }

  static func snooze(fingerprint: String, cycleKey: String, until: String) {
    var all = load()
    var mine = all[fingerprint] ?? [:]
    mine[cycleKey] = until
    all[fingerprint] = mine
    UserDefaults.standard.set(all, forKey: defaultsKey)
  }
}

/// A Scheduled tap in server mode, kept on the phone until the server has the
/// schedule, so the action never waits on the network.
struct QueuedCardSchedule: Codable, Identifiable, Equatable {
  /// The idempotency key, `card-pay:<account>:<statement_date>`.
  let id: String
  let fingerprint: String
  let accountID: String
  let statementDate: String
  let fundingAccountID: String
  let payDate: String
  let amount: Int
  let memo: String
  let createdAt: Date
  var warned: Bool
}

enum CardScheduleQueue {
  static let defaultsKey = "halation.card.schedule-queue"

  static func load() -> [QueuedCardSchedule] {
    guard let data = UserDefaults.standard.data(forKey: defaultsKey) else { return [] }
    return (try? JSONDecoder().decode([QueuedCardSchedule].self, from: data)) ?? []
  }

  static func save(_ items: [QueuedCardSchedule]) {
    if items.isEmpty {
      UserDefaults.standard.removeObject(forKey: defaultsKey)
    } else if let data = try? JSONEncoder().encode(items) {
      UserDefaults.standard.set(data, forKey: defaultsKey)
    }
  }

  static func add(_ item: QueuedCardSchedule) {
    var items = load().filter { $0.id != item.id || $0.fingerprint != item.fingerprint }
    items.append(item)
    save(items)
  }

  static func remove(id: String, fingerprint: String) {
    save(load().filter { $0.id != id || $0.fingerprint != fingerprint })
  }

  /// Takes every other connection's taps off the queue and returns them, so
  /// the caller can say they were not sent.
  static func prune(keeping fingerprint: String) -> [QueuedCardSchedule] {
    let items = load()
    let others = items.filter { $0.fingerprint != fingerprint }
    if !others.isEmpty {
      save(items.filter { $0.fingerprint == fingerprint })
    }
    return others
  }
}

/// The last card payments view per connection, so a background action or a
/// cold launch has terms and amounts before the first fetch lands.
enum CardPaymentsCache {
  private static func key(_ fingerprint: String) -> String {
    var hash: UInt64 = 14_695_981_039_346_656_037
    for byte in fingerprint.utf8 {
      hash ^= UInt64(byte)
      hash &*= 1_099_511_628_211
    }
    return "halation.card.view.\(String(hash, radix: 16))"
  }

  static func load(fingerprint: String) -> CardPaymentsView? {
    guard let data = UserDefaults.standard.data(forKey: key(fingerprint)) else { return nil }
    return try? JSONDecoder().decode(CardPaymentsView.self, from: data)
  }

  static func save(_ view: CardPaymentsView, fingerprint: String) {
    if view.terms.isEmpty {
      UserDefaults.standard.removeObject(forKey: key(fingerprint))
    } else if let data = try? JSONEncoder().encode(view) {
      UserDefaults.standard.set(data, forKey: key(fingerprint))
    }
  }
}

/// Local reminders for card payments. Nothing is remote push. A pure planner
/// (`CardPaymentPlanner`) decides what should be pending; this applies the
/// difference to the pending requests, handles the action buttons, and keeps
/// the card count for the app badge. It shares `IntakeNotificationDelegate`
/// and the categories `IntakeNotifier.activate()` registers.
@MainActor
@Observable
final class CardPaymentNotifier {
  static let shared = CardPaymentNotifier()

  /// Set by a notification tap. `RootView` presents the sheet.
  var presentedSheet: CardSheetRoute?
  /// Set by a tap that should open a card's register.
  var pendingAccountID: String?
  private(set) var authorisation: UNAuthorizationStatus = .notDetermined
  private(set) var timeSensitive: UNNotificationSetting = .notSupported
  private(set) var pendingReminders: [PendingCardReminder] = []
  /// The 56-request cap dropped later reminders on the last rebuild.
  private(set) var truncated = false
  /// Cards overdue or due today and not covered.
  private(set) var cardBadgeCount = 0
  var badgeMode: AppBadgeMode = AppBadgeMode.current {
    didSet {
      AppBadgeMode.current = badgeMode
      IntakeNotifier.shared.refreshBadge()
    }
  }

  @ObservationIgnored private let center: UNUserNotificationCenter
  @ObservationIgnored private var rebuildChain: Task<Void, Never>?
  @ObservationIgnored private var inFlight: [UUID: Task<Void, Never>] = [:]

  private static let logger = Logger(subsystem: "sg.soon.howmuch", category: "CardPaymentNotifier")
  /// The connection the last rebuild planned for. A different one at launch
  /// means its leftovers need clearing even if this plan has no cards.
  private static let lastFingerprintKey = "halation.card.last-fingerprint"
  /// Notices that are not reminders for a cycle: they stay until dismissed.
  private static let followUpTouchpoints: Set<String> = ["confirm", "failed", "unsent", "already", "dropped", "queued", "ignored"]
  /// The time a background Paid or Scheduled may spend before it reports.
  static let actionBudget: Duration = .seconds(22)

  init(center: UNUserNotificationCenter = .current()) {
    self.center = center
  }

  // MARK: Categories

  static var categories: [UNNotificationCategory] {
    let scheduled = UNNotificationAction(identifier: CardPaymentCategory.Action.scheduled, title: "Scheduled", options: [])
    let scheduledSetup = UNNotificationAction(
      identifier: CardPaymentCategory.Action.scheduledSetup,
      title: "Scheduled",
      options: [.foreground]
    )
    let paid = UNNotificationAction(identifier: CardPaymentCategory.Action.paid, title: "Paid", options: [.authenticationRequired])
    let snooze = UNNotificationAction(identifier: CardPaymentCategory.Action.snooze, title: "Snooze", options: [])
    let open = UNNotificationAction(identifier: CardPaymentCategory.Action.open, title: "Open", options: [.foreground])
    func category(_ id: String, _ actions: [UNNotificationAction]) -> UNNotificationCategory {
      UNNotificationCategory(identifier: id, actions: actions, intentIdentifiers: [], options: [])
    }
    return [
      category(CardPaymentCategory.due, [scheduled, paid, snooze, open]),
      category(CardPaymentCategory.dueSetup, [scheduledSetup, paid, snooze, open]),
      category(CardPaymentCategory.urgent, [scheduled, paid, open]),
      category(CardPaymentCategory.urgentSetup, [scheduledSetup, paid, open]),
    ]
  }

  // MARK: Permission

  func refreshAuthorisation() async {
    let settings = await center.notificationSettings()
    authorisation = settings.authorizationStatus
    timeSensitive = settings.timeSensitiveSetting
  }

  /// The explicit ask, only while the app is in front. Returns whether
  /// reminders can be shown.
  @discardableResult
  func requestAuthorisation() async -> Bool {
    await refreshAuthorisation()
    if authorisation == .notDetermined, UIApplication.shared.applicationState == .active {
      _ = try? await center.requestAuthorization(options: [.alert, .badge, .sound])
      await refreshAuthorisation()
      IntakeNotifier.shared.refreshBadge()
    }
    return Self.canPost(authorisation)
  }

  private static func canPost(_ status: UNAuthorizationStatus) -> Bool {
    status == .authorized || status == .provisional || status == .ephemeral
  }

  // MARK: Rebuild

  /// Re-plans every card reminder from the model's view. Rebuilds run one at
  /// a time, in order, so two quick changes never interleave their diffs.
  func rebuild(model: AppModel) async {
    let previous = rebuildChain
    let task = Task { @MainActor [weak self] in
      await previous?.value
      await self?.performRebuild(model: model)
    }
    rebuildChain = task
    await task.value
  }

  /// True when the last rebuild was for another connection.
  func needsRebuild(for fingerprint: String) -> Bool {
    guard let last = UserDefaults.standard.string(forKey: Self.lastFingerprintKey) else {
      return false
    }
    return last != fingerprint
  }

  private func performRebuild(model: AppModel) async {
    guard model.settings.isAuthenticated else {
      await removeCardRequests { _ in true }
      await removeDelivered { _ in true }
      if cardBadgeCount != 0 {
        cardBadgeCount = 0
        IntakeNotifier.shared.refreshBadge()
      }
      return
    }
    let fingerprint = model.settings.connectionFingerprint
    UserDefaults.standard.set(fingerprint, forKey: Self.lastFingerprintKey)
    CardPaymentSnoozeStore.prune(keeping: fingerprint)
    await reportDroppedTaps(CardScheduleQueue.prune(keeping: fingerprint), model: model)
    let view = model.effectiveCardPayments
    let today = Date.now.isoDateString
    let nextBadge = CardPaymentPlanner.attentionCount(view: view, today: today)
    if nextBadge != cardBadgeCount {
      cardBadgeCount = nextBadge
      IntakeNotifier.shared.refreshBadge()
    }
    await refreshAuthorisation()
    let currency = model.currencyFormat
    let input = CardPaymentPlanner.Input(
      view: view,
      accountNames: Dictionary(model.accounts.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first }),
      openAccountIDs: Set(model.openAccounts.map(\.id)),
      snoozes: CardPaymentSnoozeStore.snoozes(fingerprint: fingerprint, today: today),
      fingerprint: fingerprint,
      now: .now,
      money: { MoneyCodec.displayString(for: $0, currencyFormat: currency) }
    )
    let plan = CardPaymentPlanner.plan(input)
    truncated = plan.truncated
    if plan.truncated {
      Self.logger.info("Card reminders truncated to \(CardPaymentPlanner.pendingLimit, privacy: .public)")
    }
    if Self.canPost(authorisation) {
      await apply(plan.requests, fingerprint: fingerprint)
    } else {
      await removeCardRequests { _ in true }
    }
    await removeStaleDelivered(view: view, fingerprint: fingerprint)
    await warnAboutStaleQueue(model: model)
    await reloadPendingList()
  }

  /// Adds what is missing or changed and removes what is no longer planned,
  /// including every request another connection left behind.
  private func apply(_ planned: [PlannedCardNotification], fingerprint: String) async {
    let pending = await center.pendingNotificationRequests()
    let wanted = Dictionary(planned.map { ($0.identifier, $0) }, uniquingKeysWith: { first, _ in first })
    var remove: [String] = []
    var current: [String: String] = [:]
    for request in pending where request.identifier.hasPrefix(CardPaymentPlanner.identifierPrefix) {
      let info = request.content.userInfo
      let owner = info["connectionFingerprint"] as? String
      if owner != fingerprint || wanted[request.identifier] == nil {
        remove.append(request.identifier)
      } else {
        current[request.identifier] = info["signature"] as? String
      }
    }
    if !remove.isEmpty {
      center.removePendingNotificationRequests(withIdentifiers: remove)
    }
    for item in planned where current[item.identifier] != item.userInfo["signature"] {
      do {
        try await center.add(Self.request(for: item))
      } catch {
        Self.logger.error("Couldn't schedule card reminder: \(error.localizedDescription, privacy: .public)")
      }
    }
  }

  static func request(for item: PlannedCardNotification) -> UNNotificationRequest {
    let content = UNMutableNotificationContent()
    content.title = item.title
    content.body = item.body
    content.threadIdentifier = item.threadIdentifier
    content.userInfo = item.userInfo
    if let category = item.categoryIdentifier {
      content.categoryIdentifier = category
    }
    switch item.level {
    case .passive:
      content.interruptionLevel = .passive
      content.sound = nil
    case .active:
      content.interruptionLevel = .active
      content.sound = .default
    case .timeSensitive:
      content.interruptionLevel = .timeSensitive
      content.sound = .default
    }
    let trigger = UNCalendarNotificationTrigger(dateMatching: item.fire, repeats: false)
    return UNNotificationRequest(identifier: item.identifier, content: content, trigger: trigger)
  }

  private func removeCardRequests(where predicate: (UNNotificationRequest) -> Bool) async {
    let pending = await center.pendingNotificationRequests()
    let ids = pending
      .filter { $0.identifier.hasPrefix(CardPaymentPlanner.identifierPrefix) && predicate($0) }
      .map(\.identifier)
    if !ids.isEmpty {
      center.removePendingNotificationRequests(withIdentifiers: ids)
    }
    await reloadPendingList()
  }

  /// Clears delivered card notifications that no longer apply: everything
  /// from another connection, and reminders for a cycle that is now covered,
  /// has left the view or whose card has reminders off. Confirmations and
  /// other follow-ups stay until dismissed.
  private func removeStaleDelivered(view: CardPaymentsView, fingerprint: String) async {
    let known = !view.asOf.isEmpty
    await removeDelivered { info in
      guard info["connectionFingerprint"] as? String == fingerprint else {
        return true
      }
      guard known,
            let touchpoint = info["touchpoint"] as? String,
            !Self.followUpTouchpoints.contains(touchpoint),
            let accountID = info["accountId"] as? String,
            let statementDate = info["statementDate"] as? String else {
        return false
      }
      guard view.terms(for: accountID)?.enabled == true,
            let cycle = view.cycle(accountID: accountID, statementDate: statementDate) else {
        return true
      }
      if touchpoint == "funds" {
        switch cycle.coverage {
        case .scheduled, .sending: return false
        default: return true
        }
      }
      return cycle.coverage.isCovered
    }
  }

  private func removeDelivered(where predicate: ([AnyHashable: Any]) -> Bool) async {
    let delivered = await center.deliveredNotifications()
    let ids = delivered
      .filter { $0.request.identifier.hasPrefix(CardPaymentPlanner.identifierPrefix) && predicate($0.request.content.userInfo) }
      .map(\.request.identifier)
    if !ids.isEmpty {
      center.removeDeliveredNotifications(withIdentifiers: ids)
    }
  }

  /// Scheduled taps queued under another connection can no longer be sent
  /// here. Say so, once each, rather than dropping them silently.
  private func reportDroppedTaps(_ dropped: [QueuedCardSchedule], model: AppModel) async {
    guard !dropped.isEmpty else { return }
    let fingerprint = model.settings.connectionFingerprint
    for item in dropped {
      let body = "“\(item.memo)” was tapped Scheduled under another plan or server and was not sent. Schedule it again there."
      model.showSaveMessage("Didn’t send a queued card payment: “\(item.memo)”.", kind: .failure)
      await postNow(
        identifier: "\(CardPaymentPlanner.identifierPrefix)\(item.accountID).\(item.statementDate).dropped",
        title: "Card payment not scheduled",
        body: body,
        info: ["kind": "card", "touchpoint": "dropped", "accountId": item.accountID,
               "statementDate": item.statementDate, "connectionFingerprint": fingerprint]
      )
    }
  }

  func reloadPendingList() async {
    let pending = await center.pendingNotificationRequests()
    pendingReminders = pending
      .filter { $0.identifier.hasPrefix(CardPaymentPlanner.identifierPrefix) }
      .map { request in
        PendingCardReminder(
          id: request.identifier,
          title: request.content.title,
          fireDate: (request.trigger as? UNCalendarNotificationTrigger)?.nextTriggerDate()
        )
      }
      .sorted { ($0.fireDate ?? .distantFuture, $0.id) < ($1.fireDate ?? .distantFuture, $1.id) }
  }

  /// Signed out: no card reminders, no delivered card notices and no card
  /// count. The badge is recomputed without the card count.
  func clearAll() {
    presentedSheet = nil
    pendingAccountID = nil
    cardBadgeCount = 0
    truncated = false
    UserDefaults.standard.removeObject(forKey: Self.lastFingerprintKey)
    IntakeNotifier.shared.updateBadge(0)
    Task {
      await removeCardRequests { _ in true }
      await removeDelivered { _ in true }
    }
  }

  /// One notification for a queued Scheduled tap the server has not
  /// confirmed after a day.
  private func warnAboutStaleQueue(model: AppModel) async {
    let fingerprint = model.settings.connectionFingerprint
    var items = CardScheduleQueue.load()
    var changed = false
    for index in items.indices where items[index].fingerprint == fingerprint && !items[index].warned
      && Date.now.timeIntervalSince(items[index].createdAt) > 24 * 60 * 60 {
      items[index].warned = true
      changed = true
      let name = model.account(withID: items[index].accountID)?.name ?? "your card"
      await postNow(
        identifier: "\(CardPaymentPlanner.identifierPrefix)\(items[index].accountID).\(items[index].statementDate).unsent",
        title: "Could not confirm \(name) as scheduled",
        body: "Open Halation to retry.",
        info: ["kind": "card", "touchpoint": "unsent", "accountId": items[index].accountID,
               "statementDate": items[index].statementDate, "connectionFingerprint": fingerprint]
      )
    }
    if changed {
      CardScheduleQueue.save(items)
    }
  }

  // MARK: Actions

  /// Runs `operation` as work `settle()` waits for.
  private func track(_ operation: @escaping @MainActor () async -> Void) {
    let token = UUID()
    inFlight[token] = Task { @MainActor [weak self] in
      await operation()
      self?.inFlight[token] = nil
    }
  }

  /// iOS gives a background action about 30 seconds; the actions budget
  /// their own work against `actionBudget` and this waits a little longer.
  func settle(timeout: Duration = .seconds(26)) async {
    let deadline = ContinuousClock.now + timeout
    while !inFlight.isEmpty, ContinuousClock.now < deadline {
      try? await Task.sleep(for: .milliseconds(50))
    }
  }

  /// A tap or an action button on a card reminder. Background actions hold
  /// the delegate's completion handler until `settle()` returns.
  func handle(action: String, info: [String: String]) {
    guard info["kind"] == "card", let accountID = info["accountId"] else {
      return
    }
    let statementDate = info["statementDate"] ?? ""
    guard let model = IntakeBackgroundRefresh.shared.model, model.settings.isAuthenticated,
          info["connectionFingerprint"] == model.settings.connectionFingerprint else {
      // Signed out, or a reminder from another plan or server: say why
      // nothing happened rather than doing nothing.
      if action != UNNotificationDismissActionIdentifier {
        track { [weak self] in
          await self?.postNow(
            identifier: CardPaymentPlanner.identifier(accountID: accountID, statementDate: statementDate, touchpoint: "ignored"),
            title: "Reminder not used",
            body: "This reminder belongs to another plan or server, or you are signed out. Open Halation to check your card payments.",
            info: ["kind": "card", "touchpoint": "ignored", "accountId": accountID, "statementDate": statementDate,
                   "connectionFingerprint": IntakeBackgroundRefresh.shared.model?.settings.connectionFingerprint ?? ""]
          )
        }
      }
      return
    }
    switch action {
    case CardPaymentCategory.Action.scheduled:
      track { [weak self] in
        await self?.scheduleInBackground(model: model, accountID: accountID, statementDate: statementDate, info: info)
      }
    case CardPaymentCategory.Action.scheduledSetup:
      // A cold launch has no fetched view yet: the cached one seeds the sheet
      // and the sheet refreshes when the cycle is missing.
      model.restoreCardPaymentsIfNeeded()
      let target = model.effectiveCardPayments.payableCycle(accountID: accountID, statementDate: statementDate)?.statementDate
      presentedSheet = .schedule(CardScheduleRequest(accountID: accountID, statementDate: target ?? statementDate))
    case CardPaymentCategory.Action.paid:
      track { [weak self] in
        await self?.paidInBackground(model: model, accountID: accountID, statementDate: statementDate, info: info)
      }
    case CardPaymentCategory.Action.snooze:
      track { [weak self] in
        await self?.snooze(model: model, accountID: accountID, statementDate: statementDate, info: info)
      }
    case UNNotificationDismissActionIdentifier:
      break
    default:
      // Open, or a plain tap: an unpaid cycle opens its sheet; anything
      // else opens the card's register.
      model.restoreCardPaymentsIfNeeded()
      let cycle = model.effectiveCardPayments.payableCycle(accountID: accountID, statementDate: statementDate)
      let touchpoint = info["touchpoint"] ?? ""
      if touchpoint == "confirm", let scheduleID = info["scheduleId"], !scheduleID.isEmpty {
        // "Tap to change" on a background Scheduled confirmation.
        presentedSheet = .editSchedule(scheduleID)
      } else if let cycle, !cycle.coverage.isCovered, cycle.needsPaying, touchpoint != "funds", touchpoint != "confirm" {
        // A carried statement opens the current cycle it was carried into.
        presentedSheet = .schedule(CardScheduleRequest(accountID: accountID, statementDate: cycle.statementDate))
      } else {
        pendingAccountID = accountID
      }
    }
  }

  private func scheduleInBackground(model: AppModel, accountID: String, statementDate: String, info: [String: String]) async {
    let deadline = ContinuousClock.now + Self.actionBudget
    let name = info["cardName"] ?? model.account(withID: accountID)?.name ?? "your card"
    guard let checked = await checkedCycle(model: model, accountID: accountID, statementDate: statementDate, name: name) else {
      return
    }
    // A statement carried into the current cycle is scheduled there.
    let target = checked?.statementDate ?? statementDate
    let context = model.cardPaymentContext(accountID: accountID, statementDate: target, info: info)
    guard let context, let funding = context.fundingAccountID,
          model.openAccounts.isEmpty || model.openAccounts.contains(where: { $0.id == funding }),
          let amount = context.defaultAmount, amount > 0 else {
      await postSetupNeeded(accountID: accountID, statementDate: target, name: name, model: model)
      return
    }
    let payDate = context.suggestedPayDate(today: Date.now.isoDateString)
    let fingerprint = model.settings.connectionFingerprint
    let money = MoneyCodec.displayString(for: amount, currencyFormat: model.currencyFormat)
    let fundingName = model.account(withID: funding)?.name ?? "your account"
    func fields(_ touchpoint: String, scheduleID: String? = nil) -> [String: String] {
      var result = ["kind": "card", "touchpoint": touchpoint, "accountId": accountID, "statementDate": target,
                    "connectionFingerprint": fingerprint]
      result["scheduleId"] = scheduleID
      return result
    }
    do {
      let result = try await model.scheduleCardPayment(
        accountID: accountID,
        statementDate: target,
        amount: amount,
        fundingAccountID: funding,
        payDate: payDate,
        showsMessage: false,
        sendsNow: true,
        deadline: deadline
      )
      // Report first; refreshes come after, in whatever time is left.
      switch result {
      case .scheduled(let scheduleID):
        await postNow(
          identifier: CardPaymentPlanner.identifier(accountID: accountID, statementDate: target, touchpoint: "confirm"),
          title: "Scheduled",
          body: Self.scheduledConfirmation(amount: money, fundingName: fundingName, payDate: payDate) + " " + Self.amountCaveat,
          info: fields("confirm", scheduleID: scheduleID)
        )
      case .pending:
        await postNow(
          identifier: CardPaymentPlanner.identifier(accountID: accountID, statementDate: target, touchpoint: "queued"),
          title: "Saved on this iPhone",
          body: "\(money) from \(fundingName) on \(CardPaymentFormat.weekdayDay(payDate)) is queued and will be sent when Halation can reach the server.",
          info: fields("queued")
        )
      case .covered, .gone:
        await postNow(
          identifier: CardPaymentPlanner.identifier(accountID: accountID, statementDate: target, touchpoint: "already"),
          title: "Already paid or scheduled",
          body: "\(name) needs nothing more for this statement. Nothing was changed.",
          info: fields("already")
        )
      case .refused(let message):
        await postFailure(name: name, message: message, accountID: accountID, statementDate: target, fingerprint: fingerprint)
      }
    } catch {
      await postFailure(name: name, message: error.localizedDescription, accountID: accountID, statementDate: target, fingerprint: fingerprint)
    }
    if ContinuousClock.now < deadline, !model.settings.isLocal {
      await model.refreshAfterCardScheduling()
    } else {
      await rebuild(model: model)
    }
  }

  private func postFailure(name: String, message: String, accountID: String, statementDate: String, fingerprint: String) async {
    await postNow(
      identifier: CardPaymentPlanner.identifier(accountID: accountID, statementDate: statementDate, touchpoint: "failed"),
      title: "Couldn’t schedule \(name)",
      body: "\(message) Open Halation to try again.",
      info: ["kind": "card", "touchpoint": "failed", "accountId": accountID, "statementDate": statementDate,
             "connectionFingerprint": fingerprint]
    )
  }

  /// The caveat on a background Scheduled confirmation; a tap opens the
  /// schedule editor.
  static let amountCaveat = "Check the amount against your statement. Tap to change."

  /// Checks the cycle before a background Paid or Scheduled writes anything.
  /// Returns the cycle to act on (`.some(nil)` when the view cannot say), or
  /// nil after posting a quiet notice when it is covered elsewhere or gone.
  private func checkedCycle(
    model: AppModel,
    accountID: String,
    statementDate: String,
    name: String
  ) async -> CardPaymentCycle?? {
    let check = await model.checkCardCycleBeforeAction(accountID: accountID, statementDate: statementDate, timeout: .seconds(4))
    let body: String
    switch check {
    case .due(let cycle):
      return .some(cycle)
    case .covered:
      body = "\(name) is already paid or scheduled for this statement. Nothing was changed."
    case .gone:
      body = "This \(name) statement is no longer due. Nothing was changed."
    }
    await postNow(
      identifier: CardPaymentPlanner.identifier(accountID: accountID, statementDate: statementDate, touchpoint: "already"),
      title: "Already paid or scheduled",
      body: body,
      info: ["kind": "card", "touchpoint": "already", "accountId": accountID, "statementDate": statementDate,
             "connectionFingerprint": model.settings.connectionFingerprint]
    )
    await rebuild(model: model)
    return nil
  }

  private func paidInBackground(model: AppModel, accountID: String, statementDate: String, info: [String: String]) async {
    let name = info["cardName"] ?? model.account(withID: accountID)?.name ?? "your card"
    guard let checked = await checkedCycle(model: model, accountID: accountID, statementDate: statementDate, name: name) else {
      return
    }
    // A statement carried into the current cycle is paid there.
    let target = checked?.statementDate ?? statementDate
    let context = model.cardPaymentContext(accountID: accountID, statementDate: target, info: info)
    guard let context, let funding = context.fundingAccountID, let amount = context.defaultAmount, amount > 0 else {
      await postSetupNeeded(accountID: accountID, statementDate: target, name: name, model: model)
      return
    }
    do {
      try model.recordCardPaymentPaid(
        accountID: accountID,
        statementDate: target,
        amount: amount,
        fundingAccountID: funding
      )
      let fundingName = model.account(withID: funding)?.name ?? "your account"
      await postNow(
        identifier: CardPaymentPlanner.identifier(accountID: accountID, statementDate: target, touchpoint: "confirm"),
        title: "Recorded",
        body: "Recorded \(MoneyCodec.displayString(for: amount, currencyFormat: model.currencyFormat)) paid to \(name) from \(fundingName) today.",
        info: ["kind": "card", "touchpoint": "confirm", "accountId": accountID, "statementDate": target,
               "connectionFingerprint": model.settings.connectionFingerprint]
      )
    } catch {
      await postSetupNeeded(accountID: accountID, statementDate: target, name: name, model: model)
    }
    // Give the outbox a moment to send before re-planning.
    await model.waitForOutboxDrain()
    await rebuild(model: model)
  }

  private func snooze(model: AppModel, accountID: String, statementDate: String, info: [String: String]) async {
    let touchpoint = info["touchpoint"] ?? ""
    // Due and overdue reminders cannot be snoozed, only answered.
    guard touchpoint != "due", touchpoint != "overdue", let due = info["dueDate"] else {
      return
    }
    let tomorrow = CardCycleMaths.addDays(Date.now.isoDateString, 1)
    let until = min(tomorrow, due)
    CardPaymentSnoozeStore.snooze(
      fingerprint: model.settings.connectionFingerprint,
      cycleKey: "\(accountID).\(statementDate)",
      until: until
    )
    model.restoreCardPaymentsIfNeeded()
    await rebuild(model: model)
  }

  private func postSetupNeeded(accountID: String, statementDate: String, name: String, model: AppModel) async {
    await postNow(
      identifier: CardPaymentPlanner.identifier(accountID: accountID, statementDate: statementDate, touchpoint: "setup"),
      title: "Choose how to pay \(name)",
      body: "Open Halation to pick the account and amount.",
      info: ["kind": "card", "touchpoint": "setup", "accountId": accountID, "statementDate": statementDate,
             "connectionFingerprint": model.settings.connectionFingerprint]
    )
  }

  /// A quiet notification now: confirmations and follow-ups.
  private func postNow(identifier: String, title: String, body: String, info: [String: String]) async {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.userInfo = info
    content.interruptionLevel = .passive
    content.sound = nil
    if let accountID = info["accountId"] {
      content.threadIdentifier = "\(CardPaymentPlanner.identifierPrefix)\(accountID)"
    }
    do {
      try await center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: nil))
    } catch {
      Self.logger.error("Couldn't post card notification: \(error.localizedDescription, privacy: .public)")
    }
  }

  /// "Scheduled: S$1,234.56 from Account B on Wed 26 Nov. Set it up in your bank app."
  static func scheduledConfirmation(amount: String, fundingName: String, payDate: String) -> String {
    "Scheduled: \(amount) from \(fundingName) on \(CardPaymentFormat.weekdayDay(payDate)). Set it up in your bank app."
  }

  // MARK: Background refresh

  /// The second step of the app refresh task: send queued Scheduled taps,
  /// fetch the view and re-plan.
  func backgroundRefresh(model: AppModel) async {
    guard model.settings.isAuthenticated else { return }
    model.restoreCardPaymentsIfNeeded()
    await model.drainCardPaymentQueue()
    if model.hasCardPaymentTerms || model.hasCreditAccounts {
      await model.refreshCardPayments()
    }
  }
}
