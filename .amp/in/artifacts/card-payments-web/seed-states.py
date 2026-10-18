"""Synthetic cards for the partial, overdue-carried and settled states (fake data only)."""
import json, subprocess, os, sqlite3
env = dict(os.environ, HOWMUCH_VERIFY_STATE_ROOT="/tmp/howmuch-verify-web", PATH="/home/user/howmuch/.cursor/skills/verify-howmuch/bin:" + os.environ["PATH"])
def http(method, path, body=None):
    args = ["control-howmuch", "http", method, path] + (["-d", json.dumps(body)] if body is not None else [])
    out = subprocess.run(args, env=env, capture_output=True, text=True, check=True).stdout
    data = json.loads(out)
    if "error" in data: raise SystemExit(f"{method} {path}: {out}")
    return data["data"]
P = "/v1/plans/local-plan"
def account(name):
    return http("POST", f"{P}/accounts", {"account": {"name": name, "type": "creditCard", "balance": 0}})["account"]
def txn(account_id, date, amount, payee_name=None, payee_id=None, memo=None):
    t = {"account_id": account_id, "date": date, "amount": amount, "cleared": "cleared", "approved": True, "memo": memo}
    if payee_id: t["payee_id"] = payee_id
    if payee_name: t["payee_name"] = payee_name
    return http("POST", f"{P}/transactions", {"transaction": t})
def terms(account_id, day, gap, rule):
    return http("PUT", f"{P}/accounts/{account_id}/card_payment_terms", {"card_payment_terms": {"statement_day": day, "due_gap_days": gap, "due_weekend_rule": rule, "default_funding_account_id": "acct-everyday"}})

# Card B: 500.00 charged before the 3 Oct statement, 20.00 paid on 10 Oct (minimum is 50.00) -> partial.
b = account("Card B")
txn(b["id"], "2026-10-01", -500000, payee_name="Shop A", memo="Synthetic charge")
txn("acct-everyday", "2026-10-10", -20000, payee_id=b["transfer_payee_id"], memo="Synthetic part payment")
terms(b["id"], 3, 25, "next")

# Card C: 300.00 charged before the 15 Sep statement, nothing paid; due 12 Oct passed -> carried overdue.
c = account("Card C")
txn(c["id"], "2026-09-10", -300000, payee_name="Shop B", memo="Synthetic charge")
terms(c["id"], 15, 25, "next")

# Card D: 200.00 charged before the 3 Oct statement, repaid as a plain inflow on 5 Oct -> settled.
d = account("Card D")
txn(d["id"], "2026-10-01", -200000, payee_name="Shop C", memo="Synthetic charge")
txn(d["id"], "2026-10-05", 200000, payee_name="Bank A", memo="Synthetic repayment, not a transfer")
terms(d["id"], 3, 25, "next")

print(json.dumps({"card_b": b["id"], "card_c": c["id"], "card_d": d["id"]}))
