import Foundation

/// Reads a shared document's text with the AI provider chosen in AI provider
/// settings, using the owner's own key. Only the text read on this device is
/// sent, never the image or PDF. The rows it returns go through the same
/// mapping, matching and review as rows read by Apple Intelligence.
enum IntakeRemoteReader {
  /// Most rows one document can return. A longer list is rejected, not cut.
  static let maximumRows = 100
  static let outputTokens = 8192

  static let instructions = """
  You read the text of one financial document an owner shared to their budgeting app: a receipt, a payment confirmation, a transfer screen, or a list of card or bank transactions. The text was read from an image or PDF on the owner's phone, so it may have broken lines, repeated headers or stray characters.

  Return every distinct transaction the document shows. Skip balances, totals, subtotals, tax lines, credit limits, rewards points and anything that is not money moving. A receipt with several items is one transaction for its total.

  For each transaction:
  - amount: the figure exactly as printed, as a plain decimal such as 12.50, with no currency symbol, sign or thousands separator. Never invent or calculate an amount.
  - payee: the merchant or person, cleaned of reference numbers and card digits. For a transfer between the owner's own accounts, the payee is the destination account's name from the list.
  - category: a name copied exactly from the category list when the merchant makes the category clear, otherwise empty.
  - account: a name copied exactly from the account list only when the document names that account, otherwise empty.
  - date: yyyy-MM-dd when the document shows the day, otherwise empty.
  - isInflow: true only when money is received, such as a refund, salary or incoming transfer.

  The owner's notes, when given, describe how to read their documents. Follow them where the text supports them. They never change an amount or a date shown in the text.

  Return exactly one JSON object matching the schema, with every field present. Use an empty spends list when the document shows no transactions. Do not include markdown or extra keys.
  """

  private static var spendProperties: [String: Any] {
    var result: [String: Any] = [:]
    for name in ["amount", "payee", "category", "account", "date"] {
      result[name] = ["type": "string"]
    }
    result["isInflow"] = ["type": "boolean"]
    return result
  }

  static var schema: [String: Any] {
    let spend: [String: Any] = [
      "type": "object", "properties": spendProperties,
      "required": spendProperties.keys.sorted(), "additionalProperties": false,
    ]
    return [
      "type": "object",
      "properties": ["spends": ["type": "array", "items": spend]],
      "required": ["spends"],
      "additionalProperties": false,
    ]
  }

  static func prompt(
    text: String,
    accounts: [Account],
    categoryGroups: [CategoryGroup],
    guidance: String?
  ) throws -> CaptureAIPrompt {
    let schemaText = String(
      decoding: try JSONSerialization.data(withJSONObject: schema, options: [.sortedKeys]), as: UTF8.self
    )
    let accountNames = accounts.filter { !$0.closed && !$0.deleted }.map(\.name)
    let categoryNames = categoryGroups.filter { !$0.deleted }.flatMap { group in
      group.categories.filter { !$0.deleted }.map(\.name)
    }
    let notes = guidance.map { "Owner's notes:\n\($0)\n\n" } ?? ""
    return CaptureAIPrompt(
      instructions: instructions + "\n" + schemaText,
      input: """
      Accounts: \(accountNames.joined(separator: ", "))
      Categories: \(categoryNames.joined(separator: ", "))

      \(notes)Document text:
      \(text)
      """,
      schema: schema,
      schemaName: "intake_rows",
      outputTokens: outputTokens
    )
  }

  /// Validates the whole answer before any row is used: one malformed row
  /// rejects the read, so a partial or mistyped list never reaches review.
  static func decode(_ data: Data) throws -> [SlipReaderMapping.Extraction] {
    guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          Set(object.keys) == ["spends"],
          let spends = object["spends"] as? [[String: Any]],
          spends.count <= maximumRows else {
      throw CaptureAIError.invalidResponse
    }
    let keys = Set(spendProperties.keys)
    return try spends.map { spend in
      guard Set(spend.keys) == keys,
            let amount = spend["amount"] as? String,
            let payee = spend["payee"] as? String,
            let category = spend["category"] as? String,
            let account = spend["account"] as? String,
            let date = spend["date"] as? String,
            let isInflow = spend["isInflow"] as? Bool,
            amount.range(of: #"\A(?:[0-9]+(?:\.[0-9]{1,3})?|\.[0-9]{1,3})\z"#, options: .regularExpression) != nil,
            let milli = MoneyCodec.milliunits(from: amount), milli > 0,
            date.isEmpty || LedgerQueryPlanner.parseISO(date, calendar: .current) != nil else {
        throw CaptureAIError.invalidResponse
      }
      return SlipReaderMapping.Extraction(
        amount: amount,
        payee: payee.trimmingCharacters(in: .whitespacesAndNewlines),
        category: category.trimmingCharacters(in: .whitespacesAndNewlines),
        account: account.trimmingCharacters(in: .whitespacesAndNewlines),
        date: date,
        isInflow: isInflow
      )
    }
  }

  static func read(
    text: String,
    configuration: CaptureAIConfiguration,
    accounts: [Account],
    categoryGroups: [CategoryGroup],
    payees: [Payee],
    guidance: String?,
    client: CaptureAIClient = CaptureAIClient()
  ) async throws -> [SlipMappedDraft] {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      return []
    }
    let request = try prompt(text: trimmed, accounts: accounts, categoryGroups: categoryGroups, guidance: guidance)
    let answer = try await client.send(request, configuration: configuration, conversationID: UUID())
    return SlipReaderMapping.map(
      try decode(Data(answer.utf8)),
      sentence: trimmed,
      accounts: accounts,
      categoryGroups: categoryGroups,
      payees: payees,
      calendar: .current,
      now: .now
    )
  }
}
