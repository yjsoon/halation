import SwiftUI
import UIKit

/// A card's payment terms: statement day, due gap and weekend rule (from a
/// bank preset), the usual paying account and amount, and when to remind.
/// Reached from Edit Account for a credit card or line of credit, from the
/// Payments due band and from Settings.
struct CardPaymentTermsSheet: View {
  @Environment(AppModel.self) private var model
  @Environment(\.dismiss) private var dismiss
  let account: Account

  @State private var terms: CardPaymentTerms
  @State private var preset: CardBankPreset
  @State private var fixedText: String
  @State private var isExisting: Bool
  @State private var error: String?
  @State private var isSaving = false
  @State private var isConfirmingRemoval = false

  init(account: Account, existing: CardPaymentTerms? = nil) {
    self.account = account
    let initial = existing ?? .defaults(accountID: account.id, statementDay: 1)
    _terms = State(initialValue: initial)
    _preset = State(initialValue: existing.map { CardBankPreset.matching(gap: $0.dueGapDays, rule: $0.dueWeekendRule) } ?? .dbs)
    _fixedText = State(initialValue: initial.defaultAmountMilli.map { MoneyCodec.editableString(for: $0) } ?? "")
    _isExisting = State(initialValue: existing != nil)
  }

  private var notifier: CardPaymentNotifier { .shared }

  private var fundingAccounts: [Account] {
    model.openAccounts.filter { $0.id != account.id }
  }

  private var upcoming: (statement: String, due: String) {
    CardCycleMaths.upcoming(
      statementDay: terms.statementDay,
      gapDays: terms.dueGapDays,
      rule: terms.dueWeekendRule,
      today: Date.now.isoDateString
    )
  }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          Toggle("Remind me about this card", isOn: $terms.enabled)
            .tint(Theme.accent)
            .accessibilityIdentifier("card-terms-enabled")
        } footer: {
          Text(account.name)
        }

        Section {
          Picker("Bank", selection: $preset) {
            ForEach(CardBankPreset.allCases) { preset in
              Text(preset.title).tag(preset)
            }
          }
          Picker("Statement day", selection: $terms.statementDay) {
            ForEach(1 ... 31, id: \.self) { day in
              Text(CardPaymentFormat.ordinalDay(day)).tag(day)
            }
          }
          Stepper(value: $terms.dueGapDays, in: 1 ... 60) {
            LabeledContent("Due", value: "\(terms.dueGapDays) days after statement")
          }
          Picker("If due on a weekend", selection: $terms.dueWeekendRule) {
            ForEach(CardDueWeekendRule.allCases) { rule in
              Text(rule.title).tag(rule)
            }
          }
          Text("Next: statement \(CardPaymentFormat.day(upcoming.statement)), due \(CardPaymentFormat.weekdayDay(upcoming.due))")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Theme.textPrimary)
            .accessibilityIdentifier("card-terms-next")
        } header: {
          Text("Statement")
        } footer: {
          Text("Check the dates against your statement. A statement day after the 28th moves to the last day of shorter months.")
        }

        Section {
          Picker("Pay from", selection: $terms.defaultFundingAccountID) {
            Text("Ask each time").tag(String?.none)
            ForEach(fundingAccounts) { funding in
              Text(funding.name).tag(String?.some(funding.id))
            }
          }
          Picker("Usually pay", selection: $terms.defaultAmountRule) {
            ForEach(CardAmountRule.allCases) { rule in
              Text(rule.title).tag(rule)
            }
          }
          if terms.defaultAmountRule == .fixed {
            TextField("Amount", text: $fixedText)
              .keyboardType(.decimalPad)
              .monospacedDigit()
          }
          Stepper(value: $terms.payDaysBeforeDue, in: 0 ... 10) {
            LabeledContent("Pay on", value: payDaysLabel)
          }
        } header: {
          Text("Paying")
        } footer: {
          Text("With an account chosen, Scheduled on a reminder finishes without opening Halation. FAST to another bank can take up to three working days.")
        }

        Section {
          Stepper(value: $terms.leadDays, in: 0 ... 30) {
            LabeledContent("Remind me", value: terms.leadDays == 0 ? "On the due date" : "\(terms.leadDays) days before")
          }
          Picker("At", selection: $terms.deliveryHour) {
            ForEach(0 ..< 24, id: \.self) { hour in
              Text(String(format: "%02d:00", hour)).tag(hour)
            }
          }
        } header: {
          Text("Reminders")
        }

        if notifier.authorisation == .denied {
          Section {
            Button("Reminders are off in Settings. Open Settings") {
              if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
                UIApplication.shared.open(url)
              }
            }
          }
        }

        if let error {
          Section {
            Text(error)
              .font(.footnote)
              .foregroundStyle(Theme.outflow)
          }
        }

        if isExisting {
          Section {
            Button("Remove payment reminders", role: .destructive) {
              isConfirmingRemoval = true
            }
            .disabled(isSaving)
          }
        }
      }
      .navigationTitle("Payment reminders")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }
            .disabled(isSaving)
        }
        ToolbarItem(placement: .confirmationAction) {
          if isSaving {
            ProgressView()
          } else {
            Button("Save") {
              Task { await save() }
            }
            .disabled(!canSave)
          }
        }
      }
      .interactiveDismissDisabled(isSaving)
      .onChange(of: preset) { _, preset in
        if let gap = preset.dueGapDays { terms.dueGapDays = gap }
        if let rule = preset.weekendRule { terms.dueWeekendRule = rule }
      }
      .onChange(of: terms.dueGapDays) { _, _ in syncPreset() }
      .onChange(of: terms.dueWeekendRule) { _, _ in syncPreset() }
      .task {
        await notifier.refreshAuthorisation()
        await loadExisting()
      }
      .binaryConfirm(
        "Remove payment reminders for \(account.name)?",
        isPresented: $isConfirmingRemoval,
        confirm: .destructive("Remove"),
        message: { Text("Scheduled payments already made stay in place.") }
      ) {
        Task { await remove() }
      }
    }
  }

  private var payDaysLabel: String {
    switch terms.payDaysBeforeDue {
    case 0: "On the due date"
    case 1: "1 working day before"
    default: "\(terms.payDaysBeforeDue) working days before"
    }
  }

  private var canSave: Bool {
    !isSaving && (terms.defaultAmountRule != .fixed || fixedAmount != nil)
  }

  private var fixedAmount: Int? {
    guard let value = MoneyCodec.milliunits(fromTyped: fixedText), value > 0 else { return nil }
    return value
  }

  private func syncPreset() {
    let matched = CardBankPreset.matching(gap: terms.dueGapDays, rule: terms.dueWeekendRule)
    if matched != preset, !(preset == .other && matched == .other) {
      preset = matched
    }
  }

  /// The model's copy wins when the sheet was opened without one.
  private func loadExisting() async {
    guard !isExisting else { return }
    if let known = model.cardPayments.terms(for: account.id) {
      apply(known)
    }
  }

  private func apply(_ known: CardPaymentTerms) {
    terms = known
    preset = CardBankPreset.matching(gap: known.dueGapDays, rule: known.dueWeekendRule)
    fixedText = known.defaultAmountMilli.map { MoneyCodec.editableString(for: $0) } ?? ""
    isExisting = true
  }

  private func save() async {
    isSaving = true
    error = nil
    var next = terms
    if let funding = next.defaultFundingAccountID, !fundingAccounts.contains(where: { $0.id == funding }) {
      next.defaultFundingAccountID = nil
    }
    next.defaultAmountMilli = next.defaultAmountRule == .fixed ? fixedAmount : nil
    do {
      try await model.saveCardPaymentTerms(next)
      dismiss()
    } catch {
      self.error = error.localizedDescription
      isSaving = false
    }
  }

  private func remove() async {
    isSaving = true
    error = nil
    do {
      try await model.deleteCardPaymentTerms(accountID: account.id)
      dismiss()
    } catch {
      self.error = error.localizedDescription
      isSaving = false
    }
  }
}
