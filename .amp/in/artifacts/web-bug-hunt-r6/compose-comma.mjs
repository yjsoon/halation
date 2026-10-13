// A comma-decimal plan: the register shows "12,50€"; typing "12,50" into the
// compose row's Outflow must store 12.50, not 1250.
import { open, login, WEB } from "./common.mjs";
const API = process.env.API;
const TOKEN = process.env.TOKEN ?? "howmuch-verify-bootstrap";
const { browser, page } = await open();
await login(page);
await page.goto(WEB + "/transactions?accounts=acct-everyday&range=all");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1000);
console.log("amounts on page:", JSON.stringify((await page.locator("body").innerText()).match(/[−+]?[\d.]+,\d\d€/g)?.slice(0, 4)));
await page.getByRole("button", { name: "+ Add transaction" }).click();
await page.locator("#register-compose-payee").fill("Synthetic comma cafe");
await page.locator("#register-compose-outflow").fill("12,50");
await page.locator("#register-compose-outflow").blur();
console.log("outflow after blur:", await page.locator("#register-compose-outflow").inputValue());
await page.getByRole("button", { name: "Save", exact: true }).click();
await page.waitForTimeout(1500);
const res = await fetch(`${API}/v1/plans/local-plan/transactions?since_date=2000-01-01`, { headers: { authorization: `Bearer ${TOKEN}` } });
const body = await res.json();
const rows = (body.data?.transactions ?? []).filter((t) => t.payee_name === "Synthetic comma cafe");
console.log("API rows:", JSON.stringify(rows.map((t) => ({ id: t.id, amount: t.amount, date: t.date }))));
await page.screenshot({ path: new URL("./compose-comma.png", import.meta.url).pathname });
await browser.close();
