// "Clear filters" by keyboard on Spending (desktop) and on the phone layout,
// where the rail is collapsed. Reports focus after the button goes.
import { open, login, WEB } from "./common.mjs";
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  const { browser, page } = await open(viewport);
  await login(page);
  await page.goto(WEB + "/spending?from=2026-10-01&to=2026-10-31&accounts=acct-everyday");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Clear filters" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const where = await page.evaluate(() => {
    const el = document.activeElement;
    return `${el?.tagName} "${(el?.textContent ?? "").trim().slice(0, 30)}"`;
  });
  console.log(`${viewport.width}px after Clear filters:`, where, "url:", page.url().replace(WEB, ""));
  await browser.close();
}
