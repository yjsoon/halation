// Inline confirmations by keyboard: Scheduled delete and Enter now, API token
// revoke and reward card delete. For each: press the opener, report focus,
// press Cancel, report focus. Nothing is deleted, entered or revoked.
// Setup (NOTES.md): one schedule, one personal token, card-travel imported.
import { open, login, WEB } from "./common.mjs";
const { browser, page } = await open();
await login(page);
const where = () => page.evaluate(() => {
  const el = document.activeElement;
  return `${el?.tagName} "${(el?.getAttribute("aria-label") ?? el?.textContent ?? "").trim().slice(0, 30)}"`;
});
if (process.env.CREATE_TOKEN) {
  await page.goto(WEB + "/api-tokens");
  await page.getByLabel(/name/i).first().fill("synthetic-r3b");
  await page.getByRole("button", { name: "Create token" }).click();
  await page.waitForTimeout(800);
}
async function probe(label, path, opener, cancelScope) {
  await page.goto(WEB + path);
  await page.waitForLoadState("networkidle");
  await opener().focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  const opened = await where();
  await page.locator(cancelScope).getByRole("button", { name: "Cancel" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  console.log(`${label}: after open ${opened}; after Cancel ${await where()}`);
}
await probe("schedule delete", "/scheduled", () => page.getByRole("button", { name: /^Delete / }).first(), ".schedule-delete-confirm");
await probe("schedule enter", "/scheduled", () => page.getByRole("button", { name: /^Enter .* now$/ }).first(), ".schedule-enter-confirm");
await probe("token revoke", "/api-tokens", () => page.locator(".api-token-list .api-token-revoke").first(), ".api-token-confirm");
await probe("card delete", "/rewards/card-travel", () => page.getByRole("button", { name: "Delete card" }).first(), ".schedule-delete-confirm");
await browser.close();
