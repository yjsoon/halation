# To claim flag: E2E evidence

Synthetic data only, on the disposable stack from
`.cursor/skills/verify-howmuch/bin/control-howmuch launch` (plan `local-plan`).

| Run | Revision | Command | Result |
| :-- | :-- | :-- | :-- |
| API, SQLite and D1 engines | cb4f2fa | `bun .amp/in/artifacts/to-claim/api-e2e.ts` | ALL PASS (about 36 checks per engine) |
| Web | f66b34e | `node .amp/in/artifacts/to-claim/web-e2e.cjs` | ALL PASS (20 checks), screenshots `web-1` to `web-7` |
| Claims tool against this API | b149697 + this-claimer 7c84708 | `CLAIMER=/path/to/this-claimer node .amp/in/artifacts/to-claim/claimer-e2e.cjs` | ALL PASS (10 checks) |
| Memo conversion | b149697 + script | see below | as expected |
| iOS (Devin macOS) | b149697 | `scripts/ios-xcodebuild.sh test` plus a simulator pass | pending |

## Memo conversion run

1. `bun .amp/in/artifacts/to-claim/convert-seed.ts <db_path>` writes legacy memo
   words straight to SQLite, bypassing the API (as rows stored before the
   release would be): `TODO: Fake taxi`, `CLAIMED - 2026-01-02: Fake lunch`,
   `TOCHECK Fake hotel`, `TOCHECK TODO: Fake flight`, `CLAIMED: Fake bus`,
   `todo dinner`, and `TODO: Notebooks` on a row whose claim is already set.
2. Dry run: `HOWMUCH_TOKEN=howmuch-verify-bootstrap bun scripts/convert-follow-up-memos.ts --api-url <api_url> --plan local-plan`.
   Expected and observed: will convert 5 (2 to claim, 2 claimed, 2 to confirm);
   left as text 3 (`Todo list app` twice, `todo dinner`); needs a look 1
   (`TODO: Notebooks`). Nothing changed.
3. The same command with `--apply`. Observed: `Applied: 5 converted, 0 skipped, 0 not as expected.`
4. Dry run again: will convert 0; the same 3 left as text and 1 needing a look.
5. `GET /transactions/:id` for each row:

| Row | Memo after | claim_status | claimed_on | needs_confirmation |
| :-- | :-- | :-- | :-- | :-- |
| txn-2026-04-utilities | Fake taxi | to_claim | null | false |
| txn-2026-04-market | Fake lunch | claimed | 2026-01-02 | false |
| txn-2026-03-hawker | Fake hotel | null | null | true |
| txn-2026-03-fairprice | Fake flight | to_claim | null | true |
| txn-2026-05-bus | Fake bus | claimed | null | false |
| txn-2026-03-grab | todo dinner | null | null | false |
