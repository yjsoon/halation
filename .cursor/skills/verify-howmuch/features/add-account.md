# Add account

A signed-in owner creates an account on the web from `/accounts/new`. A new ledger with no accounts points there from the Ledger, the sidebar, Quick entry and Rewards, so a web-only self-hoster is never stuck.

## Sub-features

- `add-account-empty-ledger` an empty Ledger shows only its heading, a **Start with an account** panel and one **+ Add your first account** link: no balance, filters, search, toolbar, totals or keyboard hints.
- `add-account-empty-elsewhere` points the sidebar, `/add` and Rewards at New account when there are no accounts.
- `add-account-create` creates an account with a name, type and today's balance, then opens its register.
- `add-account-liability` asks a liability for **Amount owed** and stores it as a negative balance.
- `add-account-quick-entry` returns from `/add` to Quick entry with the new account chosen.
- `add-account-starter-categories` the first account gives the plan the starter groups Everyday, Bills, Life and Income (14 categories, the same set and ids iOS local mode creates). Setup alone adds none, so a fresh server still accepts an iPhone ledger upload or archive restore.

## How to get to it (user POV)

- **+ Add your first account** under the empty Ledger panel.
- **Add your first account** in the sidebar account list (empty ledger only).
- **+ New** beside the `Accounts` heading in the sidebar (always).
- **Add an account** on `/add` with no open accounts.
- **Create an account** on Rewards with no accounts, and on `/rewards/new` with no eligible accounts.

## Driving it with control-howmuch

Preconditions:

- An isolated stack whose database has **no accounts**. `control-howmuch launch` seeds the demo ledger, so for the empty sub-features start a second API on a fresh folder under `/tmp/howmuch-verify/` without seeding (`scripts/local-worker.sh prepare <dir>`, then `scripts/local-worker.sh start <dir> <port> --var HOWMUCH_API_TOKEN:howmuch-verify-bootstrap --inspector-port <free port>`, with Vite's `HOWMUCH_API_URL` pointed at it), and complete first-owner setup (`verifier` / `howmuch-verify-15`, token `howmuch-verify-bootstrap`).
- `add-account-create` and `add-account-liability` also work on the seeded stack through **+ New**.

- **Empty Ledger.** After setup, the page text is exactly `Ledger`, `Start with an account`, `Transactions live in accounts. Add the one you spend from most, with today’s balance.` and `+ Add your first account`, a link to `/accounts/new`. There is no `Balance`, `Filters`, `Search transactions`, `+ Add transaction`, `Reconcile` or `0 transactions` footer.
- **Empty elsewhere.** Rewards shows `Add an account first` with a `Create an account` link; `/rewards/new` shows `No open spending account yet.` with the same link. `/add` shows `No open accounts available.` with an `Add an account` link to `/accounts/new?then=add`.
- **Create.** Choose `+ Add your first account`. Heading `New account`, title `New account · Halation`. `Create account` is disabled until Name is filled; the empty Name field says `Required. Give this account a name.` Fill Name `Travel Card`, Type `Credit card`. The balance label becomes `Amount owed`. Typing `1.2345` keeps the button disabled and shows `Enter a number such as 1500 or 1500.50.` Fill `500` and choose `Create account`. A type that is not a liability keeps `Current balance` and offers `Below zero` beside it; ticked, `20` is stored as `-20000`.
- **Result.** The page lands on `/transactions?accounts=<id>&range=all` with heading `Travel Card`. The sidebar lists Travel Card, the empty hint is gone, `+ Add transaction` is enabled, and the empty register reads `Choose + Add transaction to record the first one.`
- **Starter categories.** Before the first account, `GET /v1/plans/{plan}/categories` returns no groups. After `Create account`, it returns the four starter groups with ids `starter:{plan}:grp:everyday` and so on, and the register's Category list offers them. Reload does not add more.
- **Quick entry.** From `/add`, `Add an account` opens `/accounts/new?then=add`. Creating `Wallet` (Cash) returns to `/add?account=<id>` with Account `Wallet`.
- **Proof.** `control-howmuch http GET /v1/plans/{plan}/accounts` (or the session cookie) returns Travel Card with `type: creditCard` and `balance: -500000`. Reload keeps the register. Screenshot the empty Ledger, the filled form and the register after create.

## Gotchas

- The demo seed has accounts, so the empty-state sub-features cannot be verified on a default `control-howmuch launch`.
- Two 401s in the console before sign-in are the session probe, not a failure.
- Viewport ≤720px hides the sidebar. Open **Open menu** to reach **+ New**.
