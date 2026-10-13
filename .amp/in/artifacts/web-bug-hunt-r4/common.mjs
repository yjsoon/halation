import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
export const WEB = process.env.WEB ?? "http://127.0.0.1:35935";
// The sign-in route is rate limited, so the session cookie is reused across runs.
const STATE = process.env.PW_STATE ?? join(tmpdir(), "howmuch-r4-storage.json");
export async function open(viewport = { width: 1280, height: 900 }, opts = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport, ...(existsSync(STATE) ? { storageState: STATE } : {}), ...opts });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/401/.test(m.text())) console.log("CONSOLE", m.text()); });
  return { browser, context, page };
}
export async function login(page) {
  await page.goto(WEB + "/");
  await page.waitForLoadState("networkidle");
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  if (await page.locator(".shell").count()) return; // signed in (the nav is hidden on phones)
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
  await nav.waitFor({ timeout: 30000 });
  await page.context().storageState({ path: STATE });
}
