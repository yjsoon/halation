# First-owner setup

A brand-new HowMuch database has no user. The first visitor creates the owner account; later visits sign in with the same username and password. Setup is a real form, not a hidden API.

## Sub-features

- `setup-form` shows **Set up Halation** with Username, Password, and Setup token.
- `setup-token-note` explains the Setup token as the `HOWMUCH_API_TOKEN` secret, with a **How to set it** link to the self-hosting guide.
- `setup-wrong-token` with a wrong token shows "That setup token does not match…" and stays on the form.
- `setup-blocked` on a Worker with no `HOWMUCH_API_TOKEN` shows the steps to add the secret instead of the form (`/api/auth/status` has `setup_blocked: true`).
- `signin-private-note` shows "This is a private Halation instance…" with a link to the repository.
- `setup-create` accepts `verifier` / `howmuch-verify-15` / `howmuch-verify-bootstrap` and lands on Ledger.
- `setup-reject-short-password` keeps **Create account** disabled while the password is under 15 characters (spaces at either end do not count), and the note under Password says how many more are needed.
- `setup-empty-plan` setup creates no categories: `GET /v1/plans/{plan}/categories` has no groups until the first account (see [Add account](./add-account.md)), so the plan stays empty for snapshot import.
- `setup-data-note` the setup form says `Your account and ledger are stored only on this server.`
- `ia-no-plan` after create or sign-in: heading Ledger, Primary navigation has no `Plan`, `API tokens`, or `Rewards import`, `{web_url}/plan` and `{web_url}/no-such-route` both land on Ledger, and page text has no `Ready to assign`.
- `signin-return` shows **Sign in to Halation** after sign out (setup is no longer offered).
- `signout` returns to the sign-in form and drops the session.

## How to get to it (user POV)

- Open `{web_url}` on a freshly launched instance (setup).
- Choose **Sign out**, then open `{web_url}` again (sign in).
- Reload `{web_url}` with no session cookie.
- After create or sign-in, open `{web_url}/plan` and `{web_url}/no-such-route`.

## Driving it with control-howmuch

Preconditions:

- `control-howmuch doctor` passes.
- `GET {api}/api/auth/status` has `setup_required: true` and `user: null`.
- No HowMuch session cookie in this browser profile.

- **Open setup.** Go to `{web_url}`. The heading is `Set up Halation` and the submit button is `Create account`.
- **Short password.** Fill Username `verifier` and Password `short`. `Create account` stays disabled. The page does not navigate.
- **Token note.** Under Setup token the note reads `The HOWMUCH_API_TOKEN secret you set when deploying this server. How to set it`, and **How to set it** links to `self-hosting.md#4-create-the-setup-token`.
- **Wrong token.** Fill Username `verifier`, Password `howmuch-verify-15`, Setup token `wrong-token`. Choose `Create account`. The alert reads `That setup token does not match. Use the HOWMUCH_API_TOKEN value you set when deploying this server.` The form stays up.
- **Create owner.** Fill Username `verifier`, Password `howmuch-verify-15`, Setup token `howmuch-verify-bootstrap`. Choose `Create account`. The button reads `Please wait…`, then the shell appears with brand `Halation` and heading `Ledger`. Title is `Ledger · Halation`.
- **Home IA.** `Primary navigation` has no link named `Plan`, `API tokens`, or `Rewards import`. `Settings` is in the sidebar footer. Open `{web_url}/plan`. Lands on Ledger. Open `{web_url}/no-such-route`. Lands on Ledger. Page text has no `Ready to assign`.
- **Confirm session.** `control-howmuch http GET /api/auth/status` still reports `setup_required: false` (token is not a browser session). Proof that a user exists: `control-howmuch http GET /v1/plans` returns plan id `local-plan` and name `HowMuch Demo`.
- **Sign out.** Choose `Sign out`. Heading becomes `Sign in to Halation`. There is no Setup token field. The page says `This is a private Halation instance. Run your own.`, and **Run your own** links to `https://github.com/yjsoon/halation`.
- **Sign in.** Fill Username `verifier` and Password `howmuch-verify-15`. Choose `Sign in`. Ledger loads again.
- **Proof.** Screenshot the Ledger shell after create (`artifacts/first-owner-setup/all-accounts-after-setup.png`), the same shell after `/plan` (`artifacts/first-owner-setup/plan-redirects-home.png`), and the sign-in form after sign out (`artifacts/first-owner-setup/sign-in.png`). All show Halation identity. Primary navigation in the Ledger shots has no `Plan` link.

## Gotchas

- If the heading is already `Sign in to Halation`, this database has an owner. Do not call that setup. Cleanup and launch a new instance.
- `Create account` stays disabled until Username is non-empty, the password is ≥15 characters, and the setup token is non-empty (the verify stack always sets `HOWMUCH_API_TOKEN`, so the token field is present).
- scrypt is slow. Wait for Ledger, not a fixed 200ms sleep.
- Opening any app route without a session still renders the setup/sign-in form. That is not a routing bug.
- Do not POST `/api/auth/setup` from `control-howmuch http` and call the feature verified.
- This stack always sets the token, so it cannot reach `setup-blocked`. For that, from the repo root with no `.dev.vars`, run `bun run --cwd apps/web build`, then `bunx wrangler d1 migrations apply DB --local --persist-to <tmp> --config wrangler.jsonc`, then `bunx wrangler dev --local --persist-to <tmp> --config wrangler.jsonc`. Never deploy.
- iOS Connection cannot create the owner. Finish this recipe on `{web_url}` before any `ios-*` recipe.
