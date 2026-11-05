# iOS engine rebuild validation

- Candidate: d926282aade289e964966d79dd6df70a6f58845b (branch ios-engine-rebuild, parent origin/main eb95fc47)
- Change: apps/ios/HowMuch/Engine/howmuch-engine.js only, rebuilt with `bunx bun@1.4.0 scripts/build-ios-engine.ts build`
- Bundle sha256: a0aa9b8a64bd8abaffcc01ce126316e1dfa852a49643c3f147479ebafc41da21 (orb checkout, Mac mirror and built HowMuch.app match)

## Freshness
- Before, at eb95fc47: `bunx bun@1.4.0 scripts/build-ios-engine.ts check` -> "The iOS engine is stale" (exit 1)
- After, at d926282a: same command -> "The iOS engine is up to date." (exit 0)
- New API code present in the bundle: `invalid_payload_json` / `json_type(payload_json, '$.settings')` (rewards snapshot settings query, f6a79a56, a70e41ac) and the trimmed 15-character new-password rule (1f2c36f1)

## Linux checks (orb, `bun run check` at d926282a)
- bun test: 823 pass, 0 fail
- web and worker typecheck: pass
- iOS engine freshness: up to date
- stops at the iOS step on Linux, as designed

## Mac validation (Amp Mac satellite, mac.medium, macos-27)
- Xcode 27.2 (27B52), iPhoneOS SDK 27.2, simulator iPhone SE (3rd generation) DC626523-2C36-4FBB-BF56-A9557149C4EE, accessibility enabled
- Command: `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests`
- runner: build-for-testing finished in 185s exit=0; products match this worktree
- Executed 825 tests, with 1 test skipped and 0 failures; ** TEST EXECUTE SUCCEEDED **; exit 0
- Skipped: testLiveFoundationModelsCoffeeAddUpdateAndTodayQuery (needs HOWMUCH_LIVE_MODEL_VERIFY=1 on device)
- Logs: build/xcode/logs/xcodebuild-build-for-testing-20261105-133029.log, xcodebuild-test-without-building-20261105-133334.log (on the satellite)

No signing, upload, distribution, build-number bump or Xcode Cloud action was performed.
