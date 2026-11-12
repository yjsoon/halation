import SwiftUI

/// What a payee picker hands back. Callers apply it to their own draft; the
/// picker dismisses itself afterwards.
enum PayeePick {
  case noPayee
  case newPayee(String)
  case payee(Payee)
  case transfer(Account)
}

/// The payee picker for every transaction, split line and schedule editor.
/// Surfaces differ only in which rows they offer: "No Payee" where the field
/// may be cleared, "Create payee" where the draft carries a free-text name,
/// Recent where it speeds up everyday entry, Transfers wherever the draft may
/// be a transfer.
struct PayeePicker: View {
  @Environment(AppModel.self) private var model
  @Environment(\.dismiss) private var dismiss
  let selectedPayeeID: String?
  let selectedTransferAccountID: String?
  /// The draft's own account, which cannot be its transfer target.
  let accountID: String
  /// Whether "No Payee" is offered, and whether it is the current choice.
  var noPayeeSelected: Bool?
  var allowsCreate = true
  var showsRecents = false
  var showsTransfers = true
  /// How a transfer row names its account; each surface keeps its own wording.
  var transferTitle: (Account) -> String = { $0.name }
  let onPick: (PayeePick) -> Void
  @State private var searchText = ""
  /// Typing is the primary gesture here, so the field takes focus on arrival.
  /// It is an ordinary inline field, not system search: `.searchable` with
  /// `isPresented` presents a UISearchController as the picker arrives, and a
  /// payee tapped while that presentation is in flight either did nothing or
  /// popped the picker and left its search stranded over the form.
  @FocusState private var isSearchFocused: Bool

  var body: some View {
    let query = trimmedSearch
    let recents = showsRecents ? recentPayees(query: query) : []
    let payees = filteredPayees(query: query)
    let transferAccounts = showsTransfers ? filteredTransferAccounts(query: query) : []
    List {
      if query.isEmpty, let noPayeeSelected {
        Button {
          pick(.noPayee)
        } label: {
          PickerCheckRow(title: "No Payee", isSelected: noPayeeSelected, isSecondary: true)
        }
      }

      if allowsCreate, !query.isEmpty, !hasExactMatch(query) {
        Button {
          pick(.newPayee(query))
        } label: {
          Label("Create payee “\(query)”", systemImage: "plus.circle.fill")
            .foregroundStyle(Theme.accent)
        }
      }

      if !recents.isEmpty {
        Section("Recent") {
          ForEach(recents) { payee in
            payeeRow(payee)
          }
        }
      }

      if !payees.isEmpty {
        Section("Payees") {
          ForEach(payees) { payee in
            payeeRow(payee)
          }
        }
      }

      if !transferAccounts.isEmpty {
        Section("Transfers") {
          ForEach(transferAccounts) { account in
            Button {
              pick(.transfer(account))
            } label: {
              PickerCheckRow(title: transferTitle(account), isSelected: account.id == selectedTransferAccountID)
            }
          }
        }
      }
    }
    .listStyle(.insetGrouped)
    .scrollContentBackground(.hidden)
    .background(Theme.canvas)
    .safeAreaInset(edge: .top, spacing: 0) {
      PickerSearchField(
        prompt: allowsCreate ? "Search or add a payee" : "Search payees",
        text: $searchText,
        isFocused: $isSearchFocused
      )
    }
    .navigationTitle("Payee")
    .navigationBarTitleDisplayMode(.inline)
    .onAppear {
      isSearchFocused = true
    }
  }

  /// The payees most recently used in the ledger — most expenses repeat, so
  /// the last few merchants outrank the alphabet. Hidden while searching.
  private func recentPayees(query: String) -> [Payee] {
    guard query.isEmpty else {
      return []
    }
    let payeesByID = Dictionary(model.payees.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    var seen = Set<String>()
    var recents: [Payee] = []
    for transaction in model.transactions {
      guard
        let payeeID = transaction.payeeID,
        seen.insert(payeeID).inserted,
        let payee = payeesByID[payeeID],
        !payee.isTransferPayee
      else {
        continue
      }
      recents.append(payee)
      if recents.count == 6 {
        break
      }
    }
    return recents
  }

  private func payeeRow(_ payee: Payee) -> some View {
    Button {
      pick(.payee(payee))
    } label: {
      PickerCheckRow(
        title: payee.name,
        isSelected: selectedTransferAccountID == nil && payee.id == selectedPayeeID
      )
    }
  }

  private var trimmedSearch: String {
    searchText.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private func filteredPayees(query: String) -> [Payee] {
    model.payeesSortedByName.filter { payee in
      !payee.isTransferPayee && (query.isEmpty || payee.name.localizedStandardContains(query))
    }
  }

  /// Other open accounts; picking one records a transfer and the API creates
  /// the mirrored side (YNAB behaviour).
  private func filteredTransferAccounts(query: String) -> [Account] {
    model.openAccounts
      .filter { $0.id != accountID && (query.isEmpty || transferTitle($0).localizedStandardContains(query)) }
      .sorted { transferTitle($0).localizedCaseInsensitiveCompare(transferTitle($1)) == .orderedAscending }
  }

  private func hasExactMatch(_ query: String) -> Bool {
    model.payees.contains { $0.name.localizedCaseInsensitiveCompare(query) == .orderedSame }
  }

  private func pick(_ choice: PayeePick) {
    onPick(choice)
    dismiss()
  }
}

/// The category picker for every transaction, split line and schedule editor.
/// `onPick` receives nil for "No Category".
struct CategoryPicker: View {
  @Environment(AppModel.self) private var model
  @Environment(\.dismiss) private var dismiss
  let selectedCategoryID: String?
  let onPick: (Category?) -> Void
  @State private var searchText = ""

  var body: some View {
    CategorisedPickerList(
      groups: visibleGroups,
      groupTitle: { $0.name },
      items: { $0.categories.filter(categoryMatches) },
      itemTitle: { $0.name },
      isSelected: { $0.id == selectedCategoryID },
      searchText: $searchText,
      searchPrompt: "Search categories",
      title: "Category",
      presentsSearchOnAppear: true
    ) { category in
      onPick(category)
      dismiss()
    } header: {
      if trimmedSearch.isEmpty {
        Button {
          onPick(nil)
          dismiss()
        } label: {
          PickerCheckRow(title: "No Category", isSelected: selectedCategoryID == nil, isSecondary: true)
        }
      }
    }
  }

  private var trimmedSearch: String {
    searchText.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private func categoryMatches(_ category: Category) -> Bool {
    !category.deleted && (trimmedSearch.isEmpty || category.name.localizedStandardContains(trimmedSearch))
  }

  /// Everyday groups first, bookkeeping groups demoted to the bottom.
  private var visibleGroups: [CategoryGroup] {
    let live = model.categoryGroups.filter { group in
      !group.deleted && group.categories.contains(where: categoryMatches)
    }
    return live.filter { !$0.isQuiet } + live.filter(\.isQuiet)
  }
}

struct AccountPickerView: View {
  @Environment(AppModel.self) private var model
  @Environment(\.dismiss) private var dismiss
  let selectedAccountID: String
  var disabledAccountIDs: Set<String> = []
  let onSelect: (Account) -> Void
  @State private var searchText = ""
  // Latched on first appearance: creating an account fills `model.accounts`
  // before the sheet hands it back, and switching on the live list would tear
  // that sheet away before the new account could be selected.
  @State private var needsFirstAccount: Bool?
  @State private var isCreatingAccount = false

  /// Only a loaded reference may say the plan has no account; after a failed
  /// load the list is empty for another reason.
  private var lacksAccount: Bool {
    CaptureAdmissionGate.needsAccount(referencePhase: model.referencePhase, accounts: model.accounts)
  }

  var body: some View {
    Group {
      if needsFirstAccount ?? lacksAccount {
        // An empty list here left Save disabled with no way forward.
        AddAccountFirstView(
          onCreated: { account in
            onSelect(account)
            dismiss()
          },
          onAddingChanged: { isCreatingAccount = $0 }
        ) {
          EmptyView()
        }
        .background(Theme.canvas)
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.inline)
      } else {
        picker
      }
    }
    .onAppear {
      if needsFirstAccount == nil {
        needsFirstAccount = lacksAccount
      }
    }
    // Accounts that arrive from a refresh release the prompt; the prompt's own
    // sheet hands its account over through onCreated instead.
    .onChange(of: CaptureAdmissionGate.hasUsableAccount(model.accounts)) { _, usable in
      if usable, !isCreatingAccount {
        needsFirstAccount = false
      }
    }
  }

  @ViewBuilder
  private var picker: some View {
    let groups = model.accountListGroups(includeClosed: false, includeEmptyCustomGroups: false)
    let visibleGroups = groups.compactMap { $0.matching(searchText) }
    // Inspect all groups, not just search matches: usage sorting still needs
    // its refresh when a search hides the group that uses it.
    let usesMostUsedSort = groups.contains { model.sortForAccountGroup($0.id) == .mostUsedLast30Days }
    CategorisedPickerList(
      groups: visibleGroups,
      groupTitle: { $0.title },
      items: { $0.accounts },
      itemTitle: { $0.name },
      isSelected: { $0.id == selectedAccountID },
      isEnabled: { !disabledAccountIDs.contains($0.id) },
      searchText: $searchText,
      searchPrompt: "Search accounts",
      title: "Account",
      onSelect: { account in
        onSelect(account)
        dismiss()
      }
    )
    .task(id: "\(usesMostUsedSort)-\(model.accountUsageGeneration)") {
      guard usesMostUsedSort, model.accountUsagePhase != .loaded else {
        return
      }
      await model.refreshAccountUsageLast30Days()
    }
  }
}

/// Inline search field pinned above a picker list: magnifying glass, rounded
/// field and a clear button, as the HIG describes for a search field. Unlike
/// `.searchable`, focusing it presents nothing, so a row tapped while the
/// picker is still arriving cannot race a search presentation.
struct PickerSearchField: View {
  let prompt: String
  @Binding var text: String
  var isFocused: FocusState<Bool>.Binding

  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: "magnifyingglass")
        .foregroundStyle(.secondary)
        .accessibilityHidden(true)
      TextField(prompt, text: $text)
        .focused(isFocused)
        .submitLabel(.search)
        .foregroundStyle(Theme.textPrimary)
        .accessibilityAddTraits(.isSearchField)
      if !text.isEmpty {
        Button {
          text = ""
        } label: {
          Image(systemName: "xmark.circle.fill")
            .foregroundStyle(.secondary)
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Clear text")
      }
    }
    .padding(.leading, 14)
    .padding(.trailing, text.isEmpty ? 14 : 0)
    .frame(minHeight: 44)
    .background(Theme.surfaceMuted, in: Capsule())
    .padding(.horizontal, 16)
    .padding(.vertical, 8)
    .background(Theme.canvas)
  }
}

/// Checkmark row shared by the searchable grouped pickers.
struct PickerCheckRow: View {
  let title: String
  var isSelected: Bool
  var isSecondary: Bool = false

  var body: some View {
    HStack {
      Text(title)
        .foregroundStyle(isSecondary ? Color.secondary : Theme.textPrimary)
      Spacer()
      if isSelected {
        Image(systemName: "checkmark")
          .foregroundStyle(Theme.accent)
      }
    }
  }
}

/// Sectioned searchable list used by category and account pickers.
struct CategorisedPickerList<Group: Identifiable, Item: Identifiable, Header: View>: View {
  let groups: [Group]
  let groupTitle: (Group) -> String
  let items: (Group) -> [Item]
  let itemTitle: (Item) -> String
  let isSelected: (Item) -> Bool
  var isEnabled: (Item) -> Bool = { _ in true }
  @Binding var searchText: String
  var searchPrompt: String
  var title: String
  let onSelect: (Item) -> Void
  let header: () -> Header
  let presentsSearchOnAppear: Bool
  @FocusState private var isSearchFocused: Bool

  init(
    groups: [Group],
    groupTitle: @escaping (Group) -> String,
    items: @escaping (Group) -> [Item],
    itemTitle: @escaping (Item) -> String,
    isSelected: @escaping (Item) -> Bool,
    isEnabled: @escaping (Item) -> Bool = { _ in true },
    searchText: Binding<String>,
    searchPrompt: String,
    title: String,
    presentsSearchOnAppear: Bool = false,
    onSelect: @escaping (Item) -> Void,
    @ViewBuilder header: @escaping () -> Header
  ) {
    self.groups = groups
    self.groupTitle = groupTitle
    self.items = items
    self.itemTitle = itemTitle
    self.isSelected = isSelected
    self.isEnabled = isEnabled
    self._searchText = searchText
    self.searchPrompt = searchPrompt
    self.title = title
    self.onSelect = onSelect
    self.header = header
    self.presentsSearchOnAppear = presentsSearchOnAppear
  }

  var body: some View {
    List {
      header()
      ForEach(groups) { group in
        Section(groupTitle(group)) {
          ForEach(items(group)) { item in
            let enabled = isEnabled(item)
            Button {
              onSelect(item)
            } label: {
              PickerCheckRow(title: itemTitle(item), isSelected: isSelected(item), isSecondary: !enabled)
            }
            .disabled(!enabled)
          }
        }
      }
    }
    .listStyle(.insetGrouped)
    .scrollContentBackground(.hidden)
    .background(Theme.canvas)
    .safeAreaInset(edge: .top, spacing: 0) {
      PickerSearchField(prompt: searchPrompt, text: $searchText, isFocused: $isSearchFocused)
    }
    .navigationTitle(title)
    .navigationBarTitleDisplayMode(.inline)
    .onAppear {
      // Inline focus, not a presented search controller; see PayeePicker.
      if presentsSearchOnAppear {
        isSearchFocused = true
      }
    }
  }
}

extension CategorisedPickerList where Header == EmptyView {
  init(
    groups: [Group],
    groupTitle: @escaping (Group) -> String,
    items: @escaping (Group) -> [Item],
    itemTitle: @escaping (Item) -> String,
    isSelected: @escaping (Item) -> Bool,
    isEnabled: @escaping (Item) -> Bool = { _ in true },
    searchText: Binding<String>,
    searchPrompt: String,
    title: String,
    presentsSearchOnAppear: Bool = false,
    onSelect: @escaping (Item) -> Void
  ) {
    self.init(
      groups: groups,
      groupTitle: groupTitle,
      items: items,
      itemTitle: itemTitle,
      isSelected: isSelected,
      isEnabled: isEnabled,
      searchText: searchText,
      searchPrompt: searchPrompt,
      title: title,
      presentsSearchOnAppear: presentsSearchOnAppear,
      onSelect: onSelect,
      header: { EmptyView() }
    )
  }
}
