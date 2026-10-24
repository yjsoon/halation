import Foundation

struct PlanSettings: Codable, Equatable {
  let dateFormat: DateFormat?
  let currencyFormat: CurrencyFormat?
  let display: DisplaySettings?
}

struct DateFormat: Codable, Equatable {
  let format: String?
}

struct CurrencyFormat: Codable, Equatable {
  let isoCode: String?
  let exampleFormat: String?
  let decimalDigits: Int?
  let decimalSeparator: String?
  let groupSeparator: String?
  let symbolFirst: Bool?
  let currencySymbol: String?
  var displaySymbol: Bool? = nil
}

struct DisplaySettings: Codable, Equatable {
  let flagNames: [String]?

  private enum CodingKeys: String, CodingKey {
    case flagNames
  }

  init(flagNames: [String]? = nil) {
    self.flagNames = flagNames
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)

    if let array = try? container.decodeIfPresent([String?].self, forKey: .flagNames) {
      flagNames = array.compactMap { value in
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
          return nil
        }
        return trimmed
      }
      return
    }

    if let mapping = try? container.decodeIfPresent([String: String].self, forKey: .flagNames) {
      flagNames = mapping
        .sorted { $0.key < $1.key }
        .map(\.value)
      return
    }

    flagNames = nil
  }
}

struct Account: Codable, Identifiable, Hashable {
  let id: String
  let name: String
  let icon: String?
  let type: String
  let onBudget: Bool
  let closed: Bool
  let balance: Int
  let clearedBalance: Int
  let unclearedBalance: Int
  let lastReconciledDate: String?
  let deleted: Bool

  var displayIcon: String {
    AccountIcon.displayGlyph(stored: icon, accountType: type)
  }

  func with(_ identity: AccountIdentity) -> Account {
    let nextType: String
    let nextOnBudget: Bool
    if case .kind(let kind) = identity.classification {
      nextType = kind.rawValue
      nextOnBudget = kind.onBudget
    } else {
      nextType = type
      nextOnBudget = onBudget
    }
    return Account(
      id: id,
      name: identity.name,
      icon: identity.icon.rawValue,
      type: nextType,
      onBudget: nextOnBudget,
      closed: closed,
      balance: balance,
      clearedBalance: clearedBalance,
      unclearedBalance: unclearedBalance,
      lastReconciledDate: lastReconciledDate,
      deleted: deleted
    )
  }
}

struct CategoryGroup: Codable, Identifiable, Hashable {
  /// Matches the API's COALESCE id for transactions without a category, so it
  /// can be used as a pseudo-category in report filters (as on the web).
  static let uncategorisedCategoryID = "uncategorised"

  let id: String
  let name: String
  let hidden: Bool
  let deleted: Bool
  let categories: [Category]

  /// Bookkeeping groups the YNAB import carries as ordinary groups ("Hidden
  /// Categories", "Non-Personal (Don't Summarise)", inflows). Mirrors the web
  /// app's quiet-group regex in lib/categories.ts so pickers and reports
  /// demote the same groups everywhere.
  var isQuiet: Bool {
    hidden || CategoryGroup.isQuietName(name)
  }

  /// Compiled once: reports and pickers test every group on each render.
  private static let quietNamePattern = try! NSRegularExpression(
    pattern: "hidden|non.personal|don.t summari[sz]e|inflow|credit card payments|internal",
    options: [.caseInsensitive]
  )

  static func isQuietName(_ name: String?) -> Bool {
    guard let name else {
      return false
    }
    return quietNamePattern.firstMatch(in: name, range: NSRange(name.startIndex..., in: name)) != nil
  }
}

struct Category: Codable, Identifiable, Hashable {
  let id: String
  let categoryGroupID: String
  let name: String
  let deleted: Bool

  private enum CodingKeys: String, CodingKey {
    case id
    case categoryGroupID = "categoryGroupId"
    case name
    case deleted
  }
}

enum ClearedState: String, Codable, CaseIterable, Identifiable {
  case uncleared
  case cleared
  case reconciled

  var id: String { rawValue }

  var title: String {
    switch self {
    case .uncleared:
      return "Uncleared"
    case .cleared:
      return "Cleared"
    case .reconciled:
      return "Reconciled"
    }
  }
}

enum FlagColour: String, Codable, CaseIterable, Identifiable {
  case none = ""
  case red
  case orange
  case yellow
  case green
  case blue
  case purple

  var id: String { rawValue }

  var title: String {
    rawValue.isEmpty ? "None" : rawValue.capitalized
  }
}

struct Transaction: Codable, Identifiable, Hashable {
  let id: String
  let date: String
  let amount: Int
  let memo: String?
  let cleared: ClearedState
  let approved: Bool
  let flagColor: String?
  let flagName: String?
  let accountID: String
  let accountName: String
  let payeeID: String?
  let payeeName: String?
  let categoryID: String?
  let categoryName: String?
  let transferAccountID: String?
  let transferTransactionID: String?
  let parentTransactionID: String?
  let matchedTransactionID: String?
  let importID: String?
  let importPayeeName: String?
  let importPayeeNameOriginal: String?
  let deleted: Bool
  let subtransactions: [Subtransaction]
  /// The amount is an estimate to check against the statement ("To
  /// confirm"). Optional so rows cached before the field existed still
  /// decode; read it through `isToConfirm`.
  var needsConfirmation: Bool? = nil
  /// "To claim": `to_claim` until the claims tool bills it, then `claimed`
  /// with the day in `claimedOn`. Nil for an ordinary row, and for rows
  /// cached before the field existed; read it through `claim`.
  var claimStatus: String? = nil
  var claimedOn: String? = nil

  private enum CodingKeys: String, CodingKey {
    case id
    case date
    case amount
    case memo
    case cleared
    case approved
    case flagColor
    case flagName
    case accountID = "accountId"
    case accountName
    case payeeID = "payeeId"
    case payeeName
    case categoryID = "categoryId"
    case categoryName
    case transferAccountID = "transferAccountId"
    case transferTransactionID = "transferTransactionId"
    case parentTransactionID = "parentTransactionId"
    case matchedTransactionID = "matchedTransactionId"
    case importID = "importId"
    case importPayeeName = "importPayeeName"
    case importPayeeNameOriginal = "importPayeeNameOriginal"
    case deleted
    case subtransactions
    case needsConfirmation
    case claimStatus
    case claimedOn
  }
}

extension Transaction {
  /// True when the amount is marked as an estimate to confirm.
  var isToConfirm: Bool {
    needsConfirmation == true
  }

  /// True when the row is stored as a spend to claim back.
  var isToClaim: Bool {
    claimStatus == MemoClaim.toClaim.rawValue
  }

  /// The claim the row shows: the stored field, or for a row stored before
  /// it, a claim word at the start of its memo.
  var claim: MemoClaim? {
    MemoClaim(status: claimStatus, memo: memo)
  }

  /// True when the row still needs a category: no category, not a transfer,
  /// and not a split (whose categories live on the subtransactions).
  var isUncategorised: Bool {
    categoryID == nil && transferAccountID == nil && subtransactions.isEmpty
  }

  var isSplit: Bool {
    !subtransactions.isEmpty
  }

  var linkedTransferIDs: [String] {
    ([transferTransactionID] + subtransactions.map(\.transferTransactionID)).compactMap { $0 }
  }

  func deleteConfirmationDetail(linkedReconciled: Bool) -> String? {
    let reconciledRisk = cleared == .reconciled || linkedReconciled
    if parentTransactionID != nil {
      if reconciledRisk {
        return "The split line on the other account stays and loses this transfer link. This side has been reconciled, so deleting it can make your next reconciliation inaccurate."
      }
      return "The split line on the other account stays and loses this transfer link."
    }
    let isTransfer = transferTransactionID != nil
      || subtransactions.contains { $0.transferTransactionID != nil }
    switch (isTransfer, reconciledRisk) {
    case (true, true):
      return "This also deletes any linked transfer entries. Deleting a reconciled transfer can make your next reconciliation inaccurate."
    case (true, false):
      return "This also deletes any linked transfer entries."
    case (false, true):
      return "This transaction has been reconciled. Deleting it can make your next reconciliation inaccurate."
    case (false, false):
      return nil
    }
  }

  /// Clearing an uncleared row also confirms its amount, as the server does.
  func withCleared(_ cleared: ClearedState) -> Transaction {
    Transaction(
      id: id,
      date: date,
      amount: amount,
      memo: memo,
      cleared: cleared,
      approved: approved,
      flagColor: flagColor,
      flagName: flagName,
      accountID: accountID,
      accountName: accountName,
      payeeID: payeeID,
      payeeName: payeeName,
      categoryID: categoryID,
      categoryName: categoryName,
      transferAccountID: transferAccountID,
      transferTransactionID: transferTransactionID,
      parentTransactionID: parentTransactionID,
      matchedTransactionID: matchedTransactionID,
      importID: importID,
      importPayeeName: importPayeeName,
      importPayeeNameOriginal: importPayeeNameOriginal,
      deleted: deleted,
      subtransactions: subtransactions,
      needsConfirmation: self.cleared == .uncleared && cleared != .uncleared ? false : needsConfirmation,
      claimStatus: claimStatus,
      claimedOn: claimedOn
    )
  }

  func withApproved(_ approved: Bool) -> Transaction {
    Transaction(
      id: id,
      date: date,
      amount: amount,
      memo: memo,
      cleared: cleared,
      approved: approved,
      flagColor: flagColor,
      flagName: flagName,
      accountID: accountID,
      accountName: accountName,
      payeeID: payeeID,
      payeeName: payeeName,
      categoryID: categoryID,
      categoryName: categoryName,
      transferAccountID: transferAccountID,
      transferTransactionID: transferTransactionID,
      parentTransactionID: parentTransactionID,
      matchedTransactionID: matchedTransactionID,
      importID: importID,
      importPayeeName: importPayeeName,
      importPayeeNameOriginal: importPayeeNameOriginal,
      deleted: deleted,
      subtransactions: subtransactions,
      needsConfirmation: needsConfirmation,
      claimStatus: claimStatus,
      claimedOn: claimedOn
    )
  }

  /// Single-transaction writes can omit `parentTransactionID`. Keep the list value.
  func preservingParent(from existing: Transaction) -> Transaction {
    guard parentTransactionID == nil, let parentTransactionID = existing.parentTransactionID else {
      return self
    }
    return Transaction(
      id: id,
      date: date,
      amount: amount,
      memo: memo,
      cleared: cleared,
      approved: approved,
      flagColor: flagColor,
      flagName: flagName,
      accountID: accountID,
      accountName: accountName,
      payeeID: payeeID,
      payeeName: payeeName,
      categoryID: categoryID,
      categoryName: categoryName,
      transferAccountID: transferAccountID,
      transferTransactionID: transferTransactionID,
      parentTransactionID: parentTransactionID,
      matchedTransactionID: matchedTransactionID,
      importID: importID,
      importPayeeName: importPayeeName,
      importPayeeNameOriginal: importPayeeNameOriginal,
      deleted: deleted,
      subtransactions: subtransactions,
      needsConfirmation: needsConfirmation,
      claimStatus: claimStatus,
      claimedOn: claimedOn
    )
  }

  /// Returns a copy carrying `subtransactions`. Split-line writes replace the
  /// whole set, so every other field is kept as-is.
  func replacingSubtransactions(_ subtransactions: [Subtransaction]) -> Transaction {
    Transaction(
      id: id,
      date: date,
      amount: amount,
      memo: memo,
      cleared: cleared,
      approved: approved,
      flagColor: flagColor,
      flagName: flagName,
      accountID: accountID,
      accountName: accountName,
      payeeID: payeeID,
      payeeName: payeeName,
      categoryID: categoryID,
      categoryName: categoryName,
      transferAccountID: transferAccountID,
      transferTransactionID: transferTransactionID,
      parentTransactionID: parentTransactionID,
      matchedTransactionID: matchedTransactionID,
      importID: importID,
      importPayeeName: importPayeeName,
      importPayeeNameOriginal: importPayeeNameOriginal,
      deleted: deleted,
      subtransactions: subtransactions,
      needsConfirmation: needsConfirmation,
      claimStatus: claimStatus,
      claimedOn: claimedOn
    )
  }

  /// The server leaves a split parent in place when one of its mirrored lines is
  /// deleted and clears only that line's transfer link, so the parent must not
  /// be removed here either. Returns the repaired row, or `nil` when no line
  /// linked to the mirror. Web parity: `unlinkSplitMirrorParent`.
  func unlinkingSplitMirror(_ mirror: SplitMirrorLink) -> Transaction? {
    var changed = false
    let lines = subtransactions.map { line -> Subtransaction in
      guard line.linksSplitMirror(mirror),
            line.transferAccountID != nil || line.transferTransactionID != nil else {
        return line
      }
      changed = true
      return line.clearingTransferLink()
    }
    return changed ? replacingSubtransactions(lines) : nil
  }
}

/// "To claim" is the stored `claimStatus` the claims tool (yjsoon/this-claimer)
/// reads. Older clients wrote memo words instead: `TODO:` for a claim,
/// `CLAIMED - YYYY-MM-DD:` once claimed and `TOCHECK` for an estimate. The API
/// turns those into fields on every write; a row stored before that still
/// shows its claim from the memo, and editing it moves the words into the
/// fields. Web parity: `lib/follow-up.ts`; API: `transaction-claim.ts`.
enum MemoClaim: String, Equatable {
  case toClaim = "to_claim"
  case claimed

  /// The memo words at the start of a memo, read as the API reads them.
  struct LegacyWords: Equatable {
    var claim: MemoClaim?
    var claimedOn: String?
    var toCheck = false
    /// The memo without the words, or the memo as it was when it had none.
    var text: String
  }

  // A word counts when it is in capitals or is followed by a colon in any
  // case, so prose such as "Todo list app" stays text. Simple, ASCII-only word
  // boundaries and digits match JavaScript's `\b` and `\d`.
  private static var todoWord: Regex<(Substring, Substring, Substring)> {
    #/^\s*(TODO)(?=[:\s]|$)(:?)\s*/#.ignoresCase()
  }
  private static var claimedWord: Regex<(Substring, Substring, Substring?, Substring)> {
    #/^\s*(CLAIMED)\b(?:\s*-\s*(\d{4}-\d{2}-\d{2}))?\s*(:|$)\s*/#
      .ignoresCase().wordBoundaryKind(.simple).asciiOnlyWordCharacters().asciiOnlyDigits()
  }
  private static var toCheckWord: Regex<(Substring, Substring, Substring)> {
    #/^\s*(TOCHECK)\b(:?)\s*/#
      .ignoresCase().wordBoundaryKind(.simple).asciiOnlyWordCharacters()
  }

  private static func counts(_ word: Substring, colon: Substring) -> Bool {
    word == word.uppercased() || colon == ":"
  }

  /// Reads the words leading `memo`. `withToCheck: false` stops at TOCHECK,
  /// which the register leaves in view as it has no mark that could clear it.
  static func legacyWords(_ memo: String?, withToCheck: Bool = true) -> LegacyWords {
    // A String each round, so `^` anchors at the start of what is left.
    var text = memo ?? ""
    var words = LegacyWords(text: memo ?? "")
    var found = false
    while true {
      if let match = text.firstMatch(of: todoWord), counts(match.1, colon: match.2) {
        if words.claim == nil { words.claim = .toClaim }
        text = String(text[match.0.endIndex...])
        found = true
        continue
      }
      if let match = text.firstMatch(of: claimedWord), counts(match.1, colon: match.3) {
        if words.claim == nil {
          words.claim = .claimed
          words.claimedOn = match.2.map(String.init)
        }
        text = String(text[match.0.endIndex...])
        found = true
        continue
      }
      if withToCheck, let match = text.firstMatch(of: toCheckWord), counts(match.1, colon: match.2) {
        words.toCheck = true
        text = String(text[match.0.endIndex...])
        found = true
        continue
      }
      break
    }
    if found {
      words.text = text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    return words
  }

  /// The stored claim wins; a row with none falls back to a memo word.
  init?(status: String?, memo: String?) {
    if let status, let stored = MemoClaim(rawValue: status) {
      self = stored
    } else if let legacy = Self.legacyWords(memo, withToCheck: false).claim {
      self = legacy
    } else {
      return nil
    }
  }

  /// The memo without its claim words, for a row that shows the claim as a tag.
  static func displayText(_ memo: String) -> String {
    legacyWords(memo, withToCheck: false).text
  }

  var title: String {
    switch self {
    case .toClaim: "To claim"
    case .claimed: "Claimed"
    }
  }
}

/// The link a deleted split mirror leaves behind: the row the server tombstoned,
/// the split parent it belonged to when the server named one, and the split line
/// that linked to it.
struct SplitMirrorLink: Equatable {
  let id: String
  let parentTransactionID: String?
  let transferTransactionID: String?
}

/// Applies a deleted mirror's link clearing across a set of rows. The mirror may
/// name its parent directly, or only be reachable from the line that linked to
/// it -- an older response that omits `parent_transaction_id` still gets
/// repaired. Web parity: `unlinkSplitMirrorParent` in `apps/web/src/lib/register-rows.ts`.
enum SplitMirrorUnlink {
  static func applying(_ mirror: SplitMirrorLink, to rows: [Transaction]) -> [Transaction] {
    guard let index = parentIndex(for: mirror, in: rows),
          let repaired = rows[index].unlinkingSplitMirror(mirror) else {
      return rows
    }
    var next = rows
    next[index] = repaired
    return next
  }

  private static func parentIndex(for mirror: SplitMirrorLink, in rows: [Transaction]) -> Int? {
    if let parentID = mirror.parentTransactionID,
       let index = rows.firstIndex(where: { $0.id == parentID }) {
      return index
    }
    return rows.firstIndex { row in
      row.subtransactions.contains { $0.linksSplitMirror(mirror) }
    }
  }
}

/// What a delete takes off each account's balances, so the accounts on screen
/// (and the snapshot written from them) match the server before the follow-up
/// read lands -- or when it never does.
enum DeleteBalanceDelta {
  struct Delta: Equatable {
    var balance = 0
    var cleared = 0
    var uncleared = 0
  }

  /// One entry per account a removed row sat in. `removedIDs` are every row
  /// the server tombstoned; `knownRows` are rows in hand before the delete,
  /// by id. A removed row not in hand (the far side of a transfer on an
  /// unloaded page) is derived from the link that names it, and counts as
  /// uncleared: its own cleared state is unknown, and the next accounts read
  /// settles the split between cleared and uncleared either way.
  static func deltas(
    deleted: Transaction,
    removedIDs: Set<String>,
    knownRows: [String: Transaction]
  ) -> [String: Delta] {
    var result: [String: Delta] = [:]
    func take(_ amount: Int, from accountID: String, cleared: ClearedState) {
      var delta = result[accountID, default: Delta()]
      delta.balance -= amount
      if cleared == .uncleared {
        delta.uncleared -= amount
      } else {
        delta.cleared -= amount
      }
      result[accountID] = delta
    }
    for id in removedIDs.sorted() {
      if let row = knownRows[id] ?? (id == deleted.id ? deleted : nil) {
        guard !row.deleted else { continue }
        take(row.amount, from: row.accountID, cleared: row.cleared)
      } else if deleted.transferTransactionID == id, let accountID = deleted.transferAccountID {
        take(-deleted.amount, from: accountID, cleared: .uncleared)
      } else if let line = deleted.subtransactions.first(where: { $0.transferTransactionID == id }),
                let accountID = line.transferAccountID {
        take(-line.amount, from: accountID, cleared: .uncleared)
      }
    }
    return result.filter { $0.value != Delta() }
  }

  static func applying(_ deltas: [String: Delta], to accounts: [Account]) -> [Account] {
    accounts.map { account in
      guard let delta = deltas[account.id] else { return account }
      return Account(
        id: account.id,
        name: account.name,
        icon: account.icon,
        type: account.type,
        onBudget: account.onBudget,
        closed: account.closed,
        balance: account.balance + delta.balance,
        clearedBalance: account.clearedBalance + delta.cleared,
        unclearedBalance: account.unclearedBalance + delta.uncleared,
        lastReconciledDate: account.lastReconciledDate,
        deleted: account.deleted
      )
    }
  }
}

extension Subtransaction {
  /// True when this line is the one a deleted mirror left behind. A line that
  /// still names the deleted mirror is one; the mirror's own row names its line
  /// back, but only a line that names no mirror of its own can be that line --
  /// a line that now names a different mirror has been relinked and must be
  /// left alone.
  func linksSplitMirror(_ mirror: SplitMirrorLink) -> Bool {
    if transferTransactionID == mirror.id {
      return true
    }
    guard transferTransactionID == nil, let mirrorTransferID = mirror.transferTransactionID else {
      return false
    }
    return id == mirrorTransferID
  }

  /// The line survives a mirror delete; it just forgets the transfer.
  func clearingTransferLink() -> Subtransaction {
    Subtransaction(
      id: id,
      transactionID: transactionID,
      amount: amount,
      memo: memo,
      payeeID: payeeID,
      payeeName: payeeName,
      categoryID: categoryID,
      categoryName: categoryName,
      transferAccountID: nil,
      transferTransactionID: nil,
      deleted: deleted
    )
  }
}

struct Subtransaction: Codable, Hashable {
  let id: String
  let transactionID: String
  let amount: Int
  let memo: String?
  let payeeID: String?
  let payeeName: String?
  let categoryID: String?
  let categoryName: String?
  let transferAccountID: String?
  let transferTransactionID: String?
  let deleted: Bool

  private enum CodingKeys: String, CodingKey {
    case id
    case transactionID = "transactionId"
    case amount
    case memo
    case payeeID = "payeeId"
    case payeeName
    case categoryID = "categoryId"
    case categoryName
    case transferAccountID = "transferAccountId"
    case transferTransactionID = "transferTransactionId"
    case deleted
  }
}

struct ScheduledTransaction: Codable, Identifiable, Hashable {
  let id: String
  let dateFirst: String
  let dateNext: String
  let frequency: String
  let amount: Int
  let memo: String?
  let flagColor: String?
  let accountID: String
  let payeeID: String?
  let categoryID: String?
  let transferAccountID: String?
  let deleted: Bool
  let subtransactions: [ScheduledSubtransaction]

  private enum CodingKeys: String, CodingKey {
    case id
    case dateFirst = "dateFirst"
    case dateNext = "dateNext"
    case frequency
    case amount
    case memo
    case flagColor = "flagColor"
    case accountID = "accountId"
    case payeeID = "payeeId"
    case categoryID = "categoryId"
    case transferAccountID = "transferAccountId"
    case deleted
    case subtransactions
  }

  var isSplit: Bool {
    !activeSubtransactions.isEmpty
  }

  var activeSubtransactions: [ScheduledSubtransaction] {
    subtransactions.filter { !$0.deleted }
  }

  var recurrenceLabel: String {
    switch frequency {
    case "never": return "Does not repeat"
    case "daily": return "Repeats daily"
    case "weekly": return "Repeats weekly"
    case "everyOtherWeek": return "Repeats every other week"
    case "twiceAMonth": return "Repeats twice a month"
    case "every4Weeks": return "Repeats every 4 weeks"
    case "monthly": return "Repeats monthly"
    case "everyOtherMonth": return "Repeats every other month"
    case "every3Months": return "Repeats every 3 months"
    case "every4Months": return "Repeats every 4 months"
    case "twiceAYear": return "Repeats twice a year"
    case "yearly": return "Repeats yearly"
    case "everyOtherYear": return "Repeats every other year"
    default:
      let words = frequency
        .replacingOccurrences(of: "([a-z0-9])([A-Z])", with: "$1 $2", options: .regularExpression)
        .lowercased()
      return "Repeats \(words)"
    }
  }
}

struct ScheduledSubtransaction: Codable, Hashable {
  let id: String
  let scheduledTransactionID: String
  let amount: Int
  let memo: String?
  let payeeID: String?
  let categoryID: String?
  let transferAccountID: String?
  let deleted: Bool

  private enum CodingKeys: String, CodingKey {
    case id
    case scheduledTransactionID = "scheduledTransactionId"
    case amount
    case memo
    case payeeID = "payeeId"
    case categoryID = "categoryId"
    case transferAccountID = "transferAccountId"
    case deleted
  }
}

/// Response from entering one selected scheduled occurrence. The server
/// advances (or completes) the parent schedule atomically with the ledger
/// transaction, then the app refreshes every affected surface.
struct ScheduledOccurrencePayload: Decodable {
  let transaction: Transaction
  let scheduledTransaction: ScheduledTransaction
  let occurrenceDate: String
  let enteredDate: String
  let completed: Bool
  let replayed: Bool
}

struct ScheduledOccurrenceRequest: Encodable {
  let occurrenceDate: String
  let date: String
}

struct AccountReconciliationPayload: Decodable {
  let account: Account
  let reconciledTransactionIDs: [String]
  let reconciledTransactionCount: Int
  let statementDate: String
  let statementBalance: Int
  let priorReconciledBalance: Int
  let finalReconciledBalance: Int
  let replayed: Bool
}

/// A read-only reconciliation projection. It is deliberately separate from
/// the mutation response: the review screen must show the server's current
/// candidate set before it is safe to confirm.
struct AccountReconciliationPreview: Decodable {
  let account: Account
  let statementDate: String
  let currentReconciledBalance: Int
  let projectedReconciledBalance: Int
  let candidateTransactionIDs: [String]
  let candidateTransactionCount: Int
}

struct AccountReconciliationRequest: Encodable {
  let statementDate: String
  let statementBalance: Int
}

struct ReconciliationMismatchDetail: Equatable {
  let currentReconciledBalance: Int
  let projectedReconciledBalance: Int
  let statementBalance: Int
  let difference: Int
  let message: String
}
