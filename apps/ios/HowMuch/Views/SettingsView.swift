import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Rewards import and export, and saving the whole current plan as a file:
/// the JSON archive (ledger, formats, account organisation, Rewards cards) or
/// a transactions CSV.
private struct DataSection: View {
  /// False while Settings holds an unsaved server or plan: export reads the
  /// saved connection, so it waits until the selection is saved.
  var isSelectionSaved = true
  @Environment(AppModel.self) private var model
  @State private var exportDocument: ExportFileDocument?
  @State private var exportFormat: ExportEverythingFormat = .archive
  @State private var isExporting = false
  @State private var isWorking = false
  @State private var errorMessage: String?

  var body: some View {
    Section {
      NavigationLink {
        RewardsImportView()
      } label: {
        Label("Rewards import & export", systemImage: "creditcard")
      }
      Button {
        export(.archive)
      } label: {
        Label("Export everything (JSON)", systemImage: "archivebox")
      }
      .disabled(isWorking || !isSelectionSaved)
      Button {
        export(.transactionsCSV)
      } label: {
        Label("Export transactions (CSV)", systemImage: "tablecells")
      }
      .disabled(isWorking || !isSelectionSaved)
      if let errorMessage {
        Text(errorMessage)
          .font(.caption)
          .foregroundStyle(Theme.outflow)
      }
    } header: {
      Text("Data")
    } footer: {
      if isSelectionSaved {
        Text("Rewards import and export moves Rewards Tracker settings as a file and does not connect to YNAB. The JSON export holds every account, transaction, schedule, category and payee, the plan formats, your account organisation and the Rewards cards. The CSV has one row per split line. Passwords and tokens are never included.")
      } else {
        Text("Export uses the saved plan. Try again in a moment.")
      }
    }
    .fileExporter(
      isPresented: $isExporting,
      document: exportDocument,
      contentType: exportFormat == .archive ? .json : .commaSeparatedText,
      defaultFilename: exportFormat == .archive
        ? "halation-export-\(Date.now.isoDateString).json"
        : "halation-transactions-\(Date.now.isoDateString).csv"
    ) { outcome in
      if case .failure(let error) = outcome {
        errorMessage = error.localizedDescription
      }
      exportDocument = nil
    }
  }

  private func export(_ format: ExportEverythingFormat) {
    isWorking = true
    errorMessage = nil
    Task {
      do {
        let data = try await model.apiClient.exportEverything(planID: model.settings.planID, format: format)
        exportFormat = format
        exportDocument = ExportFileDocument(data: data)
        isExporting = true
      } catch {
        errorMessage = error.localizedDescription
      }
      isWorking = false
    }
  }
}

/// The on-device ledger an install used before it connected to a server.
/// It can be saved as a file or used again.
private struct LocalArchiveSection: View {
  let archive: LocalArchive
  @Environment(AppModel.self) private var model
  @State private var exportDocument: ExportFileDocument?
  @State private var isExporting = false
  @State private var isWorking = false
  @State private var isConfirmingSwitch = false
  @State private var errorMessage: String?
  private let device = UIDevice.current.model

  var body: some View {
    Section {
      Button("Export as file") {
        export()
      }
      Button("Switch back to this \(device)’s data") {
        isConfirmingSwitch = true
      }
      if let errorMessage {
        Text(errorMessage)
          .font(.caption)
          .foregroundStyle(Theme.outflow)
      }
    } header: {
      Text("Data from before you connected")
    } footer: {
      Text("Kept on this \(device) since \(archive.archivedAt.formatted(date: .abbreviated, time: .omitted)). Switching back signs you out of the server.")
    }
    .disabled(isWorking)
    .fileExporter(
      isPresented: $isExporting,
      document: exportDocument,
      contentType: .json,
      defaultFilename: "halation-\(device.lowercased())-\(archive.archivedAt.isoDateString).json"
    ) { outcome in
      if case .failure(let error) = outcome {
        errorMessage = error.localizedDescription
      }
      exportDocument = nil
    }
    .binaryConfirm(
      "Use the records on this \(device) instead of the server?",
      isPresented: $isConfirmingSwitch,
      confirm: .proceed("Switch back")
    ) {
      switchBack()
    }
  }

  private func export() {
    isWorking = true
    errorMessage = nil
    Task {
      do {
        exportDocument = ExportFileDocument(data: try await model.exportLocalArchive())
        isExporting = true
      } catch {
        errorMessage = error.localizedDescription
      }
      isWorking = false
    }
  }

  private func switchBack() {
    isWorking = true
    errorMessage = nil
    Task {
      do {
        try await model.switchToLocalArchive()
      } catch {
        errorMessage = error.localizedDescription
      }
      isWorking = false
    }
  }
}

/// The app's settings sheet. Signed in, it lists the account and the settings
/// that apply straight away, with Done. The server, account and plan are a
/// draft edited on the Connection form, which applies them only on Save.
/// Counts sign-in attempts so a result can tell whether it was abandoned
/// (form discarded, sheet closed) while the request was out. A reference type
/// so the answer is still readable after the view has gone.
@MainActor
private final class SignInAttempts {
  private(set) var current = 0

  func start() -> Int {
    current += 1
    return current
  }

  func abandon() {
    current += 1
  }
}

struct SettingsView: View {
  @Environment(AppModel.self) private var model
  @Environment(\.dismiss) private var dismiss
  @State private var draft: APISettings
  /// The settings last handed to `onSave`. Decides whether the sheet opens on
  /// the signed-in list or the Connection form, so editing the draft never
  /// swaps the list out from under the form.
  @State private var saved: APISettings
  @State private var password = ""
  @State private var authenticatedBaseURL: String
  @State private var authenticatedUsername: String
  @State private var isSaving = false
  @State private var testResult: TestResult?
  @State private var isTesting = false
  @State private var setupState: SetupState = .idle
  @State private var planState: PlanState = .idle
  @State private var planRequestID = UUID()
  @State private var isEditingConnection = false
  @State private var isConfirmingSignOut = false
  /// The settings a sign-in on the Connection form returned, exactly as that
  /// server issued them. Later edits to the draft never touch it, so cleanup
  /// only ever sends the session back to the server that issued it.
  @State private var formSession: APISettings?
  @State private var signInAttempts = SignInAttempts()
  private let wasInitiallyAuthenticated: Bool
  /// Read once: an archive appears only when an install connects, which
  /// happens outside this sheet.
  @State private var localArchive: LocalArchive?

  let onSave: @MainActor (APISettings) async -> Void
  private let screenshots: ScreenshotOfferController
  private let device = UIDevice.current.model

  private enum TestResult: Equatable {
    case success
    case failure(String)
  }

  private enum SetupState: Equatable {
    case idle
    case checking
    case ready
    case required
    case failure(String)
  }

  private enum PlanState: Equatable {
    case idle
    case loading
    case loaded([PlanSummary])
    case failure(String)
  }

  init(
    settings: APISettings,
    screenshots: ScreenshotOfferController? = nil,
    onSave: @escaping @MainActor (APISettings) async -> Void
  ) {
    self.onSave = onSave
    self.screenshots = screenshots ?? .shared
    self.draft = settings
    self.saved = settings
    self.authenticatedBaseURL = settings.trimmedBaseURL
    self.authenticatedUsername = settings.username
    self.wasInitiallyAuthenticated = settings.isAuthenticated
    self._localArchive = State(initialValue: settings.isLocal ? nil : LocalArchive.existing())
  }

  private var sessionMatchesDraft: Bool {
    draft.isAuthenticated
      && draft.trimmedBaseURL == authenticatedBaseURL
      && draft.username == authenticatedUsername
  }

  /// Export uses the saved connection, so it is offered only when the draft
  /// still names that server, account and plan.
  private var exportSelectionSaved: Bool {
    draft.trimmedBaseURL == model.settings.trimmedBaseURL
      && draft.username == model.settings.username
      && draft.planID == model.settings.planID
      && model.settings.isAuthenticated
  }

  private var hasValidPlanSelection: Bool {
    guard case .loaded(let plans) = planState else {
      return false
    }
    return plans.contains { $0.id == draft.planID }
  }

  private var serverHost: String {
    URL(string: draft.trimmedBaseURL)?.host() ?? draft.trimmedBaseURL
  }

  var body: some View {
    NavigationStack {
      Group {
        if draft.isLocal {
          localBody
        } else if saved.isAuthenticated {
          signedInBody
        } else {
          connectionForm
        }
      }
      .navigationDestination(isPresented: $isEditingConnection) {
        connectionForm
      }
    }
    .task {
      guard !draft.isLocal else { return }
      checkSetupStatus()
      if sessionMatchesDraft {
        loadPlans()
      }
    }
    .onChange(of: draft.baseURLString) {
      setupState = .idle
      testResult = nil
      planState = .idle
      planRequestID = UUID()
      // Discarding Connection edits can restore the signed-in server.
      if !isTesting && sessionMatchesDraft {
        loadPlans()
      }
    }
    .onChange(of: draft.username) {
      testResult = nil
      planState = .idle
      planRequestID = UUID()
      if !isTesting && sessionMatchesDraft {
        loadPlans()
      }
    }
    .onDisappear {
      signInAttempts.abandon()
    }
    .onChange(of: draft.planID) {
      applyPlanChoice()
    }
    .onChange(of: isEditingConnection) { _, isEditing in
      if !isEditing && !isSaving {
        discardConnectionEdits()
      }
    }
  }

  // MARK: Shared sections

  private var assistantSection: some View {
    Section {
      NavigationLink {
        CaptureAISettingsView(settings: model.captureAI)
          .onDisappear { model.publishShareContext() }
      } label: {
        LabeledContent {
          Text(model.captureAI.displayName)
        } label: {
          Label("AI provider", systemImage: "sparkles")
        }
      }
      NavigationLink {
        SkillAndMemoryView()
      } label: {
        Label("Skill & Memory", systemImage: "text.book.closed")
      }
    } header: {
      Text("Assistant")
    }
  }

  private static let clipboardImagesFooter = "Offers only the image currently on your clipboard. iOS may ask for paste permission. Images are checked on this device, and your Photos library is never read."

  private var captureSection: some View {
    Section {
      Toggle(isOn: Binding(
        get: { screenshots.isEnabled },
        set: { next in
          screenshots.applyEnabledPreference(next)
          Task { await screenshots.refresh() }
        }
      )) {
        Label("Offer clipboard images", systemImage: "doc.on.clipboard")
      }
      .tint(Theme.accent)
      .accessibilityIdentifier("offer-clipboard-images")
    } header: {
      Text("Capture")
    } footer: {
      Text(Self.clipboardImagesFooter)
    }
  }

  // MARK: Local mode

  /// Local mode has no server session to manage: no sign-in, plan choice or
  /// sign-out. "Connect to a server" signs in and moves the ledger there.
  private var localBody: some View {
    Form {
      Section {
        Label("Records are kept on this \(device)", systemImage: "iphone")
          .foregroundStyle(Theme.textPrimary)
        NavigationLink {
          ServerConnectView(local: draft)
        } label: {
          Label("Connect to a server", systemImage: "server.rack")
        }
      } header: {
        Text("Storage")
      }
      assistantSection
      captureSection
      DataSection()
    }
    .navigationTitle("Settings")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        Button("Done") {
          dismiss()
        }
      }
    }
  }

  // MARK: Signed in

  private var signedInBody: some View {
    Form {
      Section {
        HStack(spacing: 12) {
          Image(systemName: "person.crop.circle.fill")
            .font(.largeTitle)
            .foregroundStyle(Theme.accent)
            .accessibilityHidden(true)
          VStack(alignment: .leading, spacing: 2) {
            Text(draft.username)
              .font(.headline)
              .foregroundStyle(Theme.textPrimary)
            Text(serverHost)
              .font(.subheadline)
              .foregroundStyle(.secondary)
              .lineLimit(1)
              .truncationMode(.middle)
          }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Signed in as \(draft.username) on \(serverHost)")
        planRows
        Button {
          isEditingConnection = true
        } label: {
          HStack {
            Text("Change server or account")
            Spacer()
            Image(systemName: "chevron.right")
              .font(.footnote.weight(.semibold))
              .foregroundStyle(.tertiary)
              .accessibilityHidden(true)
          }
          .contentShape(Rectangle())
        }
        .disabled(isSaving)
      } header: {
        Text("Account")
      } footer: {
        planFooter
      }
      assistantSection
      captureSection
      DataSection(isSelectionSaved: exportSelectionSaved)
      if let localArchive {
        LocalArchiveSection(archive: localArchive)
      }
      Section {
        Button("Sign out", role: .destructive) {
          isConfirmingSignOut = true
        }
        .disabled(isSaving || isTesting)
      }
    }
    .navigationTitle("Settings")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        Button("Done") {
          dismiss()
        }
        .disabled(isSaving)
      }
    }
    .binaryConfirm(
      "Sign out of \(serverHost)?",
      isPresented: $isConfirmingSignOut,
      confirm: .destructive("Sign out"),
      message: {
        Text("Your records stay on the server. Sign in again to use them on this \(device).")
      }
    ) {
      signOut()
    }
  }

  /// The plan inside the Account section: a value when there is one, a
  /// picker when there are several. A new choice applies straight away, like
  /// the rest of this list.
  @ViewBuilder
  private var planRows: some View {
    switch planState {
    case .idle, .loading:
      LabeledContent("Plan") {
        ProgressView()
      }
    case .loaded(let plans) where plans.isEmpty:
      LabeledContent("Plan", value: "None available")
      Button("Try again") {
        loadPlans()
      }
    case .loaded(let plans) where plans.count == 1:
      LabeledContent("Plan", value: plans[0].name)
    case .loaded(let plans):
      Picker("Plan", selection: $draft.planID) {
        if !plans.contains(where: { $0.id == draft.planID }) {
          Text("Choose a plan").tag(draft.planID)
        }
        ForEach(plans) { plan in
          let duplicate = plans.contains { $0.id != plan.id && $0.name == plan.name }
          Text(duplicate ? "\(plan.name) (\(plan.id))" : plan.name).tag(plan.id)
        }
      }
      .pickerStyle(.navigationLink)
    case .failure:
      LabeledContent("Plan", value: "Couldn’t load")
      Button("Try again") {
        loadPlans()
      }
    }
  }

  @ViewBuilder
  private var planFooter: some View {
    switch planState {
    case .loaded(let plans) where plans.isEmpty:
      Text("This account doesn’t have access to a plan yet. Ask for access, then try again.")
    case .loaded(let plans) where plans.count > 1 && !hasValidPlanSelection:
      Text("Choose a plan to continue.")
        .foregroundStyle(Theme.outflow)
    case .loaded(let plans) where plans.count > 1:
      Text("Switching plans reloads your records on this \(device).")
    case .failure(let message):
      Text(message)
        .foregroundStyle(Theme.outflow)
    default:
      EmptyView()
    }
  }

  // MARK: Connection form

  /// The server, account and plan, edited as a draft. Signed out, this is
  /// the whole sheet; signed in, it is pushed from "Change server or account"
  /// and going back discards the draft.
  private var connectionForm: some View {
    Form {
      Section {
        TextField("https://halation.example.com", text: $draft.baseURLString)
          .keyboardType(.URL)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
      } header: {
        Text("Server")
      } footer: {
        if !draft.trimmedBaseURL.isEmpty && !draft.isConfigured {
          Text(draft.refusesPublicHTTP
            ? "HTTP works only on this device or your local network."
            : "Enter a complete HTTP or HTTPS address with a host.")
            .foregroundStyle(Theme.outflow)
        } else {
          Text("The address of your own Halation server. HTTP works only on this device or your local network.")
        }
      }
      .disabled(isTesting)

      if setupState == .required {
        SetupRequiredSection(setupURL: draft.browserSetupURL) {
          checkSetupStatus()
        }
      } else if case .failure(let message) = setupState {
        Section {
          Text(message)
            .foregroundStyle(Theme.outflow)
          Button("Check again") {
            checkSetupStatus()
          }
        } header: {
          Text("Server unavailable")
        }
      }

      Section {
        TextField("Username", text: $draft.username)
          .textContentType(.username)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
        SecureField("Password", text: $password)
          .textContentType(.password)
      } header: {
        Text("Account")
      } footer: {
        Text("Halation keeps a sign-in session in this device’s Keychain. Your password is never saved.")
      }
      .disabled(isTesting)

      Section {
        Button {
          signIn()
        } label: {
          HStack {
            Text(sessionMatchesDraft ? "Sign in again" : "Sign in")
            Spacer()
            if isTesting {
              ProgressView()
            } else if let testResult {
              switch testResult {
              case .success:
                Image(systemName: "checkmark.circle.fill")
                  .foregroundStyle(Theme.inflow)
              case .failure:
                Image(systemName: "xmark.circle.fill")
                  .foregroundStyle(Theme.outflow)
              }
            }
          }
        }
        .disabled(isTesting || setupState == .checking || setupState == .required || !draft.isConfigured || draft.username.isEmpty || password.isEmpty)
      } footer: {
        if case .failure(let message) = testResult {
          Text(message)
            .foregroundStyle(Theme.outflow)
        } else if sessionMatchesDraft {
          Text(testResult == .success ? "Signed in successfully." : "Signed in as \(draft.username).")
        }
      }

      if sessionMatchesDraft {
        planSection
      }

      if !isEditingConnection {
        if let localArchive {
          LocalArchiveSection(archive: localArchive)
        }
        captureSection
      }
    }
    .navigationTitle("Connection")
    .navigationBarTitleDisplayMode(.inline)
    .navigationBarBackButtonHidden(isEditingConnection && isTesting)
    .toolbar {
      if !isEditingConnection {
        ToolbarItem(placement: .cancellationAction) {
          if !wasInitiallyAuthenticated && model.canReturnToWelcome {
            Button("Back") {
              model.returnToWelcome()
            }
          } else {
            Button("Cancel") {
              dismiss()
            }
            .disabled(!saved.isAuthenticated)
          }
        }
      }
      ToolbarItem(placement: .confirmationAction) {
        Button("Save") {
          Task {
            isSaving = true
            await onSave(draft)
            saved = draft
            formSession = nil
            isSaving = false
            dismiss()
          }
        }
        .disabled(isSaving || isTesting || !draft.isConfigured || !sessionMatchesDraft || !hasValidPlanSelection)
      }
    }
  }

  @ViewBuilder
  private var planSection: some View {
    switch planState {
    case .idle, .loading:
      Section("Plan") {
        HStack {
          Text("Finding your plans…")
          Spacer()
          ProgressView()
        }
      }
    case .loaded(let plans) where plans.isEmpty:
      Section("Plan") {
        Text("No plans available")
          .font(.headline)
        Text("This account doesn’t have access to a plan yet. Ask for access, then try again.")
          .foregroundStyle(.secondary)
        Button("Try again") {
          loadPlans()
        }
      }
    case .loaded(let plans) where plans.count == 1:
      Section {
        Text(plans[0].name)
      } header: {
        Text("Plan")
      } footer: {
        Text("Selected automatically.")
      }
    case .loaded(let plans):
      Section {
        PlanChoiceRows(plans: plans, selection: $draft.planID)
      } header: {
        Text("Choose a plan")
      } footer: {
        if draft.planID.isEmpty {
          Text("Choose a plan to continue.")
            .foregroundStyle(Theme.outflow)
        } else {
          Text("You have access to more than one plan. Choose which plan to use on this device.")
        }
      }
    case .failure(let message):
      Section("Couldn’t load plans") {
        Text("You’re signed in, but Halation couldn’t load your plans. Check the connection and try again.")
          .foregroundStyle(.secondary)
        Text(message)
          .font(.caption)
          .foregroundStyle(Theme.outflow)
        Button("Try again") {
          loadPlans()
        }
      }
    }
  }

  private func signIn() {
    isTesting = true
    testResult = nil
    planState = .idle
    planRequestID = UUID()
    let attempt = draft
    let attemptID = signInAttempts.start()
    let attempts = signInAttempts
    Task {
      do {
        let outcome = try await ServerSignIn.signIn(attempt, password: password)
        // The form can be discarded or the sheet closed while the request is
        // out. Such a session is logged out, never attached to the draft.
        guard attempts.current == attemptID,
              draft.trimmedBaseURL == attempt.trimmedBaseURL, draft.username == attempt.username else {
          if case .signedIn(let orphan) = outcome {
            try? await APIClient(settings: orphan).logout()
          }
          if attempts.current == attemptID {
            isTesting = false
          }
          return
        }
        guard case .signedIn(let signedIn) = outcome else {
          setupState = .required
          testResult = .failure("Finish setup in the website before signing in.")
          isTesting = false
          return
        }
        setupState = .ready
        if let previous = formSession, previous.sessionToken != saved.sessionToken {
          Task { try? await APIClient(settings: previous).logout() }
        }
        formSession = signedIn
        draft.sessionToken = signedIn.sessionToken
        draft.authenticatedUserID = signedIn.authenticatedUserID
        draft.username = signedIn.username
        authenticatedBaseURL = draft.trimmedBaseURL
        authenticatedUsername = draft.username
        password = ""
        testResult = .success
        let requestID = UUID()
        planRequestID = requestID
        planState = .loading
        do {
          let plans = try await APIClient(settings: draft).fetchPlans()
          guard planRequestID == requestID, sessionMatchesDraft else {
            isTesting = false
            return
          }
          applyDiscoveredPlans(plans)
        } catch {
          guard planRequestID == requestID, sessionMatchesDraft else {
            isTesting = false
            return
          }
          planState = .failure(error.localizedDescription)
        }
      } catch {
        guard attempts.current == attemptID else { return }
        testResult = .failure(error.localizedDescription)
      }
      isTesting = false
    }
  }

  private func loadPlans() {
    guard sessionMatchesDraft else {
      planState = .idle
      return
    }
    let requestID = UUID()
    planRequestID = requestID
    planState = .loading
    let expectedBaseURL = draft.trimmedBaseURL
    let expectedUsername = draft.username
    let settings = draft
    Task {
      do {
        let plans = try await APIClient(settings: settings).fetchPlans()
        guard planRequestID == requestID, draft.trimmedBaseURL == expectedBaseURL, draft.username == expectedUsername, sessionMatchesDraft else {
          return
        }
        applyDiscoveredPlans(plans)
      } catch {
        guard planRequestID == requestID, draft.trimmedBaseURL == expectedBaseURL, draft.username == expectedUsername, sessionMatchesDraft else {
          return
        }
        planState = .failure(error.localizedDescription)
      }
    }
  }

  private func applyDiscoveredPlans(_ plans: [PlanSummary]) {
    draft.planID = draft.resolvedPlanID(from: plans) ?? ""
    planState = .loaded(plans)
  }

  private func checkSetupStatus() {
    guard draft.isConfigured else {
      setupState = .idle
      return
    }
    setupState = .checking
    let checkedBaseURL = draft.trimmedBaseURL
    var statusSettings = draft
    statusSettings.sessionToken = ""
    statusSettings.authenticatedUserID = ""
    Task {
      do {
        let status = try await APIClient(settings: statusSettings).fetchAuthStatus()
        guard draft.trimmedBaseURL == checkedBaseURL else {
          return
        }
        setupState = status.setupRequired ? .required : .ready
      } catch {
        guard draft.trimmedBaseURL == checkedBaseURL else {
          return
        }
        setupState = .failure(error.localizedDescription)
      }
    }
  }

  private func signOut() {
    let current = draft
    draft.sessionToken = ""
    draft.authenticatedUserID = ""
    draft.planID = ""
    password = ""
    testResult = nil
    planState = .idle
    planRequestID = UUID()
    isSaving = true
    Task {
      await onSave(draft)
      saved = draft
      try? await APIClient(settings: current).logout()
      isSaving = false
    }
  }

  /// A plan picked on the signed-in list applies at once. The Connection
  /// form's draft waits for its Save instead.
  private func applyPlanChoice() {
    guard saved.isAuthenticated, !isEditingConnection, sessionMatchesDraft,
          draft.planID != saved.planID, hasValidPlanSelection else { return }
    Task {
      isSaving = true
      await onSave(draft)
      saved = draft
      isSaving = false
    }
  }

  /// Going back from the Connection form without saving restores the saved
  /// server, account and plan.
  private func discardConnectionEdits() {
    signInAttempts.abandon()
    isTesting = false
    if let abandoned = formSession, abandoned.sessionToken != saved.sessionToken {
      Task { try? await APIClient(settings: abandoned).logout() }
    }
    formSession = nil
    draft = saved
    authenticatedBaseURL = saved.trimmedBaseURL
    authenticatedUsername = saved.username
    password = ""
    testResult = nil
    checkSetupStatus()
    loadPlans()
  }
}
