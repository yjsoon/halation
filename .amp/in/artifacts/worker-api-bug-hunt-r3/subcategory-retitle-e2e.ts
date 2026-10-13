// A rewards subcategory rename must restamp the flag names it gave existing
// transactions, as a colour-name rename already does.
import { call, plan, run } from "./common";

const account = (await call("POST", plan("/accounts"), { account: { name: `Retitle card ${run}`, type: "creditCard" } })).json.data.account;
const sub = (name: string) => ({ id: `s-red-${run}`, name, flagColor: "red", rewardValue: 4, priority: 0, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" });
const card = (await call("POST", "/api/rewards/cards", { card: { name: `Card ${run}`, ynabAccountId: account.id, type: "cashback", earningRate: 1, subcategoriesEnabled: true, subcategories: [sub("Dining")] } })).json.data.card;
const first = (await call("POST", plan("/transactions"), { transaction: { account_id: account.id, date: "2026-10-05", amount: -3000, flag_color: "red" } })).json.data.transaction;
console.log("stamped at create:", first.flag_name);
const patched = await call("PATCH", `/api/rewards/cards/${card.id}`, { card: { subcategories: [sub("Food")] } });
console.log("card PATCH status:", patched.status);
const reread = (await call("GET", plan(`/transactions/${first.id}`))).json.data.transaction;
console.log("existing row after rename:", reread.flag_name);
const second = (await call("POST", plan("/transactions"), { transaction: { account_id: account.id, date: "2026-10-06", amount: -2000, flag_color: "red" } })).json.data.transaction;
console.log("new row after rename:", second.flag_name);
const report = (await call("GET", `/api/reports/rewards?from=2026-10-01&to=2026-10-31&group=flag&account_ids=${account.id}`)).json.data;
console.log("rewards report flag groups:", JSON.stringify(report.groups.map((group: any) => ({ label: group.label, count: group.transaction_count }))));
console.log(reread.flag_name === "Food" && second.flag_name === "Food" ? "PASS" : "FAIL");
