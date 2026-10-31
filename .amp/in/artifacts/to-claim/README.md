# To claim flag: E2E evidence

Synthetic data only. `api-e2e.ts` builds its own in-memory stacks (D1 and
SQLite) through the real HTTP handler. The web and claims-tool runs use the
disposable stack from
`.cursor/skills/verify-howmuch/bin/control-howmuch launch` (plan `local-plan`),
relaunched fresh before the web run. "Branch head" below is the commit that
adds this README revision; each run was made on that tree before committing.

| Run | Revision | Command | Result |
| :-- | :-- | :-- | :-- |
| API, D1 and SQLite engines | branch head | `bun .amp/in/artifacts/to-claim/api-e2e.ts` | ALL PASS (58 checks per engine) |
| Web | branch head | `node .amp/in/artifacts/to-claim/web-e2e.cjs` | ALL PASS (26 checks), screenshots `web-1` to `web-7` |
| Claims tool against this API | branch head + this-claimer `claude/howmuch-claim-flag` head | `CLAIMER=/path/to/this-claimer node .amp/in/artifacts/to-claim/claimer-e2e.cjs` | ALL PASS (22 checks) |
| iOS build and tests (Devin macOS) | b149697, 0c983bf, 8a490ed, f092590, 931cdc4, 8a112ec, c8662d3 | `scripts/ios-xcodebuild.sh test` | each 806 executed, 0 failures, 1 skipped (opt-in live model test); at f092590 six CaptureSnapshotTests failed with accessibility off and passed 32/32 on a class rerun |
| iOS simulator pass (Devin macOS, local mode) | b149697 | To claim chip, To confirm chip, filter menu, dark mode | as described, screenshots `ios-a` to `ios-d` |
| iOS simulator pass (Devin macOS, local mode) | 0c983bf | `TODO:` memo becomes the flag; chip off and on keeps it, off clears it; Duplicate keeps To claim; a transfer's other side shows To claim | as described, screenshots `ios-2a` to `ios-2d` |
| iOS simulator pass (Devin macOS, local mode) | 8a490ed | memo `CLAIMED - 2026-01-02: Example lunch` becomes Claimed with memo `Example lunch`; edit form shows Claimed 2 Jan 2026 | as described, screenshot `ios-3` |
| iOS simulator pass (Devin macOS, local mode) | 931cdc4 | row seeded in the local database as memo `TODO: Example taxi`, claim_status NULL: open, change only the amount (-23.45 to -23.60), save; then type `TODO: Example lunch` into another row's memo and save | database after save, read by Devin: memo `TODO: Example taxi` and claim_status NULL (kept); memo `Example lunch` and claim_status `to_claim`. Screenshots `ios-4a` (form before Save) and `ios-4b` (register) |
| iOS simulator pass (Devin macOS, local mode) | 8a112ec | rows seeded with words and claim_status NULL: (a) `TODO: Example deposit`, To confirm on, uncleared: turn Cleared on, keep To confirm on, save; (b) `TOCHECK TODO: Example hotel`: turn To confirm off, save; (c) `TODO: Example taxi`: change only the amount, save | database after save, read by Devin: (a) memo `Example deposit`, `to_claim`, needs_confirmation 1, cleared; (b) memo `Example hotel`, `to_claim`, needs_confirmation 0; (c) memo `TODO: Example taxi` verbatim, claim_status NULL. Screenshots `ios-5a` to `ios-5c` (register after each) |
| iOS simulator pass (Devin macOS, local mode) | c8662d3 | (d) row seeded as memo `TODO: Example held`, claim_status `claimed`, claimed_on 2026-10-24, needs_confirmation 0: opens as Claimed 24 Oct 2026 with To claim off; turn To confirm on, save; (e) row seeded as `TODO: Example taxi`, claim_status NULL: change only the amount, save | database after save, read by Devin: (d) memo `Example held`, `claimed`, claimed_on 2026-10-24, needs_confirmation 1; (e) memo `TODO: Example taxi` verbatim, claim_status NULL. Screenshots `ios-6d` (form before Save), `ios-6e` (register after) |

Against an older HowMuch (no `claim_status`), the claims tool's marking
fallback is covered by its own `npm run smoke:worker-claims`, which models
both server versions for the collection PATCH. Its listing of rows with no
`claim_status` (an older server, or rows kept with their words) is the memo
rule, now also reading a leading TOCHECK word and a bare `TODO`; the
claims-tool run above covers it against this server's word rows. The YNAB
backend uses the same rule and has no run here.

There is no bulk conversion (YJ, 25 Oct 2026): rows stored with memo words
keep them. The API and web runs check that saving another field on such a
row leaves its words alone, and that editing its memo turns them into fields.
