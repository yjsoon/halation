import type { CardSubcategory, CreditCard } from '../../types';
import { UNFLAGGED_FLAG, FLAG_COLORS, type FlagColor } from '../../flags';

interface SubcategoryContext {
  enabled: boolean;
  activeSubcategories: CardSubcategory[];
  map: Map<FlagColor, CardSubcategory>;
  fallback?: CardSubcategory;
}

const FLAG_COLOUR_SET: Set<FlagColor> = new Set([
  UNFLAGGED_FLAG.value,
  ...FLAG_COLORS.map((flag) => flag.value),
]);

export function normaliseFlagColor(flagColor?: string | null): FlagColor {
  if (!flagColor) {
    return UNFLAGGED_FLAG.value;
  }

  const lowered = flagColor.toLowerCase() as FlagColor;
  return FLAG_COLOUR_SET.has(lowered) ? lowered : UNFLAGGED_FLAG.value;
}

export function createSubcategoryContext(card: CreditCard): SubcategoryContext {
  const enabled = Boolean(card.subcategoriesEnabled);
  const rawSubcategories = Array.isArray(card.subcategories) ? card.subcategories : [];
  const activeSubcategories = enabled
    ? rawSubcategories
        .filter((subcategory) => subcategory && subcategory.active !== false)
        .sort((a, b) => a.priority - b.priority)
    : [];

  const map = new Map<FlagColor, CardSubcategory>();
  for (const subcategory of activeSubcategories) {
    map.set(subcategory.flagColor, subcategory);
  }

  const fallback = enabled ? map.get(UNFLAGGED_FLAG.value) : undefined;

  return {
    enabled,
    activeSubcategories,
    map,
    fallback,
  };
}

export function resolveSubcategory(
  context: SubcategoryContext,
  flagColor: FlagColor
): CardSubcategory | undefined {
  if (!context.enabled) {
    return undefined;
  }

  return context.map.get(flagColor) ?? context.fallback;
}