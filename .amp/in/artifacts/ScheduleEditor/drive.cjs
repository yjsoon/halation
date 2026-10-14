// Usage (repo root): .amp/in/artifacts/run-fresh.sh .amp/in/artifacts/ScheduleEditor/drive.cjs <out-dir>
// Disposable verify stack only. Seeds two schedules (A plain, B split), then checks editor remounting,
// the PATCH payloads and the stored result. Request bodies are written to OUT/payloads.json.
const { chromium } = require("playwright");
const fs = require("fs");
const WEB = process.env.WEB, API = process.env.API, OUT = process.env.OUT || ".";
const T = { Authorization: "Bearer howmuch-verify-bootstrap", "content-type": "application/json" };
const out = (m) => console.log(m);
const list = async () => (await (await fetch(API + "/v1/plans/local-plan/scheduled_transactions", { headers: T })).json()).data.scheduled_transactions;
const byMemo = async (m) => (await list()).find((s) => s.memo === m);
const seed = (key, body) => fetch(API + "/v1/plans/local-plan/scheduled_transactions", { method: "POST", headers: { ...T, "Idempotency-Key": key }, body: JSON.stringify({ scheduled_transaction: body }) });
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const payloads = [];
  page.on("request", (r) => { if (["PATCH", "POST"].includes(r.method()) && /scheduled_transactions/.test(r.url())) payloads.push({ method: r.method(), body: JSON.parse(r.postData() || "null") }); });
  await page.goto(WEB);
  await page.getByRole("heading", { name: /Set up Halation|Ledger|Sign in/ }).first().waitFor();
  if (await page.getByRole("button", { name: "Create account" }).count()) {
    await page.getByLabel("Username").fill("verifier"); await page.getByLabel("Password").fill("howmuch-verify-15");
    await page.getByLabel(/Setup token/).fill("howmuch-verify-bootstrap"); await page.getByRole("button", { name: "Create account" }).click();
  }
  await page.getByRole("heading", { name: "Ledger" }).waitFor({ timeout: 90000 });
  const base = { account_id: "acct-everyday", date_first: "2026-11-01", date_next: "2026-11-01", frequency: "monthly" };
  await seed("seed-sched-a", { ...base, amount: -5000, memo: "SchedVerify A" });
  await seed("seed-sched-b", { ...base, date_next: "2026-11-02", amount: -3000, memo: "SchedVerify B", subtransactions: [{ amount: -1000, memo: "line one" }, { amount: -2000, memo: "line two" }] });
  await page.goto(WEB + "/scheduled");
  await page.getByText("SchedVerify A").first().waitFor();
  const edit = (memo) => page.locator("tr.schedule-row", { hasText: memo }).getByRole("button", { name: /^Edit/ }).click();
  const memoField = () => page.getByLabel("Memo", { exact: true });
  // 1. Edit A, then switch to B without closing: the form must be B's, not A's.
  await edit("SchedVerify A"); out("editA memo=" + await memoField().inputValue() + " splitChecked=" + await page.getByLabel("Split this schedule").isChecked());
  await edit("SchedVerify B"); out("switchToB memo=" + await memoField().inputValue() + " splitChecked=" + await page.getByLabel("Split this schedule").isChecked() + " splitLines=" + await page.locator(".transaction-editor-split-line").count());
  await page.screenshot({ path: OUT + "/switch-to-b.png" });
  await memoField().fill("SchedVerify B2"); await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("SchedVerify B2").first().waitFor();
  const a1 = await byMemo("SchedVerify A"), b1 = await byMemo("SchedVerify B2");
  out("afterSaveB: A.memo=" + a1.memo + " A.amount=" + a1.amount + " B.memo=" + b1.memo + " B.lines=" + b1.subtransactions.length + " B.amount=" + b1.amount);
  // 2. Add after Edit: blank form.
  await edit("SchedVerify A"); await page.getByRole("button", { name: "Add schedule" }).first().click();
  out("addAfterEdit heading=" + await page.locator("#schedule-editor-heading").innerText() + " memo='" + await memoField().inputValue() + "'");
  await page.getByRole("button", { name: "Cancel" }).first().click();
  // 3. Save A unsplit: payload must clear lines explicitly; stored A stays unsplit.
  await edit("SchedVerify A"); await memoField().fill("SchedVerify A2"); await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("SchedVerify A2").first().waitFor();
  const a2 = await byMemo("SchedVerify A2"); out("afterSaveA: A.memo=" + a2.memo + " A.lines=" + (a2.subtransactions || []).length);
  // 4. Unsplit B: the split lines must actually be removed on the server.
  await edit("SchedVerify B2"); await page.getByLabel("Split this schedule").uncheck(); await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("button", { name: "Save changes" }).waitFor({ state: "detached" });
  const b2 = await byMemo("SchedVerify B2"); out("afterUnsplitB: B.lines=" + (b2.subtransactions || []).length + " B.amount=" + b2.amount);
  await page.screenshot({ path: OUT + "/final.png" });
  fs.writeFileSync(OUT + "/payloads.json", JSON.stringify(payloads, null, 1));
  await b.close();
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
