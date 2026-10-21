import XCTest
@testable import HowMuch

/// What VoiceOver says for a Reflect chart. Failure modes the E2E pass would
/// not pin down: a weekly chart read bar by bar (fifty-odd values), a
/// sparkline with no period names, a tie naming the stale period, a negative
/// value not counted as the lowest, and names that do not line up with the
/// values.
final class ChartSpeechTests: XCTestCase {
  private let describe: (Double) -> String = { String(Int($0)) }

  func testEmptySeriesSaysSo() {
    XCTAssertEqual(ChartSpeech.summary(names: [], values: [], describe: describe), "No data yet.")
  }

  func testSinglePeriodReadsItsValue() {
    XCTAssertEqual(
      ChartSpeech.summary(names: ["August 2026"], values: [5], describe: describe),
      "August 2026: 5."
    )
  }

  func testSeriesReadsRangeLatestHighestAndLowest() {
    XCTAssertEqual(
      ChartSpeech.summary(
        names: ["June 2026", "July 2026", "August 2026"],
        values: [-40, 90, 10],
        describe: describe
      ),
      "3 periods, June 2026 to August 2026. Latest: 10, August 2026. Highest: 90, July 2026. Lowest: -40, June 2026."
    )
  }

  func testTiesNameTheMostRecentPeriod() {
    XCTAssertEqual(
      ChartSpeech.summary(
        names: ["June 2026", "July 2026", "August 2026", "September 2026"],
        values: [7, 7, 1, 1],
        describe: describe
      ),
      "4 periods, June 2026 to September 2026. Latest: 1, September 2026. Highest: 7, July 2026. Lowest: 1, September 2026."
    )
  }

  func testSeriesWithoutMatchingNamesStillSummarises() {
    XCTAssertEqual(
      ChartSpeech.summary(names: ["June 2026"], values: [3, 9, 6], describe: describe),
      "3 periods. Latest: 6. Highest: 9. Lowest: 3."
    )
  }

  func testWeeklySeriesStaysShort() {
    let names = (1 ... 52).map { "Week \($0), 2026" }
    let summary = ChartSpeech.summary(names: names, values: (1 ... 52).map(Double.init), describe: describe)
    // Only the ends and extremes are named; no bar in between is read out.
    for week in 2 ... 51 {
      XCTAssertFalse(summary.contains("Week \(week),"), "read out week \(week): \(summary)")
    }
    XCTAssertLessThan(summary.count, 160)
  }

  func testPairedEmptySeriesSaysSo() {
    XCTAssertEqual(ChartSpeech.pairedSummary(names: [], pairs: [], describe: describe), "No data yet.")
  }

  func testPairedSinglePeriodReadsBothValues() {
    XCTAssertEqual(
      ChartSpeech.pairedSummary(names: ["August 2026"], pairs: [(income: 30, spending: 20)], describe: describe),
      "August 2026: income 30, spending 20."
    )
  }

  func testPairedSeriesReadsLatestAndPeaks() {
    XCTAssertEqual(
      ChartSpeech.pairedSummary(
        names: ["June 2026", "July 2026", "August 2026"],
        pairs: [(income: 50, spending: 80), (income: 90, spending: 10), (income: 20, spending: 30)],
        describe: describe
      ),
      "3 periods, June 2026 to August 2026. Latest, August 2026: income 20, spending 30. Most income: 90, July 2026. Most spending: 80, June 2026."
    )
  }

  func testPairedSeriesWithoutNamesStillSummarises() {
    XCTAssertEqual(
      ChartSpeech.pairedSummary(
        names: [],
        pairs: [(income: 50, spending: 80), (income: 90, spending: 10)],
        describe: describe
      ),
      "2 periods. Latest: income 90, spending 10. Most income: 90. Most spending: 80."
    )
  }
}
