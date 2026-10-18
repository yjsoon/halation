import SwiftUI

struct EditAccountSheet: View {
  @Environment(AppModel.self) private var model
  @Environment(\.dismiss) private var dismiss
  let account: Account
  @State private var name: String
  @State private var classification: AccountClassification
  @State private var icon: AccountIconChoice
  @State private var error: String?
  @State private var isSaving = false
  @State private var isEditingReminders = false
  @FocusState private var nameFocused: Bool

  init(account: Account) {
    self.account = account
    _name = State(initialValue: account.name)
    _classification = State(initialValue: AccountClassification(type: account.type))
    _icon = State(initialValue: AccountIconChoice(stored: account.icon, type: account.type))
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          AccountIdentityFields(
            name: $name,
            classification: $classification,
            icon: $icon,
            nameFocus: $nameFocused
          )
          .disabled(isSaving)
          ForEach(typeNotes, id: \.self) { note in
            Text(note)
              .font(.footnote)
              .foregroundStyle(.secondary)
          }
          if let error {
            Text(error)
              .font(.footnote)
              .foregroundStyle(Theme.outflow)
          }
          if AccountKind(rawValue: account.type)?.isCredit == true {
            Button {
              isEditingReminders = true
            } label: {
              HStack(spacing: 12) {
                Image(systemName: "bell")
                  .foregroundStyle(Theme.accent)
                  .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                  Text("Payment reminders")
                    .font(.body)
                    .foregroundStyle(Theme.textPrimary)
                  Text(reminderSummary)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                  .font(.footnote.weight(.semibold))
                  .foregroundStyle(.tertiary)
                  .accessibilityHidden(true)
              }
              .padding(.horizontal, Theme.FormRow.horizontalPadding)
              .padding(.vertical, Theme.FormRow.verticalPadding)
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .ynabCard()
            .disabled(isSaving)
            .accessibilityIdentifier("edit-account-payment-reminders")
          }
        }
        .padding(16)
      }
      .background(Theme.canvas)
      .navigationTitle("Edit Account")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        AccountSheetToolbar(isSaving: isSaving, canSave: canSave, cancel: { dismiss() }, save: save)
      }
      .interactiveDismissDisabled(isSaving)
      .sheet(isPresented: $isEditingReminders) {
        CardPaymentTermsSheet(account: account, existing: model.cardPayments.terms(for: account.id))
      }
    }
  }

  private var reminderSummary: String {
    guard let terms = model.cardPayments.terms(for: account.id) else {
      return "Statement and due dates, and reminders before the due date"
    }
    guard terms.enabled else {
      return "Off"
    }
    let next = CardCycleMaths.upcoming(
      statementDay: terms.statementDay,
      gapDays: terms.dueGapDays,
      rule: terms.dueWeekendRule,
      today: Date.now.isoDateString
    )
    return "Next due \(CardPaymentFormat.weekdayDay(next.due))"
  }

  private var trimmedName: String {
    name.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private var canSave: Bool {
    !trimmedName.isEmpty
  }

  private var identity: AccountIdentity {
    AccountIdentity(
      name: trimmedName,
      classification: classification,
      icon: icon.resolved(default: classification.defaultIcon)
    )
  }

  private var typeNotes: [String] {
    switch classification {
    case .imported:
      return [
        "Imported as \(classification.title). Choose a type to classify it. Balances do not change.",
      ]
    case .kind(let kind):
      var notes: [String] = []
      if AccountKind(rawValue: account.type) == nil {
        notes.append("Replaces the imported type “\(account.type)”. Balances do not change.")
      }
      if kind.onBudget != account.onBudget {
        let origin = account.onBudget ? "Budget" : "Tracking"
        let destination = kind.onBudget ? "Budget" : "Tracking"
        notes.append("Moves the account from \(origin) to \(destination). Balances do not change.")
      }
      return notes
    }
  }

  private func save() async {
    guard canSave else { return }
    isSaving = true
    error = nil
    do {
      try await model.updateAccount(identity, for: account.id)
      dismiss()
    } catch {
      self.error = error.localizedDescription
      isSaving = false
    }
  }
}
