// Save a transaction from the compose row, then dismiss the "saved" toast by
// keyboard. Reports focus after the toast goes. Adds one synthetic row.
import { open, login, WEB } from "./common.mjs";
const { browser, page } = await open();
await login(page);
await page.goto(WEB + "/transactions?range=all&accounts=acct-everyday");
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "+ Add transaction" }).click();
await page.locator("#register-compose-payee").fill("Synthetic Kiosk");
await page.locator("#register-compose-outflow").fill("1.10");
await page.keyboard.press("Enter");
await page.getByText("Synthetic Kiosk saved.").waitFor();
await page.getByRole("button", { name: "Dismiss" }).focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
const where = await page.evaluate(() => {
  const el = document.activeElement;
  return `${el?.tagName} "${(el?.textContent ?? "").trim().slice(0, 30)}"`;
});
console.log("toast gone:", !(await page.locator(".register-toast").count()), "focus:", where);
await browser.close();
