# useConfirmationFocus: restore receives the closing key

Revision: branch refactor/useConfirmationFocus on origin/main 2047fff, plus this commit.
Fixture: `control-howmuch launch` (disposable stack, owner `verifier`, synthetic data), recipe `api-tokens.md`.
Driver: Playwright/Chromium script (scratchpad e2e.mjs), no secrets saved.

Steps: create owner; open /api-tokens; create tokens "Verify alpha" and "Verify beta", dismiss each reveal;
click Revoke on beta; click Cancel; click Revoke on alpha; click Cancel. Log document.activeElement each time.

Expected: confirmation opens with Cancel focused; Cancel returns focus to that same row's Revoke button
(the original control was unmounted, so this exercises the restore callback).

Observed:
- after open (beta): BUTTON:Cancel (Verify beta)
- after cancel (beta): BUTTON:Revoke (Verify beta)
- after open (alpha): BUTTON:Cancel (Verify alpha)
- after cancel (alpha): BUTTON:Revoke (Verify alpha)

Screenshots: confirm-open.png, after-cancel.png.
Checks: `bun run --cwd apps/web typecheck` clean; `bun test` 413 pass, 0 fail.
