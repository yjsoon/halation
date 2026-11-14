import { parseMilliunits } from "./money";

/**
 * The account types the API accepts on create, in the order the form lists
 * them. Mirrors `ACCOUNT_KINDS` in `apps/api/src/account-kind.ts` and
 * `AccountKind` on iOS; the server derives on-budget from the type, so the
 * group a type sits in is whether the account is a budget or tracking one.
 */
export const ACCOUNT_KIND_GROUPS = [
  {
    label: "Budget",
    note: "Budget account: cash, savings and cards you spend from.",
    kinds: [
      { kind: "checking", title: "Current account" },
      { kind: "savings", title: "Savings" },
      { kind: "cash", title: "Cash" },
      { kind: "creditCard", title: "Credit card" },
      { kind: "lineOfCredit", title: "Line of credit" },
    ],
  },
  {
    label: "Tracking",
    note: "Tracking account: loans and assets you keep an eye on but don’t spend from. Listed under Tracking.",
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

export function accountKindGroup(kind: string): (typeof ACCOUNT_KIND_GROUPS)[number] | undefined {
  return ACCOUNT_KIND_GROUPS.find((group) => group.kinds.some((option) => option.kind === kind));
}

const LIABILITY_KINDS: ReadonlySet<NewAccountKind> = new Set([
  "creditCard", "lineOfCredit", "mortgage", "autoLoan", "studentLoan", "medicalDebt", "otherLoan", "otherLiability",
]);

/** Liabilities ask for what is owed, which is stored as a negative balance. */
export function storesLiability(kind: NewAccountKind): boolean {
  return LIABILITY_KINDS.has(kind);
}

type NewAccountDraft = { name: string; kind: NewAccountKind; balance: string };

export type NewAccountBody = { name: string; type: NewAccountKind; balance: number };

/** An account PATCH; on-budget follows `type` on the server. */
export type AccountUpdate = { name?: string; type?: NewAccountKind; closed?: boolean };

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
