import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import { applyMigrations } from "../db";
import { LedgerRepository, NotFoundError, ValidationError } from "../repository";
import { parseCreditCardWrite } from "./parse";
import {
  createRewardsCard,
  deleteRewardsCard,
  patchRewardsCard,
  patchRewardsSettings,
  RewardsAccountError,
  stampTransactionFlagName,
} from "./write";

let db: Database;
let repo: LedgerRepository;

beforeEach(async () => {
  db = new Database(":memory:");
  applyMigrations(db);
  repo = new LedgerRepository(db, "plan-test");
  await repo.upsertAccount("plan-test", { id: "acct-rewards", name: "Rewards Card", type: "creditCard" });
});

afterEach(() => {
  db.close();
});

describe("parseCreditCardWrite", () => {
  test("strips secrets and unknown keys", () => {
    const card = parseCreditCardWrite({
      id: "card-1",
      name: "Everyday",
      issuer: "DBS",
      type: "cashback",
      ynabAccountId: "acct-rewards",
      earningRate: 1.5,
      pat: "secret-pat",
      howmuchToken: "secret-howmuch",
      cachedData: { flagNames: {} },
      cloudSyncMnemonic: "one two three",
      settings: { cloudSyncMnemonic: "nested" },
    });

    expect(card).toEqual({
      id: "card-1",
      name: "Everyday",
      issuer: "DBS",
      type: "cashback",
      ynabAccountId: "acct-rewards",
      featured: true,
      earningRate: 1.5,
    });
    expect(card).not.toHaveProperty("pat");
    expect(card).not.toHaveProperty("howmuchToken");
    expect(card).not.toHaveProperty("cachedData");
    expect(card).not.toHaveProperty("cloudSyncMnemonic");
    expect(card).not.toHaveProperty("settings");
  });

});

describe("native rewards card writes", () => {
  test("valuation writes preserve zero and omissions and reject negative or nonnumeric values", async () => {
    await patchRewardsSettings(repo, "plan-test", { milesValuation: 0.03 });
    expect((await patchRewardsSettings(repo, "plan-test", {})).milesValuation).toBe(0.03);
    expect((await patchRewardsSettings(repo, "plan-test", { milesValuation: 0 })).milesValuation).toBe(0);
    for (const milesValuation of [-0.01, null, "0.02", Infinity, NaN]) {
      await expect(patchRewardsSettings(repo, "plan-test", { milesValuation })).rejects.toThrow(ValidationError);
    }
    expect((await patchRewardsSettings(repo, "plan-test", {})).milesValuation).toBe(0);
  });

  test("creates a card and a portable snapshot without wiping siblings", async () => {
    const first = await createRewardsCard(repo, "plan-test", {
      id: "card-cash",
      name: "Cash",
      issuer: "UOB",
      type: "cashback",
      ynabAccountId: "acct-rewards",
      earningRate: 1,
    });
    const second = await createRewardsCard(repo, "plan-test", {
      name: "Miles",
      issuer: "DBS",
      type: "miles",
      ynabAccountId: "acct-rewards",
      earningRate: 1.2,
    });

    expect(first.id).toBe("card-cash");
    expect(second.id).toStartWith("card_");
    const stored = await repo.getRewardsTrackerSnapshot("plan-test");
    expect(stored.cards).toEqual([
      expect.objectContaining({ id: "card-cash", type: "cashback" }),
      expect.objectContaining({ id: second.id, type: "miles" }),
    ]);
    expect((stored.snapshot as { cards: unknown[] }).cards).toHaveLength(2);
  });

  test("soft-deletes one card without emptying the snapshot", async () => {
    await createRewardsCard(repo, "plan-test", {
      id: "card-keep",
      name: "Keep",
      type: "cashback",
      ynabAccountId: "acct-rewards",
    });
    await createRewardsCard(repo, "plan-test", {
      id: "card-drop",
      name: "Drop",
      type: "cashback",
      ynabAccountId: "acct-rewards",
    });

    const deleted = await deleteRewardsCard(repo, "plan-test", "card-drop");
    expect(deleted).toMatchObject({ id: "card-drop", name: "Drop" });
    expect(await repo.deleteRewardsTrackerCard("plan-test", "card-drop")).toBeNull();
    await expect(deleteRewardsCard(repo, "plan-test", "card-drop")).rejects.toThrow(NotFoundError);

    const stored = await repo.getRewardsTrackerSnapshot("plan-test");
    expect(stored.cards).toEqual([expect.objectContaining({ id: "card-keep" })]);
    expect((stored.snapshot as { cards: Array<{ id: string }> }).cards.map((card) => card.id)).toEqual(["card-keep"]);
    expect(db.query("SELECT deleted FROM rewards_tracker_cards WHERE id='card-drop'").get()).toEqual({ deleted: 1 });
  });

  test("rejects an unknown account without writing a row", async () => {
    await expect(createRewardsCard(repo, "plan-test", {
      name: "Ghost",
      type: "cashback",
      ynabAccountId: "acct-missing",
    })).rejects.toThrow(RewardsAccountError);
    expect(db.query("SELECT COUNT(*) AS count FROM rewards_tracker_cards").get()).toEqual({ count: 0 });
  });

  test("rejects a missing account id", async () => {
    await expect(createRewardsCard(repo, "plan-test", {
      name: "Ghost",
      type: "cashback",
    })).rejects.toBeInstanceOf(RewardsAccountError);
    expect(db.query("SELECT COUNT(*) AS count FROM rewards_tracker_cards").get()).toEqual({ count: 0 });
  });

  test("replaces stored settings with the sanitised merge", async () => {
    await repo.upsertRewardsTrackerSnapshot("plan-test", {
      ynab: { trackedAccountIds: [] },
      cards: [],
      settings: { currency: "SGD", cloudSyncMnemonic: "keep-me-not" },
    });

    const settings = await patchRewardsSettings(repo, "plan-test", {
      milesValuation: 0.04,
      cloudSyncMnemonic: "do not store",
    });
    const stored = await repo.getRewardsTrackerSnapshot("plan-test");
    const snapshotSettings = (stored.snapshot as { settings: Record<string, unknown> }).settings;

    expect(settings).toMatchObject({ currency: "SGD", milesValuation: 0.04 });
    expect(snapshotSettings).toEqual({ currency: "SGD", milesValuation: 0.04 });
    expect(snapshotSettings).not.toHaveProperty("cloudSyncMnemonic");
  });

  test("a card save keeps the names old transactions were flagged with", async () => {
    // Categories change over time: renaming or removing a colour's name must
    // not reach back into transactions already flagged under the old name.
    await repo.createTransaction("plan-test", {
      id: "txn-red",
      account_id: "acct-rewards",
      date: "2026-03-02",
      amount: -1000,
      flag_color: "red",
      flag_name: "Dining",
    });
    await repo.createTransaction("plan-test", {
      id: "txn-blue",
      account_id: "acct-rewards",
      date: "2026-03-03",
      amount: -2000,
      flag_color: "blue",
    });

    const card = await createRewardsCard(repo, "plan-test", {
      id: "card-travel",
      name: "Travel Card",
      type: "cashback",
      ynabAccountId: "acct-rewards",
      flagNames: { red: "Food", blue: "Online" },
    });
    expect(card.flagNames).toEqual({ red: "Food", blue: "Online" });
    await patchRewardsCard(repo, "plan-test", "card-travel", { flagNames: { red: "Groceries" } });
    await patchRewardsCard(repo, "plan-test", "card-travel", { flagNames: {} });

    expect((await repo.getTransaction("plan-test", "txn-red")).flag_name).toBe("Dining");
    expect((await repo.getTransaction("plan-test", "txn-blue")).flag_name).toBeNull();
  });

  test("does not wipe existing flag names when colour names are omitted", async () => {
    await repo.createTransaction("plan-test", {
      id: "txn-named",
      account_id: "acct-rewards",
      date: "2026-03-02",
      amount: -1000,
      flag_color: "red",
      flag_name: "Dining",
    });
    await createRewardsCard(repo, "plan-test", {
      id: "card-unnamed",
      name: "Travel Card",
      type: "cashback",
      ynabAccountId: "acct-rewards",
    });
    expect((await repo.getTransaction("plan-test", "txn-named")).flag_name).toBe("Dining");
  });

  test("stamps a transaction flag name from the tracked card", async () => {
    await createRewardsCard(repo, "plan-test", {
      id: "card-travel",
      name: "Travel Card",
      type: "cashback",
      ynabAccountId: "acct-rewards",
      flagNames: { red: "Dining" },
    });
    const stamped: { flag_color?: string | null; flag_name?: string | null } = { flag_color: "red" };
    await stampTransactionFlagName(repo, "plan-test", "acct-rewards", stamped);
    expect(stamped.flag_name).toBe("Dining");

    const unnamed: { flag_color?: string | null; flag_name?: string | null } = { flag_color: "orange" };
    await stampTransactionFlagName(repo, "plan-test", "acct-rewards", unnamed);
    expect(unnamed.flag_name).toBeNull();

    const explicit: { flag_color?: string | null; flag_name?: string | null } = { flag_color: "red", flag_name: "Keep me" };
    await stampTransactionFlagName(repo, "plan-test", "acct-rewards", explicit);
    expect(explicit.flag_name).toBe("Keep me");

    const other: { flag_color?: string | null; flag_name?: string | null } = { flag_color: "red" };
    await stampTransactionFlagName(repo, "plan-test", "acct-missing", other);
    expect(other).not.toHaveProperty("flag_name");
  });

  describe("rule history", () => {
    const base = {
      id: "card-history", name: "Travel Card", type: "miles", ynabAccountId: "acct-rewards",
      earningRate: 2, flagNames: { red: "Dining", blue: "Onlin" },
    };

    test("a change from a date keeps the earlier rules for earlier periods", async () => {
      await createRewardsCard(repo, "plan-test", base);
      const card = await patchRewardsCard(repo, "plan-test", "card-history",
        { earningRate: 3, flagNames: { red: "Food", blue: "Onlin" } }, "2026-05-01");
      expect(card.earningRate).toBe(3);
      expect(card.ruleHistory).toEqual([
        { until: "2026-05-01", rules: { earningRate: 2, flagNames: { red: "Dining", blue: "Onlin" } } },
      ]);
      // A second save in the same period edits that period's rules, not a new version.
      const again = await patchRewardsCard(repo, "plan-test", "card-history", { earningRate: 4 }, "2026-05-01");
      expect(again.earningRate).toBe(4);
      expect(again.ruleHistory).toEqual(card.ruleHistory);
      // Saving fields outside the rules adds nothing.
      const renamed = await patchRewardsCard(repo, "plan-test", "card-history", { issuer: "UOB" }, "2026-06-01");
      expect(renamed.ruleHistory).toEqual(card.ruleHistory);
    });

    test("correct everywhere changes only the edited fields in earlier rules", async () => {
      await createRewardsCard(repo, "plan-test", base);
      await patchRewardsCard(repo, "plan-test", "card-history",
        { earningRate: 3, flagNames: { red: "Food", blue: "Onlin" } }, "2026-05-01");
      const fixed = await patchRewardsCard(repo, "plan-test", "card-history",
        { flagNames: { red: "Food", blue: "Online" } }, "everywhere");
      expect(fixed.flagNames).toEqual({ red: "Food", blue: "Online" });
      expect(fixed.ruleHistory).toEqual([
        { until: "2026-05-01", rules: { earningRate: 2, flagNames: { red: "Dining", blue: "Online" } } },
      ]);
    });

    test("correct everywhere does not copy unedited names into rules that had none", async () => {
      // Names can come only from subcategories; a correction to Blue must not
      // give the earlier rules the later name for Red.
      await createRewardsCard(repo, "plan-test", {
        ...base, flagNames: undefined,
        subcategories: [{ id: "red", name: "Dining", flagColor: "red", rewardValue: 4, priority: 1, active: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
      });
      await patchRewardsCard(repo, "plan-test", "card-history", { flagNames: { red: "Food" } }, "2026-05-01");
      const fixed = await patchRewardsCard(repo, "plan-test", "card-history", { flagNames: { red: "Food", blue: "Online" } }, "everywhere");
      expect(fixed.ruleHistory?.[0]?.rules.flagNames).toEqual({ blue: "Online" });
    });

    test("current and next period resolve to the card's own period starts", async () => {
      setSystemTime(new Date("2026-05-20T04:00:00Z"));
      try {
        await createRewardsCard(repo, "plan-test", { ...base, billingCycle: { type: "billing", dayOfMonth: 16 } });
        const current = await patchRewardsCard(repo, "plan-test", "card-history", { earningRate: 3 }, "current_period");
        expect(current.ruleHistory?.map((entry) => entry.until)).toEqual(["2026-05-16"]);
        const next = await patchRewardsCard(repo, "plan-test", "card-history", { earningRate: 4 }, "next_period");
        expect(next.ruleHistory?.map((entry) => entry.until)).toEqual(["2026-05-16", "2026-06-16"]);
      } finally {
        setSystemTime();
      }
    });

    test("a save without a date, as older apps send, keeps the history", async () => {
      await createRewardsCard(repo, "plan-test", base);
      const dated = await patchRewardsCard(repo, "plan-test", "card-history", { earningRate: 3 }, "2026-05-01");
      const legacy = await patchRewardsCard(repo, "plan-test", "card-history", { earningRate: 5, ruleHistory: [] });
      expect(legacy.earningRate).toBe(5);
      expect(legacy.ruleHistory).toEqual(dated.ruleHistory);
    });

    test("stamps the name in force on the transaction's date", async () => {
      await createRewardsCard(repo, "plan-test", base);
      await patchRewardsCard(repo, "plan-test", "card-history",
        { flagNames: { red: "Food", blue: "Onlin" } }, "2026-05-01");
      const april: { flag_color?: string | null; flag_name?: string | null } = { flag_color: "red" };
      await stampTransactionFlagName(repo, "plan-test", "acct-rewards", april, "2026-04-10");
      expect(april.flag_name).toBe("Dining");
      const may: { flag_color?: string | null; flag_name?: string | null } = { flag_color: "red" };
      await stampTransactionFlagName(repo, "plan-test", "acct-rewards", may, "2026-05-01");
      expect(may.flag_name).toBe("Food");
    });
  });

  test("treats a closed account as live", async () => {
    await repo.upsertAccount("plan-test", { id: "acct-closed", name: "Closed", type: "creditCard", closed: true });
    expect(await repo.findLiveAccountId("plan-test", "acct-closed")).toBe("acct-closed");
    const card = await createRewardsCard(repo, "plan-test", {
      name: "Closed card",
      type: "cashback",
      ynabAccountId: "acct-closed",
    });
    expect(card.ynabAccountId).toBe("acct-closed");
  });
});
