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
  @State private var isEditingRewards = false
  /// The account's rewards card once loaded: `.some(nil)` when it has none.
  @State private var rewardsCard: CreditCard??
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
            settingsRow(icon: "bell", title: "Payment reminders", summary: reminderSummary) {
              isEditingReminders = true
            }
            .accessibilityIdentifier("edit-account-payment-reminders")
          }
          if let card = rewardsCard, card != nil || AccountKind(rawValue: account.type)?.isCredit == true {
            settingsRow(
              icon: "creditcard", title: card == nil ? "Set Up Rewards" : "Rewards",
              summary: rewardsSummary(card)
            ) {
              isEditingRewards = true
            }
            .accessibilityIdentifier("edit-account-rewards")
            if card != nil {
              Text("Rules change by reward period. Earlier periods keep their rules.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
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
      .sheet(isPresented: $isEditingRewards, onDismiss: { Task { await loadRewardsCard() } }) {
        RewardCardEditorView(cardID: rewardsCard??.id, accountID: account.id)
      }
      .task { await loadRewardsCard() }
    }
  }

  private func loadRewardsCard() async {
    guard let snapshot = try? await model.apiClient.fetchRewardsTrackerSnapshot(
      planID: model.settings.planID)
    else { return }
    rewardsCard = .some(snapshot.cards.first { $0.ynabAccountId == account.id })
  }

  private func rewardsSummary(_ card: CreditCard?) -> String {
    guard let card else { return "Earning rate, maximum spend and flags" }
    let earlier = card.ruleHistory?.count ?? 0
    return earlier == 0
      ? "Earning rate, maximum spend and flags"
      : "Earning rate, maximum spend and flags · Earlier rules (\(earlier))"
  }

  private func settingsRow(
    icon: String, title: String, summary: String, action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      HStack(spacing: 12) {
        Image(systemName: icon)
          .foregroundStyle(Theme.accent)
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 2) {
          Text(title)
            .font(.body)
            .foregroundStyle(Theme.textPrimary)
          Text(summary)
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
