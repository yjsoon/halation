// Accounts filter by keyboard on Spending: open the menu, tick an account,
// Tab to "Clear selection", Enter, then Esc. Reports focus after each step.
import { open, login, WEB } from "./common.mjs";
const { browser, page } = await open();
await login(page);
await page.goto(WEB + "/spending?range=all&accounts=all");
await page.waitForLoadState("networkidle");
const where = () => page.evaluate(() => {
  const el = document.activeElement;
  return `${el?.tagName} "${(el?.getAttribute("aria-label") ?? el?.textContent ?? "").trim().slice(0, 30)}"`;
});
const trigger = page.getByRole("button", { name: /All accounts/ });
await trigger.focus();
await page.keyboard.press("Enter");
const firstBox = page.locator(".multi-select-menu input[type=checkbox]").first();
await firstBox.focus();
await page.keyboard.press("Space");
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Clear selection" }).focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
console.log("after Clear selection:", await where(), "menu open:", await page.locator(".multi-select-menu").isVisible());
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
console.log("after Escape:", await where());
await browser.close();
