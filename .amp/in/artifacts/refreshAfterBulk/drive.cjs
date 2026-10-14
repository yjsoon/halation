// Usage (from repo root): NODE_PATH=/opt/node22/lib/node_modules WEB=<url> API=<url> node drive.cjs
// Disposable verify stack only (control-howmuch launch). Writes screenshots into the CWD's OUT dir.
const { chromium } = require("playwright");
const WEB = process.env.WEB, API = process.env.API, OUT = process.env.OUT || ".";
const T = { Authorization: "Bearer howmuch-verify-bootstrap", "content-type": "application/json" };
const out = (m) => console.log(m);
const get = async (p) => (await (await fetch(API + p, { headers: T })).json()).data;
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(WEB);
  await page.getByRole("heading", { name: /Set up Halation|Ledger|Sign in/ }).first().waitFor();
  if (await page.getByRole("button", { name: "Create account" }).count()) {
    await page.getByLabel("Username").fill("verifier"); await page.getByLabel("Password").fill("howmuch-verify-15");
    await page.getByLabel(/Setup token/).fill("howmuch-verify-bootstrap"); await page.getByRole("button", { name: "Create account" }).click();
  }
  await page.getByRole("heading", { name: "Ledger" }).waitFor({ timeout: 90000 }).catch(async (e) => { console.error((await page.locator("body").innerText()).slice(0, 500)); throw e; });
  for (let i = 1; i <= 6; i++) await fetch(API + "/v1/plans/local-plan/transactions", { method: "POST", headers: { ...T, "Idempotency-Key": "seed-bulk-" + i }, body: JSON.stringify({ transaction: { account_id: "acct-everyday", date: "2026-10-14", amount: -1000 * i, payee_name: "BulkVerify " + i, memo: "bv", cleared: "uncleared", approved: true } }) });
  await page.getByRole("link", { name: /Everyday Account/ }).first().click();
  await page.getByText("BulkVerify 1", { exact: false }).first().waitFor();
  const sel = async (n) => page.getByRole("checkbox", { name: new RegExp(`Select BulkVerify ${n} on`) }).check();
  const row = async (n) => (await get("/v1/plans/local-plan/transactions?since_date=2026-10-14")).transactions.find((t) => t.payee_name === "BulkVerify " + n);
  await sel(1); await sel(2); await page.getByRole("button", { name: "Mark cleared" }).click();
  await page.getByText(/Marked cleared 2 transactions/).waitFor();
  out("cleared: api=" + (await row(1)).cleared + "," + (await row(2)).cleared + " selectionBarGone=" + (await page.getByRole("group", { name: "Selected transaction actions" }).count() === 0));
  await page.screenshot({ path: OUT + "/cleared.png" });
  await sel(3); await sel(4);
  await page.getByLabel("Set category for selected transactions").selectOption({ label: "Dining Out" });
  await page.getByText(/Categorised 2 transactions/).waitFor();
  out("categorised: api=" + (await row(3)).category_name + "," + (await row(4)).category_name);
  await page.screenshot({ path: OUT + "/categorised.png" });
  await sel(5); await sel(6); await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("heading", { name: "Delete 2 transactions?" }).waitFor();
  await page.screenshot({ path: OUT + "/delete-confirm.png" });
  await page.getByRole("button", { name: "Delete transactions" }).click();
  await page.getByText(/Deleted 2 transactions/).waitFor();
  out("deleted: api row5=" + (await row(5)) + " row6=" + (await row(6)) + " rowsOnScreen=" + await page.getByText(/BulkVerify [56]/).count() + " dialogGone=" + (await page.getByRole("heading", { name: /Delete 2/ }).count() === 0));
  await page.screenshot({ path: OUT + "/deleted.png" });
  // Failure path: the bulk request is aborted; expect an error, a released lock and a register re-read.
  await sel(1);
  await page.route(/\/transactions\/cleared$/, (r) => r.abort());
  let reads = 0; page.on("request", (r) => { if (r.method() === "GET" && /\/transactions\?/.test(r.url())) reads++; });
  await page.getByRole("button", { name: "Mark uncleared" }).click({ timeout: 5000 });
  await page.waitForTimeout(1500);
  out("failure: errorShown=" + (await page.getByRole("alert").count() > 0 || await page.getByText(/fetch|network/i).count() > 0) + " registerReReads=" + reads + " barText=" + JSON.stringify(await page.getByRole("group", { name: "Selected transaction actions" }).innerText().catch(() => "(bar gone)")) + " alerts=" + JSON.stringify(await page.getByRole("alert").allInnerTexts()));
  await page.screenshot({ path: OUT + "/failure.png" });
  await b.close();
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
