# Settings rework: iOS validation record

- Revision: `ecc9ad3` on `claude/project-thread-9hqg1e` (PR #342)
- Environment: macOS 26.6.2, Xcode 26.6 (17F113), iPhone 17 Simulator, iOS 26.5
- Data: synthetic only. Local stack from `control-howmuch launch` with the seeded demo ledger, loopback API only, first owner `verifier`. No production host was contacted.

## Build

`scripts/ios-xcodebuild.sh build-for-testing` gave `** TEST BUILD SUCCEEDED **`. The only warnings are the existing Swift 6 actor-isolation ones (Components.swift, HowMuchApp.swift, AddTransactionsView.swift).

## Tests

`test-without-building` on the same destination: 42 tests, 0 failures.

| Suite | Result |
| --- | --- |
| CaptureAITests | 15 passed |
| APISettingsTests | 13 passed |
| ServerConnectionFlowTests | 9 passed |
| ServerConnectionRulesTests | 3 passed |
| ScreenshotOfferTests/testRenderedClipboardSettingsAndDismissedToast | passed |
| CaptureSnapshotTests/testAIModelSelectionSavesPreferencesWithoutExposingOrReplacingKey | passed |

## E2E steps and observations

1. Launch the local stack, run `doctor`, and complete first-owner setup in the web UI.
2. Install and launch `sg.soon.howmuch` on the simulator. Choose Connect to a server, enter the loopback API address and the `verifier` account, then Sign in. Observed: "Signed in successfully". The single plan, HowMuch Demo, was applied automatically. Save.
3. More > Settings. Observed: Account (user, host, plan, Change server or account), then Assistant, Capture and Data. See `ecc9ad3-a-settings-top.png` and, in dark mode, `ecc9ad3-a-dark-settings-top.png`.
4. Scroll to the bottom. Observed: the Data footer and Sign out on their own (`ecc9ad3-b-settings-bottom.png`).
5. Tap Change server or account. Observed: the Connection form, signed in, with Back (`ecc9ad3-c-connection-signedin.png`).
6. Open AI provider, then Provider. Observed: On device, OpenCode Go, Claude, OpenRouter, OpenAI, DeepSeek and Custom endpoint (`ecc9ad3-d-provider-list.png`).
7. Choose Claude. Observed: Model is Claude Opus 5.5, Endpoint shows "Standard API", and the key line reads "No key saved for this endpoint." (`ecc9ad3-e-ai-provider-claude.png`).
8. Settings > Sign out, then confirm "Sign out of 127.0.0.1?". Observed: the signed-out Connection form (`ecc9ad3-f-connection-signedout.png`).

The verify stack was cleaned up afterwards. No live AI provider requests were made.
