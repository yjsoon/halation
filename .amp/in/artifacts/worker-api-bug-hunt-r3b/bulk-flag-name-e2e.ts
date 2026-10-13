// A flag set or changed through the bulk transaction routes must carry the
// card's name for that colour, as a single create or edit does.
import { call, plan, run } from "../worker-api-bug-hunt-r3/common";

const account = (await call("POST", plan("/accounts"), { account: { name: `Bulk flag card ${run}`, type: "creditCard" } })).json.data.account;
await call("POST", "/api/rewards/cards", { card: { name: `Card ${run}`, ynabAccountId: account.id, type: "cashback", earningRate: 1, flagNames: { red: "Dining", blue: "Travel" } } });
const single = (await call("POST", plan("/transactions"), { transaction: { account_id: account.id, date: "2026-10-05", amount: -3000, flag_color: "red" } })).json.data.transaction;
console.log("single create red:", single.flag_name);
const bulk = (await call("POST", plan("/transactions"), { transactions: [{ account_id: account.id, date: "2026-10-06", amount: -2000, flag_color: "red", import_id: `imp-${run}` }] })).json.data.transactions[0];
console.log("bulk create red:", bulk.flag_name);
const patched = await call("PATCH", plan("/transactions"), { transactions: [{ id: single.id, flag_color: "blue" }, { import_id: `imp-${run}`, flag_color: "blue" }] });
console.log("bulk PATCH status:", patched.status);
const names = patched.json.data.transactions.map((t: any) => `${t.flag_color}:${t.flag_name}`);
console.log("after bulk recolour:", JSON.stringify(names));
const report = (await call("GET", `/api/reports/rewards?from=2026-10-01&to=2026-10-31&group=flag&account_ids=${account.id}`)).json.data;
const groups = report.groups.map((group: any) => ({ label: group.label, count: group.transaction_count }));
console.log("rewards report flag groups:", JSON.stringify(groups));
console.log(bulk.flag_name === "Dining" && names.every((n: string) => n === "blue:Travel") && groups.length === 1 && groups[0].label === "Travel" ? "PASS" : "FAIL");
