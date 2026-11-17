import { FLAG_COLOURS, isFlagColour, type RewardFlagColour } from "./flags";

export const REWARD_NAME_COLOURS: readonly RewardFlagColour[] = [...FLAG_COLOURS, "unflagged"];

export function parseRewardFlagNames(value: unknown): Partial<Record<RewardFlagColour, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const names: Partial<Record<RewardFlagColour, string>> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const colour: RewardFlagColour | null = key === "unflagged" ? "unflagged" : isFlagColour(key) ? key : null;
    if (!colour || typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed) names[colour] = trimmed;
  }
  return names;
}

export function namesFromSubcategories(
  flags: Array<{ flagColor: RewardFlagColour; name: string }>,
): Partial<Record<RewardFlagColour, string>> {
  const names: Partial<Record<RewardFlagColour, string>> = {};
  for (const flag of flags) {
    const trimmed = flag.name.trim();
    if (trimmed && !names[flag.flagColor]) names[flag.flagColor] = trimmed;
  }
  return names;
}

export function ledgerFlagNames(names: Partial<Record<RewardFlagColour, string>>): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const colour of FLAG_COLOURS) {
    const name = names[colour]?.trim();
    if (name) mapped[colour] = name;
  }
  const unflagged = names.unflagged?.trim();
  if (unflagged) mapped[""] = unflagged;
  return mapped;
}

export function namedFlagLabel(
  names: Partial<Record<RewardFlagColour, string>> | undefined,
  colour: string | null | undefined,
  fallback?: string | null,
): string | undefined {
  // A row's stored name is the one it was flagged with and wins over the
  // card's current name, so renaming a colour does not relabel history.
  const stored = fallback?.trim();
  if (stored) return stored;
  const key: RewardFlagColour | null = !colour ? "unflagged" : isFlagColour(colour) ? colour : null;
  return (key ? names?.[key]?.trim() : undefined) || undefined;
}

function sameFlagColour(left: string | null | undefined, right: string | null | undefined): boolean {
  return (left || null) === (right || null);
}

export function snapshotFlagLabel(
  names: Partial<Record<RewardFlagColour, string>> | undefined,
  colour: string | null | undefined,
  snapshot: { flag_color?: string | null; flag_name?: string | null },
): string | undefined {
  return namedFlagLabel(
    names,
    colour,
    sameFlagColour(colour, snapshot.flag_color) ? snapshot.flag_name : undefined,
  );
}

function colourNamesForCard(card: {
  flagNames?: Record<string, string>;
  subcategories?: Array<{ flagColor: RewardFlagColour; name: string }>;
}): Partial<Record<RewardFlagColour, string>> {
  return {
    ...namesFromSubcategories(card.subcategories ?? []),
    ...parseRewardFlagNames(card.flagNames),
  };
}

export function colourNamesByAccount(
  cards: Array<{
    ynabAccountId: string;
    flagNames?: Record<string, string>;
    subcategories?: Array<{ flagColor: RewardFlagColour; name: string }>;
  }> | undefined,
): Map<string, Partial<Record<RewardFlagColour, string>>> {
  const mapped = new Map<string, Partial<Record<RewardFlagColour, string>>>();
  for (const card of cards ?? []) {
    if (mapped.has(card.ynabAccountId)) continue;
    mapped.set(card.ynabAccountId, colourNamesForCard(card));
  }
  return mapped;
}

/**
 * Rewards' By flag groups, named as the register names the same rows. A row
 * flagged before its colour had a name is grouped under the bare colour; that
 * group takes the name the report's cards give the colour now and joins the
 * group already under that name. When the cards name the colour differently
 * the report cannot tell their rows apart, so the colour stays.
 */
export function namedFlagGroups<Group extends {
  key: string;
  label: string;
  flag_color: string | null;
  spend: number;
  reward: number;
  reward_dollars: number;
  transaction_count: number;
}>(
  groups: Group[],
  cards: Array<Parameters<typeof colourNamesForCard>[0]>,
): Group[] {
  const names = cards.map(colourNamesForCard);
  const merged = new Map<string, Group>();
  for (const group of groups) {
    const colour = group.flag_color;
    let label = group.label;
    if (isFlagColour(colour) && group.key === `flag:${colour}`) {
      const current = new Set(names.map((entry) => entry[colour]?.trim()).filter(Boolean));
      if (current.size === 1) label = [...current][0]!;
    }
    const key = `${colour ?? ""}:${label}`;
    const earlier = merged.get(key);
    merged.set(key, earlier ? {
      ...earlier,
      spend: earlier.spend + group.spend,
      reward: earlier.reward + group.reward,
      reward_dollars: earlier.reward_dollars + group.reward_dollars,
      transaction_count: earlier.transaction_count + group.transaction_count,
    } : { ...group, label });
  }
  return [...merged.values()].sort((left, right) => right.spend - left.spend || left.key.localeCompare(right.key));
}
