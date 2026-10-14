// Inline editors by keyboard: schedule Edit / Add, register Reconcile, the
// bulk bar's Suggest categories review and bulk Delete. For each: press the
// opener, report focus, press a Cancel, report focus. Nothing is saved.
// The Jev suggestion call is answered by a Playwright route (no TYPESAFE_API_KEY
// in the disposable stack). Setup (NOTES.md): one schedule exists.
import { open, login, WEB } from "./common.mjs";
const { browser, page } = await open();
await login(page);
const where = () => page.evaluate(() => {
  const el = document.activeElement;
  return `${el?.tagName} "${(el?.getAttribute("aria-label") ?? el?.textContent ?? "").trim().slice(0, 30)}"`;
});
await page.route("**/api/tools/categorise**", async (route) => {
  const body = JSON.parse(route.request().postData() ?? "{}");
  await route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ data: { suggestions: body.transactions.map((t) => ({ key: t.key, suggestion: { category_id: "cat-groceries", category_name: "Groceries", group_name: "Everyday", probability: 0.9 }, confidence: 0.9, alternatives: [], evidence: { same_payee: 1, similar_names: 0 } })) } }),
  });
});
async function probe(label, path, before, opener, cancel) {
  await page.goto(WEB + path);
  await page.waitForLoadState("networkidle");
  if (before) await before();
  await opener().focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  const opened = await where();
  await cancel().focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  console.log(`${label}: after open ${opened}; after Cancel ${await where()}`);
}
const tickRow = async () => {
  await page.locator("tbody .register-select input[type=checkbox]").first().check();
  await page.waitForTimeout(200);
};
await probe("schedule edit (header Cancel)", "/scheduled", null,
  () => page.getByRole("button", { name: /^Edit / }).first(),
  () => page.locator(".schedule-editor .section-heading").getByRole("button", { name: "Cancel" }));
await probe("schedule add (footer Cancel)", "/scheduled", null,
  () => page.getByRole("button", { name: "Add schedule" }),
  () => page.locator(".schedule-editor .transaction-editor-actions").getByRole("button", { name: "Cancel" }));
await probe("reconcile (header Cancel)", "/transactions?accounts=acct-everyday", null,
  () => page.getByRole("button", { name: "Reconcile" }),
  () => page.locator(".reconcile-editor .section-heading").getByRole("button", { name: "Cancel" }));
await probe("reconcile (footer Cancel)", "/transactions?accounts=acct-everyday", null,
  () => page.getByRole("button", { name: "Reconcile" }),
  () => page.locator(".reconcile-editor .transaction-editor-actions").getByRole("button", { name: "Cancel" }));
await probe("suggest review", "/transactions?range=all&accounts=acct-everyday", tickRow,
  () => page.getByRole("button", { name: "Suggest categories" }),
  () => page.locator(".category-suggestions").getByRole("button", { name: "Cancel" }));
await probe("bulk delete", "/transactions?range=all&accounts=acct-everyday", tickRow,
  () => page.locator(".register-bulk-bar").getByRole("button", { name: /^(Delete|Reject)$/ }),
  () => page.locator(".transaction-delete-confirm").getByRole("button", { name: "Cancel" }));
await browser.close();
