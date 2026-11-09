import { createId } from "../ids";
import { NotFoundError, ValidationError } from "../repository";
import { sanitizeSettings } from "../importers/rewards-tracker";
import type { LedgerStore } from "../storage";
import { cardFlagNames, flagNameForColour } from "./flag-names";
import { parseAppSettings, parseCreditCardWrite } from "./parse";
import type { AppSettings, CreditCard } from "./types";
import { rewardsToday } from "./engine/date-utils";
import { cardOnDate, ruleChangeDates, withRuleHistory, type RuleChangeScope } from "./versions";

export class RewardsAccountError extends Error {}

export async function createRewardsCard(repo: LedgerStore, planId: string, raw: unknown): Promise<CreditCard> {
  const draft = asCardObject(raw);
  const accountId = requireLiveAccountId(draft.ynabAccountId);
  if (!await repo.findLiveAccountId(planId, accountId)) {
    throw new RewardsAccountError("ynabAccountId must match a live account");
  }
  const id = optionalString(draft.id) ?? createId("card");
  const card = parseCreditCardWrite({ ...draft, id, ynabAccountId: accountId });
  await repo.upsertRewardsTrackerCard(planId, card);
  return card;
}

/**
 * `appliesFrom` is the first day of the reward period the rule change starts
 * in, "current_period" or "next_period" for the card's own period starts, or
 * "everywhere" to correct every period. Without it (older clients) the latest
 * rules change in place and earlier rules stay as they were.
 */
export async function patchRewardsCard(
  repo: LedgerStore,
  planId: string,
  cardId: string,
  raw: unknown,
  appliesFrom?: unknown,
): Promise<CreditCard> {
  const requested = parseRuleChangeScope(appliesFrom);
  const existing = findLiveCard((await repo.getRewardsTrackerSnapshot(planId)).cards, cardId);
  if (!existing) throw new NotFoundError("Rewards card not found");
  const draft: Record<string, unknown> = { ...existing, ...asCardObject(raw), id: cardId };
  const accountId = requireLiveAccountId(draft.ynabAccountId);
  if (!await repo.findLiveAccountId(planId, accountId)) {
    throw new RewardsAccountError("ynabAccountId must match a live account");
  }
  // The server owns the history: a client's copy may be stale.
  const previous = parseCreditCardWrite({ ...existing, ynabAccountId: accountId });
  const scope = requested === "current_period" || requested === "next_period"
    ? ruleChangeDates(previous, rewardsToday())[requested === "current_period" ? "current" : "next"]
    : requested;
  const next = parseCreditCardWrite({ ...draft, ynabAccountId: accountId, ruleHistory: undefined });
  const card = withRuleHistory(previous, next, scope);
  // Only the card changes. Transactions keep the name they were flagged
  // with: a rename applies to flags set from now on, not to history.
  await repo.upsertRewardsTrackerCard(planId, card);
  return card;
}

function parseRuleChangeScope(value: unknown): RuleChangeScope | "current_period" | "next_period" | undefined {
  if (value == null) return undefined;
  if (value === "everywhere" || value === "current_period" || value === "next_period") return value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value) {
    return value;
  }
  throw new ValidationError("applies_from must be a YYYY-MM-DD date, current_period, next_period or everywhere");
}

export async function stampTransactionFlagName(
  repo: LedgerStore,
  planId: string,
  accountId: string,
  patch: { flag_color?: string | null; flag_name?: string | null; date?: unknown },
  /** The transaction's date when the patch does not change it; defaults to today. */
  date?: string,
): Promise<void> {
  if (!Object.prototype.hasOwnProperty.call(patch, "flag_color")) return;
  if (Object.prototype.hasOwnProperty.call(patch, "flag_name")) return;
  const stored = await repo.getRewardsTrackerSnapshot(planId);
  const card = stored.cards.find((entry) => {
    return Boolean(entry && typeof entry === "object" && !Array.isArray(entry) && (entry as { ynabAccountId?: string }).ynabAccountId === accountId);
  }) as CreditCard | undefined;
  if (!card) return;
  // The name in force on the transaction's date, not a later one.
  const on = typeof patch.date === "string" ? patch.date : date ?? rewardsToday();
  patch.flag_name = flagNameForColour(cardFlagNames(cardOnDate(card, on)), patch.flag_color ?? null);
}

export async function deleteRewardsCard(repo: LedgerStore, planId: string, cardId: string): Promise<object> {
  const deleted = await repo.deleteRewardsTrackerCard(planId, cardId);
  if (!deleted) throw new NotFoundError("Rewards card not found");
  return deleted;
}

export async function patchRewardsSettings(repo: LedgerStore, planId: string, raw: unknown): Promise<AppSettings> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ValidationError("Settings must be a JSON object");
  }
  const patch = parseSettingsWrite(raw as Record<string, unknown>);
  const stored = await repo.getRewardsTrackerSnapshot(planId);
  const settings = sanitizeSettings({ ...settingsObject(stored.snapshot), ...patch });
  const saved = await repo.patchRewardsTrackerSettings(planId, settings);
  return parseAppSettings(saved);
}

function parseSettingsWrite(body: Record<string, unknown>): { milesValuation?: number } {
  if (!Object.prototype.hasOwnProperty.call(body, "milesValuation") || body.milesValuation === undefined) {
    return {};
  }
  if (typeof body.milesValuation !== "number" || !Number.isFinite(body.milesValuation)) {
    throw new ValidationError("milesValuation must be a finite number");
  }
  if (body.milesValuation < 0) {
    throw new ValidationError("milesValuation must be nonnegative");
  }
  return { milesValuation: body.milesValuation };
}

function asCardObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("Card must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function requireLiveAccountId(value: unknown): string {
  const accountId = optionalString(value);
  if (!accountId) throw new RewardsAccountError("Card ynabAccountId is required");
  return accountId;
}

function findLiveCard(cards: unknown[], cardId: string): Record<string, unknown> | null {
  for (const entry of cards) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const card = entry as Record<string, unknown>;
    if (optionalString(card.id) === cardId) return card;
  }
  return null;
}

function settingsObject(snapshot: unknown): Record<string, unknown> {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return {};
  const settings = (snapshot as { settings?: unknown }).settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
  return settings as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
