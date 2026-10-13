// Spending -> category drill-down for a categorised transfer to a tracking
// account. Setup (bootstrap token, see NOTES.md): mortgage account "Synthetic
// Mortgage" and a -1,500.00 transfer to it from Everyday on 2026-10-05,
// category Investing.
import { open, login, WEB } from "./common.mjs";
const { browser, page } = await open();
await login(page);
await page.goto(WEB + "/spending?from=2026-10-01&to=2026-10-31&accounts=all");
await page.waitForLoadState("networkidle");
const row = page.locator("tr", { has: page.getByRole("link", { name: "Investing" }) });
console.log("SPENDING ROW:", (await row.innerText()).replace(/\s+/g, " "));
await page.getByRole("link", { name: "Investing" }).click();
await page.waitForURL(/\/transactions/);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(800);
console.log("URL:", page.url().replace(WEB, ""));
const body = await page.locator("main").innerText();
console.log("SHOWS MORTGAGE PAYMENT:", body.includes("Synthetic mortgage payment"));
const summary = await page.locator(".register-summary, .filter-summary-text, .register-meta").allInnerTexts();
console.log("REGISTER TEXT:", summary.join(" | ").replace(/\s+/g, " ").slice(0, 300));
const empty = await page.locator(".status-title").allInnerTexts();
console.log("STATUS:", empty.join(" | "));
await page.screenshot({ path: new URL(`./drilldown-${process.env.TAG ?? "run"}.png`, import.meta.url).pathname });
await browser.close();
