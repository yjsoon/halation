import SwiftUI
import UIKit

/// "Payments due" on the Accounts overview, between the Inbox band and the
/// account groups. Shown only when at least one card has terms.
struct PaymentsDueBand: View {
  @Environment(AppModel.self) private var model
  var onOpenAccount: (String) -> Void
  @State private var sheet: PaymentsDueSheet?
  @State private var busyCycleID: String?

  private var notifier: CardPaymentNotifier { .shared }

  var body: some View {
    let view = model.effectiveCardPayments
    let rows = Self.rows(view: view, accounts: model.accounts)
    if !view.terms.isEmpty {
      let waiting = rows.filter(\.needsAction).count
      VStack(alignment: .leading, spacing: 10) {
        HStack(spacing: 8) {
          Image(systemName: "creditcard")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Theme.accent)
            .accessibilityHidden(true)
          Text("Payments due")
            .font(.headline)
            .foregroundStyle(Theme.textPrimary)
          if waiting > 0 {
            Text("\(waiting)")
              .font(.caption.weight(.semibold))
              .monospacedDigit()
              .foregroundStyle(Theme.accent)
              .padding(.horizontal, 8)
              .padding(.vertical, 2)
              .background(Theme.accent.opacity(0.14), in: Capsule())
              .accessibilityLabel("\(waiting) to pay")
          }
          Spacer()
        }
        .padding(.horizontal, 4)

        VStack(spacing: 0) {
          if notifier.authorisation == .denied {
            remindersOffRow
            Divider().padding(.leading, 16)
          }
          ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
            if index > 0 {
              Divider().padding(.leading, 16)
            }
            rowView(row)
          }
          Divider().padding(.leading, 16)
          Text("Amounts are what Halation has recorded so far. Check your statement for the actual amount. Record payments as a transfer from your bank account so Halation can tell the statement is paid.")
            .font(.caption)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .ynabCard()
      }
      .accessibilityIdentifier("payments-due-band")
      .sheet(item: $sheet) { sheet in
        Group {
          switch sheet {
          case .schedule(let request):
            CardPaymentScheduleSheet(accountID: request.accountID, statementDate: request.statementDate)
          case .terms(let account):
            CardPaymentTermsSheet(account: account)
          }
        }
        .blocksCapturePresentation()
      }
    }
  }

  private var remindersOffRow: some View {
    HStack(spacing: 8) {
      Image(systemName: "bell.slash")
        .foregroundStyle(Theme.uncategorised)
        .accessibilityHidden(true)
      Text("Reminders are off in Settings.")
        .font(.subheadline)
        .foregroundStyle(Theme.textPrimary)
      Spacer()
      Button("Open Settings") {
        if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
          UIApplication.shared.open(url)
        }
      }
      .font(.subheadline.weight(.semibold))
      .tint(Theme.accent)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
  }

  @ViewBuilder
  private func rowView(_ row: PaymentsDueRow) -> some View {
    let money = { (value: Int) in MoneyCodec.displayString(for: value, currencyFormat: model.currencyFormat) }
    HStack(alignment: .top, spacing: 12) {
      Button {
        onOpenAccount(row.account.id)
      } label: {
        VStack(alignment: .leading, spacing: 4) {
          HStack(alignment: .firstTextBaseline) {
            Text(row.account.name)
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(Theme.textPrimary)
              .lineLimit(1)
            Spacer(minLength: 8)
            if let cycle = row.cycle, cycle.hasAmountDue {
              Text(money(cycle.statementBalance))
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(Theme.textPrimary)
            }
          }
          Text(row.primaryLine(money: money))
            .font(.caption)
            .foregroundStyle(row.isOverdue ? Theme.outflow : Color.secondary)
          if let secondary = row.secondaryLine(money: money) {
            Text(secondary)
              .font(.caption)
              .foregroundStyle(.secondary)
          }
          if let warning = row.previousUnpaidLine(money: money) {
            Label(warning, systemImage: "exclamationmark.triangle.fill")
              .font(.caption)
              .foregroundStyle(Theme.outflow)
              .accessibilityIdentifier("payments-due-previous-unpaid")
          }
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)

      trailing(row)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 10)
    .contextMenu {
      if let cycle = row.cycle, row.needsAction {
        Button {
          sheet = .schedule(CardScheduleRequest(accountID: cycle.accountID, statementDate: cycle.statementDate))
        } label: {
          Label("Schedule payment…", systemImage: "calendar.badge.clock")
        }
      }
      Button {
        sheet = .terms(row.account)
      } label: {
        Label("Payment reminders…", systemImage: "bell")
      }
      Button {
        onOpenAccount(row.account.id)
      } label: {
        Label("Open register", systemImage: "list.bullet.rectangle")
      }
    }
  }

  @ViewBuilder
  private func trailing(_ row: PaymentsDueRow) -> some View {
    if let cycle = row.cycle, row.needsAction {
      Button {
        schedule(cycle)
      } label: {
        if busyCycleID == cycle.id {
          ProgressView()
        } else {
          Text("Schedule")
            .font(.subheadline.weight(.semibold))
        }
      }
      .buttonStyle(.bordered)
      .tint(row.isOverdue ? Theme.outflow : Theme.accent)
      .disabled(busyCycleID != nil)
      .accessibilityLabel("Schedule payment for \(row.account.name)")
    } else if let chip = row.chip {
      Text(chip.label)
        .font(.caption2.weight(.semibold))
        .foregroundStyle(chip.colour)
        .padding(.horizontal, 7)
        .padding(.vertical, 2)
        .background(chip.colour.opacity(0.14), in: Capsule())
    }
  }

  /// Saved choices complete the tap at once, as the reminder's Scheduled
  /// does; otherwise the sheet asks.
  private func schedule(_ cycle: CardPaymentCycle) {
    guard let context = model.cardPaymentContext(accountID: cycle.accountID, statementDate: cycle.statementDate),
          let funding = context.fundingAccountID,
          model.openAccounts.contains(where: { $0.id == funding }),
          let amount = context.defaultAmount else {
      sheet = .schedule(CardScheduleRequest(accountID: cycle.accountID, statementDate: cycle.statementDate))
      return
    }
    busyCycleID = cycle.id
    Task {
      do {
        try await model.scheduleCardPayment(
          accountID: cycle.accountID,
          statementDate: cycle.statementDate,
          amount: amount,
          fundingAccountID: funding,
          payDate: context.suggestedPayDate(today: Date.now.isoDateString)
        )
      } catch {
        model.showSaveMessage(error.localizedDescription, kind: .failure)
      }
      busyCycleID = nil
    }
  }

  /// One row per card with terms: the current cycle while it has something
  /// to say, otherwise the next one. Sorted by due date.
  static func rows(view: CardPaymentsView, accounts: [Account]) -> [PaymentsDueRow] {
    let today = Date.now.isoDateString
    let names = Dictionary(accounts.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
    return view.terms.compactMap { terms -> PaymentsDueRow? in
      guard let account = accounts.first(where: { $0.id == terms.accountID && !$0.closed }) else {
        return nil
      }
      let current = view.cycles.first { $0.accountID == terms.accountID && $0.isCurrent }
      let next = view.cycles.first { $0.accountID == terms.accountID && !$0.isCurrent }
      let cycle: CardPaymentCycle?
      if let current, current.needsPaying || current.previousUnpaid != nil || current.coverage == .settled {
        cycle = current
      } else {
        cycle = next ?? current
      }
      return PaymentsDueRow(account: account, terms: terms, cycle: cycle, today: today, accountNames: names)
    }
    .sorted { ($0.cycle?.dueDate ?? "9999", $0.account.name) < ($1.cycle?.dueDate ?? "9999", $1.account.name) }
  }
}

private enum PaymentsDueSheet: Identifiable {
  case schedule(CardScheduleRequest)
  case terms(Account)

  var id: String {
    switch self {
    case .schedule(let request): "schedule-\(request.id)"
    case .terms(let account): "terms-\(account.id)"
    }
  }
}

struct PaymentsDueRow: Identifiable {
  let account: Account
  let terms: CardPaymentTerms
  let cycle: CardPaymentCycle?
  let today: String
  let accountNames: [String: String]

  var id: String { account.id }

  /// Something owed this cycle and nothing on its way: Schedule shows. A
  /// short payment still shows it.
  var needsAction: Bool {
    guard let cycle, cycle.needsPaying, cycle.statementDate <= today else {
      return false
    }
    return !cycle.coverage.isCovered
  }

  /// Only the server's overdue state counts: a due date that passed before
  /// the card was set up is not overdue.
  var isOverdue: Bool {
    guard let cycle, needsAction else { return false }
    return cycle.coverage.isOverdue
  }

  func primaryLine(money: (Int) -> String) -> String {
    guard let cycle else {
      return "No statement yet"
    }
    if isOverdue {
      let since = "Overdue since \(CardPaymentFormat.day(cycle.coverage.overdueSince ?? cycle.dueDate))"
      let paid = cycle.coverage.paidSoFar
      return paid > 0 ? "\(since) · \(money(paid)) paid" : since
    }
    switch cycle.coverage {
    case .partial(_, _, let paid, _):
      return "\(money(paid)) of \(money(cycle.statementBalance)) paid · due \(CardPaymentFormat.weekdayDay(cycle.dueDate))"
    case .settled:
      return "Nothing owed now"
    case .scheduled(_, let payDate, let amount, let funding), .sending(let payDate, let amount, let funding):
      return "Scheduled · \(money(amount)) from \(fundingName(funding)) on \(CardPaymentFormat.day(payDate))"
    case .posted(_, _, let amount, let date):
      return "Posted · \(money(amount)) on \(CardPaymentFormat.day(date)), not yet approved"
    case .paid(_, let amount, let date):
      return "Paid · \(money(amount)) on \(CardPaymentFormat.day(date))"
    case .unscheduled, .overdue:
      if !cycle.hasAmountDue {
        return "Nothing due · next statement \(CardPaymentFormat.day(cycle.statementDate))"
      }
      if cycle.statementDate > today {
        return "Statement \(CardPaymentFormat.day(cycle.statementDate))"
      }
      if cycle.dueDate < today {
        return "Due \(CardPaymentFormat.day(cycle.dueDate)) (passed)"
      }
      return "Due \(CardPaymentFormat.weekdayDay(cycle.dueDate)) · \(Self.daysLabel(from: today, to: cycle.dueDate))"
    }
  }

  func secondaryLine(money: (Int) -> String) -> String? {
    guard let cycle, cycle.needsPaying else {
      return nil
    }
    if case .settled = cycle.coverage {
      return nil
    }
    if case .partial(_, _, _, let remaining) = cycle.coverage {
      return "\(money(remaining)) left to pay · min \(money(cycle.minimumDue)) · recorded so far"
    }
    if cycle.coverage.isCovered {
      return "Due \(CardPaymentFormat.weekdayDay(cycle.dueDate))"
    }
    return "Statement \(CardPaymentFormat.day(cycle.statementDate)) · min \(money(cycle.minimumDue)) · recorded so far"
  }

  /// A covered or current cycle can still carry an unpaid previous
  /// statement: say so, so a schedule for this one does not hide it.
  func previousUnpaidLine(money: (Int) -> String) -> String? {
    // An overdue row already says so, as on the web.
    guard let cycle, let previous = cycle.previousUnpaid, !cycle.coverage.isOverdue else {
      return nil
    }
    return "Previous statement (\(CardPaymentFormat.day(previous.statementDate))) unpaid: \(money(previous.statementBalance)) was due \(CardPaymentFormat.day(previous.dueDate))"
  }

  struct Chip {
    let label: String
    let colour: Color
  }

  var chip: Chip? {
    guard let cycle else {
      return nil
    }
    if case .settled = cycle.coverage {
      return Chip(label: "Settled", colour: Theme.inflow)
    }
    guard cycle.hasAmountDue else {
      return nil
    }
    switch cycle.coverage {
    case .scheduled: return Chip(label: "Scheduled", colour: Theme.accent)
    case .sending: return Chip(label: "Sending", colour: .secondary)
    case .posted: return Chip(label: "Posted", colour: Theme.uncategorised)
    case .paid: return Chip(label: "Paid", colour: Theme.inflow)
    case .settled: return Chip(label: "Settled", colour: Theme.inflow)
    case .unscheduled, .overdue, .partial: return nil
    }
  }

  private func fundingName(_ id: String) -> String {
    accountNames[id] ?? "your account"
  }

  static func daysLabel(from today: String, to due: String) -> String {
    guard let start = Date(isoDateString: today), let end = Date(isoDateString: due) else {
      return ""
    }
    let days = Calendar(identifier: .gregorian).dateComponents([.day], from: start, to: end).day ?? 0
    switch days {
    case 0: return "today"
    case 1: return "tomorrow"
    default: return "\(days) days"
    }
  }
}
