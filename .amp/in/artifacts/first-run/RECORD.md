# First-owner setup without a setup token

Recipe: `.cursor/skills/verify-howmuch/features/first-owner-setup.md` (setup-tokenless, setup-token-note, setup-wrong-token, setup-currency-names), plus the add-account type note.

Browser runs: `ff538a1d` with this round's worktree changes. Checks: rebased onto `2b381c7b`; `scripts/check.sh` passes with HowMuchTests on an iPhone 17 simulator (iOS 27.3, both accessibility settings on): 822 run, 0 failures. Browser: agent-browser Chromium, viewports 1280x900 and 390x844 at 2x. Screenshots are shown in the thread, not committed.

## Setup

Two local Workers (`scripts/local-worker.sh`, env `local`, fresh D1 in `/tmp`), each behind its own Vite:

- No token: `scripts/local-worker.sh prepare /tmp/d1-notoken`, then `start /tmp/d1-notoken 8788 --inspector-port 9230` with `apps/worker/.dev.vars` moved aside; Vite on 5174 with `HOWMUCH_API_URL=http://127.0.0.1:8788`.
- Token: `cp apps/worker/.dev.vars.example apps/worker/.dev.vars`, `prepare /tmp/d1-token`, `start /tmp/d1-token 8787 --inspector-port 9231`; Vite on 5173.

## Before (ff538a1d)

- No token: `GET /api/auth/status` returned `setup_required: true, bootstrap_required: false, setup_blocked: true`. The page showed "This server needs a setup token" with steps to run `openssl rand -hex 32` and `wrangler secret put HOWMUCH_API_TOKEN`, and no form.
- Token: the form had a required Setup token field, the note "The HOWMUCH_API_TOKEN secret you set when deploying this server", and the line "This setup token is used once and is not stored in this browser" (it is not used once: it stays valid for default-plan integrations).
- New account: Type note read "Budget account: cash, savings and cards you spend from." under an optgroup named Budget.

## After

- No token: status `{"setup_required":true,"bootstrap_required":false,...}` (no `setup_blocked`). The setup form shows Username, Password, Currency, Date format and Create account, with no token field. Filled `newowner` / a 21-character password, chose Create account: the title became `Ledger · Halation` and status then reported `setup_required: false`.
- Token: Setup token field present with the note "This server asks for one because HOWMUCH_API_TOKEN is set on it. Enter the same value. About the setup token". `wrong-token` gave the alert "That setup token does not match…" and stayed on the form; the right token landed on `Ledger · Halation`. No "used once" line.
- Currency options read `SGD · Singapore Dollar | USD · US Dollar | EUR · Euro | GBP · British Pound …` on setup and in Settings; no clipping at 390 px.
- New account: optgroups `Spending,Tracking`; Type note "Cash, savings and cards you spend from."

## API contract

`bun test apps/api/tests/d1.test.ts -t "first visitor"` failed on the base code (a tokenless setup was refused with 403) and passes after the change: with no token, the Worker on a public origin refuses a cross-origin setup (403), refuses a guessed bearer (401), accepts the first same-origin setup (200) and refuses a second (409).

## Round 2: time zone and locale guess

Fresh no-token Worker (`/tmp/d1-tz`, migrations through 0025) behind Vite on 5174. Browser started with `TZ=Asia/Singapore`; `Intl` reported `Asia/Singapore` and `navigator.language` `en-US`.

- Before (round 1 screenshots, same language): setup guessed `USD · US Dollar` and `Month first`.
- After: setup preselected `SGD · Singapore Dollar | Day first (24 May 2026)`. Created `owner`; `GET /v1/plans/local-plan/settings` returned `{"tz":"Asia/Singapore","cur":"SGD","date":"DD/MM/YYYY"}`.
- Settings: Time zone select (418 options) showed `Asia/Singapore`; chose `Europe/London`, Save formats showed "Formats saved…", and settings then returned `time_zone: "Europe/London"`.
- API: `d1.test.ts` "Worker materialises on the plan's own time zone, set at setup" (written first, failed with `HOWMUCH_TIME_ZONE is required`) now passes: a bad zone is a 400, an Auckland plan's schedule due 21 Aug is not entered at 11:05 UTC on 20 Aug and is entered at 12:05 UTC.

## Round 2: empty Ledger

Same stack, owner with no accounts, 1280 and 390 px.

- Before (round 1): `$0.00` balance with cleared/uncleared line, Filters, Search, a `+ Add your first account` button, an "Add your first account" panel with a `Create one` link, a `0 transactions · $0.00 in…` footer and keyboard hints.
- After: `main` text is `Ledger / Start with an account / Transactions live in accounts. Add the one you spend from most, with today’s balance. / + Add your first account`; the accessibility tree has only the heading and that link in `main`.
- Choosing it opened `/accounts/new`; creating `Everyday` with 500 led to its register with `+ Add transaction`, `Reconcile` and Search, and `/` then showed the full Ledger again.
