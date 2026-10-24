// One-off conversion of follow-up memo words into the stored fields:
// `TODO:` becomes claim_status "to_claim", `CLAIMED - day:` becomes "claimed"
// with claimed_on, and `TOCHECK` becomes needs_confirmation. It reads the words
// exactly as the API does (apps/api/src/transaction-claim.ts) and applies them by
// writing each memo back unchanged through the API, which moves the words into
// the fields and bumps server_knowledge so every client syncs the change.
//
// Dry run (the default) changes nothing and prints what it would do:
//   HOWMUCH_TOKEN=... bun scripts/convert-follow-up-memos.ts --api-url https://example.test --plan <plan id>
// Apply, after reviewing the dry run and taking a backup (scripts/backup-d1.sh):
//   HOWMUCH_TOKEN=... bun scripts/convert-follow-up-memos.ts --api-url ... --plan ... --apply
// `--out <file>` also writes the report as JSON. The report holds real memos:
// keep it under the gitignored data/ folder and never commit or share it.
//
// The server must already have migration 0023 and the Worker that turns memo
// words into fields; --apply refuses otherwise. Split-line memos keep their words
// (lines have no fields), and so does the other side of a transfer made from a
// split line, whose memo the line owns. Rows the old, looser claims-tool rule
// read as claims but the API does not (such as "Todo list app") are listed,
// never changed. --apply skips a row edited since the dry run, but an edit
// landing in the moment between that check and the write would be overwritten,
// so run it while nobody is editing.
import { writeFileSync } from "node:fs";
import { followUpWords } from "../apps/api/src/transaction-claim";

type Row = {
  id: string;
  date: string;
  amount: number;
  memo: string | null;
  payee_name: string | null;
  account_name: string | null;
  deleted: boolean;
  approved?: boolean;
  needs_confirmation?: boolean;
  transfer_transaction_id?: string | null;
  claim_status?: "to_claim" | "claimed" | null;
  claimed_on?: string | null;
  subtransactions?: Array<{ id: string; memo: string | null }>;
};

type Planned = {
  id: string;
  date: string;
  payee: string;
  amount: number;
  memo: string;
  /** The other side of a transfer: it holds the same memo and takes the same claim. */
  partner?: string;
  after: {
    memo: string | null;
    claim_status: string | null;
    claimed_on: string | null;
    needs_confirmation: boolean;
    partner_needs_confirmation?: boolean;
  };
};

const LOOSE = /^(?:TODO[:\s]|\s*CLAIMED\b|\s*TOCHECK\b)/i;

const options = parseArgs(process.argv.slice(2));
const token = process.env.HOWMUCH_TOKEN;
if (!options.apiUrl || !options.plan || !token) {
  console.error("Usage: HOWMUCH_TOKEN=... bun scripts/convert-follow-up-memos.ts --api-url <url> --plan <plan id> [--apply] [--out data/<file>.json]");
  process.exit(2);
}
const base = `${options.apiUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1/plans/${encodeURIComponent(options.plan)}`;

const first = await loadAll();
const report = plan(first.rows);
print(report, first.hasField);
if (options.out) {
  writeFileSync(options.out, `${JSON.stringify({ server_knowledge: first.knowledge, ...report }, null, 2)}\n`);
  console.log(`\nReport written to ${options.out} (real data: keep it out of git).`);
}

if (!options.apply) {
  console.log("\nDry run: nothing was changed. Re-run with --apply to convert the rows listed under \"Will convert\".");
  process.exit(0);
}
if (!first.hasField) {
  console.error("\nRefusing to apply: this server does not return claim_status yet (apply migration 0023 and deploy the Worker first).");
  process.exit(1);
}

// Re-read just before writing, and convert only rows whose memo (and their
// transfer partner's) is still the one in the dry run. An edit landing between
// this check and the write is still overwritten, so run this while nobody edits.
const fresh = await loadAll();
const current = new Map(fresh.rows.map((row) => [row.id, row]));
const unchanged = (id: string, memo: string) => {
  const row = current.get(id);
  return Boolean(row && !row.deleted && row.memo === memo && (row.claim_status ?? null) === null);
};
const todo = report.convert.filter((item) => unchanged(item.id, item.memo) && (!item.partner || unchanged(item.partner, item.memo)));
const skipped = report.convert.length - todo.length;
// One row per write: the collection PATCH is not atomic on D1, so a row the
// server refuses must not hide which of its neighbours were converted.
let converted = 0;
const mismatched: string[] = [];
const refused: string[] = [];
const matches = (row: Row | undefined, item: Planned, needsConfirmation: boolean) => Boolean(row
  && (row.memo ?? null) === item.after.memo
  && (row.claim_status ?? null) === item.after.claim_status
  && (row.claimed_on ?? null) === item.after.claimed_on
  && Boolean(row.needs_confirmation) === needsConfirmation);
for (const item of todo) {
  let row: Row | undefined;
  let partner: Row | undefined;
  try {
    const response = await api("PATCH", "/transactions", { transactions: [{ id: item.id, memo: item.memo }] });
    row = (response.data.transactions as Row[]).find((candidate) => candidate.id === item.id);
    if (item.partner) {
      // The pair shares the memo and the claim; "To confirm" is each side's
      // own, so a TOCHECK word sets it on the partner too.
      if (item.after.partner_needs_confirmation && !current.get(item.partner)?.needs_confirmation) {
        await api("PATCH", "/transactions", { transactions: [{ id: item.partner, needs_confirmation: true }] });
      }
      partner = (await api("GET", `/transactions/${encodeURIComponent(item.partner)}`)).data.transaction;
    }
  } catch (error) {
    refused.push(`${item.id} (${error instanceof Error ? error.message : String(error)})`);
    continue;
  }
  const ok = matches(row, item, item.after.needs_confirmation)
    && (!item.partner || matches(partner, item, item.after.partner_needs_confirmation ?? false));
  if (ok) converted += 1;
  else mismatched.push(item.partner ? `${item.id} (with ${item.partner})` : item.id);
}
console.log(`\nApplied: ${converted} converted, ${skipped} skipped (changed since the dry run), ${refused.length} refused, ${mismatched.length} not as expected.`);
if (refused.length) console.log(`Refused by the server:\n  ${refused.join("\n  ")}`);
if (mismatched.length) console.log(`Check these rows: ${mismatched.join(", ")}`);
if (refused.length || mismatched.length) process.exit(1);

function plan(rows: Row[]) {
  const convert: Planned[] = [];
  const looseOnly: Array<{ id: string; date: string; payee: string; memo: string }> = [];
  const alreadyFlagged: Array<{ id: string; date: string; payee: string; memo: string }> = [];
  let splitLines = 0;
  const lineIds = new Set(rows.flatMap((row) => (row.deleted ? [] : (row.subtransactions ?? []).map((line) => line.id))));
  const byId = new Map(rows.filter((row) => !row.deleted).map((row) => [row.id, row]));
  for (const row of rows) {
    if (row.deleted) continue;
    for (const line of row.subtransactions ?? []) {
      if (line.memo && followUpWords(line.memo).memo !== line.memo) splitLines += 1;
    }
    if (!row.memo) continue;
    // The other side of a transfer made from a split line: the line owns its
    // memo and the server refuses a memo edit here, so it stays with the line.
    if (row.transfer_transaction_id && lineIds.has(row.transfer_transaction_id)) {
      if (followUpWords(row.memo).memo !== row.memo) splitLines += 1;
      continue;
    }
    const words = followUpWords(row.memo);
    const payee = row.payee_name ?? "";
    if (words.memo === row.memo) {
      if (LOOSE.test(row.memo)) looseOnly.push({ id: row.id, date: row.date, payee, memo: row.memo });
      continue;
    }
    // A row with a claim already set and a word left over needs a person:
    // writing the memo back would let the word replace the stored claim.
    if ((row.claim_status ?? null) !== null) {
      alreadyFlagged.push({ id: row.id, date: row.date, payee, memo: row.memo });
      continue;
    }
    // A transfer is converted once, through one side; the server writes the
    // memo and the claim to both. Sides that disagree on the memo or approval
    // need a person, as the write would make the other side match this one.
    const partner = row.transfer_transaction_id ? byId.get(row.transfer_transaction_id) : undefined;
    if (partner) {
      if (partner.memo !== row.memo || Boolean(partner.approved) !== Boolean(row.approved) || (partner.claim_status ?? null) !== null) {
        if (row.id < partner.id || followUpWords(partner.memo).memo === partner.memo) {
          alreadyFlagged.push({ id: row.id, date: row.date, payee, memo: row.memo });
        }
        continue;
      }
      if (partner.id < row.id) continue;
    }
    convert.push({
      id: row.id,
      date: row.date,
      payee,
      amount: row.amount,
      memo: row.memo,
      ...(partner ? { partner: partner.id } : {}),
      after: {
        ...(partner ? { partner_needs_confirmation: Boolean(partner.needs_confirmation) || words.needs_confirmation === true } : {}),
        memo: words.memo,
        claim_status: words.claim_status ?? null,
        claimed_on: words.claim_status === "claimed" ? words.claimed_on ?? null : null,
        needs_confirmation: Boolean(row.needs_confirmation) || words.needs_confirmation === true,
      },
    });
  }
  const count = (status: string | null, check?: boolean) => convert.filter((item) =>
    (status === undefined || item.after.claim_status === status) && (check === undefined || item.after.needs_confirmation === check)).length;
  return {
    summary: {
      will_convert: convert.length,
      to_claim: count("to_claim"),
      claimed: count("claimed"),
      to_confirm: convert.filter((item) => item.memo !== null && followUpWords(item.memo).needs_confirmation).length,
      left_as_text: looseOnly.length,
      needs_a_look: alreadyFlagged.length,
      split_lines_left_alone: splitLines,
    },
    convert,
    left_as_text: looseOnly,
    needs_a_look: alreadyFlagged,
  };
}

function print(report: ReturnType<typeof plan>, hasField: boolean) {
  const s = report.summary;
  if (!hasField) console.log("Note: this server does not return claim_status yet; the dry run still reads the memos.\n");
  console.log(`Will convert ${s.will_convert} rows (a transfer counts once): ${s.to_claim} to claim, ${s.claimed} claimed, ${s.to_confirm} to confirm (TOCHECK).`);
  console.log(`Left as text: ${s.left_as_text}. Needs a look: ${s.needs_a_look}. Split lines (and their transfer sides) left alone: ${s.split_lines_left_alone}.`);
  if (report.convert.length) {
    console.log("\nWill convert:");
    for (const item of report.convert) {
      const flags = [item.after.claim_status === "to_claim" ? "To claim" : null,
        item.after.claim_status === "claimed" ? `Claimed${item.after.claimed_on ? ` ${item.after.claimed_on}` : ""}` : null,
        followUpWords(item.memo).needs_confirmation ? "To confirm" : null,
        item.partner ? "both transfer sides" : null].filter(Boolean).join(", ");
      console.log(`  ${item.date}  ${money(item.amount).padStart(11)}  ${item.payee.slice(0, 24).padEnd(24)}  "${item.memo}" -> "${item.after.memo ?? ""}"  [${flags}]`);
    }
  }
  if (report.left_as_text.length) {
    console.log("\nLeft as text (the old claims tool read these as claims; HowMuch does not):");
    for (const item of report.left_as_text) console.log(`  ${item.date}  ${item.payee.slice(0, 24).padEnd(24)}  "${item.memo}"`);
  }
  if (report.needs_a_look.length) {
    console.log("\nNeeds a look (claim already set with a word still in the memo, or a transfer whose sides differ):");
    for (const item of report.needs_a_look) console.log(`  ${item.date}  ${item.payee.slice(0, 24).padEnd(24)}  "${item.memo}"`);
  }
}

async function loadAll(): Promise<{ rows: Row[]; knowledge: number; hasField: boolean }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rows: Row[] = [];
    let knowledge: number | undefined;
    let offset = 0;
    let moved = false;
    for (;;) {
      const page = await api("GET", `/transactions?limit=250&offset=${offset}`);
      knowledge ??= page.data.server_knowledge;
      if (page.data.server_knowledge !== knowledge) { moved = true; break; }
      rows.push(...page.data.transactions);
      if (!page.data.has_more || page.data.next_offset == null) break;
      offset = page.data.next_offset;
    }
    if (!moved) return { rows, knowledge: knowledge ?? 0, hasField: rows.length === 0 || rows.some((row) => "claim_status" in row) };
  }
  throw new Error("Transactions kept changing while loading; try again.");
}

async function api(method: string, path: string, body?: unknown): Promise<any> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

function money(milli: number): string {
  return (milli / 1000).toFixed(2);
}

function parseArgs(args: string[]) {
  const options: { apiUrl?: string; plan?: string; apply: boolean; out?: string } = { apply: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--api-url") options.apiUrl = args[++i];
    else if (arg === "--plan") options.plan = args[++i];
    else if (arg === "--out") options.out = args[++i];
    else { console.error(`Unknown option ${arg}`); process.exit(2); }
  }
  return options;
}
