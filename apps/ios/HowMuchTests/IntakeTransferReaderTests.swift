import XCTest
@testable import HowMuch

/// Failure mode: a bank's "Scheduled transfers" screen read as spending. The
/// model and the line parser take the subtitle ("Citibank Credit Cards") as the
/// payee, invent an amount from a card number or date tile, and never reach the
/// destination account. Expectations are what a person reading the screenshot
/// would write down: one transfer per card, to the card account of that name,
/// for the amount printed, on the printed date.
final class IntakeTransferReaderTests: XCTestCase {
  private static let ocr = """
  Scheduled transfers
  All
  January
  February
  March
  OCTOBER 2026
  Oct
  16
  Citi Rewards 2026
  Citibank Credit Cards
  5425503006003601
  669.54 SGD
  Oct
  16
  Citi Cashback
  Citibank Credit Cards
  5222748001803910
  906.21 SGD
  Oct
  16
  Citi SMRT
  Citibank Credit Cards
  4265693007016656
  1,139.00 SGD
  """

  func testScheduledTransfersBecomeTransfersToTheMatchingCards() {
    let rows = IntakeTransferReader.read(
      text: Self.ocr, note: "these are transfers to other citi cards",
      accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows.map(\.draft.amountMagnitudeMilli), [669_540, 906_210, 1_139_000])
    XCTAssertEqual(rows.map(\.draft.transferAccountID), ["rewards", "cashback", "smrt"])
    XCTAssertEqual(rows.map(\.draft.payeeID), ["p-rewards", "p-cashback", "p-smrt"])
    XCTAssertEqual(rows.map(\.draft.direction), [.outflow, .outflow, .outflow])
    XCTAssertEqual(rows.map { Self.calendar.component(.day, from: $0.draft.date) }, [16, 16, 16])
    XCTAssertEqual(rows.map { Self.calendar.component(.month, from: $0.draft.date) }, [10, 10, 10])
  }

  func testTheTransferScreenIsRecognisedWithoutANote() {
    let rows = IntakeTransferReader.read(
      text: Self.ocr, note: nil,
      accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows.count, 3)
  }

  func testNothingIsReadWhenNoAmountNamesATrackedAccount() {
    let rows = IntakeTransferReader.read(
      text: Self.ocr, note: nil,
      accounts: [Self.account("everyday", "Everyday")], payees: [], calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows, [])
  }

  func testAnOrdinaryStatementIsLeftToTheOtherReaders() {
    let rows = IntakeTransferReader.read(
      text: "05 OCT KOPITIAM 12345 4.50\n04 OCT Citi Cashback 906.21",
      note: nil, accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows, [])
  }

  func testAReceiptNamingSourceAndDestinationIsDeclined() {
    let rows = IntakeTransferReader.read(
      text: """
      Transfer successful
      From
      UOB One Savings
      To
      Citi Rewards
      669.54 SGD
      """,
      note: "transfer to my citi card",
      accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows, [])
  }

  func testTwoTrackedAccountsInOneBlockAreDeclined() {
    let rows = IntakeTransferReader.read(
      text: "Scheduled transfers\nOct\n16\nUOB One Savings\nCiti Rewards\n669.54 SGD",
      note: nil, accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows, [])
  }

  func testBothAccountsOnOneLineAreDeclined() {
    let rows = IntakeTransferReader.read(
      text: "Scheduled transfers\nOct\n16\nUOB One Savings to Citi Rewards\n669.54 SGD",
      note: nil, accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows, [])
  }

  func testAmountsWithAPrefixAndSpaceStillRead() {
    let rows = IntakeTransferReader.read(
      text: Self.ocr.replacingOccurrences(of: "906.21 SGD", with: "S$ 906.21"),
      note: nil, accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows.map(\.draft.amountMagnitudeMilli), [669_540, 906_210, 1_139_000])
  }

  func testAnAmountOnTheTitleLineIsNeverLeftOutOfAPartialRead() {
    // Row two's title and amount share a line: this reader cannot place it, so
    // it must decline the screen rather than return rows one and three alone.
    let rows = IntakeTransferReader.read(
      text: Self.ocr.replacingOccurrences(of: "Citi Cashback\nCitibank Credit Cards\n5222748001803910\n906.21 SGD", with: "Citi Cashback 906.21 SGD"),
      note: nil, accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows, [])
  }

  // MARK: Fixtures

  private static let accounts = [
    account("uob", "UOB One Savings"),
    account("rewards", "Citi Rewards"),
    account("cashback", "Citi Cashback"),
    account("smrt", "Citi SMRT"),
  ]

  private static let payees = [
    Payee(id: "p-rewards", name: "Transfer : Citi Rewards", transferAccountId: "rewards", deleted: false),
    Payee(id: "p-cashback", name: "Transfer : Citi Cashback", transferAccountId: "cashback", deleted: false),
    Payee(id: "p-smrt", name: "Transfer : Citi SMRT", transferAccountId: "smrt", deleted: false),
  ]

  private static func account(_ id: String, _ name: String) -> Account {
    Account(
      id: id, name: name, icon: nil, type: "checking", onBudget: true, closed: false,
      balance: 0, clearedBalance: 0, unclearedBalance: 0, lastReconciledDate: nil, deleted: false
    )
  }

  private static var calendar: Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    return calendar
  }

  private static let now = Date(timeIntervalSince1970: 1_791_936_000) // 2026-10-14
}
