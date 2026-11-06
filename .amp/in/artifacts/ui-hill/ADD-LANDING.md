# Web Add redesign verification

6 November 2026. Synthetic local data only. YJ approved landing candidate B/fresh5 at 8/10 from Opus 5.5, Sonnet 5.5, GPT-6 Astra and GPT-6.1 Sol. Grok is permanently removed from the panel. The medium fallback's useful split-density findings were recorded in the thread scorecard before archiving it; it was never counted as Grok.

## Revision and checks

This artefact accompanies the Add redesign commit. Initial base: `d137f7a8baf51cfe05096c42e45947c90ab8f41c`; landing rebase target: `32a74d13`.

- `apps/web/src/pages/QuickEntry.tsx` SHA-256: `8c1146fc20ad70c801129c31bc3b7690f8959ec3f099f3b081feabc048dfd785`.
- `apps/web/src/styles/app/quick-entry.css` SHA-256: `12e039ccdc54e96d1e9dadb718eb751d61476529ce3524a68c87b40b3a567eda`.
- Pre-rebase `bun run check`: 818 pass, 0 fail; web and worker typechecks pass.
- `bun run --cwd apps/web build`: bundle and typecheck pass.
- Rebased `bun run check`: **815 pass, 0 fail, 76083 assertions**, web and worker typechecks pass, `check: pass`. The count fell because current main pruned three tests, not because checks were skipped.
- Quick-entry recipe rerun at rebased source revision `2f3d98a41a21ebe200224547ccf0ed5e64fd823a`: empty/zero Save disabled; success and reset confirmed; register and API match. `landing-saved.png`, `landing-register.png` and `landing-spend.json` contain the evidence. Repeated recipe runs produce separate synthetic transactions with distinct IDs. The final amendment adds this evidence only; source hashes above are unchanged.

## Reproduce the local stack

Use a disposable SQLite database and the repository demo seed. Set `HOWMUCH_DB_PATH=/tmp/howmuch-hill/ledger.sqlite` and `HOWMUCH_DEFAULT_PLAN_ID=local-plan`, then run `bun run demo:seed`. Run the API with `HOWMUCH_PORT=4174 HOWMUCH_TRANSITION_READ_ONLY=false bun run api:dev`, supplying a disposable local bootstrap token. Create/sign in the synthetic verifier owner. Run web with `HOWMUCH_API_URL=http://127.0.0.1:4174 bun run --cwd apps/web dev --host 0.0.0.0 --port 4173 --strictPort`. In an orb, use supervised services rather than detached shell processes.

## Quick-entry recipe and persisted results

Follow `.cursor/skills/verify-howmuch/features/quick-entry.md`:

1. Open `/add`; wait for the Amount input. Empty or zero amount keeps Save spend disabled.
2. Enter 6.80, Toast Box Verify, Everyday Account, Today, memo `verify quick entry`. Save spend.
3. Expect `Saved.` and `Toast Box Verify saved.`, blank amount/payee fields and the negative entry under Saved this session.
4. Follow Ledger and search Toast Box Verify. Expect the same date, account and negative6.80 transaction.
5. Authenticated GET `/v1/plans/local-plan/transactions?since_date=2026-11-06&until_date=2026-11-06` must contain amount-6800, account `acct-everyday` and the memo. Landing-run screenshot/API evidence is recorded alongside this file.

Additional affected behaviour was exercised on fresh5: split6.80 into Groceries3.00 and Dining Out3.80; open the first note, enter `Demo pantry note`, collapse with a click and reopen with Enter. Intermediate DOM assertions prove closed/open states and retained text. Keyboard order is category, amount, disclosure, note. Save as Demo Note Keyboard Verify after appending ` retained`; `fresh5-note-persisted.json` confirms -6800, allocations -3000/-3800 and the retained memo. Removing a third1.80 allocation leaves +1.80 unassigned and disables Save. Existing transfer verification confirmed linked -12350/+12350 entries; income saved +19210.

## Visual evidence and limits

The fourteen `fresh5-*.png` states cover populated desktop/narrow light/dark, two/three allocations, focused amount, empty form, transfer, open notes and long values. `fresh5-disclosure.mp4` and an inspected5fps contact sheet show real pointer movement, collapse and keyboard reopening. `baseline-fonts-*` are the corrected baseline comparisons: fonts loaded, matched filled content, themes settled750ms. Original baseline font failures and transition captures were discarded as comparison evidence.

Desktop1440×1000 and narrow390×844, DPR2. Narrow Chromium is not native-phone or touch evidence. No horizontal document overflow at320,390,768,1024,1440. Long payee/category/memo ellipsise at rest; complete-value presentation and long account names remain unverified. Computed light placeholder contrast5.30:1; disabled Save text4.84:1. This is not a full accessibility audit.

All four judges scored overall8 using the weakest important supplied state. They agree on improved amount/payee hierarchy, quieter controls, explicit allocation removal and note disclosure. Remaining disagreements concern split density, large-amount grouping, native numeric date formatting and landscape brightness. Native date/number controls were retained; date shortcuts stay on a separate row to avoid squeezing narrow controls. No production deployment or build distribution is authorised by this landing.

iOS is unchanged. Its baseline Mac test run separately failed three assertions across two Assistant-position tests (368 versus338 ±18); that fix is authorised for the later iOS phase, not included here.
