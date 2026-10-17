import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseArgs as parseCliArgs } from "node:util";
import { openDatabase } from "../apps/api/src/db";
import { importYnabExport } from "../apps/api/src/importers/ynab-export";
import { LedgerRepository } from "../apps/api/src/repository";
import { ledgerSummary } from "./lib/import-summary";
import { backupSqliteDatabase } from "./lib/sqlite-backup";

type CliOptions = {
  dbPath: string;
  zipPath?: string;
  registerPath?: string;
  planPath?: string;
  planId: string;
  planName?: string;
  dateFormat: "dmy" | "mdy" | "ymd";
  noBackup: boolean;
  help: boolean;
};

const options = parseArgs(Bun.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

const backupPath = options.noBackup ? null : backupSqliteDatabase(options.dbPath);
const input = options.zipPath ? readYnabExportZip(options.zipPath) : readYnabExportFiles(options);
const db = openDatabase(options.dbPath);
const repo = new LedgerRepository(db, options.planId);

try {
  const result = await importYnabExport(repo, {
    planId: options.planId,
    planName: options.planName ?? input.planName,
    registerCsv: input.registerCsv,
    planCsv: input.planCsv,
    dateFormat: options.dateFormat,
  });
  const summary = ledgerSummary(db, options.planId);

  console.log(`Imported YNAB web export "${options.planName ?? input.planName ?? options.planId}"`);
  console.log(`Database: ${options.dbPath}`);
  if (backupPath) {
    console.log(`Backup: ${backupPath}`);
  }
  console.log(`Import session: ${result.import_session_id}`);
  console.log(`Imported transactions: ${result.imported}`);
  console.log(`Duplicate transactions: ${result.duplicate}`);
  console.log(`Failed rows: ${result.failed}`);
  console.log(`Inferred transfer pairs: ${result.transfer_pairs}`);
  console.log(`Transfer payee rows: ${result.transfer_payees}`);
  console.log(`Accounts: ${summary.accounts}`);
  console.log(`Payees: ${summary.payees}`);
  console.log(`Category groups: ${summary.category_groups}`);
  console.log(`Categories: ${summary.categories}`);
  console.log(`Transactions: ${summary.transactions_active} active, ${summary.transactions_deleted} deleted`);
  console.log(`Date range: ${summary.first_date ?? "n/a"} to ${summary.last_date ?? "n/a"}`);
} finally {
  db.close();
}

function parseArgs(args: string[]): CliOptions {
  const { values } = parseCliArgs({
    args,
    options: {
      zip: { type: "string" },
      register: { type: "string" },
      plan: { type: "string" },
      db: { type: "string" },
      "plan-id": { type: "string" },
      "plan-name": { type: "string" },
      "date-format": { type: "string" },
      "no-backup": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  const dateFormat = values["date-format"] ?? "dmy";
  if (!["dmy", "mdy", "ymd"].includes(dateFormat)) {
    throw new Error("--date-format must be one of dmy, mdy, or ymd");
  }
  const options: CliOptions = {
    zipPath: values.zip,
    registerPath: values.register,
    planPath: values.plan,
    dbPath: values.db ?? Bun.env.HOWMUCH_DB_PATH ?? "data/howmuch.sqlite",
    planId: values["plan-id"] ?? Bun.env.HOWMUCH_DEFAULT_PLAN_ID ?? "ynab-web-export",
    planName: values["plan-name"],
    dateFormat: dateFormat as CliOptions["dateFormat"],
    noBackup: values["no-backup"] ?? false,
    help: values.help ?? false,
  };

  if (options.help) {
    return options;
  }

  if (!options.zipPath && !options.registerPath) {
    throw new Error("Pass --zip <ynab-export.zip> or --register <Register.csv>.");
  }
  if (options.zipPath && (options.registerPath || options.planPath)) {
    throw new Error("Use either --zip or --register/--plan, not both.");
  }

  return options;
}

function readYnabExportFiles(options: CliOptions): { registerCsv: string; planCsv?: string; planName?: string } {
  if (!options.registerPath) {
    throw new Error("--register is required when --zip is not used.");
  }
  return {
    registerCsv: readFileSync(options.registerPath, "utf8"),
    planCsv: options.planPath ? readFileSync(options.planPath, "utf8") : undefined,
    planName: inferPlanName(options.registerPath),
  };
}

function readYnabExportZip(zipPath: string): { registerCsv: string; planCsv?: string; planName?: string } {
  const entries = unzip(["-Z1", zipPath]).split(/\r?\n/).filter(Boolean);
  const registerEntry = entries.find((entry) => /Register\.(csv|tsv)$/i.test(entry));
  const planEntry = entries.find((entry) => /Plan\.(csv|tsv)$/i.test(entry));

  if (!registerEntry) {
    throw new Error("Could not find a Register.csv or Register.tsv file in the YNAB export zip.");
  }

  return {
    registerCsv: unzip(["-p", zipPath, registerEntry]),
    planCsv: planEntry ? unzip(["-p", zipPath, planEntry]) : undefined,
    planName: inferPlanName(registerEntry),
  };
}

function unzip(args: string[]): string {
  const result = Bun.spawnSync(["unzip", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (!result.success) {
    throw new Error(`unzip failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString();
}

function inferPlanName(path: string): string | undefined {
  const file = basename(path);
  const match = file.match(/^(.+?)\s+as of\s+/i);
  return match?.[1];
}

function printHelp(): void {
  console.log(`Import a YNAB web export zip or CSV pair into a local HowMuch SQLite database.

Usage:
  bun run import:ynab-export -- --zip "/path/to/YNAB Export - Plan as of YYYY-MM-DD HH-MM.zip" --db data/howmuch-real.sqlite
  bun run import:ynab-export -- --register Register.csv --plan Plan.csv --db data/howmuch-real.sqlite

Options:
  --zip <path>           YNAB web export zip containing Register.csv and Plan.csv
  --register <path>      Register CSV/TSV path when not importing a zip
  --plan <path>          Optional Plan CSV/TSV path when not importing a zip
  --db <path>            SQLite database path (default HOWMUCH_DB_PATH or data/howmuch.sqlite)
  --plan-id <id>         Local HowMuch plan id (default HOWMUCH_DEFAULT_PLAN_ID or ynab-web-export)
  --plan-name <name>     Local HowMuch plan name
  --date-format <fmt>    Date parser for non-ISO dates: dmy, mdy, or ymd (default dmy)
  --no-backup            Skip backup when the database file already exists
  --help                 Show this help
`);
}
