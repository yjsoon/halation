import XCTest
@testable import HowMuch

final class RewardCardEditorTests: XCTestCase {
  func testDisabledRulesSurviveDraftDecodeWriteAndUnrelatedEdit() throws {
    let json = #"{"id":"card","name":"Travel","issuer":"Bank","type":"miles","ynabAccountId":"account","featured":false,"subcategoriesEnabled":false,"subcategories":[{"id":"category-stable","name":"Dining rule","flagColor":"red","rewardValue":4,"priority":2,"active":false,"excludeFromRewards":false,"minimumSpend":10,"maximumSpend":200,"milesBlockSize":5,"createdAt":"created","updatedAt":"updated"}],"flagNames":{"red":"Dining label"},"spendingTiers":[{"id":"tier-stable","spendThreshold":500,"earningRate":2,"maximumSpend":1000,"subcategories":[{"subcategoryId":"category-stable","rewardValue":6,"maximumSpend":100}]}]}"#
    let original = try JSONDecoder().decode(CreditCard.self, from: Data(json.utf8))
    var draft = RewardCardDraft(card: original)
    XCTAssertEqual(try draft.write(), original)
    draft.issuer = "Another bank"
    let written = try draft.write()
    XCTAssertEqual(written.subcategoriesEnabled, false)
    XCTAssertEqual(written.subcategories, original.subcategories)
    XCTAssertEqual(written.spendingTiers, original.spendingTiers)
    draft.subcategoriesEnabled = true
    XCTAssertEqual(try draft.write().subcategoriesEnabled, true)
  }

  func testUnrelatedEditPreservesSignedFinitePriority() throws {
    var draft = RewardCardDraft.empty()
    draft.name = "Card"
    draft.ynabAccountId = "account"
    draft.addFlag(.fresh(priority: "-1.25", name: "Dining", rewardValue: "4"))
    let original = try draft.write()
    draft = RewardCardDraft(card: original)
    draft.issuer = "Another bank"
    XCTAssertEqual(try draft.write().subcategories?.first?.priority, -1.25)
    for priority in ["", "NaN", "Infinity", "-Infinity"] {
      draft.flags[0].priority = priority
      XCTAssertThrowsError(try draft.write(), priority)
    }
  }

  func testRejectsInvalidPeriodsAndNegativeNumbers() throws {
    var valid = RewardCardDraft.empty()
    valid.name = "Card"
    valid.ynabAccountId = "account"
    valid.rewardMonthCount = "2"
    valid.rewardAnchorDate = "2026-02-28"
    valid.rewardMonthlyMinimum = "0"
    for months in ["1", "25", "2.5"] {
      var draft = valid
      draft.rewardMonthCount = months
      XCTAssertThrowsError(try draft.write(), months)
    }
    for date in ["2026-02-29", "2026-04-31", "2026-2-01"] {
      var draft = valid
      draft.rewardAnchorDate = date
      XCTAssertThrowsError(try draft.write(), date)
    }
    for day in ["0", "32", "1.5", ""] {
      var draft = valid
      draft.billingType = .billing
      draft.billingDay = day
      XCTAssertThrowsError(try draft.write(), day)
    }
    var draft = valid
    draft.promoStart = "2026-05-02"
    draft.promoEnd = "2026-05-01"
    XCTAssertThrowsError(try draft.write())
    draft = valid
    draft.earningRate = "-0.1"
    XCTAssertThrowsError(try draft.write())
    valid.rewardMonthCount = "24"
    valid.billingType = .billing
    valid.billingDay = "31"
    XCTAssertNoThrow(try valid.write())
  }

  func testDraftPreservesMultiMonthAndPromotionalConfiguration() throws {
    let json = #"{"id":"card","name":"Card","ynabAccountId":"account","billingCycle":{"type":"billing","dayOfMonth":31},"rewardPeriod":{"monthCount":3,"anchorDate":"2024-02-29","monthlyMinimumSpend":300},"promotionalPeriod":{"startDate":"2026-01-01","endDate":"2026-12-31","description":""},"earningRate":1.5,"earningBlockSize":5,"minimumSpend":100,"maximumSpend":1500,"subcategoriesEnabled":true,"subcategories":[],"spendingTiers":[]}"#
    let card = try JSONDecoder().decode(CreditCard.self, from: Data(json.utf8))
    let written = try RewardCardDraft(card: card).write()
    XCTAssertEqual(written, card)
    let encoded = try JSONSerialization.data(withJSONObject: written.jsonObject(clearMissing: true))
    let decoded = try JSONDecoder().decode(CreditCard.self, from: encoded)
    XCTAssertEqual(decoded.rewardPeriod, card.rewardPeriod)
    XCTAssertEqual(decoded.promotionalPeriod, card.promotionalPeriod)
    XCTAssertEqual(decoded.subcategoriesEnabled, true)
  }

  func testUnknownFlagColourDecodesAsUnflagged() throws {
    let json = Data(#"{ "flagColor": "magenta" }"#.utf8)
    struct FlagColourBox: Decodable {
      let flagColor: RewardFlagColour
    }
    let box = try JSONDecoder().decode(FlagColourBox.self, from: json)
    XCTAssertEqual(box.flagColor, .unflagged)
  }

  func testUnknownRewardKindDecodesAsCashback() throws {
    let json = """
    {
      "id": "card-points",
      "name": "Legacy points",
      "issuer": "UOB",
      "type": "points",
      "ynabAccountId": "acct-credit",
      "featured": true
    }
    """
    let card = try JSONDecoder().decode(CreditCard.self, from: Data(json.utf8))
    XCTAssertEqual(card.type, .cashback)
    XCTAssertEqual(card.name, "Legacy points")
  }

  func testSparseSubcategoryDoesNotFailTheCard() throws {
    let json = """
    {
      "id": "card-travel",
      "name": "Travel Card",
      "issuer": "DBS",
      "type": "miles",
      "ynabAccountId": "acct-credit",
      "featured": true,
      "subcategories": [
        { "id": "subcat-dining", "name": "Dining", "flagColor": "red", "rewardValue": 4 },
        { "not": "a subcategory" }
      ]
    }
    """
    let card = try JSONDecoder().decode(CreditCard.self, from: Data(json.utf8))
    XCTAssertEqual(card.subcategories?.count, 1)
    XCTAssertEqual(card.subcategories?.first?.name, "Dining")
    XCTAssertEqual(card.subcategories?.first?.flagColor, .red)
    XCTAssertEqual(card.subcategories?.first?.rewardValue, 4)
    XCTAssertEqual(card.subcategories?.first?.priority, 0)
    XCTAssertEqual(card.subcategories?.first?.active, true)
  }

  func testAccountChoicesExcludeClosedOffBudgetAndDeletedButRetainCurrentLink() {
    let closed = Account(id: "closed", name: "Closed", icon: nil, type: "checking", onBudget: true, closed: true, balance: 0, clearedBalance: 0, unclearedBalance: 0, lastReconciledDate: nil, deleted: false)
    let offBudget = Account(id: "off", name: "Off budget", icon: nil, type: "checking", onBudget: false, closed: false, balance: 0, clearedBalance: 0, unclearedBalance: 0, lastReconciledDate: nil, deleted: false)
    let deleted = Account(id: "deleted", name: "Deleted", icon: nil, type: "checking", onBudget: true, closed: false, balance: 0, clearedBalance: 0, unclearedBalance: 0, lastReconciledDate: nil, deleted: true)
    let accounts = [closed, offBudget, deleted]
    XCTAssertTrue(RewardCardAccounts.choices(accounts: accounts, takenIDs: [], keepingID: nil).isEmpty)
    XCTAssertEqual(RewardCardAccounts.choices(accounts: accounts, takenIDs: ["closed"], keepingID: "closed").map(\.id), ["closed"])
    XCTAssertEqual(RewardCardAccounts.choices(accounts: accounts, takenIDs: ["off"], keepingID: "off").map(\.id), ["off"])
    XCTAssertTrue(RewardCardAccounts.choices(accounts: accounts, takenIDs: [], keepingID: "deleted").isEmpty)
  }

  func testCategoryAndOverrideRatesAreRequiredNumbers() throws {
    XCTAssertThrowsError(try JSONDecoder().decode(CardSubcategory.self, from: Data(#"{"id":"category","rewardValue":null}"#.utf8)))
    XCTAssertThrowsError(try JSONDecoder().decode(SpendingTierSubcategory.self, from: Data(#"{"subcategoryId":"category","rewardValue":null}"#.utf8)))
    var draft = RewardCardDraft.empty()
    draft.name = "Card"
    draft.ynabAccountId = "account"
    draft.addFlag(.fresh(name: "Dining", rewardValue: ""))
    XCTAssertThrowsError(try draft.write())
    draft.flags[0].rewardValue = "0"
    XCTAssertNoThrow(try draft.write())
    draft.addTier()
    draft.tiers[0].spendThreshold = "0"
    draft.tiers[0].overrides = [RewardTierOverrideDraft(subcategoryId: draft.flags[0].id)]
    XCTAssertThrowsError(try draft.write())
    draft.tiers[0].overrides[0].rewardValue = "0"
    XCTAssertNoThrow(try draft.write())
  }

  func testWriteEncodesAccountColourNames() throws {
    var draft = RewardCardDraft.empty()
    draft.name = "Travel Card"
    draft.issuer = "UOB"
    draft.type = .cashback
    draft.ynabAccountId = "acct-credit"
    draft.earningRate = "1"
    draft.flagNames = [.red: "Dining", .blue: " Online "]
    draft.addFlag(
      RewardFlagDraft.fresh(priority: "1", name: "Dining Out", flagColor: .red, rewardValue: "4")
    )

    let card = try draft.write()
    let payload = card.jsonObject(clearMissing: false)
    XCTAssertEqual(card.flagNames?["red"], "Dining")
    XCTAssertEqual(card.flagNames?["blue"], "Online")
    XCTAssertEqual(card.subcategories?.first?.name, "Dining")
    XCTAssertEqual((payload["flagNames"] as? [String: String])?["red"], "Dining")
    XCTAssertEqual((payload["flagNames"] as? [String: String])?["blue"], "Online")
  }

  // Failure modes the picker E2E run cannot cover across every card shape:
  // judging "earns nothing" by label text, ignoring the unflagged fallback,
  // ignoring tier overrides or the disabled-rules switch, and reordering
  // colours that keep their place.
  func testFlagMenuPutsEarningNamesFirstThenZeroRewardNamesThenColours() throws {
    func card(_ fields: String) throws -> CreditCard {
      let json = #"{"id":"card","name":"Card","issuer":"Bank","type":"cashback","ynabAccountId":"account","featured":false,"#
        + fields + "}"
      return try JSONDecoder().decode(CreditCard.self, from: Data(json.utf8))
    }
    func rule(_ id: String, _ colour: String, _ rate: Double, priority: Int = 1, extra: String = "") -> String {
      #"{"id":"\#(id)","name":"\#(id)","flagColor":"\#(colour)","rewardValue":\#(rate),"priority":\#(priority)\#(extra)}"#
    }
    func menu(_ card: CreditCard?) -> [[FlagColour]] {
      let menu = RewardCardDraft.flagMenu(for: card)
      return [menu.named, menu.colourOnly]
    }

    // Screenshot shape: an excluded rule whose name says nothing about rewards
    // still sinks, and a name with no rule follows the unflagged fallback.
    let mixed = try card(#""subcategoriesEnabled":true,"flagNames":{"green":"Groceries"},"subcategories":["#
      + [
        rule("Tap", "unflagged", 1),
        rule("Plain", "red", 3, extra: #","excludeFromRewards":true"#),
        rule("FCY", "orange", 2),
        rule("Online", "blue", 4),
      ].joined(separator: ",") + "]")
    XCTAssertEqual(menu(mixed), [[.none, .orange, .green, .blue, .red], [.yellow, .purple]])

    // A zero base rate that a spending tier raises still earns; an inactive
    // rule falls back to the unflagged rule, which earns nothing here.
    let tiered = try card(#""subcategoriesEnabled":true,"subcategories":["#
      + [
        rule("Base", "unflagged", 0),
        rule("Zero", "red", 0),
        rule("Tiered", "orange", 0),
        rule("Paused", "yellow", 5, extra: #","active":false"#),
        rule("Earns", "green", 1),
      ].joined(separator: ",")
      + #"],"spendingTiers":[{"id":"t","spendThreshold":500,"subcategories":[{"subcategoryId":"Tiered","rewardValue":2}]}]"#)
    XCTAssertEqual(menu(tiered), [[.orange, .green, .none, .red, .yellow], [.blue, .purple]])

    // Rules switched off: names follow the card rate, so exclusion no longer
    // applies and every name keeps its colour order.
    let disabled = try card(#""subcategoriesEnabled":false,"earningRate":0,"#
      + #""spendingTiers":[{"id":"t","spendThreshold":500,"earningRate":1}],"subcategories":["#
      + rule("Plain", "red", 3, extra: #","excludeFromRewards":true"#) + #"],"flagNames":{"purple":"Online"}"#)
    XCTAssertEqual(menu(disabled), [[.red, .purple], [.none, .orange, .yellow, .green, .blue]])

    // Two active rules on one colour: the engine uses the later priority.
    let duplicate = try card(#""subcategoriesEnabled":true,"subcategories":["#
      + rule("Later", "red", 2, priority: 2) + ","
      + rule("Earlier", "blue", 0, priority: 1) + ","
      + rule("Hidden", "red", 0, priority: 1, extra: #","excludeFromRewards":true"#) + "]")
    XCTAssertEqual(menu(duplicate), [[.red, .blue], [.none, .orange, .yellow, .green, .purple]])

    XCTAssertEqual(menu(nil), [[], FlagColour.allCases])
  }
}
