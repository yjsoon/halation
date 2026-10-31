import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { RewardsReport } from "../api/types";
import { RewardTile } from "../pages/Rewards";

test("historical tile separates range spend from cutoff-period minimum, not the last overlapping period", () => {
  const calculation: RewardsReport["cards"][number]["calculation"] = {
    period: "2026-02-13:2026-02-25", total_spend: 44, counted_spend: 44, eligible_spend: 40,
    reward_earned: 48, reward_earned_dollars: 0.96, reward_type: "miles",
    minimum_spend: 100, minimum_spend_met: true, minimum_spend_progress: 100,
    maximum_spend: null, maximum_spend_progress: null, maximum_spend_exceeded: false, flags: [],
  };
  const row: RewardsReport["cards"][number] = {
    card: { id: "travel", name: "Travel", issuer: "Bank", type: "miles", ynabAccountId: "account", featured: true },
    account_id: "account", account_name: "Account",
    calculation: { ...calculation, periods: [
      { start: "2026-02-01", end: "2026-02-28", calculation: { ...calculation, total_spend: 167 } },
      { start: "2026-02-10", end: "2026-02-20", calculation: { ...calculation, total_spend: 999 } },
    ] },
  };
  const html = renderToStaticMarkup(createElement(MemoryRouter, null,
    createElement(RewardTile, { row, search: "", asOf: "2026-02-25" })));
  expect(html).toContain("44.00</dd>");
  expect(html).toContain("Full-period minimum met");
  expect(html).toContain("167.00 / 100.00");
  expect(html).not.toContain("44.00 / 100.00");
  expect(html).not.toContain("999.00 / 100.00");
});

test("a stacked range row's targets read the cutoff period, not the range sums against its minimum", async () => {
  const { SkylineRow } = await import("../pages/Rewards");
  const { projectRow } = await import("./reward-row-projection");
  // $500 minimum; $250 on 5 May and $100 on 15 May; range 10 to 24 May sums $100, the May period $350.
  const base: RewardsReport["cards"][number]["calculation"] = {
    period: "2026-05-10:2026-05-24", total_spend: 100, counted_spend: 100, eligible_spend: 100,
    reward_earned: 1, reward_earned_dollars: 1, reward_type: "cashback",
    minimum_spend: 500, minimum_spend_met: false, minimum_spend_progress: 70,
    maximum_spend: null, maximum_spend_progress: null, maximum_spend_exceeded: false, flags: [],
  };
  const row: RewardsReport["cards"][number] = {
    card: { id: "gate", name: "Gate", issuer: "Bank", type: "cashback", ynabAccountId: "account", featured: false },
    account_id: "account", account_name: "Account",
    calculation: { ...base, periods: [{ start: "2026-05-01", end: "2026-05-31", calculation: { ...base, period: "May", total_spend: 350 } }] },
  };
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(SkylineRow, {
    row, search: "", asOf: "2026-05-24", projection: projectRow(row, "2026-05-24", true, "2026-10-31"),
    index: 0, memoryKey: "test", open: true, onToggle: () => {}, range: true, actions: null,
  })));
  expect(html).toContain("150.00 to go");
  expect(html).not.toContain("400.00 to go");
  expect(html).toContain("For the latest card period, 1 May to 31 May");
  expect(html).not.toContain("rw-rail");
});

test("after a missed month the slip urges nothing, and an excluded category earns nothing", async () => {
  const { SkylineRow } = await import("../pages/Rewards");
  const { projectRow } = await import("./reward-row-projection");
  const calc: RewardsReport["cards"][number]["calculation"] = {
    period: "May", total_spend: 300, counted_spend: 300, eligible_spend: 300,
    reward_earned: 0, reward_earned_dollars: 0, reward_type: "cashback",
    minimum_spend: 900, minimum_spend_met: false, minimum_spend_progress: 33,
    maximum_spend: null, maximum_spend_progress: null, maximum_spend_exceeded: false,
    qualification_status: "failed",
    monthly_qualifications: [{ start: "2026-05-01", end: "2026-05-31", spend: 100, minimumSpend: 400, status: "failed" }],
    flags: [{ subcategoryId: "dining", name: "Dining", flagColor: "red", totalSpend: 80, eligibleSpend: 0, rewardEarned: 0, rewardRate: 2 }],
  };
  const row: RewardsReport["cards"][number] = {
    card: { id: "c", name: "C", issuer: "Bank", type: "cashback", ynabAccountId: "a", featured: false, subcategories: [{ id: "dining", excludeFromRewards: true }] },
    account_id: "a", account_name: "A",
    calculation: { ...calc, periods: [{ start: "2026-05-01", end: "2026-05-31", calculation: calc }] },
  };
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(SkylineRow, {
    row, search: "", asOf: "2026-05-24", projection: projectRow(row, "2026-05-24", false, "2026-10-31"),
    index: 0, memoryKey: "test", open: true, onToggle: () => {}, range: false, actions: null, today: "2026-10-31",
  })));
  const targets = html.slice(html.indexOf("rw-targets"), html.indexOf("rw-open-cats"));
  expect(targets).toContain("600.00 short, a month was missed");
  expect(targets).toContain(">missed<");
  expect(targets).not.toContain("data-urgent");
  expect(html).toContain("Excluded from rewards");
  expect(html).toContain("as of · 24");
});
