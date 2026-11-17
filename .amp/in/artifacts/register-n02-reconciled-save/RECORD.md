# N-02: ask before a save changes a reconciled row

- Revision: branch `p-round4` on `hillclimb3` `9afef689`. Changes in `apps/web/src/pages/Transactions.tsx` (`commitRowEdit`, the confirmation panel) and `apps/web/src/lib/register-row-edit.ts` (`changesReconciliationGraph`, `linkedTransferIds`).
- Rule, as iOS (`TransactionWriteModels.swift` `changesReconciliationGraph` and `needsEditWarning`): ask only when the row or a linked transfer is reconciled and the save changes the amount, account, date, transfer destination or a split's transfer lines.
- Wording, from `TransactionFormView.swift:389-395`: title "Save transaction changes?", the iOS message word for word, choices Cancel and "Save changes" (iOS "Save Changes" in the web's sentence case; "Save changes" is already a web button).
- Stack: disposable `control-howmuch launch` stack, plan `local-plan`, synthetic data only.
- Fixtures (API): "N02 Ride Hail" on Travel Card, -18.30, then `PATCH cleared: reconciled`; an Everyday to Rainy Day Saver transfer of 25.00 whose Saver side was then reconciled; the reconciled split "Split Test Market".
- Script: `.amp/in/orb-backup/n02.sh <width> <tag> [memo]` opens the row, changes Outflow to 19.30 (or the memo), presses Enter, reports the panel and the focused element, presses Escape, Enter again, then Save changes, reads back and restores.

## Before (fix stashed), 1440

```
after Enter: {"panel":null,"focus":"TR"}
toast: "N02 Ride Hail saved."
read back: -19300 reconciled
```

## After

1440 and 390, amount change:

```
after Enter: panel "Save transaction changes? | This transaction or a linked transfer has been reconciled. ... | Cancel | Save changes", focus BUTTON:Cancel
after Escape: panel null, focus INPUT:outflow (editor still open)
after Enter again: panel shown, focus BUTTON:Cancel
Save changes -> toast "N02 Ride Hail saved." ; read back: -19300 reconciled
```

- Memo only on the reconciled row, 1440: no panel, saved at once; read back memo "N02 memo only", still reconciled.
- Linked transfer, 1440: the Everyday side is only cleared, its Saver mirror is reconciled. Changing the date asked "Save transaction changes?"; after Save changes both sides read back 2026-11-14, the mirror still reconciled.
- Split editor (P-03), 1440, reconciled split: a line memo change saved without asking (read back "N02 split memo"); naming a line "Transfer : Rainy Day Saver" asked first; Escape closed the panel, kept the editor open and left the split unchanged.
- Moving a row: a reconciled row still cannot be moved (P-02); a row whose linked transfer is reconciled asks, by the same account rule.
