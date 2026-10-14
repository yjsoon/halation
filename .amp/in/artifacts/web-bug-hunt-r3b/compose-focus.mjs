// Keyboard-only compose row: open with "+ Add transaction", Esc; open again,
// fill payee and outflow, Enter to save. Reports where focus lands.
import { open, login, WEB } from "./common.mjs";
const { browser, page } = await open();
await login(page);
await page.goto(WEB + "/transactions?range=all&accounts=acct-everyday");
await page.waitForLoadState("networkidle");
const where = () => page.evaluate(() => {
  const el = document.activeElement;
  return `${el?.tagName}#${el?.id || ""} "${(el?.textContent || "").trim().slice(0, 30)}"`;
});
const add = page.getByRole("button", { name: "+ Add transaction" });
await add.focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
console.log("after open:", await where());
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
console.log("after Escape:", await where());
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
await page.locator("#register-compose-payee").fill("Synthetic Bakery");
await page.locator(".register-compose-row input[name='outflow'], #register-compose-outflow").first().fill("3.20");
await page.keyboard.press("Enter");
await page.waitForTimeout(1500);
console.log("after Enter save:", await where());
console.log("status:", (await page.locator(".status-success, [role=status]").allInnerTexts()).join(" | ").slice(0, 200));
await browser.close();
