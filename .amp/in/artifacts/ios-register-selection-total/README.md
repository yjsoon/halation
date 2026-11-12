# iOS register: bottom selection total

- **Request (YJ, 11 Nov 2026):** make selecting transactions and seeing their running total easier to find on iPhone and iPad, and use the full width on narrow screens. YJ chose the bottom bar over the existing top card.
- **Base:** `origin/main` at `b8b88fbe`, after the web selected total (`e84332e8`) and the Duo split change (`1eb5ca19`). No file overlaps either.

## Change

- **Entry:** a long press on a row offers **Select**, which starts selecting with that row ticked. **Select Transactions** is first in the ⋯ menu, and a regular-width bar (iPad) shows a **Select** button.
- **Rows:** while selecting, the status circle hides, so the checkbox takes its room rather than the payee's.
- **Total:** a glass bar at the bottom (at most 560pt wide) shows the count, the signed net and, when the picks mix inflow and outflow, `$X in · $Y out`. While it shows, the compact tab bar, Add and the floating Assistant hide, and so does iPad's floating Add.
- **Shared rules with the web total:** signed sum of each pick's top-level amount in the plan's single currency, no FX, and the in/out line only when both sides are non-zero, with in first.
- Unchanged: the sunrise header (selecting keeps the plain header), right-swipe Clear/Unclear and the 16pt swipe inset.

## How it was driven

- **Mac satellite:** Xcode 27.3, iPhone SE (3rd generation) at 375pt and iPad Pro 11-inch (M5).
- **Data:** a temporary XCTest host (removed before landing) seeded a local-mode plan with twelve invented transactions on "Everyday Account" and mounted the real app root. It picked rows by posting to a temporary hook in `RegisterView` (also removed). Captures came from `xcrun simctl io screenshot`.
- **Real touches on iPad:** `axe touch` (1.5 s long press) on Kopi Corner, `axe tap` on Select and then on Salary.

| Check | Expected | Observed |
| --- | --- | --- |
| iPhone SE, 4 mixed picks | Bottom bar, `4 selected`, `+$4,980.75`, `$5,200.00 in · $219.25 out`; tab bar, Add and Assistant hidden | As expected (`iphone-se-before-after.png`, right) |
| Main before the change | Top card; Assistant overlaps row amounts | As described (`iphone-se-before-after.png`, left) |
| Nothing picked, dark, AX3 | Hint text; dark glass; total readable at AX3 | As expected (`iphone-se-states.png`). Row amounts wrap at AX3 on main too |
| iPad rest | Select button beside search and ⋯; floating Add shown | As expected (`ipad-add-hides-while-selecting.png`, left) |
| iPad selecting | Add hidden; bar under the register | As expected (`ipad-add-hides-while-selecting.png`, right; `ipad-selecting-dark.png`) |
| iPad Done | Add returns | As expected (accessibility tree lists Add again) |
| Long press → Select → tap Salary | Menu leads with Select; `1 selected, -$4.80`; then `2 selected, +$5,195.20` | As expected (`ipad-long-press-select.png`) |

## Checks

- `bun test`: 809 pass, 0 fail. `apps/web` and `apps/worker` typechecks clean.
- `scripts/ios-xcodebuild.sh test -- -only-testing:HowMuchTests` on iPhone SE, fresh build matching the worktree: `Executed 825 tests, with 1 test skipped and 0 failures`.

## Not exercised

- The iPhone long press with a real touch (driven on iPad only; the same `contextMenu`).
- Search while selecting with the bar at the bottom.
