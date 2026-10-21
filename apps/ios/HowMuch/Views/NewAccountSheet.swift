import SwiftUI

struct NewAccountSheet: View {
  /// Called with the saved account, before the sheet dismisses itself.
  var onCreated: ((Account) -> Void)? = nil
  @Environment(AppModel.self) private var model
  @Environment(\.dismiss) private var dismiss
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @State private var name = ""
  @State private var kind = AccountKind.checking
  @State private var balanceText = ""
  @State private var icon = AccountIconChoice.followsType
  @State private var error: String?
  @State private var isSaving = false
  @FocusState private var nameFocused: Bool
  @FocusState private var balanceFocused: Bool

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          AccountIdentityFields(
            name: $name,
            kind: $kind,
            icon: $icon,
            nameFocus: $nameFocused,
            onSubmitName: { balanceFocused = true }
          )
          .disabled(isSaving)
          balanceCard
          if let error {
            Text(error)
              .font(.footnote)
              .foregroundStyle(Theme.outflow)
          }
        }
        .padding(16)
      }
      .background(Theme.canvas)
      .scrollDismissesKeyboard(.interactively)
      .navigationTitle("New Account")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        AccountSheetToolbar(isSaving: isSaving, canSave: canSave, cancel: { dismiss() }, save: save)
        ToolbarItemGroup(placement: .keyboard) {
          Spacer()
          Button("Done") {
            nameFocused = false
            balanceFocused = false
          }
        }
      }
      .interactiveDismissDisabled(isSaving)
      .task {
        await Task.yield()
        nameFocused = true
      }
    }
  }

  private var balanceCard: some View {
    VStack(alignment: .leading, spacing: 6) {
      Group {
        if dynamicTypeSize.isAccessibilitySize {
          VStack(alignment: .leading, spacing: 6) {
            Text(balanceLabel)
              .foregroundStyle(Theme.textPrimary)
            balanceField
          }
        } else {
          HStack {
            Text(balanceLabel)
              .foregroundStyle(Theme.textPrimary)
            balanceField
              .multilineTextAlignment(.trailing)
          }
        }
      }
      if let listedBalancePreview {
        Text(listedBalancePreview.text)
          .font(.footnote)
          .foregroundStyle(listedBalancePreview.colour)
      } else {
        Text(balanceHint)
          .font(.footnote)
          .foregroundStyle(enteredBalance == nil ? Theme.outflow : Color.secondary)
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 13)
    .ynabCard()
  }

  private var balanceField: some View {
    TextField("0.00", text: $balanceText)
      .keyboardType(kind.storesLiability ? .decimalPad : .numbersAndPunctuation)
      .focused($balanceFocused)
      .disabled(isSaving)
      .accessibilityLabel(balanceLabel)
  }

  private var trimmedName: String {
    name.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private var enteredBalance: Int? {
    let trimmed = balanceText.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty {
      return 0
    }
    return MoneyCodec.milliunits(fromTyped: trimmed, decimalDigits: model.currencyFormat?.decimalDigits)
  }

  private var canSave: Bool {
    !trimmedName.isEmpty && enteredBalance != nil && !isSaving
  }

  private var balanceLabel: String {
    kind.storesLiability ? "Amount owed" : "Current balance"
  }

  private var balanceHint: String {
    if enteredBalance == nil {
      return "Enter a valid amount."
    }
    if kind.storesLiability {
      return "Enter what you currently owe."
    }
    return "Today’s balance. Use a minus if you’re overdrawn."
  }

  private var listedBalancePreview: (text: String, colour: Color)? {
    guard let entered = enteredBalance else {
      return nil
    }
    let listed = kind.openingBalanceMilliunits(fromEntered: entered)
    guard listed != 0 else {
      return nil
    }
    let amount = MoneyCodec.signedDisplayString(for: listed, currencyFormat: model.currencyFormat)
    if kind.storesLiability {
      return ("Listed as \(amount) on Accounts.", Theme.amountColour(listed))
    }
    return nil
  }

  private func save() async {
    guard let enteredBalance, canSave else { return }
    nameFocused = false
    balanceFocused = false
    isSaving = true
    error = nil
    do {
      let created = try await model.createAccount(
        name: trimmedName,
        kind: kind,
        enteredBalance: enteredBalance,
        icon: icon.resolved(default: kind.defaultIcon)
      )
      onCreated?(created)
      dismiss()
    } catch {
      self.error = error.localizedDescription
      isSaving = false
    }
  }
}

/// Stands in for a transaction form when the plan has no open account: the
/// form's account picker would be empty and Save could never enable.
struct AddAccountFirstView<Actions: View>: View {
  var description = "Every transaction belongs to an account. Add one to start recording."
  let onCreated: (Account) -> Void
  @ViewBuilder var actions: Actions
  @State private var isAddingAccount = false
  @State private var created: Account?

  var body: some View {
    ContentUnavailableView {
      Label("Add an Account First", systemImage: "building.columns")
    } description: {
      Text(description)
    } actions: {
      Button("New Account") { isAddingAccount = true }
        .buttonStyle(.borderedProminent)
        .tint(Theme.accent)
      actions
    }
    // Hand the account over once the sheet has gone: the caller usually
    // replaces this view, which would otherwise tear the sheet away mid-save.
    .sheet(isPresented: $isAddingAccount, onDismiss: {
      if let account = created {
        created = nil
        onCreated(account)
      }
    }) {
      NewAccountSheet(onCreated: { created = $0 })
        .blocksCapturePresentation()
    }
  }
}

extension AddAccountFirstView where Actions == EmptyView {
  init(onCreated: @escaping (Account) -> Void) {
    self.onCreated = onCreated
    self.actions = EmptyView()
  }
}
