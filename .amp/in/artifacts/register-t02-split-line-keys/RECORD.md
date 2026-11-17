# T-02: Enter saves from a split line, and Remove line keeps focus in the split editor

- Revision: branch `p-round5` on `hillclimb5` `767ea37a`, after T-01. Change in `apps/web/src/components/RegisterEditableRow.tsx`: the editor's lower row handles Enter in an input or select as the row itself does (save, with the same composing guard), and Remove line moves focus to the Category of the line that took its place, or to + Add line when the removed line was the last.
- Stack: disposable `control-howmuch launch` stack, plan `local-plan`, synthetic data only. Fixture: the reconciled split "Split Test Market" (-9.99 in three lines) on Everyday.
- Script: `.amp/in/orb-backup/t02.sh <width>`: (1) types a memo in Split line 2 and presses Enter, then reads back; (2) sets Split line 1 to 5.99 and presses Enter; (3) focuses and chooses Remove line on line 1, adds a line, removes the last line, then presses Escape, and reads back.

| Step | Before (fix stashed), 1440 | After, 1440 | After, 390 |
|---|---|---|---|
| Enter in line 2 memo | nothing; editor stays open | "Split Test Market saved."; read back line 2 memo "T02 enter memo" | saved; read back "T02 enter memo 390" |
| Enter after making the lines off by 1.00 | nothing | stays open with "−$1.00 left to assign." | the same |
| Remove line 1 | focus BODY | focus \"Split line 1 category\" (the line that moved up) | the same |
| Remove the last line | focus BODY | focus \"+ Add line\" | the same |
| Escape after that | editor stays open (focus was on the page) | editor closes, focus on the row, read back still 3 lines | the same |

A memo change on this reconciled split saves without the reconciled question, as N-02 intends.
