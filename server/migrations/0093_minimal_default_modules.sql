-- New companies will default to a minimal module set: Time Clock, Projects,
-- Team enabled; Field, Inventory, Analytics disabled. Admin can enable
-- the others from Company Settings → Modules.
--
-- Existing companies have been running with all modules ON (the current
-- defaults). To make this default change a no-op for them, INSERT explicit
-- '1' rows for any (company, module_*) pair that doesn't already have a
-- settings row. After this, the in-code default change can flip to false
-- without silently disabling modules for any current customer.
--
-- ON CONFLICT DO NOTHING preserves anything already explicitly set
-- (e.g. companies that have toggled a module off get to keep '0').

INSERT INTO settings (company_id, key, value)
SELECT c.id, m.key, '1'
FROM companies c
CROSS JOIN (VALUES
  ('module_field'),
  ('module_inventory'),
  ('module_analytics')
) AS m(key)
ON CONFLICT (company_id, key) DO NOTHING;
