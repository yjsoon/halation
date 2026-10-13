# Web, scripts and docs bug hunt (round 4)

Base revision: `6fdf04e` (`claude/project-thread-xwo172`). Fix on branch
`worktree-agent-a2f583923659c7486`, commit `5a88c44`. Probes re-run at
`5a88c44` give the "after" results; "before" results were taken at `6fdf04e`
against the same stack before the fix was written.

## Setup

Disposable stack from `.cursor/skills/verify-howmuch`, own state root:

```sh
export PATH="$PWD/.cursor/skills/verify-howmuch/bin:$PATH"
HOWMUCH_VERIFY_STATE_ROOT=<scratch>/verify control-howmuch launch
# web http://127.0.0.1:35935, api http://127.0.0.1:57733, plan local-plan
```

Synthetic data: one schedule,
`POST /v1/plans/local-plan/scheduled_transactions` (Idempotency-Key
`r4-sched-gym-2`, bootstrap token)
`{"scheduled_transaction":{"account_id":"acct-everyday","date_first":"2026-11-01","frequency":"monthly","amount":-25000,"category_id":"cat-health","memo":"Synthetic gym"}}`.
The Jev call (`/api/tools/categorise`) is answered by a Playwright route; the
stack has no `TYPESAFE_API_KEY`. Everything else is the real page and API.

Run: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers PW_STATE=<scratch>/pw-state.json node <probe>.mjs`
(`common.mjs` signs in as `verifier` once and reuses the cookie).

## Findings

| Probe | Before (`6fdf04e`) | After (`5a88c44`) |
| --- | --- | --- |
| `editor-focus.mjs` schedule Edit, header Cancel | open: focus stays on the row's Edit; Cancel: BODY | open: Account select; Cancel: the row's Edit |
| same, Add schedule, footer Cancel | open: Add schedule; Cancel: BODY | open: Account select; Cancel: Add schedule |
| same, Reconcile, header and footer Cancel | open: Reconcile; Cancel: BODY | open: Account select; Cancel: Reconcile |
| same, Suggest categories review, Cancel | open: BODY (the button is disabled while Jev answers); Cancel: BODY | open: "Suggested categories" heading; Cancel: Suggest categories |
| same, bulk Delete confirmation, Cancel | open: Cancel; Cancel: BODY | open: Cancel; Cancel: the bulk bar's Delete |
| `editor-save-focus.mjs` schedule Save changes | (not run before) | memo saved ("Synthetic gym 87" listed); focus on Add schedule |
| same, review Apply | (not run before) | toast "Categorised 1 transaction."; focus on + Add transaction |
| `reconcile.mjs` keyboard reconcile at the cleared balance | (not run before) | preview difference $0.00; toast "Everyday Account reconciled through 13 Oct 2026…"; focus on Reconcile; API `last_reconciled_date` 2026-10-13, `cleared_balance` 185000000 |

Regression check of round 3b's focus fixes at `5a88c44` with the r3b probes
(`WEB=http://127.0.0.1:35935`): `keyboard.mjs` (row after Esc and Enter-save,
memo persisted), `compose-focus.mjs` (+ Add transaction after Esc and save),
`delete-focus.mjs` (Cancel on open, row after Cancel), `bulk-clear-focus.mjs`
(select-all), `toast-focus.mjs` (+ Add transaction): all unchanged.

`phone-overflow.mjs` (390x844, touch): no page scrolls sideways on any route,
nor with the schedule editor (plain and split), the reconcile editor or the
compose row open. With the compose row open the root's scrollWidth is 567,
but that is the register table inside its own scrolling wrapper under a
`overflow-x: clip` root; `scrollTo(1000, 0)` leaves `scrollX` at 0.

Checks: `bun run typecheck` and `bun test` in `apps/web` (404 pass).
