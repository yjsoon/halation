# iOS Connection cleanup: bare server hosts, short copy, signed-in account

## Revision

- Code under test: commit `49083b4` on local branch `ios-bare-host-url`, parent `6fb4347` (main at branch time). The app and tests ran on the working tree that became `49083b4`; the only later edits in that commit are the verify recipe docs under `.cursor/skills/verify-howmuch/`.
- Not pushed or merged. `origin/main` has since moved to `90e5497` (AGENTS.md only, no overlap).

## Environment

- Amp Mac satellite, macOS image macos-27, Xcode 27.2.
- Simulator iPhone SE (3rd generation), UDID `E968C94B-CA31-4750-9260-AFF3CFA1ECD8`, bundle `com.tinkertanker.halation`.
- Isolated API from `control-howmuch launch` with `TYPESAFE_API_KEY=verify-dummy` (so `categoriser_enabled: true`), seeded from `fixtures/demo-ledger.json`. Owner `verifier` / `howmuch-verify-15` created through `POST /api/auth/setup` with the verify bootstrap token (a precondition here, not a test of web setup).
- A throwaway HTTPS front (`bun` TLS proxy on `localhost:8443`, leaf signed by a throwaway CA added with `xcrun simctl keychain <UDID> add-root-cert`) forwards to the verify API, so a bare host typed in the app reaches a real server over HTTPS. Every request URL is logged in `proxy-requests.log`.
- UI driven with AXe 1.8.0 (`axe tap`, `axe type`, `axe describe-ui`). No production host was contacted.

## Tests

- Red first: the five new `APISettingsTests` cases ran against the old model and failed (18 tests, 11 failures, all in the new cases). Two cases were tightened afterwards (`HTTPS://` scheme compared case-insensitively; `https:` and `[::1` added to the rejected list).
- Green: `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests/APISettingsTests`: 18 tests, 0 failures (`api-settings-tests.txt`).
- Full suite: `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests`: 822 tests, 0 failures, 1 skipped (`testLiveFoundationModelsCoffeeAddUpdateAndTodayQuery`, opt-in live model check) (`full-suite.txt`). Baseline before this change was 817.

## E2E steps and results

1. Fresh install, **Connect to a server** from onboarding. Connection shows placeholder `halation.example.com`, footers `Your Halation server address.` and `Your password isn’t saved.` (`01-signed-out.png`).
2. Server typed as `  localhost:8443 ` (outer spaces, no scheme), `verifier` / password, **Sign in**. No validation error. Proxy log shows `GET https://localhost:8443/api/auth/status`, `POST https://localhost:8443/api/auth/token`, `GET https://localhost:8443/v1/plans`.
3. Signed in: Account shows `Signed in as verifier` (`connection-signed-in-account`) and **Sign in as someone else**; no password field. Automatic categories shows `TypeSafe uses transaction data to categorise automatically.` and a collapsed **Details** (`03-signed-in.png`). Expanded, Details shows the full, unchanged disclosure (`server-categoriser-details`, `04-details-open.png`).
4. **Sign in as someone else** shows Username, an empty Password, **Sign in** and **Keep signed in as verifier** (`05-change-account.png`). **Keep signed in as verifier** returns to the signed-in card.
5. **Save**. Persisted `HowMuch.APISettings` reads `"baseURLString":"https:\/\/localhost:8443"` (trimmed, scheme added); the session token is not in UserDefaults. Ledger requests then go to `https://localhost:8443/v1/plans/local-plan/...`.
6. Reopen Settings, **Change server or account**: Server reads `https://localhost:8443`, signed-in card shown, no blank password.
7. Server changed to `ftp://ledger.example.test`: footer `Enter a server address, like halation.example.com.`; credential fields return; Save and Sign in disabled (`09-ftp-rejected.png`).
8. Server `http://ledger.example.test`: footer `HTTP works only on this device or your local network.`; Save and Sign in disabled (`10-public-http.png`).
9. Server `halation.example.test` (bare, unreachable): normal footer, no error; with a password Sign in is enabled, Save stays disabled until that server's session exists. Back discards the draft and the saved server returns.
10. Text size accessibility-extra-extra-extra-large: footers, notice and **Sign in as someone else** wrap without truncation (`11-ax5-signed-in.png`, `12-ax5-account.png`). The single-line Server text field truncates its value, as before.
11. Local mode, Settings, **Connect to a server**, bare `localhost:8443`: sign-in goes to `https://localhost:8443` and the "already has records" step shows the short TypeSafe line and the full disclosure without a tap, above **Use the data on the server** (`14-server-has-data.png`). The upload confirmation uses the same `CategoriserNoticeSection(showsDetails: true)` call but was not reached here (the verify server already has records).

## Not covered

- Physical device, iPad layout and the upload-confirmation step itself.
- A real public HTTPS host: the bare-host path was proven against `localhost:8443` with a simulator-trusted throwaway CA.
