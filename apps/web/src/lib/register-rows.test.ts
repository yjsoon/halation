import { describe, expect, test } from "bun:test";
import {
  deletedIdsForRemoval,
  reconcileClearedOverlays,
  supersedeClearedOverlays,
  unlinkSplitMirrorParent,
} from "./register-rows";

function row(id: string, deleted = false, cleared = "uncleared") {
  return { id, deleted, cleared };
}

describe("register rows", () => {

  test("unlinkSplitMirrorParent clears the matching split transfer line", () => {
    const groceries = { id: "sub-food", transfer_account_id: null, transfer_transaction_id: null };
    const stash = { id: "sub-stash", transfer_account_id: "saver", transfer_transaction_id: "mirror" };
    const parent = { id: "parent", subtransactions: [groceries, stash] };
    const other = { id: "other", subtransactions: [{ id: "plain" }] };
    expect(unlinkSplitMirrorParent([other, parent], { id: "mirror", parent_transaction_id: "parent" })).toEqual({
      id: "parent",
      subtransactions: [groceries, { id: "sub-stash", transfer_account_id: null, transfer_transaction_id: null }],
    });
    expect(unlinkSplitMirrorParent([parent], { id: "mirror", transfer_transaction_id: "sub-stash" })).toEqual({
      id: "parent",
      subtransactions: [groceries, { id: "sub-stash", transfer_account_id: null, transfer_transaction_id: null }],
    });
    expect(unlinkSplitMirrorParent([parent], { id: "unrelated" })).toBeNull();
  });

  test("deletedIdsForRemoval includes split-line transfer mirrors", () => {
    expect(
      deletedIdsForRemoval({
        id: "parent",
        subtransactions: [
          { transfer_transaction_id: "mirror-a" },
          {},
          { transfer_transaction_id: "mirror-b" },
        ],
      }),
    ).toEqual(["parent", "mirror-a", "mirror-b"]);
  });

  test("a bulk command discards targeted overlays before complete or uncertain outcomes", () => {
    const overlays = new Map([
      ["confirmed-row", "cleared"],
      ["uncertain-row", "uncleared"],
      ["unrelated-in-flight", "uncleared"],
    ]);

    expect([...supersedeClearedOverlays(overlays, new Set(["confirmed-row", "uncertain-row"]))]).toEqual([
      ["unrelated-in-flight", "uncleared"],
    ]);
  });

  test("reconcileClearedOverlays keeps in-flight and stale-fetch flips", () => {
    const overlays = new Map([
      ["in-flight", "cleared"],
      ["acked-stale", "cleared"],
      ["acked-matched", "cleared"],
    ]);
    const rows = [
      row("in-flight"),
      row("acked-stale"),
      row("acked-matched", false, "cleared"),
    ];
    expect(
      [...reconcileClearedOverlays(overlays, [rows], new Set(["in-flight"]))],
    ).toEqual([
      ["in-flight", "cleared"],
      ["acked-stale", "cleared"],
    ]);
  });

  test("reconcileClearedOverlays keeps the flip until every snapshot matches", () => {
    const overlays = new Map([["row", "cleared"]]);
    const stalePage = [row("row")];
    const freshQueue = [row("row", false, "cleared")];
    expect(
      [...reconcileClearedOverlays(overlays, [stalePage, freshQueue], new Set())],
    ).toEqual([["row", "cleared"]]);
    expect(
      [...reconcileClearedOverlays(overlays, [freshQueue, freshQueue], new Set())],
    ).toEqual([]);
  });
});
