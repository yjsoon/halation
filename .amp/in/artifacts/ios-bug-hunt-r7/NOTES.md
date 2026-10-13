# iOS bug hunt round 7: E2E evidence

Base revision: `25d1645` (rounds 1 to 6 merged). No Swift toolchain was
available, so Swift was reviewed by reading only. Every request body the app
builds was reproduced from its Encodable models (`JSONEncoder` with
`.convertToSnakeCase`; `TransactionWriteRequest` writes nil optionals as
explicit `null`, synthesised models omit them) and sent through the shipped
on-device engine. No remote service was used; all data is synthetic.

## Harness

`engine-harness.ts` runs `apps/ios/HowMuch/Engine/howmuch-engine.js` in a bare
`node:vm` context the way `LocalEngine.swift` runs it in `JSContext`: the
`__sqlite.exec`, `__random` and `__log` globals, the bundled migrations
applied with foreign keys off then on, and parameters bound as
`LocalDatabase.bind` binds them (bun:sqlite underneath). The bundle's own
polyfills (URL, URLSearchParams, TextEncoder, Request, Response, Headers)
are exercised because the context has none of its own; `NATIVE_GLOBALS=1`
hands it the host's web APIs instead, to tell a polyfill defect from an API
defect. Run every script from the repo root with Bun 1.4.0; each takes an
optional engine directory (default `apps/ios/HowMuch/Engine`).

## 1. Round 6 typed body checks against every iOS body

Script: `ios-bodies-e2e.ts`. Account create (with and without icon, tracking),
account rename and icon, category group and category create, transaction
create (new payee with nulls, no payee or category, flag and memo, unapproved
share intake, inflow, legacy queued create with no `id`, replayed create),
transfer and transfer to tracking, split with a transfer line, full PUT edits
(cleared and import_id omitted, split lines with ids and mirror ids, unsplit),
single and bulk approve, cleared toggle, guarded delete, schedule create,
edit, enter occurrence, split schedule, the daily catch-up, reconcile preview
and reconcile, reward card create, update, delete, rewards settings, and a
snapshot export imported into a fresh engine.

Result: 48 checks, 0 failures (`ios-bodies-after.txt`). No iOS body sends a
null, number, empty id or array the new checks reject. The web client
(`apps/web/src/api/client.ts`, `lib/register-row-edit.ts`, `QuickEntry.tsx`:
empty ids sent as `|| null`) and `scripts/smoke.ts` were checked by reading
and send nothing the checks reject either.

`snapshot-roundtrip-e2e.ts` exports a plan with splits, transfers,
schedules, a reconciliation, a reward card and settings from one engine,
imports it into a fresh one and diffs the two exports: no differences.

## 2. Register search missed non-ASCII capitals

SQLite's `lower()` (bun:sqlite, D1, the app's SQLite) folds ASCII only, but
the search needle was lowered in JavaScript, so `q=Ōtsuka` looked for
`ōtsuka` in `lower('Ōtsuka') = 'Ōtsuka'` and found nothing, however it was
typed. Same on the server and the on-device engine (`NATIVE_GLOBALS=1` gives
the same result, so it is not a polyfill defect). Fix in
`packages/register-query/src/index.ts`: also search the needle with only its
ASCII letters folded.

Script: `unicode-search-e2e.ts`. Before: the committed engine at `25d1645`
(`unicode-search-before.txt`). After: the rebuilt engine
(`unicode-search-after.txt`).

| Search | Expected | Before | After |
| --- | --- | --- | --- |
| `鼎泰豐`, `Café ☕ & Co`, `A+B Mart`, `50% Off` | 1 hit each | 1 | 1 |
| `Ōtsuka` (as stored) | 1 | 0 | 1 |
| `ŌTSUKA` for `Ōtsuka` | 1 | 0 | 1 |
| `ōtsuka` for memo `ōtsuka memo` | 1 | 1 | 1 |
| `CAFÉ` for `Café ☕ & Co` | 1 | 1 | 1 |

Limit left as is: a lower-case `ōtsuka` still cannot find `Ōtsuka`, as
SQLite has no Unicode case folding without ICU.

`bun test` in `apps/api` (443 tests) and `packages/register-query` pass after
the fix.
