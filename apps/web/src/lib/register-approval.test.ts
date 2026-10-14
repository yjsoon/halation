import { describe, expect, test } from "bun:test";
import {
  beginApproval,
  eligibleApprovalIds,
  emptyApprovalSession,
  failApproval,
  finishApproval,
  planApproval,
  type ApprovalRow,
} from "./register-approval";

function row(id: string, approved = false, deleted = false): ApprovalRow {
  return { id, approved, deleted };
}

describe("register approval", () => {

  test("drops missing, approved, deleted, and duplicate ids", () => {
    const plan = planApproval(
      ["d", "a", "d", "missing", "b", "c"],
      [row("a"), row("b", true), row("c", false, true), row("d")],
    );
    expect(plan).toEqual([["d", "a"]]);
    expect(planApproval(["b", "missing"], [row("b", true)])).toBeNull();
  });

  test("beginApproval adds pending and rejects empty or already-pending ids", () => {
    expect(beginApproval(emptyApprovalSession(), [])).toBeNull();
    const started = beginApproval(emptyApprovalSession(), ["a", "b"]);
    expect(started).not.toBeNull();
    expect([...started!.pending]).toEqual(["a", "b"]);
    expect(started!.confirmed.size).toBe(0);
    expect(beginApproval(started!, ["b", "c"])).toBeNull();
  });

  test("finishApproval moves ids from pending to confirmed", () => {
    const started = beginApproval(emptyApprovalSession(), ["a", "b"]);
    expect(started).not.toBeNull();
    const finished = finishApproval(started!, ["a"]);
    expect([...finished.pending]).toEqual(["b"]);
    expect([...finished.confirmed]).toEqual(["a"]);
    expect(started!.pending.has("a")).toBe(true);
    expect(started!.confirmed.has("a")).toBe(false);
  });

  test("failApproval drops pending and confirms the accepted prefix", () => {
    const started = beginApproval(emptyApprovalSession(), ["a", "b", "c"]);
    expect(started).not.toBeNull();
    const interrupted = failApproval(started!, ["a", "b", "c"], 2);
    expect(interrupted.pending.size).toBe(0);
    expect([...interrupted.confirmed]).toEqual(["a", "b"]);
    expect([...failApproval(started!, ["a", "b", "c"], 0).confirmed]).toEqual([]);
  });

  test("eligibleApprovalIds skips confirmed overlay rows when a session is passed", () => {
    const session = finishApproval(beginApproval(emptyApprovalSession(), ["a"])!, ["a"]);
    expect(eligibleApprovalIds([row("a"), row("d")], session)).toEqual(["d"]);
    expect(eligibleApprovalIds([row("a"), row("d")])).toEqual(["a", "d"]);
  });
});
