import Foundation

private extension KeyedDecodingContainer {
  func decodeLossyArray<T: Decodable>(_ type: T.Type, forKey key: Key) throws -> [T] {
    guard contains(key) else { return [] }
    if try decodeNil(forKey: key) { return [] }
    var nested = try nestedUnkeyedContainer(forKey: key)
    var items: [T] = []
    while !nested.isAtEnd {
      let element = try nested.superDecoder()
      if let item = try? T(from: element) {
        items.append(item)
      }
    }
    return items
  }
}

enum RewardGroupBy: String, CaseIterable, Identifiable, Codable, Sendable {
  case flag
  case payee
  case category
  case memo

  var id: String { rawValue }

  var title: String {
    switch self {
    case .flag:
      return "Flag"
    case .payee:
      return "Payee"
    case .category:
      return "Category"
    case .memo:
      return "Memo"
    }
  }
}

enum RewardKind: String, Codable, Hashable, Sendable {
  case cashback
  case miles

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .cashback
      return
    }
    let raw = (try? container.decode(String.self)) ?? ""
    self = RewardKind(rawValue: raw) ?? .cashback
  }
}

enum RewardFlagColour: String, Codable, CaseIterable, Identifiable, Sendable {
  case red
  case orange
  case yellow
  case green
  case blue
  case purple
  case unflagged

  var id: String { rawValue }

  var title: String {
    self == .unflagged ? "Unflagged" : rawValue.capitalized
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    let raw = try container.decode(String.self)
    self = RewardFlagColour(rawValue: raw) ?? .unflagged
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(rawValue)
  }

  var ledgerColour: FlagColour {
    FlagColour(rawValue: rawValue) ?? .none
  }

  init(ledgerColour: FlagColour) {
    self = RewardFlagColour(rawValue: ledgerColour.rawValue) ?? .unflagged
  }
}

enum CardBillingType: String, Codable, CaseIterable, Identifiable, Sendable {
  case calendar
  case billing

  var id: String { rawValue }

  var title: String {
    switch self {
    case .calendar:
      return "Calendar month"
    case .billing:
      return "Billing cycle"
    }
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .calendar
      return
    }
    let raw = (try? container.decode(String.self)) ?? ""
    self = CardBillingType(rawValue: raw) ?? .calendar
  }
}

struct CardBillingCycle: Codable, Equatable, Sendable {
  var type: CardBillingType
  var dayOfMonth: Double?
}

struct CardRewardPeriod: Codable, Equatable, Sendable {
  var monthCount: Double
  var anchorDate: String
  var monthlyMinimumSpend: Double
}

struct CardPromotionalPeriod: Codable, Equatable, Sendable {
  var startDate: String?
  var endDate: String
  var description: String?
}

struct CardSubcategory: Codable, Equatable, Identifiable, Sendable {
  var id: String
  var name: String
  var flagColor: RewardFlagColour
  var rewardValue: Double
  var milesBlockSize: Double?
  var minimumSpend: Double?
  var maximumSpend: Double?
  var priority: Double
  var active: Bool
  var excludeFromRewards: Bool?
  var createdAt: String
  var updatedAt: String

  init(
    id: String,
    name: String,
    flagColor: RewardFlagColour,
    rewardValue: Double,
    milesBlockSize: Double? = nil,
    minimumSpend: Double? = nil,
    maximumSpend: Double? = nil,
    priority: Double,
    active: Bool,
    excludeFromRewards: Bool? = nil,
    createdAt: String,
    updatedAt: String
  ) {
    self.id = id
    self.name = name
    self.flagColor = flagColor
    self.rewardValue = rewardValue
    self.milesBlockSize = milesBlockSize
    self.minimumSpend = minimumSpend
    self.maximumSpend = maximumSpend
    self.priority = priority
    self.active = active
    self.excludeFromRewards = excludeFromRewards
    self.createdAt = createdAt
    self.updatedAt = updatedAt
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let decodedId = try container.decodeIfPresent(String.self, forKey: .id)
    let decodedName = try container.decodeIfPresent(String.self, forKey: .name)
    guard decodedId != nil || decodedName != nil else {
      throw DecodingError.dataCorrupted(
        DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "Card subcategory needs an id or name.")
      )
    }
    id = decodedId ?? UUID().uuidString
    name = decodedName ?? ""
    flagColor = try container.decodeIfPresent(RewardFlagColour.self, forKey: .flagColor) ?? .unflagged
    rewardValue = try container.decode(Double.self, forKey: .rewardValue)
    milesBlockSize = try container.decodeIfPresent(Double.self, forKey: .milesBlockSize)
    minimumSpend = try container.decodeIfPresent(Double.self, forKey: .minimumSpend)
    maximumSpend = try container.decodeIfPresent(Double.self, forKey: .maximumSpend)
    priority = try container.decodeIfPresent(Double.self, forKey: .priority) ?? 0
    active = try container.decodeIfPresent(Bool.self, forKey: .active) ?? true
    excludeFromRewards = try container.decodeIfPresent(Bool.self, forKey: .excludeFromRewards)
    createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
    updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt) ?? ""
  }
}

struct SpendingTierSubcategory: Codable, Equatable, Sendable {
  var subcategoryId: String
  var rewardValue: Double
  var maximumSpend: Double?
}

struct CardSpendingTier: Codable, Equatable, Identifiable, Sendable {
  var id: String
  var spendThreshold: Double
  var earningRate: Double?
  var maximumSpend: Double?
  var subcategories: [SpendingTierSubcategory]?
}

struct CreditCard: Codable, Equatable, Identifiable, Sendable {
  var id: String
  var name: String
  var issuer: String
  var type: RewardKind
  var ynabAccountId: String
  var featured: Bool
  var billingCycle: CardBillingCycle?
  var rewardPeriod: CardRewardPeriod?
  var promotionalPeriod: CardPromotionalPeriod?
  var earningRate: Double?
  var earningBlockSize: Double?
  var minimumSpend: Double?
  var maximumSpend: Double?
  var subcategoriesEnabled: Bool?
  var subcategories: [CardSubcategory]?
  var spendingTiers: [CardSpendingTier]?
  var flagNames: [String: String]?

  private enum CodingKeys: String, CodingKey {
    case id
    case name
    case issuer
    case type
    case ynabAccountId
    case featured
    case billingCycle
    case rewardPeriod
    case promotionalPeriod
    case earningRate
    case earningBlockSize
    case minimumSpend
    case maximumSpend
    case subcategoriesEnabled
    case subcategories
    case spendingTiers
    case flagNames
  }

  init(
    id: String,
    name: String,
    issuer: String,
    type: RewardKind,
    ynabAccountId: String,
    featured: Bool,
    billingCycle: CardBillingCycle? = nil,
    rewardPeriod: CardRewardPeriod? = nil,
    promotionalPeriod: CardPromotionalPeriod? = nil,
    earningRate: Double? = nil,
    earningBlockSize: Double? = nil,
    minimumSpend: Double? = nil,
    maximumSpend: Double? = nil,
    subcategoriesEnabled: Bool? = nil,
    subcategories: [CardSubcategory]? = nil,
    spendingTiers: [CardSpendingTier]? = nil,
    flagNames: [String: String]? = nil
  ) {
    self.id = id
    self.name = name
    self.issuer = issuer
    self.type = type
    self.ynabAccountId = ynabAccountId
    self.featured = featured
    self.billingCycle = billingCycle
    self.rewardPeriod = rewardPeriod
    self.promotionalPeriod = promotionalPeriod
    self.earningRate = earningRate
    self.earningBlockSize = earningBlockSize
    self.minimumSpend = minimumSpend
    self.maximumSpend = maximumSpend
    self.subcategoriesEnabled = subcategoriesEnabled
    self.subcategories = subcategories
    self.spendingTiers = spendingTiers
    self.flagNames = flagNames
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try container.decodeIfPresent(String.self, forKey: .id) ?? ""
    name = try container.decodeIfPresent(String.self, forKey: .name) ?? ""
    issuer = try container.decodeIfPresent(String.self, forKey: .issuer) ?? ""
    type = try container.decodeIfPresent(RewardKind.self, forKey: .type) ?? .cashback
    ynabAccountId = try container.decodeIfPresent(String.self, forKey: .ynabAccountId) ?? ""
    featured = try container.decodeIfPresent(Bool.self, forKey: .featured) ?? true
    billingCycle = try container.decodeIfPresent(CardBillingCycle.self, forKey: .billingCycle)
    rewardPeriod = try container.decodeIfPresent(CardRewardPeriod.self, forKey: .rewardPeriod)
    promotionalPeriod = try container.decodeIfPresent(CardPromotionalPeriod.self, forKey: .promotionalPeriod)
    earningRate = try container.decodeIfPresent(Double.self, forKey: .earningRate)
    earningBlockSize = try container.decodeIfPresent(Double.self, forKey: .earningBlockSize)
    minimumSpend = try container.decodeIfPresent(Double.self, forKey: .minimumSpend)
    maximumSpend = try container.decodeIfPresent(Double.self, forKey: .maximumSpend)
    subcategoriesEnabled = try container.decodeIfPresent(Bool.self, forKey: .subcategoriesEnabled)
    if container.contains(.subcategories) {
      subcategories = try container.decodeLossyArray(CardSubcategory.self, forKey: .subcategories)
    } else {
      subcategories = nil
    }
    if container.contains(.spendingTiers) {
      spendingTiers = try container.decodeLossyArray(CardSpendingTier.self, forKey: .spendingTiers)
    } else {
      spendingTiers = nil
    }
    flagNames = try container.decodeIfPresent([String: String].self, forKey: .flagNames)
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(name, forKey: .name)
    try container.encode(issuer, forKey: .issuer)
    try container.encode(type, forKey: .type)
    try container.encode(ynabAccountId, forKey: .ynabAccountId)
    try container.encode(featured, forKey: .featured)
    try container.encodeIfPresent(billingCycle, forKey: .billingCycle)
    try container.encodeIfPresent(rewardPeriod, forKey: .rewardPeriod)
    try container.encodeIfPresent(promotionalPeriod, forKey: .promotionalPeriod)
    try container.encodeIfPresent(earningRate, forKey: .earningRate)
    try container.encodeIfPresent(earningBlockSize, forKey: .earningBlockSize)
    try container.encodeIfPresent(minimumSpend, forKey: .minimumSpend)
    try container.encodeIfPresent(maximumSpend, forKey: .maximumSpend)
    try container.encodeIfPresent(subcategoriesEnabled, forKey: .subcategoriesEnabled)
    try container.encodeIfPresent(subcategories, forKey: .subcategories)
    try container.encodeIfPresent(spendingTiers, forKey: .spendingTiers)
    try container.encodeIfPresent(flagNames, forKey: .flagNames)
  }

  func jsonObject(clearMissing: Bool = false) -> [String: Any] {
    var object: [String: Any] = [
      "id": id,
      "name": name,
      "issuer": issuer,
      "type": type.rawValue,
      "ynabAccountId": ynabAccountId,
      "featured": featured,
    ]
    if let billingCycle {
      var cycle: [String: Any] = ["type": billingCycle.type.rawValue]
      if let dayOfMonth = billingCycle.dayOfMonth {
        cycle["dayOfMonth"] = dayOfMonth
      }
      object["billingCycle"] = cycle
    }
    if let rewardPeriod {
      object["rewardPeriod"] = [
        "monthCount": rewardPeriod.monthCount,
        "anchorDate": rewardPeriod.anchorDate,
        "monthlyMinimumSpend": rewardPeriod.monthlyMinimumSpend,
      ]
    } else if clearMissing {
      object["rewardPeriod"] = NSNull()
    }
    if let promotionalPeriod {
      var promo: [String: Any] = ["endDate": promotionalPeriod.endDate]
      if let startDate = promotionalPeriod.startDate {
        promo["startDate"] = startDate
      }
      if let description = promotionalPeriod.description {
        promo["description"] = description
      }
      object["promotionalPeriod"] = promo
    } else if clearMissing {
      object["promotionalPeriod"] = NSNull()
    }
    object["earningRate"] = earningRate ?? NSNull()
    object["earningBlockSize"] = earningBlockSize ?? NSNull()
    object["minimumSpend"] = minimumSpend ?? NSNull()
    object["maximumSpend"] = maximumSpend ?? NSNull()
    object["subcategoriesEnabled"] = subcategoriesEnabled ?? false
    if let flagNames, !flagNames.isEmpty {
      object["flagNames"] = flagNames
    } else if clearMissing {
      object["flagNames"] = [String: String]()
    }
    object["subcategories"] = (subcategories ?? []).map { flag in
      var row: [String: Any] = [
        "id": flag.id,
        "name": flag.name,
        "flagColor": flag.flagColor.rawValue,
        "rewardValue": flag.rewardValue,
        "priority": flag.priority,
        "active": flag.active,
        "createdAt": flag.createdAt,
        "updatedAt": flag.updatedAt,
      ]
      if let milesBlockSize = flag.milesBlockSize {
        row["milesBlockSize"] = milesBlockSize
      }
      if let minimumSpend = flag.minimumSpend {
        row["minimumSpend"] = minimumSpend
      }
      if let maximumSpend = flag.maximumSpend {
        row["maximumSpend"] = maximumSpend
      }
      if let excludeFromRewards = flag.excludeFromRewards {
        row["excludeFromRewards"] = excludeFromRewards
      }
      return row
    }
    object["spendingTiers"] = (spendingTiers ?? []).map { tier in
      var row: [String: Any] = [
        "id": tier.id,
        "spendThreshold": tier.spendThreshold,
      ]
      if let earningRate = tier.earningRate {
        row["earningRate"] = earningRate
      }
      if let maximumSpend = tier.maximumSpend {
        row["maximumSpend"] = maximumSpend
      }
      if let overrides = tier.subcategories, !overrides.isEmpty {
        row["subcategories"] = overrides.map { override in
          var mapped: [String: Any] = [
            "subcategoryId": override.subcategoryId,
            "rewardValue": override.rewardValue,
          ]
          if let maximumSpend = override.maximumSpend {
            mapped["maximumSpend"] = maximumSpend
          }
          return mapped
        }
      }
      return row
    }
    return object
  }
}

struct RewardCardPayload: Decodable, Sendable {
  let card: CreditCard
}

struct RewardSettings: Decodable, Sendable {
  let milesValuation: Double?
}

struct RewardSettingsPayload: Decodable, Sendable {
  let settings: RewardSettings
}

typealias RewardsCard = CreditCard
typealias RewardsTrackerCard = CreditCard

struct RewardsReport: Codable, Sendable {
  let from: String?
  let to: String?
  let asOf: String?
  let period: String?
  let transactionRewards: [String: RewardsTransactionReward]?
  let groupBy: RewardGroupBy
  let milesValuation: Double
  let totals: RewardsTotals
  let cards: [RewardsCardRow]
  let groups: [RewardsGroupRow]

  private enum CodingKeys: String, CodingKey {
    case from, to, asOf, period, transactionRewards, groupBy, milesValuation, totals, cards, groups
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    from = try container.decodeIfPresent(String.self, forKey: .from)
    to = try container.decodeIfPresent(String.self, forKey: .to)
    asOf = try container.decodeIfPresent(String.self, forKey: .asOf)
    period = try container.decodeIfPresent(String.self, forKey: .period)
    transactionRewards = try container.decodeIfPresent([String: RewardsTransactionReward].self, forKey: .transactionRewards)
    groupBy = try container.decode(RewardGroupBy.self, forKey: .groupBy)
    milesValuation = try container.decode(Double.self, forKey: .milesValuation)
    totals = try container.decode(RewardsTotals.self, forKey: .totals)
    cards = try container.decodeLossyArray(RewardsCardRow.self, forKey: .cards)
    groups = try container.decodeIfPresent([RewardsGroupRow].self, forKey: .groups) ?? []
  }
}

struct RewardsTotals: Codable, Sendable {
  let spend: Double
  let rewardDollars: Double
  let cashback: Double
  let miles: Double
}

struct RewardsCardRow: Codable, Identifiable, Sendable {
  var id: String { card.id }

  let card: RewardsCard
  let accountId: String
  let accountName: String
  let calculation: RewardsCalculation
}

struct RewardsCalculation: Codable, Sendable {
  let period: String
  let totalSpend: Double
  let countedSpend: Double
  let eligibleSpend: Double
  let rewardEarned: Double
  let rewardEarnedDollars: Double
  let rewardType: RewardKind
  let minimumSpend: Double?
  let minimumSpendMet: Bool
  let minimumSpendProgress: Double?
  /// The first day of the period on which the minimum was met; nil when not met or there is none.
  var minimumMetOn: String? = nil
  let maximumSpend: Double?
  let maximumSpendExceeded: Bool
  let maximumSpendProgress: Double?
  let qualificationStatus: String?
  let monthlyQualifications: [RewardsMonthlyQualification]?
  let monthlyMinimumSpend: Double?
  let activeSpendingTierId: String?
  let hasNextSpendingTier: Bool?
  let nextSpendingTierId: String?
  let nextSpendingTierThreshold: Double?
  let shouldStopUsing: Bool?
  let periods: [RewardsCalculationPeriod]?
  let flags: [RewardsFlagRow]
}

struct RewardsCalculationPeriod: Codable, Sendable {
  let start: String
  let end: String
  let calculation: RewardsCalculation
}

struct RewardsMonthlyQualification: Codable, Sendable {
  let start: String
  let end: String
  let spend: Double
  let minimumSpend: Double
  let status: String
}

struct RewardsTransactionReward: Codable, Sendable {
  let reward: Double
  let rewardDollars: Double
}

struct RewardsFlagRow: Codable, Identifiable, Sendable {
  var id: String { subcategoryId }

  let subcategoryId: String
  let name: String
  let flagColor: String
  let totalSpend: Double?
  let eligibleSpend: Double
  let rewardEarned: Double
  let rewardEarnedDollars: Double?
  let rewardRate: Double?
  // Category limits; older servers omit them.
  var countedSpend: Double? = nil
  var minimumSpend: Double? = nil
  var minimumSpendMet: Bool? = nil
  var maximumSpend: Double? = nil
  var maximumSpendExceeded: Bool? = nil
  var blockSize: Double? = nil
}

struct RewardsGroupRow: Codable, Identifiable, Sendable {
  var id: String { key }

  let key: String
  let label: String
  let flagColor: String?
  let spend: Double
  let reward: Double
  let rewardDollars: Double
  let transactionCount: Int
}

struct RewardsTrackerSnapshot: Decodable, Sendable {
  let snapshot: RewardsTrackerStoredSnapshot?
  let configuration: RewardsConfigurationJSON?
  let cards: [RewardsTrackerCard]
  let importedAt: String?
  let updatedAt: String?

  private enum CodingKeys: String, CodingKey {
    case snapshot, cards, importedAt, updatedAt
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    snapshot = try container.decodeIfPresent(RewardsTrackerStoredSnapshot.self, forKey: .snapshot)
    configuration = try container.decodeIfPresent(RewardsConfigurationJSON.self, forKey: .snapshot)
    cards = try container.decodeLossyArray(RewardsTrackerCard.self, forKey: .cards)
    importedAt = try container.decodeIfPresent(String.self, forKey: .importedAt)
    updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt)
  }

  func configurationData() throws -> Data {
    var object = configuration?.objectValue ?? [:]
    let allowed = Set(["ynab", "rules", "tagMappings", "themeGroups", "hiddenCards", "settings"])
    object = object.filter { allowed.contains($0.key) }
    object["cards"] = cards.map { $0.jsonObject() }
    object["calculations"] = [Any]()
    return try JSONSerialization.data(withJSONObject: RewardsConfigurationJSON.sanitize(object), options: [.prettyPrinted, .sortedKeys])
  }
}

// Dictionary decoding preserves tracker camelCase keys despite the API's snake-case decoder.
indirect enum RewardsConfigurationJSON: Decodable, Sendable {
  case object([String: RewardsConfigurationJSON])
  case array([RewardsConfigurationJSON])
  case string(String)
  case number(Double)
  case bool(Bool)
  case null

  init(from decoder: Decoder) throws {
    let value = try decoder.singleValueContainer()
    if value.decodeNil() { self = .null }
    else if let object = try? value.decode([String: Self].self) { self = .object(object) }
    else if let array = try? value.decode([Self].self) { self = .array(array) }
    else if let bool = try? value.decode(Bool.self) { self = .bool(bool) }
    else if let number = try? value.decode(Double.self) { self = .number(number) }
    else { self = .string(try value.decode(String.self)) }
  }

  var objectValue: [String: Any]? { value as? [String: Any] }

  private var value: Any {
    switch self {
    case .object(let object): return object.mapValues(\.value)
    case .array(let array): return array.map(\.value)
    case .string(let string): return string
    case .number(let number): return number
    case .bool(let bool): return bool
    case .null: return NSNull()
    }
  }

  static func sanitize(_ value: Any) -> Any {
    if let object = value as? [String: Any] {
      return object.filter { key, _ in
        let key = key.lowercased().filter { $0.isLetter || $0.isNumber }
        return key != "pat" && key != "authorization" && key != "cacheddata"
          && !["token", "apikey", "secret", "password", "credential", "mnemonic", "cloudsync"].contains(where: key.contains)
      }.mapValues(sanitize)
    }
    if let array = value as? [Any] { return array.map(sanitize) }
    return value
  }
}

struct RewardsTrackerStoredSnapshot: Decodable, Sendable {
  let cards: [RewardsTrackerCard]?

  private enum CodingKeys: String, CodingKey {
    case cards
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    if container.contains(.cards) {
      cards = try container.decodeLossyArray(RewardsTrackerCard.self, forKey: .cards)
    } else {
      cards = nil
    }
  }
}

struct RewardsTrackerImportResult: Decodable, Sendable {
  let importSessionId: String
  let cards: Int
  let rules: Int
  let tagMappings: Int
  let themeGroups: Int
  let accountsUpserted: Int
  let transactionsImported: Int
  let transactionsUpdated: Int
  let flagNames: Int
}
