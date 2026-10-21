import { parseMilliunits } from "./money";

/**
 * The account types the API accepts on create, in the order the form lists
 * them. Mirrors `ACCOUNT_KINDS` in `apps/api/src/account-kind.ts` and
 * `AccountKind` on iOS; the server derives on-budget from the type.
 */
export const ACCOUNT_KIND_GROUPS = [
  {
    label: "Everyday",
    kinds: [
      { kind: "checking", title: "Current account" },
      { kind: "savings", title: "Savings" },
      { kind: "cash", title: "Cash" },
      { kind: "creditCard", title: "Credit card" },
      { kind: "lineOfCredit", title: "Line of credit" },
    ],
  },
  {
    label: "Loans and assets",
    kinds: [
      { kind: "mortgage", title: "Mortgage" },
      { kind: "autoLoan", title: "Car loan" },
      { kind: "studentLoan", title: "Student loan" },
      { kind: "medicalDebt", title: "Medical debt" },
      { kind: "otherLoan", title: "Other loan" },
      { kind: "otherAsset", title: "Other asset" },
      { kind: "otherLiability", title: "Other liability" },
    ],
  },
] as const;

export type NewAccountKind = (typeof ACCOUNT_KIND_GROUPS)[number]["kinds"][number]["kind"];

const LIABILITY_KINDS: ReadonlySet<NewAccountKind> = new Set([
  "creditCard", "lineOfCredit", "mortgage", "autoLoan", "studentLoan", "medicalDebt", "otherLoan", "otherLiability",
]);

/** Liabilities ask for what is owed, which is stored as a negative balance. */
export function storesLiability(kind: NewAccountKind): boolean {
  return LIABILITY_KINDS.has(kind);
}

export type NewAccountDraft = { name: string; kind: NewAccountKind; balance: string };

export type NewAccountBody = { name: string; type: NewAccountKind; balance: number };

export function newAccountRequest(
  draft: NewAccountDraft,
): { ok: true; body: NewAccountBody } | { ok: false; error: "name" | "balance" } {
  const name = draft.name.trim();
  if (!name) return { ok: false, error: "name" };
  const entered = draft.balance.trim() === "" ? 0 : parseMilliunits(draft.balance);
  if (entered === null) return { ok: false, error: "balance" };
  // The server stores the balance as sent, so the sign is settled here, as
  // the iOS sheet does: whatever is typed for a debt is owed.
  const balance = storesLiability(draft.kind) ? -Math.abs(entered) : entered;
  return { ok: true, body: { name, type: draft.kind, balance } };
}
