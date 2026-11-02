# Register: hide the title while selecting

- Revision: `2eeb991` (branch `validate/hide-title-selecting`), checked out detached and clean on a Devin macOS runner (macOS 26.6.2, Xcode 26.6 17F113). No commits or pushes from the runner.
- Simulator: iPhone 17, iOS 26.5.
- Data: local mode ("Start on this iPhone"), one invented account "Everyday Account" with four invented transactions seeded into the local SQLite. No production or personal data.

## Commands and steps

| Step | Expected | Observed |
| --- | --- | --- |
| `scripts/ios-xcodebuild.sh build-for-testing` | exit 0 | exit 0, TEST BUILD SUCCEEDED (139s) |
| Open the Everyday Account register | "Everyday Account" title with chevron | shown (`step3-register-title.jpg`) |
| ⋯ > Select Transactions, then Select All | bar shows only Deselect All, search and Done; no title; nothing clipped | as expected; card "4 selected +$2,913.20, In $4,850.00 · Out $1,936.80" (`step4-select-all-hidden-title.jpg`) |
| Done, then tap the title | title back; account editor opens | Edit Account sheet opens (`step5-title-restored-editor.jpg`) |
| Same on the all-accounts Ledger | title hidden while selecting, back after Done | as expected (`step6-ledger-select-all-hidden.jpg`, `step6b-ledger-title-restored.jpg`) |

Full test suite not run: the change is two lines in `RegisterView.swift` (navigation title and principal toolbar item gated on `selection == nil`).
