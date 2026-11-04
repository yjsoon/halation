import XCTest
@testable import HowMuch

final class CaptureOriginTests: XCTestCase {

  func testOverviewPlusPrefersLastUsedOverAccountOrderAndFocusedRegister() {
    let context = CaptureAccountContext.resolve(
      origin: .lastUsedOpen,
      openAccounts: [
        Self.account("acct-rainy", "Rainy Day Saver"),
        Self.account("acct-everyday", "Everyday"),
        Self.account("acct-travel", "Travel Card"),
      ],
      lastUsedAccountID: "acct-everyday",
      focusedRegisterAccountID: "acct-travel"
    )
    XCTAssertEqual(context.selectedAccountID, "acct-everyday")
  }

  func testHomeScreenIgnoresLeftoverVisibleRegister() {
    let context = CaptureAccountContext.resolve(
      origin: .homeScreenShortcut,
      openAccounts: Self.open,
      lastUsedAccountID: "acct-everyday",
      focusedRegisterAccountID: "acct-travel"
    )
    XCTAssertEqual(context.selectedAccountID, "acct-everyday")
    XCTAssertTrue(context.origin.ignoresVisibleRegister)
  }

  func testClosedLastUsedFallsBackToFirstOpen() {
    let context = CaptureAccountContext.resolve(
      origin: .lastUsedOpen,
      openAccounts: Self.open,
      lastUsedAccountID: "acct-closed"
    )
    XCTAssertEqual(context.selectedAccountID, "acct-everyday")
  }

  func testNoOpenAccountsRequiresChoice() {
    let closed = [
      Self.account("acct-closed", "Closed Card", closed: true),
    ]
    let context = CaptureAccountContext.resolve(
      origin: .lastUsedOpen,
      openAccounts: closed,
      lastUsedAccountID: "acct-closed"
    )
    XCTAssertNil(context.selectedAccountID)
  }

  func testPresetDraftKeepsExplicitAccount() {
    let context = CaptureAccountContext.resolve(
      origin: .presetDraft,
      openAccounts: Self.open,
      lastUsedAccountID: "acct-everyday",
      focusedRegisterAccountID: "acct-travel",
      presetAccountID: "acct-rainy"
    )
    XCTAssertEqual(context.selectedAccountID, "acct-rainy")
  }

  func testPresetDraftFallsBackWhenExplicitAccountClosed() {
    let context = CaptureAccountContext.resolve(
      origin: .presetDraft,
      openAccounts: Self.open,
      lastUsedAccountID: "acct-everyday",
      presetAccountID: "acct-closed"
    )
    XCTAssertEqual(context.selectedAccountID, "acct-everyday")
  }

  func testInboxUsesLastUsedNotFocusedRegister() {
    let context = CaptureAccountContext.resolve(
      origin: .inbox,
      openAccounts: Self.open,
      lastUsedAccountID: "acct-rainy",
      focusedRegisterAccountID: "acct-travel"
    )
    XCTAssertEqual(context.selectedAccountID, "acct-rainy")
  }

  func testNeverSelectsClosedOrDeletedAccount() {
    let mixed = [
      Self.account("acct-closed", "Closed", closed: true),
      Self.account("acct-deleted", "Deleted", deleted: true),
      Self.account("acct-everyday", "Everyday"),
    ]
    let fromRegister = CaptureAccountContext.resolve(
      origin: .visibleRegister(accountID: "acct-closed"),
      openAccounts: mixed,
      lastUsedAccountID: "acct-deleted"
    )
    XCTAssertEqual(fromRegister.selectedAccountID, "acct-everyday")
  }

  func testExplicitRetryRefreshesFailedReference() {
    XCTAssertTrue(CaptureAdmissionGate.shouldRefreshReference(phase: .failed("offline"), explicitRetry: true))
    XCTAssertFalse(CaptureAdmissionGate.shouldRefreshReference(phase: .failed("offline"), explicitRetry: false))
    XCTAssertTrue(CaptureAdmissionGate.shouldRefreshReference(phase: .idle, explicitRetry: false))
    XCTAssertFalse(CaptureAdmissionGate.shouldRefreshReference(phase: .loaded, explicitRetry: false))
  }

  func testReferenceWaitStopsOnlyWhenNothingWillLoadTheReference() {
    XCTAssertEqual(CaptureAdmissionGate.referenceWait(referencePhase: .loaded, isRefreshingAll: false), .admit)
    XCTAssertEqual(CaptureAdmissionGate.referenceWait(referencePhase: .loaded, isRefreshingAll: true), .admit)
    XCTAssertEqual(CaptureAdmissionGate.referenceWait(referencePhase: .failed("offline"), isRefreshingAll: false), .admit)
    XCTAssertEqual(CaptureAdmissionGate.referenceWait(referencePhase: .failed("offline"), isRefreshingAll: true), .admit)
    XCTAssertEqual(CaptureAdmissionGate.referenceWait(referencePhase: .loading, isRefreshingAll: false), .wait)
    XCTAssertEqual(CaptureAdmissionGate.referenceWait(referencePhase: .loading, isRefreshingAll: true), .wait)
    XCTAssertEqual(CaptureAdmissionGate.referenceWait(referencePhase: .idle, isRefreshingAll: true), .wait)
    XCTAssertEqual(CaptureAdmissionGate.referenceWait(referencePhase: .idle, isRefreshingAll: false), .stalled)
  }

  /// An offline warm launch turns the reference phase `.failed` over accounts
  /// the snapshot already put on screen. Those are enough to capture against.
  func testFailedRefreshBlocksAdmissionOnlyWithoutAccounts() {
    XCTAssertNil(CaptureAdmissionGate.blockingError(referencePhase: .failed("offline"), hasAccounts: true))
    XCTAssertEqual(
      CaptureAdmissionGate.blockingError(referencePhase: .failed("offline"), hasAccounts: false),
      "offline"
    )
    XCTAssertNil(CaptureAdmissionGate.blockingError(referencePhase: .loaded, hasAccounts: false))
    XCTAssertNil(CaptureAdmissionGate.blockingError(referencePhase: .loaded, hasAccounts: true))
  }

  /// Failure modes: a plan holding only closed or deleted rows (AppModel's
  /// `openAccounts` keeps deleted ones) would admit into a picker with
  /// nothing to choose; and a reference that failed or is still loading must
  /// not invite the user to add an account they may already have.
  func testAddAccountPromptOnlyWhenLoadedPlanHasNoUsableAccount() {
    let unusable = [
      Self.account("acct-closed", "Closed", closed: true),
      Self.account("acct-deleted", "Deleted", deleted: true),
    ]
    XCTAssertTrue(CaptureAdmissionGate.needsAccount(referencePhase: .loaded, accounts: []))
    XCTAssertTrue(CaptureAdmissionGate.needsAccount(referencePhase: .loaded, accounts: unusable))
    XCTAssertFalse(
      CaptureAdmissionGate.needsAccount(
        referencePhase: .loaded,
        accounts: unusable + [Self.account("acct-everyday", "Everyday")]
      )
    )
    XCTAssertFalse(CaptureAdmissionGate.needsAccount(referencePhase: .failed("offline"), accounts: []))
    XCTAssertFalse(CaptureAdmissionGate.needsAccount(referencePhase: .loading, accounts: []))
    XCTAssertFalse(CaptureAdmissionGate.needsAccount(referencePhase: .idle, accounts: []))
  }

  func testAdmissionAfterRefreshRequiresCurrentRequestAndMatchingScope() {
    let request = CaptureRequest(kind: .blank, connectionFingerprint: "plan-a")
    let other = CaptureRequest(kind: .blank, connectionFingerprint: "plan-a")
    XCTAssertTrue(
      CaptureAdmissionGate.shouldAdmitAfterRefresh(
        request: request,
        presented: request,
        isCancelled: false,
        settingsScopeKey: "https://a|user-a|plan-a",
        workspaceScopeKey: "https://a|user-a|plan-a"
      )
    )
    XCTAssertTrue(
      CaptureAdmissionGate.shouldAdmitAfterRefresh(
        request: request,
        presented: request,
        isCancelled: false,
        settingsScopeKey: nil,
        workspaceScopeKey: nil
      )
    )
    XCTAssertFalse(
      CaptureAdmissionGate.shouldAdmitAfterRefresh(
        request: request,
        presented: request,
        isCancelled: true,
        settingsScopeKey: "https://a|user-a|plan-a",
        workspaceScopeKey: "https://a|user-a|plan-a"
      )
    )
    XCTAssertFalse(
      CaptureAdmissionGate.shouldAdmitAfterRefresh(
        request: request,
        presented: nil,
        isCancelled: false,
        settingsScopeKey: "https://a|user-a|plan-a",
        workspaceScopeKey: "https://a|user-a|plan-a"
      )
    )
    XCTAssertFalse(
      CaptureAdmissionGate.shouldAdmitAfterRefresh(
        request: request,
        presented: other,
        isCancelled: false,
        settingsScopeKey: "https://a|user-a|plan-a",
        workspaceScopeKey: "https://a|user-a|plan-a"
      )
    )
    XCTAssertFalse(
      CaptureAdmissionGate.shouldAdmitAfterRefresh(
        request: request,
        presented: request,
        isCancelled: false,
        settingsScopeKey: "https://a|user-a|plan-a",
        workspaceScopeKey: "https://b|user-b|plan-a"
      )
    )
  }

  private static let open = [
    account("acct-everyday", "Everyday"),
    account("acct-travel", "Travel Card"),
    account("acct-rainy", "Rainy Day Saver"),
  ]

  private static func account(
    _ id: String,
    _ name: String,
    closed: Bool = false,
    deleted: Bool = false
  ) -> Account {
    Account(
      id: id,
      name: name,
      icon: nil,
      type: "checking",
      onBudget: true,
      closed: closed,
      balance: 0,
      clearedBalance: 0,
      unclearedBalance: 0,
      lastReconciledDate: nil,
      deleted: deleted
    )
  }
}
