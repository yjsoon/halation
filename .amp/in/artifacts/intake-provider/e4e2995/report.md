# Intake provider-first reading — E2E evidence

- Revision: `e4e2995` on `claude/project-thread-9gqdmd` (detached). Built and tested at this revision; no source changes were needed.
- Simulator: iPhone 17, iOS 26.5 (UDID `EDD9B083-63F1-44E6-9A7B-0A6964CC2561`).
- Xcode: 27.0 RC (`DEVELOPER_DIR=/Applications/Xcode-27.0-RC.app/Contents/Developer`), ad-hoc simulator signing.
- Stack: local/synthetic plan "Fake Wallet Wallet" (`acct_4398777b-…`) on the app's on-device store. No production, no real financial data.
- Stub provider: `stub/stub_provider.py` — Python `ThreadingHTTPServer` + self-signed CA on `https://127.0.0.1:8443`, trusted via `xcrun simctl keychain <UDID> add-root-cert`. POST `/v1/chat/completions` logs each request body (Authorization redacted) to `stub-requests.log` and answers a fixed non-streaming chat completion whose content is the JSON string `{"spends":[{"amount":"41.20","payee":"Stub Provider Mart","category":"","account":"","date":"2026-10-05","isInflow":false}]}`. `stub-mode` file toggles `ok`/`500`.
- App config: Settings > AI provider > Custom endpoint, base URL `https://127.0.0.1:8443/v1`, API Chat Completions, model `stub-model`, key `fake-test-key`.
- Fixtures: `fixtures/make_receipt.swift` renders receipt PNGs; inbox entries injected as manifest-v2 `Inbox/<uuid>/manifest.json` + payload (receipt image or, for the market run, an image named from receipt-market.png).

## Test suite

`SIMULATOR_UDID=EDD9B083-63F1-44E6-9A7B-0A6964CC2561 DEVELOPER_DIR=/Applications/Xcode-27.0-RC.app/Contents/Developer scripts/ios-xcodebuild.sh test`

- XCTest: **779 tests, 0 failures, 1 skipped** (+ 3 swift-testing `RewardDraftPeriodTests` passed).
- No compiler errors or warnings in the changed files (`IntakeRemoteReader.swift`, `IntakeCoordinator.swift`, `CaptureAIClient.swift`). No compile fixes needed.
- A `simctl diagnose` post-test diagnostics collection timed out at 600 s; benign — the test run itself exited 0.

## Expected vs observed

| Scenario | Expected | Observed | Result |
|---|---|---|---|
| A — provider read | One NEW row "Stub Provider Mart" 41.20 5 Oct; Why ≠ "Read without Apple Intelligence"; exactly one stub request containing OCR text + account/category names, no base64/image_url; ledger persists across relaunch | Row proposed by provider (dedup shows "Stub Provider Mart −$41.20"); Why shows remote read; stub log has exactly one request with OCR'd receipt text and account/category names and no image payload; approved; `transactions` shows `2026-10-05 | Stub Provider Mart | -41.2 | approved=1`, still present after relaunch | PASS |
| B — provider 500, foreground fallback | Device-read row proposed (line reader on this sim: Why "Read without Apple Intelligence", capped Likely); stub log shows failed attempt; discard → no ledger write | After stub → 500, shared `06 OCT FAKE CAFE 7.80` (single-line fixture; an earlier fixture using `TOTAL 7.80` was correctly ignored by `IntakeLineParser` and reported as failure — regenerated) → row FAKE CAFE proposed with Why "Read without Apple Intelligence", Likely; stub log shows the 500 attempt; discarded; no ledger write | PASS |
| C — on device unchanged | Provider "On device"; new share produces no stub request | Provider switched to On device (deletes saved key); shared `08 OCT FAKE BAKERY 12.30`; no new stub request; row read on device; discarded | PASS |
| D1 — locked-device background read | (Reproducibility probe) provider selected + key saved; lock sim while a background drain runs | `notifyutil -p com.apple.springboard.lockcomputer` did not lock; locked via Simulator Device > Lock. While locked, a background drain ran and the provider request **succeeded** (stub log line; job proposed normally). **The locked-Keychain state is not reproducible on the Simulator** — the keychain stays readable while the screen is locked. Reported plainly per instruction; no faking. | See notes |
| D2 — key unreadable → defer | Selected provider whose Keychain key cannot be read defers background reads to the foreground instead of reading on device | Key removed via Settings (row absent from `keychain-2-debug.db`); injected inbox entry; background drain → job `F2107CAF` / `E862502F` stayed `state=queued`, `deferredToForeground=true`, no proposals, **no stub request, no on-device read** — verified on two consecutive injected entries | PASS |
| D3 — foreground, key still missing | Deferred job falls back to reading on device ("Provider not usable; reading on device") | Foregrounded app → job `F2107CAF` drained, proposed "FAKE BAKERY" via on-device reader (Why "Read without Apple Intelligence"); discarded | PASS |
| D4 — key readable again → provider read | Same job reads with the provider after unlock/foreground | Re-inserted the app's keychain row into the sim debug keychain DB while still backgrounded (stand-in for a real device unlocking; captured row 85: `svce`/`acct` are SHA-1s of service + `custom\|…`, agrp `PQ6U5ESLN2.sg.soon.howmuch`, `pdmn=aku`); foregrounded → job `E862502F` drained and proposed **"Stub Provider Mart"** — the provider's answer, not the image text; stub request #5 logged; shown as ALREADY IN vs the approved A row; discarded | PASS |

Final ledger (`sqlite/final-transactions.txt`): one row, `2026-10-05 | Stub Provider Mart | -41.2 | approved=1`. All rejected batches wrote nothing.

## Scenario D caveat

On the Simulator, locking the device does not lock the Keychain: the locked-screen background drain in D1 reached the provider successfully. The defer path was therefore exercised via the missing-key variant — `configuration()` throws `.key` for a missing key exactly as for an unreadable one, so the same `leaveForForeground` branch runs. Key restoration was done by writing the app's own row back into `keychain-2-debug.db` (`logs/restore-key.sql`) while the app was still backgrounded; this is the equivalent of the key becoming readable on unlock, not a simulated UI step.

## Evidence files

- `shots/` — setup, A review/Why/ledger, B review/Why/discard, C review/Why, D1 lock screen + locked background provider read, D2 fallback proposal, D3 provider-read proposal after restore.
- `logs/stub-ABCD.log` — redacted request bodies (5 requests: A ok, B-old-cafe 500, B-cafe 500, D1-locked ok, D3 deferred-job ok).
- `jobs/` — job.json for the deferred-and-resolved jobs.
- `sqlite/final-transactions.txt` — read-only query.
- `stub/` — stub server + CA script; `fixtures/` — fixture generator + PNGs; `logs/restore-key.sql` — captured keychain row used in D4.

_Removed after the run: the stub TLS private keys (`stub/*.key`) and the captured Simulator keychain row (`logs/restore-key.sql`). They held no real credentials, but key material does not belong in a public repo. The stub scripts regenerate the keys._
