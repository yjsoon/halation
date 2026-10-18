const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const fs = require("fs");
const state = JSON.parse(fs.readFileSync("/tmp/howmuch-verify-web/current/state.json", "utf8"));
const OUT = "/home/user/howmuch/.amp/in/artifacts/card-payments-web";
const log = [];
const { execSync } = require("child_process");
const http = (path, file) => {
  const out = execSync(`control-howmuch http GET "${path}"`, { env: { ...process.env, HOWMUCH_VERIFY_STATE_ROOT: "/tmp/howmuch-verify-web", PATH: `/home/user/howmuch/.cursor/skills/verify-howmuch/bin:${process.env.PATH}` } }).toString();
  fs.writeFileSync(`${OUT}/${file}`, out);
  return JSON.parse(out);
};
const note = (line) => { console.log(line); log.push(line); };
const field = (scope, name) => scope.locator("label.field").filter({ has: scope.page().locator(".field-label", { hasText: new RegExp(`^${name}$`) }) }).locator("select, input").first();
const expect = (cond, label) => { note(`${cond ? "PASS" : "FAIL"} ${label}`); if (!cond) process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch({ executablePath: undefined });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const keys = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && /scheduled_transactions|card_payment_terms/.test(request.url())) {
      keys.push({ method: request.method(), url: request.url().replace(state.web_url, ""), idempotency_key: request.headers()["idempotency-key"] ?? null, body: request.postData() });
    }
  });
  page.on("pageerror", (error) => note(`PAGEERROR ${error.message}`));

  // First-owner setup
  await page.goto(state.web_url);
  await page.getByRole("heading", { name: "Set up Halation" }).waitFor();
  await page.getByLabel("Username", { exact: true }).fill(state.username);
  await page.getByLabel("Password", { exact: true }).fill(state.password);
  await page.getByLabel("Setup token", { exact: true }).fill(state.api_token);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("heading", { name: "Ledger" }).waitFor({ timeout: 30000 });
  note("setup: owner created, Ledger shown");

  // 1. Set-up entry on Scheduled
  await page.getByRole("link", { name: "Scheduled" }).first().click();
  await page.getByRole("heading", { name: "Scheduled transactions" }).waitFor();
  const setupButton = page.getByRole("button", { name: "Set up payment reminders" });
  await setupButton.waitFor();
  expect(await page.getByRole("heading", { name: "Payments due" }).count() === 0, "no Payments due panel before any terms");
  await page.screenshot({ path: `${OUT}/01-desktop-setup-entry.png`, fullPage: true });

  // 2. Terms dialog
  await setupButton.click();
  const dialog = page.getByRole("dialog", { name: "Set up payment reminders" });
  await dialog.waitFor();
  expect(await field(dialog, "Card").inputValue() === "acct-credit", "dialog defaults to Travel Card");
  expect(await field(dialog, "Bank preset").inputValue() === "dbs", "preset defaults to DBS / POSB");
  await field(dialog, "Bank preset").selectOption("ocbc");
  expect(await field(dialog, "Days to due date").inputValue() === "23", "OCBC preset sets 23 days");
  expect(await field(dialog, "Due on a weekend").inputValue() === "previous", "OCBC preset sets previous working day");
  await field(dialog, "Bank preset").selectOption("dbs");
  expect(await field(dialog, "Days to due date").inputValue() === "25", "DBS preset sets 25 days");
  await field(dialog, "Statement day").fill("3");
  await field(dialog, "Pay from").selectOption("acct-everyday");
  const preview = (await dialog.locator(".card-terms-preview").innerText()).trim();
  note(`preview: ${preview}`);
  expect(preview === "Next due Wed 28 Oct, for the 3 Oct statement. Pay by Mon 26 Oct.", "Next line: due Wed 28 Oct, 3 Oct statement, pay by Mon 26 Oct");
  await dialog.screenshot({ path: `${OUT}/02-desktop-terms-dialog.png` });
  await dialog.getByRole("button", { name: "Save terms" }).click();
  await dialog.waitFor({ state: "detached" }).catch(() => dialog.waitFor({ state: "hidden" }));

  // 3. Panel, unscheduled
  await page.getByRole("heading", { name: "Payments due" }).waitFor();
  const row = page.locator(".card-payment-row", { hasText: "Travel Card" });
  await row.getByText("Unscheduled").waitFor();
  const rowText = (await row.innerText()).replace(/\s+/g, " ");
  note(`row (unscheduled): ${rowText}`);
  expect(rowText.includes("recorded") && rowText.includes("min "), "row shows 'recorded' amount and minimum");
  expect((await page.getByRole("status").first().innerText()).includes("Payment terms saved for Travel Card"), "save message names the card and next dates");
  expect((await page.locator(".card-payments .section-meta").first().innerText()).includes("Check your statement for the actual amount"), "estimate caveat shown");
  await page.screenshot({ path: `${OUT}/03-desktop-panel-unscheduled.png`, fullPage: true });
  const terms = http("/v1/plans/local-plan/card_payment_terms", "api-01-card-payment-terms.json").data.card_payment_terms;
  expect(terms.length === 1 && terms[0].account_id === "acct-credit" && terms[0].statement_day === 3 && terms[0].due_gap_days === 25 && terms[0].due_weekend_rule === "next" && terms[0].default_funding_account_id === "acct-everyday", "API: terms stored for Travel Card (day 3, 25, next, from Everyday)");
  const before = http("/v1/plans/local-plan/card_payments", "api-02-card-payments-unscheduled.json").data;
  const currentBefore = before.cycles.find((c) => c.account_id === "acct-credit" && c.cycle === "current");
  expect(currentBefore && currentBefore.coverage.state === "unscheduled" && currentBefore.statement_date === "2026-10-03" && currentBefore.due_date === "2026-10-28", "API: current cycle 3 Oct / 28 Oct unscheduled");

  // 4. Schedule… opens the existing editor prefilled
  await page.getByRole("button", { name: "Schedule payment for Travel Card" }).click();
  const editor = page.locator(".schedule-editor");
  await editor.waitFor();
  const heading = await editor.locator("#schedule-editor-heading").textContent();
  const fields = {
    heading,
    account: await field(editor, "Account").inputValue(),
    amount: await field(editor, "Amount").inputValue(),
    first: await field(editor, "First date").inputValue(),
    next: await field(editor, "Next date").inputValue(),
    repeat: await field(editor, "Repeat").inputValue(),
    transfer: await field(editor, "Transfer").inputValue(),
    memo: await field(editor, "Memo").inputValue(),
  };
  note(`prefill: ${JSON.stringify(fields)}`);
  expect(fields.heading === "Schedule Travel Card payment", "editor heading");
  expect(fields.account === "acct-everyday" && fields.transfer === "acct-credit", "funding account from terms, transfer to card");
  expect(fields.first === "2026-10-26" && fields.next === "2026-10-26", "date is default pay day 26 Oct");
  expect(fields.repeat === "never", "repeat Once");
  expect(fields.memo === "Travel Card statement 3 Oct", "memo");
  await page.screenshot({ path: `${OUT}/04-desktop-schedule-prefilled.png`, fullPage: true });
  await editor.getByRole("button", { name: "Schedule payment" }).click();
  await editor.waitFor({ state: "detached" });

  // 5. Row flips to Scheduled
  await row.getByText(/Scheduled 26 Oct from Everyday Account/).waitFor({ timeout: 15000 });
  note(`row (scheduled): ${(await row.innerText()).replace(/\s+/g, " ")}`);
  note(`status: ${await page.getByRole("status").first().innerText()}`);
  expect((await page.getByRole("status").first().innerText()).includes("bank app"), "confirmation tells the user to set it up in the bank app");
  expect(await row.getByRole("button", { name: /Schedule payment/ }).count() === 0, "Schedule… gone once scheduled");
  await page.screenshot({ path: `${OUT}/05-desktop-panel-scheduled.png`, fullPage: true });
  const schedules = http("/v1/plans/local-plan/scheduled_transactions", "api-03-scheduled-transactions.json").data.scheduled_transactions.filter((s) => !s.deleted);
  const payment = schedules.find((s) => s.transfer_account_id === "acct-credit");
  expect(schedules.length === 1 && payment && payment.account_id === "acct-everyday" && payment.frequency === "never" && payment.date_first === "2026-10-26" && payment.amount === -currentBefore.statement_balance && payment.memo === "Travel Card statement 3 Oct", "API: one-off transfer Everyday -> Travel Card on 26 Oct for the statement balance, memo set");
  const after = http("/v1/plans/local-plan/card_payments", "api-04-card-payments-scheduled.json").data;
  const currentAfter = after.cycles.find((c) => c.account_id === "acct-credit" && c.cycle === "current");
  expect(currentAfter.coverage.state === "scheduled" && currentAfter.coverage.scheduled_transaction_id === payment.id, "API: coverage scheduled, pointing at that schedule");
  const createReq = keys.find((k) => k.method === "POST" && /scheduled_transactions$/.test(k.url));
  expect(createReq && createReq.idempotency_key === "card-pay:acct-credit:2026-10-03", `create sent Idempotency-Key ${createReq && createReq.idempotency_key}`);

  // 5b. Delete that schedule and schedule the statement again: the first key
  // would replay the deleted schedule, so the page must fall back to a fresh key.
  await page.getByRole("button", { name: "Delete Transfer to Travel Card" }).click();
  await page.getByRole("button", { name: "Delete schedule" }).click();
  await row.getByText("Unscheduled").waitFor({ timeout: 15000 });
  note("after delete: row back to Unscheduled");
  await page.getByRole("button", { name: "Schedule payment for Travel Card" }).click();
  await page.locator(".schedule-editor").getByRole("button", { name: "Schedule payment" }).click();
  await row.getByText(/Scheduled 26 Oct from Everyday Account/).waitFor({ timeout: 15000 });
  const again = http("/v1/plans/local-plan/scheduled_transactions", "api-03b-scheduled-after-reschedule.json").data.scheduled_transactions.filter((s) => !s.deleted);
  const creates = keys.filter((k) => k.method === "POST" && /scheduled_transactions$/.test(k.url)).map((k) => k.idempotency_key);
  note(`create keys: ${JSON.stringify(creates)}`);
  expect(again.length === 1 && again[0].id !== payment.id && again[0].transfer_account_id === "acct-credit", "re-scheduling after delete creates a new live schedule");
  expect(creates.length === 3 && creates[1] === "card-pay:acct-credit:2026-10-03" && /^card-pay:acct-credit:2026-10-03:[0-9a-f]{8}$/.test(creates[2]), "second save replayed the base key, then used a suffixed key");
  await page.screenshot({ path: `${OUT}/05b-desktop-panel-rescheduled.png`, fullPage: true });

  // 6. Register header entry
  await page.getByRole("link", { name: /Travel Card/ }).first().click();
  const regButton = page.getByRole("button", { name: "Payment reminders" });
  await regButton.waitFor();
  await regButton.click();
  const regDialog = page.getByRole("dialog", { name: "Payment reminders for Travel Card" });
  await regDialog.waitFor();
  expect(await field(regDialog, "Statement day").inputValue() === "3", "register dialog loads saved terms");
  await page.screenshot({ path: `${OUT}/06-desktop-register-terms.png` });
  await regDialog.getByRole("button", { name: "Cancel" }).click();

  // 7. Phone width
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: await context.storageState() });
  const phonePage = await phone.newPage();
  await phonePage.goto(`${state.web_url}/scheduled`);
  await phonePage.getByRole("heading", { name: "Payments due" }).waitFor();
  await phonePage.locator(".card-payment-row", { hasText: "Travel Card" }).getByText(/Scheduled 26 Oct/).waitFor();
  const overflow = await phonePage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow <= 0, `no horizontal page scroll at 390px (overflow ${overflow})`);
  await phonePage.screenshot({ path: `${OUT}/07-phone-panel-scheduled.png`, fullPage: true });
  await phonePage.getByRole("button", { name: "Payment terms for Travel Card" }).click();
  const phoneDialog = phonePage.getByRole("dialog", { name: "Payment reminders for Travel Card" });
  await phoneDialog.waitFor();
  await phonePage.screenshot({ path: `${OUT}/08-phone-terms-dialog.png` });
  await phoneDialog.getByRole("button", { name: "Cancel" }).click();

  // 8. Enter the schedule now: the row moves to Posted, awaiting approval
  await page.goto(`${state.web_url}/scheduled`);
  await page.getByRole("button", { name: "Enter Transfer to Travel Card now" }).click();
  await page.getByRole("button", { name: "Enter now", exact: true }).click();
  await row.getByText(/awaiting approval/).waitFor({ timeout: 15000 });
  note(`row (posted): ${(await row.innerText()).replace(/\s+/g, " ")}`);
  await page.screenshot({ path: `${OUT}/09-desktop-panel-posted.png`, fullPage: true });
  const posted = http("/v1/plans/local-plan/card_payments", "api-05-card-payments-posted.json").data.cycles.find((c) => c.account_id === "acct-credit" && c.cycle === "current");
  expect(posted.coverage.state === "posted" && posted.coverage.approved === false, "API: coverage posted, unapproved after Enter now");

  fs.writeFileSync(`${OUT}/requests.json`, JSON.stringify(keys, null, 2));
  fs.writeFileSync(`${OUT}/browser-log.txt`, log.join("\n") + "\n");
  await browser.close();
})().catch((error) => { console.error(error); fs.writeFileSync(`${OUT}/browser-log.txt`, log.join("\n") + `\nERROR ${error.stack}\n`); process.exit(1); });
