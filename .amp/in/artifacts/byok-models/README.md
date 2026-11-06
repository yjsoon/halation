# Exact AI model IDs: verification

## Follow-up: macOS landing blocker resolved

YJ authorised fixing the backup blocker. Backups now run `VACUUM INTO` on a nonexistent path inside a private temporary directory, set the finished file to 0600, and publish it with an atomic hard link that refuses to overwrite an existing backup. The staging directory is removed on success and failure. Existing 0700 backup-directory permissions and committed WAL data are preserved.

On the unchanged implementation, the extended regression reproduced the macOS error and an incomplete backup left behind after a failed snapshot. After the fix, `bun test scripts/import-security.test.ts` passes all three tests on Mac and Linux, including WAL contents, restrictive permissions, same-timestamp collision safety and failed-snapshot cleanup.

After rebasing both thread commits onto `origin/main` at `b7ce87c5`, the complete `scripts/check.sh` passed on the Amp Mac satellite: **816 Bun tests passed**, both typechecks passed, and **824 XCTest tests, one existing live-model skip, zero failures**, plus three Swift Testing tests passed. Source checked: `3ddbc5ff4ade4fd7306f4042ea02ab1db4bd0cf9`; subsequent amendments add only this evidence. Counts differ from the original run because main changed in the meantime.

The real `scripts/import-ynab-export.ts` CLI also completed on macOS against an isolated demo ledger and one synthetic CSV row. The live ledger grew from 18 to 19 transactions; its backup retained exactly 18 and did not contain the new row. Backup integrity was `ok`, file mode 0600 and directory mode 0700. Commands and captured red/green/full-check/CLI output are in `backup-verification.txt`. No production database was touched.

## Original AI-provider verification

Date: 6 November 2026. Repository: yjsoon/howmuch. Code tested: `a5d16d16e153fdfd1b1b7b326b60bdae6341398f`, rebased onto `d137f7a8` from origin/main. This evidence is amended into the same local commit afterwards; no code changes follow these checks.

## Result and delivery gate

The iOS allow-list rejection is fixed. Explicit model entry preserves OpenRouter's endpoint, key scope and privacy controls while using provider-default reasoning. Preset selection, removed-preset rejection and on-device defaults remain intact. Web already accepted Claude IDs; its two tools now explain the vendor prefix and link to OpenRouter's current list. Category suggestions remain the separate TypeSafe integration.

**Initial result: BLOCKED on checks, resolved in the follow-up above.** `scripts/check.sh` on the Amp Mac satellite failed an unrelated existing SQLite backup test. `git archive origin/main scripts/import-security.test.ts scripts/lib/sqlite-backup.ts scripts/import-ynab-export.ts | tar -x -C /tmp/byok-base`, then `bun test /tmp/byok-base/scripts/import-security.test.ts`, reproduced `SQLiteError: output file already exists` at `scripts/lib/sqlite-backup.ts:33`. Both used Bun 1.4.4. Linux passed. The repository's landing rule prevented a push while base checks failed. No backup code was changed in the original AI-provider commit.

## Cases fixed before implementation

- An unlisted Claude ID on OpenRouter must save, survive reload and reach the intended request endpoint unchanged. It must not inherit another model's disabled-reasoning setting.
- Existing presets must still select and save; a removed preset must not silently change its wire options.
- Changing models must retain the endpoint-scoped key; empty/whitespace model IDs must fail without overwriting saved preferences.
- iPhone local mode must need no Halation server for configuration. Default and accessibility text sizes must remain usable.
- Web statement formatting and reward drafting must accept the full Claude ID and keep explicit review before persistence. Categories must not be misrepresented as using this setting.

## Checks

See `byok-validation.txt` for captured command output.

- Before implementation, `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests/CaptureAITests/testExplicitOpenRouterModelSurvivesReloadWithoutPresetParameters`: one test failed with `configuration` from `CaptureAISettings.save`.
- After implementation, the same regression passes. It also checks the exact outbound model, no borrowed reasoning parameter, OpenRouter data-collection policy, endpoint key scope and invalid-ID rejection.
- `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests`: 826 XCTest tests, one existing opt-in live Foundation Models skip, zero failures; three Swift Testing tests also pass. Fresh build-for-testing succeeded before execution. macos-27 Amp satellite, iOS 27.2 simulator, ad-hoc simulator signing only.
- `bun test` on Linux: 818 pass, zero failures, 76,091 expectations.
- `bun run --cwd apps/web typecheck` and `bun run --cwd apps/worker typecheck`: exit zero.
- Full Mac `scripts/check.sh`: 817 Bun tests pass, one unrelated failure described above; iOS tests were then run separately, not skipped.
- `git diff --check`: exit zero.

The first model-picker snapshot check selected the section rather than the picker after adding the toggle; the picker now has an explicit accessibility label and the existing test targets it. A subsequent simulator run had accessibility disabled (`AccessibilityEnabled = 0`); re-enabling both accessibility defaults as instructed in apps/ios/AGENTS.md restored passing tests. No assertions were removed or relaxed.

## Web settings and tool flow

Recipe: `.cursor/skills/verify-howmuch/features/settings.md`, with the two linked tool flows. Supervised orb services replace the recipe's tmux startup; the real Bun/SQLite API and Vite UI are unchanged. No production data or keys were used.

Setup:

```sh
mkdir -p /tmp/howmuch-byok
HOWMUCH_DB_PATH=/tmp/howmuch-byok/ledger.sqlite HOWMUCH_DEFAULT_PLAN_ID=local-plan bun run demo:seed
amp orb service start byok-api --command 'HOWMUCH_DB_PATH=/tmp/howmuch-byok/ledger.sqlite HOWMUCH_API_TOKEN=howmuch-verify-bootstrap HOWMUCH_DEFAULT_PLAN_ID=local-plan HOWMUCH_HOST=0.0.0.0 bun --preload /tmp/howmuch-byok/provider-fixture.ts apps/api/src/server.ts' --port 3191
amp orb service start byok-web --command 'HOWMUCH_API_URL=http://127.0.0.1:3191 bun run --cwd apps/web dev -- --host 0.0.0.0 --port 5191 --strictPort' --port 5191 --portal
```

The temporary preload replaced only fetches to `https://openrouter.ai/`, leaving the browser, Halation server, validation and database real. It required `Bearer fake-byok-key` and model `anthropic/claude-sonnet-4.5`, returning HTTP 401 otherwise. It recorded URL/model/image/fallback flags without keys. Successful chat responses wrapped JSON in `choices[0].message.content`:

- Image input: `[{"date":"2026-11-06","payee":"Synthetic Cafe","memo":"Fixture statement","outflow":"12.34","inflow":""}]`.
- Text input: `{"cardLimits":{"earningRate":2},"buckets":[{"name":"Everything else","rewardValue":2}],"notes":["Synthetic terms fixture"]}`.

Browser actions (Chromium, 1280×900 at 2×):

1. Complete owner setup as `verifier`, password `howmuch-verify-15`, setup token `howmuch-verify-bootstrap`. Open Settings. Confirm Appearance, tools and disabled automatic categories. `category-status.json` independently reports `categoriser_enabled: false`.
2. Open Statement formatter. Choose OpenRouter, enter the Claude ID and fake key, upload a PNG containing only `SYNTHETIC STATEMENT / 2026-11-06 Synthetic Cafe 12.34`, consent and extract. Observe one editable row with those exact values and a completion message. Nothing is imported into the ledger.
3. Fixture prerequisite only: POST `/api/rewards/cards` with synthetic card `{id:"synthetic-card",name:"Synthetic Rewards Card",ynabAccountId:"acct-credit",type:"cashback",earningRate:1}`. This is not evidence of the card creation UI.
4. Open Reward terms, choose that card, OpenRouter, Claude ID and fake key. Paste `Synthetic Rewards Card: 2% cashback on all spending. No minimum spend.`, consent, generate. Observe the 2% review draft. Click Save reviewed reward rules. Observe success; independently GET `/api/import/rewards-tracker` and confirm rate 2 and the Everything else category (`reward-persisted.json`).

`provider-requests.txt` confirms both requests reached the real API's outbound boundary with the exact Claude ID and `allow_fallbacks: false`. These are **controlled provider responses, not live OpenRouter or Claude inference**. Settings/model selection and Halation's validated review/persistence paths are exercised; provider availability, billing and inference quality are not.

## Native iPhone local-mode flow

Installed the freshly built HowMuch app into the wrapper-selected iOS 27.2 iPhone SE simulator. Used AXe 1.8.0 for real accessibility-targeted taps and HID text entry, not view-state injection.

1. Start on this iPhone, then More → Settings → AI provider. Choose OpenRouter. The original suggested model remains visible (`ios-suggestions.png`).
2. Turn on Enter model ID. Replace the value with `anthropic/claude-sonnet-4.5`; leave Chat Completions. Scroll to API key, enter `fake-byok-key`, Save. Reopen and confirm the key is saved without showing it (`ios-key-saved.png`).
3. Terminate and relaunch the app with `xcrun simctl terminate/launch`; reopen Settings. Confirm the exact model and saved key survive. Read only `HowMuch.CaptureAI` from the app's preferences: `{"usesCustomModel":true,"modelID":"anthropic/claude-sonnet-4.5","providerID":"openrouter","customAPI":"chatCompletions","customBaseURL":""}`. No key is in preferences.
4. Toggle back to suggestions and enter the same model again. Save and reopen. The inspected recording `ios-model-entry.mp4` shows this interaction on the final code. No inference request is made by Save.
5. Empty the exact ID and press Save. Observe `Choose an available provider and model in AI provider settings.` Cancel and reopen: the previous Claude ID is still present.
6. Set `xcrun simctl ui "$UDID" content_size accessibility-extra-large`. The exact ID wraps over multiple lines instead of truncating; the API picker is a navigation link. The narrow SE navigation title uses system truncation. Scrollable offscreen content is not missing. Restore `large` afterwards.

Screenshots were inspected. Initial captures during navigation transitions were discarded and recaptured after settling. An initial fake-key entry did not persist; entering it again after the field had focus, saving and relaunching confirmed actual Keychain persistence. No live provider inference, physical iPhone installation, deployment or publication was performed.

## Recommendation

Use exact IDs with bundled, documented presets now. Runtime discovery is useful later as optional suggestions, especially OpenRouter's richer catalogue, but requires capability mapping, caching, failure handling and provider-specific authentication. OpenAI's list alone lacks those capability details. A generated bundled list still becomes stale between releases. Neither should become a new allow-list. Replacing TypeSafe category suggestions is a separate design decision, not included here.

Temporary services, fake-provider preload and scratch files are removed after evidence capture. No production changes.
