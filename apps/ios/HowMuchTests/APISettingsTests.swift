import XCTest
@testable import HowMuch

final class APISettingsTests: XCTestCase {
  private var defaults: UserDefaults!
  private var suiteName = ""
  private var previousCredentialService = ""

  override func setUp() {
    super.setUp()
    suiteName = "HowMuch.APISettingsTests.\(UUID().uuidString)"
    defaults = UserDefaults(suiteName: suiteName)
    previousCredentialService = APISettings.useCredentialService("HowMuch.APISettingsTests.\(UUID().uuidString)")
  }

  override func tearDown() {
    APISettings.useCredentialService(previousCredentialService)
    defaults.removePersistentDomain(forName: suiteName)
    super.tearDown()
  }

  func testLegacyHostedDefaultFollowsProduction() {
    APISettings(baseURLString: "https://howmuch.soon.sg").save(to: defaults)

    XCTAssertEqual(APISettings.load(from: defaults).baseURLString, APISettings.productionBaseURL)
  }

  func testLegacyHostedSessionMovesWithTheHost() throws {
    try requireUsableKeychain()

    var legacy = APISettings(baseURLString: "https://howmuch.soon.sg")
    legacy.sessionToken = "token-carried-over"
    legacy.save(to: defaults)

    XCTAssertEqual(APISettings.load(from: defaults).sessionToken, "token-carried-over")
    // The second load reads the token under the current host's scope, which
    // proves the first one re-scoped it instead of leaving it behind.
    XCTAssertEqual(APISettings.load(from: defaults).sessionToken, "token-carried-over")
  }

  func testCustomEndpointAndItsSessionArePreserved() throws {
    try requireUsableKeychain()

    var custom = APISettings(baseURLString: "https://ledger.example.test")
    custom.sessionToken = "custom-token"
    custom.save(to: defaults)

    let loaded = APISettings.load(from: defaults)

    XCTAssertEqual(loaded.baseURLString, "https://ledger.example.test")
    XCTAssertEqual(loaded.sessionToken, "custom-token")
  }

  /// 8787 is the self-hosted server's default port, so this is what a
  /// self-hoster types to reach their own server from the Simulator. Moving it
  /// to the owner's instance on the next launch signed them out and pointed
  /// their next sign-in at someone else's server.
  func testLocalServerOnTheDefaultPortIsKept() {
    var development = APISettings(baseURLString: "http://127.0.0.1:8787")
    development.authenticatedUserID = "development-user"
    development.save(to: defaults)

    let loaded = APISettings.load(from: defaults)

    XCTAssertEqual(loaded.baseURLString, "http://127.0.0.1:8787")
    XCTAssertEqual(loaded.authenticatedUserID, "development-user")
  }

  /// The exact shape every install saved before local mode existed: no `mode`.
  func testSettingsSavedBeforeLocalModeDecodeAsServer() throws {
    let saved = #"{"baseURLString":"https://ledger.example.test","username":"owner","sessionToken":"","authenticatedUserID":"user_1","planID":"plan_owner"}"#
    let decoded = try JSONDecoder().decode(APISettings.self, from: Data(saved.utf8))

    XCTAssertEqual(decoded.mode, .server)
    XCTAssertFalse(decoded.isLocal)
    XCTAssertEqual(decoded.username, "owner")
    XCTAssertEqual(decoded.planID, "plan_owner")
    XCTAssertEqual(decoded.connectionFingerprint, "https://ledger.example.test|plan_owner|user_1")
    XCTAssertEqual(decoded.launchFingerprint, "https://ledger.example.test|user_1")
  }

  func testExistingServerSessionStaysOnTheServer() throws {
    try requireUsableKeychain()
    let legacyPayload = #"{"baseURLString":"https://howmuch.tk.sg","username":"owner","sessionToken":"","authenticatedUserID":"user_1","planID":"plan_owner"}"#
    APISettings(
      baseURLString: "https://howmuch.tk.sg",
      username: "owner",
      sessionToken: "owner-token",
      authenticatedUserID: "user_1",
      planID: "plan_owner"
    ).save(to: defaults)
    // Put the pre-local-mode payload back, as an upgraded install would hold it.
    defaults.set(Data(legacyPayload.utf8), forKey: APISettings.userDefaultsKey)

    let loaded = APISettings.load(from: defaults)

    XCTAssertEqual(loaded.mode, .server)
    XCTAssertEqual(loaded.baseURLString, "https://howmuch.tk.sg")
    XCTAssertEqual(loaded.sessionToken, "owner-token")
    XCTAssertTrue(loaded.isAuthenticated)
    XCTAssertEqual(LaunchRoute.resolve(hasSavedSettings: APISettings.hasSavedSettings(in: defaults), isAuthenticated: loaded.isAuthenticated), .main)
  }

  func testSignedOutServerInstallReturnsToConnectionNotWelcome() {
    APISettings(baseURLString: "https://howmuch.tk.sg", username: "owner").save(to: defaults)

    let loaded = APISettings.load(from: defaults)

    XCTAssertEqual(loaded.mode, .server)
    XCTAssertEqual(LaunchRoute.resolve(hasSavedSettings: APISettings.hasSavedSettings(in: defaults), isAuthenticated: loaded.isAuthenticated), .connection)
  }

  func testLocalSettingsRoundTripAndKeepTheirPlan() {
    let local = APISettings.local(in: defaults)
    local.save(to: defaults)

    let loaded = APISettings.load(from: defaults)

    XCTAssertEqual(loaded.mode, .local)
    XCTAssertTrue(loaded.isAuthenticated)
    XCTAssertEqual(loaded.planID, local.planID)
    XCTAssertTrue(loaded.planID.hasPrefix("plan_"))
    XCTAssertEqual(loaded.authenticatedUserID, APISettings.localUserID)
    XCTAssertEqual(loaded.baseURLString, APISettings.localBaseURL)
    // The plan id is created once per install.
    XCTAssertEqual(APISettings.local(in: defaults).planID, local.planID)
    XCTAssertEqual(loaded.localEngineConfig.defaultPlanId, local.planID)
    XCTAssertEqual(loaded.localEngineConfig.apiToken, loaded.sessionToken)
  }

  /// An earlier build could sign local mode out, clearing its user id. The
  /// next load restores it rather than leaving a local install stranded.
  func testLocalSettingsRestoreAClearedUserID() throws {
    var broken = APISettings.local(in: defaults)
    broken.authenticatedUserID = ""
    defaults.set(try JSONEncoder().encode(broken), forKey: APISettings.userDefaultsKey)

    let loaded = APISettings.load(from: defaults)

    XCTAssertEqual(loaded.authenticatedUserID, APISettings.localUserID)
    XCTAssertTrue(loaded.isAuthenticated)
    XCTAssertEqual(loaded.planID, broken.planID)
    XCTAssertEqual(APISettings.load(from: defaults).authenticatedUserID, APISettings.localUserID, "the repair is saved")
  }

  func testLocalPlanRecoveryPrefersTheSavedPlan() {
    XCTAssertEqual(LocalPlanRecovery.planID(saved: "plan_saved", livePlanIDs: ["plan_db"]), "plan_saved")
    XCTAssertEqual(LocalPlanRecovery.planID(saved: "plan_saved", livePlanIDs: []), "plan_saved")
  }

  func testLocalPlanRecoveryAdoptsTheOnlyPlanOnTheDevice() {
    XCTAssertEqual(LocalPlanRecovery.planID(saved: nil, livePlanIDs: ["plan_db"]), "plan_db")
    XCTAssertEqual(LocalPlanRecovery.planID(saved: "", livePlanIDs: ["plan_db"]), "plan_db")
  }

  func testLocalPlanRecoveryCreatesAPlanWhenTheDeviceHasNoneOrSeveral() {
    XCTAssertNil(LocalPlanRecovery.planID(saved: nil, livePlanIDs: []))
    XCTAssertNil(LocalPlanRecovery.planID(saved: nil, livePlanIDs: ["plan_a", "plan_b"]))
  }

  func testLocalPlanIDAdoptsTheDatabasePlanWhenItsKeyIsLost() {
    XCTAssertEqual(APISettings.localPlanID(in: defaults, livePlanIDs: ["plan_db"]), "plan_db")
    XCTAssertEqual(defaults.string(forKey: APISettings.localPlanIDKey), "plan_db")
    XCTAssertEqual(APISettings.localPlanID(in: defaults, livePlanIDs: []), "plan_db")
  }

  /// The Connection field rejected `halation.tinkertanker.com`: every URL
  /// check parsed the typed text as-is, and a bare host has no scheme.
  func testBareHostDefaultsToHTTPSEverywhereTheURLIsUsed() {
    let settings = APISettings(baseURLString: "  Halation.Tinkertanker.com/  ")

    XCTAssertTrue(settings.isConfigured)
    XCTAssertEqual(settings.baseURL?.scheme, "https")
    XCTAssertEqual(settings.baseURL?.host()?.lowercased(), "halation.tinkertanker.com")
    XCTAssertEqual(settings.normalisedBaseURLString, "https://halation.tinkertanker.com")
    XCTAssertEqual(
      APISettings.normalisedBaseURLString(from: "halation.tinkertanker.com"),
      APISettings.normalisedBaseURLString(from: "https://halation.tinkertanker.com")
    )
    XCTAssertFalse(settings.refusesPublicHTTP)
  }

  func testBareHostKeepsItsPortAndPath() {
    let settings = APISettings(baseURLString: "ledger.example.test:8443/halation/")

    XCTAssertEqual(settings.baseURL?.absoluteString, "https://ledger.example.test:8443/halation")
  }

  /// A typed scheme is the user's choice. Plain HTTP is never guessed, so a
  /// local server without TLS still needs `http://` typed out.
  func testExplicitSchemesAreKeptAndBareLocalHostsGetHTTPS() {
    XCTAssertEqual(APISettings(baseURLString: "http://192.168.1.5:8787").baseURL?.absoluteString, "http://192.168.1.5:8787")
    XCTAssertEqual(APISettings(baseURLString: "HTTPS://ledger.example.test").baseURL?.scheme?.lowercased(), "https")
    XCTAssertEqual(APISettings(baseURLString: "192.168.1.5:8787").baseURL?.absoluteString, "https://192.168.1.5:8787")
    XCTAssertEqual(APISettings(baseURLString: "localhost:8787").baseURL?.absoluteString, "https://localhost:8787")

    let publicHTTP = APISettings(baseURLString: "http://ledger.example.test")
    XCTAssertFalse(publicHTTP.isConfigured)
    XCTAssertTrue(publicHTTP.refusesPublicHTTP)
  }

  func testUnsupportedOrMalformedAddressesStayRejected() {
    for value in [
      "", "   ", "ftp://ledger.example.test", "javascript:alert(1)", "mailto:owner@example.test",
      "owner@ledger.example.test", "owner:secret@ledger.example.test", "ledger.example.test?x=1",
      "ledger.example.test#top", "https://", "https:", "ledger.example.test:port", "[::1",
    ] {
      let settings = APISettings(baseURLString: value)
      XCTAssertFalse(settings.isConfigured, value)
      XCTAssertNil(settings.baseURL, value)
      XCTAssertNil(APISettings.normalisedBaseURLString(from: value), value)
    }
  }

  func testBareHostSessionIsScopedToTheHTTPSServer() throws {
    try requireUsableKeychain()

    var signedIn = APISettings(baseURLString: "ledger.example.test")
    signedIn.sessionToken = "bare-host-token"
    signedIn.save(to: defaults)

    XCTAssertEqual(APISettings.load(from: defaults).sessionToken, "bare-host-token")
    XCTAssertEqual(APISettings.savedSessionToken(forBaseURL: "https://ledger.example.test"), "bare-host-token")
  }

  /// The connect flow looks up and forgets a session by the address as typed.
  /// That lookup must land on the scope the session was saved under, or a
  /// stray slash leaves a live token behind in the Keychain.
  func testTypedAddressFindsAndForgetsItsSession() throws {
    try requireUsableKeychain()

    let typed = " /ledger.example.test/ "
    var signedIn = APISettings(baseURLString: typed)
    signedIn.sessionToken = "typed-token"
    signedIn.save(to: defaults)

    XCTAssertEqual(APISettings.normalisedBaseURLString(from: typed), signedIn.normalisedBaseURLString)
    XCTAssertEqual(APISettings.savedSessionToken(forBaseURL: typed), "typed-token")
    APISettings.forgetSavedSession(forBaseURL: typed)
    XCTAssertNil(APISettings.savedSessionToken(forBaseURL: "https://ledger.example.test"))
  }

  /// The app-hosted test bundle can run with no usable Keychain — the same
  /// limitation that fails `CaptureAITests`' independent round-trip — so probe
  /// first and skip rather than report a false migration failure.
  private func requireUsableKeychain() throws {
    let name = "HowMuch.APISettingsTests.probe.\(UUID().uuidString)"
    guard let probeDefaults = UserDefaults(suiteName: name) else {
      throw XCTSkip("Could not create a probe defaults suite.")
    }
    defer { probeDefaults.removePersistentDomain(forName: name) }

    APISettings(
      baseURLString: "https://keychain-probe.example.test",
      sessionToken: "probe-token"
    ).save(to: probeDefaults)

    guard APISettings.load(from: probeDefaults).sessionToken == "probe-token" else {
      throw XCTSkip("This test host has no usable Keychain.")
    }
  }
}
