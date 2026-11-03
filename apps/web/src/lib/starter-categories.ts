import { api, ApiError } from "../api/client";

/**
 * The categories a new plan starts with, so the first transaction has
 * something to choose from. Same names and ids as `StarterCategories` on iOS:
 * ids derive from the plan and the names, so a repeat create is a replay or a
 * conflict, never a second copy, and a starter the user deleted keeps its id
 * and is not made again.
 *
 * Made after the first account, not at setup: a plan with only categories is
 * no longer empty, and an empty plan is what snapshot import (an iPhone
 * ledger moving to this server, or an archive restore) needs.
 */
const STARTER_GROUPS: ReadonlyArray<{ name: string; categories: readonly string[] }> = [
  { name: "Everyday", categories: ["Groceries", "Eating out", "Transport", "Shopping"] },
  { name: "Bills", categories: ["Housing", "Utilities", "Phone and internet", "Insurance"] },
  { name: "Life", categories: ["Health", "Entertainment", "Travel", "Gifts"] },
  { name: "Income", categories: ["Salary", "Other income"] },
];

function slug(name: string): string {
  return name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).join("-");
}

function markerKey(planId: string): string {
  return `halation.starterCategories.${planId}`;
}

function readMarker(planId: string): string | null {
  try {
    return localStorage.getItem(markerKey(planId));
  } catch {
    return null;
  }
}

function writeMarker(planId: string, value: "pending" | "done" | null): void {
  try {
    if (value) localStorage.setItem(markerKey(planId), value);
    else localStorage.removeItem(markerKey(planId));
  } catch {
    // Storage unavailable: the ids still keep a repeat from duplicating.
  }
}

/** A run started in this browser and has not yet finished every step. */
export function starterCategoriesPending(planId: string): boolean {
  return readMarker(planId) === "pending";
}

type Outcome = "present" | "retry" | "refused";

/**
 * A 409 conflict means the id is already taken: made earlier, or deleted
 * since. Other 4xx answers (a YNAB mirror plan, a viewer) will not change on
 * a retry; a network failure, 5xx, timeout, rate limit or lapsed session may.
 */
async function create(write: Promise<unknown>): Promise<Outcome> {
  try {
    await write;
    return "present";
  } catch (cause) {
    if (!(cause instanceof ApiError)) return "retry";
    if (cause.status === 409 && cause.code === "conflict") return "present";
    const transient = cause.status >= 500 || [401, 408, 429].includes(cause.status);
    return transient ? "retry" : "refused";
  }
}

/**
 * Creates whatever part of the starter set is missing. Best effort: an empty
 * category list is still a working ledger. The plan stays pending until every
 * step has succeeded, so a later load finishes a run cut short; once done it
 * is never seeded again. A plan with no live account is left empty, and one
 * that already has categories of its own, such as an imported ledger, is left
 * alone. Resolves true when it created any.
 */
export async function seedStarterCategories(planId: string): Promise<boolean> {
  if (readMarker(planId) === "done") return false;
  const prefix = `starter:${planId}:`;
  writeMarker(planId, "pending");
  const [{ accounts }, existing] = await Promise.all([api.accounts(planId), api.categories(planId)]);
  if (!accounts.some((account) => !account.deleted)) {
    // Not this plan's first account yet, or a recreated server under the
    // same plan id: an empty plan stays empty so a snapshot can import.
    writeMarker(planId, null);
    return false;
  }
  if (existing.some((group) => !group.id.startsWith(prefix))) {
    writeMarker(planId, "done");
    return false;
  }
  const present = new Set(existing.flatMap((group) => [group.id, ...(group.categories ?? []).map((category) => category.id)]));
  const outcomes: Outcome[] = [];
  for (const group of STARTER_GROUPS) {
    const groupId = `${prefix}grp:${slug(group.name)}`;
    if (!present.has(groupId)) {
      const outcome = await create(api.createCategoryGroup(planId, groupId, group.name));
      outcomes.push(outcome);
      if (outcome !== "present") continue;
    }
    outcomes.push(...await Promise.all(group.categories
      .map((name) => ({ id: `${prefix}cat:${slug(name)}`, name }))
      .filter((category) => !present.has(category.id))
      .map((category) => create(api.createCategory(planId, category.id, groupId, category.name)))));
  }
  if (!outcomes.includes("retry")) writeMarker(planId, "done");
  return outcomes.includes("present");
}
