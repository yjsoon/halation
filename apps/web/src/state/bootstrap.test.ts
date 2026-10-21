import { describe, expect, test } from "bun:test";
import {
  decideSession,
  decideBootstrap,
  planBootstrapRequests,
  planKnowledge,
  resolveReferenceBatch,
} from "./bootstrap";

const signedIn = { user: { id: "user-1" }, setup_required: false, bootstrap_required: false };

describe("planBootstrapRequests", () => {
  test("prefers the attached controller's plan and skips preferences", () => {
    expect(planBootstrapRequests({ hint: "plan-b", existingPlanId: "plan-a" })).toEqual({
      speculativePlanId: "plan-a",
      fetchPreferences: false,
      fetchAccounts: true,
    });
  });

  test("holds the accounts read back when the cache covers the plan being opened", () => {
    expect(planBootstrapRequests({ hint: "plan-b", existingPlanId: null, cachedPlanId: "plan-b" })).toEqual({
      speculativePlanId: "plan-b",
      fetchPreferences: true,
      fetchAccounts: false,
    });
  });

});

describe("planKnowledge", () => {
  test("reads the plan's knowledge from the list the bootstrap already fetches", () => {
    expect(planKnowledge([{ id: "plan-a", server_knowledge: 41 }], "plan-a")).toBe(41);
  });

  test("is null for a plan the list does not contain", () => {
    expect(planKnowledge([{ id: "plan-a", server_knowledge: 41 }], "plan-b")).toBeNull();
  });

  test("is null when the server reports no knowledge, so nothing is validated", () => {
    expect(planKnowledge([{ id: "plan-a" }], "plan-a")).toBeNull();
  });
});

describe("decideSession", () => {
  test("reads the session without consulting anything else", () => {
    expect(decideSession(signedIn)).toEqual({ kind: "signed-in", userId: "user-1" });
    expect(decideSession({ user: null, setup_required: false, bootstrap_required: false }))
      .toEqual({ kind: "signed-out", mode: "login" });
    expect(decideSession({ user: null, setup_required: true, bootstrap_required: true }))
      .toEqual({ kind: "signed-out", mode: "setup" });
  });

  test("shows the missing-token step instead of a setup form that can only fail", () => {
    expect(decideSession({ user: null, setup_required: true, bootstrap_required: false, setup_blocked: true }))
      .toEqual({ kind: "signed-out", mode: "setup-blocked" });
  });
});

describe("decideBootstrap", () => {
  test("keeps the speculative batch when the hint is confirmed", () => {
    expect(decideBootstrap({
      status: signedIn,
      plans: [{ id: "plan-a" }, { id: "plan-b" }],
      speculativePlanId: "plan-b",
    })).toEqual({ kind: "ready", userId: "user-1", planId: "plan-b", keepSpeculative: true, requestedPlanRejected: false });
  });

  test("falls back to the first plan and discards the batch when the hint is stale", () => {
    expect(decideBootstrap({
      status: signedIn,
      plans: [{ id: "plan-a" }],
      speculativePlanId: "plan-gone",
    })).toEqual({ kind: "ready", userId: "user-1", planId: "plan-a", keepSpeculative: false, requestedPlanRejected: false });
  });

  test("reports when the account has no readable plan", () => {
    expect(decideBootstrap({ status: signedIn, plans: [], speculativePlanId: null }))
      .toEqual({ kind: "no-plans" });
  });

  test("selects an accessible URL plan and rejects an inaccessible one", () => {
    expect(decideBootstrap({
      status: signedIn,
      plans: [{ id: "usual" }, { id: "linked" }],
      speculativePlanId: "usual",
      requestedPlanId: "linked",
    })).toEqual({
      kind: "ready",
      userId: "user-1",
      planId: "linked",
      keepSpeculative: false,
      requestedPlanRejected: false,
    });
    expect(decideBootstrap({
      status: signedIn,
      plans: [{ id: "usual" }],
      speculativePlanId: "usual",
      requestedPlanId: "private",
    })).toEqual({
      kind: "ready",
      userId: "user-1",
      planId: "usual",
      keepSpeculative: true,
      requestedPlanRejected: true,
    });
  });

  test("an invalid session yields no plan state even when plans and a batch arrived", () => {
    const decision = decideBootstrap({
      status: { user: null, setup_required: false, bootstrap_required: true },
      plans: [{ id: "plan-a" }, { id: "plan-b" }],
      speculativePlanId: "plan-b",
    });
    expect(decision).toEqual({ kind: "signed-out", mode: "login" });
    expect(decision).not.toHaveProperty("planId");
    expect(resolveReferenceBatch({ keepSpeculative: false }, { ok: true, value: "reference data" }))
      .toEqual({ kind: "refetch" });
  });

});

describe("resolveReferenceBatch", () => {

  test("surfaces the failure of a batch for the chosen plan", () => {
    const error = new Error("categories unavailable");
    expect(resolveReferenceBatch({ keepSpeculative: true }, { ok: false, error }))
      .toEqual({ kind: "fail", error });
  });

  test("discards a batch fetched for a plan that was not chosen", () => {
    expect(resolveReferenceBatch({ keepSpeculative: false }, { ok: false, error: new Error("404") }))
      .toEqual({ kind: "refetch" });
    expect(resolveReferenceBatch({ keepSpeculative: true }, null)).toEqual({ kind: "refetch" });
  });
});

