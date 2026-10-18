const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const fs = require("fs");
const state = JSON.parse(fs.readFileSync("/tmp/howmuch-verify-web/current/state.json", "utf8"));
const OUT = "/home/user/howmuch/.amp/in/artifacts/card-payments-web";
const log = [];
const { execSync } = require("child_process");
const ENV = { ...process.env, HOWMUCH_VERIFY_STATE_ROOT: "/tmp/howmuch-verify-web", PATH: `/home/user/howmuch/.cursor/skills/verify-howmuch/bin:${process.env.PATH}` };
const call = (method, path, body) => { const out = execSync(`control-howmuch http ${method} "${path}" -d '${JSON.stringify(body)}'`, { env: ENV }).toString(); return JSON.parse(out); };
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
  // R-W2: approve it, and the row reads "Paid <amount> on <date>"
  call("PATCH", `/v1/plans/local-plan/transactions/${posted.coverage.transaction_id}`, { transaction: { approved: true } });
  await page.reload();
  await row.getByText("Paid $64,830.80 on 18 Oct").waitFor({ timeout: 15000 });
  expect(true, "paid row shows the amount: Paid $64,830.80 on 18 Oct");
  expect((await page.locator(".card-payments").innerText()).includes("Record payments as a transfer from your bank account so Halation can tell the statement is paid."), "R-W3 footnote shown");
  await page.screenshot({ path: `${OUT}/09b-desktop-panel-paid.png`, fullPage: true });

  // ---- Review round: new coverage states on synthetic cards ----
  const ids = JSON.parse(execSync(`python3 ${__dirname}/seed-states.py`, { env: ENV }).toString());
  note(`seeded states: ${JSON.stringify(ids)}`);
  const termsBeforeBackdate = http("/v1/plans/local-plan/card_payments", "api-06-card-payments-before-backdate.json").data.cycles.find((c) => c.account_id === ids.card_c && c.cycle === "current");
  expect(termsBeforeBackdate.coverage.state === "unscheduled" && termsBeforeBackdate.previous_unpaid === null, "B2: Card C set up today is not overdue for a due date before setup");
  note(execSync(`python3 ${__dirname}/backdate.py ${ids.card_c}`).toString().trim());
  const states = http("/v1/plans/local-plan/card_payments", "api-07-card-payments-states.json").data.cycles.filter((c) => c.cycle === "current");
  const cur = (id) => states.find((c) => c.account_id === id);
  expect(cur(ids.card_b).coverage.state === "partial" && cur(ids.card_c).coverage.state === "overdue" && cur(ids.card_d).coverage.state === "settled", "API: Card B partial, Card C overdue (carried), Card D settled");

  await page.goto(`${state.web_url}/scheduled`);
  const rowB = page.locator(".card-payment-row", { hasText: "Card B" });
  const rowC = page.locator(".card-payment-row", { hasText: "Card C" });
  const rowD = page.locator(".card-payment-row", { hasText: "Card D" });
  await rowB.getByText("$20.00 of $500.00 paid").waitFor({ timeout: 15000 });
  expect(await rowB.getByRole("button", { name: "Schedule payment for Card B" }).count() === 1, "partial row keeps Schedule…");
  await rowC.getByText("Overdue since 12 Oct").waitFor();
  expect(await rowC.getByRole("button", { name: "Schedule payment for Card C" }).count() === 1, "carried overdue row offers Schedule…");
  await rowD.getByText("Nothing owed now").waitFor();
  expect(await rowD.getByRole("button", { name: /Schedule payment/ }).count() === 0, "settled row has no Schedule…");
  expect((await rowD.innerText()).includes("Next: statement 3 Nov"), "settled row shows the next statement");
  note(`row B: ${(await rowB.innerText()).replace(/\s+/g, " ")}`);
  note(`row C: ${(await rowC.innerText()).replace(/\s+/g, " ")}`);
  note(`row D: ${(await rowD.innerText()).replace(/\s+/g, " ")}`);
  await page.screenshot({ path: `${OUT}/10-desktop-panel-states.png`, fullPage: true });

  // W3: partial prefill is the remainder, date limited to the window
  await rowB.getByRole("button", { name: "Schedule payment for Card B" }).click();
  let ed = page.locator(".schedule-editor");
  await ed.waitFor();
  const firstInput = field(ed, "First date");
  note(`Card B prefill: amount ${await field(ed, "Amount").inputValue()}, date ${await firstInput.inputValue()}, min ${await firstInput.getAttribute("min")}, max ${await firstInput.getAttribute("max")}, memo ${await field(ed, "Memo").inputValue()}`);
  expect(await field(ed, "Amount").inputValue() === "-480", "partial prefill pays the remaining 480.00");
  expect(await firstInput.getAttribute("min") === "2026-10-18" && await firstInput.getAttribute("max") === "2026-11-03", "date picker limited to today..window end (3 Nov)");
  expect(await field(ed, "Memo").inputValue() === "Card B statement 3 Oct", "shared memo format");
  await firstInput.fill("2026-11-10");
  await field(ed, "Next date").fill("2026-11-10");
  await ed.getByRole("button", { name: "Schedule payment" }).click();
  const postsBefore = keys.filter((k) => k.method === "POST").length;
  await page.waitForTimeout(500);
  const overflowFlag = await firstInput.evaluate((el) => el.validity.rangeOverflow);
  const vmsg = await firstInput.evaluate((el) => el.validationMessage);
  note(`out-of-window validation: rangeOverflow=${overflowFlag} message="${vmsg}"`);
  expect(overflowFlag && await ed.count() === 1 && keys.filter((k) => k.method === "POST").length === postsBefore, "a date after the window is refused (form stays open, nothing sent)");
  await page.screenshot({ path: `${OUT}/11-desktop-window-validation.png`, fullPage: true });

  // W4: another device schedules Card B first (same key, different amount); this save gets 409, sees it covered, closes and refreshes
  call("POST", "/v1/plans/local-plan/scheduled_transactions", { scheduled_transaction: { account_id: "acct-everyday", transfer_account_id: ids.card_b, date_first: "2026-10-26", frequency: "never", amount: -100000, memo: "Card B statement 3 Oct" } });
  // control-howmuch sends no Idempotency-Key, so post again with the shared key explicitly
  execSync(`control-howmuch http POST "/v1/plans/local-plan/scheduled_transactions" -H "idempotency-key: card-pay:${ids.card_b}:2026-10-03" -d '${JSON.stringify({ scheduled_transaction: { account_id: "acct-everyday", transfer_account_id: ids.card_b, date_first: "2026-10-27", frequency: "never", amount: -90000, memo: "Card B statement 3 Oct" } })}'`, { env: ENV });
  await firstInput.fill("2026-10-26");
  await field(ed, "Next date").fill("2026-10-26");
  await ed.getByRole("button", { name: "Schedule payment" }).click();
  await ed.waitFor({ state: "detached", timeout: 15000 });
  const alert = await page.getByRole("alert").first().innerText();
  note(`409 then covered: ${alert.replace(/\s+/g, " ")}`);
  expect(alert.includes("already has a payment scheduled or recorded, so nothing was scheduled"), "409 then covered: clear message, editor closed");
  await rowB.getByText(/Scheduled 2[67] Oct from Everyday Account/).waitFor({ timeout: 15000 });
  const bSchedules = http("/v1/plans/local-plan/scheduled_transactions", "api-08-card-b-schedules.json").data.scheduled_transactions.filter((x) => !x.deleted && x.transfer_account_id === ids.card_b);
  expect(bSchedules.length === 2 && !bSchedules.some((x) => x.amount === -480000), "the page created nothing; only the two other-device schedules exist");
  await page.screenshot({ path: `${OUT}/12-desktop-409-covered.png`, fullPage: true });

  // R-W1: the tab is stale (another device scheduled Card C); Schedule… re-reads first and refuses
  const otherC = call("POST", "/v1/plans/local-plan/scheduled_transactions", { scheduled_transaction: { account_id: "acct-everyday", transfer_account_id: ids.card_c, date_first: "2026-10-20", frequency: "never", amount: -300000, memo: "Card C statement 15 Oct" } }).data.scheduled_transaction;
  await rowC.getByRole("button", { name: "Schedule payment for Card C" }).click();
  await rowC.getByText(/Scheduled 20 Oct/).waitFor({ timeout: 15000 });
  const staleAlert = await page.getByRole("alert").first().innerText();
  expect(staleAlert.includes("already has a payment scheduled or recorded") && await page.locator(".schedule-editor").count() === 0, "stale Schedule… re-reads, refuses and refreshes instead of opening the editor");
  await page.screenshot({ path: `${OUT}/12b-desktop-stale-open.png`, fullPage: true });
  execSync(`control-howmuch http DELETE "/v1/plans/local-plan/scheduled_transactions/${otherC.id}"`, { env: ENV });
  await page.reload();
  await rowC.getByText("Overdue since 12 Oct").waitFor({ timeout: 15000 });

  // Carried overdue: Schedule… pays the unpaid statement from today; then the scheduled row still warns about the previous statement
  await rowC.getByRole("button", { name: "Schedule payment for Card C" }).click();
  ed = page.locator(".schedule-editor");
  await ed.waitFor();
  const noteC = await ed.locator(".section-meta").first().innerText();
  note(`Card C prefill: amount ${await field(ed, "Amount").inputValue()}, date ${await field(ed, "First date").inputValue()}; note: ${noteC}`);
  expect(await field(ed, "Amount").inputValue() === "-300" && await field(ed, "First date").inputValue() === "2026-10-18", "overdue prefill: 300.00 today");
  expect(noteC.includes("15 Sep statement") && noteC.includes("unpaid past 12 Oct"), "note names the unpaid previous statement");
  await ed.getByRole("button", { name: "Schedule payment" }).click();
  await ed.waitFor({ state: "detached" });
  await rowC.getByText(/Scheduled 18 Oct from Everyday Account/).waitFor({ timeout: 15000 });
  const cAfter = http("/v1/plans/local-plan/card_payments", "api-09-card-payments-c-scheduled.json").data.cycles.find((c) => c.account_id === ids.card_c && c.cycle === "current");
  note(`Card C after: ${JSON.stringify(cAfter.coverage)} previous_unpaid=${JSON.stringify(cAfter.previous_unpaid)}`);
  if (cAfter.previous_unpaid) expect((await rowC.innerText()).includes("Previous statement 15 Sep unpaid, due 12 Oct"), "scheduled row still warns about the unpaid previous statement");
  await page.screenshot({ path: `${OUT}/13-desktop-overdue-scheduled.png`, fullPage: true });

  // W5: Card D's paying account is closed; the dialog drops it
  const z = call("POST", "/v1/plans/local-plan/accounts", { account: { name: "Account Z", type: "checking", balance: 0 } }).data.account;
  call("PUT", `/v1/plans/local-plan/accounts/${ids.card_d}/card_payment_terms`, { card_payment_terms: { statement_day: 3, due_gap_days: 25, due_weekend_rule: "next", default_funding_account_id: z.id } });
  note(execSync(`python3 ${__dirname}/close-account.py ${z.id}`).toString().trim());
  await page.reload();
  await page.getByRole("button", { name: "Payment terms for Card D" }).click();
  const dDialog = page.getByRole("dialog", { name: "Payment reminders for Card D" });
  await dDialog.waitFor();
  const payFrom = field(dDialog, "Pay from");
  const selected = await payFrom.evaluate((el) => el.options[el.selectedIndex].text);
  expect(await payFrom.inputValue() === "" && selected === "Choose an account", `closed paying account dropped (shows "${selected}")`);
  expect((await dDialog.innerText()).includes("The account these terms paid from is closed"), "dialog explains the dropped account");
  await dDialog.locator(".account-organiser-section").nth(1).screenshot({ path: `${OUT}/14-desktop-terms-closed-account.png` });
  await dDialog.getByRole("button", { name: "Cancel" }).click();

  // R-W4: Card B's paying account is deleted; the dialog says deleted
  const y = call("POST", "/v1/plans/local-plan/accounts", { account: { name: "Account Y", type: "checking", balance: 0 } }).data.account;
  call("PUT", `/v1/plans/local-plan/accounts/${ids.card_b}/card_payment_terms`, { card_payment_terms: { statement_day: 3, due_gap_days: 25, due_weekend_rule: "next", default_funding_account_id: y.id } });
  note(execSync(`python3 ${__dirname}/mark-deleted.py ${y.id}`).toString().trim());
  await page.reload();
  await page.getByRole("button", { name: "Payment terms for Card B" }).click();
  const bDialog = page.getByRole("dialog", { name: "Payment reminders for Card B" });
  await bDialog.waitFor();
  expect(await field(bDialog, "Pay from").inputValue() === "" && (await bDialog.innerText()).includes("The account these terms paid from is deleted"), "deleted paying account: dialog says deleted");
  await bDialog.locator(".account-organiser-section").nth(1).screenshot({ path: `${OUT}/14b-desktop-terms-deleted-account.png` });
  await bDialog.getByRole("button", { name: "Cancel" }).click();

  // Phone width view of the states
  const phone2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: await context.storageState() });
  const p2 = await phone2.newPage();
  await p2.goto(`${state.web_url}/scheduled`);
  await p2.locator(".card-payment-row", { hasText: "Card D" }).getByText("Nothing owed now").waitFor();
  expect(await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, "no horizontal page scroll at 390px with all states");
  await p2.screenshot({ path: `${OUT}/15-phone-panel-states.png`, fullPage: true });

  fs.writeFileSync(`${OUT}/requests.json`, JSON.stringify(keys, null, 2));
  fs.writeFileSync(`${OUT}/browser-log.txt`, log.join("\n") + "\n");
  await browser.close();
})().catch((error) => { console.error(error); fs.writeFileSync(`${OUT}/browser-log.txt`, log.join("\n") + `\nERROR ${error.stack}\n`); process.exit(1); });
