import { api } from "../api/client";
import type { Transaction } from "../api/types";

const PAGE_SIZE = 250;
const MAX_ATTEMPTS = 3;

/**
 * Pages the whole unapproved queue for one plan or one account. A pass is only
 * accepted if every page reported the same `server_knowledge`; if the ledger
 * moved mid-read the pass restarts, and gives up after a few attempts.
 */
export async function fetchUnapprovedQueue(
  planId: string,
  accountId: string | null,
  range: { since_date?: string; until_date?: string },
): Promise<Transaction[]> {
  return fetchTransactionQueue(planId, accountId, range, "unapproved");
}

/** Every row of one `type` list, read at a single knowledge value. */
export async function fetchTransactionQueue(
  planId: string,
  accountId: string | null,
  range: { since_date?: string; until_date?: string },
  type: "unapproved" | "needs_confirmation",
): Promise<Transaction[]> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const transactions = new Map<string, Transaction>();
    let expectedKnowledge: number | null = null;
    let offset = 0;
    for (;;) {
      const query = { ...range, type, limit: PAGE_SIZE, offset };
      const result = accountId
        ? await api.accountTransactions(planId, accountId, query)
        : await api.transactions(planId, query);
      expectedKnowledge ??= result.server_knowledge;
      if (result.server_knowledge !== expectedKnowledge) break;
      for (const transaction of result.transactions) transactions.set(transaction.id, transaction);
      if (!result.has_more || result.next_offset === null) return [...transactions.values()];
      offset = result.next_offset;
    }
  }
  throw new Error(type === "unapproved"
    ? "Transactions changed while the approval queue was loading. Try again."
    : "Transactions changed while the list was loading. Try again.");
}
