// Sidebar account icon popover by keyboard: open it, Tab into it, Esc; then
// open it, pick an icon with Enter. Reports where focus lands each time and
// restores the original icon.
import { open, login, WEB } from "./common.mjs";
const { browser, page } = await open();
await login(page);
await page.goto(WEB + "/transactions?range=all&accounts=all");
await page.waitForLoadState("networkidle");
const where = () => page.evaluate(() => {
  const el = document.activeElement;
  return `${el?.tagName} "${el?.getAttribute("aria-label") ?? (el?.textContent || "").trim().slice(0, 30)}"`;
});
const trigger = page.getByRole("button", { name: "Change icon for Everyday Account" });
const original = (await trigger.innerText()).trim();
await trigger.focus();
await page.keyboard.press("Enter");
await page.keyboard.press("Tab");
console.log("inside popover:", await where());
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
console.log("after Escape:", await where());
await trigger.focus();
await page.keyboard.press("Enter");
await page.getByRole("button", { name: "Use 🏦" }).focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(1200);
console.log("after choosing:", await where());
await trigger.click();
await page.getByLabel("Or type any emoji").fill(original);
await page.keyboard.press("Enter");
await page.waitForTimeout(1200);
console.log("restored icon:", (await trigger.innerText()).trim() === original);
await browser.close();
