import XCTest
@testable import HowMuch

final class SlipReaderMappingTests: XCTestCase {

  func testExtractionAmountsAcceptCurrencyPrefixesAndJunk() {
    let mapped = SlipReaderMapping.map(
      [
        .init(amount: "S$50"),
        .init(amount: "SGD 50"),
        .init(amount: "USD 12.5"),
        .init(amount: "$50 for coffee"),
        .init(amount: "50 dollars"),
        .init(amount: "$5"),
        .init(amount: "$1,234.56"),
        .init(amount: "S$1,234"),
        .init(amount: "$.50"),
      ],
      accounts: [],
      categoryGroups: [],
      payees: [],
      calendar: Self.calendar,
      now: Self.now
    )
    XCTAssertEqual(
      mapped.map(\.draft.amountMagnitudeMilli),
      [50_000, 50_000, 12_500, 50_000, 50_000, 5_000, 1_234_560, 1_234_000, 500]
    )
    XCTAssertEqual(mapped.map(\.parsedAmount), Array(repeating: true, count: 9))
    XCTAssertEqual(MoneyCodec.milliunits(fromExtraction: "S$50"), 50_000)
    XCTAssertEqual(MoneyCodec.milliunits(fromExtraction: "$1,234.56"), 1_234_560)
    XCTAssertEqual(MoneyCodec.milliunits(fromExtraction: "S$1,234"), 1_234_000)
    XCTAssertEqual(MoneyCodec.milliunits(fromExtraction: "$.50"), 500)
    XCTAssertEqual(MoneyCodec.milliunits(from: "$.50"), 500)
    XCTAssertNil(MoneyCodec.milliunits(from: "S$50"))
  }

  /// The system decimal pad shows the device's own decimal separator. Where
  /// that is a comma, stripping it as a thousands separator saved "12,50" as
  /// 1,250.00: a hundred times the amount, with no error shown.
  func testTypedAmountsReadADeviceDecimalComma() {
    XCTAssertEqual(MoneyCodec.milliunits(fromTyped: "12,50", decimalSeparator: ","), 12_500)
    XCTAssertEqual(MoneyCodec.milliunits(fromTyped: "-0,5", decimalSeparator: ","), -500)
    XCTAssertEqual(MoneyCodec.milliunits(fromTyped: "12.50", decimalSeparator: ","), 12_500)
    XCTAssertNil(MoneyCodec.milliunits(fromTyped: "1,2345", decimalSeparator: ","))
    // Where the decimal point is a full stop, a comma still groups thousands.
    XCTAssertEqual(MoneyCodec.milliunits(fromTyped: "1,250", decimalSeparator: "."), 1_250_000)
    XCTAssertEqual(MoneyCodec.milliunits(fromTyped: "1,234.56", decimalSeparator: "."), 1_234_560)
  }

  /// Reward rates, block sizes and the miles valuation are typed on the same
  /// decimal pad. With a device decimal comma, `Double("1,4")` is nil, so a
  /// fractional rate could never be saved: every entry was "not a number".
  func testTypedDecimalsReadADeviceDecimalComma() {
    XCTAssertEqual(TypedNumber.double(from: "1,4", decimalSeparator: ","), 1.4)
    XCTAssertEqual(TypedNumber.double(from: " 0,015 ", decimalSeparator: ","), 0.015)
    XCTAssertEqual(TypedNumber.double(from: "1.4", decimalSeparator: ","), 1.4)
    XCTAssertEqual(TypedNumber.double(from: "1.4", decimalSeparator: "."), 1.4)
    XCTAssertNil(TypedNumber.double(from: "1,4", decimalSeparator: "."))
    XCTAssertNil(TypedNumber.double(from: "1,4,5", decimalSeparator: ","))
    XCTAssertNil(TypedNumber.double(from: "", decimalSeparator: ","))
  }

  // Failure modes the E2E flows miss: a stray second sign read as a valid
  // amount ("--5" saved as 5, "1.-5" as 0.95), fractions saved for a currency
  // without a minor unit, typed values past the keypad cap, and Int64
  // overflow trapping (crashing the app) when split lines or server balances
  // are summed.
  func testTypedAmountsRejectStraySigns() {
    for input in ["--5", "1.-5", "+-5", "-+5", "1.+5", "-", ".", "-.", "1,-5"] {
      XCTAssertNil(MoneyCodec.milliunits(fromTyped: input, decimalSeparator: "."), input)
    }
    XCTAssertNil(MoneyCodec.milliunits(fromTyped: "1,-5", decimalSeparator: ","))
    XCTAssertEqual(MoneyCodec.milliunits(fromTyped: "-0", decimalSeparator: "."), 0)
    XCTAssertEqual(MoneyCodec.milliunits(fromTyped: "-5", decimalSeparator: "."), -5_000)
    XCTAssertEqual(MoneyCodec.milliunits(fromTyped: "+5", decimalSeparator: "."), 5_000)
    XCTAssertEqual(MoneyCodec.milliunits(fromTyped: ".5", decimalSeparator: "."), 500)
    XCTAssertEqual(MoneyCodec.editableString(for: MoneyCodec.milliunits(fromTyped: "-0.00", decimalSeparator: ".") ?? 1), "0.00")
  }

  func testTypedAmountsRespectThePlanDecimalPlaces() {
    XCTAssertNil(MoneyCodec.milliunits(fromTyped: "1.5", decimalDigits: 0, decimalSeparator: "."))
    XCTAssertEqual(MoneyCodec.milliunits(fromTyped: "1.0", decimalDigits: 0, decimalSeparator: "."), 1_000)
    XCTAssertEqual(MoneyCodec.milliunits(fromTyped: "1.00", decimalDigits: 0, decimalSeparator: "."), 1_000)
    XCTAssertNil(MoneyCodec.milliunits(fromTyped: "1.005", decimalDigits: 2, decimalSeparator: "."))
    XCTAssertEqual(MoneyCodec.milliunits(fromTyped: "1.050", decimalDigits: 2, decimalSeparator: "."), 1_050)
    XCTAssertEqual(MoneyCodec.milliunits(fromTyped: "1.005", decimalDigits: 3, decimalSeparator: "."), 1_005)
    // Without a plan format, milliunits remain the limit.
    XCTAssertEqual(MoneyCodec.milliunits(fromTyped: "1.005", decimalSeparator: "."), 1_005)
  }

  /// Typed fields stop where the server does (one trillion units), so a
  /// dong or rupiah balance past the keypad's 999,999,999.99 still fits.
  func testTypedAmountsStopAtTheStorableCap() {
    XCTAssertEqual(MoneyCodec.milliunits(fromTyped: "2000000000", decimalSeparator: "."), 2_000_000_000_000)
    XCTAssertEqual(MoneyCodec.milliunits(fromTyped: "1000000000000", decimalSeparator: "."), MoneyCodec.storableAmountCap)
    XCTAssertEqual(MoneyCodec.milliunits(fromTyped: "-1000000000000", decimalSeparator: "."), -MoneyCodec.storableAmountCap)
    XCTAssertNil(MoneyCodec.milliunits(fromTyped: "1000000000000.001", decimalSeparator: "."))
    XCTAssertNil(MoneyCodec.milliunits(fromTyped: "5000000000000000", decimalSeparator: "."))
  }

  func testHugeSplitLinesAreInvalidRatherThanACrash() {
    var draft = TransactionDraft()
    draft.accountID = "account"
    draft.subtransactions = [
      TransactionSubtransactionDraft(amountText: "5000000000000000"),
      TransactionSubtransactionDraft(amountText: "5000000000000000"),
    ]
    _ = draft.signedMilliunits
    XCTAssertNotNil(draft.splitValidationMessage)
    XCTAssertFalse(draft.canSave)

    // Each line fits, but a parent past the server's cap is refused inline.
    draft.subtransactions = [
      TransactionSubtransactionDraft(amountText: "1000000000000"),
      TransactionSubtransactionDraft(amountText: "1000000000000"),
    ]
    XCTAssertEqual(draft.signedMilliunits, 2 * MoneyCodec.storableAmountCap)
    XCTAssertNotNil(draft.splitValidationMessage)

    draft.subtransactions = [
      TransactionSubtransactionDraft(amountText: "999999999999"),
      TransactionSubtransactionDraft(amountText: "1"),
    ]
    XCTAssertNil(draft.splitValidationMessage)
    XCTAssertNil(draft.splitValidationMessage)

    draft.subtransactions = [
      TransactionSubtransactionDraft(amountText: "1.5"),
      TransactionSubtransactionDraft(amountText: "2"),
    ]
    XCTAssertNil(draft.splitValidationMessage(decimalDigits: 2))
    XCTAssertNotNil(draft.splitValidationMessage(decimalDigits: 0))
  }

  /// A capture can read a card number as an amount; seeding the keypad with
  /// it and typing a digit or adding must not overflow.
  func testKeypadClampsAHugeSeededAmount() {
    var keypad = AmountKeypadEngine()
    keypad.setValue(9_000_000_000_000_000_000)
    XCTAssertEqual(keypad.display, MoneyCodec.storableAmountCap)
    // Untouched, it goes back as stored, for the server to refuse loudly.
    XCTAssertEqual(keypad.committedValue, 9_000_000_000_000_000_000)
    keypad.tapDigit(9)
    keypad.tapOperator(.add)
    keypad.tapDigit(9)
    XCTAssertEqual(keypad.commitValue(), MoneyCodec.typedAmountCap + 90)
  }

  /// Editing the memo of a 2,000,000,000 dong row must save the same amount.
  func testKeypadKeepsAStoredAmountPastItsCap() {
    var keypad = AmountKeypadEngine()
    keypad.setValue(2_000_000_000_000)
    XCTAssertEqual(keypad.committedValue, 2_000_000_000_000)
    // Arithmetic on it stops at the server's cap, not the typing cap.
    keypad.tapOperator(.subtract)
    keypad.tapDigit(1, fractionDigits: 0)
    XCTAssertEqual(keypad.commitValue(), 1_999_999_999_000)
  }

  /// Opening a row and saving it untouched keeps its exact stored amount.
  func testKeypadReturnsAnUntouchedSeed() {
    var keypad = AmountKeypadEngine()
    keypad.setValue(1_005)
    XCTAssertEqual(keypad.commitValue(), 1_005)
  }

  func testKeypadNeverBuildsAFractionalYen() {
    var keypad = AmountKeypadEngine()
    for _ in 0..<12 {
      keypad.tapDigit(9, fractionDigits: 0)
    }
    XCTAssertEqual(keypad.display % 1_000, 0)
    keypad.tapOperator(.add)
    for _ in 0..<12 {
      keypad.tapDigit(9, fractionDigits: 0)
    }
    XCTAssertEqual(keypad.commitValue() % 1_000, 0)
  }

  /// Shortcuts or capture must not add 1.5 yen: a new row saves the amount
  /// its review shows, rounded to the smallest unit. An edit keeps its own.
  func testNewDraftsRoundToTheMinorUnit() {
    var draft = TransactionDraft()
    draft.accountID = "account"
    draft.amountMagnitudeMilli = 1_500
    XCTAssertEqual(draft.roundedToMinorUnit(decimalDigits: 0).amountMagnitudeMilli, 2_000)
    draft.amountMagnitudeMilli = 12_345
    XCTAssertEqual(draft.roundedToMinorUnit(decimalDigits: 2).amountMagnitudeMilli, 12_350)
    XCTAssertEqual(draft.roundedToMinorUnit(decimalDigits: 3).amountMagnitudeMilli, 12_345)
    XCTAssertEqual(draft.roundedToMinorUnit(decimalDigits: nil).amountMagnitudeMilli, 12_345)
    draft.amountMagnitudeMilli = 400
    XCTAssertEqual(draft.roundedToMinorUnit(decimalDigits: 0).amountMagnitudeMilli, 1_000)
    draft.amountMagnitudeMilli = 12_345
    draft.id = "txn_existing"
    XCTAssertEqual(draft.roundedToMinorUnit(decimalDigits: 0).amountMagnitudeMilli, 12_345)
  }

  /// A tie shows as it saves: away from zero, as on the web.
  func testDisplayRoundsTiesAwayFromZero() {
    let sgd = CurrencyFormat(isoCode: "SGD", exampleFormat: "$123,456.78", decimalDigits: 2, decimalSeparator: ".", groupSeparator: ",", symbolFirst: true, currencySymbol: "$", displaySymbol: true)
    XCTAssertEqual(MoneyCodec.displayString(for: 12_345, currencyFormat: sgd), "$12.35")
    XCTAssertEqual(MoneyCodec.displayString(for: -12_345, currencyFormat: sgd), "-$12.35")
  }

  /// A line saved before amounts were held to the currency's minor unit
  /// must still save untouched, or a memo edit on its split is refused.
  func testUntouchedLegacySplitLineKeepsItsAmount() {
    let stored = Subtransaction(id: "sub-1", transactionID: "txn-1", amount: -1_500, memo: nil, payeeID: nil, payeeName: nil, categoryID: nil, categoryName: nil, transferAccountID: nil, transferTransactionID: nil, deleted: false)
    var line = TransactionSubtransactionDraft(subtransaction: stored)
    XCTAssertEqual(line.amount(decimalDigits: 0), -1_500)
    line.amountText = "-1.5"
    XCTAssertNil(line.amount(decimalDigits: 0))
  }

  func testExtractedAmountsStopAtTheKeypadCap() {
    XCTAssertNil(MoneyCodec.milliunits(fromExtraction: "4111111111111111"))
    XCTAssertNil(MoneyCodec.milliunits(fromExtraction: "$9000000000000000"))
    XCTAssertEqual(MoneyCodec.milliunits(fromExtraction: "S$1,234.50"), 1_234_500)
  }

  /// The server stores up to 1e15 milliunits per amount, so a few thousand
  /// such balances already pass Int64.
  func testServerSumsDoNotTrapOnOverflow() {
    let huge = Array(repeating: 1_000_000_000_000_000, count: 10_000)
    XCTAssertNil(huge.checkedSum())
    XCTAssertNil([Int.max, 1].checkedSum())
    XCTAssertNil([Int.min, -1].checkedSum())
    XCTAssertEqual(huge.saturatingSum(), Int.max)
    XCTAssertEqual(huge.map { -$0 }.saturatingSum(), Int.min)
    XCTAssertEqual([1_000, -250, 5].checkedSum(), 755)
    XCTAssertEqual([1_000, -250, 5].saturatingSum(), 755)
  }

  /// A plan's currency format says where its symbol goes and whether it shows
  /// at all (a YNAB euro plan is "123.456,78€"), as the web app draws it. The
  /// device's region pattern put the symbol first and showed a hidden one.
  func testDisplayFollowsThePlanSymbolPlacement() {
    let euro = CurrencyFormat(
      isoCode: "EUR",
      exampleFormat: "123.456,78€",
      decimalDigits: 2,
      decimalSeparator: ",",
      groupSeparator: ".",
      symbolFirst: false,
      currencySymbol: "€"
    )
    XCTAssertEqual(MoneyCodec.displayString(for: 1_234_560, currencyFormat: euro), "1.234,56€")
    XCTAssertEqual(MoneyCodec.displayString(for: -1_234_560, currencyFormat: euro), "-1.234,56€")

    let hidden = CurrencyFormat(
      isoCode: "SGD",
      exampleFormat: "123,456.78",
      decimalDigits: 2,
      decimalSeparator: ".",
      groupSeparator: ",",
      symbolFirst: true,
      currencySymbol: "$",
      displaySymbol: false
    )
    XCTAssertEqual(MoneyCodec.displayString(for: 1_234_560, currencyFormat: hidden), "1,234.56")
  }

  func testUnambiguousNameMapsToID() {
    let mapped = SlipReaderMapping.map(
      [.init(amount: "5", category: "Groceries", account: "Everyday Account")],
      accounts: [
        Self.account("acct-everyday", "Everyday Account"),
        Self.account("acct-travel", "Travel Card"),
      ],
      categoryGroups: [Self.everydayGroup],
      payees: [],
      calendar: Self.calendar,
      now: Self.now
    )
    XCTAssertEqual(mapped.count, 1)
    XCTAssertEqual(mapped[0].draft.accountID, "acct-everyday")
    XCTAssertEqual(mapped[0].draft.categoryID, "cat-groceries")
    XCTAssertTrue(mapped[0].accountCandidates.isEmpty)
    XCTAssertTrue(mapped[0].categoryCandidates.isEmpty)
  }

  func testTwoMatchingNamesLeaveIDNil() {
    let mapped = SlipReaderMapping.map(
      [.init(amount: "5", category: "Groceries", account: "Account")],
      accounts: [
        Self.account("acct-everyday", "Everyday Account"),
        Self.account("acct-travel", "Travel Account"),
      ],
      categoryGroups: [Self.everydayGroup],
      payees: [],
      calendar: Self.calendar,
      now: Self.now
    )
    XCTAssertEqual(mapped.count, 1)
    XCTAssertEqual(mapped[0].draft.accountID, "")
    XCTAssertTrue(mapped[0].parsedAccount)
    XCTAssertEqual(mapped[0].accountCandidates.map(\.id), ["acct-everyday", "acct-travel"])
  }

  func testOmittedAccountDoesNotForceAMatch() {
    let mapped = SlipReaderMapping.map(
      [.init(amount: "5", category: "Groceries")],
      accounts: [Self.account("acct-everyday", "Everyday Account")],
      categoryGroups: [Self.everydayGroup],
      payees: [],
      calendar: Self.calendar,
      now: Self.now
    )
    XCTAssertEqual(mapped.count, 1)
    XCTAssertFalse(mapped[0].parsedAccount)
    XCTAssertEqual(mapped[0].draft.accountID, "")
    XCTAssertTrue(mapped[0].accountCandidates.isEmpty)
  }

  func testAmbiguousAccountKeepsTransferPayee() {
    let mapped = SlipReaderMapping.map(
      [.init(amount: "5", payee: "Transfer : Travel Account", account: "Account")],
      accounts: [
        Self.account("acct-everyday", "Everyday Account"),
        Self.account("acct-travel", "Travel Account"),
      ],
      categoryGroups: [Self.everydayGroup],
      payees: [
        Payee(
          id: "payee-travel",
          name: "Transfer : Travel Account",
          transferAccountId: "acct-travel",
          deleted: false
        ),
      ],
      calendar: Self.calendar,
      now: Self.now
    )
    XCTAssertEqual(mapped.count, 1)
    XCTAssertEqual(mapped[0].draft.accountID, "")
    XCTAssertEqual(mapped[0].accountCandidates.map(\.id), ["acct-everyday", "acct-travel"])
    XCTAssertEqual(mapped[0].draft.transferAccountID, "acct-travel")
    XCTAssertEqual(mapped[0].draft.payeeID, "payee-travel")
  }

  func testPickingTransferDestinationAccountDropsSelfTransfer() {
    var draft = TransactionDraft()
    draft.transferAccountID = "acct-travel"
    draft.payeeID = "payee-travel"
    draft.payeeName = "Transfer : Travel Account"
    SlipAccountPick.apply("acct-travel", to: &draft)
    XCTAssertEqual(draft.accountID, "acct-travel")
    XCTAssertNil(draft.transferAccountID)
    XCTAssertNil(draft.payeeID)
    XCTAssertEqual(draft.payeeName, "")
  }

  func testPickingOtherAccountKeepsTransfer() {
    var draft = TransactionDraft()
    draft.transferAccountID = "acct-travel"
    draft.payeeID = "payee-travel"
    draft.payeeName = "Transfer : Travel Account"
    SlipAccountPick.apply("acct-everyday", to: &draft)
    XCTAssertEqual(draft.accountID, "acct-everyday")
    XCTAssertEqual(draft.transferAccountID, "acct-travel")
    XCTAssertEqual(draft.payeeID, "payee-travel")
  }

  func testDateUsesLocalCalendar() {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 8 * 3600)!
    let now = Date(timeIntervalSince1970: 1_746_316_800)
    let mapped = SlipReaderMapping.map(
      [.init(amount: "5", date: "2026-03-04")],
      accounts: [],
      categoryGroups: [],
      payees: [],
      calendar: calendar,
      now: now
    )
    XCTAssertEqual(mapped.count, 1)
    XCTAssertTrue(mapped[0].parsedDate)
    XCTAssertEqual(calendar.dateComponents([.year, .month, .day], from: mapped[0].draft.date).year, 2026)
    XCTAssertEqual(calendar.dateComponents([.year, .month, .day], from: mapped[0].draft.date).month, 3)
    XCTAssertEqual(calendar.dateComponents([.year, .month, .day], from: mapped[0].draft.date).day, 4)
    let start = calendar.startOfDay(for: mapped[0].draft.date)
    XCTAssertEqual(mapped[0].draft.date, start)
  }

  func testNaturalAndScheduledDatesParse() {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    let now = Date(timeIntervalSince1970: 1_788_652_800)
    let cases: [(String, Int, Int, Int)] = [
      ("today", 2026, 9, 6),
      ("yesterday", 2026, 9, 5),
      ("8 Sep", 2026, 9, 8),
      ("Sep 8", 2026, 9, 8),
      ("8 September", 2026, 9, 8),
      ("8/9", 2026, 9, 8),
      ("scheduled 15 September", 2026, 9, 15),
      ("scheduled for 15 September", 2026, 9, 15),
      ("due on 15 September", 2026, 9, 15),
      ("next Friday", 2026, 9, 11),
      ("2026-09-20", 2026, 9, 20),
    ]
    for (raw, year, month, day) in cases {
      let parsed = SlipReaderMapping.date(from: raw, calendar: calendar, now: now)
      XCTAssertNotNil(parsed, raw)
      guard let parsed else {
        continue
      }
      let parts = calendar.dateComponents([.year, .month, .day], from: parsed)
      XCTAssertEqual(parts.year, year, raw)
      XCTAssertEqual(parts.month, month, raw)
      XCTAssertEqual(parts.day, day, raw)
      XCTAssertEqual(parsed, calendar.startOfDay(for: parsed), raw)
    }
  }

  func testApplySetsScheduledNaturalDate() {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    let now = Date(timeIntervalSince1970: 1_788_652_800)
    var draft = TransactionDraft()
    draft.date = calendar.startOfDay(for: now)
    let row = SlipReaderMapping.map(
      [.init(amount: "5", date: "scheduled 15 September")],
      accounts: [],
      categoryGroups: [],
      payees: [],
      calendar: calendar,
      now: now
    )[0]
    XCTAssertTrue(row.parsedDate)
    let applied = ComposeParseApply.applying(row, to: draft)
    let parts = calendar.dateComponents([.year, .month, .day], from: applied.draft.date)
    XCTAssertEqual(parts.year, 2026)
    XCTAssertEqual(parts.month, 9)
    XCTAssertEqual(parts.day, 15)
  }

  func testUnmatchedAccountNameLeavesIDEmptyWithoutChips() {
    let mapped = SlipReaderMapping.map(
      [.init(amount: "5", account: "No Such Bank")],
      accounts: [Self.account("acct-everyday", "Everyday Account")],
      categoryGroups: [Self.everydayGroup],
      payees: [],
      calendar: Self.calendar,
      now: Self.now
    )
    XCTAssertEqual(mapped.count, 1)
    XCTAssertTrue(mapped[0].parsedAccount)
    XCTAssertEqual(mapped[0].draft.accountID, "")
    XCTAssertTrue(mapped[0].accountCandidates.isEmpty)
  }

  func testApplyClearsSeedWhenUnknownAccountIsNamedInSentence() {
    var draft = TransactionDraft()
    draft.accountID = "acct-everyday"
    draft.direction = .inflow
    let row = SlipReaderMapping.map(
      [.init(amount: "5", account: "No Such Bank")],
      sentence: "5 on No Such Bank",
      accounts: [Self.account("acct-everyday", "Everyday Account")],
      categoryGroups: [Self.everydayGroup],
      payees: [],
      calendar: Self.calendar,
      now: Self.now
    )[0]
    XCTAssertTrue(row.parsedAccount)
    XCTAssertTrue(row.parsedAccount && row.draft.accountID.isEmpty)
    XCTAssertEqual(row.unrecognizedAccount, "No Such Bank")
    let applied = ComposeParseApply.applying(row, to: draft)
    XCTAssertEqual(applied.draft.accountID, "")
    XCTAssertTrue(applied.accountCandidates.isEmpty)
    XCTAssertEqual(applied.draft.amountMagnitudeMilli, 5_000)
    XCTAssertEqual(applied.draft.direction, .inflow)
    XCTAssertFalse(applied.draft.canSave)
  }

  func testApplyDoesNotForceOutflowWhenInflowWasToggled() {
    var draft = TransactionDraft()
    draft.direction = .inflow
    draft.accountID = "acct-everyday"
    let row = SlipReaderMapping.map(
      [.init(amount: "5", category: "Groceries")],
      accounts: [Self.account("acct-everyday", "Everyday Account")],
      categoryGroups: [Self.everydayGroup],
      payees: [],
      calendar: Self.calendar,
      now: Self.now
    )[0]
    XCTAssertFalse(row.parsedDirection && row.draft.direction == .inflow)
    let applied = ComposeParseApply.applying(row, to: draft)
    XCTAssertEqual(applied.draft.direction, .inflow)
  }

  func testApplySetsInflowWhenTheSentenceReceivedMoney() {
    var draft = TransactionDraft()
    draft.direction = .outflow
    let row = SlipReaderMapping.map(
      [.init(amount: "5", isInflow: true)],
      accounts: [],
      categoryGroups: [],
      payees: [],
      calendar: Self.calendar,
      now: Self.now
    )[0]
    XCTAssertTrue(row.parsedDirection && row.draft.direction == .inflow)
    let applied = ComposeParseApply.applying(row, to: draft)
    XCTAssertEqual(applied.draft.direction, .inflow)
  }

  func testApplyKeepsSeededAccountWhenExtractionOmitsAccount() {
    var draft = TransactionDraft()
    draft.accountID = "acct-travel"
    let row = SlipReaderMapping.map(
      [.init(amount: "5")],
      sentence: "$5 coffee",
      accounts: [
        Self.account("acct-everyday", "Everyday Account"),
        Self.account("acct-travel", "Travel Card"),
      ],
      categoryGroups: [Self.everydayGroup],
      payees: [],
      calendar: Self.calendar,
      now: Self.now
    )[0]
    XCTAssertFalse(row.parsedAccount)
    XCTAssertFalse(row.parsedAccount && row.draft.accountID.isEmpty)
    let applied = ComposeParseApply.applying(row, to: draft)
    XCTAssertEqual(applied.draft.accountID, "acct-travel")
    XCTAssertTrue(applied.accountCandidates.isEmpty)
  }

  func testApplyShowsChipsAndClearsAccountWhenAmbiguous() {
    var draft = TransactionDraft()
    draft.accountID = "acct-everyday"
    let row = SlipReaderMapping.map(
      [.init(amount: "5", account: "Account")],
      sentence: "5 on Account",
      accounts: [
        Self.account("acct-everyday", "Everyday Account"),
        Self.account("acct-travel", "Travel Account"),
      ],
      categoryGroups: [Self.everydayGroup],
      payees: [],
      calendar: Self.calendar,
      now: Self.now
    )[0]
    let applied = ComposeParseApply.applying(row, to: draft)
    XCTAssertEqual(applied.draft.accountID, "")
    XCTAssertEqual(applied.accountCandidates.map(\.id), ["acct-everyday", "acct-travel"])
  }

  func testApplyUniqueAccountOverwritesASeededPick() {
    var draft = TransactionDraft()
    draft.accountID = "acct-travel"
    let row = SlipReaderMapping.map(
      [.init(amount: "5", account: "Everyday Account")],
      sentence: "5 on Everyday Account",
      accounts: [
        Self.account("acct-everyday", "Everyday Account"),
        Self.account("acct-travel", "Travel Card"),
      ],
      categoryGroups: [Self.everydayGroup],
      payees: [],
      calendar: Self.calendar,
      now: Self.now
    )[0]
    let applied = ComposeParseApply.applying(row, to: draft)
    XCTAssertEqual(applied.draft.accountID, "acct-everyday")
  }

  func testApplyKeepsSeededAccountWhenSentenceDoesNotNameOne() {
    var draft = TransactionDraft()
    draft.accountID = "acct-travel"
    let row = SlipReaderMapping.map(
      [.init(amount: "5", account: "Everyday Account")],
      sentence: "$5 coffee",
      accounts: [
        Self.account("acct-everyday", "Everyday Account"),
        Self.account("acct-travel", "Travel Card"),
      ],
      categoryGroups: [Self.everydayGroup],
      payees: [],
      calendar: Self.calendar,
      now: Self.now
    )[0]
    XCTAssertFalse(row.parsedAccount)
    XCTAssertFalse(row.parsedAccount && row.draft.accountID.isEmpty)
    XCTAssertEqual(row.draft.accountID, "")
    let applied = ComposeParseApply.applying(row, to: draft)
    XCTAssertEqual(applied.draft.accountID, "acct-travel")
    XCTAssertTrue(applied.accountCandidates.isEmpty)
  }

  func testApplyKeepsSeededAccountWhenHallucinatedAmbiguousNameIsAbsentFromSentence() {
    var draft = TransactionDraft()
    draft.accountID = "acct-everyday"
    let row = SlipReaderMapping.map(
      [.init(amount: "5", account: "Account")],
      sentence: "$5 coffee",
      accounts: [
        Self.account("acct-everyday", "Everyday Account"),
        Self.account("acct-travel", "Travel Account"),
      ],
      categoryGroups: [Self.everydayGroup],
      payees: [],
      calendar: Self.calendar,
      now: Self.now
    )[0]
    XCTAssertFalse(row.parsedAccount)
    XCTAssertFalse(row.parsedAccount && row.draft.accountID.isEmpty)
    let applied = ComposeParseApply.applying(row, to: draft)
    XCTAssertEqual(applied.draft.accountID, "acct-everyday")
    XCTAssertTrue(applied.accountCandidates.isEmpty)
  }

  func testPromptPrefixPutsCatalogsBeforeTheSentenceAndOmitsPayees() {
    let prefix = SlipReaderPrompt.prefix(
      accounts: [
        Self.account("acct-everyday", "Everyday Account"),
        Self.account("acct-closed", "Closed Card", closed: true),
      ],
      categoryGroups: [Self.everydayGroup]
    )
    XCTAssertTrue(prefix.contains("Accounts: Everyday Account"))
    XCTAssertFalse(prefix.contains("Closed Card"))
    XCTAssertTrue(prefix.contains("Categories: Groceries, Dining Out"))
    XCTAssertFalse(prefix.contains("Payees:"))
    XCTAssertFalse(prefix.contains("FairPrice"))
  }

  private static let now = Date(timeIntervalSince1970: 1_746_316_800)
  private static let calendar: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    return calendar
  }()

  private static let everydayGroup = CategoryGroup(
    id: "grp-spend",
    name: "Everyday",
    hidden: false,
    deleted: false,
    categories: [
      Category(id: "cat-groceries", categoryGroupID: "grp-spend", name: "Groceries", deleted: false),
      Category(id: "cat-dining", categoryGroupID: "grp-spend", name: "Dining Out", deleted: false),
    ]
  )

  private static func account(_ id: String, _ name: String, closed: Bool = false) -> Account {
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
      deleted: false
    )
  }
}
