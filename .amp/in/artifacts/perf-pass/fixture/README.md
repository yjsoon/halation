# Perf-pass fixture: synthetic heavy ledger

Deterministic, obviously fake test data for benchmarking the iOS app against
(a) a local API server and (b) the app's on-device local-mode engine. No real
user data was used or copied. Every name is synthetic ("Everyday Account",
"Card A", "Synthetic Payee 042", "Groceries"), and output is byte-identical
across runs.

Verified on Linux at revision `cebf827a4042e7036486f83978fc393287aba332`
(bun 1.4.2, bash 5.2). The full recorded run is in
[`verify-linux.txt`](verify-linux.txt), with the session token redacted.

## Files

| File | Run with | Produces / does |
| --- | --- | --- |
| `make-snapshot.ts` | `bun` | `perf-snapshot.json`, a bare `howmuch-plan-snapshot` v1 document. Checked with the API's own `parsePlanSnapshot` and against `MAX_SNAPSHOT_BYTES` before writing. |
| `serve.sh` | `bash` | Starts the real API (`apps/api/src/server.ts`) on 127.0.0.1 with a fresh SQLite file, creates the owner, signs in and imports the snapshot. Can also start `latency-proxy.ts`. `serve.sh stop` stops what it started. |
| `latency-proxy.ts` | `bun` (started by `serve.sh`) | Reverse proxy on port+1 that sleeps `latency_ms` and then forwards each request. |
| `make-local-db.ts` | `bun` | `howmuch.sqlite` for local mode, built by the app's own engine bundle, as one self-contained file. |
| `bench-pages.sh` | `bash` | Times the three register pages (10 runs each by default) and prints the median, min and max. |
| `verify-linux.txt` | – | The recorded Linux verification run. |
| `.gitignore` | – | Ignores the generated `perf-snapshot.json` (7.5 MB) and `howmuch.sqlite` (15.4 MB). Regenerate them rather than committing them. |

## Commands

From the repository root (Linux or macOS; needs `bun` and `curl`):

```sh
bun install --frozen-lockfile                                  # if node_modules is missing
F=.amp/in/artifacts/perf-pass/fixture

bun $F/make-snapshot.ts            # -> $F/perf-snapshot.json   (~1 s)
bun $F/make-local-db.ts            # -> $F/howmuch.sqlite       (~3 s; needs perf-snapshot.json)

$F/serve.sh 8787                   # API on :8787, prints one JSON state line on stdout
$F/serve.sh 8787 120               # same, plus a +120 ms proxy on :8788 (proxy_url)
$F/bench-pages.sh http://127.0.0.1:8787 "$TOKEN" 10   # TOKEN = state line's "token"
$F/serve.sh stop                   # or: serve.sh stop 8787
```

Optional arguments and settings:

- `make-snapshot.ts [out.json]`
- `make-local-db.ts [out.sqlite]`, with `HOWMUCH_PERF_SNAPSHOT=<path>` to use another snapshot and `ENGINE_LOG=1` to stream the engine's console output.
- `serve.sh` reads `HOWMUCH_PERF_SNAPSHOT`, `HOWMUCH_PERF_STATE_ROOT` (default `$TMPDIR` or `/tmp`) and `HOWMUCH_PERF_KEEP=1`, which keeps the run directory on stop.

### serve.sh in detail

1. Refuses to start if its own instance already runs on that port, or if anything else answers on the port (or on port+1 when a proxy is wanted).
2. Creates a fresh run directory with `mktemp -d $STATE_ROOT/howmuch-perf/run.XXXXXX` and runs `bun apps/api/src/migrate.ts` on `howmuch.sqlite` in it.
3. Starts `bun apps/api/src/server.ts` with `nohup` in the background. Its environment is `HOWMUCH_DB_PATH`, `HOWMUCH_PORT`/`PORT`, `HOWMUCH_HOST=127.0.0.1`, `HOWMUCH_API_TOKEN=perf-bench-bootstrap`, `HOWMUCH_DEFAULT_PLAN_ID=plan_perfbench0000`, with YNAB and TypeSafe switched off. It writes `api.pid` and `api.log` next to the database and waits for `/health`.
4. `POST /api/auth/setup` (Origin header plus `Authorization: Bearer perf-bench-bootstrap`) creates the owner `perf` / `perf-bench-password-15` with an SGD currency format and `DD/MM/YYYY` dates.
5. `POST /api/auth/token` signs in and returns a bearer session token, the same flow the iOS app uses.
6. `POST /v1/plans/plan_perfbench0000/import_snapshot` sends `{"snapshot": <perf-snapshot.json>}` with `Idempotency-Key: perf-bench-import-0001` and expects HTTP 201.
7. With `latency_ms > 0`, it starts `latency-proxy.ts` on port+1 (`proxy.pid`, `proxy.log`).
8. It prints the state line and writes it to `state.json`:

```json
{"api_url":"http://127.0.0.1:8787","plan_id":"plan_perfbench0000","username":"perf","password":"perf-bench-password-15",
 "db_path":".../howmuch-perf/run.XXXXXX/howmuch.sqlite","pid":1234,
 "proxy_url":"http://127.0.0.1:8788","proxy_pid":1240,"latency_ms":120,
 "token":"<bearer session token>","setup_token":"perf-bench-bootstrap","run_dir":"...","import_seconds":1.1}
```

`proxy_*` and `latency_ms` appear only when a proxy was started. The static
`setup_token` is also accepted as a bearer token for the default plan.

`serve.sh stop [port]` sends TERM to the proxy and the API (KILL after 5 s)
and deletes the run directory. The script avoids GNU-only flags, arrays and
`readlink -f`, so it should work with macOS bash 3.2 and BSD tools. It was
only executed on Linux with bash 5.2.

### make-local-db.ts in detail

It mirrors `apps/ios/HowMuch/Engine/LocalDatabase.swift` and `LocalEngine.swift`:

- **Open.** It opens the file and runs `PRAGMA journal_mode = WAL`, `foreign_keys = ON` and `busy_timeout = 5000`.
- **Migrate.** It creates `_local_migrations` with the same DDL. Then it applies every `apps/ios/HowMuch/Engine/migrations/*.sql` not yet recorded, sorted by name. Each one runs with foreign keys off inside `BEGIN IMMEDIATE`, is recorded by name, must leave `PRAGMA foreign_key_check` empty, and is followed by `COMMIT`. Foreign keys are switched back on afterwards. On error it rolls back.
- **Engine context.** It evaluates `howmuch-engine.js` in a bare `node:vm` context. That context starts with no web globals, so the bundle's own JavaScriptCore polyfills run (TextEncoder, URL, URLSearchParams, Request, Response, Headers, crypto, setTimeout). It installs the same globals the app does: `__sqlite.exec`, `__random(n)` (an array of secure random bytes), `__log`, and the same `console` shim.
- **`__sqlite.exec`.** This copies `execJSON`, `run`, `bind` and `row`:
  - Parameters arrive as a JSON array. `null` binds as NULL, strings as text, booleans and integral numbers as int64, other numbers as double, and objects as JSON text with `/` escaped.
  - It prepares a single statement and returns `{"rows":[...],"changes":n}` or `{"error":"<sqlite message>"}`.
  - Integer and real columns come back as numbers, text as strings, BLOBs as arrays of byte values, and NULL as null.
  - Read-only statements report `changes: 0`.
- **Calls.** It calls `configure`, `handle` and so on through the same promise box that `LocalEngine.call` uses, and fails if a call has not settled after its microtasks run.
- **`configure`.** The config is `{"apiToken":"perf-local-engine-token","defaultPlanId":"plan_perfbench0000","timeZone":"Asia/Singapore","newPlanSettings":{SGD, DD/MM/YYYY}}`. `newPlanSettings` is what `PlanSettingsSeed.from(locale: en_SG)` produces.
- **Import.** It sends `handle("POST", "https://local.howmuch/v1/plans/plan_perfbench0000/import_snapshot", headers, {"snapshot": …})` with Bearer, JSON content type and `Idempotency-Key` headers, and expects 201.
- **Verify.** It reads back three transaction pages, `accounts`, `payees`, `categories`, `scheduled_transactions` and `settings` (5 runs each, timed in Bun). It also runs `integrity_check` and `foreign_key_check`.
- **Finalize.** It runs `PRAGMA wal_checkpoint(TRUNCATE)` and `PRAGMA journal_mode = DELETE`, closes the database and fails if a `-wal`, `-shm` or `-journal` file remains. It then reopens the file read-only and prints row counts for every table.

To load the file into a simulator, use the data container path that
`run-bench.sh` uses:

```sh
DATA="$(xcrun simctl get_app_container "$UDID" sg.soon.howmuch data)"
mkdir -p "$DATA/Library/Application Support/HowMuch/Local"
cp $F/howmuch.sqlite "$DATA/Library/Application Support/HowMuch/Local/howmuch.sqlite"
rm -f "$DATA/Library/Application Support/HowMuch/Local/howmuch.sqlite-"{wal,shm}
```

On a clean install with no saved `HowMuch.LocalPlanID`, **Start on this
iPhone** adopts the database's only live plan, `plan_perfbench0000`
(`LocalPlanRecovery`). The app's random engine token does not matter because
`configure` keeps the existing plan and its settings. Read the
starter-categories note below before benchmarking local mode.

## The dataset

`perf-snapshot.json` is 7,512,523 bytes, compact JSON. The import body
wrapped in `{"snapshot":…}` is 7,512,536 bytes, against the 8,388,608 limit,
so memos did not need shortening and all 14,000 rows fit. SHA-256 is
`4254189fbfa9815f9d149aad0c812b418a8c63a452cc4a0fbde7049a05f10e42` on every
run. Generation uses sfc32 with seed `0x20261014` and only integer or basic
IEEE arithmetic, with no `Math.exp`, `log` or `pow`, so the bytes should match
on macOS too.

- **Shape**
  - 14 category groups: 12 visible, a hidden "Archived" group, and the internal "Internal Master Category".
  - 95 categories: 2 internal ("Inflow: Ready to Assign", "Uncategorized"), 3 hidden and 2 deleted. The deleted ones are used only by rows up to 2021-06-30.
  - 728 payees:
    - 690 live named payees, "Synthetic Payee 001" to "Synthetic Payee 690"; 688 of them are used.
    - 10 deleted, unused payees (691–700).
    - 28 transfer payees, "Transfer : <account>".
  - 28 accounts: 20 on-budget open accounts, 5 tracking accounts and 3 closed accounts.
  - 32 schedules.
- **Transactions.** Exactly 14,000, dated 2020-10-01 to 2026-10-14.
  - Busiest: Everyday Account (4,222), Card A (3,011) and Card B (2,296) hold 68% of the rows.
  - Splits: 1,120 (8.0%), of which 786 have two lines and 334 have three, for 2,574 lines in total. 24 of those lines are quarterly salary splits whose second line is a transfer to Retirement Fund.
  - Transfers: 610 top-level transfer rows (4.4%). With the split-line sides that makes 634 sides, or 317 pairs, all paired on both sides as the schema requires. They cover card payments, Savings Pot deposits, quarterly Home Loan payments, investments, Cash Wallet top-ups and closing transfers.
  - Memos on 4,210 rows (30.1%), with about 6% long ones of ~140 characters. Flags on 725 rows (5.2%), with names on about 30% of those.
  - 40 unapproved rows, dated 2026-09-24 to 2026-10-14, in Everyday Account and Cards A–C.
  - Cleared state: 13,235 reconciled (each account up to its own reconciled-through date), 693 cleared and 72 uncleared (the most recent rows). Digital Wallet, Prepaid Transit Card and Travel Wallet are never reconciled.
  - Bank-style `import_id`, `import_payee_name` and `import_payee_name_original` on 7,866 rows. These are rows in Everyday Account, Cards A–C and Bills Account from 2021-03 onwards. `import_payee_name_original` also starts with "Synthetic Payee ".
- **Amounts** are integer milliunits in whole cents (multiples of 10). The plan currency is SGD: setup's `currency_format` on the server and `newPlanSettings` locally. A snapshot carries no settings.
- **Ids.**
  - Transactions and split lines: deterministic UUID-shaped ids.
  - Accounts: `acct-<key>`. Groups and categories: `grp-*` and `cat-*`.
  - Payees: `payee-001`…, and `payee-transfer-<key>` for transfer payees.
  - Schedules: `sched-01`…`sched-32`, with split lines `sched-NN-line-N`.
- **Schedules.** 32 in total: 2 split and 7 transfer, using the frequencies monthly, weekly, everyOtherWeek, twiceAMonth, every4Weeks, every3Months, every4Months, twiceAYear, yearly and never. `date_next` runs from 2026-10-16 to 2027-03-02, always after "today" (2026-10-15).
- **Role payees.** 001 employer, 002 bank (interest), 003 power utility (electricity and gas), 004 tenant (rent income), 005 water utility, 006 partner, 007 mortgage bank, 008 shared contributions, 009 investment platform, 010 mobile, 011 internet, 012 health insurer, 013 town council, 014 streaming, 015 software, 016 tax authority, 017 car financier, 018 valuer, 019 childcare, 020 school, 021 life insurer, 022 gym, 023 card issuer, 024 side income, 025 cashback, 026 gift giver. Payees 027–690 are spread over the discretionary categories with Zipf-like popularity.

### Accounts and transaction counts

| Account | Type | On budget | Closed | Transactions | Balance (SGD) |
| --- | --- | --- | --- | ---: | ---: |
| Everyday Account | checking | yes | no | 4,222 | 31,224.70 |
| Card A | creditCard | yes | no | 3,011 | -685.66 |
| Card B | creditCard | yes | no | 2,296 | -1,623.80 |
| Card C | creditCard | yes | no | 837 | -2,184.22 |
| Bills Account | checking | yes | no | 689 | 21,615.37 |
| Joint Account | checking | yes | no | 323 | 1,948.19 |
| Shared Expenses Account | checking | yes | no | 104 | 192.19 |
| Digital Wallet | checking | yes | no | 272 | 69.61 |
| Cash Wallet | cash | yes | no | 514 | 1,227.31 |
| Prepaid Transit Card | cash | yes | no | 161 | 97.12 |
| Travel Wallet | cash | yes | no | 19 | 40.12 |
| Card D | creditCard | yes | no | 138 | -1,655.22 |
| Card E | creditCard | yes | no | 67 | -1,863.30 |
| Card F | creditCard | yes | no | 58 | -1,484.48 |
| Line of Credit A | lineOfCredit | yes | no | 12 | -958.55 |
| Savings Pot 1 | savings | yes | no | 107 | 8,225.19 |
| Savings Pot 2 | savings | yes | no | 201 (2–4 every month, all 73 months) | 1,716.79 |
| Emergency Fund | savings | yes | no | 81 | 25,565.75 |
| Holiday Savings | savings | yes | no | 110 | 53.67 |
| Kids Savings | savings | yes | no | 101 | 1,586.33 |
| Investment Account A | otherAsset | no | no | 84 | 70,183.06 |
| Retirement Fund | otherAsset | no | no | 30 | 68,037.25 |
| Home Loan | mortgage | no | no | 96 | -349,943.83 |
| Car Loan | autoLoan | no | no | 57 | -6,700.00 |
| Property Asset | otherAsset | no | no | 6 | 726,437.48 |
| Old Card G | creditCard | yes | yes (2022-06-30) | 247 | 0.00 |
| Old Savings Account | savings | yes | yes (2023-03-31) | 39 | 0.00 |
| Old Wallet | cash | yes | yes (2021-12-31) | 118 | 0.00 |

## Observed on Linux

These timings are from the recorded run in `verify-linux.txt` (x86_64, bun 1.4.2, SQLite 3.53.2).

- **Snapshot import** through `serve.sh` took 0.9–1.7 s (curl `time_total`). Afterwards the API database is 15.1 MB, plus a 15.0 MB `-wal` that stays while the server runs.
- **Spot checks** (bearer session token):
  - `accounts`: 28 accounts, 9,342 B.
  - `transactions?limit=250`: 250 rows, 163,181 B, `has_more: true`.
  - `payees`: 718 payees (deleted payees are not listed), 66,125 B.
- **`bench-pages.sh`**, 10 runs each, median of curl `time_total`:

| Page | Direct API | Through the +120 ms proxy |
| --- | ---: | ---: |
| `?limit=100&offset=0` (2026-09-30..10-14) | 2.7 ms (2.4–3.6) | 124.5 ms |
| `?limit=250&offset=0` (2026-09-05..10-14) | 4.2 ms (3.7–6.9) | 126.8 ms |
| `?limit=100&offset=10000` (2022-06-17..06-30) | 4.7 ms (3.9–5.7) | 126.8 ms |

An earlier, unrecorded run gave 3.2, 4.2 and 5.9 ms.

- **`make-local-db.ts`** results:
  - Migrations 19/19 in ~40 ms, bundle load ~20 ms and import 1.9–2.5 s, all in Bun's JSC, not on a device.
  - Page reads in Bun, median of 5: 3.4, 7.7 and 4.7 ms for the same three pages.
  - `integrity_check` ok and `foreign_key_check` empty.
  - The output `howmuch.sqlite` is 15,441,920 bytes, `journal_mode=delete` (header bytes 18/19 = 1/1) and has no sidecar files.
  - Row counts: transactions 14,000; subtransactions 2,574; payees 728; categories 95; category_groups 14; accounts 28; account_month_balances 1,448; scheduled_transaction_edits 32; scheduled_subtransaction_edits 5; plans 1; write_commands 3; write_assertions 3; write_state 1; audit_events 1; `_local_migrations` 19. Every other table is empty.

## Surprises, deviations and caveats

- **Start on this iPhone adds starter categories to the seeded plan.** `AppModel.startOnThisDevice` runs `StarterCategories.seedIfNeeded` after it adopts the plan, and `HowMuchApp` runs it again on every local-mode launch until it completes. That adds 3 groups and 12 categories, including a second group named "Everyday" and "Bills" next to the fixture's own, plus a second "Groceries". I reproduced this against a copy of `howmuch.sqlite` through the engine: both creates returned 201 and left duplicate group names. The local-mode plan then differs from the server-mode plan. To prevent it, mark the seed as done for this plan before any launch:
  - Pass `-HowMuch.StarterCategoriesSeeded.plan_perfbench0000 YES` in `XCUIApplication.launchArguments` on every launch, or
  - write that key as a bool `true` into `$DATA/Library/Preferences/sg.soon.howmuch.plist` after install and before the first launch.

  I have not verified either on a simulator. The harness in `../harness/` does neither today.
- **Schedules start on 2026-10-16.** The local engine materialises due schedules on every launch and foreground (`runScheduledMaterialization`), but the Bun API has no cron. If the benchmark runs after 2026-10-16, local mode gains a few rows per elapsed week (32 schedules, including a weekly and an every-other-week one) and server mode does not.
- **"Today" is 2026-10-14/15.** The 40 unapproved rows and the uncleared rows are relative to that date. On a later date they are simply older.
- **Snapshots carry no settings**, so SGD is set at setup (server) or by `newPlanSettings` (local). The schema default is SGD anyway.
- **The size limit is on the request body**, `{"snapshot":…}`, not on the file. The script checks the wrapped size and would shorten memos, never drop rows, if it went over.
- **"~4% transfers" means 4.4% of rows are transfer sides** (610 top-level rows, or 317 pairs counting split lines). Counted as pairs it would be 2.2%.
- **Balances are plausible but synthetic.**
  - Opening balances of on-budget cash, checking and savings accounts are raised in whole S$100 steps, so the running balance never drops below a floor (S$800 for Everyday Account).
  - Cards A, B and G are paid in full every month, Card C quarterly and Cards D–F once a year.
  - Closed accounts end at exactly 0.00 through closing transfers.
- **There are no "Starting Balance" transactions.** Opening balances use `opening_balance`, because every non-transfer payee must start with "Synthetic Payee ".
- **Two small gaps in the Bun mirror of `LocalDatabase.run`.**
  - bun:sqlite does not expose `sqlite3_stmt_readonly`, so `changes` is 0 whenever `total_changes()` did not move, and otherwise `changes()`. This differs from Swift only for DDL statements, which the engine does not send at runtime.
  - bun:sqlite's `values()` returns `null`, not `[]`, for statements without result columns; the script handles that.
- **Bun is not iOS.** Bun's SQLite is 3.53.2, not the iOS system SQLite, and Bun's JavaScriptCore build is not the device's. Use the Bun timings for local mode only as a sanity check.
- **Bundle freshness was not checked.** `bun run check:ios-engine` insists on exactly Bun 1.4.0, and this machine has 1.4.2. `make-local-db.ts` uses the committed `howmuch-engine.js` and `migrations/` as they are, which is what the app ships.
- **The state line contains a live bearer session token** for the throwaway instance. `verify-linux.txt` redacts it.
- **Not executed on macOS.** `serve.sh` and `bench-pages.sh` were written for bash 3.2 and BSD tools but only run on Linux bash 5.2. The harness's server mode expects `serve.sh <port> <latency>` with the proxy on port+1, which is what this does.
