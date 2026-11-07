import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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
