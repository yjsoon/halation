import Foundation

enum RegisterCurrent {
  static func isUpcomingDate(_ date: String, today: String) -> Bool {
    date > today
  }

  static func asOfTodayBalance(
    working: Int,
    transactions: [Transaction],
    accountID: String,
    today: String
  ) -> Int {
    let upcoming = transactions
      .filter { !$0.deleted && $0.accountID == accountID && isUpcomingDate($0.date, today: today) }
      .map(\.amount)
      .saturatingSum()
    let balance = working.subtractingReportingOverflow(upcoming)
    guard balance.overflow else {
      return balance.partialValue
    }
    return upcoming < 0 ? Int.max : Int.min
  }
}
