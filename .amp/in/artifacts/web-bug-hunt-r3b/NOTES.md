# Web, scripts and docs bug hunt (round 3b)

Base revision: `cc4392f` (`claude/project-thread-xwo172`). Fixes are on branch
`worktree-agent-aebb7abdcd8b96947`, `3376c54` to `831ba13`. Final probe run at
`831ba13` (all probes below report the "after" result).

## Setup

Disposable stack from `.cursor/skills/verify-howmuch`, with its own state root
so it cannot collide with another agent's stack:

```sh
export PATH="$PWD/.cursor/skills/verify-howmuch/bin:$PATH"
HOWMUCH_VERIFY_STATE_ROOT=<scratch>/verify control-howmuch launch
# web http://127.0.0.1:58735, api http://127.0.0.1:47733, plan local-plan
```

Synthetic data added with the fixture's bootstrap token
(`Authorization: Bearer howmuch-verify-bootstrap`):

- `POST /v1/plans/local-plan/accounts` `{"account":{"name":"Synthetic Mortgage","type":"mortgage","balance":-100000000}}`
- `POST /v1/plans/local-plan/transactions`: Everyday to that account's
  `transfer_payee_id`, 2026-10-05, -1,500.00, category `cat-investing`
- `POST /api/import/rewards-tracker` with `fixtures/rewards-tracker-export.json`
  (card `card-travel`)
- `POST /v1/plans/local-plan/scheduled_transactions` (Idempotency-Key
  `r3b-sched-gym-1`): Everyday, monthly from 2026-11-01, -25.00, `cat-health`
- one personal API token, created by `CREATE_TOKEN=1 node confirm-focus.mjs`

Probes are Playwright Chromium scripts in this folder (`common.mjs` signs in
as `verifier` once and reuses the cookie via `PW_STATE`; the sign-in route is
rate limited). `WEB=<web url> ./run-all.sh` re-runs them. "Before" results
were taken by checking the touched files out at the parent commit, running the
probe, and re-applying the fix.

## Findings

| Commit | Probe | Before | After |
| --- | --- | --- | --- |
| `c4f26c2` status lines | `statement.mjs` (provider call answered by a Playwright route) | "1 row.Review dates" (from `1734177`'s diff) | "1 row. Review dates" |
| `2a6fcc5` drill-down | `drilldown.mjs` | Spending shows Investing $1,500.00, 1 txn; drill-down "No transactions match these filters." (`drilldown-before.png`) | the mortgage payment is listed (`drilldown-after.png`) |
| `5c4d13d` row Esc/Enter | `keyboard.mjs` | Esc and Enter-save leave focus on BODY | focus on the row; memo persisted (read back from `/v1/.../transactions/{id}`) |
| `42a5867` compose close | `compose-focus.mjs` | Esc leaves focus on BODY, so the next Enter does nothing (probe timed out) | focus on "+ Add transaction" after Esc and after save |
| `638b47a` icon popover | `icon-focus.mjs` | BODY after Esc and after choosing | the icon button; original icon restored |
| `776f7a8` delete confirm | `delete-focus.mjs` | focus stays on the row; 5 Tabs never reach the confirmation | Cancel focused; after Cancel, the row |
| `947cdec` filter menu | `multiselect-focus.mjs` | BODY after Clear selection and after Esc | filter box, then the trigger |
| `cbb93e1` Clear filters | `clear-filters-focus.mjs` (1280 and 390 px) | BODY | "All" (desktop), "Filters" toggle (phone) |
| `bc0603d` bulk clear | `bulk-clear-focus.mjs` | BODY | select-all checkbox |
| `108e03f` Rewards Done | `rewards-done-focus.mjs` | BODY | "Select" |
| `acb13fe` toast dismiss | `toast-focus.mjs` | BODY | "+ Add transaction" |
| `831ba13` confirmations | `confirm-focus.mjs` | schedule delete/enter and card delete: opener keeps focus, Cancel gives BODY; token revoke: BODY throughout | Cancel focused on open; opener (or the new Revoke) after Cancel |

`917125c` (dev-stack port) was checked from the shell: with a decoy
`python3 -m http.server 8787` answering `DECOY-8787`, `HOWMUCH_PORT=8788 bash
scripts/dev-stack.sh` at the parent commit gave an API pane with
`EADDRINUSE` and `curl :5173/api/health` returned `DECOY-8787`. At the fix,
the API listened on 8788 and the same curl reached it (`401` JSON from the
real API). tmux 3.4 with a server already running.

`contrast.mjs` scanned every page in all three looks, light and dark: no
enabled text under WCAG AA. The sidebar group chevron glyph measures 2.9:1 on
Overexposed light (non-text, 3:1 target); left as is.

Checks: `bun run typecheck` and `bun test` in `apps/web` (404 pass) after each
web fix.
