// A comma-decimal plan: the schedule editor prefills "-12,5" and a typed
// "-12,75" saves as -12750 milliunits.
import { open, login, WEB } from "./common.mjs";
const API = process.env.API;
const TOKEN = process.env.TOKEN ?? "howmuch-verify-bootstrap";
const headers = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
const created = await (await fetch(`${API}/v1/plans/local-plan/scheduled_transactions`, {
  method: "POST",
  headers: { ...headers, "idempotency-key": `r7-sched-${Date.now()}` },
  body: JSON.stringify({ scheduled_transaction: { account_id: "acct-everyday", date_first: "2026-11-01", frequency: "monthly", amount: -12500, category_id: "cat-health", memo: "Synthetic r7 schedule" } }),
})).json();
const id = created.data.scheduled_transaction.id;
const { browser, page } = await open();
await login(page);
await page.goto(WEB + "/scheduled");
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: /^Edit / }).first().waitFor();
const labels = await page.getByRole("button", { name: /^Edit / }).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
const index = labels.findIndex((label) => /Synthetic r7 schedule|12,50/.test(label ?? ""));
console.log("edit buttons:", JSON.stringify(labels), "using", index);
await page.getByRole("button", { name: /^Edit / }).nth(Math.max(index, 0)).click();
const amount = page.locator(".schedule-editor").getByLabel("Amount");
console.log("editor amount prefill:", await amount.inputValue());
await amount.fill("-12,75");
await page.getByRole("button", { name: "Save changes" }).click();
await page.locator(".schedule-editor").waitFor({ state: "detached" });
await page.waitForLoadState("networkidle");
const after = await (await fetch(`${API}/v1/plans/local-plan/scheduled_transactions/${id}`, { headers })).json();
console.log("API amount after save:", after.data.scheduled_transaction.amount, "memo", after.data.scheduled_transaction.memo);
await browser.close();
