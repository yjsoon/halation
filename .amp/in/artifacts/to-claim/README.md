# To claim flag: E2E evidence

Synthetic data only. `api-e2e.ts` builds its own in-memory stacks (D1 and
SQLite) through the real HTTP handler. The web and claims-tool runs use the
disposable stack from
`.cursor/skills/verify-howmuch/bin/control-howmuch launch` (plan `local-plan`),
relaunched fresh before the web run. "Branch head" below is the commit that
adds this README revision; each run was made on that tree before committing.

| Run | Revision | Command | Result |
| :-- | :-- | :-- | :-- |
| API, D1 and SQLite engines | branch head | `bun .amp/in/artifacts/to-claim/api-e2e.ts` | ALL PASS (56 checks per engine) |
| Web | branch head | `node .amp/in/artifacts/to-claim/web-e2e.cjs` | ALL PASS (26 checks), screenshots `web-1` to `web-7` |
| Claims tool against this API | branch head + this-claimer `claude/howmuch-claim-flag` head | `CLAIMER=/path/to/this-claimer node .amp/in/artifacts/to-claim/claimer-e2e.cjs` | ALL PASS (20 checks) |
| iOS build and tests (Devin macOS) | b149697, 0c983bf, 8a490ed | `scripts/ios-xcodebuild.sh test` | each 806 executed, 0 failures, 1 skipped (opt-in live model test) |
| iOS simulator pass (Devin macOS, local mode) | b149697 | To claim chip, To confirm chip, filter menu, dark mode | as described, screenshots `ios-a` to `ios-d` |
| iOS simulator pass (Devin macOS, local mode) | 0c983bf | `TODO:` memo becomes the flag; chip off and on keeps it, off clears it; Duplicate keeps To claim; a transfer's other side shows To claim | as described, screenshots `ios-2a` to `ios-2d` |
| iOS simulator pass (Devin macOS, local mode) | 8a490ed | memo `CLAIMED - 2026-01-02: Example lunch` becomes Claimed with memo `Example lunch`; edit form shows Claimed 2 Jan 2026 | as described, screenshot `ios-3` |

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
