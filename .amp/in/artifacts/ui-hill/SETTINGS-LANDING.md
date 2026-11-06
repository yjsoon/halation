# Settings hill climb verification

6 November 2026. Synthetic local ledger only. Follows Insights `ae75940a589905649638c534a39e929d41d72a50`. No deployment, account-policy changes or production writes.

## Design and panel

Retain one page, all fields and safeguards, separate saves and theme previews. Six section-jump links expose the page's scope; focusable serif headings receive anchor focus below the masthead. Tool rows have chevrons and whole-row hover. Controls follow Add/register, theme selection has explicit Selected text, and disabled actions are quiet outlines distinct from enabled inverse pills. Sections share a1000px cap; forms stay520px wide. No sticky index, tabs or hidden sections were introduced.

Sol and Opus score A8 versus baseline7. Expanded final24-state scores are8 from Sol, Opus, Sonnet and Astra; their baselines range6.5–7.5. Fable scores final7 versus baseline5, with7 also its brand-reference score. The six new enabled/error/saved captures have no baseline matches, so are not claimed as improvements over unseen baseline states. All five recommend retaining final without another material round after factual clarifications. Fable's two minor alignment findings were corrected: desktop theme titles now share exactly the same y coordinate, Selected sits inline, and tool text is flush with section headings. Twelve affected appearance/tools states were recaptured and inspected at all widths/themes.

Agreement: stronger section hierarchy, discoverable destinations, related controls, explicit theme state and distinguishable enabled/disabled actions. Optional field-associated mismatch feedback, long saved/iOS copy, bright preview thumbnails and desktop whitespace remain preferences. Sonnet withdrew active-tab, contrast-failure and colour-only-error claims: this is anchor navigation and words identify the mismatch. Opus withdrew inconsistent rule widths and preview-art changes, which were mistaken montage measurements. Actual all-six section widths1000px and form520px were checked in DOM. Dark guidance/tool text13px and theme notes12px measure8.34:1 against paper; field labels10.5px measure5.58:1. These spot measurements are not accessibility certification.

Fable independently inspected all12 aligned captures and verified both fixes without regression. Inline Selected fits320 in both themes. It retains the earlier final-pack7 separately and scores the aligned supplied states8, with spacing/consistency both8. No further Settings round is recommended.

## Repeatable local recipe

Use the demo seed in disposable SQLite `/tmp/howmuch-hill/ledger.sqlite`, synthetic owner `verifier`, plan `local-plan`, API4174 and web4173, supervised orb services. No production credentials/data. Follow `.cursor/skills/verify-howmuch/features/settings.md` on `/settings` with agent-browser session `hill`. Test320×844,390×844 and1440×1000, DPR2. These are Chromium width-emulated views, not physical phones or Safari.

The scratch `node .amp/in/verify-settings.mjs` executed38 checks. Its output is `settings-checks.json`; exact repeatable interactions follow. The scratch harness initially needed a return-to-top before clicking the index, native select syntax, the correct GET endpoint `/v1`, and a destination-heading wait after URL navigation. These were harness corrections, not app workarounds.

1. At each width, document width fits, all six index links fit, and each clicked link places its focusable heading below68px and inside the viewport. The heading is `document.activeElement`. Return to the top before the next link.
2. Blank password action disabled. Fill all fields with obviously synthetic wrong credentials and mismatched confirmation: action enables and submitting shows the full mismatch alert. Matching the two new-password fields but retaining wrong current password shows Current password is incorrect without losing entered values. No successful password rotation or cross-session revocation is claimed by this styling run.
3. Change SGD/day-first to GBP/year-first using native selects. Save formats; wait for Formats saved. Independent GET `/v1/plans/local-plan/settings` confirms GBP and YYYY-MM-DD. Reload confirms selected values. Restore SGD and DD/MM/YYYY through the same form. No amount conversion occurs.
4. Choose Ridge Charcoal and confirm Selected text, root theme and localStorage preference. Choose Dark, reload, confirm theme/mode persisted. Restore Dusk Ridge/Match system.
5. Open all four Tools rows. Wait for each route and destination heading: Reward terms, Statement formatter, API tokens, Rewards import. No external provider request or import is submitted.
6. Categories retains the default server's does-not-send-outside disclosure. Export JSON and CSV actions each complete and display their Saved filename. This proves client download generation/confirmation, not a restore round-trip or filesystem-download inspection.

## Visual and pointer evidence

Eighteen matched top/appearance/tools captures at all three widths in both themes, plus six320 error/enabled/saved states, were inspected independently. Final top/forms and `settings-aligned-*` appearance/tools supersede A and the earlier theme alignment. Errors and saved notices remain fully visible at320. `settings-interaction.mp4` and its5fps contact sheet were inspected: the pointer passes Categories/Appearance/Tools, jumps to Tools below the masthead, hovers three adjacent rows and opens API tokens. This recording precedes only the final theme-title/tool-text alignment. No header overlap or clipped tool row appears. Browser checks, not the stills, establish the listed focus/persistence/navigation behaviour.

## Checks and limits

- Pre-landing `bun run check`:815 pass,0 fail,76083 assertions; web/worker typechecks; check: pass.
- Production web build passes; `git diff --check` clean.
- Browser recipe:38 checks passed, including persisted formats and theme with restoration.
- Rebased on current `origin/main` at `ae75940a589905649638c534a39e929d41d72a50`. Application commit `63f186ad` passed815 tests,0fail,76083 assertions, both typechecks and production build; rebased browser run38 checks passed. First rebase attempt correctly refused regenerated evidence files; rerunning the harness restored identical evidence, the clean rebase succeeded and checks reran. This final evidence-only amendment does not change the verified application tree.
- Remote delivery SHA is reported in the thread after confirmation. Selected evidence is committed with this round.
- No physical phone, native select popup visual review, full accessibility audit, export restore or password-session revocation claim. No unrelated tool pages redesigned.
