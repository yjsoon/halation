// Statement formatter status line after an extraction. The AI provider call is
// answered by a Playwright route (no provider key exists in the disposable
// stack); everything else is the real page.
import { open, login, WEB } from "./common.mjs";
import { fileURLToPath } from "node:url";
const icon = fileURLToPath(new URL("../../../../apps/web/public/icon-192.png", import.meta.url));
const { browser, page } = await open();
await login(page);
await page.route("**/api/tools/statement-formatter**", (route) => route.fulfill({
  status: 200, contentType: "application/json",
  body: JSON.stringify({ data: { rows: [{ date: "2026-10-01", payee: "Synthetic Cafe", memo: "", outflow: "4.50", inflow: "" }] } }),
}));
await page.goto(WEB + "/tools/statement-formatter");
await page.locator('input[type="file"]').setInputFiles(icon);
await page.getByText("Images ready").waitFor();
await page.getByLabel("Exact model ID").fill("synthetic-model");
await page.getByLabel("Your provider API key").fill("synthetic-key");
await page.locator(".tool-consent input").check();
await page.getByRole("button", { name: /^Extract/ }).click();
await page.getByText("Extraction complete").waitFor();
console.log("STATUS:", await page.getByRole("status").textContent());
await page.screenshot({ path: new URL("./statement-status.png", import.meta.url).pathname, fullPage: false });
await browser.close();
