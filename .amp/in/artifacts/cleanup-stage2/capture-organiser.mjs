// Signs in to a control-howmuch stack, opens the account organiser from the
// sidebar and saves the dialog markup and a screenshot at desktop width.
//   node capture-organiser.mjs <web_url> <out_dir>
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "/opt/node22/lib/node_modules/playwright/index.mjs");
import { mkdirSync, writeFileSync } from "node:fs";
const [base, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "Asia/Singapore", locale: "en-GB" });
const page = await context.newPage();
await page.goto(base);
await page.waitForLoadState("networkidle");
const create = page.getByRole("button", { name: "Create account" });
if (await create.count()) {
  await page.getByLabel("Username").fill("verifier");
  await page.getByLabel("Password", { exact: true }).fill("howmuch-verify-15");
  await page.getByLabel("Setup token").fill("howmuch-verify-bootstrap");
  await create.click();
} else {
  await page.getByLabel("Username").fill("verifier");
  await page.getByLabel("Password", { exact: true }).fill("howmuch-verify-15");
  await page.getByRole("button", { name: "Sign in" }).click();
}
await page.waitForFunction(() => document.title.startsWith("Ledger"), null, { timeout: 20000 });
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "Organise" }).first().click();
const dialog = page.getByRole("dialog");
await dialog.waitFor();
await page.waitForTimeout(600);
writeFileSync(`${out}/organiser.html`, await dialog.evaluate((node) => node.outerHTML));
await page.screenshot({ path: `${out}/organiser.png`, fullPage: true });
await browser.close();
console.log("organiser captured");
