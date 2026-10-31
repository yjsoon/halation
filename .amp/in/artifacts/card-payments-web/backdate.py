"""Backdate Card C's terms so its 12 Oct due date falls after setup (otherwise B2 rightly hides the overdue)."""
import sqlite3, sys
db = sqlite3.connect("/tmp/howmuch-verify-web/cardpay-web/howmuch.sqlite")
n = db.execute("UPDATE card_payment_terms SET created_at='2026-08-01 00:00:00' WHERE account_id=?", (sys.argv[1],)).rowcount
db.commit(); print(f"backdated {n} row(s)")
