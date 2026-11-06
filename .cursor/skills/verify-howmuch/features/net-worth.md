# Net worth

Net worth is a period series of account balances plus a headline for the latest close. The default range is the trailing year, which includes the March–May 2026 demo.

## Sub-features

- `net-worth-open` opens the report from the **Reports** group in Primary navigation and from `/net-worth`.
- `net-worth-default` shows a non-zero latest net worth on the trailing-year window.
- `net-worth-accounts` lists Everyday Account, Rainy Day Saver, and Travel Card as columns.
- `net-worth-this-month-empty` can show no history when the current month has no closing snapshots in range.

## How to get to it (user POV)

- Choose **Net worth** in the **Reports** group of Primary navigation.
- Open `{web_url}/net-worth` with no query string.
- Keep the current query string when moving from another Reports link.

## Driving it with control-howmuch

Preconditions:

- `control-howmuch doctor` passes.
- Owner `verifier` is signed in.
- Demo accounts and opening balances are still seeded.

- **Open report.** Open `{web_url}/net-worth` (no query). Title is `Net worth · Halation`. Heading is `Net worth`. Filter rail hides the category picker.
- **Default trailing year.** Active preset is `1Y`. Latest net worth is `$554,677.70`. `Tracked accounts` is `3`. Table columns include Everyday Account, Rainy Day Saver, and Travel Card.
- **All range.** Choose `All` if the trailing year looks thin. Latest net worth stays non-zero. Section `Trend` is present.
- **HTTP match.** `control-howmuch http GET "/api/reports/net-worth?plan_id=local-plan&from=2026-03-01&to=2026-05-31"` returns `data.periods` whose last `net_worth` is non-zero and whose `accounts` include `acct-everyday`.
- **Proof.** Screenshot the populated report (`artifacts/net-worth/trailing-year.png`) and save the HTTP JSON (`artifacts/net-worth/report.json`).

## Gotchas

- Category filters are ignored. The page does not show a category control.
- Leftover `from`/`to` for this month in 2026-08 can empty the series. Load `/net-worth` with no query, or choose `1Y` / `All`.
- Closed accounts can appear in history but drop out of the “active columns” if their balance stays `0` in the window.
- Heading, nav link and document title all read `Net worth`.
- On a viewport ≤720px the filter rail sits behind **Filters ▾**. Open it before choosing `1Y` or `All`.
- The Trend line draws in on first load and when the period set changes (range or interval), not on a refetch of the same range. Screenshot after it settles (about 0.6s).
- The unfilled stepped line uses a zoomed value axis, with a visible `Zoomed value axis · zero not shown` note when zero is excluded. Check positive, negative, one-snapshot and zero-only ranges; tick labels must remain distinct, points finite and the note truthful. Income bars and Money age retain their zero baselines.
- At 320/390px, Period, Net worth and Delta lead the table; desktop retains account columns before totals. Keyboard-focus the named **Account balance history** region and use ArrowRight: Period and its header stay fixed, account components become visible, and the trailing fade disappears at the last column. Repeat with one selected account so a minimum table width cannot push totals out of view.
- Resize between 320 and 1440px: chart labels and strokes remain readable at a 240px chart height. Capture both themes and a scrolled table under `.amp/in/artifacts/`; keep API results and exact fixture/query with the captures.
