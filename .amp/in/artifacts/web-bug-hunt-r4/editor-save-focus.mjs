// Focus after the write paths that close the same editors: schedule Save
// changes, and Apply on a category suggestion review (writes one synthetic
// row's category; the Jev call is answered by a Playwright route).
import { open, login, WEB } from "./common.mjs";
const { browser, page } = await open();
await login(page);
const where = () => page.evaluate(() => {
  const el = document.activeElement;
  return `${el?.tagName} "${(el?.getAttribute("aria-label") ?? el?.textContent ?? "").trim().slice(0, 40)}"`;
});
await page.route("**/api/tools/categorise**", async (route) => {
  const body = JSON.parse(route.request().postData() ?? "{}");
  await route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ data: { suggestions: body.transactions.map((t) => ({ key: t.key, suggestion: { category_id: "cat-groceries", category_name: "Groceries", group_name: "Everyday", probability: 0.9 }, confidence: 0.9, alternatives: [], evidence: { same_payee: 1, similar_names: 0 } })) } }),
  });
});
await page.goto(WEB + "/scheduled");
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: /^Edit / }).first().focus();
await page.keyboard.press("Enter");
await page.locator(".schedule-editor").getByPlaceholder("Note").fill(`Synthetic gym ${Date.now() % 1000}`);
await page.locator(".schedule-editor").getByRole("button", { name: "Save changes" }).focus();
await page.keyboard.press("Enter");
await page.locator(".schedule-editor").waitFor({ state: "detached" });
await page.waitForTimeout(800);
console.log("schedule save: focus", await where(), "memo now", await page.locator(".schedule-memo").first().textContent());

await page.goto(WEB + "/transactions?range=all&accounts=acct-everyday");
await page.waitForLoadState("networkidle");
await page.locator("tbody .register-select input[type=checkbox]").first().check();
await page.getByRole("button", { name: "Suggest categories" }).focus();
await page.keyboard.press("Enter");
await page.locator(".category-suggestions").waitFor();
await page.locator(".category-suggestions").getByRole("button", { name: /^Apply/ }).focus();
await page.keyboard.press("Enter");
await page.locator(".category-suggestions").waitFor({ state: "detached" });
await page.waitForTimeout(800);
console.log("suggest apply: focus", await where(), "toast", await page.locator(".register-toast .status-title").textContent().catch(() => null));
await browser.close();
