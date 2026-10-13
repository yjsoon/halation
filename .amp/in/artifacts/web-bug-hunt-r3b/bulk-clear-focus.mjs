// Register selection by keyboard: tick a row, then press the bulk bar's
// "× 1 selected" (Clear selection). Reports focus after the bar goes.
import { open, login, WEB } from "./common.mjs";
const { browser, page } = await open();
await login(page);
await page.goto(WEB + "/transactions?range=all&accounts=acct-everyday");
await page.waitForLoadState("networkidle");
const box = page.locator("tbody .register-select input[type=checkbox]").first();
await box.focus();
await page.keyboard.press("Space");
await page.waitForTimeout(200);
await page.getByRole("button", { name: "Clear selection" }).focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
const where = await page.evaluate(() => {
  const el = document.activeElement;
  return `${el?.tagName} "${(el?.getAttribute("aria-label") ?? el?.textContent ?? "").trim().slice(0, 40)}"`;
});
console.log("bar gone:", !(await page.locator(".register-bulk-bar").count()), "focus:", where);
await browser.close();
