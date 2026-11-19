import { useEffect, useRef } from "react";
import { api } from "../api/client";
import type { Payee } from "../api/types";
import { findTransferPayee } from "../lib/register-compose";

export type PayeeDefaults = { category_id: string | null; flag_color: string | null };

/** Long enough that typing a name asks once, after the last keystroke. */
const SETTLE_MS = 250;

/**
 * Once a payee name and an account are chosen, asks the ledger what that payee
 * usually gets there and hands it to `onDefaults`. The ledger matches by name,
 * so a payee only ever typed (never saved as a payee record) is found too. An
 * answer for a name or account the form has since moved off is dropped, and a
 * failed lookup leaves the form as it is: suggestions are optional.
 */
export function usePayeeDefaults(
  planId: string,
  payees: readonly Payee[],
  payeeName: string,
  accountId: string,
  onDefaults: (defaults: PayeeDefaults) => void,
): void {
  const name = findTransferPayee(payees, payeeName) ? "" : payeeName.trim().replace(/\s+/g, " ").toLowerCase();
  const latest = useRef(onDefaults);
  latest.current = onDefaults;

  useEffect(() => {
    if (!name || !accountId) {
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      api.payeeDefaults(planId, name, accountId).then(
        (defaults) => {
          if (current) latest.current(defaults);
        },
        () => {},
      );
    }, SETTLE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [planId, name, accountId]);
}
