# Web accounts, register and rounded controls

7 November 2026. Isolated synthetic ledger only. This round follows Settings `b7ce87c549e0f75ec173a601a1f03a3380ef70bd`. No production data, deployment, release or native iOS implementation is included.

## Scope and design decisions

Home redirects to the all-account Ledger. There is no separate accounts-overview route to redesign: account balances live in the desktop sidebar and narrow navigation menu. The earlier register round included all-account views, but this round explicitly adds 1024 desktop, editing, selection, composer and organiser coverage.

Keep the dense table at 1024, 1200 and 1440. Compact navigation through 1280 frees room for money/status columns; rows become stacked below 1001. YJ rejected the proposed desktop card editor. Editor and composer retain their original nine table cells, with each field under its column heading and the flag/follow-up and completion controls below. The source history (#75, whole-row editing) deliberately removed a separate transaction panel. Native date/select/number inputs, raw amount editing, accounting reducers, transfer/split restrictions and reconciliation locks are retained.

All five judges independently chose density B (13.5 px retained at 1024, tighter gutters) and focus C (an inside accent border). A's 13 px type bought no visible fit advantage; B showed the complete supplied memo where A did not. Both converge at 1200. Soft-fill focus was weak against the tinted row; the underline remained viable but curved with the field's lower edge. C identifies the entire field without an offset second ring. All text fields share the inside outline; native checkbox/radio focus remains separate. Phone-size fields retain the 16 px Safari zoom floor. The 390 drawer has a flat opaque background instead of a decorative landscape wave crossing its footer.

The original active editor left Cleared empty, rather than clipping it. At the user's request, approved rows now expose the existing immediate cleared toggle and reconciled lock while editing. Approval remains on the completion strip. The draft is disabled while that row's clear request is in flight. Clearing persists immediately, as it does outside editing: Cancel discards text edits, not a completed clear operation. A synthetic browser/API check failed before this addition and passed all 10 checks afterwards at 1024 and 1200, including retained draft, saved memo and reconciled lock.

Shared action buttons use Add's pill shape, plum primary and quiet secondary. Fields, theme previews and cards retain their own shapes. Selection inputs remain native checkboxes with rounded-square outlines, tick/mixed dash, keyboard focus and forced-colours fallback, distinct from round cleared status. The active editor retains its separate selection column, not an account-labelled checkbox.

Selection actions occupy space above the table and remain sticky while scrolling. This avoids the previous fixed bar covering final rows or running off the edge. Rows naturally pass beneath the sticky panel during scrolling; that is not evidence of inaccessible final rows. Delete is visibly destructive at every width. Narrow status chips no longer push Search away from Reconcile. Tool hover fills stay inside row bounds with equal text insets.

The accounts comparison retained editable emoji, row heights and destinations. Stronger account names and compact subtotal numerals improve scanning; redundant By type is omitted only when no custom/favourite collections need distinguishing. A 320 stress fixture with a long name and large negative balance retained the full amount and deliberately ellipsised the name.

## Independent panel record

Judges are separate read-only threads using screenshots, not code or one another's opinions. Historical scores are preserved in the thread's panel scorecard, not overwritten by replacements. These are visual opinions, not accessibility certification or persistence evidence.

- Sol: expanded baseline Ledger6/register6/editor5/drawer7/organiser7. A's ordinary table/desktop editor8; its newly exposed narrow clipping reduced assembled A to4. C fixes those defects and scores Ledger/register/editor/composer/organiser8. Accounts A/B separately scored7/8; B retained.
- Opus: initial assembled candidate7.5, selection7. Requested contained1024 selection, no final-row obstruction, destructive styling, clearer editor selection/context, narrow toolbar and Tools hover alignment. D supplies those targeted replacements. An unsettled dark1024 capture was withdrawn rather than treated as a new colour regression.
- Sonnet: earlier inspected scope8 overall, composer/editor7.5; it explicitly had not viewed1024 then. D spot-check includes1024 and raises composer/editor to8, with selection/accounts/Tools8. Organiser7.5 remains a minor preference; no further round recommended.
- Final D: Sol, Opus, Sonnet and Astra score assembled scope8 and recommend stopping. Fable scores7, driven by the narrow sticky panel partially covering a passing row; its desktop/1024 selection, editor, composer, accounts and Tools each score8. It also recommends stopping. Others regard the overlap as normal sticky scrolling, not evidence of inaccessible rows. Native Categorise popups are absent from Chromium screenshots, so expanded-menu appearance remains unjudged. No full-panel score was invented for unseen scopes.

Agreement: restored1024 financial columns, labelled editors with visible completion controls, clear action hierarchy and selection state, stronger account destinations and evenly inset Tools hover. Remaining preferences: dominant inverse selection panel, small-caps Flag/Follow-up labels, editable emoji, native date locale/field geometry, and desktop New-account whitespace. Organiser ranges7–8 across judges, with no remaining material defect. These differences do not justify another cosmetic round.

**D's desktop card is superseded, not approved by those scores.** Inline E was judged independently after YJ's correction. All five chose density B and focus C, each rating the supplied inline scope 8 overall. Sonnet did not open the 1200 captures and made no claim about them. The others confirmed the 1200 pair converged. These comparison packs showed existing-row editors, not a separately identifiable new-entry composer, and full-page density B used underline focus while C appeared in field crops. Sol and Astra then independently inspected all 22 assembled B+C editor, actual composer and Add-focus captures: both score the supplied scope 8, with no further material round requested. Account wrapping was the main minor density compromise; final styling truncates long account labels with full text retained in their title and accessible content, and puts desktop completion buttons beside Flag/Follow-up when space permits. Both judges noticed Add's focus edge was too close to its placeholder; a stable 4 px internal inset fixes that without moving text on focus.

## Repeatable fixture and commands

Use the repository demo seed in disposable SQLite `/tmp/howmuch-hill/ledger.sqlite`, plan `local-plan`, synthetic owner `verifier`. Supervised services `hill-api` on4174 and `hill-web` on4173. Browser session `hill`, desktop-hover Chromium, DPR2. Widths1440/1024/390 plus boundary320/720/721/1000/1001/1101/1280/1281. Narrow captures are Chromium width emulation, not physical phones, touch or Safari.

Recipes: `.cursor/skills/verify-howmuch/features/transactions-register.md`, `register-maintenance.md`, `register-compose.md`, `organise-accounts.md`, `add-account.md`, plus affected Settings and Rewards regressions. Historical table URL: `/transactions?from=2026-03-01&to=2026-05-31&accounts=all` or `accounts=acct-everyday`. Ordinary Ledger navigation uses `range=all`.

Scratch commands used during validation:

```sh
node .amp/in/verify-web-edit.mjs
node .amp/in/verify-web-split.mjs
node .amp/in/verify-web-compose.mjs
node .amp/in/verify-web-organiser.mjs
node .amp/in/verify-web-new-account.mjs
node .amp/in/verify-web-final-controls.mjs
node .amp/in/verify-settings.mjs
node .amp/in/verify-rewards.mjs
node .amp/in/audit-web-controls.mjs
bun run check
bun run --cwd apps/web build
```

The scratch harnesses are not permanent tests. The following steps, fixtures and expected values are sufficient to repeat the checks after they are removed.

1. **Ordinary edit at1024/390:** POST a synthetic transaction to `/v1/plans/local-plan/transactions`: account `acct-everyday`, date2026-05-24, amount-12500, payee `Demo Edit {width}`, category `cat-dining`, memo `Demo original`, uncleared, approved. Click its cleared circle and independently GET it to confirm cleared. Double-click the payee cell. Click every field: change native date segments to2026-05-23, payee to `Demo Edited {width}`, category to `cat-groceries`, memo to `Demo verified {width}`, outflow13.75, and focus inflow. Choose Red, To confirm and To claim. Save. GET must show date/payee/category/memo, amount-13750, red, needs_confirmation true and claim_status to_claim. Cancel a subsequent memo change and confirm the saved memo remains and the focused idle row is visible below the masthead. Change inflow to42.25, save and GET amount42250. Cancel Delete and confirm not deleted, then confirm Delete and require404 or deleted true.18 assertions passed.
2. **Splits and reconciled rows at1440/390:** POST a synthetic split of-10300 with allocations-6800/Groceries/memo Demo first allocation and-3500/Dining/memo Demo second allocation. Identify allocations by their unique memo, not response order. Parent amount/category are read-only. Edit first allocation to7.25 outflow, payee Demo allocation1440, Dining and its note: GET parent-10750 and line-7250. Edit the other to4.10/Groceries and its note: GET parent-11350 and line-4100. POST a separate reconciled synthetic row; clicking the lock must not toggle it. Edit its memo and independently confirm reconciliation remains. Delete disposable fixtures afterwards.10 assertions passed. An initial fresh-fixture harness incorrectly assumed returned allocation order; persisted-14050 correctly exposed that harness error. The rerun targets unique fixture memos, with unchanged expected sums and no application workaround.
3. **Composer:** exercise all/single account at1440/1024/390. For narrow resize an already-open desktop inline composer; ordinary narrow Add intentionally opens quick entry. Choose Everyday Account where selectable, synthetic payee, Dining, memo Demo rounded controls and outflow4.20. Save and add another must persist account acct-everyday, category cat-dining, memo and amount-4200, then clear payee. Cancel, delete fixture and repeat. Ten breakpoint checks require table/document widths to fit.34 checks.
4. **Selection:** click one row, require native select-all `indeterminate` and accessible mixed state. On desktop focus header and press Space to select all, then Space to clear. On narrow focus a row and toggle twice; header remains hidden in the existing compact layout. Test both scopes/themes. Check16px squares, visible focus, tick/dash and distinction from cleared rings. Check bar bounds at720/721/1000/1001/1024/1280/1281/1440, during entry-animation phases and after scrolling. Click Delete, read the full linked-transfer/split warning, cancel and clear selection. DOM checks prove containment; screenshots alone do not.
5. **Organiser:** at390 open navigation and Organise. Favourite Everyday Account, create Demo Cards and add Travel Card. Independently GET `/v1/plans/local-plan/account_preferences`, reload and confirm favourite/group membership. Rename to Demo Travel, delete group and confirm accounts remain. Restore original preferences using expected_revision.5 checks. Native modal scrolling is inside `.account-organiser-content`.
6. **New account:** exercise validation and create a fake credit account with500 owed. GET confirms balance-500000; reload confirms it. Soft-delete disposable account and its generated transfer payee in the local fixture.8 checks; no real account is touched.
7. **Shared-control audit:** at1440/390 light/dark inspect Add, Scheduled, Settings, API tokens, rewards import/terms/statement tools, four reports, Rewards/new reward, new account and API docs.60 route/width/theme states have no document overflow or filled sharp action controls; theme preview cards are deliberately excluded. Four sign-in states also inspected. Settings38 checks and Rewards24 checks passed, including persisted preferences and restoration. Tools hover/nav checks use actual pointer movement, not synthetic DOM hover.

## Evidence and limitations

`inline-final/` replaces D's rejected editor/composer evidence. Selected `web-d-*` captures retain unchanged selection/Tools evidence only. Ordinary table and baseline `web-audit-*` comparisons remain identified separately. `checkbox-before/after-*` show the square treatment. `web-edit-1024.mp4` covers the full pointer edit flow. The full 390 recording encoder failed after all 18 assertions passed; that stale clip is excluded. `web-inline-390-short.mp4` replaces it with a shorter independently persisted memo save and visible Cancel return. `web-split-390.mp4` and the organiser clip cover their additional contracts. All delivered recordings and 5 fps frame sheets were inspected. JSON check records and the checkbox accessibility snapshot accompany them. Screenshots of saved banners are not substituted for API reads.

Keyboard verification found a genuine focus gap: native date segments matched `:focus`, but the calendar button matched only `:focus-within`, losing the inside border. The shared field rule now uses `:focus-within`. The same failing Tab scenario passes afterwards in light/dark at 1024/390. All 16 keyboard assertions pass: Tab reaches date/payee/category/memo/outflow/inflow, every text field and date subcontrol retains the inside border, Escape restores idle-row focus, and ArrowDown opens the payee menu. A separate narrow Cancel check initially restored the row behind the 64 px masthead; nearest scrolling plus the row's scroll margin restores it visibly. The rerun passes at both widths. These are exercised browser regressions, not source-text assertions.

The final D capture harness initially used an unsupported browser find/focus syntax; it resumed with a supported scroll operation. A recorded narrow split-parent Cancel failure was traced to the browser driver: the button occupied y840.36–868.36 in an844px viewport, but click --human returned success after dispatching to HTML at y854. The app never received a button click. Explicitly scrolling lower actions into view is the correct user flow; no app workaround was added. Earlier theme screenshots without settling are not final evidence. No password change, external categoriser request, real-bank data, production write, physical-device test or full accessibility audit is claimed.

Pre-landing check:815 pass,0 fail,76083 assertions; web/worker typechecks and production build pass. Rebased checks, final visual verdicts and remote delivery are recorded when completed below.

## Rebased landing verification

Rebased onto `640f22d7`. Tested source revision `50f70d0e69797e2451d9961c7ef4759a8d285f62`; the final amendment only records this evidence, with no source changes. `bun run check`: **816 pass, 0 fail, 76088 assertions**, web and worker typechecks pass. The additional test came from current main. `bun run --cwd apps/web build` passes.

The real-stack landing recipe reran after rebase: **9/9** assertions for narrow uncategorised toolbar, account-menu navigation, exact saved memo/category/amount, bulk category persistence and keyboard select-all/clear. Active-editor Cleared reran **10/10** at1024/1200 and keyboard focus/menu/Escape checks reran **16/16** at1024/390 light/dark. The saved API response and tested revision are recorded beside this document. Disposable fixtures were deleted afterwards. Current-source screenshots were unchanged by rebase.

Delivery is the Git commit containing this record, direct to main under repository standing authority. No tag, deployment, production write, build publication or iOS implementation is included.
