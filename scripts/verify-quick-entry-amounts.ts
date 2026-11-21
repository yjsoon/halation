// Real keyboard -> /add -> Worker -> local D1 regression for #377.
// Requires agent-browser and an isolated, seeded verify-howmuch stack with
// owner verifier / howmuch-verify-15 and the default SGD plan (local-plan).
// HOWMUCH_WEB_URL=http://127.0.0.1:PORT CHROME=/path/to/chrome-headless-shell \
//   bun scripts/verify-quick-entry-amounts.ts
import assert from "node:assert/strict";

const web = new URL(process.env.HOWMUCH_WEB_URL ?? "http://127.0.0.1:5173");
assert(web.protocol === "http:" && web.hostname === "127.0.0.1", "Use an isolated local stack only");
const session = `amount-${process.pid}`;
const run = `quick-entry-377-${crypto.randomUUID()}`;
const failures: string[] = [];

function browser(...args: string[]): any {
  const result = Bun.spawnSync(["agent-browser", "--session", session, "--json", ...args], {
    stdout: "pipe", stderr: "pipe",
  });
  const output = result.stdout.toString();
  assert.equal(result.exitCode, 0, output || result.stderr.toString());
  const response = JSON.parse(output);
  assert(response.success, JSON.stringify(response.error));
  return response.data;
}

function evaluate(script: string): any {
  return browser("eval", script).result;
}

function typeAmount(selector: string, text: string): void {
  browser("fill", selector, "");
  browser("focus", selector);
  // Do not set .value or fill a number input with a comma: those bypass the
  // real keystroke sanitisation that caused the silent 100x overstatement.
  browser("keyboard", "type", text);
}

function openEntry(): void {
  browser("open", `${web.origin}/add?account=acct-everyday`);
  browser("wait", 'input[name="amount"]');
  assert.equal(evaluate('document.querySelector("button[type=submit]").disabled'), true);
}

try {
  browser(...(process.env.CHROME ? ["--executable-path", process.env.CHROME] : []),
    "--allowed-domains", "127.0.0.1", "open", `${web.origin}/add`);
  browser("wait", 'input[autocomplete="username"]');
  browser("find", "label", "Username", "fill", "verifier");
  browser("find", "label", "Password", "fill", "howmuch-verify-15");
  browser("find", "role", "button", "click", "--name", "Sign in");
  browser("wait", 'input[name="amount"]');

  const cases = [
    { label: "comma decimal", text: "1,50", expected: -1500 },
    { label: "shrunk comma decimal", text: "0,50", expected: -500 },
    { label: "dot decimal control", text: "6.80", expected: -6800 },
    { label: "comma split", text: "2,75", expected: -2750, lines: ["1,50", "1,25"] },
  ];
  for (const example of cases) {
    openEntry();
    typeAmount('input[name="amount"]', example.text);
    browser("fill", 'input[name="payee"]', example.label === "dot decimal control" ? "Toast Box Verify" : "Decimal Verify");
    const memo = `${run} ${example.label}`;
    browser("fill", 'input[name="memo"]', memo);
    if (example.lines) {
      browser("find", "role", "button", "click", "--name", "+ Split categories", "--exact");
      example.lines.forEach((text, index) => typeAmount(`[aria-label="Split line ${index + 1} amount"]`, text));
    }
    browser("find", "role", "button", "click", "--name", "Save spend", "--exact");
    browser("wait", "--text", "Saved.");
    // A fresh GET, not the quick-entry response or the success toast, proves
    // the amount that actually reached the ledger.
    const rows = evaluate(`(async () => {
      const response = await fetch('/v1/plans/local-plan/transactions');
      if (!response.ok) throw new Error('Ledger read failed: ' + response.status);
      return (await response.json()).data.transactions.filter(t => t.memo === ${JSON.stringify(memo)});
    })()`);
    try {
      assert.equal(rows.length, 1, "Exactly one transaction should be stored");
      assert.equal(rows[0].account_id, "acct-everyday");
      assert.equal(rows[0].amount, example.expected, example.label);
      if (example.lines) {
        assert.deepEqual(rows[0].subtransactions.map((line: { amount: number }) => line.amount).sort((a: number, b: number) => a - b), [-1500, -1250]);
      }
      console.log(`PASS ${example.label}: ${JSON.stringify(rows.map(({ id, amount, subtransactions }: any) => ({ id, amount, splits: subtransactions.map((line: any) => line.amount) })))}`);
    } catch (error) {
      failures.push(String(error));
      console.error(`FAIL ${example.label}: persisted ${JSON.stringify(rows)}`);
    }
  }

  openEntry();
  for (const text of ["0", "-1.50", "1.234", "1,2,3", "1e2", "not a number"]) {
    typeAmount('input[name="amount"]', text);
    assert.equal(evaluate('document.querySelector("button[type=submit]").disabled'), true, `${JSON.stringify(text)} must not save`);
  }
  console.log("PASS zero, negative, excess precision, malformed separators, exponent and non-numeric amounts cannot save");
  assert.deepEqual(failures, [], "Quick-entry amount regressions");
} finally {
  browser("close");
}
