// POST /payees must answer a missing or blank name with 400 and create nothing.
import { call, plan, run } from "../worker-api-bug-hunt-r3/common";

const before = (await call("GET", plan("/payees"))).json.data.payees.length;
const missing = await call("POST", plan("/payees"), { payee: {} });
const blank = await call("POST", plan("/payees"), { payee: { name: "   " } });
const padded = await call("POST", plan("/payees"), { payee: { name: `  Landlord ${run}  ` } });
const after = (await call("GET", plan("/payees"))).json.data.payees.length;
console.log("missing name:", missing.status, missing.json?.error?.detail);
console.log("blank name:", blank.status, blank.json?.error?.detail);
console.log("padded name:", padded.status, JSON.stringify(padded.json?.data?.payee?.name));
console.log("payees added:", after - before);
console.log(missing.status === 400 && blank.status === 400 && padded.status === 201 && padded.json.data.payee.name === `Landlord ${run}` && after - before === 1 ? "PASS" : "FAIL");
