// Reads an account id that does not exist on the local Worker, then lists
// accounts and payees to check that the read created nothing.
// Usage: bun ghost-account-e2e.ts <tag>
const base = process.env.E2E_BASE ?? "http://127.0.0.1:8799";
const plan = "80bc6db0-d926-4635-a37a-1ba0787c4c4e";
const headers = { authorization: "Bearer local-e2e-token" };
const tag = process.argv[2] ?? "run";
const ghost = `ghost-${tag}-account`;

const read = await fetch(`${base}/v1/plans/${plan}/accounts/${ghost}`, { headers });
const body = await read.json() as any;
console.log("GET missing account", read.status, body.data?.account?.name ?? body.error?.detail);

const accounts = (await (await fetch(`${base}/v1/plans/${plan}/accounts`, { headers })).json() as any).data.accounts;
console.log("account row created", accounts.some((account: any) => account.id === ghost));
const payees = (await (await fetch(`${base}/v1/plans/${plan}/payees`, { headers })).json() as any).data.payees;
console.log("transfer payee created", payees.some((payee: any) => payee.transfer_account_id === ghost));
