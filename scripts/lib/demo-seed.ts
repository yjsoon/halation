import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LedgerStore } from "../../apps/api/src/storage";

type DemoFixture = {
  plan: {
    id: string;
    name: string;
  };
  accounts: Array<Record<string, unknown>>;
  category_groups: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; group_id: string; name: string }>;
  transactions: Array<Record<string, unknown>>;
};

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const defaultFixturePath = join(repoRoot, "fixtures", "demo-ledger.json");

function resolveFixturePath(path = defaultFixturePath): string {
  return path;
}

function loadDemoFixture(path = defaultFixturePath): DemoFixture {
  return JSON.parse(readFileSync(path, "utf8")) as DemoFixture;
}

/** Seeds the fixture straight into a ledger store, such as an in-process D1 one. */
export async function seedDemoLedger(repo: LedgerStore, options?: {
  fixturePath?: string;
  planId?: string;
}): Promise<{ fixturePath: string; planId: string }> {
  const fixturePath = resolveFixturePath(options?.fixturePath);
  const fixture = loadDemoFixture(fixturePath);
  const planId = options?.planId ?? fixture.plan.id;

  await repo.ensurePlan(planId, fixture.plan.name);
  for (const account of fixture.accounts) {
    await repo.upsertAccount(planId, account);
  }
  for (const group of fixture.category_groups) {
    await repo.upsertCategoryGroup(planId, group);
  }
  for (const category of fixture.categories) {
    await repo.upsertCategory(planId, category, category.group_id);
  }
  for (const transaction of fixture.transactions) {
    await repo.createTransaction(planId, transaction as any);
  }
  return { fixturePath, planId };
}

/**
 * Seeds the same fixture through the public API of a running Worker, such as
 * `scripts/local-worker.sh start`. The plan must already exist if it should
 * carry the fixture's name: the API has no plan-rename route.
 */
export async function seedDemoLedgerOverHttp(options: {
  apiUrl: string;
  token: string;
  planId?: string;
  fixturePath?: string;
}): Promise<{ apiUrl: string; fixturePath: string; planId: string }> {
  const fixturePath = resolveFixturePath(options.fixturePath);
  const fixture = loadDemoFixture(fixturePath);
  const planId = options.planId ?? fixture.plan.id;
  const post = async (path: string, body: unknown) => {
    const response = await fetch(`${options.apiUrl}/v1/plans/${encodeURIComponent(planId)}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${options.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Seeding ${path} failed: ${response.status} ${await response.text()}`);
  };

  for (const account of fixture.accounts) await post("/accounts", { account });
  for (const group of fixture.category_groups) await post("/category_groups", { category_group: group });
  for (const category of fixture.categories) {
    await post("/categories", { category: { id: category.id, name: category.name, category_group_id: category.group_id } });
  }
  await post("/transactions", { transactions: fixture.transactions });

  return { apiUrl: options.apiUrl, fixturePath, planId };
}
