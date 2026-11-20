# Payee defaults: usual category and per-account flag colour (web, iOS local mode)

- Base revision: 2258ef81 plus this round's uncommitted changes
- Recipe: `.cursor/skills/verify-howmuch/features/register-compose.md`, sub-feature `compose-payee-defaults`
- Data: synthetic only (`fixtures/demo-ledger.json` plus the rows below)

## Web, real Worker on local D1

Stack: `control-howmuch launch` (wrangler dev, local D1 with migration 0024 applied), owner `verifier` created through `POST /api/auth/setup`.

Seed (bearer session from `POST /api/auth/token`), all payee `Verify Grab`, category `cat-transport`, typed by name so D1 stores no payee id:

| Account | Date | Flag |
| --- | --- | --- |
| acct-credit (Travel Card) | 2026-11-01 | purple |
| acct-credit | 2026-11-03 | purple |
| acct-credit | 2026-11-05 | red |
| acct-everyday | 2026-11-06 | green |

Rewards card `card-verify` on acct-credit with `flagNames: { purple: "Transport" }`.

1. `GET /v1/plans/local-plan/payee_defaults?payee_name=verify%20grab&account_id=…`: acct-credit `{"category_id":"cat-transport","flag_color":"purple"}`, acct-everyday `{"category_id":"cat-transport","flag_color":"green"}`, acct-saver `{"category_id":"cat-transport","flag_color":null}`. Pass.
2. Travel Card register, + Add transaction, payee `Verify Grab`: Category `Transport`, flag radio `Transport` (purple, named by the card) checked. Outflow 5.00, Save. Stored row: `category_id cat-transport, flag_color purple, flag_name Transport, amount -5000`. Pass.
3. Ledger (all accounts), + Add transaction, account Everyday Account, payee `verify grab`: Category `Transport`, radio `Green` checked. Change account to Travel Card: radio `Transport` (purple) checked. Pick Blue, change account back to Everyday Account: Blue stays. Pass.
4. Quick entry `/add?account=acct-everyday`, payee `Verify Grab`: Category `Transport`. Pass.
5. Stale flag name: row on acct-everyday (no card) created with `flag_color purple, flag_name Transport`; `PATCH {flag_color: green}` returns `flag_name null`; resending `green` with a memo edit keeps `null`. Pass.

## iOS, on-device engine (Mac satellite, macos-27, iPhone simulator)

Temporary tests in `LocalModeTests` (not committed) drove `APIClient` → `LocalEngine` → bundled engine → SQLite, which logged `applied 24 migrations`, with the same seed on two local accounts:

1. `fetchPayeeDefaults("verify grab", card)` → `flagColor purple`; `("Verify Grab", cash)` → `flagColor green`. Pass.
2. The real `TransactionFormView` (new draft, payee `verify grab`) over a local-mode `AppModel`: accessibility labels `Category, Transport`, `Account, Travel Card`, `Flag, Purple`; then `Category, Transport`, `Account, Everyday Account`, `Flag, Green`. Simulator screenshots inspected. Pass.

## Checks

- `bun test`: 814 pass, 0 fail (includes the new HTTP regression test for the stale flag name, which failed before the fix).
- `scripts/ios-xcodebuild.sh test`: fresh build-for-testing exit 0; 823 tests. 10 Capture snapshot tests failed first with empty accessibility labels (simulator accessibility not yet enabled), then passed after enabling it: CaptureSnapshotTests and RegisterSnapshotTests, 33 tests, 0 failures.

## Review fixes (Fable review of 5bdf46dd)

Base: origin/main c388435a plus this round. Same stack and seed as above.

1. Full-body edit: `PUT` with account, date, amount, unchanged `flag_color purple` and a new memo on a no-card row named "Transport" returns `flag_name Transport` (was null). Bulk PATCH of the same shape keeps it too; both are in `api.test.ts` and failed before the fix.
2. Names: a row stored as `Grab  Food` (two spaces) is found by the same name; `VERIFY GRAB` on Travel Card gives `cat-transport`/`purple`. Web now sends the name as typed (snapped to a known payee's spelling), not lowercased. Matching ignores ASCII case only, so `café` does not find `CAFÉ`.
3. Category query uses `INDEXED BY idx_transactions_payee_name_recent`: `SEARCH ... (plan_id=? AND payee_name_snapshot=?)` plus a temp sort over that payee's rows, with no statistics. A new index (tried as 0025) was dropped: it made the plan-wide unapproved count switch off the register index.
4. Choices: web compose, Ledger, Travel Card. Blue picked before typing `Verify Grab` stays Blue (category fills Transport). Untouched row fills Transport + purple ("Transport"). Clearing the flag to None and switching to Everyday Account keeps None. Reducer probe: a hand-picked value survives a later empty answer; a Duplicate for today copy keeps its empty category and flag.

Checks: `bun test` 769 pass, 0 fail; web and worker typechecks; iOS lints; engine freshness; `HowMuchTests` 822 tests, 0 failures (Mac satellite).
