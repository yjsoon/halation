// Skyline Rewards board: imports the synthetic fixture into a control-howmuch stack, opens one card and
// captures the stacked board light and dark at 390, 820, 1100 and 1440px. Usage:
//   node shoot.mjs [outDir] [fixture] [openCardName]
// Env: WIDTHS, MODES, LAYOUT (stacked|grid), MOTION=on, PREFIX (file name, default skyline) and PREFS, a JSON
// object merged into the board preferences (for example {"order":"manual"} or a hiddenUntil map).
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
const out = process.argv[2] ?? here;
const fixture = process.argv[3] ?? path.join(here, 'fixture-skyline.json');
const openName = process.argv[4] ?? 'Minimum Met 1357';
const widths = (process.env.WIDTHS ?? '390,820,1100,1440').split(',').map(Number);
const modes = (process.env.MODES ?? 'light,dark').split(',');

const browser = await playwright.chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: 2, reducedMotion: process.env.MOTION === 'on' ? 'no-preference' : 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const status = await (await page.request.get(WEB + '/api/auth/status')).json();
if (status.data.setup_required) {
  const r = await page.request.post(WEB + '/api/auth/setup', { headers: { authorization: `Bearer ${state.api_token}`, origin: WEB }, data: { username: state.username, password: state.password } });
  console.log('setup', r.status());
}
const login = await page.request.post(WEB + '/api/auth/login', { headers: { origin: WEB }, data: { username: state.username, password: state.password } });
console.log('login', login.status());
const imp = await page.request.post(WEB + '/api/import/rewards-tracker', { headers: { authorization: `Bearer ${state.api_token}`, origin: WEB }, data: { plan_id: state.plan_id, payload: JSON.parse(fs.readFileSync(fixture, 'utf8')) } });
console.log('import', imp.status());

const results = [];
for (const mode of modes) {
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 1000 });
    await page.goto(WEB + '/rewards?to=2026-05-24');
    await page.evaluate(([layout, prefs]) => {
      localStorage.setItem('howmuch:rewards:local-plan', JSON.stringify({ layout, grouped: true, order: 'name', ...prefs }));
    }, [process.env.LAYOUT ?? 'stacked', JSON.parse(process.env.PREFS ?? '{}')]);
    await page.emulateMedia({ colorScheme: mode });
    await page.reload();
    await page.waitForSelector('.rw-card');
    await page.waitForTimeout(400);
    const card = page.locator('.rw-card', { hasText: openName });
    const toggle = card.getByRole('button', { name: `Details for ${openName}` });
    if (await toggle.count()) await toggle.click();
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);
    const info = await page.evaluate(() => {
      const box = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
      const cards = [...document.querySelectorAll('.rw-card')].map((c) => ({ name: c.querySelector('.rw-face-name')?.textContent, size: c.dataset.size, stage: c.dataset.stage, open: c.dataset.open === 'true', row: box(c.querySelector('.rw-row') ?? c), card: box(c) }));
      return { mode: document.documentElement.dataset.mode, scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, cards };
    });
    results.push({ width: w, ...info });
    const file = path.join(out, `${process.env.PREFIX ?? 'skyline'}-${w}-${mode}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log('wrote', file, info.mode, 'overflow', info.scrollW > info.clientW);
  }
}
fs.writeFileSync(path.join(out, `${process.env.PREFIX ? process.env.PREFIX + '-' : ''}layout.json`), JSON.stringify({ results, errors }, null, 1));
if (errors.length) console.log('errors', errors);
await browser.close();
