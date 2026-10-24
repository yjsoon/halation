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
  }
}

extension Transaction {
  /// True when the amount is marked as an estimate to confirm.
  var isToConfirm: Bool {
    needsConfirmation == true
  }

  /// Whether the register can confirm this row in one step. The outbox sends
  /// a full-body edit, which the API refuses on the linked side of a split
  /// line; that side is confirmed by clearing it.
  var canConfirmInPlace: Bool {
    isToConfirm && parentTransactionID == nil
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
      needsConfirmation: self.cleared == .uncleared && cleared != .uncleared ? false : needsConfirmation
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
      needsConfirmation: needsConfirmation
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
      needsConfirmation: needsConfirmation
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
      needsConfirmation: needsConfirmation
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

/// "To claim" is a memo convention rather than a stored field: `TODO` in the
/// memo marks a receipt to claim, and the separate claims tool rewrites it to
/// `CLAIMED`. The chip only adds or removes that word, so the claims tool
/// keeps reading what it reads today. Web parity: `lib/follow-up.ts`.
enum MemoClaim: Equatable {
  case toClaim
  case claimed

  init?(memo: String?) {
    guard let memo, !memo.isEmpty else {
      return nil
    }
    if memo.contains(#/\bTODO\b/#) {
      self = .toClaim
    } else if memo.contains(#/\bCLAIMED\b/#) {
      self = .claimed
    } else {
      return nil
    }
  }

  /// The memo with the claim word added (at the front) or removed.
  static func memo(_ memo: String, toClaim on: Bool) -> String {
    let has = memo.contains(#/\bTODO\b/#)
    if on {
      if has {
        return memo
      }
      // A claimed row claimed again goes back to TODO rather than both.
      if memo.contains(#/\bCLAIMED\b/#) {
        return memo.replacing(#/\bCLAIMED\b/#, with: "TODO", maxReplacements: 1)
      }
      return "TODO \(memo.trimmingCharacters(in: .whitespacesAndNewlines))"
        .trimmingCharacters(in: .whitespacesAndNewlines)
    }
    return has ? tidy(memo.replacing(#/\bTODO\b:?/#, with: " ")) : memo
  }

  /// The memo without its claim word, for a row that shows the claim as a tag.
  static func displayText(_ memo: String) -> String {
    switch MemoClaim(memo: memo) {
    case .toClaim?:
      return tidy(memo.replacing(#/\bTODO\b:?/#, with: " ", maxReplacements: 1))
    case .claimed?:
      return tidy(memo.replacing(#/\bCLAIMED\b:?/#, with: " ", maxReplacements: 1))
    case nil:
      return memo
    }
  }

  var title: String {
    switch self {
    case .toClaim: "To claim"
    case .claimed: "Claimed"
    }
  }

  private static func tidy(_ text: String) -> String {
    text.replacing(#/\s{2,}/#, with: " ")
      .replacing(#/^[\s:\-–]+/#, with: "")
      .trimmingCharacters(in: .whitespacesAndNewlines)
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
