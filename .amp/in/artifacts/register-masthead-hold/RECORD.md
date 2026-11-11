# Register masthead: no plain header first (web)

- **Report (YJ, 11 Nov 2026, v1.0.9):** "When I first open it, there's a 'flash' of the 'normal' header before we get the full-bleed rewards header."
- **Revision:** the commit this folder lands in, on `origin/main` at 630edce8.
- **Cause (observed, `probe-before-*.json`):** the register drew the plain header while the masthead's data loaded, then swapped. On a first open the masthead waited on two requests in series: the reward cards (`/api/import/rewards-tracker`), then the account's report (`/api/reports/rewards`). The plain "Travel Card" header showed for 953ms, then the masthead pushed the filters down from 193px to 334px. In-app from Everyday Account it showed for 320ms, one report round trip.
- **Fix:**
  - A card account expected to get the masthead holds the masthead's shape while its report loads: the title and balance where the sky puts them, and the ground's two lines reserved, with no sky.
  - The report is requested straight away, not after the cards.
  - When the report lands, a page-coloured cover between the scene and the text fades out and the words fade in, so the title never moves. Then the sun sweeps as before.
  - Before the cards load, "expected" comes from the last load (`howmuch:register-mastheads:{plan}` in local storage), or any card account on a first visit.

## Setup

- **Stack:** `control-howmuch launch` (Bun API and Vite web on SQLite, seeded with `fixtures/demo-ledger.json`), with owner `verifier`.
- **Rewards:** `fixtures/rewards-tracker-export.json` with `subcategoriesEnabled` false and an $800 minimum on Travel Card (`acct-credit`).
- **Extra synthetic data:**
  - Three November transactions on Travel Card totalling $400, so the sun has a sweep to make.
  - A "Spare Card" credit card account with no reward card.
  - For the two-card check, a second card ("Second Card") on Travel Card. It was removed afterwards.
- **Data:** every value is invented.

## How it was driven

- **Browser:** agent-browser's Chromium at 1280×860 (desktop) and 390×844 (phone), signed in as `verifier`.
- **Capture:** `capture.mjs` over CDP throttles the network to 300ms latency at 1.5 MB/s.
  - On every animation frame it logs the header's state: `plain:<title>`, `held` or `masthead`, plus the filter rail's top (`h`) and the title's top.
  - It records the screencast frames at the same time.
- **Scenarios:**
  - `open` loads the page cold from `about:blank`.
  - `nav` clicks the sidebar link from Everyday Account.
- **Strips:** `strip.py` takes the frame at each time and labels it with the logged state.
- **Before captures:** taken with the change stashed, on the same stack and settings.

```
node capture.mjs "$(agent-browser get cdp-url)" after-open open "$WEB/transactions?accounts=acct-credit&range=all" 300   # WAIT=25000
node capture.mjs "$(agent-browser get cdp-url)" after-nav nav "/transactions?range=all&accounts=acct-credit" 300           # from Everyday Account, WAIT=4000
python3 -I strip.py after-nav strip.jpg nav "title" 15 120 330 420 600 1000 2000
```

## Results

| Check | Before | After |
| --- | --- | --- |
| First open, Travel Card (`strip-open.jpg`) | plain 953ms, then masthead; filters 193 → 334px; title 121 → 106 → 98px | held, then masthead after 636ms; filters 334 → 335px; title fixed at 98px |
| Everyday → Travel Card, in-app (`strip-nav.jpg`) | plain Travel Card 320ms, then masthead; filters 193 → 334px | Everyday → held → masthead; filters 334 → 335px; title fixed |
| Travel Card again after another account | masthead at once (last report kept) | Same |
| Spare Card (credit, no reward card), cold and in-app | plain | plain at once |
| Ledger, cold and in-app | plain | plain at once |
| Two cards on Travel Card | plain | First cold open after adding the card: held 627ms, then plain (the hint still said one card). Every later open: plain at once |
| 390px dark, in-app (`strip-phone-dark.jpg`) | (not captured) | held, then the dusk scene fades in under a fixed title |
| Reduce Motion (`strip-reduce-motion.jpg`) | (not captured) | held, then the full scene in the first painted frame; the sun does not move |
| Sun sweep (`sweep-compare.png`, before left, after right) | sweeps to its target after arrival | Same positions at every time |
| Held state, light and dark (`held-light-dark.png`) | n/a | Title and balance legible on the page; no placeholder glyphs visible; ground space blank |

- **Held vs real geometry:** with the report stalled, the held filter rail sat at 335.09px; once the report landed it was 335.09px.
- **The 1px in throttled runs:** the IBM Plex Mono 500 figures font arrives at the same moment as the report. The old masthead showed the same 1px swap 300ms after it arrived (`probe-before-*.json`, 334 → 335).
- **An approach that was dropped:** fading the scene SVG's own opacity isolated its blend layers. For the 320ms fade the sky rendered pale peach, then popped to blue. The cover over the scene replaced it.

## Commands

- `bun run check` on `630edce8` plus the change: 809 pass, 0 fail; web and worker typechecks pass. There are no iOS changes.

## Not exercised

- The deployed Worker build. Driven on the Vite dev stack only.
- Safari. Chromium only.
