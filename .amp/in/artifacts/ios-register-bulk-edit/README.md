# iOS register: bulk edits for selected transactions

- **Request (YJ, 13 Nov 2026):** selecting transactions did nothing beyond the total; allow changing category, flag colour and cleared status in bulk.
- **Base:** `origin/main` at `2dfc70b6` (bottom selection bar).

## Why YJ's screenshot showed the old top card

His capture says "In $… · Out $…" and shows status padlocks while selecting; `2dfc70b6` changed both (now "$X in · $Y out", no status icon while selecting), so it came from a build before `2dfc70b6`, not from TestFlight build 28. The capture is 1407 × 2000, the proportions of the iPhone Duo inner display fully open (2007 × 2853), in the sidebar layout. On that layout `2dfc70b6` still left the bottom tab bar visible while selecting (`duo-before-tab-bar-stays.png`): it hid the tab bar only on the compact path, and the Duo's sidebar `TabView` draws its bar along the bottom as on an iPhone.

## Change

- **Edit menu** in the selection bar: Category…, Flag (six colours, Remove Flag), Mark Cleared, Mark Uncleared. The picks stay selected after each change, so a category and then a flag can go on the same rows.
- **Category** goes through the editor's own edit path, row by row, keeping each row's approval. Transfers, splits and the linked side of a split line keep their category (they carry it elsewhere), as the web's bulk Categorise does. The sheet ticks the picks' category when they share one.
- **Flag** uses the same edit path. Every row takes it except the linked side of a split line, which the server lets change only through its split.
- **Cleared / Uncleared** queue the same guarded status change as the row's own status control.
- **Reconciled rows:** category and flag change (neither moves a balance); cleared status stays locked and the toast says how many stayed locked. There is no bulk "mark reconciled": only Reconcile, which checks the statement balance, locks rows. The menu shows "Reconciled transactions stay locked" when the picks include one.
- **Sidebar layout on a phone (iPhone Duo inner display):** the tab bar now hides while selecting, as on compact iPhones. iPad is unchanged.

## How it was driven

- Amp Mac satellite (macos-27 image, mac.large), Xcode 27.3 (27C5020n). Simulators: iPhone Duo (iOS 27.1), fully open, portrait, inner display; iPhone SE (3rd generation, iOS 27.3).
- Stack: `control-howmuch launch` (plan `HowMuch Demo`), API forwarded to Mac port 57691, signed in as `verifier` from the app's Connection screen.
- Fixture added through the API before driving (`.amp/in/scratchpad/seed-bulk-fixture.ts`): the four oldest Everyday Account rows cleared and reconciled at 8 Mar 2026, a $150 transfer to Rainy Day Saver and a two-line $42.50 split dated today; later one unapproved $8.80 row.
- AXe cannot send touches to the Duo (it rejects the hinge's motion sample in every pose), so the Duo was driven with mouse clicks on Device Hub's device view, mapped from `axe describe-ui` frames. The SE was driven with `axe`.

| Step on the Duo (Everyday Account register) | Expected | Observed |
| --- | --- | --- |
| Select, Select All | Bottom bar `14 selected`, `+$12,816.00`, Edit; tab bar and Add hidden | As expected (`duo-select-all.png`); before the change the tab bar stayed (`duo-before-tab-bar-stays.png`) |
| Edit | Category…, Flag, Mark Cleared, Mark Uncleared, "Reconciled transactions stay locked" | As expected (`duo-edit-menu.png`) |
| Flag → Red | Toast "Flagged 14 transactions red."; server: all 14 `flag_color=red`, 4 still `reconciled` | As expected |
| Mark Cleared | Toast "Marked 10 transactions cleared. 4 reconciled transactions stayed locked."; server: 10 `cleared`, 4 `reconciled` | As expected (`duo-cleared-toast.png`), landed within about 25 s |
| Category… → Groceries | Sheet ticks nothing (mixed picks); toast "Set 9 transactions to Groceries. 2 transfers or splits kept their own."; server: 12 rows Groceries (3 already were), transfer and split unchanged, reconciled rows still reconciled with the same amounts | As expected (`duo-category-sheet.png`, `duo-category-toast.png`) |
| Done | Tab bar and Add come back | As expected (accessibility tree lists `Tab Bar` and `Add Transactions` again) |
| All Transactions: long press the unapproved row → Select, tap a Travel Card row, Flag → Blue | Menu flags in their own colours; server: both `blue`, the unapproved row still `approved=0` | As expected (`duo-flag-menu.png`) |

| iPhone SE (375 pt) | Expected | Observed |
| --- | --- | --- |
| Select All on Everyday Account | Count and total stack beside Edit and the close button; nothing clipped | As expected (`se-select-all.png`) |

## Checks

- `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests` on iPhone SE, fresh build-for-testing ("products match this worktree"): `Executed 825 tests, with 1 test skipped and 0 failures`. An earlier run on the same simulator failed 9 `CaptureSnapshotTests` with empty accessibility trees, the known first-boot accessibility issue in `apps/ios/AGENTS.md`; the rerun passed.

## Not exercised

- iPad: the tab-bar change is gated to the phone idiom, so its path is unchanged; the Edit button there was not captured.
- Local mode (no server): the bulk edits use the same outbox commands as the editor and the status control, but were not driven against the local engine.
- A physical iPhone Duo.
