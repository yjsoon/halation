# Native Add refinement

7 November 2026. This is the native SwiftUI round following web controls at `73a782e73c47c4a4d88f83123db3f3b0f97b9943`. Revision: the commit containing this record. No production data, deployment, signing, TestFlight or Speedflight publication.

## Retained design

A keeps the existing SF bold amount, native controls, green completion colour, warm light canvas and navy dark canvas. B tested an amount-only serif. All five independent judges chose A. The change reserves bottom safe-area space for Save instead of covering Follow-up, tightens the amount header, and strengthens review values, memo placeholder, Follow-up and split instructions. A non-interactive16pt bottom fade softens the scroll boundary; an opaque navigation background prevents financial text ghosting behind the title.

The split selector band remains reserved. Existing row-position checks require Flag and Memo not to jump when split expands. Blue selected To claim remains the existing semantic claim colour, distinct from green completion. No accounting or write semantics changed. The larger-text Flag value and Follow-up chips stack instead of widening the whole form past the viewport.

`DisclosureValueRow` defaults to its existing secondary colour. Only transaction-form consumers opt into stronger value ink, leaving Scheduled consumers unchanged.

## Independent panel

Scores describe the weakest important supplied state, not an average or an accessibility certificate. Native scores are separate from historical web scores.

| Judge | Baseline | A | B | Choice |
| --- | --- | --- | --- | --- |
| Sol | 5, original16-state scope | 7, expanded lower-state scope | 7 | A |
| Opus | 7 | 8 | 7.5 | A |
| Sonnet | 6.5 | 8 | 8 | A |
| Astra | 6.5 | 8 | 8 | A |
| Fable medium | 5 | 7 | 7 | A |

Baseline:16 screenshots,375/390, light/dark, blank keypad, filled, transfer and split. Each candidate adds lower-scrolled filled/transfer/split views,28 screenshots each. Sol, Opus, Astra and Fable inspected all supplied candidate images; Sonnet sampled all390 states and selected375 states, explicitly not every375/lower variant.

Agreement: the Save overlap is a real baseline defect; both candidates fix it. SF gives the native controls a coherent hierarchy, while the serif adds no demonstrated entry/review benefit. Stronger review ink and a compact header are useful. No broad new round was requested. Disagreement: Sol/Fable rate dense split review7 where the other judges rate the overall scope8. Follow-up/help contrast, footer fade and native toolbar translucency were bounded polish, subsequently addressed. Placeholder distinction and typography remain preferences. This is a7–8 plateau, not a claim to reach9.

Sol and Fable independently inspected eight final spot captures after polish. Both recommend retaining A with no further corrective round. They confirm stronger helper/chip ink, clear Save separation and no title bleed. Fable considers the softened keypad edge resolved sufficiently. Its suggestion that the large-text title dropped Add was corrected: that fixture is deliberately an existing-transaction editor, whose title is Transaction at every text size. The selected blue claim colour is retained; Sol calls it a coherent state distinction, Fable would prefer green. No new palette was introduced to reconcile this taste difference.

## Reproduction and evidence

Environment: Amp mac.medium satellite, macOS26 image, Xcode26.1.1, booted iPhone Air simulator selected by `scripts/ios-xcodebuild.sh destination`. Snapshot windows are375×844 and390×844 points, exported at2× and retained as quality90 JPEGs. They are simulator-hosted SwiftUI surfaces, not physical phones. Full-resolution PNG originals were inspected before export.

Recipe: `.cursor/skills/verify-howmuch/features/ios-capture.md`. The real local backend is the isolated Bun/SQLite stack on orb port4174, forwarded to Mac localhost4174. Database `/tmp/howmuch-hill/ledger.sqlite`, plan `local-plan`, synthetic owner `verifier`. No production host is used. Authentication values and tokens are not evidence artifacts.

Visual fixture: account `acct-everyday`, date2026-05-24, amount12.00, payee Demo Lunch Shop, category Groceries, memo Demo lunch. Transfer targets the synthetic Travel account; split has two allocations. Render blank/filled/transfer/split in both themes and widths, then scroll all nonblank states to the bottom. `native-final/hill-*` preserves all28 final states. `before-after-light.jpg` and `before-after-dark.jpg` compare the filled390 state with the unchanged baseline.

The temporary native validation harness used real `TransactionFormView`, native accessibility activation, `UITextField.insertText`, `AppModel`, its outbox and the real API. It was removed before landing, not made a network-dependent unit test. Repeatable steps and independent expectations:

1. Sign into the local stack, load accounts/categories/payees, and open blank native Add with Everyday Account seeded and a unique Demo native refinement memo.
2. Activate keypad5,4,0 (the keypad shifts cents from the right), then next. Search/select Capture Toast Verify in the native Payee picker. The amount is5.40.
3. Scroll to the final controls. To claim must be fully inside the window and not intersect Save. Activate it, require accessible value On, and Save. Drain the outbox. GET the saved row independently: account `acct-everyday`, amount−5400 milliunits, exact unique memo and `claim_status: to_claim`.
4. Render a12.00 transfer using the real Rainy Day Saver transfer payee and its target account `acct-saver`. Activate To claim and Save. GET both sides:−12000 in Everyday,+12000 in Saver, linked IDs. An early fixture specified only a target account without its transfer payee; that is not the state the native picker produces. Correcting the fixture fixed that validation failure without an app change.
5. Render a split with Groceries−7.00 and Dining Out−5.00. Activate To claim and Save. GET parent−12000 and child amounts−7000/−5000, with the claim marker retained.
6. Refresh the native register and require Capture Toast Verify. Render `TransactionDraft(duplicating: saved)` and require Add Transaction, the same payee/amount and hidden calculator keypad. This exercises the real duplicate form, not a physical long-press gesture.

The four-test final native probe passed: real API recipe,28-state rendering matrix, mapped-Flag layout/OCR, and existing Add/Edit row geometry. The recorded real-API run passed again. An independent orb HTTP GET also confirmed ordinary−5400, transfer−12000/+12000, split−7000/−5000 and all three claim markers. Sanitised responses are in `native-final/api-persisted.json`.

`native-entry.mp4` is an inspected18-second recording of native accessibility-driven automation, cropped to the hosted390×844 surface and downscaled to2×. It shows keypad, payee search, selected claim and separate Save, then transfer and split lower controls. It is not physical touch, pointer automation or a complete app-navigation recording. Save/outbox persistence is established by executed assertions and HTTP, not inferred from the movie. The register and duplicate screenshots are separate native surfaces. Home-screen Quick Action was not physically long-pressed in this run; its existing native routing tests remain part of the full suite.

## Regression checks and test readiness

The Save obstruction assertion was added to the existing rendered Add/Edit geometry test before the footer implementation. It failed in three baseline states, then passed with the reserved footer. No new unit-test file was added.

Accessibility3 rendering exposed a450pt-wide row in a390pt window. Bounds assertions added before the adaptive-layout fix failed with x−30/maxX420. Final rows are x16/width358, and all mapped Flag words remain visible under OCR. A temporary lower-view validation additionally confirmed both enlarged Follow-up chips fit inside the window and do not intersect Save; `accessibility-lower.jpg` was inspected. Temporary capture-only assertions were removed after validation.

The pre-existing Assistant failures were a test-readiness race: the display-link overlay briefly had midX368 while Add had338, then both reached338. Both existing tests now wait for alignment within their original18pt tolerance, keeping their original assertions and production geometry. The initial full suite also exposed an incorrect Flag-test scroll conversion: a global row position was treated as an absolute offset despite UIKit's negative initial navigation inset. Starting the scroll at zero fixes that conversion without weakening OCR assertions.

Commands used on the Mac, always fresh builds:

```sh
scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests/CaptureSnapshotTests/testMappedFlagUsesAvailableWidthAndAllowsAccessibilityGrowth
scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests/CaptureSnapshotTests/testAddAndEditTransactionFormRowsShareHeightAndOrder
scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests
bun run check
```

The initial full run was not green:825 tests, one skipped, one Flag OCR failure. Targeted corrected runs passed. The final landing gate is `bun run check` on the rebased, clean committed source; its result is recorded in the thread alongside the pushed SHA. This artifact does not count the failed initial run as a pass.

Production-source SHA256 fingerprints for the inspected final rendering and live-API run:

```text
78c27e8d4cee11fe14fa976f53db9640c62f75e4c6da3b333afebb13fa52d262  TransactionFormView.swift
eb67592b209c954227848902182119f7eb21124d268adb7c19f21d434f6e6d95  Components.swift
```

Limitations: no physical-device install, VoiceOver session, measured whole-screen contrast certificate, or external build distribution. Native Add is the bounded adaptation; other native main screens were not redesigned in this round.
