export const ACCOUNT_KINDS = {
  checking: { onBudget: true, defaultIcon: "🏦" },
  savings: { onBudget: true, defaultIcon: "💰" },
  cash: { onBudget: true, defaultIcon: "💵" },
  creditCard: { onBudget: true, defaultIcon: "💳" },
  lineOfCredit: { onBudget: true, defaultIcon: "💳" },
  mortgage: { onBudget: false, defaultIcon: "🏠" },
  autoLoan: { onBudget: false, defaultIcon: "🚗" },
  studentLoan: { onBudget: false, defaultIcon: "🎓" },
  medicalDebt: { onBudget: false, defaultIcon: "🏥" },
  otherLoan: { onBudget: false, defaultIcon: "📄" },
  otherAsset: { onBudget: false, defaultIcon: "📈" },
  otherLiability: { onBudget: false, defaultIcon: "📉" },
} as const satisfies Record<string, { onBudget: boolean; defaultIcon: string }>;

export type AccountKind = keyof typeof ACCOUNT_KINDS;

export type AccountUpdatePatch = {
  icon?: string;
  name?: string;
  kind?: AccountKind;
  closed?: boolean;
};

type AccountUpdateExisting = {
  name: string;
  icon?: string | null;
  type?: string | null;
};

export function parseAccountKind(value: unknown): AccountKind | null {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ACCOUNT_KINDS, value)
    ? value as AccountKind
    : null;
}

export function onBudgetForKind(kind: AccountKind): boolean {
  return ACCOUNT_KINDS[kind].onBudget;
}

export function defaultIconForKind(type?: string | null): string {
  const kind = parseAccountKind(type);
  return kind ? ACCOUNT_KINDS[kind].defaultIcon : ACCOUNT_KINDS.checking.defaultIcon;
}

export function applyAccountUpdate(
  existing: AccountUpdateExisting,
  patch: AccountUpdatePatch,
): { name?: string; icon?: string; type?: AccountKind; on_budget?: boolean; closed?: boolean } {
  const next: { name?: string; icon?: string; type?: AccountKind; on_budget?: boolean; closed?: boolean } = {};
  if (patch.name !== undefined) {
    next.name = patch.name.trim();
  }
  if (patch.kind !== undefined) {
    next.type = patch.kind;
    next.on_budget = onBudgetForKind(patch.kind);
    if (patch.icon === undefined) {
      const stored = existing.icon == null || existing.icon === "" ? null : existing.icon;
      if (stored == null || stored === defaultIconForKind(existing.type)) {
        next.icon = ACCOUNT_KINDS[patch.kind].defaultIcon;
      }
    }
  }
  if (patch.icon !== undefined) {
    next.icon = patch.icon;
  }
  if (patch.closed !== undefined) {
    next.closed = patch.closed;
  }
  return next;
}

export const ACCOUNT_IN_USE_MESSAGE =
  "This account has transactions, transfers or scheduled transactions. Close it instead to keep its history.";

/**
 * Soft-deletes an account that holds nothing, with its transfer payee and card
 * payment terms. Every statement re-checks that no live transaction or split
 * touches the account, so a transaction written after the caller's check
 * leaves everything in place.
 */
export function accountDeletionSql(planId: string, accountId: string): Array<{ sql: string; values: unknown[] }> {
  const deleted = "EXISTS (SELECT 1 FROM accounts WHERE id = ? AND plan_id = ? AND deleted = 1)";
  return [
    {
      sql: `UPDATE accounts SET deleted = 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND plan_id = ? AND deleted = 0
              AND NOT EXISTS (SELECT 1 FROM transactions WHERE plan_id = ? AND deleted = 0 AND (account_id = ? OR transfer_account_id = ?))
              AND NOT EXISTS (SELECT 1 FROM subtransactions s JOIN transactions t ON t.id = s.transaction_id
                              WHERE t.plan_id = ? AND t.deleted = 0 AND s.deleted = 0 AND s.transfer_account_id = ?)`,
      values: [accountId, planId, planId, accountId, accountId, planId, accountId],
    },
    {
      sql: `UPDATE payees SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE plan_id = ? AND transfer_account_id = ? AND deleted = 0 AND ${deleted}`,
      values: [planId, accountId, accountId, planId],
    },
    {
      sql: `UPDATE card_payment_terms SET default_funding_account_id = NULL WHERE plan_id = ? AND default_funding_account_id = ? AND ${deleted}`,
      values: [planId, accountId, accountId, planId],
    },
    {
      sql: `DELETE FROM card_payment_terms WHERE plan_id = ? AND account_id = ? AND ${deleted}`,
      values: [planId, accountId, accountId, planId],
    },
  ];
}
