// A comma-decimal plan with a space group mark ("1 234,50€"): typing what the
// page shows into the compose row stores 1234.50, and search finds it.
import { open, login, WEB } from "./common.mjs";
const API = process.env.API;
const TOKEN = process.env.TOKEN ?? "howmuch-verify-bootstrap";
const { browser, page } = await open();
await login(page);
await page.goto(WEB + "/transactions?accounts=acct-everyday&range=all");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(800);
console.log("amounts on page:", JSON.stringify((await page.locator("body").innerText()).match(/[−+]?[\d ]+,\d\d€/g)?.slice(0, 3)));
await page.getByRole("button", { name: "+ Add transaction" }).click();
await page.locator("#register-compose-payee").fill("Synthetic r7 space");
await page.locator("#register-compose-outflow").fill("1 234,5");
await page.locator("#register-compose-outflow").blur();
console.log("outflow after blur:", await page.locator("#register-compose-outflow").inputValue());
await page.getByRole("button", { name: "Save", exact: true }).click();
await page.waitForTimeout(1500);
const body = await (await fetch(`${API}/v1/plans/local-plan/transactions?since_date=2000-01-01`, { headers: { authorization: `Bearer ${TOKEN}` } })).json();
console.log("API rows:", JSON.stringify(body.data.transactions.filter((t) => t.payee_name === "Synthetic r7 space").map((t) => t.amount)));
const search = await (await fetch(`${API}/v1/plans/local-plan/transactions?since_date=2000-01-01&q=${encodeURIComponent("1 234,50€")}`, { headers: { authorization: `Bearer ${TOKEN}` } })).json();
console.log("API search '1 234,50€':", JSON.stringify(search.data.transactions.map((t) => t.payee_name)));
await browser.close();
