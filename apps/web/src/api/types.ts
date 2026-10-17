import type {
  Account,
  Subtransaction,
  Transaction,
  ScheduledSubtransaction,
  ScheduledTransaction,
  AccountGroupSort,
  CustomAccountGroup,
  AccountPreferences,
  AccountPreferencesSnapshot,
  ScheduledOccurrenceResult,
  AccountReconciliationResult,
  AccountReconciliationPreview,
  RewardCardType,
  RewardFlagColour,
  CardSubcategory,
  SpendingTierSubcategory,
  CardSpendingTier,
  CreditCard,
} from "@howmuch/contract";

export type {
  Account,
  Subtransaction,
  Transaction,
  ScheduledSubtransaction,
  ScheduledTransaction,
  AccountGroupSort,
  CustomAccountGroup,
  AccountPreferences,
  AccountPreferencesSnapshot,
  ScheduledOccurrenceResult,
  AccountReconciliationResult,
  AccountReconciliationPreview,
  RewardCardType,
  RewardFlagColour,
  CardSubcategory,
  SpendingTierSubcategory,
  CardSpendingTier,
  CreditCard,
};

export type Interval = "day" | "week" | "month" | "year";

export interface Plan {
  id: string;
  name: string;
  /**
   * The plan's current `server_knowledge`. The plans list is the cheapest
   * response that carries it, and the bootstrap already fetches it, so this is
   * what validates the client cache. Optional because a server older than this
   * field would omit it; the cache then simply refetches.
   */
  server_knowledge?: number;
}

export interface CurrencyFormat {
  iso_code?: string;
  decimal_digits?: number;
  decimal_separator?: string;
  group_separator?: string;
  currency_symbol?: string;
  symbol_first?: boolean;
  display_symbol?: boolean;
}

export interface PlanSettings {
  date_format?: { format?: string };
  currency_format?: CurrencyFormat;
  display?: { flag_names?: Record<string, string> };
}

export interface CategoryGroup {
  id: string;
  name: string;
  hidden?: boolean;
  deleted?: boolean;
  categories: Category[];
}

export interface Category {
  id: string;
  category_group_id: string;
  name: string;
  hidden?: boolean;
  deleted?: boolean;
}

export interface Payee {
  id: string;
  name: string;
  transfer_account_id?: string | null;
  deleted?: boolean;
}

/** Writable scheduled-transaction shape. Amounts are integer milliunits. */
export interface ScheduledTransactionInput {
  id?: string;
  account_id: string;
  date_first: string;
  date_next?: string | null;
  frequency: string;
  amount: number;
  payee_id?: string | null;
  category_id?: string | null;
  transfer_account_id?: string | null;
  memo?: string | null;
  flag_color?: string | null;
  /** Required: the PATCH keeps existing lines when this is absent, so an unsplit schedule sends `[]`. */
  subtransactions: Array<{
    id?: string;
    amount: number;
    payee_id?: string | null;
    category_id?: string | null;
    transfer_account_id?: string | null;
    memo?: string | null;
  }>;
}

export interface ReconciliationMismatchDetail {
  name: "reconciliation_mismatch";
  current_reconciled_balance: number;
  projected_reconciled_balance: number;
  statement_balance: number;
  difference: number;
}

/**
 * The editable subset of a ledger transaction. Amounts are integer
 * milliunits, matching the V1 ledger API.
 */
export interface TransactionUpdateInput {
  date?: string;
  amount?: number;
  memo?: string | null;
  cleared?: "cleared" | "uncleared" | "reconciled";
  approved?: boolean;
  flag_color?: string | null;
  flag_name?: string | null;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  transfer_account_id?: string | null;
  subtransactions?: Array<{
    id: string;
    amount: number;
    payee_id?: string | null;
    payee_name?: string | null;
    category_id?: string | null;
    memo?: string | null;
    transfer_account_id?: string | null;
    transfer_transaction_id?: string | null;
  }>;
}

export interface SpendingBreakdownReport {
  total: number;
  groups: Array<{
    category_id: string;
    category_name: string;
    category_group_id: string;
    category_group_name: string;
    amount: number;
    share: number;
    transaction_count: number;
  }>;
}

export interface IncomeVsSpendingReport {
  interval: Interval;
  periods: Array<{
    period: string;
    income: number;
    spending: number;
    net: number;
    cumulative_net: number;
  }>;
}

export interface NetWorthReport {
  periods: Array<{
    period: string;
    end_date: string;
    net_worth: number;
    accounts: Array<{
      account_id: string;
      account_name: string;
      balance: number;
    }>;
  }>;
}

export interface AgeOfMoneyReport {
  interval: Interval;
  periods: Array<{
    period: string;
    age_of_money_days: number | null;
    spent: number;
    unmatched_spending: number;
  }>;
}

export interface RewardsReport {
  from: string | null;
  to: string | null;
  as_of?: string;
  period?: string;
  transaction_rewards?: Record<string, { reward: number; reward_dollars: number }>;
  group_by: "flag" | "payee" | "category" | "memo";
  miles_valuation: number;
  totals: {
    spend: number;
    reward_dollars: number;
    cashback: number;
    miles: number;
  };
  cards: Array<{
    card: {
      id: string;
      name: string;
      issuer: string;
      type: "cashback" | "miles";
      ynabAccountId: string;
      featured: boolean;
      /** The server sends the full CreditCard; the board reads the tiers for their labels. */
      spendingTiers?: Array<{ id: string; spendThreshold: number; earningRate?: number | null; maximumSpend?: number | null }>;
    };
    account_id: string;
    account_name: string;
    calculation: {
      period: string;
      periods?: Array<{ start: string; end: string; calculation: Omit<RewardsReport["cards"][number]["calculation"], "periods"> }>;
      qualification_status?: "not_required" | "met" | "pending" | "failed";
      monthly_qualifications?: Array<{ start: string; end: string; spend: number; minimumSpend: number; status: "met" | "pending" | "failed" }>;
      monthly_minimum_spend?: number | null;
      active_spending_tier_id?: string | null;
      has_next_spending_tier?: boolean;
      next_spending_tier_id?: string | null;
      next_spending_tier_threshold?: number | null;
      should_stop_using?: boolean;
      total_spend: number;
      counted_spend: number;
      eligible_spend: number;
      reward_earned: number;
      reward_earned_dollars: number;
      reward_type: "cashback" | "miles";
      minimum_spend: number | null;
      minimum_spend_met: boolean;
      minimum_spend_progress: number | null;
      /** The first day of the period on which the minimum was met; null when not met or there is none. */
      minimum_met_on?: string | null;
      maximum_spend: number | null;
      maximum_spend_exceeded: boolean;
      maximum_spend_progress: number | null;
      flags: Array<{
        subcategoryId: string;
        name: string;
        flagColor: string;
        totalSpend: number;
        eligibleSpend: number;
        rewardEarned: number;
        rewardEarnedDollars?: number;
        rewardRate?: number;
        countedSpend?: number;
        minimumSpend?: number | null;
        minimumSpendMet?: boolean;
        maximumSpend?: number | null;
        maximumSpendExceeded?: boolean;
        blockSize?: number | null;
      }>;
    };
  }>;
  groups: Array<{
    key: string;
    label: string;
    flag_color: string | null;
    spend: number;
    reward: number;
    reward_dollars: number;
    transaction_count: number;
  }>;
}

export interface QuickEntrySplitLine {
  amount: string;
  category_id: string | null;
  memo?: string | null;
}

export interface QuickEntryInput {
  client_id: string;
  account_id: string;
  date: string;
  amount: string;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id: string | null;
  memo: string | null;
  flag_color: string | null;
  subtransactions?: QuickEntrySplitLine[];
}

/** Per-account transaction counts over one inclusive date window. */
export interface AccountUsageSnapshot {
  usage: Array<{ account_id: string; count: number }>;
  days: number;
  since: string;
  until: string;
  server_knowledge: number;
}
