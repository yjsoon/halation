import { nativeHarness, BACKENDS } from "../../../../apps/api/tests/helpers/native-harness";
console.error = () => {};
for (const backend of BACKENDS) {
  const h = await nativeHarness(backend);
  const j = async (method: string, path: string, body?: unknown) => {
    const r = await h.request(path, { method, body, key: `k-${Math.random()}` });
    return { status: r.status, json: await r.json() as any };
  };
  await h.repo.createAccount("q", { id: "acc-q", name: "Q", type: "checking", balance: 0 });
  await j("POST", `/v1/plans/p/accounts`, { account: { id: "acc-p", name: "P", type: "checking", balance: 0 } });
  await h.repo.createTransaction("q", { id: "tx-q", account_id: "acc-q", date: "2026-09-01", amount: -1000, memo: "q's" } as any);
  for (const [label, path, body] of [
    ["single", `/v1/plans/p/transactions`, { transaction: { id: "tx-q", account_id: "acc-p", date: "2026-09-02", amount: -5, memo: "from p single" } }],
    ["bulk", `/v1/plans/p/transactions`, { transactions: [{ id: "tx-q", account_id: "acc-p", date: "2026-09-02", amount: -5, memo: "from p bulk" }] }],
    ["import", `/v1/plans/p/transactions/import`, { transactions: [{ id: "tx-q", account_id: "acc-p", date: "2026-09-02", amount: -7, memo: "from p import" }] }],
    ["account", `/v1/plans/p/accounts`, { account: { id: "acc-q", name: "hijack", type: "checking" } }],
  ] as const) {
    const r = await j("POST", path, body);
    console.log(backend, label, r.status, JSON.stringify(r.json).slice(0, 200));
    console.log(backend, "  tx-q row", JSON.stringify(h.db.query("SELECT id, plan_id, account_id, amount_milli, memo FROM transactions WHERE id='tx-q'").all()));
    console.log(backend, "  acc-q row", JSON.stringify(h.db.query("SELECT id, plan_id, name FROM accounts WHERE id='acc-q'").all()));
  }
  h.close();
}
