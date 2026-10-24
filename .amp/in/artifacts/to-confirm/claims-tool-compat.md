# To claim matches this-claimer (E2E record)

Code revision: 455d3900ca518c9669ed429b4960060396238fc2 (branch claude/project-thread-hkpzn4, base origin/main 73fd882). Round 1 ran at 159848e.

Rule mirrored from yjsoon/this-claimer `upload-app/worker/index.ts`:
`parseTodoDescription` (`/^TODO[:\s]/i`) and `markHowMuchClaimed`
(`CLAIMED - YYYY-MM-DD: <description>`).

## Web

Setup: `.cursor/skills/verify-howmuch/bin/control-howmuch launch` (isolated local
stack, synthetic data), then `node .amp/in/artifacts/to-confirm/web-e2e.cjs`,
then `control-howmuch cleanup`. Fixture memos: `TODO: Client dinner`,
`CLAIMED - 2026-01-02: Notebooks`, and the negative `Claimed back from Sam TODO`.

Observed at 455d390 (all 16 PASS), including:
- claimed row shows just `Claimed Notebooks` (tag plus description)
- `Claimed back from Sam TODO` shows no tag
- to-claim tag shows in place of TODO; claimed tag shows
- turning To claim off leaves `Client dinner`; turning it on writes `TODO: Client dinner`
- saved memo is `TODO: Client dinner` (read back from the API)

Also: `bun test apps/web` 307 pass; `tsc --noEmit` in apps/web clean;
`build-ios-engine.ts check` up to date.

## iOS

Devin macOS session 06992d43ed31432faa2eb34681a63600, `scripts/ios-xcodebuild.sh test`.

- 159848e: build succeeded (Xcode 26.6, iPhone 17 simulator, iOS 26.5); 806 XCTest + 3 Swift
  Testing; RegisterQueryTests.testToClaimMatchesTheClaimsToolsMemoFormat passed. Six
  CaptureSnapshotTests assertions failed with empty accessibility lookups (`[]`), the known
  flake; the class alone then passed 32/32.
- 455d390: pending (recorded below when it returns).
