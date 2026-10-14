import { nativeHarness, BACKENDS } from "../../../../apps/api/tests/helpers/native-harness";

const BAD: unknown[] = [{}, [], { a: 1 }, [1], 1.5, -7, 1e20, true, false, null, "", "x", "2026-13-45"];
const origError = console.error;
console.error = () => {};

type Case = { method: string; path: string | (() => string); body: any; key?: boolean };

for (const backend of BACKENDS) {
  const h = await nativeHarness(backend);
  let n = 0;
  const req = async (method: string, path: string, body?: unknown, key?: boolean) => {
    const r = await h.request(path, { method, body, key: key ? `fuzzkey-${++n}-xxxxxx` : undefined });
    const text = await r.text();
    return { status: r.status, text };
  };
  const j = async (method: string, path: string, body?: unknown, key?: boolean) => {
    const r = await req(method, path, body, key);
    try { return { status: r.status, json: JSON.parse(r.text) }; } catch { return { status: r.status, json: r.text }; }
  };
  const P = "/v1/plans/p";
  const checking = (await j("POST", `${P}/accounts`, { account: { name: "Chk", type: "checking", balance: 100000 } })).json.data.account;
  const card = (await j("POST", `${P}/accounts`, { account: { name: "Card", type: "creditCard" } })).json.data.account;
  const payee = (await j("POST", `${P}/payees`, { payee: { name: "Shop" } })).json.data.payee;
  const group = (await j("POST", `${P}/category_groups`, { category_group: { name: "G" } })).json.data.category_group;
  const cat = (await j("POST", `${P}/categories`, { category: { name: "C", category_group_id: group.id } })).json.data.category;
  const tx = (await j("POST", `${P}/transactions`, { transaction: { account_id: checking.id, date: "2026-09-01", amount: -1000, payee_id: payee.id, category_id: cat.id } })).json.data.transaction;
  const sched = (await j("POST", `${P}/scheduled_transactions`, { scheduled_transaction: { account_id: checking.id, date_first: "2026-09-01", frequency: "monthly", amount: -1000, payee_id: payee.id, category_id: cat.id } }));
  const schedId = sched.json.data?.scheduled_transaction?.id;
  const rc = await j("POST", `/api/rewards/cards`, { card: { id: "card-1", name: "Card", ynabAccountId: card.id } });
  if (!checking || !tx || !schedId || rc.status !== 201) { console.log("fixture failed", backend, JSON.stringify(sched), JSON.stringify(rc)); }

  const cases: Case[] = [
    { method: "POST", path: `${P}/accounts`, body: { account: { name: "N", type: "checking", balance: 0, note: "n", icon: "x" } } },
    { method: "PATCH", path: `${P}/accounts/${checking.id}`, body: { account: { name: "Chk2", icon: "bank", type: "checking" } } },
    { method: "POST", path: `${P}/accounts/${checking.id}/reconcile`, body: { statement_date: "2026-09-30", statement_balance: 99000 }, key: true },
    { method: "POST", path: `${P}/category_groups`, body: { category_group: { name: "G2", hidden: false } } },
    { method: "PATCH", path: `${P}/category_groups/${group.id}`, body: { category_group: { name: "G3", hidden: false } } },
    { method: "POST", path: `${P}/categories`, body: { category: { name: "C2", category_group_id: group.id, hidden: false } } },
    { method: "PATCH", path: `${P}/categories/${cat.id}`, body: { category: { name: "C3", category_group_id: group.id } } },
    { method: "POST", path: `${P}/payees`, body: { payee: { name: "P2" } } },
    { method: "POST", path: `${P}/scheduled_transactions`, body: { scheduled_transaction: { account_id: checking.id, date_first: "2026-09-02", date_next: "2026-09-02", frequency: "weekly", amount: -500, payee_id: payee.id, payee_name: "Shop", category_id: cat.id, memo: "m", flag_color: "red", transfer_account_id: null, subtransactions: [{ amount: -200, category_id: cat.id, memo: "a", payee_id: payee.id }, { amount: -300, category_id: cat.id }] } } },
    { method: "PATCH", path: `${P}/scheduled_transactions/${schedId}`, body: { scheduled_transaction: { date_first: "2026-09-03", frequency: "monthly", amount: -600, payee_id: payee.id, category_id: cat.id, memo: "m2", flag_color: "blue", account_id: checking.id, subtransactions: [{ amount: -600, category_id: cat.id }] } } },
    { method: "POST", path: `${P}/scheduled_transactions/materialize`, body: { through_date: "2026-08-01", maximum: 5 }, key: true },
    { method: "POST", path: `${P}/scheduled_transactions/${schedId}/materialize`, body: { occurrence_date: "2026-12-01", date: "2026-12-01" }, key: true },
    { method: "POST", path: `${P}/transactions`, body: { transaction: { account_id: checking.id, date: "2026-09-05", amount: -700, payee_name: "New payee", category_id: cat.id, memo: "x", flag_color: "red", cleared: "cleared", approved: true, import_id: null, subtransactions: [{ amount: -700, category_id: cat.id, payee_name: "Sub", memo: "s" }] } } },
    { method: "POST", path: `${P}/transactions/import`, body: { transactions: [{ account_id: checking.id, date: "2026-09-06", amount: -800, payee_name: "Imp", import_id: "imp-1", memo: "m", category_id: cat.id, cleared: "cleared", flag_color: "red", subtransactions: [] }] } },
    { method: "PATCH", path: `${P}/transactions/${tx.id}`, body: { transaction: { memo: "edited", amount: -1100, date: "2026-09-02", payee_id: payee.id, category_id: cat.id, flag_color: "red", account_id: checking.id, approved: true, cleared: "cleared" } } },
    { method: "PATCH", path: `${P}/transactions/${tx.id}/cleared`, body: { expected_cleared: "cleared", cleared: "uncleared" } },
    { method: "PATCH", path: `/api/plans/p/settings`, body: { currency_format: { iso_code: "SGD", example_format: "123,456.78", decimal_digits: 2, decimal_separator: ".", symbol_first: true, group_separator: ",", currency_symbol: "$", display_symbol: true }, date_format: { format: "DD/MM/YYYY" } } },
    { method: "POST", path: `/api/tools/categorise`, body: { items: [{ id: "a", payee_name: "Shop", amount: -1000, memo: "x", account_id: checking.id, date: "2026-09-01" }], exclude_category_ids: [] } },
    { method: "POST", path: `/api/mobile/quick-entry`, body: { client_id: "qe-1", account_id: checking.id, amount: "12.34", payee_name: "Cafe", category_id: cat.id, memo: "m", date: "2026-09-07", flag_color: "red", subtransactions: [{ amount: "12.34", category_id: cat.id, payee_name: "x", memo: "y" }] } },
    { method: "POST", path: `/api/import/csv`, body: { account_id: checking.id, rows: [{ date: "2026-09-08", amount: "-5.00", payee: "CSV", memo: "m", category: "C", flag_color: "red" }] } },
    { method: "POST", path: `/api/rewards/cards`, body: { card: { id: "card-x", name: "X", ynabAccountId: card.id, flagNames: { red: "Dining" }, rules: [], tiers: [] } } },
    { method: "PATCH", path: `/api/rewards/cards/card-1`, body: { card: { name: "Y", flagNames: { red: "Food" } } } },
    { method: "PATCH", path: `/api/rewards/settings`, body: { settings: { a: 1 } } },
    { method: "PUT", path: `/api/rewards/accounts/${card.id}/config`, body: { payload: { name: "Z" } } },
    { method: "POST", path: `/api/import/rewards-tracker`, body: { payload: { cards: [], version: 1 } } },
  ];

  const seen = new Set<string>();
  const report = (c: Case, label: string, r: { status: number; text: string }) => {
    if (r.status >= 500) {
      const k = `${c.method} ${String(c.path).replace(/[0-9a-f-]{36}/g, ":id")} ${label}`;
      if (!seen.has(k)) { seen.add(k); console.log(`[${backend}] 500 ${k}`); }
    }
  };

  const mutate = (body: any, pathKeys: (string | number)[], value: unknown) => {
    const copy = structuredClone(body);
    let target = copy;
    for (const k of pathKeys.slice(0, -1)) target = target[k];
    target[pathKeys[pathKeys.length - 1]] = value;
    return copy;
  };
  const leafPaths = (value: any, prefix: (string | number)[] = []): (string | number)[][] => {
    const out: (string | number)[][] = [];
    if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        const key = Array.isArray(value) ? Number(k) : k;
        out.push([...prefix, key]);
        out.push(...leafPaths(v, [...prefix, key]));
      }
    }
    return out;
  };

  for (const c of cases) {
    const path = typeof c.path === "function" ? c.path() : c.path;
    const base = await req(c.method, path, c.body, c.key);
    if (base.status >= 400) console.log(`[${backend}] baseline ${c.method} ${path} -> ${base.status} ${base.text.slice(0, 200)}`);
    report(c, "baseline", base);
    for (const whole of [null, [], "x", 5, true]) report(c, `body=${JSON.stringify(whole)}`, await req(c.method, path, whole, c.key));
    for (const p of leafPaths(c.body)) {
      for (const bad of BAD) {
        const r = await req(c.method, path, mutate(c.body, p, bad), c.key);
        report(c, `${p.join(".")}=${JSON.stringify(bad)}`, r);
      }
    }
  }
  h.close();
}
console.error = origError;
