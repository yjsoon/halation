# Web, scripts and docs bug hunt (round 2)

Base revision: `41a61b5` (`claude/project-thread-xwo172`). Fixes are on branch
`worktree-agent-ab3a4c15ed4295df7`, commits `23a908b`, `06678fe`, `b0b381d`,
`4e0b78d` and `1e95b0e`.

## Setup

Disposable stack from `.cursor/skills/verify-howmuch` with its synthetic fixture:

```sh
PATH="$PWD/.cursor/skills/verify-howmuch/bin:$PATH" control-howmuch launch
control-howmuch state   # web 127.0.0.1:42845, api 127.0.0.1:41995, plan local-plan
```

Browser checks use Playwright Chromium (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`)
through `common.mjs`, which signs in as the fixture user `verifier`.
Teardown: `control-howmuch cleanup`.

## 1. Schedule editor kept the first schedule's fields (`06678fe`)

Setup: the fixture has no schedules, so two were created with the bootstrap token:
`POST /v1/plans/local-plan/scheduled_transactions` for "Rent" (memo A,
acct-everyday) and "Gym" (memo B, acct-credit).

Steps (`node sched.mjs`, then `SAVE=1 node sched.mjs`): open /scheduled, press
Edit on the first schedule, then press Edit on the second without closing.

- Expected: the editor shows the second schedule's amount and memo, and Save
  writes them to the second schedule.
- Before: the editor kept showing the first schedule's amount and memo. Save
  sent a PATCH to the second schedule with the first one's fields, and
  `GET /v1/plans/local-plan/scheduled_transactions` confirmed that the Gym schedule
  had been overwritten with Rent's memo and amount. It was restored with a
  PATCH afterwards.
- After: the editor shows the second schedule's fields, and saving leaves both
  schedules intact (`schedule-editor-switch-after.png`).

Cause: `ScheduleEditor` copies its schedule into `useState` once, and it is
rendered without a `key`. Fix: key the editor by schedule id (or `create`).

## 2. Vite dev proxy captured the /api-tokens page (`b0b381d`)

Steps: run `curl -H 'Accept: text/html' http://127.0.0.1:42845/api-tokens`, or
reload /api-tokens in the dev server.

- Expected: 200 `text/html` (the SPA).
- Before: the `/api` proxy key is a prefix match, so the request went to the
  API, which answered 404 JSON. Reloading or deep-linking the API tokens page
  in development failed.
- After: `200 text/html`. `/api/auth/status` and `/v1/plans` still proxy
  (200 JSON).

## 3. Spending meta line counted groups as categories (`4e0b78d`)

Steps (`node spend.mjs`): open `/spending?range=all` and a March range.

- Expected: "N categories" equals the number of category rows in the table.
- Before: N was `grouped.length`, the number of category groups
  (`spending-category-count-before.png`).
- After: with range=all the line shows 7 categories, matching the 7 category
  rows. For March it shows 4, also matching (`spending-category-count-after.png`).

## 4. Documentation safety fixes (`23a908b`, `1e95b0e`)

These were checked against `apps/worker/wrangler.jsonc` and the Wrangler
`d1 export` name resolution. No remote command was run.

- In `docs/deployment.md`, the restore export named `howmuch-production` with
  `--env tk`. Wrangler resolves that name in the Tinkertanker account to the
  frozen KIX snapshot, not the live `howmuch-production-sg`. The command now
  names `howmuch-production-sg`.
- In the same file, the "Preview" block also held the production migration and
  deploy commands. They now sit under a separate production heading that
  requires a backup first.
- `docs/d1-foundation.md` said migrations end at 0018 and that Wrangler binds
  `howmuch-production`. It now lists 0019 and names `howmuch-production-sg` (env
  `tk`) as the production binding, with both `howmuch-production` databases
  marked as frozen.

## Regression checks

After all the fixes, at `1e95b0e`:

- `bun test`: 887 pass, 0 fail.
- `bun run --cwd apps/web typecheck`: clean.
