import { Database } from "bun:sqlite";
const [apiA, dbPath, apiB] = process.argv.slice(2);
const H = { Authorization: "Bearer tok", "Content-Type": "application/json" };
const call = async (method, path, body) => {
  const api = path.startsWith("/v1/plans/plan-b") ? apiB : apiA;
  const r = await fetch(api + path, { method, headers: { ...H, "Idempotency-Key": crypto.randomUUID() }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
};
const out = [];
const log = (k, v) => { out.push(k + " " + JSON.stringify(v)); };
const A = "/v1/plans/plan-a", B = "/v1/plans/plan-b";
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o?.[k]]));
const acct = (r) => ({ status: r.status, ...(r.j?.data?.account ? pick(r.j.data.account, ["id", "name", "type", "on_budget", "balance", "cleared_balance", "opening_balance"]) : { err: r.j?.error?.message ?? r.j?.error }) });

// Cluster 1: account creation, colliding ids across plans
log("c1.a create no id with balance", acct(await call("POST", A + "/accounts", { account: { name: "Checking A", type: "checking", balance: 5000 } })));
log("c1.b create with id + balance (reseed)", acct(await call("POST", A + "/accounts", { account: { id: "acct-shared", name: "Shared", type: "checking", balance: 7000 } })));
log("c1.c same id other plan", acct(await call("POST", B + "/accounts", { account: { id: "acct-shared", name: "Hijack", type: "savings" } })));
log("c1.d reseed same id same plan", acct(await call("POST", A + "/accounts", { account: { id: "acct-shared", name: "Shared renamed", type: "checking" } })));
log("c1.e plan B own account", acct(await call("POST", B + "/accounts", { account: { id: "acct-b", name: "B Account", type: "checking", opening_balance: 1000 } })));
const tx = await call("POST", B + "/transactions", { transaction: { account_id: "acct-shared", date: "2026-10-01", amount: -1000, payee_name: "Hijack tx" } });
log("c1.f txn into other plan's account", { status: tx.status, err: tx.j?.error?.message ?? tx.j?.error });
log("c1.g plan A accounts", (await call("GET", A + "/accounts")).j?.data?.accounts?.map((a) => pick(a, ["name", "balance", "opening_balance"])).sort((x, y) => x.name.localeCompare(y.name)));

// Cluster 2: transfer payees per account, rename keeps label in step
const payees = async (p) => (await call("GET", p + "/payees")).j?.data?.payees?.filter((x) => x.name.startsWith("Transfer")).map((x) => x.name).sort();
log("c2.a transfer payees plan A", await payees(A));
await call("PATCH", A + "/accounts/acct-shared", { account: { name: "Renamed Shared" } });
log("c2.b after rename", await payees(A));
await call("POST", A + "/accounts", { account: { id: "acct-dupe1", name: "Twin", type: "checking" } });
await call("POST", A + "/accounts", { account: { id: "acct-dupe2", name: "Twin", type: "checking" } });
log("c2.c duplicate account names", await payees(A));
// Mid-import: account references a payee that does not exist yet
const dbh = new Database(dbPath);
dbh.run("INSERT INTO accounts (id, plan_id, name, external_ynab_id, transfer_payee_id) VALUES ('acct-mid','plan-a','Mid','acct-mid','payee-late')");
await call("POST", A + "/accounts", { account: { id: "acct-mid", name: "Mid", type: "checking", transfer_payee_id: "payee-late" } });
log("c2.d mid-import payee rows for acct-mid", dbh.query("SELECT count(*) c FROM payees WHERE transfer_account_id='acct-mid'").get());

// Cluster 3: transfers (transactions, splits, scheduled)
const t1 = await call("POST", A + "/transactions", { transaction: { id: "txn-x1", account_id: "acct-shared", date: "2026-10-02", amount: -20000, transfer_account_id: "acct-dupe1", cleared: "cleared", approved: true } });
log("c3.a transfer create", { status: t1.status });
const rows = () => dbh.query("SELECT id, account_id, amount_milli, cleared, approved, transfer_account_id, category_id, payee_name_snapshot FROM transactions WHERE plan_id='plan-a' AND (transfer_account_id IS NOT NULL) ORDER BY account_id, amount_milli").all().map((r) => ({ ...r, id: r.id.startsWith("txn-x") ? r.id : "<gen>" }));
log("c3.a rows", rows());
await call("PATCH", A + "/transactions/txn-x1", { transaction: { amount: -25000, memo: "edit" } });
log("c3.b after edit", rows());
const s = await call("POST", A + "/transactions", { transaction: { id: "txn-split", account_id: "acct-shared", date: "2026-10-03", amount: -30000, subtransactions: [{ amount: -10000, transfer_account_id: "acct-dupe2" }, { amount: -20000, memo: "plain" }] } });
log("c3.c split with transfer line", { status: s.status });
log("c3.c rows", rows());
await call("POST", A + "/accounts", { account: { id: "acct-cash", name: "Wallet", type: "cash" } });
const sch = await call("POST", A + "/scheduled_transactions", { scheduled_transaction: { account_id: "acct-shared", date_first: "2026-10-05", date_next: "2026-10-05", frequency: "never", amount: -4000, transfer_account_id: "acct-cash" } });
log("c3.d schedule create", { status: sch.status, err: sch.j?.error?.message });
const mat = await call("POST", A + "/scheduled_transactions/materialize", { through_date: "2026-10-31" });
log("c3.d materialize", { status: mat.status, err: mat.j?.error?.message });
log("c3.d rows to cash", rows().filter((r) => r.account_id === "acct-cash" || r.transfer_account_id === "acct-cash"));

// Cluster 4: search q and unapproved count
for (const [n, m, ap] of [["Coffee Shop", "latte", false], ["Bookstore", "novel", false], ["Coffee Beans", "bag", true]]) {
  await call("POST", A + "/transactions", { transaction: { account_id: "acct-shared", date: "2026-10-04", amount: -3500, payee_name: n, memo: m, approved: ap } });
}
const names = (r) => r.j?.data?.transactions?.map((t) => t.payee_name).filter(Boolean).sort();
log("c4.a q=coffee", names(await call("GET", A + "/transactions?q=coffee")));
log("c4.b q=coffee type=unapproved", names(await call("GET", A + "/transactions?q=coffee&type=unapproved")));
log("c4.c q=amount:-35", names(await call("GET", A + "/transactions?q=" + encodeURIComponent("-35"))));
log("c4.d unapproved_count", (await call("GET", A + "/transactions/unapproved_count")).j?.data);
log("c4.e unapproved_count q=coffee", (await call("GET", A + "/transactions/unapproved_count?q=coffee")).j?.data?.count);
log("c4.f unapproved_count last_knowledge=0", (await call("GET", A + "/transactions/unapproved_count?last_knowledge_of_server=0")).j?.data?.count);
log("c4.g account count", (await call("GET", A + "/accounts/acct-shared/transactions/unapproved_count")).j?.data?.count);
log("c4.h q + type=approved", names(await call("GET", A + "/transactions?q=coffee&type=approved")));
// Normalise server knowledge values (monotonic counters) out of the transcript
console.log(out.join("\n").replace(/acct_[0-9a-f-]{36}/g, "acct_<gen>").replace(/"server_knowledge":\d+/g, '"server_knowledge":N'));
