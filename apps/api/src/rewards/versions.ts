import type { CardRules, CardRuleVersion, CreditCard } from "@howmuch/contract";
import { SimpleRewardsCalculator } from "./engine/simple-calculator";
import { parseYnabDate } from "./engine/date-utils";

/**
 * A card's rules change by reward period and keep their history, so a later
 * edit never changes rewards already earned. Period settings (billing cycle,
 * reward period, promotion) are not versioned.
 */
const CARD_RULE_FIELDS = [
  "earningRate",
  "earningBlockSize",
  "minimumSpend",
  "maximumSpend",
  "subcategoriesEnabled",
  "subcategories",
  "spendingTiers",
  "flagNames",
] as const satisfies ReadonlyArray<keyof CardRules>;

/** When a rule change applies: from a reward period's first day, or to every period. */
export type RuleChangeScope = string | "everywhere";

export function cardRules(card: CardRules): CardRules {
  const rules: Record<string, unknown> = {};
  for (const field of CARD_RULE_FIELDS) {
    if (card[field] !== undefined) rules[field] = card[field];
  }
  return rules as CardRules;
}

/** The card as it applied to the reward period that starts on `periodStart`. */
export function cardForPeriod(card: CreditCard, periodStart: string): CreditCard {
  const version = card.ruleHistory?.find((entry) => periodStart < entry.until);
  if (!version) return card;
  const base: Record<string, unknown> = { ...card };
  for (const field of CARD_RULE_FIELDS) delete base[field];
  return { ...base, ...version.rules } as CreditCard;
}

/** The card as it applied on `date`: the rules of the reward period containing it. */
export function cardOnDate(card: CreditCard, date: string): CreditCard {
  if (!card.ruleHistory?.length) return card;
  return cardForPeriod(card, SimpleRewardsCalculator.calculatePeriod(card, parseYnabDate(date)).start);
}

/** The first days of the reward period containing `today` and of the one after it. */
export function ruleChangeDates(card: CreditCard, today: string): { current: string; next: string } {
  const period = SimpleRewardsCalculator.calculatePeriod(card, parseYnabDate(today));
  const next = new Date(`${period.end}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { current: period.start, next: next.toISOString().slice(0, 10) };
}

/**
 * `next` with its rule history after saving it over `existing`. A date keeps
 * the earlier rules for periods before it and replaces any rules from it on.
 * "everywhere" applies only the edited fields to every earlier rule set. No
 * scope (older clients) edits the latest rules and leaves the history alone.
 */
export function withRuleHistory(existing: CreditCard, next: CreditCard, scope: RuleChangeScope | undefined): CreditCard {
  const history = existing.ruleHistory ?? [];
  const before = cardRules(existing);
  const after = cardRules(next);
  let updated: CardRuleVersion[] = history;
  if (scope !== undefined && !sameRules(before, after)) {
    if (scope === "everywhere") {
      updated = history.map((entry) => ({ until: entry.until, rules: applyChange(before, after, entry.rules) as CardRules }));
    } else {
      updated = history.filter((entry) => entry.until <= scope);
      if (updated.at(-1)?.until !== scope) {
        updated.push({ until: scope, rules: history.find((entry) => entry.until > scope)?.rules ?? before });
      }
    }
  }
  // A boundary between equal rule sets changes nothing.
  const tidy = updated.filter((entry, index) => !sameRules(entry.rules, updated[index + 1]?.rules ?? after));
  const { ruleHistory: _ignored, ...card } = next;
  return tidy.length ? { ...card, ruleHistory: tidy } : card;
}

function sameRules(left: unknown, right: unknown): boolean {
  return comparable(left) === comparable(right);
}

/** Sorted keys, no undefined fields, and no edit timestamps: they change on every save. */
function comparable(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(comparable).join(",")}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row)
    .filter((key) => row[key] !== undefined && key !== "createdAt" && key !== "updatedAt")
    .sort()
    .map((key) => `${JSON.stringify(key)}:${comparable(row[key])}`)
    .join(",")}}`;
}

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIdList(value: unknown): value is Array<Row & { id: string }> {
  return Array.isArray(value) && value.every((entry) => isRow(entry) && typeof entry.id === "string");
}

/** Applies the difference between `before` and `after` to `target`, field by field and item by item. */
function applyChange(before: unknown, after: unknown, target: unknown): unknown {
  if (sameRules(before, after)) return target;
  if (isIdList(before) && isIdList(after) && isIdList(target)) {
    const was = new Map(before.map((entry) => [entry.id, entry]));
    const now = new Map(after.map((entry) => [entry.id, entry]));
    const result = target.flatMap((entry) => {
      if (was.has(entry.id) && !now.has(entry.id)) return [];
      if (was.has(entry.id) && now.has(entry.id)) return [applyChange(was.get(entry.id), now.get(entry.id), entry)];
      return [entry];
    });
    const present = new Set(target.map((entry) => entry.id));
    for (const entry of after) if (!was.has(entry.id) && !present.has(entry.id)) result.push(entry);
    return result;
  }
  // A rule set without this object gets only the edited keys, not the rest of it.
  if (isRow(before) && isRow(after) && (isRow(target) || target === undefined)) {
    const result: Row = { ...target };
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (sameRules(before[key], after[key])) continue;
      if (after[key] === undefined) delete result[key];
      else result[key] = applyChange(before[key], after[key], (target as Row | undefined)?.[key]);
    }
    return result;
  }
  return after;
}
