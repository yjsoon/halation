# Register: older transactions load as you scroll

Base: `origin/main` 6e3314fe plus this change, rebased onto b8b88fbe before landing. Mac satellite macos-27, iOS 27.2 simulators iPhone 17 and iPad Pro 11-inch (M5).

## Cause

The iOS register paged older rows through one plan-wide cursor (250 rows a page, every account) and filtered locally. In a quiet account most pages hold none of its rows, so each "Load older transactions" tap could add nothing ("Nothing older here yet. Searched back to …"). The web register did the same for multi-account views.

## Change

- iOS registers the server can narrow page only their own rows: one account (`/accounts/{id}/transactions`) and Insights drill-downs (`since_date`/`until_date` = the report's dates), starting at the plan-wide frontier. Each load adds rows or reaches the end. Categories stay local: the server matches a row's own category, not split lines. The web register already sends a view's dates to the server.
- Every register loads older rows on its own as the footer comes near (iOS footer `.task`, web IntersectionObserver), with no button.
- Views the server cannot narrow (several accounts, Uncleared) stop after 10 loads that list nothing, show "Nothing older in this view back to {date}." and offer "Search further back".
- End of history: "No older transactions. Earliest transaction here: {date}." (web: "No older transactions. Earliest here: {date}.").

## Fixture

`control-howmuch launch` demo ledger plus, through the local API: 7,144 Travel Card rows (8 a day, 1 Jun 2024 to 10 Nov 2026), 10 Rainy Day Saver rows with gaps of up to 7 months (16 Oct 2026 back to 1 Jul 2024), and one empty account "Synthetic Empty". All synthetic.

## Observed

| Case | Before (main) | After |
| --- | --- | --- |
| iPhone, Rainy Day Saver, reach 1 Jul 2024 | 13+ taps, 7 of them added nothing (`before-empty-tap.png`) | scroll only; ends "No older transactions. Earliest transaction here: 1 Jul 2024." (`after-iphone-end.png`) |
| iPhone, All | button | loads while scrolling, Jul 2026 to Jun 2024, then end note (`after-iphone-all-loading.png`, `after-iphone-all-end.png`) |
| iPhone, All + Uncleared (1 row in 2024, 1 in 2026) | | stalls "Nothing older in this view back to 27 Feb 2025" + Search further back; one tap reaches 1 Jul 2024 (`after-iphone-uncleared-*.png`) |
| iPad, Rainy Day Saver | | end note (`after-ipad-account-end.png`); right swipe still shows Clear inside the card inset; Clear landed, API `cleared` (`after-ipad-swipe-clear.png`) |
| Web, Everyday + Rainy Day Saver | | walks ~29 pages unprompted, ends "No older transactions. Earliest here: 1 Jul 2024." |
| Web, Everyday + Synthetic Empty | | stalls "Nothing older in this view back to 30 Mar 2025." + Search further back; one click reaches end (`web-multi-*.png`) |
| Web, Groceries category | | 500 to 3,000 rows on scroll, no clicks (`web-category-scrolled.png`) |
| iPhone, Insights March 2026 spending, tap Groceries | pages back from Nov 2026 through the plan | one dated request; FairPrice Finest 5 Mar 2026 and the end note within 2s (`after-iphone-drilldown.png`) |
