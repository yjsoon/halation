"""Close a synthetic account directly: the API has no close route (the web and iOS close accounts elsewhere)."""
import sqlite3, sys
db = sqlite3.connect("/tmp/howmuch-verify-web/cardpay-web/howmuch.sqlite")
n = db.execute("UPDATE accounts SET closed=1, updated_at=CURRENT_TIMESTAMP WHERE id=?", (sys.argv[1],)).rowcount
db.commit(); print(f"closed {n} account(s)")
