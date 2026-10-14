import { api, useApi, type ApiState, type UnapprovedCount } from "../api/client";

/** Identifies the ledger the count was read from; a local write changes it. */
export interface LedgerVersion {
  validatedKnowledge: number | null;
  cacheEpoch: number;
}

interface UnapprovedCountInput {
  planId: string;
  accountId: string | null;
  from: string | undefined;
  to: string | undefined;
  /** The inclusive end actually fetched, which may run past `to`. */
  until: string | undefined;
  /** False when the register is scoped more widely than the endpoint can count. */
  enabled: boolean;
  refreshGeneration: number;
  ledgerVersion: LedgerVersion;
}

/** The server-side "new to approve" count, or `null` data when not `enabled`. */
export function useUnapprovedCount(input: UnapprovedCountInput): ApiState<UnapprovedCount | null> {
  const { planId, accountId, from, to, until, enabled, refreshGeneration, ledgerVersion } = input;
  return useApi(
    JSON.stringify({
      planId,
      selectedAccountId: accountId,
      from,
      to,
      refreshGeneration,
      validatedKnowledge: ledgerVersion.validatedKnowledge,
      cacheEpoch: ledgerVersion.cacheEpoch,
      unapprovedCount: enabled,
    }),
    async () => (enabled ? await api.unapprovedCount(planId, { since_date: from, until_date: until }, accountId) : null),
  );
}
