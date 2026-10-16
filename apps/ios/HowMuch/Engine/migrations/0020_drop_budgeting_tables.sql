-- Drop the tables left behind by the removed budgeting Plan.
--
-- `plan_month_assignments` (0005) and `plan_month_category_targets` (0006)
-- held local month assignments and targets; `ynab_source_month_activity`
-- (0017) was a month-view baseline. Their routes and readers went in e605ef8
-- and nothing has read or written them since. The YNAB `month` and
-- `month_category` raw objects stay in `ynab_raw_objects` as provenance.
--
-- Nothing references these tables, so dropping them needs no rebuild. Their
-- indexes go with them. Back up the database before applying this remotely.
DROP TABLE IF EXISTS plan_month_assignments;
DROP TABLE IF EXISTS plan_month_category_targets;
DROP TABLE IF EXISTS ynab_source_month_activity;
