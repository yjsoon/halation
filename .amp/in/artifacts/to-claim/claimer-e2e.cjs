// E2E for the claims tool (yjsoon/this-claimer, branch claude/howmuch-claim-flag)
// against this branch's real HowMuch API: the disposable stack from
// `control-howmuch launch`, plus the claims tool's worker under `wrangler dev`
// pointed at it. Synthetic data only.
//   CLAIMER=/path/to/this-claimer node .amp/in/artifacts/to-claim/claimer-e2e.cjs
const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");

const state = JSON.parse(fs.readFileSync("/tmp/howmuch-verify/current/state.json", "utf8"));
const claimer = path.join(process.env.CLAIMER || "/home/user/this-claimer", "upload-app");
const plan = `/v1/plans/${state.plan_id}`;
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
const freePort = () => new Promise((resolve) => {
  const server = net.createServer();
  server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); });
});

(async () => {
  const account = (await api("GET", `${plan}/accounts`)).body.data.accounts.find((a) => !a.closed && a.type !== "otherAsset");
  const create = async (fields) => (await api("POST", `${plan}/transactions`, {
    transaction: { account_id: account.id, date: "2026-10-20", amount: -12340, approved: true, ...fields },
  })).body.data.transaction;
  const flagged = await create({ payee_name: "Example Taxi Co", memo: "Example taxi", claim_status: "to_claim" });
  const worded = await create({ payee_name: "Example Bistro", memo: "TODO: Example lunch" });
  const legacy = await create({ payee_name: "Example Conference", memo: "Example legacy" });
  // Rows stored before the field: the words still in the memo.
  const storeLegacyMemo = (id, memo) => execFileSync("bun", ["-e",
    `const { Database } = require("bun:sqlite"); new Database(process.argv[1]).query("UPDATE transactions SET memo = ?, claim_status = NULL WHERE id = ?").run(process.argv[2], process.argv[3]);`,
    state.db_path, memo, id]);
  storeLegacyMemo(legacy.id, "TODO: Example legacy");
  const checked = await create({ payee_name: "Example Hotel", memo: "seed" });
  storeLegacyMemo(checked.id, "TOCHECK TODO: Example hotel");
  const emptyWord = await create({ payee_name: "Example Kiosk", memo: "seed" });
  storeLegacyMemo(emptyWord.id, "TODO:");
  const checkedAfterTodo = await create({ payee_name: "Example Inn", memo: "seed" });
  storeLegacyMemo(checkedAfterTodo.id, "TODO: TOCHECK: Example inn");
  // An API client set the field alone, so the word stayed in the memo.
  const leftover = await create({ payee_name: "Example Ferry", memo: "Example ferry" });
  execFileSync("bun", ["-e",
    `const { Database } = require("bun:sqlite"); new Database(process.argv[1]).query("UPDATE transactions SET memo = ?, claim_status = 'to_claim' WHERE id = ?").run(process.argv[2], process.argv[3]);`,
    state.db_path, "TODO: Example ferry", leftover.id]);
  const prose = await create({ payee_name: "Example App Store", memo: "Todo list app" });
  const bare = await create({ payee_name: "Example Car Park", memo: null, claim_status: "to_claim" });
  const done = await create({ payee_name: "Example Stationer", memo: "CLAIMED - 2026-10-21: Example notebooks" });
  // Transfers: the pair holds one claim, and the tool lists the outflow side.
  const accounts = (await api("GET", `${plan}/accounts`)).body.data.accounts.filter((a) => !a.closed && !a.deleted);
  const other = accounts.find((a) => a.id !== account.id);
  const transferPayee = (await api("GET", `${plan}/payees`)).body.data.payees.find((p) => p.transfer_account_id === other.id);
  const transfer = async (memo) => {
    const out = await create({ payee_id: transferPayee.id, memo });
    return { out, into: (await api("GET", `${plan}/transactions/${out.transfer_transaction_id}`)).body.data.transaction };
  };
  const viaInflow = await transfer("Example card top-up");
  await api("PATCH", `${plan}/transactions/${viaInflow.into.id}`, { transaction: { claim_status: "to_claim" } });
  // A transfer made from a split line: the linked side owns its claim.
  const category = (await api("GET", `${plan}/categories`)).body.data.category_groups.flatMap((g) => g.categories).find((c) => !c.hidden && !c.deleted);
  const split = await create({ payee_name: "Example Bank", amount: -30000, category_id: null, subtransactions: [
    { amount: -20000, payee_id: transferPayee.id, memo: "Example savings" },
    { amount: -10000, category_id: category.id, memo: "Example fee" },
  ] });
  const splitLine = split.subtransactions.find((line) => line.transfer_account_id === other.id);
  const linked = (await api("GET", `${plan}/transactions/${splitLine.transfer_transaction_id}`)).body.data.transaction;
  await api("PATCH", `${plan}/transactions/${linked.id}`, { transaction: { claim_status: "to_claim" } });
  check("seeded rows as HowMuch stores them",
    worded.claim_status === "to_claim" && worded.memo === "Example lunch" && done.claim_status === "claimed" && prose.claim_status === null);

  const port = await freePort();
  const workerUrl = `http://127.0.0.1:${port}`;
  const wrangler = spawn(process.execPath, [
    "node_modules/wrangler/bin/wrangler.js", "dev", "--local", "--port", String(port),
    "--persist-to", fs.mkdtempSync(path.join(os.tmpdir(), "claimer-e2e-")),
    "--var", "AUTH_PASSWORD:test-auth",
    "--var", `HOWMUCH_PAT:${state.api_token}`,
    "--var", `HOWMUCH_PLAN_ID:${state.plan_id}`,
    "--var", `HOWMUCH_API_URL:${state.api_url}/v1`,
  ], { cwd: claimer, stdio: ["ignore", "pipe", "pipe"] });
  try {
    for (let i = 0; ; i++) {
      try { if ((await fetch(`${workerUrl}/list?limit=1`, { headers: { "X-Auth-Token": "test-auth" } })).ok) break; } catch {}
      if (i > 300) throw new Error("wrangler did not start");
      await new Promise((r) => setTimeout(r, 200));
    }
    const todos = (await (await fetch(`${workerUrl}/ynab/todos?backend=howmuch&since_date=2026-10-01`, { headers: { "X-Auth-Token": "test-auth" } })).json()).todos;
    const byId = new Map(todos.map((t) => [t.id, t]));
    check("flagged row is listed with its memo as the description", byId.get(flagged.id)?.description === "Example taxi", byId.get(flagged.id)?.description);
    check("row an older client wrote as TODO is listed", byId.get(worded.id)?.description === "Example lunch");
    check("legacy TODO memo still listed", byId.get(legacy.id)?.description === "Example legacy");
    check("a memo starting with Todo is still read as a claim, as the tool always did", byId.get(prose.id)?.description === "list app");
    check("a flagged row is marked as held in the field; a TODO-word row is not", byId.get(flagged.id)?.claimFlagged === true && byId.get(legacy.id)?.claimFlagged === undefined);
    check("a flagged row with no memo is listed as Claim", byId.get(bare.id)?.description === "Claim");
    check("claimed row is not listed", !byId.has(done.id));
    check("a TOCHECK TODO row is listed as an estimate", byId.get(checked.id)?.description === "Example hotel" && byId.get(checked.id)?.needsConfirmation === true, JSON.stringify(byId.get(checked.id)));
    check("a bare TODO: row is listed as Claim", byId.get(emptyWord.id)?.description === "Claim");
    check("a TOCHECK word after TODO also marks the claim an estimate", byId.get(checkedAfterTodo.id)?.description === "Example inn" && byId.get(checkedAfterTodo.id)?.needsConfirmation === true);
    check("a flagged row's leftover word is not in its description", byId.get(leftover.id)?.description === "Example ferry" && byId.get(leftover.id)?.claimFlagged === true);
    check("the linked side of a split-line transfer is listed", byId.get(linked.id)?.claimFlagged === true, `linked amount ${linked.amount}`);
    check("transfer marked on its inflow side is listed once, as the outflow", byId.has(viaInflow.out.id) && !byId.has(viaInflow.into.id));

    const claimedDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
    const line = (todo) => ({
      receiptKey: `e2e/${todo.id}.pdf`, ynabClaimId: todo.id, claimSource: "transaction", claimDescription: todo.description,
      claimFlagged: todo.claimFlagged, claimToCheckWord: todo.claimToCheckWord, claimsBackend: "howmuch", date: todo.date, description: todo.description, accountCode: "463", taxType: "NRINPUT", amount: todo.amount,
    });
    const marked = await (await fetch(`${workerUrl}/xero/invoices/mark-claimed`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Auth-Token": "test-auth" },
      body: JSON.stringify({ invoiceID: "invoice-e2e", backend: "howmuch", lineItems: [flagged, legacy, viaInflow.out, bare, checked, emptyWord].map((row) => line(byId.get(row.id))) }),
    })).json();
    check("mark claimed reports all six claimed", JSON.stringify(marked.claimedYnab) === JSON.stringify([flagged.id, legacy.id, viaInflow.out.id, bare.id, checked.id, emptyWord.id].map((id) => ({ id, status: "claimed" }))), JSON.stringify(marked.claimedYnab));
    const after = async (id) => (await api("GET", `${plan}/transactions/${id}`)).body.data.transaction;
    const a = await after(flagged.id);
    const b = await after(legacy.id);
    check("flagged row is stored claimed, memo kept", a.claim_status === "claimed" && a.claimed_on === claimedDate && a.memo === "Example taxi", JSON.stringify([a.memo, a.claim_status, a.claimed_on]));
    check("legacy row is stored claimed, word gone", b.claim_status === "claimed" && b.claimed_on === claimedDate && b.memo === "Example legacy", JSON.stringify([b.memo, b.claim_status, b.claimed_on]));
    const bareAfter = await after(bare.id);
    check("a flagged row with no memo keeps no memo", bareAfter.claim_status === "claimed" && bareAfter.memo === null, JSON.stringify([bareAfter.memo, bareAfter.claim_status]));
    const checkedAfter = await after(checked.id);
    check("a TOCHECK TODO row is stored claimed and still To confirm", checkedAfter.claim_status === "claimed" && checkedAfter.needs_confirmation === true && checkedAfter.memo === "Example hotel", JSON.stringify([checkedAfter.memo, checkedAfter.claim_status, checkedAfter.needs_confirmation]));
    const emptyAfter = await after(emptyWord.id);
    check("a bare TODO: row is stored claimed with no memo, not the placeholder", emptyAfter.claim_status === "claimed" && emptyAfter.memo === null, JSON.stringify([emptyAfter.memo, emptyAfter.claim_status]));
    const inflow = await after(viaInflow.into.id);
    check("claiming the outflow side claims the inflow side too", inflow.claim_status === "claimed" && inflow.claimed_on === claimedDate && inflow.memo === "Example card top-up", JSON.stringify([inflow.memo, inflow.claim_status, inflow.claimed_on]));
    const again = (await (await fetch(`${workerUrl}/ynab/todos?backend=howmuch&since_date=2026-10-01`, { headers: { "X-Auth-Token": "test-auth" } })).json()).todos;
    check("claimed rows drop off the list", !again.some((t) => t.id === flagged.id || t.id === legacy.id) && again.some((t) => t.id === worded.id));
  } finally {
    wrangler.kill("SIGTERM");
  }
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(2); });
