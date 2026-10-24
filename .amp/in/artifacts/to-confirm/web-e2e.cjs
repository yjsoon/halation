// Web E2E for the "to confirm" marker and Follow-up chips, against the
// disposable stack from `control-howmuch launch` (synthetic demo ledger).
//   node .amp/in/artifacts/to-confirm/web-e2e.cjs
// Writes screenshots beside this file and exits non-zero on a failed check.
const { chromium } = require("playwright");
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
let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
};

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

  // Mark two existing demo rows: one estimated, one estimated and to claim.
  const list = (await api("GET", `/v1/plans/${state.plan_id}/transactions?limit=40`)).body.data.transactions
    .filter((t) => t.amount < 0 && !t.transfer_account_id && !(t.subtransactions || []).length);
  const [first, second, third, fourth] = list;
  await api("PATCH", `/v1/plans/${state.plan_id}/transactions/${first.id}`, { transaction: { needs_confirmation: true, cleared: "uncleared" } });
  await api("PATCH", `/v1/plans/${state.plan_id}/transactions/${second.id}`, { transaction: { needs_confirmation: true, memo: "TODO: Client dinner" } });
  await api("PATCH", `/v1/plans/${state.plan_id}/transactions/${third.id}`, { transaction: { memo: "CLAIMED - 2026-01-02: Notebooks" } });
  // Not claims to the claims tool: TODO later in the memo, and an ordinary "Claimed".
  await api("PATCH", `/v1/plans/${state.plan_id}/transactions/${fourth.id}`, { transaction: { memo: "Claimed back from Sam TODO" } });

  await page.reload();
  await page.getByRole("heading", { name: "Ledger" }).waitFor();
  // Widen the window to all time so the marked rows are on screen.
  await page.goto(`${state.web_url}/?from=2000-01-01`);
  const pill = page.getByRole("button", { name: "2 to confirm" });
  await pill.waitFor({ timeout: 15000 });
  check("pill shows 2 to confirm", await pill.isVisible());
  check("two rows carry the estimate mark", (await page.locator("tr.register-row-to-confirm").count()) === 2);
  check("to-claim tag shows in place of TODO", await page.locator(".memo-claim-todo").first().isVisible());
  check("claimed tag shows", await page.locator(".memo-claim-done").first().isVisible());
  const claimedCell = page.locator("td", { has: page.locator(".memo-claim-done") }).first();
  const claimedText = (await claimedCell.innerText()).replace(/\s+/g, " ").trim();
  check("claimed row shows just its description", claimedText === "Claimed Notebooks", claimedText);
  const plainCell = page.locator("td", { hasText: "Claimed back from Sam TODO" }).first();
  check("ordinary memo with Claimed and a late TODO gets no tag",
    (await plainCell.isVisible()) && (await plainCell.locator(".memo-claim").count()) === 0);
  await page.screenshot({ path: path.join(out, "web-1-register.png") });

  await pill.click();
  await page.waitForTimeout(400);
  check("filter shows only the two rows", (await page.locator("tbody tr.register-row-idle:not(.split-line-row)").count()) === 2);
  await page.screenshot({ path: path.join(out, "web-2-filtered.png") });

  // Confirm one through the ≈ mark.
  await page.getByRole("button", { name: "Confirm estimated amount" }).first().click();
  await page.getByText(/confirmed\./).first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  const after = (await api("GET", `/v1/plans/${state.plan_id}/transactions/needs_confirmation_count`)).body.data.count;
  check("server count drops to 1 after confirming", after === 1, `count=${after}`);
  await page.screenshot({ path: path.join(out, "web-3-confirmed.png") });

  // Clear the filter and open the remaining row for editing.
  await page.getByRole("button", { name: /Showing to confirm/ }).click();
  await page.waitForTimeout(400);
  const row = page.locator("tr.register-row-to-confirm").first();
  await row.locator("td.memo-cell").dblclick();
  const chips = page.getByRole("group", { name: "Follow-up" });
  await chips.waitFor();
  const confirmChip = chips.getByRole("button", { name: "To confirm" });
  const claimChip = chips.getByRole("button", { name: "To claim" });
  check("To confirm chip is on", (await confirmChip.getAttribute("aria-pressed")) === "true");
  check("To claim chip is on", (await claimChip.getAttribute("aria-pressed")) === "true");
  await page.screenshot({ path: path.join(out, "web-4-edit-row.png") });
  await claimChip.click();
  const memoValue = await page.getByLabel("Memo", { exact: true }).inputValue();
  check("turning To claim off removes TODO from the memo", memoValue === "Client dinner", memoValue);
  await claimChip.click();
  check("turning it back on restores TODO", (await page.getByLabel("Memo", { exact: true }).inputValue()) === "TODO: Client dinner");
  await confirmChip.click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(1200);
  const saved = (await api("GET", `/v1/plans/${state.plan_id}/transactions/${second.id}`)).body.data.transaction;
  check("saving with To confirm off persists", saved.needs_confirmation === false);
  check("memo kept TODO for the claims tool", saved.memo === "TODO: Client dinner", saved.memo);
  check("pill gone when nothing is left", !(await page.locator(".confirm-pill").isVisible().catch(() => false)));

  // A new row from the compose row with To confirm on.
  await page.getByRole("button", { name: "+ Add transaction" }).click();
  await page.locator("tr.register-compose-row select").first().selectOption({ label: "Travel Card" });
  await page.getByLabel("Payee").first().fill("Example Bistro Tokyo");
  await page.getByLabel("Outflow").first().fill("42.10");
  const composeChips = page.getByRole("group", { name: "Follow-up" });
  await composeChips.getByRole("button", { name: "To confirm" }).click();
  await page.screenshot({ path: path.join(out, "web-5-compose.png") });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(1500);
  const created = (await api("GET", `/v1/plans/${state.plan_id}/transactions?type=needs_confirmation`)).body.data.transactions;
  check("compose save creates a to-confirm row", created.some((t) => t.payee_name === "Example Bistro Tokyo"));

  // Dark mode and phone width.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await page.locator("tr.register-row-to-confirm").first().waitFor();
  await page.screenshot({ path: path.join(out, "web-6-dark.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload();
  await page.locator("tr.register-row-to-confirm").first().waitFor();
  await page.screenshot({ path: path.join(out, "web-7-phone.png") });

  await browser.close();
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(2); });
