// Rewards recipe (.cursor/skills/verify-howmuch/features/rewards.md) on a fresh control-howmuch stack,
// with the Skyline checks. Run from the repo root after `control-howmuch launch` and `doctor`:
//   node .amp/in/artifacts/rewards-skyline/recipe.mjs
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/tmp/claude-0/sun/node_modules/playwright'); }
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../../../..');
const control = (args) => execSync(`.cursor/skills/verify-howmuch/bin/control-howmuch ${args}`, { cwd: root }).toString();
const state = JSON.parse(control('state'));
const WEB = state.web_url;
const out = path.join(here, 'recipe');
fs.mkdirSync(out, { recursive: true });

const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok: Boolean(ok), detail: String(detail) }); console.log(ok ? 'ok  ' : 'FAIL', name, detail); };

const browser = await playwright.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

// First owner and sign-in have their own recipes (first-owner-setup.md, sign-in); here they go through the API.
const status = await (await page.request.get(WEB + '/api/auth/status')).json();
if (status.data.setup_required) {
  const r = await page.request.post(WEB + '/api/auth/setup', { headers: { authorization: `Bearer ${state.api_token}`, origin: WEB }, data: { username: state.username, password: state.password } });
  check('owner setup', r.status() === 200, r.status());
}
const login = await page.request.post(WEB + '/api/auth/login', { headers: { origin: WEB }, data: { username: state.username, password: state.password } });
check('sign in', login.status() === 200, login.status());
await page.goto(WEB + '/rewards');
await page.waitForSelector('h1:has-text("Rewards")');
await page.evaluate(() => localStorage.removeItem('howmuch:rewards:local-plan'));
await page.reload();

// Open empty.
await page.waitForSelector('text=No reward cards in this range.');
check('title', (await page.title()) === 'Rewards · Halation', await page.title());
check('card periods pressed', await page.getByRole('button', { name: 'Card periods' }).getAttribute('aria-pressed') === 'true');
check('add card', await page.getByRole('link', { name: 'Add card' }).count() >= 1);
check('masthead sky drawn', await page.evaluate(() => getComputedStyle(document.querySelector('.rw-hero'), '::after').backgroundImage.includes('gradient')));
await page.screenshot({ path: path.join(out, 'empty.png') });

// Import through Settings > Rewards import.
await page.goto(WEB + '/import/rewards');
await page.getByLabel('Rewards Tracker export').waitFor();
await page.getByLabel('Rewards Tracker export').setInputFiles(path.join(root, 'fixtures/rewards-tracker-export.json'));
await page.waitForSelector('text=Selected rewards-tracker-export.json');
await page.getByRole('button', { name: 'Import export' }).click();
await page.waitForSelector('text=Travel Card');
check('import lists Travel Card', await page.getByText('Travel Card').count() > 0);

// Open filled, wide (1440): the window and the columns.
await page.goto(WEB + '/rewards?to=2026-05-24');
const card = page.locator('.rw-card', { hasText: 'Travel Card' }).first();
await card.waitFor();
check('date face', (await page.locator('.rw-date-face').textContent()) === '24 May 2026');
check('today enabled', await page.getByRole('button', { name: 'Today' }).isEnabled());
check('miles group', await page.locator('section[aria-label="Miles"] .rw-card').count() === 1);
const wide = await card.evaluate((c) => ({
  stage: c.dataset.stage, size: c.dataset.size, h: c.style.getPropertyValue('--rw-h'), v: c.style.getPropertyValue('--rw-v'),
  window: Math.round(c.querySelector('.rw-face').getBoundingClientRect().width),
  headline: c.querySelector('.rw-ledger .rw-headline').textContent,
  columns: [...c.querySelectorAll('.rw-columns > div')].map((d) => `${d.querySelector('dt').textContent}=${d.querySelector('dd').textContent}`),
}));
check('stage rest, noon row', wide.stage === 'rest' && wide.size === 'noon', JSON.stringify(wide));
check('pose inline', wide.h !== '' && wide.v !== '', `${wide.h} ${wide.v}`);
check('window 360px at 1440', wide.window === 360, wide.window);
check('headline', wide.headline.includes('Minimum met') && wide.headline.includes('Resets in 8 days'), wide.headline);
check('columns', wide.columns.join('|').includes('Spent=$315.50') && wide.columns.join('|').includes('Minimum=$200.00') && wide.columns.some((c) => c.startsWith('Period=24')), wide.columns.join(' | '));
const qualifying = await page.locator('.rw-figure', { hasText: 'Qualifying spend' }).locator('.rw-figure-value').textContent();
check('qualifying spend above zero', qualifying !== '$0.00', qualifying);

// Open in place from the keyboard: the toggle is a button with aria-expanded and aria-controls.
const toggle = card.getByRole('button', { name: 'Details for Travel Card' });
const region = card.getByRole('region', { name: 'Travel Card details', includeHidden: true });
check('slip folded and hidden at first', await toggle.getAttribute('aria-expanded') === 'false' && await region.evaluate((r) => getComputedStyle(r).visibility === 'hidden' && r.inert));
await toggle.focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(100);
check('Enter opens', await toggle.getAttribute('aria-expanded') === 'true' && await card.getAttribute('data-open') === 'true');
check('region visible', await region.isVisible());
const slip = await region.textContent();
check('slip period', slip.includes('1 May to 31 May') && slip.includes('day 24 of 31') && slip.includes('today · 24'), '');
check('slip targets', slip.includes('Targets') && slip.includes('Minimum') && /met \d+ May|met/.test(slip), '');
check('slip categories', slip.includes('Dining') && slip.includes('Online'), '');
const surface = await card.evaluate((c) => getComputedStyle(c).backgroundColor);
check('open surface #EBEBE6', surface === 'rgb(235, 235, 230)', surface);
await region.getByText('Totals, qualifications and tiers').click();
check('more holds the full-period meter', await region.getByText('Full-period minimum met').isVisible());
await page.screenshot({ path: path.join(out, 'travel-card-open-1440.png') });
const link = region.getByRole('link', { name: 'View transactions' });
const href = await link.getAttribute('href');
check('view transactions href', /^\/transactions\?accounts=[^&]+&range=all$/.test(href), href);
await toggle.focus();
await page.keyboard.press('Space');
await page.waitForTimeout(100);
check('Space closes', await toggle.getAttribute('aria-expanded') === 'false' && await region.evaluate((r) => getComputedStyle(r).visibility === 'hidden'));
check('reduced motion: no unfold transition', await region.evaluate((r) => getComputedStyle(r).transitionDuration.split(',').every((d) => parseFloat(d) === 0)));

// View transactions lands on the account's register.
await toggle.click();
await link.click();
await page.waitForURL(/\/transactions\?/);
check('register opened', page.url().includes('accounts=') && page.url().includes('range=all'), page.url().replace(WEB, ''));

// Historical range on the stacked board: the row sums the range, the slip's targets and categories read the cutoff period.
await page.goto(WEB + '/rewards?from=2026-05-10&to=2026-05-24');
const rangeCard = page.locator('.rw-card', { hasText: 'Travel Card' }).first();
await rangeCard.waitFor();
check('range: historical range pressed', await page.getByRole('button', { name: 'Historical range' }).getAttribute('aria-pressed') === 'true');
const rangePeriod = await rangeCard.locator('.rw-columns > div', { hasText: 'Period' }).locator('dd').textContent();
check('range: Period column reads range', rangePeriod === 'range', rangePeriod);
const rangeSpent = await rangeCard.locator('.rw-columns > div', { hasText: 'Spent' }).locator('dd').textContent();
await rangeCard.getByRole('button', { name: 'Details for Travel Card' }).click();
await page.waitForTimeout(100);
const rangeRegion = rangeCard.getByRole('region', { name: 'Travel Card details' });
const rangeSlip = await rangeRegion.textContent();
check('range: slip names the range and the latest period', rangeSlip.includes('10 May to 24 May') && rangeSlip.includes('historical range') && rangeSlip.includes('For the latest card period, 1 May to 31 May'), '');
check('range: no day rail', await rangeRegion.locator('.rw-rail').count() === 0);
check('range: targets from the cutoff period', rangeSlip.includes('Minimum') && /met/.test(rangeSlip) && !rangeSlip.includes('to go'), '');
check('range: categories from the cutoff period', rangeSlip.includes('in the latest card period') && rangeSlip.includes('$315.50 spent'), `row spent ${rangeSpent}`);
await page.screenshot({ path: path.join(out, 'range-open-1440.png') });

// Keyboard order: Tab from the toggle reaches the card's menu before the open slip.
await page.goto(WEB + '/rewards?to=2026-05-24');
await card.waitFor();
await toggle.focus();
await page.keyboard.press('Enter');
await page.keyboard.press('Tab');
check('tab: toggle then menu', await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Actions for Travel Card',
  await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent));

// Day rail ends: on day 1 and day 31 the today label covers the near date, at 820 and 1440.
for (const width of [820, 1440]) {
  await page.setViewportSize({ width, height: 900 });
  for (const [day, end] of [['2026-05-01', 'start'], ['2026-05-31', 'end']]) {
    await page.goto(WEB + `/rewards?to=${day}`);
    await card.waitFor();
    await card.getByRole('button', { name: 'Details for Travel Card' }).click();
    await page.waitForTimeout(150);
    const rail = await card.locator('.rw-rail').evaluate((r, end) => {
      const box = (s) => r.querySelector(s).getBoundingClientRect();
      const now = box('.rw-rail-now'), date = box(`.rw-rail-${end}`);
      const hidden = getComputedStyle(r.querySelector(`.rw-rail-${end}`)).visibility === 'hidden';
      const touches = end === 'start' ? now.left < date.right + 8 : now.right > date.left - 8;
      return { hidden, touches };
    }, end);
    check(`rail ${end} date clear of today at ${width}`, !rail.touches || rail.hidden, JSON.stringify(rail));
  }
}
await page.setViewportSize({ width: 1440, height: 900 });

// Phone (390): the strip, opening in place.
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(WEB + '/rewards?to=2026-05-24');
const phoneCard = page.locator('.rw-card', { hasText: 'Travel Card' }).first();
await phoneCard.waitFor();
const strip = await phoneCard.evaluate((c) => ({ variant: c.querySelector('.rw-face').dataset.variant, foot: c.querySelector('.rw-strip-foot')?.textContent, height: Math.round(c.querySelector('.rw-face').getBoundingClientRect().height) }));
check('phone strip', strip.variant === 'strip' && strip.foot.includes('Minimum met') && strip.foot.includes('earned'), JSON.stringify(strip));
await phoneCard.getByRole('button', { name: 'Details for Travel Card' }).click();
check('phone opens', await phoneCard.getByRole('region', { name: 'Travel Card details' }).isVisible());
check('no horizontal scroll at 390', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
await page.screenshot({ path: path.join(out, 'travel-card-390.png'), fullPage: true });
await page.setViewportSize({ width: 1440, height: 900 });

// Arrange: Grid keeps the 3:2 faces and the old disclosure; back to Stacked.
await page.goto(WEB + '/rewards?to=2026-05-24');
await page.getByRole('button', { name: /^Arrange/ }).click();
await page.getByRole('radio', { name: 'Grid' }).check();
await page.waitForTimeout(400);
check('grid faces', await page.locator('.rw-face[data-variant="face"]').count() === 1 && await page.locator('details.rw-more summary', { hasText: 'Targets, periods and tiers' }).count() === 1);
await page.getByRole('radio', { name: 'Stacked' }).check();
await page.waitForTimeout(400);
check('stacked again', await page.locator('.rw-card[data-size]').count() === 1);
await page.keyboard.press('Escape');

// Manual order: the move buttons join the menu over the ledger, clear of the headline and deadline.
const clear = (a, b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
const rect = (loc) => loc.evaluate((e) => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
await page.getByRole('button', { name: /^Arrange/ }).click();
await page.getByRole('radio', { name: 'Manual' }).check();
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
for (const width of [1100, 1440]) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(200);
  const actions = await rect(card.locator('.rw-card-actions'));
  const headline = await rect(card.locator('.rw-ledger .rw-headline'));
  check(`manual order clear of the headline at ${width}`, await card.locator('.rw-order').count() === 1 && clear(actions, headline), JSON.stringify({ actions, headline }));
}
await page.getByRole('button', { name: /^Arrange/ }).click();
await page.getByRole('radio', { name: 'Name' }).check();
await page.keyboard.press('Escape');

// Report grouping: Payee lists Candlenut.
await page.getByRole('group', { name: 'Report grouping' }).getByRole('button', { name: 'Payee' }).click();
await page.waitForSelector('text=By payee');
check('payee groups', await page.locator('.rw-breakdown').getByText('Candlenut').count() > 0);
await page.locator('.rw-breakdown').screenshot({ path: path.join(out, 'group-payee.png') });

// Card menu.
await page.getByRole('button', { name: 'Actions for Travel Card' }).click();
const menu = page.locator('.rw-menu-list');
const items = await menu.textContent();
check('card menu items', ['Edit card', 'View transactions', 'Hide', 'On this device', 'Hide until next period'].every((t) => items.includes(t)), items);
await page.screenshot({ path: path.join(out, 'card-menu.png') });
await page.keyboard.press('Escape');

// Batch edit.
await page.getByRole('button', { name: 'Select', exact: true }).click();
await page.getByRole('button', { name: 'Select visible' }).click();
await page.getByLabel('Batch field').selectOption('earningRate');
await page.getByLabel('Batch value').fill('1.5');
await page.screenshot({ path: path.join(out, 'select.png') });
await page.getByRole('button', { name: 'Apply to selected' }).click();
await page.waitForSelector('text=0 selected');
check('batch applied', true);
await page.getByRole('button', { name: 'Done', exact: true }).last().click();
const report = JSON.parse(control('http GET "/api/reports/rewards?plan_id=local-plan&group=payee&to=2026-05-24"'));
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
const travel = report.data.cards.find((c) => c.card.id === 'card-travel');
check('http: earning rate 1.5', travel?.card.earningRate === 1.5, travel?.card.earningRate);
check('http: Candlenut group', report.data.groups.some((g) => g.label === 'Candlenut'));

// Hide until next period, on today.
await page.goto(WEB + '/rewards');
await page.getByRole('button', { name: 'Actions for Travel Card' }).click();
await page.getByRole('button', { name: 'Hide Travel Card until next period' }).click();
await page.waitForSelector('text=All cards are hidden.');
check('hidden', true);
await page.getByRole('button', { name: 'Show hidden cards' }).click();
await page.waitForSelector('.rw-badge');
check('badge', (await page.locator('.rw-badge').first().textContent()).startsWith('Back'));
for (const width of [1100, 1440]) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(200);
  const hiddenCard = page.locator('.rw-card', { hasText: 'Travel Card' }).first();
  const badgeBox = await rect(hiddenCard.locator('.rw-badge-pin'));
  const nameBox = await rect(hiddenCard.locator('.rw-face-name'));
  const dim = await hiddenCard.evaluate((c) => [getComputedStyle(c.querySelector('.rw-face')).opacity, getComputedStyle(c.querySelector('.rw-ledger')).opacity]);
  check(`badge clear of the name at ${width}`, clear(badgeBox, nameBox), JSON.stringify({ badgeBox, nameBox }));
  check(`hidden dims window and ledger at ${width}`, dim.every((o) => parseFloat(o) < 1), dim.join(' '));
}
await page.setViewportSize({ width: 1440, height: 900 });
await page.getByRole('button', { name: 'Actions for Travel Card' }).click();
await page.getByRole('button', { name: 'Unhide' }).click();
check('unhidden', await page.locator('.rw-badge').count() === 0);

check('no page errors', errors.length === 0, errors.join(' | '));
fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify({ web: WEB, checks, errors }, null, 1));
await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
