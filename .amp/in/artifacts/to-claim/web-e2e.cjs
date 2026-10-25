// Web E2E for the stored "To claim" flag, the To claim and To confirm filters
// and the legacy memo words, against the disposable stack from
// `control-howmuch launch` (synthetic demo ledger).
//   node .amp/in/artifacts/to-claim/web-e2e.cjs
// Writes screenshots beside this file and exits non-zero on a failed check.
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const state = JSON.parse(fs.readFileSync("/tmp/howmuch-verify/current/state.json", "utf8"));
const out = __dirname;
const api = async (method, route, body) => {
  const response = await fetch(`${state.api_url}${route}`, {
    method,
    headers: { authorization: `Bearer ${state.api_token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};
// A row stored before the field existed: write the memo straight to the
// database, as the API would now move the word into the field.
const storeLegacyMemo = (id, memo) => execFileSync("bun", ["-e",
  `const { Database } = require("bun:sqlite"); const db = new Database(process.argv[1]); db.query("UPDATE transactions SET memo = ?, claim_status = NULL, claimed_on = NULL WHERE id = ?").run(process.argv[2], process.argv[3]);`,
  state.db_path, memo, id]);
let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
};
const plan = `/v1/plans/${state.plan_id}`;
const get = async (id) => (await api("GET", `${plan}/transactions/${id}`)).body.data.transaction;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(state.web_url);
  await page.getByRole("heading", { name: /Set up Halation|Sign in to Halation|Ledger/ }).first().waitFor({ timeout: 30000 });
  if (await page.getByRole("heading", { name: "Sign in to Halation" }).isVisible().catch(() => false)) {
    await page.getByLabel("Username").fill(state.username);
    await page.getByLabel("Password").fill(state.password);
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  if (await page.getByRole("heading", { name: "Set up Halation" }).isVisible().catch(() => false)) {
    await page.getByLabel("Username").fill(state.username);
    await page.getByLabel("Password").fill(state.password);
    await page.getByLabel("Setup token").fill(state.api_token);
    await page.getByRole("button", { name: "Create account" }).click();
  }
  await page.getByRole("heading", { name: "Ledger" }).waitFor({ timeout: 30000 });

  const list = (await api("GET", `${plan}/transactions?limit=60`)).body.data.transactions
    .filter((t) => t.amount < 0 && !t.transfer_account_id && !(t.subtransactions || []).length);
  const [viaField, viaWord, both, claimed, legacy, plain, legacyClaimed, legacyChecked] = list;
  // An MCP client sets the field; an older client writes the words.
  await api("PATCH", `${plan}/transactions/${viaField.id}`, { transaction: { claim_status: "to_claim", memo: "Client dinner" } });
  const worded = (await api("PATCH", `${plan}/transactions/${viaWord.id}`, { transaction: { memo: "TODO: Taxi to client" } })).body.data.transaction;
  check("a TODO memo from an older client is stored as the flag", worded.memo === "Taxi to client" && worded.claim_status === "to_claim", JSON.stringify([worded.memo, worded.claim_status]));
  const checked = (await api("PATCH", `${plan}/transactions/${both.id}`, { transaction: { memo: "TOCHECK TODO: Hotel deposit", cleared: "uncleared" } })).body.data.transaction;
  check("TOCHECK TODO sets both flags", checked.memo === "Hotel deposit" && checked.claim_status === "to_claim" && checked.needs_confirmation === true);
  await api("PATCH", `${plan}/transactions/${claimed.id}`, { transaction: { memo: "CLAIMED - 2026-01-02: Notebooks" } });
  storeLegacyMemo(legacy.id, "TODO: Conference ticket");
  storeLegacyMemo(legacyClaimed.id, "CLAIMED - 2026-01-02: Example receipt");
  storeLegacyMemo(legacyChecked.id, "TOCHECK TODO: Example hotel");
  await api("PATCH", `${plan}/transactions/${plain.id}`, { transaction: { memo: "Todo list app" } });

  await page.goto(`${state.web_url}/?from=2000-01-01`);
  const claimPill = page.getByRole("button", { name: "3 to claim" });
  await claimPill.waitFor({ timeout: 15000 });
  check("pill shows 3 to claim", await claimPill.isVisible());
  check("To confirm pill shows beside it", await page.getByRole("button", { name: "1 to confirm" }).isVisible());
  const tagged = (text) => page.locator("td.memo-cell", { hasText: text }).first();
  check("flagged row shows the tag and its memo", (await tagged("Client dinner").innerText()).replace(/\s+/g, " ").trim() === "To claim Client dinner");
  check("claimed row shows Claimed and the description", (await tagged("Notebooks").innerText()).replace(/\s+/g, " ").trim() === "Claimed Notebooks");
  check("legacy TODO memo still shows as a tag", (await tagged("Conference ticket").innerText()).replace(/\s+/g, " ").trim() === "To claim Conference ticket");
  check("legacy TOCHECK TODO memo shows the claim tag and keeps TOCHECK", (await tagged("Example hotel").innerText()).replace(/\s+/g, " ").trim() === "To claim TOCHECK Example hotel");
  const plainCell = tagged("Todo list app");
  check("prose starting with Todo keeps its memo and gets no tag", (await plainCell.locator(".memo-claim").count()) === 0);
  await page.screenshot({ path: path.join(out, "web-1-register.png") });

  await claimPill.click();
  await page.waitForTimeout(500);
  const filtered = await page.locator("tbody tr.register-row-idle:not(.split-line-row)").count();
  check("To claim filter shows only the three flagged rows", filtered === 3, `rows=${filtered}`);
  await page.screenshot({ path: path.join(out, "web-2-to-claim-filter.png") });

  // Switch straight to the To confirm list.
  await page.getByRole("button", { name: "1 to confirm" }).click();
  await page.waitForTimeout(500);
  check("To confirm filter replaces the To claim one", (await page.locator("tbody tr.register-row-idle:not(.split-line-row)").count()) === 1
    && await page.getByRole("button", { name: "3 to claim" }).isVisible());
  await page.screenshot({ path: path.join(out, "web-3-to-confirm-filter.png") });
  await page.getByRole("button", { name: /Showing to confirm/ }).click();
  await page.waitForTimeout(400);

  // Turn To claim off from the edit row.
  await tagged("Client dinner").dblclick();
  const chips = page.getByRole("group", { name: "Follow-up" });
  await chips.waitFor();
  const claimChip = chips.getByRole("button", { name: "To claim" });
  check("To claim chip is on for a flagged row", (await claimChip.getAttribute("aria-pressed")) === "true");
  check("memo field shows the memo alone", (await page.getByLabel("Memo", { exact: true }).inputValue()) === "Client dinner");
  await claimChip.click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(1200);
  const off = await get(viaField.id);
  check("saving with To claim off clears the flag", off.claim_status === null && off.memo === "Client dinner", JSON.stringify([off.memo, off.claim_status]));
  await page.getByRole("button", { name: "2 to claim" }).waitFor({ timeout: 10000 });
  check("pill drops to 2", true);

  // Editing a legacy row moves the word into the field.
  await tagged("Conference ticket").dblclick();
  await chips.waitFor();
  check("legacy row opens with To claim on", (await chips.getByRole("button", { name: "To claim" }).getAttribute("aria-pressed")) === "true");
  check("legacy memo opens without the word", (await page.getByLabel("Memo", { exact: true }).inputValue()) === "Conference ticket");
  await page.getByLabel("Memo", { exact: true }).fill("Conference ticket, day 1");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(1200);
  const moved = await get(legacy.id);
  check("saving a legacy row stores the flag and the bare memo", moved.claim_status === "to_claim" && moved.memo === "Conference ticket, day 1", JSON.stringify([moved.memo, moved.claim_status]));
  await page.getByRole("button", { name: "3 to claim" }).waitFor({ timeout: 10000 });

  // A claimed row: the chip is off, the day shows, and pressing it re-files it.
  await tagged("Notebooks").dblclick();
  await chips.waitFor();
  check("claimed row shows its day", await chips.getByText("Claimed 2 Jan 2026").isVisible());
  await page.screenshot({ path: path.join(out, "web-4-claimed-edit.png") });
  // Pressing To claim twice puts the claimed state back.
  await chips.getByRole("button", { name: "To claim" }).click();
  await chips.getByRole("button", { name: "To claim" }).click();
  check("pressing To claim twice on a claimed row restores Claimed",
    (await chips.getByRole("button", { name: "To claim" }).getAttribute("aria-pressed")) === "false" && await chips.getByText("Claimed 2 Jan 2026").isVisible());
  await chips.getByRole("button", { name: "To claim" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(1200);
  const refiled = await get(claimed.id);
  check("re-claiming a claimed row files it to claim and drops the day", refiled.claim_status === "to_claim" && refiled.claimed_on === null && refiled.memo === "Notebooks");

  // Saving another field on a row kept with its words leaves the words alone.
  await tagged("Example hotel").dblclick();
  await chips.waitFor();
  await page.getByLabel("Outflow", { exact: true }).fill("77.70");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(1200);
  const keptWords = await get(legacyChecked.id);
  check("saving the amount of a row kept with its words keeps the memo and no field",
    keptWords.memo === "TOCHECK TODO: Example hotel" && keptWords.claim_status === null && keptWords.needs_confirmation === false && keptWords.amount === -77700,
    JSON.stringify([keptWords.memo, keptWords.claim_status, keptWords.needs_confirmation, keptWords.amount]));

  // A legacy CLAIMED row keeps its claimed day when edited.
  await tagged("Example receipt").dblclick();
  await chips.waitFor();
  check("legacy claimed row shows its day from the memo", await chips.getByText("Claimed 2 Jan 2026").isVisible());
  await page.getByLabel("Memo", { exact: true }).fill("Example receipt, kept");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(1200);
  const keptDay = await get(legacyClaimed.id);
  check("saving a legacy claimed row stores claimed with its day", keptDay.claim_status === "claimed" && keptDay.claimed_on === "2026-01-02" && keptDay.memo === "Example receipt, kept",
    JSON.stringify([keptDay.memo, keptDay.claim_status, keptDay.claimed_on]));

  // A new row from the compose row with To claim on.
  await page.getByRole("button", { name: "+ Add transaction" }).click();
  await page.locator("tr.register-compose-row select").first().selectOption({ label: "Travel Card" });
  await page.getByLabel("Payee").first().fill("Example Airport Taxi");
  await page.getByLabel("Outflow").first().fill("38.50");
  await page.getByLabel("Memo").first().fill("Airport to office");
  await page.getByRole("group", { name: "Follow-up" }).getByRole("button", { name: "To claim" }).click();
  await page.screenshot({ path: path.join(out, "web-5-compose.png") });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(1500);
  const toClaim = (await api("GET", `${plan}/transactions?type=to_claim`)).body.data.transactions;
  const composed = toClaim.find((t) => t.payee_name === "Example Airport Taxi");
  check("compose save creates a to-claim row with a plain memo", composed?.memo === "Airport to office", composed?.memo);

  // Dark mode and phone width.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await page.locator(".claim-pill").waitFor();
  await page.screenshot({ path: path.join(out, "web-6-dark.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload();
  await page.locator(".claim-pill").waitFor();
  await page.screenshot({ path: path.join(out, "web-7-phone.png") });

  await browser.close();
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(2); });
