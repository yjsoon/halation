import SwiftUI
import UIKit
import UserNotifications

/// Settings > Reminders: notification permission, the app badge setting and
/// payment reminders per card.
struct RemindersSettingsSection: View {
  @Environment(AppModel.self) private var model
  @State private var editingAccount: Account?

  private var notifier: CardPaymentNotifier { .shared }

  var body: some View {
    @Bindable var notifier = notifier
    Section {
      permissionRow
      Picker(selection: $notifier.badgeMode) {
        ForEach(AppBadgeMode.allCases) { mode in
          Text(mode.title).tag(mode)
        }
      } label: {
        Label("App icon badge", systemImage: "app.badge")
      }
      .accessibilityIdentifier("badge-mode")
      ForEach(model.creditAccounts) { account in
        Button {
          editingAccount = account
        } label: {
          LabeledContent {
            Text(cardStatus(account))
          } label: {
            Label(account.name, systemImage: "creditcard")
              .foregroundStyle(Theme.textPrimary)
          }
        }
      }
      LabeledContent("Reminders on this \(UIDevice.current.model)", value: "\(notifier.pendingReminders.count)")
      #if DEBUG
      if !notifier.pendingReminders.isEmpty {
        DisclosureGroup("Pending reminders") {
          ForEach(notifier.pendingReminders) { reminder in
            VStack(alignment: .leading, spacing: 2) {
              Text(reminder.id)
                .font(.caption.monospaced())
              Text(reminder.fireDate?.formatted(date: .abbreviated, time: .shortened) ?? "Now")
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
          }
        }
        .accessibilityIdentifier("pending-reminders")
      }
      #endif
    } header: {
      Text("Reminders")
    } footer: {
      VStack(alignment: .leading, spacing: 6) {
        Text("Card payment reminders stay on this \(UIDevice.current.model). Due-day and overdue reminders are Time Sensitive, so they can show during a Focus; you can turn that off for Halation in the Settings app. The badge counts cards overdue or due today and not yet scheduled.")
        Text("Open Halation at least once a month so reminders keep being added.")
        if notifier.truncated {
          Text("Reminders for the next cycle will be added closer to the date.")
        }
      }
    }
    .task {
      await notifier.refreshAuthorisation()
      await notifier.reloadPendingList()
    }
    .sheet(item: $editingAccount) { account in
      CardPaymentTermsSheet(account: account, existing: model.cardPayments.terms(for: account.id))
        .environment(model)
    }
  }

  @ViewBuilder
  private var permissionRow: some View {
    switch notifier.authorisation {
    case .notDetermined:
      Button {
        Task { await notifier.requestAuthorisation() }
      } label: {
        Label("Allow reminders", systemImage: "bell.badge")
      }
    case .denied:
      Button {
        if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
          UIApplication.shared.open(url)
        }
      } label: {
        LabeledContent {
          Text("Open Settings")
        } label: {
          Label("Reminders are off", systemImage: "bell.slash")
            .foregroundStyle(Theme.textPrimary)
        }
      }
    default:
      LabeledContent {
        Text(notifier.timeSensitive == .disabled ? "On, not Time Sensitive" : "On")
      } label: {
        Label("Notifications", systemImage: "bell")
      }
    }
  }

  private func cardStatus(_ account: Account) -> String {
    guard let terms = model.cardPayments.terms(for: account.id) else {
      return "Set up"
    }
    return terms.enabled ? "On" : "Off"
  }
}
