// Bulk delete every visible row of a one-row range by keyboard, then report
// where focus is just after the write and once the register has re-read.
// Synthetic data: deletes the seeded txn-2026-05-bus (Everyday, 19 May 2026).
import { open, login, WEB } from "./common.mjs";
const { browser, page } = await open();
await login(page);
const where = () => page.evaluate(() => {
  const el = document.activeElement;
  return `${el?.tagName} "${(el?.getAttribute("aria-label") ?? el?.textContent ?? "").trim().slice(0, 30)}" disabled=${el?.disabled ?? "-"}`;
});
await page.goto(WEB + "/transactions?from=2026-05-19&to=2026-05-19&accounts=acct-everyday");
await page.waitForLoadState("networkidle");
console.log("rows before", await page.locator("tbody .register-select input[type=checkbox]").count());
await page.getByLabel("Select all visible transactions").check();
await page.locator(".register-bulk-bar").getByRole("button", { name: /^(Delete|Reject)$/ }).focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
console.log("after open:", await where());
await page.locator(".transaction-delete-confirm").getByRole("button", { name: /Delete transactions|Reject transactions/ }).focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(150);
console.log("just after delete:", await where());
await page.waitForLoadState("networkidle");
await page.waitForTimeout(800);
console.log("after re-read:", await where());
console.log("rows after", await page.locator("tbody .register-select input[type=checkbox]").count());
console.log("toast", await page.locator("[role=status]").allInnerTexts());
await browser.close();
