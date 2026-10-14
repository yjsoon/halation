// E2E driver. Serves the real Worker request path (createHandler + D1 repository, D1 reports, D1 auth store)
// over HTTP on loopback, backed by a temp SQLite file carrying the D1 migrations (the repo's own fake D1 binding).
// Synthetic data only; no Cloudflare, no remote D1. Run from the repo root: bun .amp/in/artifacts/<cluster>/e2e.ts
import { Database } from "bun:sqlite";
import { D1AuthStore } from "../../../../apps/api/src/auth-store";
import { D1Database } from "../../../../apps/api/src/d1";
import { D1LedgerRepository } from "../../../../apps/api/src/d1-ledger-repository";
import { D1ReportService } from "../../../../apps/api/src/d1-reports";
import { createHandler } from "../../../../apps/api/src/http";
import { fakeD1Binding } from "../../../../apps/api/tests/helpers/counting-d1";

const PLAN = "p";
const TOKEN = "e2e-bootstrap-token";
const sql = new Database(":memory:", { strict: true });
const dir = new URL("../../../../apps/api/d1-migrations/", import.meta.url).pathname;
for (const f of [...new Bun.Glob("*.sql").scanSync({ cwd: dir, absolute: true })].sort()) sql.exec(await Bun.file(f).text());
sql.run("INSERT INTO plans (id, name) VALUES ('p','Plan')");
sql.run("INSERT INTO accounts (id, plan_id, name, opening_balance_milli) VALUES ('cash','p','Cash',100000)");
sql.run("INSERT INTO payees (id, plan_id, name) VALUES ('shop','p','Shop'),('employer','p','Employer')");
sql.run("INSERT INTO category_groups (id, plan_id, name) VALUES ('g','p','Everyday')");
sql.run("INSERT INTO categories (id, plan_id, category_group_id, name) VALUES ('c','p','g','Groceries')");

const binding = fakeD1Binding(sql);
const database = new D1Database(binding);
const config = { dbPath: "", port: 0, apiToken: TOKEN, defaultPlanId: PLAN, transitionReadOnly: false };
const handler = createHandler({ repo: new D1LedgerRepository(database, PLAN), reports: new D1ReportService(binding), auth: new D1AuthStore(database), config });
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler });
const base = `http://127.0.0.1:${server.port}`;

const results: string[] = [];
const check = (name: string, ok: boolean, detail = "") => { results.push(`${ok ? "PASS" : "FAIL"} ${name} ${detail}`); };
const call = async (method: string, path: string, body?: unknown, cookie?: string, bearer?: string) => {
  const r = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", origin: base, ...(cookie ? { cookie } : {}), ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, json: text ? JSON.parse(text) : null, setCookie: r.headers.get("set-cookie") };
};
const cacheRows = () => (sql.query("SELECT count(*) c FROM report_cache").get() as any).c as number;
try {
  const USER = "verifier", PW = "howmuch-verify-15", NEWPW = "howmuch-verify-new-16";
  const setup = await call("POST", "/api/auth/setup", { username: USER, password: PW }, undefined, TOKEN);
  check("setup", setup.status === 200, String(setup.status));
  const cookie = setup.setCookie!.split(";")[0];
  const tx = (id: string, date: string, amount: number, payee: string) =>
    call("POST", `/v1/plans/${PLAN}/transactions`, { transaction: { id, account_id: "cash", date, amount, payee_id: payee, category_id: "c" } }, cookie);
  check("seed income", (await tx("i1", "2026-01-05", 480000, "employer")).status === 201);
  check("seed spend", (await tx("s1", "2026-01-18", -32000, "shop")).status === 201);

  // Age-of-money cache behaviour.
  const A = `/api/reports/age-of-money?plan_id=${PLAN}&from=2026-01-01&to=2026-05-31`;
  const r1 = await call("GET", A, undefined, cookie);
  const r2 = await call("GET", A, undefined, cookie);
  check("aom 200, repeat identical", r1.status === 200 && JSON.stringify(r1.json) === JSON.stringify(r2.json), String(r1.status));
  check("aom unfiltered stores exactly one cache row", cacheRows() === 1, `rows=${cacheRows()}`);
  const g = await call("GET", `${A}&category_group_ids=g`, undefined, cookie);
  await call("GET", `${A}&category_group_ids=g`, undefined, cookie);
  check("aom group-filtered 200, never cached", g.status === 200 && cacheRows() === 1, `rows=${cacheRows()}`);
  check("aom group-filtered payload still computed", Array.isArray(g.json?.data?.periods));
  check("seed spend 2", (await tx("s2", "2026-05-20", -250000, "shop")).status === 201);
  const r3 = await call("GET", A, undefined, cookie);
  check("aom recomputed after ledger write", JSON.stringify(r3.json) !== JSON.stringify(r1.json) && cacheRows() === 1, `rows=${cacheRows()}`);

  // Password-change rate limit is separate from the sign-in counters.
  for (let i = 0; i < 12; i++) await call("POST", "/api/auth/login", { username: USER, password: "wrong-wrong-wrong-1" });
  const locked = await call("POST", "/api/auth/login", { username: USER, password: PW });
  check("anonymous failures lock sign-in (429)", locked.status === 429, String(locked.status));
  const codes: number[] = [];
  for (let i = 0; i < 11; i++) codes.push((await call("POST", "/api/auth/password", { current_password: "nope-nope-nope-nope", new_password: NEWPW }, cookie)).status);
  check("pwchange: ten 401 then 429 despite locked sign-in", codes.slice(0, 10).every((c) => c === 401) && codes[10] === 429, codes.join(","));
  const rows = sql.query("SELECT scope, attempts FROM login_rate_limits ORDER BY scope, attempts").all();
  check("three separate rate rows (pwchange, ip, username)", rows.length === 3, JSON.stringify(rows));
} finally {
  server.stop(true);
}
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
