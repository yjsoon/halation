# iOS Connection cleanup: bare server hosts, short copy, signed-in account

## Revision

- Code under test: commit `3728406` on local branch `ios-bare-host-url`, on top of `origin/main` `90e5497` (rebased from `49083b4`, whose `apps/` and `.cursor/` trees are identical).
- At `3728406`: full suite, and E2E steps 1 to 8 rerun on a fresh Amp Mac satellite (see "Rerun at 3728406"). Steps 9 to 11 and the large-text screenshots come from the first run at `49083b4`.

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

## Rerun at 3728406

- New Mac satellite (macos-27, Xcode 27.2), same simulator model and UDID. The first full-suite run gave 822 tests with 6 `CaptureSnapshotTests` failures (`accessibilityLabels() == []`), the fresh-simulator case documented in `apps/ios/AGENTS.md`. After enabling simulator accessibility as documented there: 822 tests, 0 failures, 1 skipped (`full-suite.txt`, `api-settings-tests.txt`: 18 passed).
- Fresh verify stack with `TYPESAFE_API_KEY=verify-dummy`, new throwaway CA and HTTPS proxy on `localhost:8443`.
- Typed `  localhost:8443 `: no error, Sign in enabled. Sign in reached `https://localhost:8443/api/auth/status`, `/api/auth/token` and `/v1/plans` (`proxy-requests.log`). Signed-in card and collapsed Details shown, no password field (`03-signed-in.png`); Details expands to `server-categoriser-details` (`04-details-open.png`). Sign in as someone else shows empty Password and Keep signed in as verifier (`05-change-account.png`); keeping returns to the card with Save enabled.
- Save: persisted `baseURLString` is `https://localhost:8443`, session token empty in UserDefaults; ledger requests go to `https://localhost:8443/v1/plans/local-plan/...`. Reopened Connection shows `https://localhost:8443` and the signed-in card.
- `http://ledger.example.test`: `HTTP works only on this device or your local network.`, Save and Sign in disabled (`10-public-http.png`). `ftp://ledger.example.test`: `Enter a server address, like halation.example.com.`, both disabled.

## Review fix at dbbf5e4

Both reviewers found that the connect flow saved the address as typed, and that the static session lookups (`savedSessionToken`, `forgetSavedSession`) trimmed whitespace but not slashes, so `/host` missed the scope its token was saved under. Fix: `withDefaultScheme` now trims slashes too, and `ServerSignIn.signIn` returns the normalised address.

- Red first: new `testTypedAddressFindsAndForgetsItsSession` (` /ledger.example.test/ `) failed with 3 assertion failures at `8f739d8` plus the test.
- Green at `dbbf5e4`: `APISettingsTests` 19 passed; full suite 823 tests, 0 failures, 1 skipped (`full-suite.txt`, `api-settings-tests.txt`). The first full run on this Mac again hit the 6 fresh-simulator `CaptureSnapshotTests` accessibility failures; after re-enabling accessibility per `apps/ios/AGENTS.md`, 0 failures.
- E2E at `dbbf5e4`, fresh verify stack and HTTPS proxy: fresh install, Start on this iPhone, Settings, Connect to a server, Server ` /localhost:8443/ `, `verifier`. The "already has records" step shows the full disclosure (`15-connect-slash-has-data.png`). Use the data on the server lands on Accounts with the demo ledger (`16-adopted.png`). Persisted `baseURLString` is `https://localhost:8443` (previously the raw typed text on this path), session token empty in UserDefaults. After terminate and relaunch the ledger loads again, so the Keychain session is found under that scope. All requests in `proxy-requests-connect.log` are `https://localhost:8443/...`.
