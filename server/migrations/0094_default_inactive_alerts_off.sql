-- Track Inactive Workers (feature_inactive_alerts) now defaults to OFF for
-- new companies — most teams find it noisy out of the box and turn it off
-- on day one. Existing companies have been running with it ON, so backfill
-- explicit '1' rows for every company that doesn't already have one. After
-- this, the in-code default change is a no-op for them.
--
-- ON CONFLICT DO NOTHING preserves anything already explicitly set
-- (a company that toggled it off keeps its '0').

INSERT INTO settings (company_id, key, value)
SELECT c.id, 'feature_inactive_alerts', '1'
FROM companies c
ON CONFLICT (company_id, key) DO NOTHING;
