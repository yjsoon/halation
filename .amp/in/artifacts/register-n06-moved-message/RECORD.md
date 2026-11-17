# N-06: moving a row says which account it went to

- Revision: branch `p-round4` on `hillclimb3` `9afef689`, after N-03. Change in `apps/web/src/pages/Transactions.tsx` (`commitRowEdit`).
- Sentence: the existing "<payee> saved." extended to "<payee> saved to <account>." as the lead specified; the "It is outside this date range." follow-on is kept when it applies.
- Stack: disposable `control-howmuch launch` stack, plan `local-plan`, synthetic data only. Fixture: "N03 Kiosk", Everyday, -7.00.
- Script: `.amp/in/orb-backup/n06.sh <width> <tag>` opens the Everyday register, opens the row editor on N03 Kiosk, chooses Travel Card in Account, Save, reads the toast, reads back, then moves the row back by `PATCH`.

| Run | Toast | Row still in Everyday list | Read back |
|---|---|---|---|
| Before (fix stashed), 1440 | N03 Kiosk saved. | no | acct-credit |
| After, 1440 | N03 Kiosk saved to Travel Card. | no | acct-credit |
| After, 390 | N03 Kiosk saved to Travel Card. | no | acct-credit |

A save that keeps the account still says "<payee> saved." (N-02 and VR-05 runs in this round).
