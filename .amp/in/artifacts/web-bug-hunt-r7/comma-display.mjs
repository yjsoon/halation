// A comma-decimal plan ("1.234,50€"): every number the page shows or puts
// back into an amount field uses the comma, and a typed sum "12,5+1" saves.
import { open, login, WEB } from "./common.mjs";
const API = process.env.API;
const TOKEN = process.env.TOKEN ?? "howmuch-verify-bootstrap";
const apiGet = async (path) => (await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${TOKEN}` } })).json();
const { browser, page } = await open();
await login(page);

// 1. Compose row: "12,5" after blur, then saved.
await page.goto(WEB + "/transactions?accounts=acct-everyday&range=all");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(800);
await page.getByRole("button", { name: "+ Add transaction" }).click();
await page.locator("#register-compose-payee").fill("Synthetic r7 comma");
await page.locator("#register-compose-outflow").fill("12,5");
await page.locator("#register-compose-outflow").blur();
console.log("compose outflow after blur:", await page.locator("#register-compose-outflow").inputValue());
await page.getByRole("button", { name: "Save", exact: true }).click();
await page.waitForTimeout(1500);
let rows = (await apiGet("/v1/plans/local-plan/transactions?since_date=2000-01-01")).data.transactions.filter((t) => t.payee_name === "Synthetic r7 comma");
console.log("API after compose:", JSON.stringify(rows.map((t) => t.amount)));

// 2. Row editor: prefilled outflow, then the sum "12,5+1".
const id = rows[0].id;
await page.goto(WEB + "/transactions?accounts=acct-everyday&range=all");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(800);
await page.locator(`#register-row-${id}`).focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
const outflow = page.locator(`#register-row-${id} input[data-row-focus="outflow"]`);
console.log("row editor outflow prefill:", await outflow.inputValue());
await outflow.fill("12,5+1");
await page.keyboard.press("Enter");
await page.waitForTimeout(1500);
const after = (await apiGet(`/v1/plans/local-plan/transactions/${id}`)).data.transaction;
console.log("API after row sum:", after.amount);
const err = await page.locator("[role=alert]").allInnerTexts();
console.log("alerts:", JSON.stringify(err));

// 3. Reports: chart axis, shares, savings rate.
await page.goto(WEB + "/spending?range=all");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1200);
let text = await page.locator("body").innerText();
console.log("spending shares:", JSON.stringify(text.match(/\d+[.,]\d%/g)?.slice(0, 4)));
await page.goto(WEB + "/income?range=all");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1200);
text = await page.locator("body").innerText();
console.log("income percentages:", JSON.stringify(text.match(/[−-]?\d+[.,]\d%/g)?.slice(0, 4)));
console.log("chart axis ticks:", JSON.stringify(await page.locator(".chart-grid text").allTextContents()));
await page.screenshot({ path: new URL("./income-comma.png", import.meta.url).pathname, fullPage: false });
await browser.close();
