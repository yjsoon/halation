import SwiftUI

/// The one sheet for paying a statement: amount, paying account and pay day.
/// Opened by the first Scheduled tap for a card with no saved choices, by the
/// band, or by a reminder's Open.
struct CardPaymentScheduleSheet: View {
  @Environment(AppModel.self) private var model
  @Environment(\.dismiss) private var dismiss
  let accountID: String
  let statementDate: String

  @State private var amountChoice: CardAmountRule = .statement
  @State private var otherText = ""
  @State private var fundingAccountID = ""
  @State private var payDate = Date.now
  @State private var remember = true
  @State private var error: String?
  @State private var isSaving = false
  @State private var didSeed = false

  private var cycle: CardPaymentCycle? {
    model.effectiveCardPayments.cycle(accountID: accountID, statementDate: statementDate)
  }

  private var terms: CardPaymentTerms? {
    model.cardPayments.terms(for: accountID)
  }

  private var card: Account? {
    model.account(withID: accountID)
  }

  /// Open accounts that can pay a card, cash accounts first.
  private var fundingAccounts: [Account] {
    model.openAccounts
      .filter { $0.id != accountID }
      .sorted { lhs, rhs in
        let left = AccountKind(rawValue: lhs.type)?.isCash == true
        let right = AccountKind(rawValue: rhs.type)?.isCash == true
        if left != right { return left }
        return lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
      }
  }

  var body: some View {
    NavigationStack {
      Group {
        if let cycle {
          form(cycle)
        } else {
          ContentUnavailableView {
            Label("Nothing to pay", systemImage: "creditcard")
          } description: {
            Text("This statement is no longer in Payments due.")
          }
        }
      }
      .background(Theme.canvas)
      .navigationTitle("Schedule payment")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }
            .disabled(isSaving)
        }
      }
      .interactiveDismissDisabled(isSaving)
    }
    .onAppear(perform: seed)
  }

  private func money(_ value: Int) -> String {
    MoneyCodec.displayString(for: value, currencyFormat: model.currencyFormat)
  }

  @ViewBuilder
  private func form(_ cycle: CardPaymentCycle) -> some View {
    Form {
      Section {
        VStack(alignment: .leading, spacing: 4) {
          Text(card?.name ?? "Card")
            .font(.headline)
            .foregroundStyle(Theme.textPrimary)
          Text("Statement \(CardPaymentFormat.day(cycle.statementDate)) · Due \(CardPaymentFormat.weekdayDay(cycle.dueDate))")
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
      }

      Section {
        amountRow(.statement, title: statementTitle(cycle), value: statementAmount(cycle))
        amountRow(.minimum, title: "Minimum", value: cycle.minimumDue)
        amountRow(.fixed, title: "Other", value: nil)
        if amountChoice == .fixed {
          TextField("Amount from your statement", text: $otherText)
            .keyboardType(.decimalPad)
            .monospacedDigit()
            .accessibilityLabel("Other amount")
        }
      } header: {
        Text("Amount")
      } footer: {
        Text("\(money(cycle.statementBalance)) recorded so far. Check your statement for the actual amount, and use Other to enter it.")
      }

      Section {
        Picker("From", selection: $fundingAccountID) {
          if fundingAccountID.isEmpty {
            Text("Choose").tag("")
          }
          ForEach(fundingAccounts) { account in
            Text(account.name).tag(account.id)
          }
        }
      }

      Section {
        DatePicker(
          "Pay on",
          selection: $payDate,
          in: Calendar.current.startOfDay(for: .now)...,
          displayedComponents: .date
        )
      } footer: {
        Text(payDayNote(cycle))
      }

      Section {
        Toggle("Remember for this card", isOn: $remember)
          .tint(Theme.accent)
          .disabled(terms == nil)
      } footer: {
        Text("Next time, Scheduled on the reminder finishes without opening Halation.")
      }

      if let error {
        Section {
          Text(error)
            .font(.footnote)
            .foregroundStyle(Theme.outflow)
        }
      }

      Section {
        Button {
          Task { await markScheduled(cycle) }
        } label: {
          HStack {
            Spacer()
            if isSaving {
              ProgressView()
            } else {
              Text("Mark as scheduled")
                .font(.body.weight(.semibold))
            }
            Spacer()
          }
        }
        .disabled(!canSave || isSaving)
        .accessibilityIdentifier("card-schedule-confirm")
        Button {
          markPaid(cycle)
        } label: {
          HStack {
            Spacer()
            Text("Paid today")
            Spacer()
          }
        }
        .disabled(!canSave || isSaving)
      } footer: {
        Text("Halation records the payment on the day. Set it up in your bank app too.")
      }
    }
  }

  private func amountRow(_ rule: CardAmountRule, title: String, value: Int?) -> some View {
    Button {
      amountChoice = rule
    } label: {
      HStack {
        Image(systemName: amountChoice == rule ? "checkmark.circle.fill" : "circle")
          .foregroundStyle(amountChoice == rule ? Theme.accent : Color.secondary)
          .accessibilityHidden(true)
        Text(title)
          .foregroundStyle(Theme.textPrimary)
        Spacer()
        if let value {
          Text(money(value))
            .monospacedDigit()
            .foregroundStyle(Theme.textPrimary)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(amountChoice == rule ? .isSelected : [])
  }

  /// "Statement balance unknown" when nothing is recorded before the
  /// statement date; the amount then defaults to what is owed now.
  private func statementTitle(_ cycle: CardPaymentCycle) -> String {
    cycle.statementBalance > 0 ? "Statement" : "Statement balance unknown"
  }

  private func statementAmount(_ cycle: CardPaymentCycle) -> Int {
    cycle.statementBalance > 0 ? cycle.statementBalance : max(cycle.currentBalance, 0)
  }

  private func payDayNote(_ cycle: CardPaymentCycle) -> String {
    let days = terms?.payDaysBeforeDue ?? 2
    let words = days == 1 ? "One working day" : "\(Self.numberWord(days)) working days"
    return "\(words) before the due date is the default. FAST to another bank can take up to three working days."
  }

  private static func numberWord(_ value: Int) -> String {
    let words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"]
    return value >= 0 && value < words.count ? words[value] : String(value)
  }

  private var chosenAmount: Int? {
    guard let cycle else { return nil }
    switch amountChoice {
    case .statement:
      let value = statementAmount(cycle)
      return value > 0 ? value : nil
    case .minimum:
      return cycle.minimumDue > 0 ? cycle.minimumDue : nil
    case .fixed:
      guard let value = MoneyCodec.milliunits(fromTyped: otherText), value > 0 else { return nil }
      return value
    }
  }

  private var canSave: Bool {
    chosenAmount != nil && !fundingAccountID.isEmpty && fundingAccountID != accountID
  }

  private func seed() {
    guard !didSeed, let cycle else { return }
    didSeed = true
    if let terms {
      amountChoice = terms.defaultAmountRule
      if terms.defaultAmountRule == .fixed, let fixed = terms.defaultAmountMilli {
        otherText = MoneyCodec.editableString(for: fixed)
      }
      if let funding = terms.defaultFundingAccountID, fundingAccounts.contains(where: { $0.id == funding }) {
        fundingAccountID = funding
      }
    }
    if fundingAccountID.isEmpty, let first = fundingAccounts.first {
      fundingAccountID = first.id
    }
    let suggested = max(cycle.defaultPayDate, Date.now.isoDateString)
    payDate = Date(isoDateString: suggested) ?? .now
    remember = terms.map { !$0.hasPaymentDefaults } ?? false
  }

  private func markScheduled(_ cycle: CardPaymentCycle) async {
    guard let amount = chosenAmount else { return }
    isSaving = true
    error = nil
    do {
      try await model.scheduleCardPayment(
        accountID: accountID,
        statementDate: statementDate,
        amount: amount,
        fundingAccountID: fundingAccountID,
        payDate: payDate.isoDateString
      )
      await rememberIfAsked(cycle, amount: amount)
      dismiss()
    } catch {
      self.error = error.localizedDescription
      isSaving = false
    }
  }

  private func markPaid(_ cycle: CardPaymentCycle) {
    guard let amount = chosenAmount else { return }
    error = nil
    do {
      try model.recordCardPaymentPaid(
        accountID: accountID,
        statementDate: statementDate,
        amount: amount,
        fundingAccountID: fundingAccountID
      )
      isSaving = true
      Task {
        await rememberIfAsked(cycle, amount: amount)
        await CardPaymentNotifier.shared.rebuild(model: model)
        dismiss()
      }
    } catch {
      self.error = error.localizedDescription
    }
  }

  private func rememberIfAsked(_ cycle: CardPaymentCycle, amount: Int) async {
    guard remember, terms != nil else { return }
    do {
      try await model.rememberCardPaymentDefaults(
        accountID: accountID,
        fundingAccountID: fundingAccountID,
        rule: amountChoice,
        fixedAmount: amountChoice == .fixed ? amount : nil,
        payDaysBeforeDue: payDate.isoDateString == max(cycle.defaultPayDate, Date.now.isoDateString)
          ? nil
          : CardCycleMaths.workingDays(from: payDate.isoDateString, to: cycle.dueDate)
      )
    } catch {
      model.showSaveMessage("Couldn’t save these choices for the card: \(error.localizedDescription)", kind: .failure)
    }
  }
}
