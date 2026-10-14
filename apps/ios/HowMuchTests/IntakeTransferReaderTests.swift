import XCTest
@testable import HowMuch

/// Failure mode: a bank's "Scheduled transfers" screen read as spending. The
/// model and the line parser take the subtitle ("Bank Credit Cards") as the
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
  Blue Card 2026
  Bank Credit Cards
  5555555555554444
  12.34 SGD
  Oct
  16
  Green Card
  Bank Credit Cards
  4012888888881881
  56.78 SGD
  Oct
  16
  Red Card
  Bank Credit Cards
  4111111111111111
  1,234.00 SGD
  """

  func testScheduledTransfersBecomeTransfersToTheMatchingCards() {
    let rows = IntakeTransferReader.read(
      text: Self.ocr, note: "these are transfers to my other cards",
      accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows.map(\.draft.amountMagnitudeMilli), [12_340, 56_780, 1_234_000])
    XCTAssertEqual(rows.map(\.draft.transferAccountID), ["rewards", "cashback", "smrt"])
    XCTAssertEqual(rows.map(\.draft.payeeID), ["p-rewards", "p-cashback", "p-smrt"])
    XCTAssertEqual(rows.map(\.draft.direction), [.outflow, .outflow, .outflow])
    XCTAssertEqual(rows.map { Self.calendar.component(.day, from: $0.draft.date) }, [16, 16, 16])
    XCTAssertEqual(rows.map { Self.calendar.component(.month, from: $0.draft.date) }, [10, 10, 10])
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
      text: "05 OCT KOPITIAM 12345 4.50\n04 OCT Green Card 56.78",
      note: nil, accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows, [])
  }

  func testAReceiptNamingSourceAndDestinationIsDeclined() {
    let rows = IntakeTransferReader.read(
      text: """
      Transfer successful
      From
      Everyday Savings
      To
      Blue Card
      12.34 SGD
      """,
      note: "transfer to my card",
      accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows, [])
  }

  func testTwoTrackedAccountsInOneBlockAreDeclined() {
    let rows = IntakeTransferReader.read(
      text: "Scheduled transfers\nOct\n16\nEveryday Savings\nBlue Card\n12.34 SGD",
      note: nil, accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows, [])
  }

  func testBothAccountsOnOneLineAreDeclined() {
    let rows = IntakeTransferReader.read(
      text: "Scheduled transfers\nOct\n16\nEveryday Savings to Blue Card\n12.34 SGD",
      note: nil, accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows, [])
  }

  func testAmountsWithAPrefixAndSpaceStillRead() {
    let rows = IntakeTransferReader.read(
      text: Self.ocr.replacingOccurrences(of: "56.78 SGD", with: "S$ 56.78"),
      note: nil, accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows.map(\.draft.amountMagnitudeMilli), [12_340, 56_780, 1_234_000])
  }

  func testAnAmountOnTheTitleLineIsNeverLeftOutOfAPartialRead() {
    // Row two's title and amount share a line: this reader cannot place it, so
    // it must decline the screen rather than return rows one and three alone.
    let rows = IntakeTransferReader.read(
      text: Self.ocr.replacingOccurrences(of: "Green Card\nBank Credit Cards\n4012888888881881\n56.78 SGD", with: "Green Card 56.78 SGD"),
      note: nil, accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows, [])
  }

  // MARK: Malformed screens (failure modes the share flow cannot enumerate)

  func testASummaryTotalIsNotAFourthTransfer() {
    let rows = IntakeTransferReader.read(
      text: Self.ocr + "\nTotal\n1,303.12 SGD",
      note: nil, accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows.map(\.draft.amountMagnitudeMilli), [12_340, 56_780, 1_234_000])
  }

  func testTheScreenHeaderIsNeverARowsPayee() {
    // "Blue Card" is not tracked here, so the first row is a plain spend whose
    // title is the card line, not the "OCTOBER 2026" header above its date tile.
    let rows = IntakeTransferReader.read(
      text: Self.ocr, note: nil,
      accounts: Self.accounts.filter { $0.id != "rewards" },
      payees: Self.payees.filter { $0.transferAccountId != "rewards" },
      calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows.first?.draft.payeeName, "Blue Card 2026")
  }

  func testAScheduledDateWithoutAYearIsNeverInThePast() {
    let rows = IntakeTransferReader.read(
      text: "Scheduled transfers\nJan\n5\nBlue Card\n100.00 SGD",
      note: nil, accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows.map { Self.calendar.component(.year, from: $0.draft.date) }, [2027])
    XCTAssertEqual(rows.map { Self.calendar.component(.month, from: $0.draft.date) }, [1])
  }

  func testAOneLineTotalIsIgnoredNotAReasonToDeclineTheScreen() {
    let rows = IntakeTransferReader.read(
      text: Self.ocr + "\nTotal 1,303.12 SGD",
      note: nil, accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows.map(\.draft.amountMagnitudeMilli), [12_340, 56_780, 1_234_000])
  }

  func testADayThatDoesNotExistInItsMonthDeclinesTheScreen() {
    // Filing "Nov 31" as today would put a scheduled transfer on the wrong day.
    let rows = IntakeTransferReader.read(
      text: "Scheduled transfers\nNov\n31\nBlue Card\n100.00 SGD",
      note: nil, accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows, [])
  }

  func testANoteAloneDoesNotTurnAnAccountOverviewIntoTransfers() {
    // Names above balances, no heading and no date tile: only the note says "transfer".
    let rows = IntakeTransferReader.read(
      text: "Accounts\nBlue Card\n1,200.00 SGD\nGreen Card\n300.00 SGD",
      note: "transfer these to savings",
      accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows, [])
  }

  func testOneLineSourceAndDestinationLabelsDeclineTheReceipt() {
    for label in ["From: Everyday Savings", "From account: Everyday Savings", "Sent to Blue Card", "Received from Everyday Savings"] {
      let rows = IntakeTransferReader.read(
        text: "Scheduled transfers\nOct\n16\n\(label)\nBlue Card\n12.34 SGD",
        note: nil, accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
      )
      XCTAssertEqual(rows, [], label)
    }
  }

  func testAnAccountNamedAfterTheLastAmountDeclinesTheScreen() {
    // Amount printed before the name: pairing each name with the amount above it would cross-wire.
    let rows = IntakeTransferReader.read(
      text: "Scheduled transfers\nOct\n16\n12.34 SGD\nBlue Card\nOct\n16\n56.78 SGD\nGreen Card",
      note: nil, accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows, [])
  }

  func testALineThatMerelyStartsWithFromOrToIsNotAReceiptLabel() {
    let rows = IntakeTransferReader.read(
      text: Self.ocr.replacingOccurrences(of: "Scheduled transfers\nAll", with: "Scheduled transfers\nFrom 1 Oct\nTo savings goals"),
      note: nil, accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows.count, 3)
  }

  func testANoteSayingNonTransferDoesNotOpenTheReader() {
    let rows = IntakeTransferReader.read(
      text: "Oct\n16\nBlue Card\n12.34 SGD",
      note: "this is a non-transfer purchase",
      accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows, [])
  }

  func testAWholeNumberAmountDeclinesTheScreenRatherThanDroppingARow() {
    let rows = IntakeTransferReader.read(
      text: Self.ocr.replacingOccurrences(of: "1,234.00 SGD", with: "1,234 SGD"),
      note: nil, accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows, [])
  }

  func testAEuropeanFormatAmountDeclinesTheScreen() {
    let rows = IntakeTransferReader.read(
      text: Self.ocr.replacingOccurrences(of: "1,234.00 SGD", with: "1.234,00 SGD"),
      note: nil, accounts: Self.accounts, payees: Self.payees, calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows, [])
  }

  func testADestinationWithNoTransferPayeeDeclinesTheScreen() {
    let rows = IntakeTransferReader.read(
      text: Self.ocr, note: nil,
      accounts: Self.accounts, payees: Self.payees.filter { $0.transferAccountId != "smrt" },
      calendar: Self.calendar, now: Self.now
    )
    XCTAssertEqual(rows, [])
  }

  func testSeedingNeverMakesATransferToItsOwnAccount() {
    var draft = TransactionDraft()
    draft.transferAccountID = "rewards"
    SlipAccountPick.seed(&draft, accounts: Self.accounts, preferredAccountID: "rewards")
    XCTAssertFalse(draft.accountID.isEmpty)
    XCTAssertNotEqual(draft.accountID, "rewards")
    XCTAssertEqual(draft.transferAccountID, "rewards")
  }

  // MARK: Fixtures

  private static let accounts = [
    account("uob", "Everyday Savings"),
    account("rewards", "Blue Card"),
    account("cashback", "Green Card"),
    account("smrt", "Red Card"),
  ]

  private static let payees = [
    Payee(id: "p-rewards", name: "Transfer : Blue Card", transferAccountId: "rewards", deleted: false),
    Payee(id: "p-cashback", name: "Transfer : Green Card", transferAccountId: "cashback", deleted: false),
    Payee(id: "p-smrt", name: "Transfer : Red Card", transferAccountId: "smrt", deleted: false),
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
