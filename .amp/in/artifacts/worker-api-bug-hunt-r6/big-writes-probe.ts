// Discovery probe: the largest writes each route allows, on local D1.
import { call, plan, run } from "../worker-api-bug-hunt-r3/common";

const account = (await call("POST", plan("/accounts"), { account: { name: `Big ${run}`, type: "checking" } })).json.data.account;
const other = (await call("POST", plan("/accounts"), { account: { name: `Big other ${run}`, type: "savings" } })).json.data.account;
const group = (await call("POST", plan("/category_groups"), { category_group: { name: `Big group ${run}` } })).json.data.category_group;
const category = (await call("POST", plan("/categories"), { category: { name: `Big cat ${run}`, category_group_id: group.id } })).json.data.category;

const many = Array.from({ length: 100 }, (_, index) => ({ account_id: account.id, date: "2026-09-12", amount: -(index + 1) * 10, payee_name: `Big payee ${run} ${index}`, category_id: category.id, import_id: `big-${run}-${index}` }));
const created = await call("POST", plan("/transactions"), { transactions: many });
console.log("POST 100 transactions:", created.status, JSON.stringify(created.json).slice(0, 160));
const ids: string[] = (created.json.data?.transaction_ids ?? created.json.data?.transactions?.map((t: any) => t.id) ?? []);
console.log("ids", ids.length);
const patched = await call("PATCH", plan("/transactions"), { transactions: ids.map((id) => ({ id, memo: `bulk ${run}`, flag_color: "red" })) });
console.log("PATCH 100 transactions:", patched.status, JSON.stringify(patched.json).slice(0, 160));
const cleared = await call("POST", plan("/transactions/cleared"), { transactions: ids.map((id) => ({ id, expected_cleared: "uncleared", cleared: "cleared" })) });
console.log("cleared 100:", cleared.status, JSON.stringify(cleared.json).slice(0, 160));
const imported = await call("POST", plan("/transactions/import"), { transactions: Array.from({ length: 300 }, (_, index) => ({ account_id: account.id, date: "2026-09-13", amount: -index - 1, payee_name: `Imp ${run} ${index % 40}`, import_id: `imp-${run}-${index}` })) });
console.log("import 300:", imported.status, JSON.stringify(imported.json).slice(0, 160));
const subs = Array.from({ length: 60 }, (_, index) => ({ amount: -100, category_id: category.id, memo: `line ${index}` }));
const split = await call("POST", plan("/transactions"), { transaction: { account_id: account.id, date: "2026-09-14", amount: -6000, payee_name: `Split ${run}`, subtransactions: subs } });
console.log("split 60 lines:", split.status, JSON.stringify(split.json).slice(0, 120));
const transferSubs = Array.from({ length: 60 }, (_, index) => ({ amount: -100, transfer_account_id: other.id, memo: `t ${index}` }));
const tsplit = await call("POST", plan("/transactions"), { transaction: { account_id: account.id, date: "2026-09-14", amount: -6000, payee_name: `TSplit ${run}`, subtransactions: transferSubs } });
console.log("split 60 transfer lines:", tsplit.status, JSON.stringify(tsplit.json).slice(0, 120));
const deleted = await call("POST", plan("/transactions/delete"), { transactions: ids.map((id) => ({ id })) });
console.log("delete 100:", deleted.status, JSON.stringify(deleted.json).slice(0, 160));
const csv = await call("POST", `/api/import/csv`, { account_id: account.id, rows: Array.from({ length: 300 }, (_, index) => ({ date: "2026-09-15", amount: `-${index + 1}.00`, payee: `CSV ${run} ${index}`, memo: `m${index}` })) });
console.log("csv 300:", csv.status, JSON.stringify(csv.json).slice(0, 160));
const list = await call("GET", plan(`/accounts/${account.id}/transactions?limit=500`));
console.log("list limit 500:", list.status, list.json.data?.transactions?.length, list.json.data?.has_more);
