import { describe, expect, test } from "bun:test";
import { configureMoney } from "./money";
import { newAccountRequest } from "./new-account";

// Failure modes the browser flow would not reliably show:
// - The server stores the opening balance as sent and never flips its sign.
//   A credit card entered as "owe 500" and sent as +500 becomes an asset,
//   and net worth is wrong by twice the debt.
// - Someone who types "-500" for what they owe must not end up with +500.
// - An overdrawn current account is a real negative balance, not a debt to
//   be made positive.
// - A blank or whitespace name, or an amount the money parser rejects, must
//   not reach the server as an empty account or a zero balance.
describe("newAccountRequest", () => {
  test("stores what is owed on a liability as a negative balance", () => {
    configureMoney(undefined);
    expect(newAccountRequest({ name: "Travel Card", kind: "creditCard", balance: "500" }))
      .toEqual({ ok: true, body: { name: "Travel Card", type: "creditCard", balance: -500_000 } });
    expect(newAccountRequest({ name: "Home Loan", kind: "mortgage", balance: "-1200.50" }))
      .toEqual({ ok: true, body: { name: "Home Loan", type: "mortgage", balance: -1_200_500 } });
  });

  test("keeps an overdrawn asset negative and a positive asset positive", () => {
    configureMoney(undefined);
    expect(newAccountRequest({ name: "Everyday", kind: "checking", balance: "-20" }))
      .toEqual({ ok: true, body: { name: "Everyday", type: "checking", balance: -20_000 } });
    expect(newAccountRequest({ name: "Wallet", kind: "cash", balance: "12.5" }))
      .toEqual({ ok: true, body: { name: "Wallet", type: "cash", balance: 12_500 } });
  });

  test("treats a blank balance as zero and trims the name", () => {
    configureMoney(undefined);
    expect(newAccountRequest({ name: "  Savings  ", kind: "savings", balance: "  " }))
      .toEqual({ ok: true, body: { name: "Savings", type: "savings", balance: 0 } });
  });

  test("rejects a blank name and an unreadable balance", () => {
    configureMoney(undefined);
    expect(newAccountRequest({ name: "   ", kind: "checking", balance: "10" }))
      .toEqual({ ok: false, error: "name" });
    expect(newAccountRequest({ name: "Everyday", kind: "checking", balance: "1.2345" }))
      .toEqual({ ok: false, error: "balance" });
    expect(newAccountRequest({ name: "Everyday", kind: "checking", balance: "ten" }))
      .toEqual({ ok: false, error: "balance" });
  });
});
