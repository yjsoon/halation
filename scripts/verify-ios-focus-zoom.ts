import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = join(root, "apps/web/scripts/ios-focus-zoom-fixture.html");
const chrome = findChrome();
const userData = mkdtempSync(join(tmpdir(), "howmuch-ios-zoom-"));
const dumpPath = join(userData, "dump.html");

const result = spawnSync(
  "timeout",
  [
    "12",
    chrome,
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--virtual-time-budget=2000",
    `--user-data-dir=${userData}`,
    "--dump-dom",
    pathToFileURL(fixture).href,
  ],
  { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
);

const match = result.stdout.match(/<pre id="report">([\s\S]*?)<\/pre>/);
if (!match) {
  writeFileSync(dumpPath, `${result.stdout}\n${result.stderr}`);
  throw new Error(`Chrome dump had no #report (exit ${result.status}). Output written to ${dumpPath}\n${result.stderr}`);
}

const report = JSON.parse(match[1].replaceAll("&quot;", '"'));
if (!report.ok) {
  console.error("Form controls below 16px (iOS Safari zooms these on focus):");
  for (const failure of report.failures) {
    console.error(`  ${failure.name}: ${failure.fontSize}`);
  }
  process.exit(1);
}

console.log("All measured text-entry controls are at least 16px.");
for (const row of report.rows) {
  if (!row.skip) console.log(`  ${row.name}: ${row.fontSize}`);
}

// CHROME_PATH wins; otherwise the first Chrome or Chromium on PATH, the macOS
// app bundles, then agent-browser's download (orbs have only that one).
function findChrome(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    const path = Bun.which(name);
    if (path) return path;
  }
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  const downloads = join(homedir(), ".agent-browser/browsers");
  if (existsSync(downloads)) {
    for (const dir of readdirSync(downloads).sort().reverse()) candidates.push(join(downloads, dir, "chrome"));
  }
  const found = candidates.find((path) => existsSync(path));
  if (found) return found;
  console.error("No Chrome or Chromium found. Install one or set CHROME_PATH.");
  process.exit(1);
}
