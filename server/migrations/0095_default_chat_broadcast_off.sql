-- Company Chat (feature_chat) and Announce to All Workers (feature_broadcast)
-- now default to OFF for new companies — both are optional engagement
-- features that most teams don't need on day one. Existing companies have
-- been running with both ON, so backfill explicit '1' rows for every
-- company that doesn't already have one. After this, the in-code default
-- flip is a no-op for them.
--
-- ON CONFLICT DO NOTHING preserves anything already explicitly set
-- (a company that toggled either off keeps its '0').

INSERT INTO settings (company_id, key, value)
SELECT c.id, m.key, '1'
FROM companies c
CROSS JOIN (VALUES
  ('feature_chat'),
  ('feature_broadcast')
) AS m(key)
ON CONFLICT (company_id, key) DO NOTHING;
