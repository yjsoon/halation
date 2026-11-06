# Web register hill climb verification

6 November 2026. Synthetic local ledger only. Base: Add landing `3d80414d1fe9c340b44295f6d71b5d24363d2a74`. This record accompanies the register round; final rebased checks and judge decisions are recorded below before landing.

## Design decisions and evidence

Sol chose B over A: the flatter table and compact summary preserve ledger density. Wider C evidence exposed the narrow selected-actions bar and credit-account toolbar as the weakest states. D/E replace accidental wrapped action groups with a two-column grid above the rows, sticky below the masthead while scrolling. Native date entry, cleared controls, dense financial columns and underlying accounting behaviour remain unchanged. Single-account scope hides its redundant Account column; all-account scope retains it. Narrow Add stays in the masthead and carries the selected account.

The filter summary gets a complete line, date presets wrap rather than hiding their final options at320px, and Payment reminders has its own quiet row. Compose hints use the existing ink-faint token. Shared-shell changes only round organiser controls and remove Add's hard offset shadow; navigation and hit areas are unchanged.

Final screenshot set: `register-final-*.png`. Desktop 1440×1000 and narrow 390×844 at DPR 2, plus 320px stress states. The stale D scrolled image is withdrawn. The final dark scrolled capture has masthead bottom 68.5 and action-grid top 72 CSS px. Chromium width emulation is not physical-phone or touch validation.

Panel history is preserved in the thread's scorecard. C overall: Sol 7, Opus 7.5, Sonnet 7, Astra 7.5, Fable 6. E overall: Sol, Opus, Sonnet and Astra 8; Fable 7, also its score for the supplied Monarch/sign-in/Add references. All recommend no further broad visual round. Final spot refinements make presets left-aligned chips, bulk actions explicit quiet buttons, Delete red on its own paper surface, and native dark checkbox boundaries clearer. No checkbox semantics were replaced. Native date formatting remains a deliberate browser-locale trade-off.

The shown historical range matches no preset, so no active preset was expected. A separate All-selected capture and `aria-pressed=true` assertion confirm selection works. Existing flag swatches already have radio semantics, colour names, title text and a 2px selected border; a Red-selected capture confirms this. The earlier None-selected screenshots did not prove missing labels or selected state.

## Repeatable local setup

Use the repository demo seed against a disposable SQLite database, `HOWMUCH_DB_PATH=/tmp/howmuch-hill/ledger.sqlite` and `HOWMUCH_DEFAULT_PLAN_ID=local-plan`. Start the API on4174 with `HOWMUCH_TRANSITION_READ_ONLY=false` and a disposable bootstrap credential. Sign in a synthetic owner. Run web on4173 with `HOWMUCH_API_URL=http://127.0.0.1:4174`. In an orb use supervised services. No production service or data is involved.

Historical screenshot scope is `/transactions?from=2026-03-01&to=2026-05-31&accounts=acct-everyday` or `accounts=all`. Verification saves dated6November change working balances but not those visible historical rows. The4.20 baseline/candidate balance difference identified by Opus came from a successful synthetic compose save, not a calculation change.

## Executed recipes and observed results

Follow `.cursor/skills/verify-howmuch/features/transactions-register.md` and `register-compose.md` through the real browser:

1. Open Ledger with `range=all&accounts=all`. Scoot and FairPrice Finest appear. Search FairPrice,142.30,142 and$142.30 separately. Each returns only the expected FairPrice row; clear with Ctrl+A/Backspace and Scoot returns. Search fill-empty alone did not update React state in the automation, so real keys were used. `register-recipe-output.txt` records commands' assertions and observed rows.
2. Open Everyday Account. FairPrice remains; Scoot is absent. The Account column is hidden only in this scoped view. Working balances remain account-wide, independent of the historical date filter.
3. Open desktop Add transaction. Enter Demo Register Final, outflow4.20, memo Demo verified compose, category Dining Out. Save closes compose and shows the success toast and new row. Independent authenticated GET confirms amount-4200, account acct-everyday, category cat-dining and exact memo in `register-c-compose-final.json`. The inspected real-pointer recording `register-compose.mp4` shows neighbouring controls, entry and save. Its1280×800 capture predates only later radius/placeholder refinements.
4. At390px double-click SimplyGo19May2026. The stacked editor exposes labelled Date, Payee, Category, Memo, Outflow and Inflow. Change memo to Demo register narrow edit and save. GET confirms that memo and unchanged amount-17600 in `register-c-edit-persisted.json`.
5. Select SimplyGo and mark cleared. Then mark uncleared to restore it. Select Cold Storage, scroll350px and clear selection. `register-selection.mp4` shows the real moving pointer and sticky grid. GET confirms restored uncleared state in `register-d-cleared-restored.json`.
6. The first interaction run exposed a success toast covering the sticky count/clear control after another selection. The fix keeps the toast in flow while the bulk bar exists. The exact sequence was rerun successfully; the final recording and5fps contact sheet were inspected. Earlier diagnostic recordings are not completion evidence.
7. Open Reconcile and cancel without submitting. Account, statement date and balance fields are visible. Narrow masthead Add navigates to `/add?account=acct-everyday` with Everyday Account selected. The final `register-add-navigation.mp4` waits for the account control, rather than stopping on the route-loading shell. Shared shell styling was also rendered on Rewards and Settings in light and dark modes; no collision or shadow artefact was found.
8. Document scroll width equals viewport width at320,390,768,1024 and1440. At320 credit, search is195px wide and Payment reminders remains fully readable. All seven date presets fit within their parent after wrapping. Selected grid ends above the first row when unscrolled; during scrolling it remains below the masthead. No action is covered by a toast in the verified sequence.

## Checks and delivery

- Pre-landing and rebased `bun run check`: **815 pass, 0 fail, 76083 assertions**; web and worker typechecks pass; `check: pass`.
- `bun run --cwd apps/web build`: bundle and typecheck pass.
- `git diff --check`: clean.
- Rebased onto `199659b2`. Recipe rerun at source revision `b3fd690388e5a24102246e4ca50fdd4d57b78c11`: Demo Register Landing saved and search found the row. GET confirms amount -1230, account acct-everyday, category cat-dining and memo Demo rebased verification. Evidence: `register-landing-saved.png` and `register-landing-persisted.json`. All seven presets remain visible at 320px without document overflow.
- Opus and Fable inspected the final spot captures and found no regression or remaining material visual issue. Fable accepted native dates as a deliberate trade-off; Opus withdrew the flag selected-state concern.
- This artefact is included in the landing commit. The final amendment only adds verification evidence; the source hashes below are unchanged. The final pushed SHA and remote verification are reported in the thread. No deployment, signing, distribution or production writes.

Source SHA-256 values:

| File | SHA-256 |
| --- | --- |
| `apps/web/src/pages/Transactions.tsx` | `dc179fa3f2bfb4fb55906a9b839c0170dbabcdd3a9684abe3de374f632e480f2` |
| `apps/web/src/styles/app/register.css` | `e190d2adcd1f4df842d26f599e800acce773e7892f163eab7ac6bc4d2b792a0b` |
| `apps/web/src/styles/app/shell.css` | `5c2fe945e5a448b4373aec4daaf7ac4cc0b54f33116ba6801ce64c9b4ab8e6e4` |

## Limits

Screenshot scores do not prove functionality or measured accessibility. Native select popups, real touch/keyboard occlusion, long account/category strings and a complete accessibility audit are not covered. Narrow hollow cleared circles still rely on accessible labels and context; the display balance is more expressive but less mechanically legible than monospaced figures. No new decorative icons or custom date parser were introduced to chase a score.
