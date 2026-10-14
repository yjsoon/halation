import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
export const WEB = process.env.WEB ?? "http://127.0.0.1:42845";
export async function open(viewport = { width: 1280, height: 900 }) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  return { browser, context, page };
}
export async function login(page) {
  await page.goto(WEB + "/");
  await page.waitForLoadState("networkidle");
  const heading = await page.getByRole("heading").first().textContent();
  if (/Set up/.test(heading)) {
    await page.getByLabel("Username").fill("verifier");
    await page.getByLabel("Password").fill("howmuch-verify-15");
    await page.getByLabel("Setup token").fill("howmuch-verify-bootstrap");
    await page.getByRole("button", { name: "Create account" }).click();
  } else if (/Sign in/.test(heading)) {
    await page.getByLabel("Username").fill("verifier");
    await page.getByLabel("Password").fill("howmuch-verify-15");
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await page.getByRole("navigation", { name: "Primary navigation" }).waitFor({ timeout: 30000 });
}
