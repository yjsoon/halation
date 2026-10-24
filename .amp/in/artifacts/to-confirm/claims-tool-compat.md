# To claim matches this-claimer (E2E record)

Code revision: 159848ed1b0af67764b8cf40162fb02772a82725 (branch claude/project-thread-hkpzn4, base origin/main 73fd882).

Rule mirrored from yjsoon/this-claimer `upload-app/worker/index.ts`:
`parseTodoDescription` (`/^TODO[:\s]/i`) and `markHowMuchClaimed`
(`CLAIMED - YYYY-MM-DD: <description>`).

## Web

Setup: `.cursor/skills/verify-howmuch/bin/control-howmuch launch` (isolated local
stack, synthetic data), then `node .amp/in/artifacts/to-confirm/web-e2e.cjs`,
then `control-howmuch cleanup`. Fixture memos: `TODO: Client dinner`,
`CLAIMED - 2026-01-02: Notebooks`.

Observed (all 14 PASS), including:
- to-claim tag shows in place of TODO; claimed tag shows
- turning To claim off leaves `Client dinner`; turning it on writes `TODO: Client dinner`
- saved memo is `TODO: Client dinner` (read back from the API)

Also: `bun test apps/web` 307 pass; `tsc --noEmit` in apps/web clean;
`build-ios-engine.ts check` up to date.

## iOS

Devin macOS session 06992d43ed31432faa2eb34681a63600, `scripts/ios-xcodebuild.sh test`
at 159848e. Result: pending (recorded below when it returns).
