import { describe, expect, test } from "bun:test";
import { configureMoney } from "./money";
import type { Payee, Subtransaction, Transaction } from "../api/types";
import {
  beginRowEdit,
  idleRowEdit,
  parseAmountEntry,
  payeeListEntries,
  planRowCommit,
  postingAccountId,
  reduceRowEdit,
  rowFieldWritable,
  writableFocus,
  type RegisterRowDraft,
  type RegisterRowEditAction,
  type RegisterRowRef,
  type RowEditContext,
} from "./register-row-edit";

function txn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "txn-1",
    date: "2026-08-01",
    amount: -3400,
    memo: "coffee",
    cleared: "uncleared",
    approved: true,
    flag_color: null,
    flag_name: null,
    account_id: "acct",
    account_name: "Everyday",
    payee_id: "p-shop",
    payee_name: "Shop",
    category_id: "cat-dining",
    category_name: "Dining Out",
    transfer_account_id: null,
    transfer_transaction_id: null,
    deleted: false,
    ...overrides,
  };
}

function line(overrides: Partial<Subtransaction> = {}): Subtransaction {
  return {
    id: "line-1",
    amount: -2000,
    payee_id: "p-shop",
    payee_name: "Shop",
    category_id: "cat-dining",
    category_name: "Dining Out",
    memo: "lunch",
    transfer_account_id: null,
    transfer_transaction_id: null,
    deleted: false,
    ...overrides,
  };
}

function splitParent(lines: Subtransaction[], overrides: Partial<Transaction> = {}): Transaction {
  const amount = lines.reduce((sum, item) => sum + item.amount, 0);
  return txn({
    id: "txn-split",
    amount,
    category_id: null,
    category_name: null,
    subtransactions: lines,
    ...overrides,
  });
}

function payee(id: string, name: string, transferAccountId?: string): Payee {
  return { id, name, transfer_account_id: transferAccountId ?? null, deleted: false };
}

function posted(transaction: Transaction): RegisterRowRef {
  return { kind: "posted", transaction };
}

function splitLine(parent: Transaction, lineId: string): RegisterRowRef {
  return { kind: "split-line", parent, lineId };
}

const unlocked: RowEditContext = { writeLocked: false, mutatingId: null };
const shop = payee("p-shop", "Shop");
const coffee = payee("p-coffee", "Coffee");
const transfer = payee("p-xfer", "Transfer : Rainy Day Saver", "acct-saver");
const payees = [shop, coffee, transfer];

const shopDraft: RegisterRowDraft = {
  date: "2026-08-01",
  payeeName: "Shop",
  categoryId: "cat-dining",
  memo: "coffee",
  outflow: "3.40",
  inflow: "",
  flagColor: "",
  needsConfirmation: false,
  claimStatus: null,
};

describe("reduceRowEdit", () => {
  const row = posted(txn());
  const begin: RegisterRowEditAction = { type: "begin", row, draft: shopDraft, focus: "memo" };
  const editing = reduceRowEdit(idleRowEdit(), begin);

  test("editing patch updates fields and clears the error", () => {
    const withError = reduceRowEdit(editing, { type: "invalid", message: "Enter an outflow or an inflow." });
    expect(reduceRowEdit(withError, { type: "patch", draft: { memo: "tea" } })).toEqual({
      status: "editing",
      row,
      draft: { ...shopDraft, memo: "tea" },
      focus: "memo",
      error: null,
    });
  });

  test("set-outflow clears inflow when the value is non-empty", () => {
    const both = reduceRowEdit(editing, { type: "patch", draft: { memo: "coffee" } });
    const withInflow = reduceRowEdit(both, { type: "set-inflow", value: "5.00" });
    expect(withInflow).toMatchObject({ draft: { inflow: "5.00", outflow: "" }, error: null });
    expect(reduceRowEdit(withInflow, { type: "set-outflow", value: "1.25" })).toMatchObject({
      draft: { outflow: "1.25", inflow: "" },
      error: null,
    });
  });

  test("empty set-outflow keeps the other column", () => {
    const withInflow = reduceRowEdit(editing, { type: "set-inflow", value: "5.00" });
    expect(reduceRowEdit(withInflow, { type: "set-outflow", value: "  " })).toMatchObject({
      draft: { outflow: "  ", inflow: "5.00" },
    });
  });

  test("committing failed returns editing with the error and kept draft", () => {
    const committing = reduceRowEdit(editing, { type: "committing" });
    expect(reduceRowEdit(committing, { type: "failed", message: "Server down" })).toEqual({
      status: "editing",
      row,
      draft: shopDraft,
      focus: "date",
      error: "Server down",
    });
  });

  test("begin is idle-only", () => {
    const idle = idleRowEdit();
    expect(reduceRowEdit(editing, begin)).toBe(editing);
    const committing = reduceRowEdit(editing, { type: "committing" });
    expect(reduceRowEdit(committing, begin)).toBe(committing);
    expect(reduceRowEdit(idle, begin)).toEqual(editing);
  });

  test("ignores actions that do not apply to the current status", () => {
    const idle = idleRowEdit();
    expect(reduceRowEdit(idle, { type: "patch", draft: { memo: "x" } })).toBe(idle);
    expect(reduceRowEdit(idle, { type: "set-outflow", value: "1" })).toBe(idle);
    expect(reduceRowEdit(idle, { type: "set-inflow", value: "1" })).toBe(idle);
    expect(reduceRowEdit(idle, { type: "invalid", message: "no" })).toBe(idle);
    expect(reduceRowEdit(idle, { type: "committing" })).toBe(idle);
    expect(reduceRowEdit(idle, { type: "committed" })).toBe(idle);
    expect(reduceRowEdit(idle, { type: "failed", message: "no" })).toBe(idle);
    expect(reduceRowEdit(idle, { type: "cancel" })).toBe(idle);
    expect(reduceRowEdit(editing, { type: "committed" })).toBe(editing);
    expect(reduceRowEdit(editing, { type: "failed", message: "no" })).toBe(editing);
    const committing = reduceRowEdit(editing, { type: "committing" });
    expect(reduceRowEdit(committing, { type: "patch", draft: { memo: "x" } })).toBe(committing);
    expect(reduceRowEdit(committing, { type: "cancel" })).toBe(committing);
    expect(reduceRowEdit(committing, { type: "invalid", message: "no" })).toBe(committing);
  });
});

describe("beginRowEdit", () => {
  test("seeds every posted draft field from the current value", () => {
    const row = posted(txn());
    expect(beginRowEdit(row, "category", unlocked)).toEqual({
      kind: "begin",
      action: { type: "begin", row, draft: shopDraft, focus: "category" },
    });
  });

  test("seeds an occupied inflow and leaves outflow empty", () => {
    const row = posted(txn({ amount: 5000 }));
    expect(beginRowEdit(row, "inflow", unlocked)).toMatchObject({
      kind: "begin",
      action: { draft: { outflow: "", inflow: "5.00" } },
    });
  });

  test("seeds both amount columns empty when the amount is zero", () => {
    const row = posted(txn({ amount: 0 }));
    expect(beginRowEdit(row, "outflow", unlocked)).toMatchObject({
      kind: "begin",
      action: { draft: { outflow: "", inflow: "" } },
    });
  });

  test("refuses when mutatingId is this row", () => {
    expect(beginRowEdit(posted(txn()), "memo", { writeLocked: false, mutatingId: "txn-1" })).toEqual({
      kind: "refuse",
      reason: "row-busy",
    });
  });

  test("begins a split parent including category and amount focus", () => {
    const parent = splitParent([line(), line({ id: "line-2", amount: -1400 })]);
    const row = posted(parent);
    expect(beginRowEdit(row, "category", unlocked).kind).toBe("begin");
    expect(beginRowEdit(row, "outflow", unlocked).kind).toBe("begin");
    expect(beginRowEdit(row, "payee", unlocked)).toMatchObject({
      kind: "begin",
      action: { draft: { payeeName: "Shop", categoryId: "", outflow: "3.40", inflow: "" } },
    });
  });

  test("refuses a linked split-mirror posted row", () => {
    expect(beginRowEdit(posted(txn({ parent_transaction_id: "txn-split" })), "memo", unlocked)).toEqual({
      kind: "refuse",
      reason: "linked-mirror",
    });
  });

  test("keeps payee focus on a saved transfer and snaps category onto date", () => {
    const row = posted(txn({
      transfer_account_id: "acct-saver",
      payee_name: "Transfer : Rainy Day Saver",
      category_id: null,
    }));
    expect(beginRowEdit(row, "payee", unlocked)).toMatchObject({
      action: { focus: "payee" },
    });
    expect(beginRowEdit(row, "category", unlocked)).toMatchObject({
      action: { focus: "date" },
    });
  });

  test("refuses a missing split line", () => {
    const parent = splitParent([line()]);
    expect(beginRowEdit(splitLine(parent, "gone"), "memo", unlocked)).toEqual({
      kind: "refuse",
      reason: "missing-line",
    });
  });

  test("begins a transfer split line", () => {
    const transferLine = line({
      id: "line-xfer",
      transfer_account_id: "acct-saver",
      payee_name: "Transfer : Rainy Day Saver",
      category_id: null,
    });
    const parent = splitParent([line(), transferLine]);
    const row = splitLine(parent, "line-xfer");
    expect(beginRowEdit(row, "payee", unlocked).kind).toBe("begin");
    expect(beginRowEdit(row, "category", unlocked).kind).toBe("begin");
    expect(beginRowEdit(row, "memo", unlocked)).toMatchObject({
      kind: "begin",
      action: {
        draft: {
          date: "2026-08-01",
          payeeName: "Transfer : Rainy Day Saver",
          categoryId: "",
          memo: "lunch",
          outflow: "2.00",
          inflow: "",
          flagColor: "",
        },
        focus: "memo",
      },
    });
  });

});

describe("planRowCommit", () => {
  test("returns unchanged when every writable field matches", () => {
    const row = posted(txn());
    expect(planRowCommit(row, shopDraft, payees)).toEqual({ kind: "unchanged" });
    expect(planRowCommit(row, { ...shopDraft, payeeName: "  shop  ", memo: " coffee " }, payees)).toEqual({
      kind: "unchanged",
    });
  });

  // Rows saved before amounts were held to the currency's minor unit (12.345
  // in a cents plan) prefill text that no longer parses; a memo-only edit
  // must not be refused for an amount the user never touched.
  test("keeps an untouched sub-cent amount and patches the rest", () => {
    const row = posted(txn({ amount: -12_345 }));
    const begun = beginRowEdit(row, "memo", { writeLocked: false, mutatingId: null } as RowEditContext);
    expect(begun.kind).toBe("begin");
    if (begun.kind !== "begin" || begun.action.type !== "begin") return;
    expect(begun.action.draft.outflow).toBe("12.345");
    expect(planRowCommit(row, { ...begun.action.draft, memo: "tea" }, payees)).toEqual({
      kind: "patch",
      transactionId: "txn-1",
      input: { memo: "tea" },
    });
  });

  test("patches only the fields that changed", () => {
    const row = posted(txn());
    expect(planRowCommit(row, { ...shopDraft, date: "2026-08-15" }, payees)).toEqual({
      kind: "patch",
      transactionId: "txn-1",
      input: { date: "2026-08-15" },
    });
    expect(planRowCommit(row, { ...shopDraft, memo: "  tea  " }, payees)).toEqual({
      kind: "patch",
      transactionId: "txn-1",
      input: { memo: "tea" },
    });
    expect(planRowCommit(row, { ...shopDraft, memo: "   " }, payees)).toEqual({
      kind: "patch",
      transactionId: "txn-1",
      input: { memo: null },
    });
    expect(planRowCommit(row, { ...shopDraft, categoryId: "" }, payees)).toEqual({
      kind: "patch",
      transactionId: "txn-1",
      input: { category_id: null },
    });
    expect(planRowCommit(row, { ...shopDraft, payeeName: "Coffee" }, payees)).toEqual({
      kind: "patch",
      transactionId: "txn-1",
      input: { payee_id: "p-coffee", payee_name: "Coffee" },
    });
  });

  test("rejects an empty date", () => {
    expect(planRowCommit(posted(txn()), { ...shopDraft, date: "" }, payees)).toEqual({
      kind: "invalid",
      message: "Choose a date.",
    });
  });

  test("rejects both amount columns", () => {
    expect(planRowCommit(posted(txn()), { ...shopDraft, outflow: "1", inflow: "2" }, payees)).toEqual({
      kind: "invalid",
      message: "Enter an outflow or an inflow, not both.",
    });
  });

  test("rejects an empty amount when the row may edit amount", () => {
    expect(planRowCommit(posted(txn()), { ...shopDraft, outflow: "", inflow: "" }, payees)).toEqual({
      kind: "invalid",
      message: "Enter an amount in Outflow (money out) or Inflow (money in).",
    });
    expect(planRowCommit(posted(txn()), { ...shopDraft, outflow: "nope" }, payees)).toEqual({
      kind: "invalid",
      message: "That amount is not valid. Enter a number such as 1500 or 1500.50.",
    });
  });

  test("keeps amount sign from the filled column, allows zero, and parses an expression", () => {
    expect(planRowCommit(posted(txn({ amount: -3400 })), { ...shopDraft, outflow: "5" }, payees)).toEqual({
      kind: "patch",
      transactionId: "txn-1",
      input: { amount: -5000 },
    });
    expect(planRowCommit(posted(txn({ amount: 5000 })), {
      ...shopDraft,
      outflow: "",
      inflow: "1.25",
    }, payees)).toEqual({
      kind: "patch",
      transactionId: "txn-1",
      input: { amount: 1250 },
    });
    expect(planRowCommit(posted(txn({ amount: -3400 })), { ...shopDraft, outflow: "0" }, payees)).toEqual({
      kind: "patch",
      transactionId: "txn-1",
      input: { amount: 0 },
    });
    expect(planRowCommit(posted(txn()), { ...shopDraft, outflow: "3.40+1.60" }, payees)).toEqual({
      kind: "patch",
      transactionId: "txn-1",
      input: { amount: -5000 },
    });
  });

  test("plans a transfer payee on a posted row and clears category", () => {
    expect(planRowCommit(posted(txn()), { ...shopDraft, payeeName: "Transfer : Rainy Day Saver" }, payees)).toEqual({
      kind: "patch",
      transactionId: "txn-1",
      input: { payee_id: "p-xfer", payee_name: "Transfer : Rainy Day Saver", category_id: null },
    });
  });

  test("rejects a self-transfer payee", () => {
    const self = payee("p-self", "Transfer : Everyday", "acct");
    expect(planRowCommit(posted(txn()), { ...shopDraft, payeeName: "Transfer : Everyday" }, [...payees, self])).toEqual({
      kind: "invalid",
      message: "Transfer to the same account is not allowed.",
    });
  });

  test("rejects a transfer payee on a split parent", () => {
    const parent = splitParent([line(), line({ id: "line-2", amount: -1400 })]);
    expect(planRowCommit(posted(parent), {
      date: "2026-08-01",
      payeeName: "Transfer : Rainy Day Saver",
      categoryId: "",
      memo: "coffee",
      outflow: "3.40",
      inflow: "",
      flagColor: "",
    }, payees)).toEqual({
      kind: "invalid",
      message: "A split cannot itself be a transfer.",
    });
  });

  test("plans a regular payee on an existing transfer posted row", () => {
    const row = posted(txn({
      transfer_account_id: "acct-saver",
      payee_id: "p-xfer",
      payee_name: "Transfer : Rainy Day Saver",
      category_id: null,
    }));
    expect(planRowCommit(row, { ...shopDraft, payeeName: "Coffee" }, payees)).toEqual({
      kind: "patch",
      transactionId: "txn-1",
      input: { payee_id: "p-coffee", payee_name: "Coffee", category_id: "cat-dining", transfer_account_id: null },
    });
  });

  test("rejects retargeting an existing transfer to a different transfer payee", () => {
    const other = payee("p-travel", "Transfer : Travel Card", "acct-travel");
    const row = posted(txn({
      transfer_account_id: "acct-saver",
      payee_id: "p-xfer",
      payee_name: "Transfer : Rainy Day Saver",
      category_id: null,
    }));
    expect(planRowCommit(row, { ...shopDraft, payeeName: "Transfer : Travel Card", categoryId: "" }, [...payees, other])).toEqual({
      kind: "invalid",
      message: "This transfer already has a destination. Choose a regular payee, or cancel.",
    });
  });

  test("does not patch payee or category on a transfer posted row when the draft stays a transfer", () => {
    const row = posted(txn({
      transfer_account_id: "acct-saver",
      payee_id: "p-xfer",
      payee_name: "Transfer : Rainy Day Saver",
      category_id: null,
    }));
    const draft: RegisterRowDraft = {
      date: "2026-08-15",
      payeeName: "Transfer : Rainy Day Saver",
      categoryId: "cat-dining",
      memo: "moved",
      outflow: "3.40",
      inflow: "",
      flagColor: "",
    };
    expect(planRowCommit(row, draft, payees)).toEqual({
      kind: "patch",
      transactionId: "txn-1",
      input: { date: "2026-08-15", memo: "moved" },
    });
  });

  test("clears a red flag", () => {
    expect(planRowCommit(posted(txn({ flag_color: "red" })), shopDraft, payees)).toEqual({
      kind: "patch",
      transactionId: "txn-1",
      input: { flag_color: null },
    });
  });

  test("never includes flag_color on a split-line commit", () => {
    const parent = splitParent([line()], { flag_color: "red" });
    const plan = planRowCommit(splitLine(parent, "line-1"), {
      date: "2026-08-01",
      payeeName: "Shop",
      categoryId: "cat-dining",
      memo: "updated",
      outflow: "2.00",
      inflow: "",
      flagColor: "",
    }, payees);
    expect(plan).toMatchObject({
      kind: "patch",
      input: {
        subtransactions: [{ id: "line-1", memo: "updated" }],
      },
    });
    expect(plan.kind === "patch" && "flag_color" in plan.input).toBe(false);
  });

  test("does not patch category or amount on a split parent", () => {
    const parent = splitParent([line(), line({ id: "line-2", amount: -1400 })]);
    const row = posted(parent);
    expect(planRowCommit(row, {
      date: "2026-08-01",
      payeeName: "Shop",
      categoryId: "cat-other",
      memo: "coffee",
      outflow: "9.99",
      inflow: "1.00",
      flagColor: "",
    }, payees)).toEqual({ kind: "unchanged" });
    expect(planRowCommit(row, {
      date: "2026-08-15",
      payeeName: "Coffee",
      categoryId: "cat-other",
      memo: "updated",
      outflow: "9.99",
      inflow: "",
      flagColor: "",
    }, payees)).toEqual({
      kind: "patch",
      transactionId: "txn-split",
      input: { date: "2026-08-15", payee_id: "p-coffee", payee_name: "Coffee", memo: "updated" },
    });
  });

  test("adds approved true when requested and the row is not already approved", () => {
    const unapproved = posted(txn({ approved: false }));
    expect(planRowCommit(unapproved, shopDraft, payees, { approve: true })).toEqual({
      kind: "patch",
      transactionId: "txn-1",
      input: { approved: true },
    });
    expect(planRowCommit(unapproved, { ...shopDraft, memo: "tea" }, payees, { approve: true })).toEqual({
      kind: "patch",
      transactionId: "txn-1",
      input: { memo: "tea", approved: true },
    });
    expect(planRowCommit(posted(txn()), shopDraft, payees, { approve: true })).toEqual({ kind: "unchanged" });
  });

  test("rebuilds every split line when one memo changes", () => {
    const first = line();
    const second = line({ id: "line-2", amount: -1400, payee_name: "Coffee", payee_id: "p-coffee", memo: null });
    const parent = splitParent([first, second]);
    expect(planRowCommit(splitLine(parent, "line-1"), {
      date: "2026-08-01",
      payeeName: "Shop",
      categoryId: "cat-dining",
      memo: "updated",
      outflow: "2.00",
      inflow: "",
      flagColor: "",
    }, payees)).toEqual({
      kind: "patch",
      transactionId: "txn-split",
      input: {
        subtransactions: [
          {
            id: "line-1",
            amount: -2000,
            payee_id: "p-shop",
            payee_name: "Shop",
            category_id: "cat-dining",
            memo: "updated",
            transfer_account_id: null,
            transfer_transaction_id: null,
          },
          {
            id: "line-2",
            amount: -1400,
            payee_id: "p-coffee",
            payee_name: "Coffee",
            category_id: "cat-dining",
            memo: null,
            transfer_account_id: null,
            transfer_transaction_id: null,
          },
        ],
      },
    });
  });

  test("moves the parent amount when a split line amount changes", () => {
    const first = line({ amount: -2000 });
    const second = line({ id: "line-2", amount: -1400, payee_id: null, payee_name: null, memo: null, category_id: null });
    const parent = splitParent([first, second]);
    expect(planRowCommit(splitLine(parent, "line-2"), {
      date: "2026-08-01",
      payeeName: "",
      categoryId: "",
      memo: "",
      outflow: "3.00",
      inflow: "",
      flagColor: "",
    }, payees)).toEqual({
      kind: "patch",
      transactionId: "txn-split",
      input: {
        amount: -5000,
        subtransactions: [
          {
            id: "line-1",
            amount: -2000,
            payee_id: "p-shop",
            payee_name: "Shop",
            category_id: "cat-dining",
            memo: "lunch",
            transfer_account_id: null,
            transfer_transaction_id: null,
          },
          {
            id: "line-2",
            amount: -3000,
            payee_id: null,
            payee_name: null,
            category_id: null,
            memo: null,
            transfer_account_id: null,
            transfer_transaction_id: null,
          },
        ],
      },
    });
  });

  test("passes transfer fields through on a split-line rebuild and ignores category while the draft is a transfer", () => {
    const transferLine = line({
      id: "line-xfer",
      amount: -1400,
      transfer_account_id: "acct-saver",
      transfer_transaction_id: "txn-mirror",
      payee_id: "p-xfer",
      payee_name: "Transfer : Rainy Day Saver",
      category_id: null,
      memo: "keep",
    });
    const parent = splitParent([line(), transferLine]);
    const plan = planRowCommit(splitLine(parent, "line-xfer"), {
      date: "2026-08-01",
      payeeName: "Transfer : Rainy Day Saver",
      categoryId: "cat-dining",
      memo: "moved",
      outflow: "1.40",
      inflow: "",
      flagColor: "",
    }, payees);
    expect(plan).toMatchObject({
      kind: "patch",
      input: {
        subtransactions: [
          { id: "line-1" },
          {
            id: "line-xfer",
            memo: "moved",
            transfer_account_id: "acct-saver",
            transfer_transaction_id: "txn-mirror",
            payee_id: "p-xfer",
            payee_name: "Transfer : Rainy Day Saver",
            category_id: null,
          },
        ],
      },
    });
  });

  test("clears transfer ids on a split line that becomes a regular payee", () => {
    const transferLine = line({
      id: "line-xfer",
      transfer_account_id: "acct-saver",
      transfer_transaction_id: "txn-mirror",
      payee_id: "p-xfer",
      payee_name: "Transfer : Rainy Day Saver",
      category_id: null,
    });
    const parent = splitParent([line(), transferLine]);
    expect(planRowCommit(splitLine(parent, "line-xfer"), {
      date: "2026-08-01",
      payeeName: "Coffee",
      categoryId: "cat-dining",
      memo: "lunch",
      outflow: "2.00",
      inflow: "",
      flagColor: "",
    }, payees)).toMatchObject({
      kind: "patch",
      input: {
        subtransactions: [
          { id: "line-1" },
          {
            id: "line-xfer",
            payee_id: "p-coffee",
            payee_name: "Coffee",
            category_id: "cat-dining",
            transfer_account_id: null,
            transfer_transaction_id: null,
          },
        ],
      },
    });
  });

  test("sets transfer_account_id on a split line that becomes a transfer", () => {
    const parent = splitParent([line(), line({ id: "line-2", amount: -1400 })]);
    expect(planRowCommit(splitLine(parent, "line-1"), {
      date: "2026-08-01",
      payeeName: "Transfer : Rainy Day Saver",
      categoryId: "cat-dining",
      memo: "lunch",
      outflow: "2.00",
      inflow: "",
      flagColor: "",
    }, payees)).toMatchObject({
      kind: "patch",
      input: {
        subtransactions: [
          {
            id: "line-1",
            payee_id: "p-xfer",
            payee_name: "Transfer : Rainy Day Saver",
            category_id: null,
            transfer_account_id: "acct-saver",
          },
          { id: "line-2" },
        ],
      },
    });
  });
});

describe("payeeListEntries", () => {
  const everyday = { id: "acct", name: "Everyday Account" };
  const saver = { id: "acct-saver", name: "Rainy Day Saver" };
  const self = payee("p-self", "Transfer : Everyday Account", "acct");
  const listed = [shop, coffee, transfer, self];

  test("names transfer options by account and keeps payee.name as the value", () => {
    expect(payeeListEntries(listed, [everyday, saver], "acct")).toEqual([
      { id: "p-shop", value: "Shop" },
      { id: "p-coffee", value: "Coffee" },
      { id: "p-xfer", value: "Transfer : Rainy Day Saver", transferAccount: "Rainy Day Saver", transferAccountIcon: "🏦" },
    ]);
  });

  test("omits the transfer payee for the posting account", () => {
    expect(payeeListEntries(listed, [everyday, saver], postingAccountId(posted(txn()))).map((entry) => entry.id))
      .not.toContain("p-self");
    expect(payeeListEntries(listed, [everyday, saver], "acct-saver").map((entry) => entry.value)).toEqual([
      "Shop",
      "Coffee",
      "Transfer : Everyday Account",
    ]);
  });

  test("omits a transfer whose account name is unknown", () => {
    expect(payeeListEntries([transfer], [everyday], "acct")).toEqual([]);
  });

  test("omits a transfer to a closed account", () => {
    expect(payeeListEntries(listed, [everyday, { ...saver, closed: true }], "acct")).toEqual([
      { id: "p-shop", value: "Shop" },
      { id: "p-coffee", value: "Coffee" },
    ]);
  });
});

describe("parseAmountEntry", () => {
  test("parses a plain decimal through parseMilliunits", () => {
    expect(parseAmountEntry("3.40")).toBe(3400);
    expect(parseAmountEntry("0")).toBe(0);
    expect(parseAmountEntry("1.13")).toBe(1130);
    expect(parseAmountEntry("1.135")).toBeNull();
  });

  test("refuses a sum past the storage cap", () => {
    expect(parseAmountEntry("1000000000000")).toBe(1_000_000_000_000_000);
    expect(parseAmountEntry("1000000000000+0.01")).toBeNull();
    expect(parseAmountEntry("999999999999*999999")).toBeNull();
  });

  test("adds and subtracts in exact milliunits", () => {
    expect(parseAmountEntry("3.40+1.60")).toBe(5000);
    expect(parseAmountEntry("3.40 + 1.60")).toBe(5000);
    expect(parseAmountEntry("5-2")).toBe(3000);
  });

  test("divides and multiplies with half-away-from-zero rounding to the minor unit", () => {
    expect(parseAmountEntry("12/4")).toBe(3000);
    expect(parseAmountEntry("2*3")).toBe(6000);
    expect(parseAmountEntry("20/3")).toBe(6670);
    expect(parseAmountEntry("10/3")).toBe(3330);
    expect(parseAmountEntry("0.05/2")).toBe(30);
    try {
      configureMoney({ iso_code: "JPY", example_format: "123,456", decimal_digits: 0, decimal_separator: ".", symbol_first: true, group_separator: ",", currency_symbol: "¥", display_symbol: true });
      expect(parseAmountEntry("1000/3")).toBe(333_000);
      expect(parseAmountEntry("1000/3*2")).toBe(667_000);
    } finally {
      configureMoney(undefined);
    }
  });

  test("honours multiplication precedence and parentheses", () => {
    expect(parseAmountEntry("1+2*3")).toBe(7000);
    expect(parseAmountEntry("(1+2)*3")).toBe(9000);
  });

  test("returns null for garbage or a negative result", () => {
    expect(parseAmountEntry("")).toBeNull();
    expect(parseAmountEntry("nope")).toBeNull();
    expect(parseAmountEntry("-1")).toBeNull();
    expect(parseAmountEntry("1-2")).toBeNull();
    expect(parseAmountEntry("1/0")).toBeNull();
  });
});

describe("rowFieldWritable and writableFocus", () => {
  test("keeps payee writable on a regular row so a transfer list pick can commit", () => {
    const row = posted(txn());
    expect(rowFieldWritable(row, "payee", { ...shopDraft, payeeName: "Transfer : Rainy Day Saver" }, payees)).toBeTrue();
    expect(rowFieldWritable(row, "category", { ...shopDraft, payeeName: "Transfer : Rainy Day Saver" }, payees)).toBeFalse();
    expect(writableFocus(row, "payee")).toBe("payee");
  });

  test("keeps payee writable on a saved transfer split line", () => {
    const transferLine = line({
      id: "line-xfer",
      transfer_account_id: "acct-saver",
      payee_name: "Transfer : Rainy Day Saver",
      category_id: null,
    });
    const row = splitLine(splitParent([line(), transferLine]), "line-xfer");
    expect(rowFieldWritable(row, "payee")).toBeTrue();
    expect(rowFieldWritable(row, "date")).toBeFalse();
    expect(writableFocus(row, "category")).toBe("payee");
  });
});

// A zero-decimal comma plan (decimal ",", group ".") shows a fractional
// amount as "1,234" and a whole one as "1.234". Editing a saved row must open
// the amount it saved, and a typed sum must read each number as shown.
describe("amounts in a zero-decimal comma plan", () => {
  const format = { iso_code: "XXX", example_format: "123.456", decimal_digits: 0, decimal_separator: ",", symbol_first: false, group_separator: ".", currency_symbol: "", display_symbol: false };

  test("opens a saved fractional amount as the same amount, not a thousand times more", () => {
    try {
      configureMoney(format);
      const decision = beginRowEdit(posted(txn({ amount: -1234 })), "outflow", { writeLocked: false, mutatingId: null } as RowEditContext);
      expect(decision.kind).toBe("begin");
      if (decision.kind === "begin") {
        expect(decision.action.type === "begin" && decision.action.draft.outflow).toBe("1,234");
      }
    } finally {
      configureMoney(undefined);
    }
  });

  test("reads a typed sum number by number", () => {
    try {
      configureMoney(format);
      expect(parseAmountEntry("1.234+1")).toBe(1_235_000);
      expect(parseAmountEntry("1,234+1")).toBeNull();
    } finally {
      configureMoney(undefined);
    }
  });
});
