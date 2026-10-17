// Signs in to a control-howmuch stack and saves the #root markup and a
// full-page screenshot of each web route at desktop and phone widths.
//   node capture-pages.mjs <web_url> <out_dir>
// PLAYWRIGHT_MODULE and CHROMIUM_PATH override the defaults below.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "/opt/node22/lib/node_modules/playwright/index.mjs");
import { mkdirSync, writeFileSync } from "node:fs";
const [base, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const results = {};
for (const viewport of [{ name: "desktop", width: 1280, height: 900 }, { name: "phone", width: 390, height: 844 }]) {
  const context = await browser.newContext({ viewport, timezoneId: "Asia/Singapore", locale: "en-GB" });
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForLoadState("networkidle");
  if (await page.getByRole("button", { name: "Create account" }).count()) {
    await page.getByLabel("Username").fill("verifier");
    await page.getByLabel("Password", { exact: true }).fill("howmuch-verify-15");
    await page.getByLabel("Setup token").fill("howmuch-verify-bootstrap");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForFunction(() => document.title.startsWith("Ledger"), null, { timeout: 20000 });
  } else if (await page.getByRole("button", { name: "Sign in" }).count()) {
    await page.getByLabel("Username").fill("verifier");
    await page.getByLabel("Password", { exact: true }).fill("howmuch-verify-15");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForFunction(() => document.title.startsWith("Ledger"), null, { timeout: 20000 });
  }
  const routes = ["/transactions", "/scheduled", "/rewards", "/rewards/new", "/spending", "/income", "/net-worth", "/age-of-money", "/settings", "/api-tokens", "/import/rewards", "/add", "/spending?from=2026-03-01&to=2026-05-24"];
  for (const route of routes) {
    await page.goto(base + route);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
    const html = await page.evaluate(() => {
      const root = document.querySelector("#root") ?? document.body;
      return root.outerHTML.replace(/ style="[^"]*"/g, "");
    });
    const key = `${viewport.name}${route.replace(/[^a-z0-9]+/gi, "_")}`;
    results[key] = html;
    writeFileSync(`${out}/${key}.html`, html);
    await page.screenshot({ path: `${out}/${key}.png`, fullPage: true });
  }
  await context.close();
}
await browser.close();
console.log(Object.keys(results).length, "pages captured");
