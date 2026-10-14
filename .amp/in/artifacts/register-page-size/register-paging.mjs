// E2E for the register page size sharing the API's maximum. Opens the Ledger on a stack seeded with
// 700 synthetic rows and records the transactions requests the real register makes plus its rows.
// Usage: node register-paging.mjs <web_url> <out_dir> <label>
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const { chromium } = createRequire("/opt/node-tools/package.json")("playwright");
const [webUrl, outDir, label] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const requests = [];
page.on("request", (r) => {
  const u = new URL(r.url());
  if (r.method() === "GET" && /\/transactions$/.test(u.pathname)) {
    requests.push({ limit: u.searchParams.get("limit"), offset: u.searchParams.get("offset") });
  }
});

await page.goto(webUrl);
await page.getByRole("heading", { name: /Set up Halation|Sign in to Halation/ }).waitFor();
const setup = await page.getByRole("heading", { name: "Set up Halation" }).isVisible();
await page.getByLabel("Username").fill("verifier");
await page.getByLabel("Password").fill("howmuch-verify-15");
if (setup) await page.getByLabel("Setup token").fill("howmuch-verify-bootstrap");
await page.getByRole("button", { name: setup ? "Create account" : "Sign in" }).click();
await page.getByRole("navigation", { name: "Primary navigation" }).waitFor({ timeout: 30000 });

requests.length = 0;
await page.goto(`${webUrl}/transactions?range=all&accounts=all`);
await page.getByText("Synthetic payee").first().waitFor({ timeout: 30000 });
await page.waitForTimeout(3000);
const rows = () => page.locator("text=/Synthetic payee \\d+/").count();
const out = { initialRequests: [...requests], initialRows: await rows() };
const more = page.getByRole("button", { name: /Load (more|older)/i });
let clicks = 0;
while (clicks < 5 && (await more.first().isVisible().catch(() => false))) {
  await more.first().click();
  clicks++;
  await page.waitForTimeout(1500);
}
out.loadMoreClicks = clicks;
out.allRequests = [...requests];
out.finalRows = await rows();
await page.screenshot({ path: join(outDir, `${label}.png`) });
writeFileSync(join(outDir, `${label}.json`), JSON.stringify(out, null, 1));
console.log(label, JSON.stringify(out));
await browser.close();
