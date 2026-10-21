import SwiftUI

struct CaptureAISettingsView: View {
  @Environment(\.dismiss) private var dismiss
  let settings: CaptureAISettings
  @State private var draft: CaptureAISelection
  @State private var apiKey = ""
  @State private var removeKey = false
  @State private var error: String?

  init(settings: CaptureAISettings) {
    self.settings = settings
    _draft = State(initialValue: settings.selection)
  }

  private var provider: CaptureAIProvider? {
    settings.catalog.providers.first { $0.id == draft.providerID }
  }

  var body: some View {
    Form {
      Section {
        Picker("Provider", selection: $draft.providerID) {
          Text("On device").tag("on-device")
          ForEach(settings.catalog.providers) { provider in
            Text(provider.name).tag(provider.id)
          }
          Text("Custom endpoint").tag("custom")
        }
        .pickerStyle(.navigationLink)
        .accessibilityIdentifier("ai-provider-picker")
      } footer: {
        Text("Used for Add and Assistant conversations, and to read documents you share to Halation. Changes apply to the next request. Your Halation server connection is unchanged.")
      }

      if draft.isOnDevice {
        Section("On device") {
          Text("Uses Apple Intelligence. Text is read on this device. Manual entry is always available.")
          if settings.catalog.providers.isEmpty {
            Text("The model catalog could not be loaded. Reinstall an updated Halation build to use an external provider.")
              .foregroundStyle(Theme.outflow)
          }
        }
      } else {
        modelSection
        Section {
          SecureField(settings.hasKey(for: draft) ? "Replace saved API key" : "API key", text: $apiKey)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .accessibilityIdentifier("ai-api-key")
          if settings.hasKey(for: draft) {
            Button(removeKey ? "Keep saved key" : "Remove saved key", role: removeKey ? nil : .destructive) {
              removeKey.toggle()
              apiKey = ""
            }
          }
          Text(removeKey ? "Key will be removed when you save." : settings.hasKey(for: draft)
            ? "A key is saved on this device." : "No key saved for this endpoint.")
            .font(.footnote)
            .foregroundStyle(.secondary)
        } header: {
          Text("API key")
        } footer: {
          Text("Stored in this device's Keychain, not in your ledger or iCloud. Leave the field empty to keep a saved key.")
        }

        Section {
          Text("Your message, extracted receipt text, current drafts, recent conversation context, and account/category names are sent to this provider. For a shared document, its text as read on this device, your notes for reading documents, any note you add when sharing, and account/category names are sent. Images, PDFs and the full ledger are not uploaded. Nothing the provider suggests is saved without your review.")
            .font(.footnote)
            .foregroundStyle(.secondary)
          Text(provider?.notice ?? "Your endpoint's data retention and training policies apply. This is not Apple's Private Cloud Compute. Requires JSON output support for the selected API.")
            .font(.footnote)
            .foregroundStyle(.secondary)
          if let provider {
            Link("Provider documentation", destination: provider.documentationURL)
          }
        } header: {
          Text("What is sent")
        }
      }
      if let error {
        Section {
          Text(error).foregroundStyle(Theme.outflow)
        }
      }
    }
    .navigationTitle("AI provider")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .cancellationAction) {
        Button("Cancel") { dismiss() }
      }
      ToolbarItem(placement: .confirmationAction) {
        Button("Save") {
          do {
            try settings.save(draft, keyChange: removeKey ? "" : apiKey.isEmpty ? nil : apiKey)
            apiKey = ""
            dismiss()
          } catch {
            self.error = error.localizedDescription
          }
        }
        .accessibilityLabel("Save AI settings")
      }
    }
    .onChange(of: draft.providerID) { _, _ in
      draft.modelID = provider?.models.first?.id ?? ""
      draft.providerBaseURL = nil
      clearEndpointEdits()
    }
    .onChange(of: draft.customBaseURL) { _, _ in clearEndpointEdits() }
    .onChange(of: draft.providerBaseURL) { _, _ in clearEndpointEdits() }
    .onChange(of: apiKey) { _, value in if !value.isEmpty { removeKey = false } }
  }

  @ViewBuilder
  private var modelSection: some View {
    Section("Model") {
      if draft.providerID == "custom" {
        TextField("HTTPS base URL (ending in /v1 if required)", text: $draft.customBaseURL)
          .keyboardType(.URL)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .accessibilityLabel("AI base URL")
        TextField("Model ID", text: $draft.modelID)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
        Picker("API", selection: $draft.customAPI) {
          ForEach(CaptureAIAPI.allCases, id: \.self) { api in Text(api.name).tag(api) }
        }
      } else if let provider {
        Picker("Model", selection: $draft.modelID) {
          ForEach(provider.models) { model in Text(model.name).tag(model.id) }
          if !provider.models.contains(where: { $0.id == draft.modelID }) {
            Text("Choose an available model").tag(draft.modelID)
          }
        }
        .pickerStyle(.navigationLink)
        if provider.allowsCustomBaseURL == true {
          LabeledContent("Endpoint") {
            TextField("Endpoint", text: providerBaseURL, prompt: Text("Standard API"))
              .keyboardType(.URL)
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
              .multilineTextAlignment(.trailing)
          }
          Text("Leave empty to use \(provider.baseURL). A saved key belongs to the endpoint it was saved for.")
            .font(.footnote).foregroundStyle(.secondary)
        } else {
          Text(provider.baseURL).font(.footnote).foregroundStyle(.secondary)
        }
        Text(draft.modelID).font(.caption).foregroundStyle(.secondary)
      } else {
        Text("This provider is no longer in the catalog. Choose another provider.")
      }
    }
  }

  private var providerBaseURL: Binding<String> {
    Binding(get: { draft.providerBaseURL ?? "" }, set: { draft.providerBaseURL = $0.isEmpty ? nil : $0 })
  }

  private func clearEndpointEdits() {
    apiKey = ""
    removeKey = false
    error = nil
  }
}
