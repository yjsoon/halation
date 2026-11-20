# Colour names on a stored reward card (web)

Revision: verified on `9bfd27a8` (origin/main) with this commit's change to `apps/web/src/pages/RewardCardEdit.tsx` applied.
Recipe: `rewards-colour-names-stored` in `.cursor/skills/verify-howmuch/features/rewards-card-edit.md`.
Stack: `control-howmuch launch` run 20261117T113411-3557 (disposable SQLite seeded from the synthetic demo ledger), owner `verifier`, currency SGD, day-first dates. Chromium through agent-browser at 1440x900 and 390x844, DPR 2. Stored names were read back in the browser session from `GET /api/import/rewards-tracker?plan_id=local-plan`.
Fixture: `card-travel` (Travel Card) with active flags red `Dining` 4, blue `Online` 3, yellow `Dining` 2, purple `Travel` 1, and stored names red `Dining`, blue `Online`, yellow `Dining`, purple `Travel`, green `Health`. Orange and None have no name. Green and orange have no flag on the card.

Before this change a stored card had no Colour names box, so a colour with no flag row could be named only in Account settings on the card's register.

## Steps and results

1. Open `/rewards/card-travel` at 1440. Title `Edit card · Halation`. The Colour names box is present with the note `Names apply only to this account.` and seven fields: `Red=Dining, Orange=, Yellow=Dining, Green=Health, Blue=Online, Purple=Travel, None=`. The flag note ends `Name the colour above and it appears on this account.` An untouched page raises no leave warning.
2. Type `Eating out` in Red name. Flag row 1's Colour name reads `Eating out`. Put Red back to `Dining`: the leave warning is off again (`leave warning=false`), so the draft counts as unchanged.
3. Type `Petrol` in Orange name (no flag on the card). The leave warning turns on. **Save card** lands on `/rewards` with focus on the `Rewards` heading. Stored names now include `"orange":"Petrol"`; the four flags and the one `ruleHistory` entry are unchanged.
4. Open the card again at 390. The seven fields show `Orange=Petrol`; no horizontal overflow (`scrollWidth` 390). Clear Green name and **Save card**: lands on `/rewards`, and the stored names no longer have `green`.
5. Clear Red name (red has an active flag) and **Save card**: refused in flag row 1 with `Could not update this card. Name the red colour on this card.`, in view, focus in `Flag 1 colour name` with `aria-invalid="true"`, nothing beside Save card. **Cancel**, then **Discard changes**: lands on `/rewards` and the stored names are as after step 4.
6. Open `/rewards/new`: the Colour names box is unchanged, seven empty fields with the same note.

Also checked on the same change before it was moved onto `9bfd27a8`: flag row 2's Colour name changes Blue name at the top; **Cancel** with a changed name asks `Discard reward changes?`; after naming green `Health` the Travel Card register's add row offers `None, Dining, Orange, Dining, Health, Online, Travel` and Account settings shows `Green category name=Health`; light and dark at both widths.

Screenshots (not committed): names-before-1440.png, names-before-390.png, names-after-1440.png, names-after-1440-dark.png, names-after-390.png, names-after-390-dark.png, names-red-unnamed-1440.png.

Not covered: Safari, a phone and its keyboard, the iOS editor (compared from source only), the production stack.
