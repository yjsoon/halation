As-of-today balances in the account list, group totals and register headers

Base revision: e1506e71 (origin/main), with the uncommitted change on top.
Stack: control-howmuch launch (fixtures/demo-ledger.json, private SQLite), first-owner
setup in the web app as verifier. Browser: agent-browser, 1440x900 @2x. iOS: HowMuch
Debug build from scripts/ios-xcodebuild.sh on an Amp Mac satellite (macos-27, iOS 27.3
simulator), signed in to the same API through a forwarded port, driven with idb.
Today in every client: 2026-11-14.

Setup writes (API, synthetic data):
1. POST /v1/plans/local-plan/transactions: Travel Card +5,837.17 on 2026-11-17,
   payee = Everyday Account transfer payee, memo "Pay card (scheduled 17 Nov)".
   Server balances after: Everyday 192,171.33, Travel Card -58,993.63.
2. POST: Travel Card -27.46 on 2026-11-14 ("Sushi Example").
3. Web quick entry (/add): Everyday spend 100.00 dated 2026-11-14 (date field not
   changed), then Everyday spend 40.00 dated 2026-11-20.
   Final server balances: Everyday 192,031.33, Rainy Day Saver 421,500.00,
   Travel Card -59,021.09.

Web, before the change (git stash of apps/web, after write 1):
  Sidebar: Ledger $554,677.70; BANK AND CASH $613,671.33; Everyday $192,171.33;
  CREDIT -$58,993.63; Travel Card -$58,993.63.
  Travel Card header: "Working balance -$58,993.63 ... -$64,830.80 as of today".
  => sidebar and groups count the future transfer.

Web, after the change (after write 1):
  Sidebar: Ledger $554,677.70; BANK AND CASH $619,508.50; Everyday $198,008.50;
  CREDIT -$64,830.80; Travel Card -$64,830.80.
  Travel Card header: "Balance -$64,830.80 / Working -$58,993.63 including posted
  scheduled / -$64,000.00 cleared · $5,006.37 uncleared". PASS (matches sidebar).

Web, after write 2 (today-dated row still counts):
  Ledger $554,650.24; CREDIT and Travel Card -$64,858.26; header Balance -$64,858.26,
  Working -$59,021.09. PASS.

Web, after write 3 made in the app, then SPA navigation to Ledger (no reload):
  Ledger $554,550.24; Everyday $197,908.50 (the 100.00 today row counted, the 40.00
  future row not); Ledger header "Balance $554,550.24 / Working $554,510.24 including
  posted scheduled". PASS.

iOS, after the change (same stack, final state):
  Accounts: Cash $619,408.50; Everyday Account $197,908.50; Rainy Day Saver
  $421,500.00; Credit -$64,858.26; Travel Card -$64,858.26 (accessibility values).
  Travel Card register header accessibility label: "-$64,858.26. Working -$59,021.09
  including posted scheduled." PASS (list row equals header, equals web sidebar).

Checks:
  bun test: 809 pass, 0 fail.
  apps/web and apps/worker typecheck: pass.
  verify-ios-focus-zoom, verify-ios-confirm-presentation, verify-ios-disclosure-chevron: pass.
  scripts/ios-xcodebuild.sh test (fresh build-for-testing exit=0): 825 tests, 1 skipped,
  0 failures. The first run failed 9 CaptureSnapshotTests only because the new simulator
  had accessibility off (documented in apps/ios/AGENTS.md); rerun after enabling it passed.
