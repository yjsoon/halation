// Wire shapes the API returns and the web client reads. Both sides import
// these so a change to a response is a change to one definition.

export interface Account {
  id: string;
  name: string;
  icon: string;
  type: string | null;
  on_budget: boolean;
  closed: boolean;
  balance: number;
  cleared_balance: number;
  uncleared_balance: number;
  last_reconciled_date: string | null;
  transfer_payee_id: string | null;
  deleted: boolean;
}

export interface Subtransaction {
  id: string;
  amount: number;
  payee_id: string | null;
  payee_name?: string | null;
  category_id: string | null;
  category_name?: string | null;
  memo: string | null;
  transfer_account_id?: string | null;
  transfer_transaction_id?: string | null;
  deleted: boolean;
}

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  memo: string | null;
  cleared: string;
  approved: boolean;
  flag_color: string | null;
  flag_name: string | null;
  /**
   * The amount is an estimate still to be checked against the statement, such
   * as a foreign-currency charge entered at an estimated rate. Clearing or
   * reconciling the row confirms it.
   */
  needs_confirmation: boolean;
  account_id: string;
  account_name: string | null;
  payee_id: string | null;
  payee_name: string | null;
  category_id: string | null;
  category_name: string | null;
  transfer_account_id: string | null;
  transfer_transaction_id: string | null;
  parent_transaction_id?: string | null;
  deleted: boolean;
  subtransactions?: Subtransaction[];
}

/** A read-only future transaction imported from YNAB, in integer milliunits. */
export interface ScheduledSubtransaction {
  id: string;
  scheduled_transaction_id?: string;
  amount: number;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  memo?: string | null;
  transfer_account_id?: string | null;
}

export interface ScheduledTransaction {
  id: string;
  date_first?: string | null;
  date_next?: string | null;
  frequency?: string | null;
  amount?: number | null;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  transfer_account_id?: string | null;
  memo?: string | null;
  flag_color?: string | null;
  deleted?: boolean;
  subtransactions?: ScheduledSubtransaction[];
}

export type AccountGroupSort = "manual" | "alphabetical" | "mostUsedLast30Days";

export interface CustomAccountGroup {
  id: string;
  name: string;
  account_ids: string[];
}

export interface AccountPreferences {
  favourite_account_ids: string[];
  account_order: string[];
  account_order_by_group: Record<string, string[]>;
  account_group_sorts: Record<string, AccountGroupSort>;
  custom_account_groups: CustomAccountGroup[];
}

export interface AccountPreferencesSnapshot {
  account_preferences: AccountPreferences | null;
  account_preferences_revision: number;
}

/** The authoritative result of entering one scheduled occurrence into the ledger. */
export interface ScheduledOccurrenceResult {
  transaction: Transaction;
  scheduled_transaction: ScheduledTransaction;
  occurrence_date: string;
  entered_date: string;
  completed: boolean;
  replayed: boolean;
}

export interface AccountReconciliationResult {
  account: Account;
  reconciled_transaction_ids: string[];
  reconciled_transaction_count: number;
  statement_date: string;
  statement_balance: number;
  prior_reconciled_balance: number;
  final_reconciled_balance: number;
  replayed: boolean;
  server_knowledge: number;
}

/** A non-mutating projection used to review an account reconciliation. */
export interface AccountReconciliationPreview {
  account: Account;
  statement_date: string;
  current_reconciled_balance: number;
  projected_reconciled_balance: number;
  candidate_transaction_ids: string[];
  candidate_transaction_count: number;
  server_knowledge: number;
}

/**
 * A card's payment terms (`creditCard` or `lineOfCredit` accounts only).
 * Amounts are integer milliunits; `statement_day` 29 to 31 is clamped to the
 * month's last day.
 */
export interface CardPaymentTerms {
  account_id: string;
  statement_day: number;
  due_gap_days: number;
  due_weekend_rule: "next" | "previous";
  default_funding_account_id: string | null;
  default_amount_rule: "statement" | "minimum" | "fixed";
  default_amount_milli: number | null;
  minimum_floor_milli: number;
  minimum_rate_bp: number;
  pay_days_before_due: number;
  lead_days: number;
  delivery_hour: number;
  enabled: boolean;
  /**
   * When the card's terms were first saved (ISO 8601, UTC), set by the
   * server and kept across later PUTs. A due date before this day is never
   * reported overdue.
   */
  created_at: string;
}

/**
 * PUT body fields: `statement_day` is required, everything else defaults.
 * `created_at` may be sent back and is ignored.
 */
export type CardPaymentTermsInput = Pick<CardPaymentTerms, "statement_day"> & Partial<Omit<CardPaymentTerms, "statement_day">>;

/**
 * How a cycle is covered. Covered (no reminders needed): `paid`, `posted`,
 * `scheduled`, `settled`. Not covered: `partial`, `overdue`, `unscheduled`.
 *
 * - `paid`: approved or cleared transfers into the card in the payment window
 *   add up to at least `minimum_due`.
 * - `posted`: the same, counting unapproved, uncleared transfers too
 *   (typically a materialised schedule waiting for approval).
 * - `scheduled`: a schedule into the card has an occurrence in the window.
 * - `settled`: nothing is owed on the card now (`current_balance <= 0`), for
 *   example after a payment recorded as a plain inflow.
 * - `partial`: transfers in the window, but less than `minimum_due`.
 *   `remaining_amount` is `statement_balance - paid_amount`, floored at 0.
 * - `overdue`: a due date has passed with a positive statement balance and no
 *   payment of at least the minimum. `since` is the missed due date: this
 *   cycle's, or the previous cycle's when that one is carried over (see
 *   `previous_unpaid`). `paid_amount` is what was paid in this cycle's window.
 * - `unscheduled`: nothing yet.
 */
export type CardPaymentCoverage =
  | { state: "unscheduled" }
  | { state: "scheduled"; scheduled_transaction_id: string; pay_date: string; amount: number; funding_account_id: string }
  | { state: "posted"; transaction_id: string; approved: boolean; amount: number; date: string }
  | { state: "paid"; transaction_id: string; amount: number; date: string }
  | { state: "partial"; transaction_id: string; date: string; paid_amount: number; remaining_amount: number }
  | { state: "settled" }
  | { state: "overdue"; since: string; paid_amount: number };

/** The previous statement, when it went past its due date unpaid. */
export interface CardPaymentPreviousUnpaid {
  statement_date: string;
  due_date: string;
  statement_balance: number;
  minimum_due: number;
}

export interface CardPaymentCycle {
  account_id: string;
  cycle: "current" | "next";
  statement_date: string;
  due_date: string;
  /** Due date minus `pay_days_before_due` working days. */
  last_safe_pay_date: string;
  /** Suggested pay day inside the window: the last safe day, or `as_of` once that has passed or while overdue. */
  default_pay_date: string;
  /** First day (inclusive) a payment counts for this cycle. */
  window_start: string;
  /** Last day (inclusive) a payment counts for this cycle: the later of the next statement date and the due date. */
  window_end: string;
  /**
   * Amount owed at the end of the statement date, recorded so far; positive
   * means owed, zero or negative means nothing due. For the next cycle it is a
   * projection that nets off scheduled payments not yet entered.
   */
  statement_balance: number;
  minimum_due: number;
  /** Amount owed now (the account balance negated), positive means owed. */
  current_balance: number;
  coverage: CardPaymentCoverage;
  /** Current cycle only: the previous statement went unpaid past its due date and this cycle is not paid or posted. Otherwise null. */
  previous_unpaid: CardPaymentPreviousUnpaid | null;
}

export interface CardPaymentsView {
  as_of: string;
  /** The current and next cycle of every enabled card, ordered by due date. */
  cycles: CardPaymentCycle[];
  server_knowledge: number;
}

/** One requested row's outcome in a bulk cleared or delete command. */
export type TransactionBulkStatus =
  /** The server confirmed this item's own write. */
  | "applied"
  /** An expected-state precondition failed; the item was left alone. */
  | "conflict"
  /**
   * The row was already gone when this item was reached. This is an observation,
   * not an attribution: a command cannot claim it removed a row it never
   * committed, so `already_removed` is never counted as work this command did.
   */
  | "already_removed"
  /** The write failed ambiguously and may or may not have landed. */
  | "unresolved"
  /** Never sent, because the command stopped at an earlier failure. */
  | "unattempted";

export type TransactionBulkOutcome = {
  readonly id: string;
  readonly status: TransactionBulkStatus;
  readonly detail?: string;
};

export type TransactionBulkResult = {
  outcomes: TransactionBulkOutcome[];
  applied_count: number;
  conflict_count: number;
  already_removed_count: number;
  unresolved_count: number;
  unattempted_count: number;
  server_knowledge: number;
};

export type TransactionPage = {
  transactions: Transaction[];
  has_more: boolean;
  next_offset: number | null;
  /** Read in the same batch as the page, so it always describes these rows. */
  server_knowledge: number;
};

/**
 * The size of the unapproved queue, without any of its rows. Clients show the
 * "New" badge from this and only load the queue itself when the user opens the
 * approval flow.
 */
export type UnapprovedCount = {
  count: number;
  /** Read in the same batch as the count, so it always describes this number. */
  server_knowledge: number;
};

export type RewardCardType = "cashback" | "miles";

export type RewardFlagColour = "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "unflagged";

export interface CardSubcategory {
  id: string;
  name: string;
  flagColor: RewardFlagColour;
  rewardValue: number;
  milesBlockSize?: number | null;
  minimumSpend?: number | null;
  maximumSpend?: number | null;
  priority: number;
  active: boolean;
  excludeFromRewards?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SpendingTierSubcategory {
  subcategoryId: string;
  rewardValue: number;
  maximumSpend?: number | null;
}

export interface CardSpendingTier {
  id: string;
  spendThreshold: number;
  earningRate?: number | null;
  maximumSpend?: number | null;
  subcategories?: SpendingTierSubcategory[];
}

export interface CardRewardPeriod {
  monthCount: number;
  anchorDate: string;
  monthlyMinimumSpend: number;
}

export interface CreditCard {
  id: string;
  name: string;
  issuer: string;
  type: RewardCardType;
  ynabAccountId: string;
  billingCycle?: {
    type: "calendar" | "billing";
    dayOfMonth?: number;
  };
  rewardPeriod?: CardRewardPeriod;
  promotionalPeriod?: {
    startDate?: string | null;
    endDate: string;
    description?: string;
  };
  featured: boolean;
  earningRate?: number | null;
  earningBlockSize?: number | null;
  minimumSpend?: number | null;
  maximumSpend?: number | null;
  subcategoriesEnabled?: boolean;
  subcategories?: CardSubcategory[];
  spendingTiers?: CardSpendingTier[];
  flagNames?: Record<string, string>;
}
