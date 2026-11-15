import { useEffect, useState } from "react";
import { MAX_TRANSACTION_PAGE_SIZE } from "@howmuch/register-query";
import { api } from "../api/client";
import type { Account, Transaction } from "../api/types";
import { todayIso } from "./dates";
import { asOfTodayBalance } from "./register-current";

/** What the shell hands its routes, so a register and the sidebar show one figure. */
export interface ShellOutletContext {
  todayBalances: ReadonlyMap<string, number>;
}

/**
 * Each account's as-of-today balance by ID: its working balance less posted
 * rows dated after today, the figure the register and account list lead with.
 * Each map is built from the accounts it was fetched against, so a refreshed
 * balance keeps the previous figure until its own future rows arrive, instead
 * of briefly counting them twice or not at all.
 */
export function useAsOfTodayBalances(planId: string, accounts: Account[]): ReadonlyMap<string, number> {
  const [balances, setBalances] = useState<ReadonlyMap<string, number>>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    const today = todayIso();
    (async () => {
      const rows: Transaction[] = [];
      let offset: number | null = 0;
      while (offset !== null) {
        const page = await api.transactions(planId, { since_date: today, limit: MAX_TRANSACTION_PAGE_SIZE, offset });
        rows.push(...page.transactions);
        offset = page.has_more ? page.next_offset : null;
      }
      return rows;
    })().then(
      (rows) => {
        if (cancelled) return;
        setBalances(new Map(accounts.map((account) => [
          account.id,
          asOfTodayBalance(account.balance, rows, { accountId: account.id, today }),
        ])));
      },
      () => {
        // Without the future rows, show the server's working balance rather
        // than a figure computed against an older ledger.
        if (!cancelled) setBalances(new Map());
      },
    );
    return () => {
      cancelled = true;
    };
  }, [planId, accounts]);
  return balances;
}
