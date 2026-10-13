# Web, scripts and docs bug hunt (round 7)

Base revision: `25d1645` (`claude/project-thread-xwo172`, rounds 1 to 6 merged).
Fixes:

- `fedc72d` fix(web): show a comma-decimal plan's comma in fields, axes and percentages
- `3820246` fix(web): read a comma-decimal plan's comma in a register amount sum

## Setup

Disposable stack from `.cursor/skills/verify-howmuch`, own state root:

```sh
export PATH="$PWD/.cursor/skills/verify-howmuch/bin:$PATH"
HOWMUCH_VERIFY_STATE_ROOT=<scratch>/verify control-howmuch launch
# web http://127.0.0.1:42329, api http://127.0.0.1:37805, plan local-plan
```

Synthetic data, written straight into that run's private SQLite file with a
small `bun:sqlite` script (`UPDATE plans SET currency_format_json = ?`, then
`DELETE FROM report_cache`):

- `comma-display.mjs`, `schedule-comma.mjs`, `crawl.mjs`:
  `{"iso_code":"EUR","example_format":"123.456,78","decimal_digits":2,"decimal_separator":",","symbol_first":false,"group_separator":".","currency_symbol":"€","display_symbol":true}`
- `space-group.mjs`: the same with `"group_separator":" "` and
  `"example_format":"123 456,78 €"`.
- `schedule-comma.mjs` posts its own schedule to the local API (amount -12500,
  memo "Synthetic r7 schedule").

Run: `WEB=... API=... PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers PW_STATE=<scratch>/pw-state.json node <probe>.mjs`

## Defect 1: dot decimals left in a comma-decimal plan's page

`formatMoney` shows such a plan's amounts as "12,50€", but the compose row and
row editor fields (after blur, and when an editor opens), the schedule
editor's amount and split lines, the chart axis and the Spending and Income
percentages still used a dot. Display only; nothing stored was wrong.

## Defect 2: "12,5+1" refused in a comma-decimal plan

`parseMilliunits` reads "12,5" since round 6, but the row editor's sum
tokenizer took only a dot, so "12,5+1" was refused with "Enter an outflow or
an inflow." (the field kept its text).

`comma-display.mjs` (compose "12,5", blur, Save; row editor sum "12,5+1",
Enter; then /spending and /income):

| Observation | before (`25d1645`) | after |
| --- | --- | --- |
| compose outflow after blur | `12.50` | `12,50` |
| stored after compose | `-12500` | `-12500` |
| row editor outflow prefill | `12.50` | `12,50` |
| stored after "12,5+1" | `-12500`, alert "Enter an outflow or an inflow." | `-13500`, no alert |
| Spending shares | `74.0%`, `59.5%` | `74,3%`, `59,7%` |
| Income savings rate | `80.4%` | `80,5%` |
| Income chart axis | `0`, `2.0k`, `4.0k` | `0`, `2,0k`, `4,0k` |

(The shares move between runs because each run adds its own transaction.)
`income-comma.png` is from the after run.

`schedule-comma.mjs` (after): editor prefill `-12,5`; typed `-12,75`, Save;
API amount `-12750`.

`space-group.mjs` (after, group " "): page shows `554 651,70€`; compose
"1 234,5" blurs to `1234,50` and stores `-1234500`; API search
`q=1 234,50€` returns "Synthetic r7 space".

## Checked, no defect

- Web write bodies against the round 6 strict checks: every optional id is
  sent as `x || null` (never ""), memos are trimmed to null, quick entry and
  schedule bodies only send strings, booleans or null for typed fields.
- `parseMilliunits` in a comma plan with "." or " " grouping, register search
  (`packages/register-query`) with the same formats, dot plans unchanged
  ("1,000" still 1000; "12,5+1" still refused there).
- `crawl.mjs` (comma plan) at 1280 and 390 px over every route: no page
  errors, no NaN/undefined/Infinity, no dot-decimal money, no overflow.

Checks: `bun run typecheck`, `bun test` (405 pass) and `bun run build` in
`apps/web`; `bun test` in `packages/register-query`.
