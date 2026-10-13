// Delete by keyboard: Enter on a row to edit, focus its Delete button, Enter.
// Reports where focus lands and whether the confirmation is reachable with
// a few Tabs; then Esc-free Cancel. Nothing is deleted.
import { open, login, WEB } from "./common.mjs";
const { browser, page } = await open();
await login(page);
await page.goto(WEB + "/transactions?range=all&accounts=acct-everyday");
await page.waitForLoadState("networkidle");
const where = () => page.evaluate(() => {
  const el = document.activeElement;
  return `${el?.tagName}#${el?.id || ""} "${(el?.textContent || "").trim().slice(0, 30)}"`;
});
const row = page.locator("tbody tr[tabindex='0']").first();
await row.focus();
await page.keyboard.press("Enter");
await page.locator(".register-compose-delete").first().focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
console.log("confirmation shown:", await page.locator("#delete-transaction-heading").isVisible());
console.log("after Delete:", await where());
let reached = false;
for (let i = 0; i < 5 && !reached; i++) {
  await page.keyboard.press("Tab");
  reached = await page.evaluate(() => Boolean(document.activeElement?.closest(".transaction-delete-confirm")));
}
console.log("confirmation reached within 5 Tabs:", reached || await page.evaluate(() => Boolean(document.activeElement?.closest(".transaction-delete-confirm"))));
await page.locator(".transaction-delete-confirm").getByRole("button", { name: "Cancel" }).focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
console.log("after Cancel:", await where());
await browser.close();
