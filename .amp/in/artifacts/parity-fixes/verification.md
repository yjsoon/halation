# Scheduled and Quick entry parity fixes

Base: `b29e5d69` (origin/main fetched after the audit at `9562e4c8`). Each section was checked against the working changes committed alongside that section. No production access.

Setup: existing disposable `control-howmuch launch` stack `20261117T113404-3430`, browser first-owner setup, synthetic audit fixtures. `control-howmuch doctor` passed. Browser session `parity`, Chromium, 1440×1000 and 390×844 CSS pixels, DPR 2. iOS comparisons use source only.

## P-10: Escape and focus restoration

- Recipe: `.cursor/skills/verify-howmuch/features/scheduled-transactions.md`, editor cancellation extension.
- Before: open Add schedule, press Escape. DOM: `{editor:true, focus:"SELECT"}`.
- After, at both widths: open Add schedule, press Escape. DOM: `{editor:false, focus:"Add schedule"}`. Open an existing row's Edit, press Escape: `{editor:false, focus:"Edit No payee"}`. Uses the existing opener/fallback focus hook; no extra focus policy.
- Read-back: `control-howmuch http GET /v1/plans/local-plan/scheduled_transactions` retained exactly the two existing audit schedules, Named flag audit −2220 and Closed account audit −1230 milliunits. Cancellation did not write.
- Recording: `schedule-escape.webm` retained outside git beside this record.

## P-09: Closed account choices

- At both 1440 and 390 pixels, Add schedule offers only Choose account, Everyday Account and Travel Card. Transfer offers only Travel Card when posting to Everyday Account. Both new split-line transfer selectors also exclude the closed saver.
- Existing Closed account audit still selects `Rainy Day Saver (closed)`. Saved its memo as `P09 closed retained 1440`, then `P09 closed retained 390`, through the editor.
- `control-howmuch http GET /v1/plans/local-plan/scheduled_transactions` confirms account_id `acct-saver`, amount `-1230`, memo `P09 closed retained 390`. The existing schedule did not silently move to an open account.
- Existing closed transfer targets are retained per original schedule/line, rather than exposing every closed account to every new line. New account choices otherwise follow Quick entry's open-account rule.
