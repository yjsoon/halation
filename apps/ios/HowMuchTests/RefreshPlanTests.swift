import XCTest
@testable import HowMuch

/// The functional core of #179: which slices a mutation makes stale, how
/// back-to-back refresh requests coalesce, and when the Reflect reports may be
/// served from cache (#180). No network, no model, no view.
final class RefreshPlanTests: XCTestCase {

  func testNoMutationEverRefetchesReferenceDataOrReports() {
    let mutations: [MutationKind] = [
      .clearedToggled,
      .transactionEdited(changesAccount: true, touchesTransfer: true, hasNewPayee: true),
      .transactionsCreated(hasTransfer: true, hasNewPayee: true),
      .transactionDeleted,
      .transactionsApproved,
      .accountCreated,
      .accountUpdated,
      .accountReconciled,
      .scheduleSaved,
      .scheduleDeleted,
      .scheduledOccurrenceEntered(isTransfer: true),
    ]
    for mutation in mutations {
      let slices = RefreshPlanner.slices(after: mutation)
      XCTAssertFalse(
        slices.contains(.referenceData),
        "\(mutation) must not drag the five-request reference batch behind a write"
      )
      XCTAssertFalse(
        slices.contains(.reports),
        "\(mutation) must mark the reports stale, not refetch them behind a write"
      )
    }
  }

  func testAccountsPullRetriesTheWholeBatchWhenReferenceDataIsNotLoaded() {
    XCTAssertEqual(
      TabRefresh.accounts(referencePhase: .loaded),
      [.accounts],
      "the ordinary pull stays one GET"
    )
    for phase in [LoadPhase.idle, .failed("offline")] {
      XCTAssertEqual(
        TabRefresh.accounts(referencePhase: phase),
        [.referenceData],
        "the Accounts placeholder sits inside the pull, so \(phase) makes the pull its retry"
      )
    }
  }

  func testMergingKeepsTheUnionAndTheLoudestIntent() {
    let background = RefreshRequest(slices: [.accounts], quiet: true, force: false)
    let pull = RefreshRequest(slices: [.ledger], quiet: false, force: true)
    let merged = background.merging(pull)
    XCTAssertEqual(merged.slices, [.accounts, .ledger])
    XCTAssertFalse(merged.quiet, "one non-quiet caller makes the coalesced pass non-quiet")
    XCTAssertTrue(merged.force, "one forced caller makes the coalesced pass forced")
  }

  func testReferenceDataAbsorbsItsOwnNarrowerSlices() {
    let request = RefreshRequest(slices: [.referenceData, .accounts, .payees, .ledger])
    XCTAssertEqual(
      request.slices,
      [.referenceData, .ledger],
      "the reference batch already fetches accounts and payees; keeping both would double the requests"
    )
  }

  func testLoadedReportsAreServedFromCacheWhenNothingMoved() {
    XCTAssertFalse(
      ReportsRefreshPolicy.shouldFetch(
        phase: .loaded,
        force: false,
        lastKnowledge: 7,
        currentKnowledge: 7,
        lastMutationGeneration: 3,
        currentMutationGeneration: 3
      ),
      "a second visit with an unchanged cursor and no local writes must not refetch"
    )
  }

  func testAdvancedKnowledgeOrALocalWriteInvalidatesTheCache() {
    XCTAssertTrue(
      ReportsRefreshPolicy.shouldFetch(
        phase: .loaded,
        force: false,
        lastKnowledge: 7,
        currentKnowledge: 8,
        lastMutationGeneration: 3,
        currentMutationGeneration: 3
      ),
      "a cursor that advanced means someone else wrote to the plan"
    )
    XCTAssertTrue(
      ReportsRefreshPolicy.shouldFetch(
        phase: .loaded,
        force: false,
        lastKnowledge: 7,
        currentKnowledge: 7,
        lastMutationGeneration: 3,
        currentMutationGeneration: 4
      ),
      "this device's own writes are applied locally and never move the cursor, so they need their own signal"
    )
  }

  func testReportsFromAnEarlierDayOrMinutesAgoAreStale() {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "Asia/Singapore")!
    let justPastMidnight = calendar.date(from: DateComponents(year: 2026, month: 3, day: 10, hour: 0, minute: 2))!
    let noon = calendar.date(from: DateComponents(year: 2026, month: 3, day: 10, hour: 12))!
    func shouldFetch(fetchedSecondsAgo: TimeInterval, now: Date = justPastMidnight) -> Bool {
      ReportsRefreshPolicy.shouldFetch(
        phase: .loaded,
        force: false,
        lastKnowledge: 7,
        currentKnowledge: 7,
        lastMutationGeneration: 3,
        currentMutationGeneration: 3,
        lastFetchedAt: now.addingTimeInterval(-fetchedSecondsAgo),
        now: now,
        calendar: calendar
      )
    }
    XCTAssertFalse(shouldFetch(fetchedSecondsAgo: 60), "a fetch a minute ago, today, is current")
    XCTAssertTrue(shouldFetch(fetchedSecondsAgo: 180), "three minutes ago was yesterday, so today's figures are missing")
    XCTAssertTrue(
      shouldFetch(fetchedSecondsAgo: ReportsRefreshPolicy.maxAge + 60, now: noon),
      "spending entered on another device only shows once the cache ages out"
    )
  }

  func testPullToRefreshForcesAFetchAndAnInFlightOneIsNotDuplicated() {
    XCTAssertTrue(
      ReportsRefreshPolicy.shouldFetch(
        phase: .loaded,
        force: true,
        lastKnowledge: 7,
        currentKnowledge: 7,
        lastMutationGeneration: 3,
        currentMutationGeneration: 3
      )
    )
    XCTAssertFalse(
      ReportsRefreshPolicy.shouldFetch(
        phase: .loading,
        force: true,
        lastKnowledge: nil,
        currentKnowledge: nil,
        lastMutationGeneration: nil,
        currentMutationGeneration: 0
      ),
      "a fetch already in flight must not be started twice"
    )
  }

  /// A cancelled fetch returns the phase to `.idle` rather than to `.failed`
  /// or a stuck `.loading`. The next appearance must fetch.
  func testACancelledFetchIsRetriedOnTheNextAppearance() {
    XCTAssertTrue(
      ReportsRefreshPolicy.shouldFetch(
        phase: .idle,
        force: false,
        lastKnowledge: 7,
        currentKnowledge: 7,
        lastMutationGeneration: 3,
        currentMutationGeneration: 3
      )
    )
  }

  func testReportFetchGateRejectsAStaleRetryAfterANewerFilterFetch() {
    var gate = ReportFetchGate()
    let retryA = gate.begin()
    let filterB = gate.begin()
    XCTAssertTrue(gate.isCurrent(filterB), "filter B's fetch is the one allowed to commit")
    XCTAssertFalse(
      gate.isCurrent(retryA),
      "a Retry for filter A that settles after B, success or failure, must not replace or clear B's report"
    )
  }

  func testReportFetchGateRejectsTheEarlierOfTwoRequestsForTheSameFilter() {
    var gate = ReportFetchGate()
    let firstA = gate.begin()
    _ = gate.begin()
    let secondA = gate.begin()
    XCTAssertFalse(
      gate.isCurrent(firstA),
      "A → B → A: the first A request is obsolete even though its filter is current again"
    )
    XCTAssertTrue(gate.isCurrent(secondA))
  }
}
