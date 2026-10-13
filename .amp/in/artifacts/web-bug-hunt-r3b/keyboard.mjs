// Keyboard-only register editing: focus a row, Enter to edit, Escape to
// cancel; then Enter to edit, change the memo, Enter to save. Reports where
// focus lands after each step.
import { open, login, WEB } from "./common.mjs";
const { browser, page } = await open();
await login(page);
await page.goto(WEB + "/transactions?range=all&accounts=acct-everyday");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(500);
const where = () => page.evaluate(() => {
  const el = document.activeElement;
  return `${el?.tagName}#${el?.id || ""}.${(el?.className || "").toString().slice(0, 40)} aria=${el?.getAttribute("aria-label") ?? ""}`;
});
const firstRow = page.locator("tbody tr[tabindex='0']").first();
const rowId = await firstRow.getAttribute("id");
await firstRow.focus();
console.log("focused row:", rowId, await where());
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
console.log("after Enter:", await where());
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
console.log("after Escape:", await where());
await page.locator(`#${rowId}`).focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
await page.locator(`#${rowId}-memo`).focus(); // Tab steps through the date's own segments first
console.log("before typing:", await where());
await page.keyboard.type(" kb");
await page.keyboard.press("Enter");
await page.waitForTimeout(1500);
console.log("after Enter save:", await where());
const txnId = rowId.replace("register-row-", "");
const memo = await page.evaluate(async (id) => (await (await fetch(`/v1/plans/local-plan/transactions/${id}`, { credentials: "same-origin" })).json()).data.transaction.memo, txnId);
console.log("persisted memo:", JSON.stringify(memo));
await browser.close();
