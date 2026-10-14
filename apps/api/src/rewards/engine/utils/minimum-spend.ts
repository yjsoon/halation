export function isMinimumSpendConfigured(minimumSpend: number | null | undefined): minimumSpend is number {
  return typeof minimumSpend === 'number';
}

export function hasMinimumSpendRequirement(minimumSpend: number | null | undefined): minimumSpend is number {
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

export function getMinimumSpendStatus(minimumSpend: number | null | undefined):
  'not-configured' | 'no-minimum' | 'has-minimum' {
  if (!isMinimumSpendConfigured(minimumSpend)) {
    return 'not-configured';
  }
  return hasMinimumSpendRequirement(minimumSpend) ? 'has-minimum' : 'no-minimum';
}

export function formatMinimumSpendText(minimumSpend: number | null | undefined): string {
  if (!isMinimumSpendConfigured(minimumSpend)) {
    return 'Not configured';
  }
  if (!hasMinimumSpendRequirement(minimumSpend)) {
    return 'No minimum required';
  }
  return `$${minimumSpend.toLocaleString()} required`;
}

export function isMaximumSpendConfigured(maximumSpend: number | null | undefined): maximumSpend is number {
  return typeof maximumSpend === 'number';
}

export function hasMaximumSpendLimit(maximumSpend: number | null | undefined): maximumSpend is number {
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

export function getMaximumSpendStatus(maximumSpend: number | null | undefined):
  'not-configured' | 'no-limit' | 'has-limit' {
  if (!isMaximumSpendConfigured(maximumSpend)) {
    return 'not-configured';
  }
  return hasMaximumSpendLimit(maximumSpend) ? 'has-limit' : 'no-limit';
}

export function formatMaximumSpendText(maximumSpend: number | null | undefined): string {
  if (!isMaximumSpendConfigured(maximumSpend)) {
    return 'Not configured';
  }
  if (!hasMaximumSpendLimit(maximumSpend)) {
    return 'No limit';
  }
  return `$${maximumSpend.toLocaleString()} limit`;
}

export function calculateEligibleSpend(
  totalSpend: number,
  maximumSpend: number | null | undefined
): number {
  if (!hasMaximumSpendLimit(maximumSpend)) {
    return totalSpend;
  }
  return Math.min(totalSpend, maximumSpend);
}
