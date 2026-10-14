import { describe, expect, test } from "bun:test";
import type { TransactionBulkOutcome, TransactionBulkSummary } from "../api/client";
import type { Transaction } from "../api/types";
import {
  bulkOutcomeIsComplete,
  categorisableRows,
  clearedTargets,
  remainingWorkIds,
} from "./register-bulk";

function txn(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return {
    id,
    date: "2026-08-01",
    amount: -100,
    memo: null,
    cleared: "uncleared",
    approved: false,
    flag_color: null,
    flag_name: null,
    account_id: "a",
    account_name: "Cash",
    payee_id: null,
    payee_name: null,
    category_id: null,
    category_name: null,
    transfer_account_id: null,
    transfer_transaction_id: null,
    deleted: false,
    ...overrides,
  };
}

function summary(outcomes: TransactionBulkOutcome[]): TransactionBulkSummary {
  const counts = {
    applied_count: 0,
    conflict_count: 0,
    already_removed_count: 0,
    unresolved_count: 0,
    unattempted_count: 0,
  };
  for (const outcome of outcomes) counts[`${outcome.status}_count` as keyof typeof counts] += 1;
  return { outcomes, ...counts };
}

describe("register bulk eligibility", () => {
  test("excludes split parents, transfer legs, and split-linked mirrors from categorise", () => {
    const plain = txn("plain");
    const transfer = txn("transfer", { transfer_account_id: "b", transfer_transaction_id: "mirror" });
    const splitParent = txn("split", { subtransactions: [{ id: "s1", amount: -100 }] });
    const linkedMirror = txn("mirror", { parent_transaction_id: "split" });
    expect(categorisableRows([plain, transfer, splitParent, linkedMirror]).map((row) => row.id)).toEqual(["plain"]);
  });

  test("keeps only rows the cleared toggle would change", () => {
    const rows = [
      txn("uncleared"),
      txn("cleared", { cleared: "cleared" }),
      txn("reconciled", { cleared: "reconciled" }),
    ];
    expect(clearedTargets(rows, "cleared").map((row) => row.id)).toEqual(["uncleared"]);
    expect(clearedTargets(rows, "uncleared").map((row) => row.id)).toEqual(["cleared"]);
  });
});

describe("register bulk outcomes", () => {
  test("never counts already_removed as this command's work or as remaining work", () => {
    const result = summary([
      { id: "a", status: "applied" },
      { id: "b", status: "already_removed" },
      { id: "c", status: "conflict" },
      { id: "d", status: "unresolved" },
      { id: "e", status: "unattempted" },
    ]);
    expect(result.applied_count).toBe(1);
    expect(result.already_removed_count).toBe(1);
    expect(bulkOutcomeIsComplete(result)).toBe(false);
    expect(remainingWorkIds(result)).toEqual(["d", "e"]);
    expect(bulkOutcomeIsComplete(summary([
      { id: "a", status: "applied" },
      { id: "b", status: "already_removed" },
    ]))).toBe(true);
  });

});
