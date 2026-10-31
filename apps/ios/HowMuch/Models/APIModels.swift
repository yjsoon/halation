import Foundation

struct APIEnvelope<Payload: Decodable>: Decodable {
  let data: Payload
}

struct ServerErrorEnvelope: Decodable {
  let error: ServerError
}

struct ServerError: Decodable {
  let id: String
  let detail: String
  let name: String?
  let currentReconciledBalance: Int?
  let projectedReconciledBalance: Int?
  let statementBalance: Int?
  let difference: Int?
}

struct APIUser: Decodable {
  let id: String
  let username: String?
}

struct AuthTokenPayload: Decodable {
  let token: String
  let expiresAt: Int
  let user: APIUser
}

struct AuthStatusPayload: Decodable {
  let setupRequired: Bool
  let bootstrapRequired: Bool
  let user: APIUser?
  /// True when the server sends new transactions to TypeSafe for a category.
  /// Optional: older servers do not send it.
  let categoriserEnabled: Bool?
}

struct PlansPayload: Decodable {
  let plans: [PlanSummary]
}

struct PlanSummary: Decodable, Equatable, Identifiable {
  let id: String
  let name: String
}

struct ReferenceData {
  let planSettings: PlanSettings
  let accounts: [Account]
  let categoryGroups: [CategoryGroup]
  let payees: [Payee]
  let accountPreferences: SyncedAccountPreferences?
}

struct AccountPreferencesPayload: Codable {
  let accountPreferences: APIAccountPreferences?
  let accountPreferencesRevision: Int
}

struct AccountPreferencesWriteRequest: Encodable {
  let accountPreferences: APIAccountPreferences
  let expectedRevision: Int
}

struct APIAccountPreferences: Codable {
  let favouriteAccountIds: [String]
  let accountOrder: [String]
  let accountOrderByGroup: [String: [String]]
  let accountGroupSorts: [String: AccountGroupSort]
  let customAccountGroups: [APICustomAccountGroup]

  init(_ preferences: AccountPresentationPreferences) {
    favouriteAccountIds = preferences.favouriteAccountIDs
    accountOrder = preferences.accountOrder
    accountOrderByGroup = preferences.accountOrderByGroup
    accountGroupSorts = preferences.accountGroupSorts
    customAccountGroups = preferences.customAccountGroups.map(APICustomAccountGroup.init)
  }

  var presentationPreferences: AccountPresentationPreferences {
    var preferences = ViewPrefs()
    preferences.favouriteAccountIDs = favouriteAccountIds
    preferences.accountOrder = accountOrder
    preferences.accountOrderByGroup = accountOrderByGroup
    preferences.accountGroupSorts = accountGroupSorts
    preferences.customAccountGroups = customAccountGroups.map(\.customAccountGroup)
    return AccountPresentationPreferences(preferences.structurallyNormalised())
  }
}

struct APICustomAccountGroup: Codable {
  let id: String
  let name: String
  let accountIds: [String]

  init(_ group: CustomAccountGroup) {
    id = group.id
    name = group.name
    accountIds = group.accountIDs
  }

  var customAccountGroup: CustomAccountGroup {
    CustomAccountGroup(id: id, name: name, accountIDs: accountIds)
  }
}

struct PlanSettingsPayload: Decodable {
  let settings: PlanSettings
}

struct AccountsPayload: Decodable {
  let accounts: [Account]
}

struct AccountPayload: Decodable {
  let account: Account
}

struct AccountIdentity: Hashable {
  var name: String
  var classification: AccountClassification
  var icon: AccountIcon
}

struct AccountUpdateRequest: Encodable {
  let account: AccountWriteBody

  init(name: String?, icon: String?, type: String?) {
    account = AccountWriteBody(name: name, icon: icon, type: type)
  }

  struct AccountWriteBody: Encodable {
    let name: String?
    let icon: String?
    let type: String?

    enum CodingKeys: String, CodingKey {
      case name, icon, type
    }

    func encode(to encoder: Encoder) throws {
      var container = encoder.container(keyedBy: CodingKeys.self)
      try container.encodeIfPresent(name, forKey: .name)
      try container.encodeIfPresent(icon, forKey: .icon)
      try container.encodeIfPresent(type, forKey: .type)
    }
  }
}

struct AccountCreateRequest: Encodable {
  let account: Body

  init(name: String, type: String, balance: Int, icon: String?, onBudget: Bool) {
    account = Body(name: name, type: type, balance: balance, icon: icon, onBudget: onBudget)
  }

  struct Body: Encodable {
    let name: String
    let type: String
    let balance: Int
    let icon: String?
    let onBudget: Bool

    enum CodingKeys: String, CodingKey {
      case name, type, balance, icon, onBudget
    }

    func encode(to encoder: Encoder) throws {
      var container = encoder.container(keyedBy: CodingKeys.self)
      try container.encode(name, forKey: .name)
      try container.encode(type, forKey: .type)
      try container.encode(balance, forKey: .balance)
      try container.encodeIfPresent(icon, forKey: .icon)
      try container.encode(onBudget, forKey: .onBudget)
    }
  }
}

struct CategoriesPayload: Decodable {
  let categoryGroups: [CategoryGroup]
}

struct PayeesPayload: Decodable {
  let payees: [Payee]
}

struct Payee: Codable, Identifiable, Hashable {
  let id: String
  let name: String
  let transferAccountId: String?
  let deleted: Bool?

  var isTransferPayee: Bool {
    transferAccountId != nil
  }

  func withName(_ name: String) -> Payee {
    Payee(id: id, name: name, transferAccountId: transferAccountId, deleted: deleted)
  }
}

struct TransactionsPayload: Decodable {
  let transactions: [Transaction]
  let serverKnowledge: Int?
  let hasMore: Bool?
  let nextOffset: Int?
}

/// The "New" badge without the queue behind it: `{ count, server_knowledge }`.
/// The shared decoder converts snake_case, so no CodingKeys are needed.
struct UnapprovedCountPayload: Decodable {
  let count: Int
  let serverKnowledge: Int?
}

/// One bounded, newest-first ledger page from the HowMuch transaction API.
/// Deleted rows are removed by `APIClient` before the page reaches the UI.
struct TransactionPage {
  let transactions: [Transaction]
  let hasMore: Bool
  let nextOffset: Int?
  let serverKnowledge: Int?
  /// The last row's date as the server sent it, before tombstones are dropped
  /// or acknowledged writes repair `transactions`: where this page leaves the
  /// cursor.
  var cursorDate: String? = nil
}

struct TransactionPayload: Decodable {
  let transaction: Transaction
  let serverKnowledge: Int?
}

struct ScheduledTransactionsPayload: Decodable {
  let scheduledTransactions: [ScheduledTransaction]
  let serverKnowledge: Int?
}

extension String {
  var trimmedNil: String? {
    let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }
}
