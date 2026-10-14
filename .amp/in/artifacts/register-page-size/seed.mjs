// Seeds 700 synthetic Everyday Account rows (Sep-Oct 2026) through the public batch endpoint.
// Usage: node seed.mjs <api_url> <api_token>
const [api, token] = process.argv.slice(2);
const headers = { authorization: `Bearer ${token}`, origin: api, "content-type": "application/json" };
let n = 0;
for (let batch = 0; batch < 7; batch++) {
  const transactions = Array.from({ length: 100 }, () => {
    n++;
    const date = new Date(Date.UTC(2026, 8, 1 + (n % 40))).toISOString().slice(0, 10);
    return { account_id: "acct-everyday", date, amount: -1000 * ((n % 50) + 1), payee_name: `Synthetic payee ${n}`, memo: `seed-${n}` };
  });
  const res = await fetch(`${api}/v1/plans/local-plan/transactions`, { method: "POST", headers, body: JSON.stringify({ transactions }) });
  console.log(batch, res.status, res.ok ? "" : await res.text());
}
