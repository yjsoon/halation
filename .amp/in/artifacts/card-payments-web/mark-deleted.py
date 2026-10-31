"""Mark a synthetic account deleted directly (setup only; fake data)."""
import sqlite3, sys
db = sqlite3.connect("/tmp/howmuch-verify-web/cardpay-web/howmuch.sqlite")
n = db.execute("UPDATE accounts SET deleted=1, updated_at=CURRENT_TIMESTAMP WHERE id=?", (sys.argv[1],)).rowcount
db.commit(); print(f"deleted {n} account(s)")
