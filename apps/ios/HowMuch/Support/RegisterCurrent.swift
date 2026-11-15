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

  /// Each account's as-of-today balance, keyed by account ID: the figure its
  /// register leads with, so the account list and group totals agree with it.
  static func asOfTodayBalances(
    accounts: [Account],
    transactions: [Transaction],
    today: String
  ) -> [String: Int] {
    let upcoming = Dictionary(
      grouping: transactions.filter { !$0.deleted && isUpcomingDate($0.date, today: today) },
      by: \.accountID
    )
    return Dictionary(
      accounts.map { account in
        (account.id, asOfTodayBalance(
          working: account.balance,
          transactions: upcoming[account.id] ?? [],
          accountID: account.id,
          today: today
        ))
      },
      uniquingKeysWith: { first, _ in first }
    )
  }
}
