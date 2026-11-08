# Category-name editing: landing verification

8 November 2026. Repository yjsoon/halation, local main. Implementation tested at d0dc7efdb8ab2528bab5d2adc15e22c8877b6205, rebased onto origin/main b2659e4eb9d432fd9a6382cf00c7a0a1388ca8bf. The landing commit adds this evidence to the same implementation. Only synthetic local data was used. No production request, migration, deployment or release was performed.

## Accepted scope

The web card register has a collapsed **Reward categories** toolbar disclosure. Opening it reveals seven plain, aligned colour-name fields, with explicit **Save names** and **Cancel**. No pill-and-pencil legend or card editor is added. Tab does not save. Escape, Cancel and collapsing discard drafts. Save merges changed names into the latest stored card using the existing partial-save API, updating matching reward subcategory names without changing their IDs or rules. Unused optional colours remain optional.

Native Rewards has a text-only **Edit Rewards** footer at the bottom of an expanded card, with a minimum 44pt hit height. It opens the existing editor. Accounts already supports Accounts → card register → rewards summary → detail toolbar **Edit Rewards**. No duplicate Accounts control or native save/dismissal implementation was added. Web Rewards already has visible Actions → Edit card.

## Semantics after rebase

The latest main deliberately preserves stored transaction names when a card colour is renamed. This supersedes earlier evidence from this thread that matching historical transaction labels were retitled. The new editor respects the current contract: current card names change; existing transaction names do not. A subsequently assigned flag uses the current name.

## Repeatable web recipe and observed result

Affected recipe: `.cursor/skills/verify-howmuch/features/rewards-card-edit.md`, specifically card-specific colour-name editing and saved-history behaviour. The unrelated create/delete/cap flows were not rerun.

1. Seed a disposable SQLite ledger with `HOWMUCH_DB_PATH=/tmp/halation-category-verify/ledger.sqlite bun run demo:seed`. Run the local API on 8891 and web on 5191 as supervised services. Complete synthetic first-owner setup from the verification recipe. Import `fixtures/rewards-tracker-export.json` through Settings → Rewards import. Never use production credentials or data.
2. Open `/transactions?accounts=acct-credit&range=all`. Travel Card starts with Red Dining & cafés and Blue Online. Read `/api/import/rewards-tracker?plan_id=local-plan`, `/v1/plans/local-plan/transactions` and `/api/reports/rewards?plan_id=local-plan&to=2026-05-24` as the authenticated synthetic owner.
3. Open Reward categories, change Red to Food & cafés and Blue to Web purchases, then click Save names. The panel closes and focus returns to the disclosure. Reload, wait for the disclosure, reopen: both names survive. The three red historical rows still say Dining & cafés and the blue row still says Online.
4. Compare API results independently. `persistence.json` records unchanged transaction JSON, unchanged reward rule fields after excluding edited names/timestamps, and unchanged totals: total/countable spend 315.5 and reward earned 1033.1 before and after.
5. Edit Red to Discard me, press Escape. The panel closes and focus is on the disclosure. Reopen and clear Red to whitespace, then Save names. The configured category rejects the blank name with Enter a name for this reward category, a single red input border and enabled Cancel. No blank name is persisted.
6. Open the first transaction with Enter. Select the Blue flag, whose visible option is Web purchases, then Save. The local API returns that row with flag_color blue and flag_name Web purchases; the other existing blue row still has flag_name Online and untouched red rows retain Dining & cafés. This explicitly tests the difference between renaming current card configuration and assigning a flag after that rename.
7. Restore synthetic card names through the disclosure. Record a real pointer crossing Payment reminders and Reward categories, opening the panel, typing Meals & cafés and Online shopping, clicking Save names, and seeing the panel close. Read the saved names from the local API, then restore Dining & cafés and Online. The deliberate transaction reflag from step 6 remains only in this disposable fixture.
8. Capture and inspect collapsed, expanded, validation, dark, 820px two-column and 390px single-column states in Chromium, DPR 2. At 390px scrollWidth and innerWidth are both 390. Focus outline offset is -2px with no shadow. Labels remain readable in dark mode; unused-name placeholders are deliberately secondary to their explicit labels. This narrow layout is Chromium, not a physical iPhone capture.
9. Inspect `rename.mp4` through a 2fps contact sheet. It shows a real visible pointer, explicit Save and completion without stuck saving. The historical labels do not all follow the newly saved card names.

Previous same-implementation checks additionally covered preservation of an intervening untouched Green name and earning-rate change, adding/clearing unused Green and None, aborted fetch recovery and held real-request recovery. Those were completed before this rebase; they are not claimed as fresh runs here.

## Native recipe

Affected recipe: `.cursor/skills/verify-howmuch/features/ios-rewards-card-edit.md`, entry to the existing editor. Existing comprehensive editor scenarios are outside this affordance change.

Amp Mac satellite, macOS 27, Xcode 27.2, HowMuch scheme, Debug, wrapper-selected iOS 27.2 Simulator. No physical-device or publication claim.

A temporary validation method in the existing RewardsSnapshotTests signs in to the real disposable API through a private localhost forward, refreshes actual accounts, hosts the real RewardsView, expands Travel Card, waits for rendered Edit Rewards text using OCR, checks the footer's minimum 44pt hit target and on-screen frame, activates it, and saves through the existing editor. The real local request completes and the editor dismisses. It uses no mock URLProtocol. The targeted run passed: one test, zero failures, TEST EXECUTE SUCCEEDED. The temporary method was removed before landing. Inspected final captures are `category-landing-native-footer-final.png` and `category-landing-native-editor-final.png`.

Earlier native layout checks on the unchanged footer implementation passed at 390pt light/dark and 320pt light, and exercised the existing Accounts → rewards summary → Edit Rewards route. They are recorded in the thread's earlier verification artifact, not presented as fresh real-API persistence tests.

## Required checks

On the rebased implementation, `scripts/check.sh` on the Amp Mac satellite exited 0 with **check: pass**:

- Bun: 815 pass, 0 fail.
- Web and worker TypeScript checks: both exit 0.
- Native: fresh build-for-testing, **TEST BUILD SUCCEEDED**; 824 XCTest tests, one skipped, zero failures; three Swift Testing tests pass; **TEST EXECUTE SUCCEEDED**.
- `git diff --check`: exit 0.

The complete check ran twice on the same rebased implementation, including a final clean-source run. `category-landing-check-summary.txt` contains the decisive output. Adding these review artefacts does not change the checked application or test source.

No unit tests were added after implementation. The disposable native validation method is not kept as a regression test. Evidence is synthetic and safe for the public repository.

## Related improvements, not implemented

1. Rename a reward colour directly beside its row in expanded Rewards details, without entering the full rules editor.
2. Offer Rename account beside the account-register title.
3. Offer Rename budget category from its picker, clearly warning that it changes a ledger-wide category rather than this card's reward label.

These require a separate approval. No PR, independent review, tag, deployment, D1 migration, Xcode Cloud build or Speedflight cut is part of landing this change.
