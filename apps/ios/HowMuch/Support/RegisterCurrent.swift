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
    let upcoming = transactions.reduce(0) { sum, row in
      guard !row.deleted, row.accountID == accountID, isUpcomingDate(row.date, today: today) else {
        return sum
      }
      return sum + row.amount
    }
    return working - upcoming
  }
}
