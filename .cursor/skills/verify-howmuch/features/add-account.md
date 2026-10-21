# Add account

A signed-in owner creates an account on the web from `/accounts/new`. A new ledger with no accounts points there from the Ledger, the sidebar, Quick entry and Rewards, so a web-only self-hoster is never stuck.

## Sub-features

- `add-account-empty-ledger` shows **Add your first account** on an empty Ledger, with a **Create one** link, and disables **+ Add transaction** with the reason "Add an account first".
- `add-account-empty-elsewhere` points the sidebar, `/add` and Rewards at New account when there are no accounts.
- `add-account-create` creates an account with a name, type and today's balance, then opens its register.
- `add-account-liability` asks a liability for **Amount owed** and stores it as a negative balance.
- `add-account-quick-entry` returns from `/add` to Quick entry with the new account chosen.

## How to get to it (user POV)

- **Create one** in the empty Ledger panel.
- **Add your first account** in the sidebar account list (empty ledger only).
- **+ New** beside the `Accounts` heading in the sidebar (always).
- **Add an account** on `/add` with no open accounts.
- **Create an account** on Rewards with no accounts, and on `/rewards/new` with no eligible accounts.

## Driving it with control-howmuch

Preconditions:

- An isolated stack whose database has **no accounts**. `control-howmuch launch` seeds the demo ledger, so for the empty sub-features start the API on a fresh `HOWMUCH_DB_PATH` under `/tmp/howmuch-verify/` without `demo:seed`, and complete first-owner setup (`verifier` / `howmuch-verify-15`, token `howmuch-verify-bootstrap`).
- `add-account-create` and `add-account-liability` also work on the seeded stack through **+ New**.

- **Empty Ledger.** After setup, Ledger shows `Add your first account`, no "Try widening the date range" advice, and `+ Add transaction` is disabled with title `Add an account first`.
- **Empty elsewhere.** Rewards shows `Add an account first` with a `Create an account` link; `/rewards/new` shows `No open spending account yet.` with the same link. `/add` shows `No open accounts available.` with an `Add an account` link to `/accounts/new?then=add`.
- **Create.** Choose `Create one`. Heading `New account`, title `New account · Halation`. `Create account` is disabled until Name is filled. Fill Name `Travel Card`, Type `Credit card`. The balance label becomes `Amount owed`. Typing `1.2345` keeps the button disabled and shows `Enter an amount such as`. Fill `500` and choose `Create account`.
- **Result.** The page lands on `/transactions?accounts=<id>&range=all` with heading `Travel Card`. The sidebar lists Travel Card, the empty hint is gone, `+ Add transaction` is enabled, and the empty register reads `Choose + Add transaction to record the first one.`
- **Quick entry.** From `/add`, `Add an account` opens `/accounts/new?then=add`. Creating `Wallet` (Cash) returns to `/add?account=<id>` with Account `Wallet`.
- **Proof.** `control-howmuch http GET /v1/plans/{plan}/accounts` (or the session cookie) returns Travel Card with `type: creditCard` and `balance: -500000`. Reload keeps the register. Screenshot the empty Ledger, the filled form and the register after create.

## Gotchas

- The demo seed has accounts, so the empty-state sub-features cannot be verified on a default `control-howmuch launch`.
- Two 401s in the console before sign-in are the session probe, not a failure.
- Viewport ≤720px hides the sidebar. Open **Open menu** to reach **+ New**.
