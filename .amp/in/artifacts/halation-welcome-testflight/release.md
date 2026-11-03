# Halation welcome TestFlight release

## Authority and scoped observability exception

The user explicitly authorised merging the approved centred welcome redesign and publishing it to TestFlight. After fresh GitHub protection/rules/ruleset reads returned 403, the user said **“Ok authorized”** to the discussed policy change. For **this Halation merge and TestFlight release only**, unavailable protection-read APIs and GitHub plan visibility limits alone are not a blocker. This does not authorise bypassing actual enforced protections, required checks or approvals, force pushing, altering global skills/settings, or any other release. Normal non-force Git operations and actual host enforcement remain mandatory. No Slack post is authorised.

The canonical delivery router's earlier BLOCKED result was caused by unreadable protection under the explicit no-PR repository procedure. This user-approved scoped exception supersedes that observability stop only; the remaining review, validation, merge and release gates are retained. No router or global policy code was changed.

## Candidate

- Current-main integration: `c1ca615ed12f16b9a7778b10b27257451fe23837`, clean merge of `origin/main` `9acb149938ba6f7a0986e9fa42379d53f3449ec0` into this thread's `welcome-landscape` branch. No conflict resolution diff.
- Release source: `7410ce3157d3f14132b2177dfb30211041a2657d`. All six `CURRENT_PROJECT_VERSION` entries incremented from 19 to **20**, marketing version remains **0.1.0**. Approved welcome and formatter sources are unchanged by integration and version bump.
- Live App Store Connect preflight: latest uploaded build **19**, VALID, internal IN_BETA_TESTING. App **Halation - Finance and Rewards**, ASC app `6829787957`, bundle `com.tinkertanker.halation`; existing Tinkertanker App Store app/share profiles reused, without account/provisioning changes.
- Use `scripts/testflight-export.sh`, not Speedflight. Current main requires SDK >=27.1, so the initial macos-26 satellite was replaced with **macos-27 / Xcode 27.2 / iPhoneOS SDK 27.2**. No SDK floor was changed or bypassed.

## Exact-source validation before review

Amp Mac satellite, HowMuch / Debug, iPhone SE (3rd generation), iOS 27.2, ad-hoc simulator signing. The original approved iPhone/iPad light/dark previews are under `halation-welcome-alignment/`; welcome source is identical.

1. Applied existing disposable `halation-welcome/validation-harness.patch` with `git apply --unidiff-zero`. Ran `SIMULATOR_UDID="$PHONE" scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests/LocalModeTests -only-testing:HowMuchTests/SlipReaderMappingTests`. Fresh Xcode 27.2 build succeeded. First cold run again hit the documented scratch failure-state `InvalidTransition` exception; the normal welcome flow, persisted SQLite result and currency checks passed. Without source or harness changes, fresh-build rerun passed **48 tests, zero failures** (12 local/welcome plus 36 currency mapping).
2. Removed the disposable harness, re-read test source, reran the same command on clean committed source: **TEST BUILD SUCCEEDED**, products match worktree; **46 tests, zero failures** (10 local, 36 mapping); **TEST EXECUTE SUCCEEDED**. No permanent test changes.
3. Real-stack checks cover Connect/Back, local start and saved mode/plan, four persisted starter groups, real filesystem-error recovery and re-enabled actions. Layout probes cover light/dark, compact, landscape, accessibility3 and iPad-sized native windows; 44pt server target, >=44pt local target, no horizontal overflow and actions reachable by scrolling.
4. `bun test scripts/speedflight.test.ts`: **11 pass, zero fail**. `bash -n scripts/testflight-export.sh scripts/speedflight.sh` and `git diff --check` pass.
5. Existing app/share App Store provisioning profiles were downloaded privately and checked on the Mac: expected team and bundle identifiers, unexpired, beta reporting enabled, no device lists and no debug entitlement. Signing material stays private and outside Git. No certificate/profile creation or mutation.

## Remaining transitions

Independent review of the build-number diff and clean main integration, exact reviewed-head feature push, guarded non-fast-forward merge, clean exact-main distribution archive/export, IPA signature/entitlement/version/SDK checks, separate ASC upload and processing/internal TestFlight confirmation. No release is claimed until those transitions have actual results.

No physical-device install or VoiceOver gesture pass is claimed. Existing internal TestFlight group is the release audience; no public link, external tester expansion, Beta App Review or production Worker deployment is included.
