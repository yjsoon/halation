// Rewards batch bar by keyboard: Select, then the bar's Done. Reports focus
// after the bar goes. Nothing is changed.
import { open, login, WEB } from "./common.mjs";
const { browser, page } = await open();
await login(page);
await page.goto(WEB + "/rewards");
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "Select", exact: true }).focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(200);
await page.locator(".rw-bulk").getByRole("button", { name: "Done" }).focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
const where = await page.evaluate(() => {
  const el = document.activeElement;
  return `${el?.tagName} "${(el?.textContent ?? "").trim().slice(0, 30)}"`;
});
console.log("bar gone:", !(await page.locator(".rw-bulk").count()), "focus:", where);
await browser.close();
