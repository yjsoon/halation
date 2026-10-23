import Foundation

struct SpendingBreakdownReport: Codable {
  let total: Int
  let groups: [SpendingBreakdownGroup]
}

struct SpendingBreakdownGroup: Codable, Identifiable {
  var id: String { categoryID }

  let categoryID: String
  let categoryName: String
  let categoryGroupID: String
  let categoryGroupName: String
  let amount: Int
  let share: Double
  let transactionCount: Int

  private enum CodingKeys: String, CodingKey {
    case categoryID = "categoryId"
    case categoryName = "categoryName"
    case categoryGroupID = "categoryGroupId"
    case categoryGroupName = "categoryGroupName"
    case amount
    case share
    case transactionCount = "transactionCount"
  }
}

struct IncomeVsSpendingReport: Codable {
  let interval: String
  let periods: [IncomeVsSpendingPeriod]
}

struct IncomeVsSpendingPeriod: Codable, Identifiable {
  var id: String { period }

  let period: String
  let income: Int
  let spending: Int
  let net: Int
  let cumulativeNet: Int
}

/// This month's spending by day: every category, and separately the quiet
/// ones the spending breakdown hides by default (`nil` when there are none).
struct DailySpending: Codable {
  /// The ISO date of the first day of the month these days belong to. A full
  /// date, since on some calendars two month starts share a Gregorian month.
  let monthStart: String
  let all: IncomeVsSpendingReport
  let quiet: IncomeVsSpendingReport?
}

struct IncomeVsSpendingGroupsReport: Codable {
  let income: Int
  let spending: Int
  let net: Int
  let incomeByPayee: [IncomeVsSpendingPayeeGroup]
  let incomeByCategory: [IncomeVsSpendingCategoryGroup]
  let spendingByCategory: [IncomeVsSpendingSpendingGroup]
}

struct IncomeVsSpendingPayeeGroup: Codable, Identifiable {
  var id: String { payeeID ?? "no-payee:\(payeeName)" }

  let payeeID: String?
  let payeeName: String
  let amount: Int
  let share: Double
  let transactionCount: Int
  let categoryID: String?
  let categoryName: String
  let categoryCount: Int

  private enum CodingKeys: String, CodingKey {
    case payeeID = "payeeId"
    case payeeName
    case amount
    case share
    case transactionCount
    case categoryID = "categoryId"
    case categoryName
    case categoryCount
  }
}

struct IncomeVsSpendingCategoryGroup: Codable, Identifiable {
  var id: String { categoryID }

  let categoryID: String
  let categoryName: String
  let amount: Int
  let share: Double
  let transactionCount: Int

  private enum CodingKeys: String, CodingKey {
    case categoryID = "categoryId"
    case categoryName
    case amount
    case share
    case transactionCount
  }
}

struct IncomeVsSpendingSpendingGroup: Codable, Identifiable {
  var id: String { categoryID }

  let categoryID: String
  let categoryName: String
  let categoryGroupID: String
  let categoryGroupName: String
  let amount: Int
  let share: Double
  let transactionCount: Int

  private enum CodingKeys: String, CodingKey {
    case categoryID = "categoryId"
    case categoryName
    case categoryGroupID = "categoryGroupId"
    case categoryGroupName
    case amount
    case share
    case transactionCount
  }
}

struct NetWorthReport: Codable {
  let periods: [NetWorthPeriod]
}

struct NetWorthPeriod: Codable, Identifiable {
  var id: String { period }

  let period: String
  let endDate: String
  let netWorth: Int
  let delta: Int?
  let accounts: [NetWorthAccount]
}

struct NetWorthAccount: Codable, Identifiable {
  var id: String { accountID }

  let accountID: String
  let accountName: String
  let balance: Int
  /// Absent in report snapshots saved before closed accounts were requested.
  var closed: Bool? = nil

  private enum CodingKeys: String, CodingKey {
    case accountID = "accountId"
    case accountName = "accountName"
    case balance
    case closed
  }
}

struct AgeOfMoneyReport: Codable {
  let interval: String
  let periods: [AgeOfMoneyPeriod]
}

struct AgeOfMoneyPeriod: Codable, Identifiable {
  var id: String { period }

  let period: String
  let ageOfMoneyDays: Double?
  let spent: Int
  let unmatchedSpending: Int
}

/// Date ranges for Reflect's "Preset" mode, matching YNAB's presets plus the
/// web app's "All" range.
enum ReportPreset: String, CaseIterable, Identifiable {
  case thisMonth
  case lastMonth
  case lastThreeMonths
  case lastSixMonths
  case lastTwelveMonths
  case yearToDate
  case allTime

  var id: String { rawValue }

  var title: String {
    switch self {
    case .thisMonth:
      return "This Month"
    case .lastMonth:
      return "Last Month"
    case .lastThreeMonths:
      return "Last 3 Months"
    case .lastSixMonths:
      return "Last 6 Months"
    case .lastTwelveMonths:
      return "Last 12 Months"
    case .yearToDate:
      return "Year to Date"
    case .allTime:
      return "All Time"
    }
  }

  /// `nil` bounds mean "unbounded": All Time sends no dates at all.
  func range(now: Date = .now, calendar: Calendar = .current) -> (from: Date?, to: Date?) {
    let monthStart = now.startOfMonth(calendar: calendar)
    switch self {
    case .thisMonth:
      return (monthStart, now)
    case .lastMonth:
      let previousStart = calendar.date(byAdding: .month, value: -1, to: monthStart) ?? monthStart
      let previousEnd = calendar.date(byAdding: .day, value: -1, to: monthStart) ?? monthStart
      return (previousStart, previousEnd)
    case .lastThreeMonths:
      return (calendar.date(byAdding: .month, value: -2, to: monthStart) ?? monthStart, now)
    case .lastSixMonths:
      return (calendar.date(byAdding: .month, value: -5, to: monthStart) ?? monthStart, now)
    case .lastTwelveMonths:
      return (calendar.date(byAdding: .month, value: -11, to: monthStart) ?? monthStart, now)
    case .yearToDate:
      let components = calendar.dateComponents([.year], from: now)
      return (calendar.date(from: components) ?? now, now)
    case .allTime:
      return (nil, nil)
    }
  }
}

enum ReportInterval: String, CaseIterable, Identifiable {
  case day
  case week
  case month
  case year

  var id: String { rawValue }

  var title: String {
    switch self {
    case .day:
      return "By day"
    case .week:
      return "By week"
    case .month:
      return "By month"
    case .year:
      return "By year"
    }
  }
}
