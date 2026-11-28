-- The plan's IANA time zone, set from the owner's browser at setup and
-- editable in Settings. NULL means the server's HOWMUCH_TIME_ZONE, then UTC.
ALTER TABLE plans ADD COLUMN time_zone TEXT;
