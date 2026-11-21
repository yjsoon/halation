# Quick entry comma-decimal regression (#377)

Date: 2026-11-21. Branch: `fix/377-quick-entry-decimals`.
Base revision: `1ee099dd4a59964f8805bd4fcca07ffcae0a6093`.
All application traffic used `http://127.0.0.1`, the real Worker under
`wrangler dev --env local --local`, and disposable local D1 with synthetic data.
No production access, deployment, native build or merge.

## Contract and failing mechanism

Typing `1,50` into Amount and saving a spend must store -1500 milliunits, not
-150000. The native number input discarded the comma before React's change
handler. The existing money parser already accepts this decimal spelling.
Split allocation inputs had the same problem. Keep both as decimal-keyboard
text inputs, matching register compose, and retain the existing parser and
positive-amount/split-total checks. No money parser or API changes.

## Repeatable E2E

The executable regression is `scripts/verify-quick-entry-amounts.ts`. It uses
agent-browser to sign in, type real keyboard input, choose Save, then independently
GET the stored transaction through the local Worker. No DOM value assignment,
mocked API or source-text assertion. Each run has unique memo identifiers.

Prerequisites: Bun dependencies, agent-browser, a seeded verify-howmuch local
stack (`fixtures/demo-ledger.json`, plan `local-plan`, default SGD format), and
synthetic owner `verifier` / `howmuch-verify-15`. Copy
`apps/worker/.dev.vars.example` to `apps/worker/.dev.vars` for the local Worker.
Never use real owner credentials or an existing personal ledger.

This run reused the disposable database at `.amp/in/orb-backup/bombadil/d1`:

```sh
scripts/local-worker.sh prepare .amp/in/orb-backup/bombadil/d1 'HowMuch Demo'
amp orb service start bombadil-api --command 'scripts/local-worker.sh start .amp/in/orb-backup/bombadil/d1 8787' --port 8787
amp orb service start bombadil-web --command 'HOWMUCH_API_URL=http://127.0.0.1:8787 bun run --cwd apps/web dev --host 127.0.0.1 --port 5173 --strictPort' --port 5173
# On a fresh database, seed through bun run demo:seed with HOWMUCH_API_URL,
# HOWMUCH_DEFAULT_PLAN_ID=local-plan and the local HOWMUCH_API_TOKEN, then
# create the synthetic owner through first-owner setup in the browser.
npx @puppeteer/browsers install chrome-headless-shell@stable
CHROME=/absolute/path/to/chrome-headless-shell \
HOWMUCH_WEB_URL=http://127.0.0.1:5173 \
bun scripts/verify-quick-entry-amounts.ts
```

Chrome for the red and green runs was **chrome-headless-shell 158.0.8127.36**,
installed with the requested Puppeteer browser installer. The test was written
and run before the implementation changed.

| Keyboard input | Expected persisted milliunits | Before fix | After fix |
| --- | ---: | ---: | ---: |
| `1,50` | -1500 | -150000 (FAIL) | -1500 (PASS) |
| `0,50` (shrunk case) | -500 | -50000 (FAIL) | -500 (PASS) |
| `6.80` (dot control) | -6800 | -6800 (PASS) | -6800 (PASS) |
| Total `2,75`; splits `1,50` and `1,25` | -2750; -1500, -1250 | -275000; -150000, -125000 (FAIL) | -2750; -1500, -1250 (PASS) |

After the fix, zero, negative, excess-precision, malformed-separator, exponent
and non-numeric entries all keep Save disabled. `1,2,3` wrongly enabled Save
before the fix because the number input removed both commas.

Green run transaction IDs: `700dfad9-e025-485c-934f-89cc0d24c82b`,
`5efb593c-151b-4ee9-89b7-f7cb022bbb30`,
`1f8189d8-865b-42b2-8309-b31e16a4a315`,
`420718f4-a708-49a5-9dde-ff45ca911374`.

## Bombadil replay

Bombadil 0.8.0 replayed the original shrunk trace:
`awaitAmount()` -> `TypeText("0,50")`.
Both original reproduction/shrink and this replay used
`--chrome-variant headless-shell`, the same executable, `--no-sandbox`,
and `--allow-url 'http://127.0.0.1:5173/*'`.

```sh
bombadil browser test --chrome-variant headless-shell --no-sandbox \
  --allow-url 'http://127.0.0.1:5173/*' \
  --cookie "$LOCAL_COOKIE; Secure; HttpOnly" \
  --reproduce .amp/in/orb-backup/bombadil/comma-shrunk.bin \
  --output-path .amp/in/orb-backup/bombadil/comma-green-replay.bin \
  http://127.0.0.1:5173/add .amp/in/orb-backup/bombadil/comma-preservation.ts
```

Final snapshot: `value: "0,50"`, `saveEnabled: true`, `violations: []`,
`uncaughtExceptions: []`, `consoleErrors: []`; exit 0, "Reproduction finished!".
The property was adjusted to accept preserved raw text as well as a normalised
numeric value: JavaScript `Number("0,50")` is NaN even though the plan parser
correctly reads it. The independent persisted-amount E2E above is the primary
regression test, not this representation-sensitive property.
The original specification and trace are also documented in issue #377.

## Real user recipe and rendered inspection

Ran `.cursor/skills/verify-howmuch/features/quick-entry.md` spend path:
empty Amount disables Save; type `6.80`, payee `Toast Box Verify`, memo
`verify quick entry`, Everyday Account, Today; Save; Saved confirmation and
Saved this session show -$6.80. Choose Ledger and search Toast Box Verify:
row shows the same date, memo and $6.80 outflow. A separate GET finds
`b49a3f88-bc42-4f83-ae59-4ee1294adc49`, `amount: -6800`,
`account_id: "acct-everyday"`, `date: "2026-11-21"`.
The recipe's older payee-required wording does not match the current optional
Payee UI; this change does not change that behaviour.

Supplementary Chromium 157 recording and screenshots were inspected:

- Desktop: real pointer passes neighbouring direction controls, types `1,50`
  with the comma visible, then Save. Confirmation appears. A full-page capture
  shows `Comma Demo` at -$1.50. Fresh GET returns -1500 milliunits, transaction
  `20c37b65-756d-464d-8f1e-31cc82f3262e`.
- Narrow viewport (390 CSS pixels, DPR 2, not a real phone): total `2,75`,
  allocations `1,50` and `1,25`, matched-total status, enabled Save; no horizontal
  overflow (`scrollWidth === innerWidth === 390`). Accessibility exposes all
  three amounts as labelled textboxes; all retain `inputMode: "decimal"`.
  Invalid allocation `1,234` disables Save. Restore `1,50` and Save: fresh GET
  returns -2750 with allocations [-1500, -1250], transaction
  `cbb55835-43e8-48c6-94be-8e205d94304c`.
- Media stays untracked: `comma-saved.png`, `split-comma.png`, `recipe-saved.png`,
  `recipe-register.png`, `comma-entry.mp4` and `comma-entry.loop.webp` beside this
  record. Video shows entry and confirmation; the numeric saved result is in
  the full-page screenshot and independent readback, not the video's viewport.

## Broader checks

```sh
CHROME_PATH=/absolute/path/to/chrome-headless-shell bun run check
bun run --cwd apps/web bundle
git diff --check
```

Results: web and Worker typechecks exit 0; focus-zoom reports all measured text
controls at least 16px; **770 pass, 0 fail**, 75529 assertions; `check: pass`.
Vite bundle: `built in 3.53s`. Whitespace check exit 0.

Verified source SHA-256:

- `apps/web/src/pages/QuickEntry.tsx`: `3c6d2adbe0e61b0cd81c22452b7a414ef9b5cc8248a42b55db1ff2165a852d3d`
- `scripts/verify-quick-entry-amounts.ts`: `4ed7086cdeee3d1a1e33bc9a87b48140f788819b75462ad54abc8b3e422e9a37`

Issues #376 (docs fragments) and #378 (intermittent view-transition rejection)
are separate and were not changed in this round. This fix does not rewrite any
previously stored, inflated amount.

## Direct-main landing revalidation (2026-11-21)

YJ authorised landing through the repository's direct-main procedure, without a
new PR or independent review. Fetched `origin/main` at
`1ee099dd4a59964f8805bd4fcca07ffcae0a6093`; the published fix
`fa6f32c5d69852058650b6fb93709f35b468c2c0` is already its direct child, so no
published history was rewritten. Only this text record is added for landing.
The source hashes above remain unchanged. No iOS files changed.

Restarted the same disposable local Worker/Vite services using the commands
above, without `prepare`, seeding or any migrations. Reran
`CHROME="$HEADLESS_SHELL" HOWMUCH_WEB_URL=http://127.0.0.1:5173 bun scripts/verify-quick-entry-amounts.ts`
using chrome-headless-shell 158.0.8127.36. Exit 0:

- `1,50`: -1500, transaction `b3005a15-7e1b-4f00-875a-9e962cab4856`.
- `0,50`: -500, transaction `2d36f126-05f9-4fe2-a321-54667b82effa`.
- `6.80`: -6800, transaction `de08068f-bf6d-4a18-8b13-b0466ea41b98`.
- Split `2,75` into `1,50` and `1,25`: -2750 with [-1500, -1250], transaction
  `547211f7-cc8f-41e9-8ca5-08692b97b8a7`.
- All six invalid-entry controls kept Save disabled.

Repeated the Quick entry spend recipe in a separate local browser session:
sign in as the synthetic verifier; open `/add?account=acct-everyday`; confirm
Quick entry title and heading, Everyday Account and disabled Save; type `6.80`,
payee `Toast Box Verify`, memo `verify quick entry landing`; choose Today and
Save spend. Confirmation and Saved this session show -$6.80. Follow Ledger,
wait for its search field, search Toast Box Verify, and confirm the new row.
Fresh authenticated GET `/v1/plans/local-plan/transactions` returns exactly one
transaction with this memo: `362fa0ff-6361-4953-940c-9647dcc6ec82`, amount -6800,
account `acct-everyday`, date `2026-11-21`. Accessibility reports the full account,
payee, memo and $6.80 outflow. Inspected `landing-saved.png` and
`landing-register.png` at DPR 2; media remains untracked. Some ledger text is
visually truncated by its existing column widths, but the full values are in
the accessibility tree and API readback.

Final candidate guard: `CHROME_PATH="$HEADLESS_SHELL" scripts/check.sh` after
committing this record and the no-op rebase onto the fetched `origin/main`.
No tags, deployments, Xcode Cloud, native publication or remote data writes are
part of this landing.
