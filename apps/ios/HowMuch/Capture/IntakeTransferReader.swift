import Foundation

/// Reads a bank's "Scheduled transfers" (or similar) screen as transfers between
/// the owner's own accounts. The model and the line parser take the subtitle of
/// each card ("Citibank Credit Cards") as the payee and never reach the account
/// the money goes to, so a screen like this is read here first, from its text.
///
/// A row is an amount line ("669.54 SGD"). Its destination is the tracked account
/// whose name words all appear on a line above it, back to the previous amount; its
/// date is the "Oct" / "16" tile in the same block, in the year of the month header
/// ("OCTOBER 2026") or this year. Rows are read only when the screen says it lists
/// transfers or the owner's note does, and only when at least one row names a
/// tracked account; otherwise the result is empty and the other readers run.
enum IntakeTransferReader {
  /// How far above an amount its account name and date tile can be.
  private static let window = 7

  static func read(
    text: String,
    note: String?,
    accounts: [Account],
    payees: [Payee],
    calendar: Calendar = .current,
    now: Date = .now
  ) -> [SlipMappedDraft] {
    let lines = text.components(separatedBy: .newlines)
      .map { $0.trimmingCharacters(in: .whitespaces) }
      .filter { !$0.isEmpty }
    guard looksLikeTransfers(lines: lines, note: note), !hasSourceAndDestination(lines),
          !hasUnreadAmount(lines) else {
      return []
    }
    let open = accounts.filter { !$0.closed && !$0.deleted }
    var extractions: [SlipReaderMapping.Extraction] = []
    var destinations: [Account?] = []
    var year = calendar.component(.year, from: now)
    var previousAmount = -1
    for (index, line) in lines.enumerated() {
      if let header = monthHeaderYear(line) {
        year = header
        continue
      }
      guard let amount = amount(in: line) else {
        continue
      }
      let block = lines[max(previousAmount + 1, index - window)..<index]
      previousAmount = index
      guard case .some(let found) = destinationResult(in: block, accounts: open) else {
        // Two tracked accounts printed in one block: which is the destination is a guess.
        return []
      }
      let account = found
      let payee = account?.name ?? title(in: block) ?? ""
      extractions.append(SlipReaderMapping.Extraction(
        amount: amount,
        payee: payee,
        date: date(in: block, year: year) ?? "",
        direction: "outflow"
      ))
      destinations.append(account)
    }
    guard destinations.contains(where: { $0 != nil }) else {
      return []
    }
    var rows = SlipReaderMapping.map(
      extractions, accounts: accounts, categoryGroups: [], payees: payees, calendar: calendar, now: now
    )
    // The extractions are never blank (each has an amount), so rows line up with destinations.
    guard rows.count == destinations.count else {
      return []
    }
    for index in rows.indices {
      guard let account = destinations[index],
            let payee = payees.first(where: { $0.transferAccountId == account.id && $0.deleted != true }) else {
        continue
      }
      rows[index].draft.payeeID = payee.id
      rows[index].draft.payeeName = payee.name
      rows[index].draft.transferAccountID = account.id
      rows[index].draft.categoryID = nil
    }
    return rows
  }

  private static func looksLikeTransfers(lines: [String], note: String?) -> Bool {
    if note?.range(of: "transfer", options: .caseInsensitive) != nil {
      return true
    }
    return lines.prefix(8).contains { $0.range(of: "transfers?\\b", options: [.regularExpression, .caseInsensitive]) != nil }
  }

  private static let amountLine = try! NSRegularExpression(
    pattern: #"^(?:S\$|\$|SGD)?\s*((?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})\s*(?:SGD)?$"#, options: [.caseInsensitive]
  )
  /// Any money-looking figure on a line. A line with one that `amountLine` does not
  /// accept is a row this reader cannot place.
  private static let moneyFigure = try! NSRegularExpression(pattern: #"\d[\d,]*\.\d{2}\b"#)
  /// "From" / "To" labels: a receipt names a source and a destination, not just a destination.
  private static let directionLabel = try! NSRegularExpression(
    pattern: #"^(?:from|to)(?:\s+account)?:?$"#, options: [.caseInsensitive]
  )

  private static func hasSourceAndDestination(_ lines: [String]) -> Bool {
    lines.contains { directionLabel.firstMatch(in: $0, options: [], range: NSRange($0.startIndex..., in: $0)) != nil }
  }

  private static func hasUnreadAmount(_ lines: [String]) -> Bool {
    lines.contains { line in
      amount(in: line) == nil
        && moneyFigure.firstMatch(in: line, options: [], range: NSRange(line.startIndex..., in: line)) != nil
    }
  }

  private static func amount(in line: String) -> String? {
    let range = NSRange(line.startIndex..., in: line)
    guard let match = amountLine.firstMatch(in: line, options: [], range: range),
          let found = Range(match.range(at: 1), in: line) else {
      return nil
    }
    return line[found].replacingOccurrences(of: ",", with: "")
  }

  private static let months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

  private static let monthNames = [
    "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  ]

  /// "Oct", "Sept" or "October" (and nothing that merely starts like a month).
  private static func monthIndex(_ word: String) -> Int? {
    let lower = word.lowercased()
    if let index = monthNames.firstIndex(of: lower) ?? months.firstIndex(of: lower) ?? (lower == "sept" ? 8 : nil) {
      return index + 1
    }
    return nil
  }

  /// "OCTOBER 2026": the year the dates below it are in.
  private static func monthHeaderYear(_ line: String) -> Int? {
    let words = line.split(separator: " ")
    guard words.count == 2, monthIndex(String(words[0])) != nil, words[1].count == 4 else {
      return nil
    }
    return Int(words[1])
  }

  private static func tokens(_ text: String) -> [String] {
    text.lowercased().split { !$0.isLetter && !$0.isNumber }.map(String.init)
  }

  /// The tracked account the block names: `.some(nil)` when none, `nil` when two
  /// different accounts are named by different lines (or tie on one) so that the
  /// destination cannot be told.
  private static func destinationResult(in block: ArraySlice<String>, accounts: [Account]) -> Account?? {
    var named: [Account] = []
    for line in block {
      let lineWords = Set(tokens(line))
      let matching = accounts.compactMap { account -> (Account, Int)? in
        let words = Set(tokens(account.name))
        return !words.isEmpty && words.isSubset(of: lineWords) ? (account, words.count) : nil
      }
      guard let most = matching.map(\.1).max() else {
        continue
      }
      let best = matching.filter { $0.1 == most }.map(\.0)
      guard best.count == 1 else {
        return nil
      }
      // A line that also names an account the winner does not contain ("UOB One
      // Savings to Citi Rewards") prints a source and a destination together.
      let winnerWords = Set(tokens(best[0].name))
      guard matching.allSatisfy({ Set(tokens($0.0.name)).isSubset(of: winnerWords) }) else {
        return nil
      }
      if !named.contains(where: { $0.id == best[0].id }) {
        named.append(best[0])
      }
    }
    switch named.count {
    case 0: return .some(nil)
    case 1: return .some(named[0])
    default: return nil
    }
  }

  /// The first line that is neither a date tile nor a number: the row's title.
  private static func title(in block: ArraySlice<String>) -> String? {
    block.first { line in
      monthIndex(line) == nil && Int(line) == nil && line.contains { $0.isLetter }
    }
  }

  /// The date tile ("Oct" over "16", "Oct 16" or "16 Oct") as yyyy-MM-dd.
  private static func date(in block: ArraySlice<String>, year: Int) -> String? {
    let lines = Array(block)
    for (index, line) in lines.enumerated() {
      let words = line.split(separator: " ").map(String.init)
      var month: Int?
      var day: Int?
      if words.count == 1, let found = monthIndex(words[0]), index + 1 < lines.count, let next = Int(lines[index + 1]) {
        month = found
        day = next
      } else if words.count == 2, let found = monthIndex(words[0]), let value = Int(words[1]) {
        month = found
        day = value
      } else if words.count == 2, let value = Int(words[0]), let found = monthIndex(words[1]) {
        month = found
        day = value
      }
      if let month, let day, (1...31).contains(day) {
        return String(format: "%04d-%02d-%02d", year, month, day)
      }
    }
    return nil
  }
}
