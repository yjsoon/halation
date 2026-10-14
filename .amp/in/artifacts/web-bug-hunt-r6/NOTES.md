# Web, scripts and docs bug hunt (round 6)

Base revision: `3c0292c` (`claude/project-thread-xwo172`, rounds 1 to 5 merged).
Fix: `82ec9a4` fix(web): read a comma-decimal plan's typed comma as its decimal mark.

## Setup

Disposable stack from `.cursor/skills/verify-howmuch`, own state root:

```sh
export PATH="$PWD/.cursor/skills/verify-howmuch/bin:$PATH"
HOWMUCH_VERIFY_STATE_ROOT=<scratch>/verify control-howmuch launch
# web http://127.0.0.1:46997, api http://127.0.0.1:38997, plan local-plan
```

Synthetic data, written straight into that run's private SQLite file (the
server validator only accepts "." and "," separators from the web form; a
comma-decimal plan comes from a YNAB or Rewards Tracker import):

- `plans.currency_format_json` for `local-plan`:
  `{"iso_code":"EUR","example_format":"123.456,78","decimal_digits":2,"decimal_separator":",","symbol_first":false,"group_separator":".","currency_symbol":"€","display_symbol":true}`
- for `crawl.mjs` only: very long names on `acct-everyday`, the payee
  "Straits View Residences", the category "Groceries" and three memos
  (each padded with "Supercalifragilisticexpialidocious"); `report_cache` emptied.

Run: `WEB=... API=... PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers PW_STATE=<scratch>/pw-state.json node <probe>.mjs`

## Bug: typed "12,50" stored as 1250.00 in a comma-decimal plan

`formatMoney` (since `0fe90e5`) shows such a plan's amounts as "12,50€", but
`parseMilliunits` dropped every comma, so typing what the page shows into an
amount field (register compose row, row editor, schedule editor, reconcile
statement balance, quick entry split lines) stored a hundred times the amount.

Failure mode written down before the fix; isolated test added first in
`apps/web/src/lib/money.test.ts` ("reads the plan's comma decimal mark as the
page shows it"), failing with `Expected: 12500, Received: 1250000`.

`compose-comma.mjs`: Ledger for Everyday, + Add transaction, payee
"Synthetic comma cafe", Outflow "12,50", blur, Save; then
`GET /v1/plans/local-plan/transactions?since_date=2000-01-01` (bootstrap token).

| Revision | Outflow after blur | Stored amount |
| --- | --- | --- |
| before fix (`money.ts` at `3c0292c`) | `1250.00` | `-1250000` |
| after fix | `12.50` | `-12500` |

Page amounts in both runs used the plan separators ("554.677,70€"). A rerun
after the fix (third row, `-12500`) left `compose-comma.png`.

## Full pass after the fix

`crawl.mjs` (comma plan, long names) at 1280 and 390 px over every route plus
report filter variants: no page errors, no NaN/undefined/Infinity, no
dot-decimal money, no horizontal page overflow.

Checks: `bun run typecheck`, `bun test` (405 pass) and `bun run build`
(vite build) in `apps/web`; `.github/workflows/deploy.yml` parses as YAML.
