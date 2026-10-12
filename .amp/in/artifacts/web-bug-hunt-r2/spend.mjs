import { open, login, WEB } from "./common.mjs";
const { browser, page } = await open();
await login(page);
for (const route of ["/spending?range=all", "/spending?from=2026-03-01&to=2026-03-31&accounts=all"]) {
  await page.goto(WEB + route);
  await page.getByText(/posted/).first().waitFor();
  await page.waitForLoadState("networkidle");
  const meta = await page.locator(".section-meta").first().textContent();
  const rows = await page.locator(".breakdown-table tbody tr:not(.group-row)").count();
  console.log(route, JSON.stringify(meta), "category rows:", rows);
}
await page.goto(WEB + "/spending?range=all");
await page.waitForLoadState("networkidle");
await page.screenshot({ path: process.env.SHOT ?? "spend.png", fullPage: true });
await browser.close();
