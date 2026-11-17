# P-02 follow-up: one Account control in the row editor

- Base: hillclimb 0e1f6bad, disposable local stack (control-howmuch), synthetic data only.
- Method: open the "Activity Test Employer" row's editor (focus the row, Enter) and list the visible Account controls.

| Scope | Width | Before (0e1f6bad) | After |
| --- | --- | --- | --- |
| All accounts | 1440 | read-only name in the Account cell + Account field below | select in the Account cell only |
| All accounts | 1024, 721 | not measured | select in the Account cell only |
| All accounts | 390 | read-only "Account / Everyday Account Renamed" + Account field at the bottom | select in the Account cell only |
| Everyday Account | 1440, 1024 | Account field below (cell hidden) | Account field below only |
| Everyday Account | 721, 390 | not measured | select in the Account cell only (the stacked editor shows the cell) |

Save path at 390 on all accounts: the 17 Nov Activity Test Grocer row on Travel Card moved to Everyday Account through the cell select; "Activity Test Grocer saved."; API: `2026-11-17 -40000 Activity Test Grocer acct-everyday`.
