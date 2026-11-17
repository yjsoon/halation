# N-12: the register's Scheduled group follows the date range

- Revision: branch `p-round4` on `hillclimb3` `9afef689`, after N-11. Change in `apps/web/src/pages/Transactions.tsx`: upcoming schedules (and the group's load error) are left out when the range's To date is before today; a range with no end, or one ending today or later, keeps the group.
- Stack: disposable `control-howmuch launch` stack, plan `local-plan` (today 17 Nov 2026), synthetic data only. Active schedules: MUJI on Travel Card next 25 Nov 2026, Straits View Residences on Everyday next 1 Dec 2026.
- Script: `.amp/in/orb-backup/n12.sh <width> <query> <tag>` opens `/transactions?<query>` and reports whether a Scheduled group is shown and the footer.

| Run | Range | Scheduled group | Footer |
|---|---|---|---|
| Before (fix stashed), 1440 | 1 to 31 Oct 2026 | shown | 7 transactions · $1,075.00 in · $120.00 out · +$955.00 net |
| After, 1440 | 1 to 31 Oct 2026 | none | 7 transactions · $1,075.00 in · $120.00 out · +$955.00 net |
| After, 1440 | default | shown | 43 transactions · … |
| After, 1440 | All time | shown | 249 transactions · … |
| After, 1440 | 1 to 17 Nov 2026 (ends today) | shown | 36 transactions · … |
| After, 1440 | 1 to 16 Nov 2026 (ended yesterday) | none | 25 transactions · … |
| After, 390 | October / default | none / shown | as at 1440 |
