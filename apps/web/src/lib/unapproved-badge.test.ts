import { describe, expect, test } from "bun:test";
import { resolvedSinceCount, showsUnapprovedBadge, unapprovedBadgeCount } from "./unapproved-badge";

describe("resolvedSinceCount", () => {
  test("counts only what was resolved after the count was taken", () => {
    expect(resolvedSinceCount(new Set(["a", "b", "c"]), new Set(["a"]))).toBe(2);
  });

  test("ignores a snapshot id that is no longer resolved", () => {
    expect(resolvedSinceCount(new Set(["b"]), new Set(["a"]))).toBe(1);
  });

});

describe("unapprovedBadgeCount", () => {
  test("is null while the first count is in flight, so nothing is rendered", () => {
    expect(unapprovedBadgeCount(null, null, 0)).toBeNull();
  });

  test("decrements optimistically for approvals the count predates", () => {
    expect(unapprovedBadgeCount(null, 12, 3)).toBe(9);
  });

  test("never shows a negative badge when more was resolved than counted", () => {
    expect(unapprovedBadgeCount(null, 2, 5)).toBe(0);
  });

  test("prefers the row-exact queue count once the approval flow has loaded it", () => {
    expect(unapprovedBadgeCount(4, 12, 3)).toBe(4);
  });

});

describe("showsUnapprovedBadge", () => {

  test("keeps the pill visible while the approval flow is open, as the way out", () => {
    expect(showsUnapprovedBadge(0, true)).toBe(true);
    expect(showsUnapprovedBadge(null, true)).toBe(true);
  });
});

describe("a failed count", () => {
  test("keeps the pill visible, since it is the only way into the approval flow", () => {
    expect(showsUnapprovedBadge(null, false, true)).toBe(true);
  });

});
