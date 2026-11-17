# T-03: the register heading keeps focus when the reward masthead replaces the header

- Revision: branch `p-round5` on `hillclimb5` `767ea37a`, after T-02. Change in `apps/web/src/pages/Transactions.tsx`: the heading's ref is a callback that notes whether the heading had focus when it unmounts and, if so, focuses the heading that replaces it. `headingRef` is still set, so N-11's focus after Create account is unchanged.
- Stack: disposable `control-howmuch launch` stack, plan `local-plan`, synthetic data only. Travel Card has a reward card (`card-vr05-travel`); Rainy Day Saver has none.
- Script: `.amp/in/orb-backup/t03.sh <width> <account>` opens the account's register, chooses Sign out, records every focusin and focusout, signs in with Enter in Password, waits and reports the log and the focused element.

| Run | Masthead | Focus log (last entries) | Final focus |
|---|---|---|---|
| Before (fix stashed), 1440, Travel Card | yes | in H1 "Travel Card", out H1 | BODY |
| After, 1440, Travel Card | yes | in H1, out H1, in H1 "Travel Card" | H1 Travel Card |
| After, 390, Travel Card | yes | the same | H1 Travel Card |
| After, 1440, Rainy Day Saver | no | in H1 "Rainy Day Saver" | H1 Rainy Day Saver |

Create account at 1440 after this change still lands with focus on the new register's H1 ("T03 Wallet").
