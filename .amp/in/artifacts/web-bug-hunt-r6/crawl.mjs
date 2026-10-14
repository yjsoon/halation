// Visit every route at desktop and phone width with a comma-decimal plan and
// very long account, payee, category and memo names. Flags page errors,
// rendered NaN/undefined/Infinity, dot-decimal money ("12.50€") that ignores
// the plan's separators, and horizontal page overflow.
import { open, login, WEB } from "./common.mjs";
const routes = ["/transactions", "/transactions?range=all&accounts=acct-everyday", "/scheduled", "/settings", "/api-tokens", "/import/rewards", "/tools/reward-terms", "/tools/statement-formatter", "/spending", "/income", "/net-worth", "/age-of-money", "/rewards", "/rewards/new", "/add",
  "/spending?range=all", "/income?range=all&interval=year", "/net-worth?range=all&interval=week", "/age-of-money?range=all"];
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  const { browser, page } = await open(viewport);
  await login(page);
  for (const r of routes) {
    await page.goto(WEB + r);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    const text = await page.locator("body").innerText();
    const bad = text.match(/.{0,30}(NaN|undefined|Infinity|\[object).{0,30}/g);
    const dotMoney = text.match(/\d\.\d\d€/g);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(viewport.width, r, bad ? "BAD " + JSON.stringify(bad.slice(0, 3)) : "", dotMoney ? "DOTMONEY " + JSON.stringify(dotMoney.slice(0, 3)) : "", overflow > 0 ? `OVERFLOW ${overflow}px` : "");
  }
  await browser.close();
}
