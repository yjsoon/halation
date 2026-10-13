// Visit every route (and a few filter variants) and flag page errors or
// rendered NaN/undefined/Infinity text.
import { open, login, WEB } from "./common.mjs";
const { browser, page } = await open();
await login(page);
const routes = ["/transactions", "/scheduled", "/settings", "/api-tokens", "/import/rewards", "/tools/reward-terms", "/tools/statement-formatter", "/spending", "/income", "/net-worth", "/age-of-money", "/rewards", "/rewards/new", "/add", "/docs",
  "/spending?range=all&accounts=all", "/income?range=all&interval=year", "/net-worth?range=all&interval=week", "/age-of-money?range=all", "/transactions?range=all&accounts=all"];
for (const r of routes) {
  await page.goto(WEB + r);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  const text = await page.locator("body").innerText();
  const bad = text.match(/.{0,40}(NaN|undefined|Infinity|\[object).{0,40}/g);
  console.log(r, "len", text.length, bad ? "BAD " + JSON.stringify(bad.slice(0, 5)) : "");
}
await browser.close();
