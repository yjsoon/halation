import Foundation
import Security

struct APISettings: Codable, Equatable {
  static let userDefaultsKey = "HowMuch.APISettings"
  /// The owner's personal instance. Halation is self-hosted only, so this is
  /// no longer the default for new installs; it stays so installs that saved
  /// an earlier hosted default keep following it.
  static let productionBaseURL = "https://howmuch.tk.sg"
  /// The hosted default used before production moved to `tk.sg`. The same
  /// service answers on both hosts (the former one redirects permanently), so
  /// an existing session stays valid and moves with the connection setting.
  private static let legacyProductionBaseURL = "https://howmuch.soon.sg"
#if DEBUG
  /// A development-signed build may receive these once at launch through
  /// `devicectl`'s process environment. This marker makes the hand-off
  /// one-time: subsequent launches use the normal Keychain-backed settings.
  private static let debugBootstrapAppliedKey = "HowMuch.DebugBootstrapApplied"
#endif

  var baseURLString = ""
  var username = ""
  var sessionToken = ""
  var authenticatedUserID = ""
  /// The server chooses the usable plan after sign-in. Leaving this empty on
  /// a fresh install prevents requests from accidentally targeting the old
  /// development-only `local-plan` identifier.
  var planID = ""
  /// Where requests go. Settings saved before local mode existed have no
  /// value here and decode as `.server`, so an existing install keeps its
  /// connection exactly as it was.
  var mode: Mode = .server

  enum Mode: String, Codable {
    case server
    case local
  }

  var isLocal: Bool {
    mode == .local
  }

  var trimmedBaseURL: String {
    baseURLString.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
  }

  /// A stable identity for the server that owns this session. The value is
  /// deliberately derived from the URL rather than from the user or plan so
  /// that a token can never be sent to a different endpoint after a setting
  /// change.
  var normalisedBaseURLString: String? {
    Self.normalisedBaseURLString(from: trimmedBaseURL)
  }

  static func normalisedBaseURLString(from value: String) -> String? {
    let value = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard
      let components = URLComponents(string: value),
      let scheme = components.scheme?.lowercased(),
      scheme == "http" || scheme == "https",
      let host = components.host?.lowercased(),
      !host.isEmpty,
      Self.allowsHTTPSOrLocalHTTP(scheme, host: host),
      components.user == nil,
      components.password == nil,
      components.query == nil,
      components.fragment == nil
    else {
      return nil
    }

    var normalised = components
    normalised.scheme = scheme
    normalised.host = host
    if (scheme == "http" && components.port == 80) || (scheme == "https" && components.port == 443) {
      normalised.port = nil
    }

    var path = components.percentEncodedPath
    while path.hasSuffix("/") {
      path.removeLast()
    }
    while path.hasPrefix("/") {
      path.removeFirst()
    }
    normalised.percentEncodedPath = path.isEmpty ? "" : "/" + path
    return normalised.string
  }

  var connectionFingerprint: String {
    [normalisedBaseURLString ?? trimmedBaseURL, planID, authenticatedUserID].joined(separator: "|")
  }

  /// Identifies "the same signed-in connection" without the plan id.
  ///
  /// `resolvePlanSelection()` writes `planID` from inside the first
  /// `refreshAll()` of a launch (adopting a sole plan, or clearing an
  /// unavailable one). Keying the launch `.task` on `connectionFingerprint`
  /// made that write change the task's identity, cancelling the in-flight
  /// refresh and restarting the whole waterfall a second time. This
  /// fingerprint omits `planID` so resolving the plan mid-flight no longer
  /// restarts the launch task; explicit plan switches call `refreshAll()`
  /// directly (see `AppModel.applySettings`) rather than relying on a task
  /// restart, so they are unaffected.
  var launchFingerprint: String {
    [normalisedBaseURLString ?? trimmedBaseURL, authenticatedUserID].joined(separator: "|")
  }

  func matchesCurrentOrLegacyOutboxStamp(_ stamp: String) -> Bool {
    stamp == connectionFingerprint
      || stamp == [trimmedBaseURL, planID, authenticatedUserID].joined(separator: "|")
  }

  /// Account presentation preferences belong to one authenticated plan.
  /// Canonicalising the endpoint prevents harmless URL spelling differences
  /// from creating or, worse, sharing the wrong preference scope.
  var viewPrefsScopeKey: String? {
    guard
      isAuthenticated,
      let endpoint = normalisedBaseURLString,
      !authenticatedUserID.isEmpty,
      !planID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else {
      return nil
    }
    return [endpoint, authenticatedUserID, planID].joined(separator: "|")
  }

  var baseURL: URL? {
    guard
      let components = URLComponents(string: trimmedBaseURL),
      let scheme = components.scheme?.lowercased(),
      scheme == "http" || scheme == "https",
      let host = components.host,
      !host.isEmpty,
      Self.allowsHTTPSOrLocalHTTP(scheme, host: host),
      components.user == nil,
      components.password == nil,
      components.query == nil,
      components.fragment == nil
    else {
      return nil
    }
    return components.url
  }

  static func allowsHTTPSOrLocalHTTP(_ scheme: String, host: String) -> Bool {
    scheme == "https" || (scheme == "http" && isLocalNetworkHost(host))
  }

  static func isLocalNetworkHost(_ host: String) -> Bool {
    let host = host.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
    if host == "localhost" {
      return true
    }
    if host.hasSuffix(".local") {
      let prefix = host.dropLast(6)
      return !prefix.isEmpty && prefix.last != "."
    }
    if host.contains(":") {
      return host == "::1" || host.hasPrefix("fe80:") || host.hasPrefix("fc") || host.hasPrefix("fd")
    }
    let labels = host.split(separator: ".", omittingEmptySubsequences: false)
    guard labels.count == 4 else {
      return false
    }
    var parts: [UInt8] = []
    parts.reserveCapacity(4)
    for label in labels {
      let text = String(label)
      guard let octet = UInt8(text), String(octet) == text else {
        return false
      }
      parts.append(octet)
    }
    if parts[0] == 127 || parts[0] == 10 || parts[0] == 169 && parts[1] == 254 {
      return true
    }
    if parts[0] == 192 && parts[1] == 168 {
      return true
    }
    if parts[0] == 172 && (16 ... 31).contains(parts[1]) {
      return true
    }
    return false
  }

  var browserSetupURL: URL? {
    guard let baseURL, baseURL.scheme == "https",
          var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
    else {
      return nil
    }
    components.path = "/"
    return components.url
  }

  var isConfigured: Bool {
    baseURL != nil
  }

  var refusesPublicHTTP: Bool {
    guard
      let components = URLComponents(string: trimmedBaseURL),
      components.scheme?.lowercased() == "http",
      let host = components.host,
      !host.isEmpty
    else {
      return false
    }
    return !Self.isLocalNetworkHost(host)
  }

  var isAuthenticated: Bool {
    !sessionToken.isEmpty && !authenticatedUserID.isEmpty
  }

  /// Keeps an already-selected accessible plan, otherwise adopts the only
  /// plan the signed-in user can read. Ambiguous servers intentionally retain
  /// the existing value so a user cannot be moved to an unintended plan.
  func resolvedPlanID(from plans: [PlanSummary]) -> String? {
    let currentPlanID = planID.trimmingCharacters(in: .whitespacesAndNewlines)
    if plans.contains(where: { $0.id == currentPlanID }) {
      return currentPlanID
    }
    guard plans.count == 1 else {
      return nil
    }
    return plans[0].id
  }

  static func load(
    from defaults: UserDefaults = .standard,
    environment: [String: String] = ProcessInfo.processInfo.environment
  ) -> APISettings {
#if DEBUG
    if !defaults.bool(forKey: debugBootstrapAppliedKey),
       let bootstrap = debugBootstrapSettings(from: environment) {
      // `save` writes the opaque token only to the endpoint-scoped Keychain
      // item; the UserDefaults payload intentionally remains public settings.
      bootstrap.save(to: defaults)
      defaults.set(true, forKey: debugBootstrapAppliedKey)
      // A forced termination may follow this first launch immediately. Flush
      // the endpoint/plan and marker before a relaunch needs the Keychain token.
      defaults.synchronize()
      return bootstrap
    }
#endif
    guard
      let data = defaults.data(forKey: userDefaultsKey),
      let decoded = try? JSONDecoder().decode(APISettings.self, from: data)
    else {
      return APISettings()
    }
    var settings = decoded
    if settings.isLocal {
      // The engine token only has to match between the app and its own
      // engine, so a Keychain that lost it is repaired rather than signed out.
      if let normalisedBaseURL = settings.normalisedBaseURLString,
         let token = CredentialStore.load(for: normalisedBaseURL) {
        settings.sessionToken = token
      } else {
        settings.sessionToken = randomEngineToken()
        settings.save(to: defaults)
      }
      // Local mode has one principal. An install whose user id was cleared
      // (an earlier build signed local mode out) is restored, not stranded.
      if settings.authenticatedUserID.isEmpty {
        settings.authenticatedUserID = localUserID
        settings.save(to: defaults)
      }
      return settings
    }
    // `http://127.0.0.1:8787` was once a development default, but it is also
    // the self-hosted server's own address in the Simulator, so it is kept:
    // only the owner's former hosted address moves with the service.
    if let storedBaseURL = settings.normalisedBaseURLString,
       storedBaseURL == normalisedBaseURLString(from: legacyProductionBaseURL) {
      // Anyone who left the connection on an earlier version's hosted default
      // is following production, not a deliberate custom endpoint, so the
      // setting moves with the service. The token is scoped to the old host,
      // so re-save it under the new one before dropping the old copy. A very
      // old install may still hold the single unscoped legacy token instead.
      settings.baseURLString = productionBaseURL
      settings.sessionToken = CredentialStore.load(for: storedBaseURL) ?? CredentialStore.loadLegacy() ?? ""
      settings.save(to: defaults)
      CredentialStore.remove(for: storedBaseURL)
      return settings
    }

    if let normalisedBaseURL = decoded.normalisedBaseURLString,
       let token = CredentialStore.load(for: normalisedBaseURL) {
      settings.sessionToken = token
    } else if decoded.normalisedBaseURLString == normalisedBaseURLString(from: productionBaseURL),
              let legacyToken = CredentialStore.loadLegacy() {
      // Versions before endpoint scoping used one global Keychain account.
      // Only migrate it when UserDefaults proves the saved endpoint is the
      // production service; custom endpoints must never inherit that token.
      settings.sessionToken = legacyToken
      settings.save(to: defaults)
      return settings
    } else {
      settings.sessionToken = ""
    }
    return settings
  }

#if DEBUG
  private static func debugBootstrapSettings(from environment: [String: String]) -> APISettings? {
    guard
      let submittedURL = environment["HOWMUCH_BOOTSTRAP_BASE_URL"],
      let normalisedURL = normalisedBaseURLString(from: submittedURL),
      let normalisedProductionURL = normalisedBaseURLString(from: productionBaseURL),
      normalisedURL == normalisedProductionURL,
      URLComponents(string: normalisedURL)?.scheme?.lowercased() == "https",
      let username = environment["HOWMUCH_BOOTSTRAP_USERNAME"]?.trimmingCharacters(in: .whitespacesAndNewlines),
      !username.isEmpty,
      let planID = environment["HOWMUCH_BOOTSTRAP_PLAN_ID"]?.trimmingCharacters(in: .whitespacesAndNewlines),
      !planID.isEmpty,
      let sessionToken = environment["HOWMUCH_BOOTSTRAP_SESSION_TOKEN"],
      !sessionToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else {
      return nil
    }

    // The launch contract deliberately contains a username, not a separately
    // identifying profile payload. It is sufficient for the local signed-in
    // state; every request is still authenticated by the opaque session token.
    return APISettings(
      baseURLString: normalisedURL,
      username: username,
      sessionToken: sessionToken,
      authenticatedUserID: username,
      planID: planID
    )
  }
#endif

  func save(to defaults: UserDefaults = .standard) {
    CredentialStore.save(sessionToken, for: normalisedBaseURLString)
    var publicSettings = self
    publicSettings.sessionToken = ""
    guard let data = try? JSONEncoder().encode(publicSettings) else {
      return
    }
    defaults.set(data, forKey: Self.userDefaultsKey)
  }

  static func savedSessionToken(forBaseURL baseURLString: String) -> String? {
    normalisedBaseURLString(from: baseURLString).flatMap(CredentialStore.load(for:))
  }

  static func forgetSavedSession(forBaseURL baseURLString: String) {
    guard let normalised = normalisedBaseURLString(from: baseURLString) else {
      return
    }
    CredentialStore.remove(for: normalised)
  }

#if DEBUG
  /// Points credential storage at a service the caller owns, so a test never
  /// reads or migrates the token the installed app keeps for a real server.
  /// Returns the previous service for the test to restore.
  @discardableResult
  static func useCredentialService(_ name: String) -> String {
    CredentialStore.useService(name)
  }
#endif
}

extension APISettings {
  /// Local requests are addressed as though to this server, so endpoint-scoped
  /// state (the Keychain token, view preferences, snapshots) needs no special case.
  static let localBaseURL = LocalEngine.origin
  /// The id the engine reports for its API-token principal (`GET /v1/user`).
  static let localUserID = "local-user"
  static let localPlanIDKey = "HowMuch.LocalPlanID"

  /// Local-mode settings for this install. The plan id is created once and
  /// kept, so the on-device ledger stays addressable after any later change
  /// of mode; the engine token is new each time and saved to the Keychain by `save`.
  /// `livePlanIDs` are the plans already in the on-device database, read
  /// before the engine starts (see `LocalEngine.livePlanIDs()`).
  static func local(in defaults: UserDefaults = .standard, livePlanIDs: [String] = []) -> APISettings {
    APISettings(
      baseURLString: localBaseURL,
      sessionToken: randomEngineToken(),
      authenticatedUserID: localUserID,
      planID: localPlanID(in: defaults, livePlanIDs: livePlanIDs),
      mode: .local
    )
  }

  static func localPlanID(in defaults: UserDefaults = .standard, livePlanIDs: [String] = []) -> String {
    let saved = defaults.string(forKey: localPlanIDKey)
    let planID = LocalPlanRecovery.planID(saved: saved, livePlanIDs: livePlanIDs)
      ?? "plan_" + UUID().uuidString.lowercased()
    if planID != saved {
      defaults.set(planID, forKey: localPlanIDKey)
    }
    return planID
  }

  static func randomEngineToken() -> String {
    var bytes = [UInt8](repeating: 0, count: 32)
    if SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) != errSecSuccess {
      return UUID().uuidString + UUID().uuidString
    }
    return bytes.map { String(format: "%02x", $0) }.joined()
  }

  /// Whether this install has ever saved a connection. A fresh install has
  /// not; an install that signed out or lost its session still has.
  static func hasSavedSettings(in defaults: UserDefaults = .standard) -> Bool {
    defaults.data(forKey: userDefaultsKey) != nil
  }

  var localEngineConfig: LocalEngineConfig {
    LocalEngineConfig(
      apiToken: sessionToken,
      defaultPlanId: planID,
      timeZone: TimeZone.current.identifier,
      newPlanSettings: Self.newPlanSettings
    )
  }

  /// Read once per launch so the engine config stays equal between calls.
  private static let newPlanSettings = PlanSettingsSeed.from(locale: .current)
}

extension APISettings {
  /// Written by hand only so that a missing `mode` decodes as `.server`; every
  /// other key decodes exactly as the synthesised conformance did.
  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.init(
      baseURLString: try container.decode(String.self, forKey: .baseURLString),
      username: try container.decode(String.self, forKey: .username),
      sessionToken: try container.decode(String.self, forKey: .sessionToken),
      authenticatedUserID: try container.decode(String.self, forKey: .authenticatedUserID),
      planID: try container.decode(String.self, forKey: .planID),
      mode: try container.decodeIfPresent(Mode.self, forKey: .mode) ?? .server
    )
  }
}

/// Which plan the on-device ledger uses when local mode starts.
enum LocalPlanRecovery {
  /// The saved id wins. Without one (lost preferences, a restored backup),
  /// a database holding exactly one live plan is adopted, so the ledger on
  /// the device is not orphaned behind a new, empty plan. Otherwise `nil`:
  /// the caller creates a plan.
  static func planID(saved: String?, livePlanIDs: [String]) -> String? {
    if let saved, !saved.isEmpty {
      return saved
    }
    return livePlanIDs.count == 1 ? livePlanIDs[0] : nil
  }
}

/// Where a launch starts: first use, a connection that needs signing in, or
/// the app itself.
enum LaunchRoute: Equatable {
  case welcome
  case connection
  case main

  /// Only an install that has never saved settings is offered the welcome
  /// screen. A saved but signed-out connection (a revoked session, a restore
  /// without its Keychain) returns to Connection, as it always has, so an
  /// existing server user is never moved into local mode.
  static func resolve(hasSavedSettings: Bool, isAuthenticated: Bool) -> LaunchRoute {
    if isAuthenticated {
      return .main
    }
    return hasSavedSettings ? .connection : .welcome
  }
}

private enum CredentialStore {
  /// Tests run inside the app host, so by default they would share the
  /// installed app's Keychain items. `APISettings.useCredentialService` points
  /// a test at a service it owns instead.
  private static var service = Bundle.main.bundleIdentifier ?? "HowMuch"
  private static let legacyAccount = "session-token"
  private static let accountPrefix = "session-token:"
#if DEBUG
  @discardableResult
  static func useService(_ name: String) -> String {
    let previous = service
    service = name
    return previous
  }
#endif

  static func load(for normalisedBaseURL: String) -> String? {
    load(account: accountPrefix + normalisedBaseURL)
  }

  static func loadLegacy() -> String? {
    load(account: legacyAccount)
  }

  /// Drops a token scoped to an endpoint the app has left, so a migrated
  /// connection does not leave its old copy of the session behind.
  static func remove(for normalisedBaseURL: String) {
    let identity: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: accountPrefix + normalisedBaseURL,
    ]
    SecItemDelete(identity as CFDictionary)
  }

  private static func load(account: String) -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
          let data = item as? Data
    else {
      return nil
    }
    return String(data: data, encoding: .utf8)
  }

  static func save(_ token: String, for normalisedBaseURL: String?) {
    guard let normalisedBaseURL else {
      removeLegacy()
      return
    }

    let identity: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: accountPrefix + normalisedBaseURL,
    ]
    SecItemDelete(identity as CFDictionary)
    removeLegacy()
    guard !token.isEmpty, let data = token.data(using: .utf8) else {
      return
    }
    var item = identity
    item[kSecValueData as String] = data
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    SecItemAdd(item as CFDictionary, nil)
  }

  private static func removeLegacy() {
    let identity: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: legacyAccount,
    ]
    SecItemDelete(identity as CFDictionary)
  }

}

struct ViewPrefs: Codable, Equatable {
  /// Legacy unscoped key. It remains readable for one-time migration but all
  /// new writes go through the scoped preference store.
  static let userDefaultsKey = "HowMuch.ViewPrefs"

  var lastUsedAccountID: String?
  /// Whether the spending report includes bookkeeping ("quiet") category
  /// groups; mirrors the web app's persisted includeQuietSpending pref.
  var includeQuietSpending: Bool?
  var favouriteAccountIDs: [String] = []
  /// Legacy global order retained so existing installs can seed every new
  /// group's manual order deterministically.
  var accountOrder: [String] = []
  /// Manual order is now specific to the displayed group. This lets, for
  /// example, a favourite account sit first in Favourites without moving the
  /// same account within Cash. Only manual reordering writes here, so a group
  /// keeps its arrangement while it is temporarily sorted another way.
  var accountOrderByGroup: [String: [String]] = [:]
  var accountGroupSorts: [String: AccountGroupSort] = [:]
  var customAccountGroups: [CustomAccountGroup] = []

  private enum CodingKeys: String, CodingKey {
    case lastUsedAccountID
    case includeQuietSpending
    case favouriteAccountIDs
    case accountOrder
    case accountOrderByGroup
    case accountGroupSorts
    case customAccountGroups
  }

  init(
    lastUsedAccountID: String? = nil,
    includeQuietSpending: Bool? = nil,
    favouriteAccountIDs: [String] = [],
    accountOrder: [String] = [],
    accountOrderByGroup: [String: [String]] = [:],
    accountGroupSorts: [String: AccountGroupSort] = [:],
    customAccountGroups: [CustomAccountGroup] = []
  ) {
    self.lastUsedAccountID = lastUsedAccountID
    self.includeQuietSpending = includeQuietSpending
    self.favouriteAccountIDs = favouriteAccountIDs
    self.accountOrder = accountOrder
    self.accountOrderByGroup = accountOrderByGroup
    self.accountGroupSorts = accountGroupSorts
    self.customAccountGroups = customAccountGroups
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    lastUsedAccountID = try container.decodeIfPresent(String.self, forKey: .lastUsedAccountID)
    includeQuietSpending = try container.decodeIfPresent(Bool.self, forKey: .includeQuietSpending)
    favouriteAccountIDs = try container.decodeIfPresent([String].self, forKey: .favouriteAccountIDs) ?? []
    accountOrder = try container.decodeIfPresent([String].self, forKey: .accountOrder) ?? []
    accountOrderByGroup = try container.decodeIfPresent([String: [String]].self, forKey: .accountOrderByGroup) ?? [:]
    accountGroupSorts = try container.decodeIfPresent([String: AccountGroupSort].self, forKey: .accountGroupSorts) ?? [:]
    customAccountGroups = try container.decodeIfPresent([CustomAccountGroup].self, forKey: .customAccountGroups) ?? []
    self = structurallyNormalised()
  }

  static func load(from defaults: UserDefaults = .standard) -> ViewPrefs {
    guard
      let data = defaults.data(forKey: userDefaultsKey),
      let decoded = try? JSONDecoder().decode(ViewPrefs.self, from: data)
    else {
      return ViewPrefs()
    }
    return decoded
  }

  /// Normalises persisted structure without deciding whether an account ID is
  /// still valid. Account membership is pruned only after an authoritative
  /// reference refresh succeeds.
  func structurallyNormalised() -> ViewPrefs {
    var result = self
    result.favouriteAccountIDs = result.favouriteAccountIDs.uniqueNonEmptyStrings
    result.accountOrder = result.accountOrder.uniqueNonEmptyStrings
    result.accountOrderByGroup = result.accountOrderByGroup.reduce(into: [:]) { output, item in
      guard !item.key.isEmpty else { return }
      output[item.key] = item.value.uniqueNonEmptyStrings
    }

    var usedIDs: Set<String> = []
    result.customAccountGroups = result.customAccountGroups.compactMap { group in
      let id = group.id.trimmingCharacters(in: .whitespacesAndNewlines)
      let name = group.name.trimmingCharacters(in: .whitespacesAndNewlines)
      guard
        !id.isEmpty,
        !CustomAccountGroup.reservedIDs.contains(id.lowercased()),
        !name.isEmpty,
        usedIDs.insert(id).inserted
      else {
        return nil
      }
      return CustomAccountGroup(id: id, name: name, accountIDs: group.accountIDs.uniqueNonEmptyStrings)
    }

    let validGroupIDs = CustomAccountGroup.reservedIDs.union(result.customAccountGroups.map(\.id))
    result.accountGroupSorts = result.accountGroupSorts.filter { validGroupIDs.contains($0.key) }
    result.accountOrderByGroup = result.accountOrderByGroup.filter { validGroupIDs.contains($0.key) }
    return result
  }
}

/// The account-only subset shared by every client for one user and plan.
/// Device-specific navigation and report preferences remain in `ViewPrefs`.
struct AccountPresentationPreferences: Codable, Equatable {
  var favouriteAccountIDs: [String]
  var accountOrder: [String]
  var accountOrderByGroup: [String: [String]]
  var accountGroupSorts: [String: AccountGroupSort]
  var customAccountGroups: [CustomAccountGroup]

  init(_ preferences: ViewPrefs) {
    favouriteAccountIDs = preferences.favouriteAccountIDs
    accountOrder = preferences.accountOrder
    accountOrderByGroup = preferences.accountOrderByGroup
    accountGroupSorts = preferences.accountGroupSorts
    customAccountGroups = preferences.customAccountGroups
  }

  func applying(to preferences: ViewPrefs) -> ViewPrefs {
    var result = preferences
    result.favouriteAccountIDs = favouriteAccountIDs
    result.accountOrder = accountOrder
    result.accountOrderByGroup = accountOrderByGroup
    result.accountGroupSorts = accountGroupSorts
    result.customAccountGroups = customAccountGroups
    return result.structurallyNormalised()
  }

  static func merging(
    baseline: AccountPresentationPreferences,
    local: AccountPresentationPreferences,
    remote: AccountPresentationPreferences
  ) -> AccountPresentationPreferences {
    let groups = mergeCustomGroups(baseline: baseline.customAccountGroups, local: local.customAccountGroups, remote: remote.customAccountGroups)
    return AccountPresentationPreferences(
      favouriteAccountIDs: local.favouriteAccountIDs != baseline.favouriteAccountIDs ? local.favouriteAccountIDs : remote.favouriteAccountIDs,
      accountOrder: local.accountOrder != baseline.accountOrder ? local.accountOrder : remote.accountOrder,
      accountOrderByGroup: mergeMap(baseline: baseline.accountOrderByGroup, local: local.accountOrderByGroup, remote: remote.accountOrderByGroup),
      accountGroupSorts: mergeMap(baseline: baseline.accountGroupSorts, local: local.accountGroupSorts, remote: remote.accountGroupSorts),
      customAccountGroups: groups
    )
  }

  private init(
    favouriteAccountIDs: [String],
    accountOrder: [String],
    accountOrderByGroup: [String: [String]],
    accountGroupSorts: [String: AccountGroupSort],
    customAccountGroups: [CustomAccountGroup]
  ) {
    self.favouriteAccountIDs = favouriteAccountIDs
    self.accountOrder = accountOrder
    self.accountOrderByGroup = accountOrderByGroup
    self.accountGroupSorts = accountGroupSorts
    self.customAccountGroups = customAccountGroups
  }
}

private func mergeMap<Value: Equatable>(baseline: [String: Value], local: [String: Value], remote: [String: Value]) -> [String: Value] {
  var result = remote
  for key in Set(baseline.keys).union(local.keys) where local[key] != baseline[key] {
    result[key] = local[key]
  }
  return result
}

private func mergeCustomGroups(
  baseline: [CustomAccountGroup],
  local: [CustomAccountGroup],
  remote: [CustomAccountGroup]
) -> [CustomAccountGroup] {
  let baselineByID = Dictionary(uniqueKeysWithValues: baseline.map { ($0.id, $0) })
  let localByID = Dictionary(uniqueKeysWithValues: local.map { ($0.id, $0) })
  let remoteByID = Dictionary(uniqueKeysWithValues: remote.map { ($0.id, $0) })
  let localChangedOrder = local.map(\.id) != baseline.map(\.id)
  let preferredOrder = localChangedOrder
    ? local.map(\.id) + remote.map(\.id).filter { baselineByID[$0] == nil && localByID[$0] == nil }
    : remote.map(\.id)
  return preferredOrder.compactMap { id in
    localByID[id] != baselineByID[id] ? localByID[id] : remoteByID[id]
  }
}

struct SyncedAccountPreferences: Codable, Equatable {
  let preferences: AccountPresentationPreferences
  let revision: Int
}

private extension Array where Element == String {
  var uniqueNonEmptyStrings: [String] {
    var seen: Set<String> = []
    return compactMap { value in
      let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !trimmed.isEmpty, seen.insert(trimmed).inserted else {
        return nil
      }
      return trimmed
    }
  }
}

/// Versioned, connection/user/plan-scoped preference envelope.
struct ScopedViewPrefsStore: Codable, Equatable {
  static let userDefaultsKey = "HowMuch.ViewPrefsByScope"

  var scopes: [String: ViewPrefs] = [:]
  var syncedAccountPreferences: [String: SyncedAccountPreferences] = [:]
  var didMigrateLegacy = false

  private enum CodingKeys: String, CodingKey {
    case scopes
    case syncedAccountPreferences
    case didMigrateLegacy
  }

  init(
    scopes: [String: ViewPrefs] = [:],
    syncedAccountPreferences: [String: SyncedAccountPreferences] = [:],
    didMigrateLegacy: Bool = false
  ) {
    self.scopes = scopes.mapValues { $0.structurallyNormalised() }
    self.syncedAccountPreferences = syncedAccountPreferences
    self.didMigrateLegacy = didMigrateLegacy
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    if let scopeContainer = try? container.nestedContainer(
      keyedBy: ViewPrefsScopeCodingKey.self,
      forKey: .scopes
    ) {
      scopes = scopeContainer.allKeys.reduce(into: [:]) { decoded, key in
        guard let preferences = try? scopeContainer.decode(ViewPrefs.self, forKey: key) else {
          return
        }
        decoded[key.stringValue] = preferences.structurallyNormalised()
      }
    } else {
      scopes = [:]
    }
    syncedAccountPreferences = try container.decodeIfPresent(
      [String: SyncedAccountPreferences].self,
      forKey: .syncedAccountPreferences
    ) ?? [:]
    didMigrateLegacy = try container.decodeIfPresent(Bool.self, forKey: .didMigrateLegacy) ?? false
  }

  static func load(from defaults: UserDefaults = .standard) -> ScopedViewPrefsStore {
    guard
      let data = defaults.data(forKey: userDefaultsKey),
      let decoded = try? JSONDecoder().decode(ScopedViewPrefsStore.self, from: data)
    else {
      return ScopedViewPrefsStore()
    }
    return decoded
  }

  mutating func activate(scope: String, legacy: ViewPrefs) -> ViewPrefs {
    if let existing = scopes[scope] {
      if !didMigrateLegacy {
        didMigrateLegacy = true
        save()
      }
      return existing.structurallyNormalised()
    }
    if !didMigrateLegacy {
      let migrated = legacy.structurallyNormalised()
      scopes[scope] = migrated
      didMigrateLegacy = true
      save()
      return migrated
    }
    return ViewPrefs()
  }

  /// An unscoped legacy blob cannot safely be assigned to a user who signs in
  /// later: that user may not be the person who created it. Authenticated cold
  /// launches migrate above; signed-out cold launches deliberately discard the
  /// migration opportunity while leaving any already-scoped preferences intact.
  mutating func discardUnscopedLegacyMigration() {
    guard !didMigrateLegacy else { return }
    didMigrateLegacy = true
    save()
  }

  mutating func set(_ preferences: ViewPrefs, for scope: String) {
    scopes[scope] = preferences.structurallyNormalised()
    save()
  }

  mutating func markAccountPreferencesSynced(_ snapshot: SyncedAccountPreferences, for scope: String) {
    syncedAccountPreferences[scope] = snapshot
    save()
  }

  func save(to defaults: UserDefaults = .standard) {
    guard let data = try? JSONEncoder().encode(self) else {
      return
    }
    defaults.set(data, forKey: Self.userDefaultsKey)
  }
}

private struct ViewPrefsScopeCodingKey: CodingKey {
  let stringValue: String
  let intValue: Int? = nil

  init?(stringValue: String) {
    self.stringValue = stringValue
  }

  init?(intValue: Int) {
    return nil
  }
}

/// Sorting is intentionally local to an account group. Names and manual order
/// stay useful offline, while usage is refreshed from the ledger when needed.
enum AccountGroupSort: String, Codable, CaseIterable, Identifiable {
  case manual
  case alphabetical
  case mostUsedLast30Days

  var id: String { rawValue }

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    self = AccountGroupSort(rawValue: (try? container.decode(String.self)) ?? "") ?? .manual
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(rawValue)
  }

  var title: String {
    switch self {
    case .manual: "Manual"
    case .alphabetical: "Alphabetical"
    case .mostUsedLast30Days: "Most used (30 days)"
    }
  }
}

/// A synced account collection. Membership is deliberately represented by IDs
/// so account balances and names remain authoritative API data.
struct CustomAccountGroup: Codable, Equatable, Hashable, Identifiable {
  static let reservedIDs: Set<String> = ["favourites", "cash", "credit", "tracking", "closed"]
  static let reservedNameKeys: Set<String> = Set(["Favourites", "Cash", "Credit", "Tracking", "Closed"].map(normalisedNameKey))

  var id: String
  var name: String
  var accountIDs: [String]

  static func normalisedNameKey(_ name: String) -> String {
    name
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
      .lowercased()
  }
}
