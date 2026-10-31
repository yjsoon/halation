# Intake provider reads — evidence for 88c2913

- **Revision:** `88c2913` on `claude/project-thread-9gqdmd` (detached HEAD; "Address second review: guessed categories, background re-sends, copy")
- **Simulator:** iPhone 17, iOS 26.5, UDID `EDD9B083-63F1-44E6-9A7B-0A6964CC2561`
- **Xcode:** Xcode 27.0 RC via `DEVELOPER_DIR=/Applications/Xcode-27.0-RC.app/Contents/Developer`
- **Plan:** synthetic local-mode plan `plan_29d24687…`, one account "Fake Wallet Wallet" (`acct_4398777b…`), categories incl. Eating out / Groceries
- **Stub provider:** `stub/stub_provider.py` — HTTPS on `https://127.0.0.1:8443`, self-signed CA trusted via `xcrun simctl keychain … add-root-cert`, modes `ok / 500 / bad / empty / cat / hang` selected by the `stub-mode` file, every request body appended redacted to `stub-requests.log`
- **App settings:** AI provider → Custom endpoint `https://127.0.0.1:8443/v1`, Chat Completions, model `stub-model`, key `fake-test-key` (set via the real Settings UI)
- **Shares:** real Photos → Halation shares for A, F2, C, F3; inbox manifest injection (`Inbox/<uuid>/manifest.json` + image) for B, E, H, I, J and the G burst — same manifest format the share extension writes
- All data synthetic: FAKE GROCER / FAKE CAFE / PET STORE / FAKE MARKET / Coffee Bean / Stub Provider Mart.

## 1. Test suite

`scripts/ios-xcodebuild.sh test` (build-for-testing 69 s exit=0, then test-without-building 839 s exit=0):
**779 XCTest tests, 0 failures, 1 skipped; 3 swift-testing tests passed.** No compiler errors or warnings in the changed files. Full log retained on the runner (`/tmp/test-88c2913.log`).

## 2–3. Scenarios — expected vs observed

| # | Expected | Observed | Verdict |
|---|----------|----------|---------|
| A | Provider read: one NEW row "Stub Provider Mart" 41.20 5 Oct; Why without 'Read without Apple Intelligence'; exactly one stub request with OCR text + account/category names, no image; approve, persists | `shots/A-review-stub-row.png`, `A-why.png` (reasons: "No row within 3 days for this amount" — no AI-intelligence line), `A-approved.png`; request #1 `ok` in `stub-requests.log` contains "FAKE GROCER", "41.20", "Fake Wallet Wallet", "Groceries", "Eating out"; no `image_url`/`base64`; `sqlite/A-transactions.txt` row `2026-10-05\|Stub Provider Mart\|-41.2\|1` survives relaunch | PASS |
| B | Stub → 500, foreground read falls back to device; Why shows 'Read without Apple Intelligence' **and** 'Not read by your AI provider, so read on this device'; failed attempt in log; discard, no ledger write | Job `5F871AD3` `proposed`, reasons exactly `["No row within 3 days for this amount","Read without Apple Intelligence","Not read by your AI provider, so read on this device"]` (`jobs/5F871AD3-*.json`, `shots/B-why-three-reasons.png`); request #2 logged as `500`; rejected via UI; ledger unchanged (still just the A row) | PASS |
| C | On device: no remote request | With provider = On device, real share of `PET STORE 9.99` → NEW row (`shots/C-pet-store-device.png`); `stub-requests.log` still ends at request #7 with **no** request for this share | PASS |
| E | `-1,234.50` → 1,234.50 outflow; `2026-02-30` ignored → today's date; flagged for review, not a device fallback | Job `E6930BE5` `proposed`: `Stub Provider Odd Mart`, `direction: outflow`, `amountMagnitudeMilli: 1234500`, `date: 2026-10-18T12:12:04Z`, confidence 0.8 (Likely) (`jobs/E6930BE5-*.json`, `shots/E-row-1234.50-today.png`); rejected | PASS |
| F1 | Signed in + provider set → "Text is read by \<provider name\>" | `shots/F1-share-footnote-provider.png`: "Text is read by Custom provider" | PASS |
| F2 | On device → "Reads on this phone" | `shots/F2-reads-on-this-phone.png` (and repeated on the C share sheet) | PASS |
| F3 | Signed out → "Read after you sign in" | `shots/F3-read-after-sign-in.png` ("Open Halation to finish setting up") | PASS |
| G | Inbox status while reading shows "Reading…" | `shots/G-reading.png`: "Reading" section, row labelled "Reading / Reading…" | PASS |
| H | `{"spends":[]}` on a document with text → batch fails with 'Your AI provider found no transactions in this…' | Job `A50B2C37` `state: failed`, `failureMessage` exactly "Your AI provider found no transactions in this. To read it on this phone instead, choose On device in AI provider settings." (`jobs/A50B2C37-*.json`, `shots/H-failed.png`, `H-failure-message.png`) | PASS |
| I | Provider category not in document text still applies; same txn with a different category → 'Already in', not 'Category differs' | I1 job `EE821F35` NEW `Coffee Bean` −4.50 with `categoryID …cat:eating-out` (`shots/I1-eating-out.png`). After seeding register row `txn_seed_coffee_1` (Coffee Bean −4500 2026-10-18 **Groceries**), I2 job `C87CBA5F` is `kind: alreadyIn`, reason "Same amount within 3 days", candidate `txn_seed_coffee_1` (`jobs/C87CBA5F-*.json`, `shots/I2-already-in.png`) — no 'Category differs' | PASS |
| J | Provider selected, no key saved, **background** read → reads on device (no defer), rows carry provider-failed reason | Deleted the app's keychain row (`DELETE FROM genp WHERE svce/acct` — row verified absent). Injected entry, launched app, pressed Home → background drain. Job `20BA1678`: `state: proposed`, `deferredToForeground: false`, row `FAKE BAKERY` with reasons including 'Not read by your AI provider, so read on this device' (`jobs/20BA1678-*.json`); stub log has **no** request for it | PASS |
| D | (not required this round) | Diff 04bea50→88c2913 leaves the `.keychain`-error defer path untouched; locked-Keychain remains unreproducible on Simulator (documented in `../e4e2995/report.md`) | skipped |

## Notes / caveats

- **G technique:** device reads complete in <1 s, too fast to screenshot. `hang` mode makes the stub sleep 120 s before answering; during that window job `DE1D13F5` sat in `state: reading` and the inbox showed "Reading…". The job later proposed normally once the stub answered.
- **I fixture:** the requested example category "Dining Out" does not exist in this synthetic plan; used the real plan category "Eating out" (absent from the OCR text "COFFEE BEAN 4.50") — the check is identical.
- **J:** key deleted straight from the sim keychain DB (`logs/restore-key.sql` holds the restore INSERT used later). The deletion was additionally confirmed by Settings → AI provider showing "No key saved for this endpoint".
- **C first attempt** on the `FAKE GROCER / TOTAL 41.20` image honestly failed with "Couldn't read this. No transactions were found." — `IntakeLineParser` ignores `TOTAL` lines by design; re-shared `PET STORE 9.99` which parses.
- **F3:** `Intake/share-context.json` was overwritten with `{"isSignedIn":false,…}` to stage the signed-out extension view; the app republished the real signed-in context on next launch (verified).
- 37 `job.json` snapshots preserved under `jobs/`; `sqlite/` holds ledger queries; `logs/` keychain SQL; `shots/` all screenshots; `stub/` server + throwaway localhost CA keys (synthetic only).

_Removed after the run: the stub TLS private keys (`stub/*.key`) and the captured Simulator keychain row (`logs/restore-key.sql`). They held no real credentials, but key material does not belong in a public repo. The stub scripts regenerate the keys._
