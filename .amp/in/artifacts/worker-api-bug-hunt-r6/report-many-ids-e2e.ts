// A report filtered by many categories or accounts (the web filter's group
// toggle selects a whole group at once) must answer, not fail on D1's limit
// of 100 bound parameters per statement.
import { call, plan, run } from "../worker-api-bug-hunt-r3/common";

const account = (await call("POST", plan("/accounts"), { account: { name: `Many ids ${run}`, type: "checking" } })).json.data.account;
const group = (await call("POST", plan("/category_groups"), { category_group: { name: `Group ${run}` } })).json.data.category_group;
const categoryIds: string[] = [];
for (let index = 0; index < 120; index += 1) {
  const category = (await call("POST", plan("/categories"), { category: { name: `Cat ${run} ${index}`, category_group_id: group.id } })).json.data.category;
  categoryIds.push(category.id);
}
await call("POST", plan("/transactions"), { transaction: { account_id: account.id, date: "2026-09-10", amount: -2500, payee_name: `Shop ${run}`, category_id: categoryIds[0] } });
await call("POST", plan("/transactions"), { transaction: { account_id: account.id, date: "2026-09-11", amount: -1500, payee_name: `Shop ${run}`, category_id: categoryIds[119] } });
console.log("categories created:", categoryIds.length);

const query = `from=2026-09-01&to=2026-09-30&account_ids=${account.id}&category_ids=${categoryIds.join(",")}`;
for (const report of ["spending-breakdown", "income-vs-spending", "income-vs-spending-groups"]) {
  const response = await call("GET", `/api/reports/${report}?${query}`);
  const summary = report === "spending-breakdown" ? `total ${response.json.data?.total}`
    : report === "income-vs-spending" ? `spending ${response.json.data?.periods?.[0]?.spending}`
      : `spending ${response.json.data?.spending}`;
  console.log(`${report} with ${categoryIds.length} category ids:`, response.status, response.status === 200 ? summary : JSON.stringify(response.json).slice(0, 160));
}
const accountsQuery = `from=2026-09-01&to=2026-09-30&account_ids=${[account.id, ...Array.from({ length: 110 }, (_, index) => `acct-missing-${index}`)].join(",")}`;
for (const report of ["net-worth", "age-of-money", "spending-breakdown"]) {
  const response = await call("GET", `/api/reports/${report}?${accountsQuery}`);
  console.log(`${report} with 111 account ids:`, response.status, response.status === 200 ? "ok" : JSON.stringify(response.json).slice(0, 160));
}
