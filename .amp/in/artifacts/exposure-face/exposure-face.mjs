// E2E for the ExposureFace hooks refactor. Drives the real Rewards board against a disposable
// `control-howmuch launch` stack with synthetic data and records the settled scene of each state.
// Usage: node exposure-face.mjs <web_url> <repo_root> <out_dir> <label>
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const { chromium } = createRequire("/opt/node-tools/package.json")("playwright");
const [webUrl, repoRoot, outDir, label] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(webUrl);
await page.getByRole("heading", { name: /Set up Halation|Sign in to Halation/ }).waitFor();
const setup = await page.getByRole("heading", { name: "Set up Halation" }).isVisible();
await page.getByLabel("Username").fill("verifier");
await page.getByLabel("Password").fill("howmuch-verify-15");
if (setup) await page.getByLabel("Setup token").fill("howmuch-verify-bootstrap");
await page.getByRole("button", { name: setup ? "Create account" : "Sign in" }).click();
await page.getByRole("navigation", { name: "Primary navigation" }).waitFor({ timeout: 30000 });
await page.goto(`${webUrl}/import/rewards`);
if (true) {
  await page.getByLabel("Rewards Tracker export").setInputFiles(join(repoRoot, "fixtures/rewards-tracker-export.json"));
  await page.getByRole("button", { name: "Import export" }).click();
  await page.getByText("Imported this session").waitFor();
}

// Settled signature of every scene: the SVG markup minus generated ids, plus the card's stage.
const signature = () => page.evaluate(() => [...document.querySelectorAll(".rw-face")].map((f) => {
  const svg = f.querySelector("svg.rw-scene");
  const card = f.closest("[data-stage]");
  return {
    variant: f.getAttribute("data-variant"),
    stage: card?.getAttribute("data-stage") ?? null,
    viewBox: svg?.getAttribute("viewBox") ?? null,
    scene: (svg?.outerHTML ?? "").replace(/(url\(#|id=")[^)"]*/g, "$1ID").replace(/\s+/g, " "),
  };
}));
const settle = () => page.waitForTimeout(1500);
const out = {};
for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  const tag = viewport.width;
  await page.setViewportSize(viewport);
  await page.goto(`${webUrl}/rewards?to=2026-05-24`);
  await page.locator(".rw-face").first().waitFor();
  await settle();
  out[`${tag}-asof-0524`] = await signature();
  await page.screenshot({ path: join(outDir, `${label}-${tag}-0524.png`) });
  // A changed target glides: step the as-of date back a day and forward again.
  await page.getByRole("button", { name: "Previous day" }).click();
  await settle();
  out[`${tag}-asof-0523`] = await signature();
  await page.getByRole("button", { name: "Next day" }).click();
  await settle();
  out[`${tag}-asof-0524-again`] = await signature();
  // Resize the face: the ResizeObserver redraws.
  await page.setViewportSize({ width: viewport.width === 1440 ? 1100 : 360, height: viewport.height });
  await settle();
  out[`${tag}-resized`] = await signature();
  await page.setViewportSize(viewport);
  // Mode switch (html[data-mode]) redraws the night print.
  await page.evaluate(() => { document.documentElement.dataset.mode = "dark"; });
  await settle();
  out[`${tag}-dark`] = await signature();
  await page.screenshot({ path: join(outDir, `${label}-${tag}-dark.png`) });
  await page.evaluate(() => { document.documentElement.dataset.mode = "light"; });
  await settle();
}
out.errors = errors;
writeFileSync(join(outDir, `${label}.json`), JSON.stringify(out, null, 1));
console.log(label, Object.entries(out).map(([k, v]) => `${k}:${Array.isArray(v) ? v.length : v.length}`).join(" "));
await browser.close();
