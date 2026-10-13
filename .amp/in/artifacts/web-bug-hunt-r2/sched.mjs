import { open, login, WEB } from "./common.mjs";
const { browser, page } = await open();
await login(page);
await page.goto(WEB + "/scheduled");
await page.getByRole("button", { name: /^Edit / }).first().waitFor();
const edits = page.getByRole("button", { name: /^Edit / });
const names = await edits.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
console.log("edit buttons:", names);
await edits.nth(0).click();
const memo = page.locator(".schedule-editor").getByPlaceholder("Note");
const amountA = await page.locator(".schedule-editor").getByLabel("Amount").inputValue();
console.log("editor A amount", amountA, "memo", await memo.inputValue());
await edits.nth(1).click();
console.log("after clicking", names[1], "editor amount", await page.locator(".schedule-editor").getByLabel("Amount").inputValue(), "memo", await memo.inputValue());
if (process.env.SAVE) {
  const heading = await page.locator("#schedule-editor-heading").textContent();
  console.log("heading", heading);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.locator(".schedule-editor").waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
}
await page.screenshot({ path: process.env.SHOT ?? "/tmp/claude-0/-home-user-howmuch/71e65555-7a39-5d8e-bafa-a8a1359bcb7e/scratchpad/pw/sched.png", fullPage: true });
await browser.close();
