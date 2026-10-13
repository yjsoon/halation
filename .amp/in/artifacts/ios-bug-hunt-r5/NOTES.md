# iOS bug hunt round 5: E2E evidence

Local-only stack: Bun 1.4.0 `apps/api/src/server.ts` on a fresh scratch
SQLite file, API token `local-e2e-token`, synthetic data. No remote service.
No Swift toolchain was available, so the iOS review in this round was by
reading only; nothing iOS was compiled or run.

## Setup

```sh
cd apps/api
HOWMUCH_DB_PATH=<scratch>/aom.sqlite bun -e 'import { openDatabase } from "./src/db"; import { LedgerRepository } from "./src/repository"; await new LedgerRepository(openDatabase(process.env.HOWMUCH_DB_PATH!), "local-plan").ensurePlan("local-plan");'
HOWMUCH_DB_PATH=<scratch>/aom.sqlite HOWMUCH_PORT=8854 HOWMUCH_API_TOKEN=local-e2e-token bun src/server.ts &
BASE=http://127.0.0.1:8854 bun ../../.amp/in/artifacts/ios-bug-hunt-r5/age-of-money-week-e2e.ts
```

## 1. Age of Money by week put a year's last week at the end

Revision before fix: `f8b7072`. Script: `age-of-money-week-e2e.ts` creates an
account with a +1,000.00 inflow on Thursday 2 January 2025 and two -10.00
outflows on Wednesday 31 December 2025 and 8 January 2026, then reads
`GET /api/reports/age-of-money?plan_id=local-plan&from=2025-01-02&to=2026-01-14&interval=week`.

Weekly periods are built by stepping seven days from `from` and labelling
each step with the day-of-year week, so the one or two day `YYYY-W52` stub at
the end of a year has no step unless `from` falls on the same weekday as
31 December. A row in that stub then created its bucket last, after the next
year's weeks, and the web Age of Money chart and table drew it out of order.

| Check | Expected | Before | After |
| --- | --- | --- | --- |
| status | 200 | 200 | 200 |
| last five periods | 2025-W50, 2025-W51, 2025-W52, 2026-W00, 2026-W01 | 2025-W50, 2025-W51, 2026-W00, 2026-W01, 2025-W52 | 2025-W50, 2025-W51, 2025-W52, 2026-W00, 2026-W01 |
| periods in date order | true | false | true |

The D1 path (`async-reports.ts`) has the same builder and gets the same fix.
`bun test tests/report-aggregates.test.ts`, the api.test.ts age-of-money test
and the d1.test.ts age test pass after the fix.
