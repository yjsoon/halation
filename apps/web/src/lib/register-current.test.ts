import { describe, expect, test } from "bun:test";
import {
  asOfTodayBalance,
  dateInRegisterWindow,
  registerFetchUntilDate,
} from "./register-current";

const TODAY = "2026-09-01";

describe("registerFetchUntilDate", () => {
  test("drops until_date when the window ends today or later, so posted futures load", () => {
    expect(registerFetchUntilDate("2026-09-01", TODAY)).toBeUndefined();
    expect(registerFetchUntilDate("2026-09-30", TODAY)).toBeUndefined();
    expect(registerFetchUntilDate(undefined, TODAY)).toBeUndefined();
  });

});

describe("dateInRegisterWindow", () => {
  test("includes posted futures when the window ends today", () => {
    expect(dateInRegisterWindow("2026-09-08", "2026-07-01", "2026-09-01", TODAY)).toBe(true);
    expect(dateInRegisterWindow("2026-08-29", "2026-07-01", "2026-09-01", TODAY)).toBe(true);
    expect(dateInRegisterWindow("2026-06-01", "2026-07-01", "2026-09-01", TODAY)).toBe(false);
  });

  test("excludes posted futures from a past month window", () => {
    expect(dateInRegisterWindow("2026-09-08", "2026-08-01", "2026-08-31", TODAY)).toBe(false);
    expect(dateInRegisterWindow("2026-08-15", "2026-08-01", "2026-08-31", TODAY)).toBe(true);
  });
});

describe("asOfTodayBalance", () => {
  test("excludes future-dated rows from the headline current balance", () => {
    const working = -200_000;
    const current = asOfTodayBalance(working, [
      { account_id: "acct-a", date: "2026-09-08", amount: 40_000, deleted: false },
      { account_id: "acct-a", date: "2026-08-29", amount: -7_000, deleted: false },
      { account_id: "other", date: "2026-09-10", amount: -50_000, deleted: false },
    ], { accountId: "acct-a", today: TODAY });
    expect(current).toBe(working - 40_000);
  });

  test("does not subtract deleted or other-account future rows", () => {
    expect(asOfTodayBalance(1000, [
      { account_id: "acct-a", date: "2026-09-08", amount: -200, deleted: true },
      { account_id: "other", date: "2026-09-08", amount: -300, deleted: false },
    ], { accountId: "acct-a", today: TODAY })).toBe(1000);
  });
});
