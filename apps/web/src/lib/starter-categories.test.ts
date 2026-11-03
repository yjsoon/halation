import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { API_TOKEN, count, nativeHarness, type NativeHarness } from "../../../api/tests/helpers/native-harness";
import { seedStarterCategories, starterCategoriesPending } from "./starter-categories";

// Failure modes the browser flow does not reliably show, run against the real
// API handler on both storage backends:
// - A create that fails part-way (network drop, 5xx) must not mark the plan
//   done, or this browser never finishes the set.
// - A retry after a partial run must fill the gaps without a second copy of
//   anything already made.
// - A plan that already holds the user's own categories (an imported ledger)
//   must not get starters added beside them.

const STARTER_GROUPS = 4;
const STARTER_CATEGORIES = 14;

let harness: NativeHarness;
/** Drops matching writes as a network failure would. */
let failWhen: (path: string) => boolean = () => false;
const realFetch = globalThis.fetch;

beforeEach(async () => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
  };
  failWhen = () => false;
  harness = await nativeHarness("SQLite");
  globalThis.fetch = (async (input: string, init: RequestInit = {}) => {
    const path = String(input);
    if (init.method === "POST" && failWhen(path)) throw new TypeError("Failed to fetch");
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${API_TOKEN}`);
    return harness.handle(new Request(`https://howmuch.test${path}`, { ...init, headers }));
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  harness.close();
});

const groups = () => count(harness.db, "SELECT COUNT(*) AS n FROM category_groups WHERE plan_id = 'p'");
const categories = () => count(harness.db, "SELECT COUNT(*) AS n FROM categories WHERE plan_id = 'p'");

describe("seedStarterCategories", () => {
  test("a partial run stays pending and a retry completes it without duplicates", async () => {
    let dropped = 0;
    failWhen = (path) => path.endsWith("/categories") && dropped++ < 3;
    await seedStarterCategories("p");
    expect(categories()).toBe(STARTER_CATEGORIES - 3);
    expect(starterCategoriesPending("p")).toBe(true);

    failWhen = () => false;
    expect(await seedStarterCategories("p")).toBe(true);
    expect(groups()).toBe(STARTER_GROUPS);
    expect(categories()).toBe(STARTER_CATEGORIES);
    expect(starterCategoriesPending("p")).toBe(false);
  });

  test("a failed group is retried with its categories", async () => {
    failWhen = (path) => path.endsWith("/category_groups");
    await seedStarterCategories("p");
    expect(groups()).toBe(0);
    expect(starterCategoriesPending("p")).toBe(true);

    failWhen = () => false;
    await seedStarterCategories("p");
    expect(groups()).toBe(STARTER_GROUPS);
    expect(categories()).toBe(STARTER_CATEGORIES);
  });

  test("a starter the user deleted after a complete run is not made again", async () => {
    await seedStarterCategories("p");
    expect((await harness.request("/v1/plans/p/categories/starter:p:cat:gifts", { method: "DELETE" })).status).toBe(200);
    expect(await seedStarterCategories("p")).toBe(false);
    expect(count(harness.db, "SELECT COUNT(*) AS n FROM categories WHERE plan_id = 'p' AND deleted = 0")).toBe(STARTER_CATEGORIES - 1);
  });

  test("leaves a plan with the user's own categories alone", async () => {
    await harness.request("/v1/plans/p/category_groups", { method: "POST", body: { category_group: { id: "grp-mine", name: "Living" } } });
    await harness.request("/v1/plans/p/categories", { method: "POST", body: { category: { id: "cat-mine", category_group_id: "grp-mine", name: "Food" } } });
    expect(await seedStarterCategories("p")).toBe(false);
    expect(groups()).toBe(1);
    expect(categories()).toBe(1);
    expect(starterCategoriesPending("p")).toBe(false);
  });
});
