import Foundation

struct TransactionWriteEnvelope: Encodable {
  let transaction: TransactionWriteRequest
}

struct TransactionCollectionApprovalEnvelope: Encodable {
  let transactions: [Item]

  struct Item: Encodable {
    let id: String
    let approved: Bool
  }
}

/// The marker-only PATCH body the outbox sends for a confirm.
struct ConfirmEnvelope: Encodable {
  let transaction: Body

  struct Body: Encodable {
    let needsConfirmation: Bool
  }
}

struct TransactionCollectionPayload: Decodable {
  let transactionIds: [String]?
  let transactions: [Transaction]
  let serverKnowledge: Int?
}

struct TransactionSubtransactionWriteRequest: Codable, Equatable {
  let id: String?
  let amount: Int
  let payeeID: String?
  let payeeName: String?
  let categoryID: String?
  let memo: String?
  let transferAccountID: String?
  /// Existing split-transfer mirrors must survive a parent edit. The API
  /// accepts this optional link and uses it instead of minting a new mirror.
  let transferTransactionID: String?
}

/// "To claim" in a write. `notClaimed` is sent as `null`, which clears the
/// claim; a request with no value leaves the server's claim alone.
enum ClaimWrite: String, Codable, Equatable {
  case toClaim = "to_claim"
  case claimed
  case notClaimed = "none"

  /// The stored `claimStatus` this write leaves on the row.
  var storedStatus: String? {
    self == .notClaimed ? nil : rawValue
  }
}

/// Create/update body. Encodes optional fields as explicit nulls so an update
/// can clear them — the API treats omitted keys as "keep existing".
/// Cleared status is the exception: edits omit it so the guarded status
/// endpoint remains its sole owner.
/// Decodable too, so offline captures can be persisted and replayed.
struct TransactionWriteRequest: Codable, Equatable {
  let accountID: String
  let date: String
  let amount: Int
  let payeeID: String?
  let payeeName: String?
  let categoryID: String?
  let memo: String?
  /// Nil only for edits, where status is owned by the register's guarded
  /// compare-and-set control rather than a potentially stale full form.
  let cleared: ClearedState?
  let approved: Bool
  let flagColor: String?
  let subtransactions: [TransactionSubtransactionWriteRequest]
  /// Client-minted create identity. The server returns the existing row when
  /// this value is replayed, so a lost response cannot double-post money.
  var importID: String?
  /// "To confirm": nil leaves the server's value alone. Edits send it only
  /// when the form changed it, or alongside a cleared change, where the
  /// server would otherwise read clearing as confirming.
  var needsConfirmation: Bool?
  /// "To claim": nil leaves the server's value alone. `claimedOn` goes only
  /// with `.claimed`.
  var claimStatus: ClaimWrite?
  var claimedOn: String?
  /// Client-minted transaction id (`txn_<uuid>`), sent only on a create. The
  /// outbox keeps it on the command and stamps it here at send time, so a
  /// queued create has its real id before the server has seen it.
  var id: String?

  private enum CodingKeys: String, CodingKey {
    case accountID
    case date
    case amount
    case payeeID
    case payeeName
    case categoryID
    case memo
    case cleared
    case approved
    case flagColor
    case subtransactions
    case importID
    case id
    case needsConfirmation
    case claimStatus
    case claimedOn
  }

  init(
    accountID: String,
    date: String,
    amount: Int,
    payeeID: String?,
    payeeName: String?,
    categoryID: String?,
    memo: String?,
    cleared: ClearedState?,
    approved: Bool,
    flagColor: String?,
    subtransactions: [TransactionSubtransactionWriteRequest],
    importID: String? = nil,
    id: String? = nil,
    needsConfirmation: Bool? = nil,
    claimStatus: ClaimWrite? = nil,
    claimedOn: String? = nil
  ) {
    self.accountID = accountID
    self.date = date
    self.amount = amount
    self.payeeID = payeeID
    self.payeeName = payeeName
    self.categoryID = categoryID
    self.memo = memo
    self.cleared = cleared
    self.approved = approved
    self.flagColor = flagColor
    self.subtransactions = subtransactions
    self.importID = importID
    self.id = id
    self.needsConfirmation = needsConfirmation
    self.claimStatus = claimStatus
    self.claimedOn = claimStatus == .claimed ? claimedOn : nil
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(accountID, forKey: .accountID)
    try container.encode(date, forKey: .date)
    try container.encode(amount, forKey: .amount)
    try container.encode(payeeID, forKey: .payeeID)
    try container.encode(payeeName, forKey: .payeeName)
    try container.encode(categoryID, forKey: .categoryID)
    try container.encode(memo, forKey: .memo)
    try container.encodeIfPresent(cleared, forKey: .cleared)
    try container.encode(approved, forKey: .approved)
    try container.encode(flagColor, forKey: .flagColor)
    try container.encode(subtransactions, forKey: .subtransactions)
    try container.encodeIfPresent(importID, forKey: .importID)
    try container.encodeIfPresent(id, forKey: .id)
    try container.encodeIfPresent(needsConfirmation, forKey: .needsConfirmation)
    if let claimStatus {
      if let stored = claimStatus.storedStatus {
        try container.encode(stored, forKey: .claimStatus)
      } else {
        try container.encodeNil(forKey: .claimStatus)
      }
    }
    try container.encodeIfPresent(claimedOn, forKey: .claimedOn)
  }

  /// Captures made before split support did not persist this key. Keep those
  /// offline entries replayable instead of dropping the whole outbox on
  /// upgrade.
  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    accountID = try container.decode(String.self, forKey: .accountID)
    date = try container.decode(String.self, forKey: .date)
    amount = try container.decode(Int.self, forKey: .amount)
    payeeID = try container.decodeIfPresent(String.self, forKey: .payeeID)
    payeeName = try container.decodeIfPresent(String.self, forKey: .payeeName)
    categoryID = try container.decodeIfPresent(String.self, forKey: .categoryID)
    memo = try container.decodeIfPresent(String.self, forKey: .memo)
    cleared = try container.decodeIfPresent(ClearedState.self, forKey: .cleared)
    approved = try container.decode(Bool.self, forKey: .approved)
    flagColor = try container.decodeIfPresent(String.self, forKey: .flagColor)
    subtransactions = try container.decodeIfPresent([TransactionSubtransactionWriteRequest].self, forKey: .subtransactions) ?? []
    importID = try container.decodeIfPresent(String.self, forKey: .importID)
    id = try container.decodeIfPresent(String.self, forKey: .id)
    needsConfirmation = try container.decodeIfPresent(Bool.self, forKey: .needsConfirmation)
    // A queued "not a claim" is persisted as an explicit null.
    if let stored = try container.decodeIfPresent(String.self, forKey: .claimStatus) {
      claimStatus = ClaimWrite(rawValue: stored)
    } else if container.contains(.claimStatus) {
      claimStatus = .notClaimed
    } else {
      claimStatus = nil
    }
    claimedOn = try container.decodeIfPresent(String.self, forKey: .claimedOn)
  }
}

/// The create-only queue item from before the outbox moved to a file. Kept
/// only so `OutboxStore` can read and migrate what is still in UserDefaults.
struct PendingTransaction: Codable, Equatable, Identifiable {
  let id: UUID
  let request: TransactionWriteRequest
  let connectionFingerprint: String
  let capturedAt: Date
  /// Last non-transport failure from a sync attempt, e.g. a server rejection.
  var lastSyncError: String?

  init(request: TransactionWriteRequest, connectionFingerprint: String, capturedAt: Date = .now) {
    id = UUID()
    var request = request
    if request.importID == nil {
      request.importID = id.uuidString.lowercased()
    }
    self.request = request
    self.connectionFingerprint = connectionFingerprint
    self.capturedAt = capturedAt
  }
}

struct SaveMessage: Equatable, Identifiable {
  enum Kind: Equatable {
    case success
    case failure
  }

  let id: Int
  let text: String
  let kind: Kind
}

enum CommitRejection: LocalizedError, Equatable {
  case incomplete
  case invalidSplit(String)
  case persistFailed

  /// `decimalDigits` is the plan currency's, when the caller knows it.
  static func check(_ draft: TransactionDraft, decimalDigits: Int? = nil) throws {
    if let message = draft.splitValidationMessage(decimalDigits: decimalDigits) {
      throw CommitRejection.invalidSplit(message)
    }
    guard draft.canSave else {
      throw CommitRejection.incomplete
    }
  }

  var errorDescription: String? {
    switch self {
    case .incomplete:
      return "Enter an amount and pick an account."
    case .invalidSplit(let message):
      return message
    case .persistFailed:
      return "Couldn’t save this transaction locally. Try again."
    }
  }
}

struct PendingRow: Identifiable, Equatable {
  enum Status: Equatable {
    case sending
    case waitingForConnection
    case rejected(String)
  }

  /// The outbox command's id.
  typealias ID = UUID

  let id: ID
  /// The client-minted id the row will have on the server.
  let transactionID: String
  let accountID: String
  let accountName: String
  let isoDate: String
  let signedAmount: Int
  let payeeName: String?
  let categoryID: String?
  let categoryName: String?
  let memo: String?
  let flag: FlagColour
  let splitLineCount: Int
  let splitCategoryIDs: [String]
  let isCleared: Bool
  let isToConfirm: Bool
  let claimStatus: String?
  let status: Status

  init(
    id: ID,
    transactionID: String,
    request: TransactionWriteRequest,
    status: Status,
    accountName: String,
    categoryName: String?,
    payeeName: String?
  ) {
    self.id = id
    self.transactionID = transactionID
    accountID = request.accountID
    self.accountName = accountName
    isoDate = request.date
    signedAmount = request.amount
    self.payeeName = payeeName ?? request.payeeName
    categoryID = request.categoryID
    self.categoryName = categoryName
    memo = request.memo
    flag = FlagColour(rawValue: request.flagColor ?? "") ?? .none
    splitLineCount = request.subtransactions.count
    splitCategoryIDs = request.subtransactions.compactMap(\.categoryID)
    isCleared = request.cleared != nil && request.cleared != .uncleared
    isToConfirm = request.needsConfirmation == true
    claimStatus = request.claimStatus?.storedStatus
    self.status = status
  }

  func matches(categoryID: String) -> Bool {
    self.categoryID == categoryID || splitCategoryIDs.contains(categoryID)
  }
}

/// One unsent change as the outbox card lists it.
struct OutboxItem: Identifiable, Equatable {
  let id: UUID
  let transactionID: String
  /// "New", "Edit", "Cleared", "Approve" or "Delete".
  let action: String
  let payeeName: String?
  let isoDate: String?
  let signedAmount: Int?
  let status: PendingRow.Status
}

enum OutboxDrainTrigger: Equatable {
  case commit
  case refresh
  case manual
}


enum EntryDirection: String, Codable, CaseIterable, Identifiable {
  case outflow
  case inflow

  var id: String { rawValue }

  var title: String {
    switch self {
    case .outflow:
      return "− Outflow"
    case .inflow:
      return "+ Inflow"
    }
  }
}

/// Editable state behind both the Add Transaction sheet and the edit form.
struct TransactionSubtransactionDraft: Equatable, Codable {
  /// Existing IDs are preserved on edit. Fresh and duplicated lines omit IDs
  /// so the server creates a distinct graph rather than mutating the source.
  var id: String?
  var amountText: String
  var payeeID: String?
  var payeeName: String
  var categoryID: String?
  var transferAccountID: String?
  var transferTransactionID: String?
  /// The account paired with `transferTransactionID` when this line was
  /// loaded. Changing the target must mint a new mirror, not reuse the old
  /// mirror ID against a different account.
  private var mirroredTransferAccountID: String?
  var memo: String
  /// The stored amount of a loaded line, kept while its text is untouched.
  private var loadedAmount: Int?

  init(
    id: String? = nil,
    amountText: String = "0",
    payeeID: String? = nil,
    payeeName: String = "",
    categoryID: String? = nil,
    transferAccountID: String? = nil,
    transferTransactionID: String? = nil,
    mirroredTransferAccountID: String? = nil,
    memo: String = ""
  ) {
    self.id = id
    self.amountText = amountText
    self.payeeID = payeeID
    self.payeeName = payeeName
    self.categoryID = categoryID
    self.transferAccountID = transferAccountID
    self.transferTransactionID = transferTransactionID
    self.mirroredTransferAccountID = mirroredTransferAccountID ?? transferAccountID
    self.memo = memo
  }

  init(subtransaction: Subtransaction, preserveID: Bool = true) {
    id = preserveID ? subtransaction.id : nil
    loadedAmount = subtransaction.amount
    amountText = MoneyCodec.editableString(for: subtransaction.amount)
    payeeID = subtransaction.payeeID
    payeeName = subtransaction.payeeName ?? ""
    categoryID = subtransaction.categoryID
    transferAccountID = subtransaction.transferAccountID
    transferTransactionID = preserveID ? subtransaction.transferTransactionID : nil
    mirroredTransferAccountID = subtransaction.transferAccountID
    memo = subtransaction.memo ?? ""
  }

  var amount: Int? { amount(decimalDigits: nil) }

  /// The typed amount, checked against the plan currency's decimal places.
  /// A loaded line left untouched keeps its stored amount, even one saved
  /// with more decimals than the currency now allows.
  func amount(decimalDigits: Int?) -> Int? {
    if let loadedAmount, amountText == MoneyCodec.editableString(for: loadedAmount) {
      return loadedAmount
    }
    return MoneyCodec.milliunits(fromTyped: amountText, decimalDigits: decimalDigits)
  }

  func writeRequest() -> TransactionSubtransactionWriteRequest? {
    guard let amount else { return nil }
    let trimmedPayeeName = payeeName.trimmingCharacters(in: .whitespacesAndNewlines)
    return TransactionSubtransactionWriteRequest(
      id: id,
      amount: amount,
      payeeID: transferAccountID == nil ? payeeID : nil,
      payeeName: transferAccountID == nil && !trimmedPayeeName.isEmpty ? trimmedPayeeName : nil,
      categoryID: transferAccountID == nil ? categoryID : nil,
      memo: memo.trimmedNil,
      transferAccountID: transferAccountID,
      transferTransactionID: transferAccountID == mirroredTransferAccountID ? transferTransactionID : nil
    )
  }
}

struct TransactionDraft: Equatable, Codable {
  var id: String?
  var importID: String?
  var direction: EntryDirection = .outflow
  /// Magnitude only; the Outflow/Inflow toggle owns the sign.
  var amountMagnitudeMilli = 0
  var payeeID: String?
  var payeeName = ""
  var accountID = ""
  var categoryID: String?
  /// Set when the chosen payee is another account's transfer payee; the API
  /// keeps the mirrored transaction on that account in step.
  var transferAccountID: String?
  var subtransactions: [TransactionSubtransactionDraft] = []
  var date = Date.now
  var isCleared = false
  var wasReconciled = false
  /// Cleared state when the editor opened. New captures have none, so Save
  /// always sends the toggle. Edits send it only when this differs.
  var loadedCleared: ClearedState?
  var loadedAmountMilli: Int?
  var loadedAccountID: String?
  var loadedDateISO: String?
  var loadedTransferAccountID: String?
  var loadedTransferLineSignatures: [String] = []
  var linkedTransferIDs: [String] = []
  var flag: FlagColour = .none
  var memo = ""
  /// Nil keeps the editor's behaviour: saving approves the row. A caller that
  /// must not change approval (a share-intake Fix) sets the row's own value.
  var approved: Bool?
  /// "To confirm" as stored. Optional only so drafts saved before the field
  /// existed still decode; read and write it through `needsConfirmation`.
  var toConfirm: Bool?
  /// The marker when the editor opened. Nil for a new row.
  var loadedToConfirm: Bool?
  /// "To claim" as the form shows it (`to_claim`, `claimed` or nil), and the
  /// stored values when the editor opened. A row stored before the field
  /// carries the claim as a memo word, which the form moves into the field.
  var claimStatus: String?
  var claimedOn: String?
  var loadedClaimStatus: String?
  var loadedClaimedOn: String?
  /// The claim the form opened with, legacy memo words included.
  var openedClaimStatus: String?
  var openedClaimedOn: String?
  /// The stored memo when it carries follow-up words (written before the
  /// fields). Saving without touching the memo or follow-ups sends it back
  /// as it is, and the server keeps the words.
  var legacyMemo: String?

  /// True while the memo text and To claim are as the words left them. Save
  /// then sends the stored memo back and no claim: the server keeps the
  /// words, or turns them into fields if To confirm is sent, without
  /// reopening a claim the claims tool has marked since the row was loaded.
  var echoesLegacyWords: Bool {
    guard let legacyMemo, loadedClaimStatus == nil else { return false }
    let legacy = MemoClaim.legacyWords(legacyMemo)
    return memo.trimmingCharacters(in: .whitespacesAndNewlines) == legacy.text
      && claimStatus == (loadedClaimStatus ?? legacy.claim?.rawValue)
  }

  /// To confirm as the editor opened it, from the field or a TOCHECK word.
  var openedToConfirm: Bool {
    (loadedToConfirm ?? false) || (legacyMemo.map { MemoClaim.legacyWords($0).toCheck } ?? false)
  }

  /// True while the memo and both follow-ups are as the words left them.
  var keepsLegacyWords: Bool {
    echoesLegacyWords && needsConfirmation == openedToConfirm
  }

  /// The chip: on while the row is to claim. Turning it off on a row that
  /// opened as claimed puts the claimed state back.
  var isToClaim: Bool {
    get { claimStatus == MemoClaim.toClaim.rawValue }
    set {
      if newValue {
        claimStatus = MemoClaim.toClaim.rawValue
        claimedOn = nil
      } else if openedClaimStatus == MemoClaim.claimed.rawValue {
        claimStatus = openedClaimStatus
        claimedOn = openedClaimedOn
      } else {
        claimStatus = nil
        claimedOn = nil
      }
    }
  }

  /// The amount is an estimate to check against the statement later.
  var needsConfirmation: Bool {
    get { toConfirm ?? false }
    set { toConfirm = newValue }
  }

  init() {
    importID = UUID().uuidString.lowercased()
  }

  init(transaction: Transaction) {
    id = transaction.id
    direction = transaction.amount < 0 ? .outflow : .inflow
    amountMagnitudeMilli = abs(transaction.amount)
    payeeID = transaction.payeeID
    payeeName = transaction.payeeName ?? ""
    accountID = transaction.accountID
    categoryID = transaction.categoryID
    // A split owns categorisation and transfer state on its lines. Do not
    // carry an old parent transfer into a split edit where the API would
    // reject the hybrid transaction.
    transferAccountID = transaction.isSplit ? nil : transaction.transferAccountID
    subtransactions = transaction.subtransactions.map { TransactionSubtransactionDraft(subtransaction: $0) }
    date = Date(isoDateString: transaction.date) ?? .now
    isCleared = transaction.cleared != .uncleared
    wasReconciled = transaction.cleared == .reconciled
    loadedCleared = transaction.cleared
    loadedAmountMilli = transaction.amount
    loadedAccountID = transaction.accountID
    loadedDateISO = transaction.date
    loadedTransferAccountID = transaction.isSplit ? nil : transaction.transferAccountID
    loadedTransferLineSignatures = transaction.subtransactions.compactMap { line in
      guard let dest = line.transferAccountID else {
        return nil
      }
      return "\(line.transferTransactionID ?? "")|\(dest)|\(line.amount)"
    }
    linkedTransferIDs = transaction.linkedTransferIDs
    flag = FlagColour(rawValue: transaction.flagColor ?? "") ?? .none
    let legacy = MemoClaim.legacyWords(transaction.memo)
    memo = legacy.text
    toConfirm = transaction.isToConfirm || legacy.toCheck
    loadedToConfirm = transaction.isToConfirm
    claimStatus = transaction.claimStatus ?? legacy.claim?.rawValue
    claimedOn = transaction.claimStatus == nil ? legacy.claimedOn : transaction.claimedOn
    loadedClaimStatus = transaction.claimStatus
    loadedClaimedOn = transaction.claimedOn
    openedClaimStatus = claimStatus
    openedClaimedOn = claimedOn
    if legacy.claim != nil || legacy.toCheck {
      legacyMemo = transaction.memo
    }
  }

  init(duplicating transaction: Transaction) {
    direction = transaction.amount < 0 ? .outflow : .inflow
    amountMagnitudeMilli = abs(transaction.amount)
    payeeID = transaction.payeeID
    payeeName = transaction.payeeName ?? ""
    accountID = transaction.accountID
    categoryID = transaction.categoryID
    transferAccountID = transaction.isSplit ? nil : transaction.transferAccountID
    subtransactions = transaction.subtransactions.map { TransactionSubtransactionDraft(subtransaction: $0, preserveID: false) }
    flag = FlagColour(rawValue: transaction.flagColor ?? "") ?? .none
    // A copy of a spend to claim is to claim too; a claimed day does not carry.
    let legacy = MemoClaim.legacyWords(transaction.memo)
    memo = legacy.text
    if (transaction.claimStatus ?? legacy.claim?.rawValue) == MemoClaim.toClaim.rawValue {
      claimStatus = MemoClaim.toClaim.rawValue
    }
    importID = UUID().uuidString.lowercased()
  }

  var isTransfer: Bool {
    transferAccountID != nil
  }

  var isSplit: Bool {
    !subtransactions.isEmpty
  }

  mutating func seedIfNeeded(accounts: [Account], preferredAccountID: String? = nil) {
    guard accountID.isEmpty else {
      return
    }
    if let preferredAccountID, accounts.contains(where: { $0.id == preferredAccountID && !$0.closed }) {
      accountID = preferredAccountID
    } else if let first = accounts.first(where: { !$0.closed }) ?? accounts.first {
      accountID = first.id
    }
  }

  var signedMilliunits: Int {
    if isSplit {
      // Each line is capped, but the sum must still never trap; an overflow
      // is reported by `splitValidationMessage`.
      return subtransactions.map { $0.amount ?? 0 }.saturatingSum()
    }
    return direction == .outflow ? -amountMagnitudeMilli : amountMagnitudeMilli
  }

  var splitValidationMessage: String? {
    splitValidationMessage(decimalDigits: nil)
  }

  /// `decimalDigits` is the plan currency's, when the caller knows it.
  func splitValidationMessage(decimalDigits: Int?) -> String? {
    guard isSplit else { return nil }
    guard subtransactions.count >= 2 else {
      return "A split transaction needs at least two lines."
    }
    let amounts = subtransactions.compactMap { $0.amount(decimalDigits: decimalDigits) }
    guard amounts.count == subtransactions.count else {
      return "Enter a valid signed amount for every split line."
    }
    guard let total = amounts.checkedSum(), total.magnitude <= MoneyCodec.storableAmountCap.magnitude else {
      return "The split total is too large."
    }
    return nil
  }

  mutating func enableSplit() {
    guard !isSplit else { return }
    subtransactions = [
      TransactionSubtransactionDraft(amountText: MoneyCodec.editableString(for: signedMilliunits)),
      TransactionSubtransactionDraft(),
    ]
    categoryID = nil
    transferAccountID = nil
  }

  mutating func disableSplit() {
    let total = signedMilliunits
    if total != 0 {
      direction = total < 0 ? .outflow : .inflow
    }
    amountMagnitudeMilli = abs(total)
    subtransactions = []
  }

  /// A new row from Shortcuts or capture rounded half away from zero to the
  /// currency's smallest unit, the amount its review already shows (12.345
  /// reads as $12.35; 1.5 yen as ¥2). Edits keep the amount they were saved
  /// with, and split lines are checked line by line instead.
  func roundedToMinorUnit(decimalDigits: Int?) -> TransactionDraft {
    guard id == nil, !isSplit, let decimalDigits else {
      return self
    }
    let unit = MoneyCodec.minorUnit(decimalDigits: decimalDigits)
    let rounded = (amountMagnitudeMilli + unit / 2) / unit * unit
    var draft = self
    // A misread sliver (0.4 yen) becomes one smallest unit rather than an
    // empty row that blocks its batch.
    draft.amountMagnitudeMilli = amountMagnitudeMilli > 0 ? max(rounded, unit) : 0
    return draft
  }

  var canSave: Bool {
    // Imported zero-value rows may still need a memo, flag, or cleared-state
    // correction. New non-split zero captures remain invalid; zero-net splits
    // are legal YNAB reallocations.
    !accountID.isEmpty && splitValidationMessage == nil && (id != nil || amountMagnitudeMilli > 0 || isSplit)
  }

  var changesReconciliationGraph: Bool {
    guard let loadedAmountMilli, let loadedAccountID, let loadedDateISO else {
      return false
    }
    let transferLineSignatures = subtransactions.compactMap { line -> String? in
      guard let dest = line.transferAccountID else {
        return nil
      }
      return "\(line.transferTransactionID ?? "")|\(dest)|\(line.amount ?? 0)"
    }
    return signedMilliunits != loadedAmountMilli
      || accountID != loadedAccountID
      || date.isoDateString != loadedDateISO
      || transferAccountID != loadedTransferAccountID
      || transferLineSignatures != loadedTransferLineSignatures
  }

  func needsEditWarning(linkedReconciled: Bool) -> Bool {
    id != nil && changesReconciliationGraph && (wasReconciled || linkedReconciled)
  }

  var clearedState: ClearedState {
    guard isCleared else {
      return .uncleared
    }
    return wasReconciled ? .reconciled : .cleared
  }

  /// True when Save should send `cleared`. New rows always send it; edits
  /// send it only if the user moved the toggle, so an untouched form cannot
  /// write back a stale status after another client toggled the register.
  var shouldWriteCleared: Bool {
    guard let loadedCleared else {
      return true
    }
    if loadedCleared == .reconciled || wasReconciled {
      return false
    }
    return clearedState != loadedCleared
  }

  /// What Save sends for "To confirm". A new row sends only a set marker.
  /// An edit sends the marker when it changed, and always when the write
  /// clears the row: the server reads clearing without an explicit value as
  /// confirming, which would drop a marker the user kept on.
  func needsConfirmationToWrite(includeCleared: Bool) -> Bool? {
    guard let loadedToConfirm else {
      return needsConfirmation ? true : nil
    }
    if needsConfirmation != loadedToConfirm || (includeCleared && clearedState != .uncleared) {
      return needsConfirmation
    }
    return nil
  }

  /// What Save sends for "To claim": a new row only a set claim, an edit only
  /// a claim that differs from the stored one.
  var claimToWrite: ClaimWrite? {
    let wanted = claimStatus.flatMap(ClaimWrite.init(rawValue:)) ?? .notClaimed
    guard id != nil else {
      return wanted == .notClaimed ? nil : wanted
    }
    if claimStatus == loadedClaimStatus && (claimStatus != MemoClaim.claimed.rawValue || claimedOn == loadedClaimedOn) {
      return nil
    }
    return wanted
  }

  func writeRequest(includeCleared: Bool = true) -> TransactionWriteRequest {
    let trimmedPayee = payeeName.trimmingCharacters(in: .whitespacesAndNewlines)
    let hasParentTransfer = transferAccountID != nil
    // Clearing an uncleared row confirms it unless the write says otherwise,
    // so a row kept with its words sends To confirm then, as other rows do.
    let clearsRow = includeCleared && loadedCleared == .uncleared && clearedState != .uncleared
    let echoesWords = echoesLegacyWords
    let toConfirmWrite: Bool? = echoesWords
      ? (needsConfirmation != openedToConfirm || clearsRow ? needsConfirmation : nil)
      : needsConfirmationToWrite(includeCleared: includeCleared)
    return TransactionWriteRequest(
      accountID: accountID,
      date: date.isoDateString,
      amount: signedMilliunits,
      payeeID: isSplit && hasParentTransfer ? nil : payeeID,
      payeeName: isSplit && hasParentTransfer ? nil : (trimmedPayee.isEmpty ? nil : trimmedPayee),
      categoryID: isSplit ? nil : categoryID,
      memo: echoesWords ? legacyMemo : memo.trimmedNil,
      cleared: includeCleared ? clearedState : nil,
      approved: approved ?? true,
      flagColor: flag.rawValue.isEmpty ? nil : flag.rawValue,
      subtransactions: subtransactions.compactMap { $0.writeRequest() },
      importID: importID,
      needsConfirmation: toConfirmWrite,
      claimStatus: echoesWords ? nil : claimToWrite,
      claimedOn: claimedOn
    )
  }
}
