function isMinimumSpendConfigured(minimumSpend: number | null | undefined): minimumSpend is number {
  return typeof minimumSpend === 'number';
}

function hasMinimumSpendRequirement(minimumSpend: number | null | undefined): minimumSpend is number {
  return isMinimumSpendConfigured(minimumSpend) && minimumSpend > 0;
}

export function isMinimumSpendMet(
  totalSpend: number,
  minimumSpend: number | null | undefined
): boolean {
  if (!hasMinimumSpendRequirement(minimumSpend)) {
    return true;
  }
  return totalSpend >= minimumSpend;
}

export function calculateMinimumSpendProgress(
  totalSpend: number,
  minimumSpend: number | null | undefined
): number | undefined {
  if (!hasMinimumSpendRequirement(minimumSpend)) {
    return undefined;
  }
  return Math.min(100, (totalSpend / minimumSpend) * 100);
}

function isMaximumSpendConfigured(maximumSpend: number | null | undefined): maximumSpend is number {
  return typeof maximumSpend === 'number';
}

function hasMaximumSpendLimit(maximumSpend: number | null | undefined): maximumSpend is number {
  return isMaximumSpendConfigured(maximumSpend) && maximumSpend > 0;
}

export function isMaximumSpendExceeded(
  totalSpend: number,
  maximumSpend: number | null | undefined
): boolean {
  if (!hasMaximumSpendLimit(maximumSpend)) {
    return false;
  }
  return totalSpend >= maximumSpend;
}

export function calculateMaximumSpendProgress(
  totalSpend: number,
  maximumSpend: number | null | undefined
): number | undefined {
  if (!hasMaximumSpendLimit(maximumSpend)) {
    return undefined;
  }
  return Math.min(100, (totalSpend / maximumSpend) * 100);
}
