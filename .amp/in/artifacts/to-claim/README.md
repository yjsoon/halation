# To claim flag: E2E evidence

Synthetic data only. `api-e2e.ts` builds its own in-memory stacks (D1 and
SQLite) through the real HTTP handler. The web, claims-tool and conversion
runs use the disposable stack from
`.cursor/skills/verify-howmuch/bin/control-howmuch launch` (plan `local-plan`),
relaunched fresh before the web run. "Branch head" below is the commit that
adds this README revision; each run was made on that tree before committing.

| Run | Revision | Command | Result |
| :-- | :-- | :-- | :-- |
| API, D1 and SQLite engines | branch head | `bun .amp/in/artifacts/to-claim/api-e2e.ts` | ALL PASS (39 checks per engine) |
| Web | branch head | `node .amp/in/artifacts/to-claim/web-e2e.cjs` | ALL PASS (24 checks), screenshots `web-1` to `web-7` |
| Claims tool against this API | branch head + this-claimer `claude/howmuch-claim-flag` head | `CLAIMER=/path/to/this-claimer node .amp/in/artifacts/to-claim/claimer-e2e.cjs` | ALL PASS (12 checks) |
| Memo conversion | branch head | see below | as expected |
| iOS build and tests (Devin macOS) | b149697 | `scripts/ios-xcodebuild.sh test` | 806 executed, 0 failures, 1 skipped (opt-in live model test) |
| iOS simulator pass (Devin macOS, local mode) | b149697 | To claim chip, To confirm chip, filter menu, dark mode | as described, screenshots `ios-*` |

The claims tool's fallback for an older HowMuch (no `claim_status`) is
covered by its own `npm run smoke:worker-claims`, which models both server
versions; this folder only runs it against this branch's API.

## Memo conversion run

1. `bun .amp/in/artifacts/to-claim/convert-seed.ts` creates rows through the
   API, then writes legacy memo words straight to SQLite, as rows stored
   before the release would be: `TODO: Example taxi`,
   `CLAIMED - 2026-01-02: Example lunch`, `TOCHECK Example hotel`,
   `TOCHECK TODO: Example flight`, `CLAIMED: Example bus`, `todo dinner`,
   `TODO: Example notebooks` on a row whose claim is already set, a transfer
   pair sharing `TODO: Example card top-up`, a transfer pair whose sides
   differ, and a transfer made from a split line with `TODO: Example transfer line`.
2. Dry run: `HOWMUCH_TOKEN=howmuch-verify-bootstrap bun scripts/convert-follow-up-memos.ts --api-url <api_url> --plan local-plan`.
   Observed: will convert 7 (the pair once; one more is the web run's
   `TOCHECK TODO: Example hotel` row); left as text 3; needs a look 2 (the
   notebooks row and the differing pair); split lines and their transfer side
   left alone 2.
3. The same command with `--apply`: `Applied: 7 converted, 0 skipped, 0 refused, 0 not as expected.`
4. Dry run again: will convert 0, with the same lists.
5. `GET /transactions/:id` for each seeded row:

| Row | Memo after | claim_status | claimed_on | needs_confirmation |
| :-- | :-- | :-- | :-- | :-- |
| todo | Example taxi | to_claim | null | false |
| claimed | Example lunch | claimed | 2026-01-02 | false |
| tocheck | Example hotel | null | null | true |
| both | Example flight | to_claim | null | true |
| claimedBare | Example bus | claimed | null | false |
| prose | todo dinner | null | null | false |
| setAlready | TODO: Example notebooks | to_claim | null | false |
| pair, outflow side | Example card top-up | to_claim | null | false |
| pair, inflow side | Example card top-up | to_claim | null | false |
| differing pair, outflow | TODO: Example refund | null | null | false |
| differing pair, inflow | Example refund from salary | null | null | false |
| split line's transfer side | TODO: Example transfer line | null | null | false |
