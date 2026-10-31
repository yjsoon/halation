// Width sweep for the wide ledger columns: imports the Skyline fixture and, at every 2px from 1000 to 1300
// (name order and Manual order), checks that no two column figures on one line overlap, and records the
// ledger width and whether Period shows. Also reads the open card's faint ink in dark mode. Usage:
//   node sweep.mjs [fixture]   (writes sweep.json here)
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/tmp/claude-0/sun/node_modules/playwright'); }
const here = path.dirname(new URL(import.meta.url).pathname);
const state = JSON.parse(execSync('.cursor/skills/verify-howmuch/bin/control-howmuch state', { cwd: path.resolve(here, '../../../..') }).toString());
const WEB = state.web_url;
const fixture = process.argv[2] ?? path.join(here, 'fixture-skyline.json');
const browser = await playwright.chromium.launch();
const page = await (await browser.newContext({ reducedMotion: 'reduce' })).newPage();
await page.request.post(WEB + '/api/auth/login', { headers: { origin: WEB }, data: { username: state.username, password: state.password } });
await page.request.post(WEB + '/api/import/rewards-tracker', { headers: { authorization: `Bearer ${state.api_token}`, origin: WEB }, data: { plan_id: state.plan_id, payload: JSON.parse(fs.readFileSync(fixture, 'utf8')) } });
const out = { overlaps: [], period: {}, contrast: null };
for (const order of ['name', 'manual']) {
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.goto(WEB + '/rewards?to=2026-05-24');
  await page.evaluate((order) => localStorage.setItem('howmuch:rewards:local-plan', JSON.stringify({ layout: 'stacked', grouped: true, order })), order);
  await page.reload();
  await page.waitForSelector('.rw-ledger');
  for (let w = 1000; w <= 1300; w += 2) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(30);
    const r = await page.evaluate(() => {
      const bad = [];
      let ledger = 0, period = false;
      for (const card of document.querySelectorAll('.rw-card[data-size]')) {
        const l = card.querySelector('.rw-ledger');
        ledger = Math.round(l.getBoundingClientRect().width);
        const cols = [...card.querySelectorAll('.rw-columns > div')].filter((d) => getComputedStyle(d).display !== 'none');
        period ||= cols.some((d) => d.classList.contains('rw-col-period'));
        const boxes = cols.map((d) => ({ d, b: d.querySelector('dd').getBoundingClientRect(), s: d.querySelector('dd').scrollWidth }));
        for (let i = 0; i + 1 < boxes.length; i++) {
          const a = boxes[i], b = boxes[i + 1];
          const sameLine = Math.abs(a.b.top - b.b.top) < 4;
          if (sameLine && a.b.left + a.s > b.b.left - 2) bad.push(`${card.querySelector('.rw-face-name').textContent}: ${a.d.querySelector('dd').textContent} | ${b.d.querySelector('dd').textContent}`);
        }
        const right = l.getBoundingClientRect().right;
        for (const { d, b, s } of boxes) if (b.left + s > right + 1) bad.push(`${card.querySelector('.rw-face-name').textContent}: ${d.querySelector('dd').textContent} past the ledger`);
      }
      return { bad, ledger, period };
    });
    if (r.bad.length) out.overlaps.push({ order, width: w, bad: r.bad });
    out.period[`${order}-${w}`] = { ledger: r.ledger, period: r.period };
  }
}
await page.setViewportSize({ width: 1440, height: 900 });
await page.emulateMedia({ colorScheme: 'dark' });
await page.goto(WEB + '/rewards?to=2026-05-24');
await page.waitForSelector('.rw-ledger');
const card = page.locator('.rw-card', { hasText: 'Minimum Met 1357' });
await card.getByRole('button', { name: 'Details for Minimum Met 1357' }).click();
await page.waitForTimeout(200);
out.contrast = await card.evaluate((c) => ({ dt: getComputedStyle(c.querySelector('.rw-columns dt')).color, none: getComputedStyle(c.querySelector('.rw-columns dd[data-none]')).color, bg: getComputedStyle(c).backgroundColor }));
fs.writeFileSync(path.join(here, 'sweep.json'), JSON.stringify(out, null, 1));
const ranges = (order) => { const on = Object.entries(out.period).filter(([k, v]) => k.startsWith(order) && !v.period).map(([k]) => Number(k.split('-')[1])); return on.length ? `${Math.min(...on)}-${Math.max(...on)}` : 'none'; };
console.log('overlaps', out.overlaps.length, JSON.stringify(out.overlaps.slice(0, 5)));
console.log('period dropped (name order)', ranges('name'), '(manual)', ranges('manual'));
console.log('contrast', JSON.stringify(out.contrast));
await browser.close();
