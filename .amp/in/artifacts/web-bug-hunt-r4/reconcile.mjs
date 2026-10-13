// Reconcile Everyday by keyboard at its cleared balance: review, tick, confirm.
// Reports the preview figures, the toast, focus afterwards and the account's
// last_reconciled_date read back from the API.
import { open, login, WEB } from "./common.mjs";
const API = process.env.API ?? "http://127.0.0.1:57733";
const { browser, page } = await open();
await login(page);
await page.goto(WEB + "/transactions?range=all&accounts=acct-everyday");
await page.waitForLoadState("networkidle");
const cleared = (await page.locator(".register-balance-breakdown").first().textContent())?.match(/\$([\d,]+\.\d\d) cleared/)?.[1];
console.log("cleared balance shown:", cleared);
await page.getByRole("button", { name: "Reconcile" }).focus();
await page.keyboard.press("Enter");
await page.getByLabel("Statement balance").fill(cleared ?? "0");
await page.getByRole("button", { name: "Review reconciliation" }).click();
await page.locator(".reconcile-review-grid").waitFor();
console.log("preview:", (await page.locator(".reconcile-review-grid").innerText()).replace(/\n+/g, " | "));
await page.locator(".reconcile-confirmation input").check();
await page.getByRole("button", { name: "Confirm reconciliation" }).focus();
await page.keyboard.press("Enter");
await page.locator(".reconcile-editor").waitFor({ state: "detached" });
await page.waitForTimeout(800);
console.log("toast:", await page.locator(".register-toast .status-title").textContent().catch(() => null));
console.log("focus:", await page.evaluate(() => `${document.activeElement?.tagName} "${document.activeElement?.textContent?.trim().slice(0, 30)}"`));
const account = await (await fetch(`${API}/v1/plans/local-plan/accounts/acct-everyday`, { headers: { Authorization: "Bearer howmuch-verify-bootstrap" } })).json();
console.log("api last_reconciled_date:", account.data?.account?.last_reconciled_date, "cleared_balance:", account.data?.account?.cleared_balance);
await browser.close();
