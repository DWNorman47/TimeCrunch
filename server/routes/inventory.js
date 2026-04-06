const router = require('express').Router();
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ── Helpers ───────────────────────────────────────────────────────────────────

function isAdmin(req) {
  return req.user.role === 'admin' || req.user.role === 'super_admin';
}

// Apply a signed quantity delta to inventory_stock atomically.
// delta is positive to add, negative to subtract.
// bin = { area, bay, rack } — optional; updates the stored bin address if provided.
// Must be called inside a BEGIN/COMMIT block.
async function applyStockDelta(client, companyId, itemId, locationId, delta, bin = {}) {
  const area        = bin.area?.trim()        || null;
  const bay         = bin.bay?.trim()         || null;
  const compartment = bin.compartment?.trim() || null;
  const rack        = bin.rack?.trim()        || null;
  await client.query(
    `INSERT INTO inventory_stock (company_id, item_id, location_id, quantity, area, bay, compartment, rack, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (item_id, location_id)
     DO UPDATE SET
       quantity    = inventory_stock.quantity + EXCLUDED.quantity,
       area        = COALESCE(EXCLUDED.area,        inventory_stock.area),
       bay         = COALESCE(EXCLUDED.bay,         inventory_stock.bay),
       compartment = COALESCE(EXCLUDED.compartment, inventory_stock.compartment),
       rack        = COALESCE(EXCLUDED.rack,        inventory_stock.rack),
       updated_at  = NOW()`,
    [companyId, itemId, locationId, delta, area, bay, compartment, rack]
  );
}

// ── Items ─────────────────────────────────────────────────────────────────────

// GET /api/inventory/items
router.get('/items', requireAuth, async (req, res) => {
  const { search, category, active = 'true' } = req.query;
  const companyId = req.user.company_id;
  const admin = isAdmin(req);
  try {
    const conditions = ['company_id = $1'];
    const values = [companyId];
    let idx = 2;
    if (active !== 'all') {
      conditions.push(`active = $${idx++}`);
      values.push(active !== 'false');
    }
    if (category) { conditions.push(`category = $${idx++}`); values.push(category); }
    if (search) {
      conditions.push(`(name ILIKE $${idx} OR sku ILIKE $${idx} OR category ILIKE $${idx})`);
      values.push(`%${search}%`); idx++;
    }
    const result = await pool.query(
      `SELECT id, name, sku, description, category, unit,
              ${admin ? 'unit_cost,' : ''}
              reorder_point, reorder_qty, active, created_at
       FROM inventory_items WHERE ${conditions.join(' AND ')} ORDER BY name`,
      values
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/inventory/items
router.post('/items', requireAdmin, async (req, res) => {
  const { name, sku, description, category, unit = 'each', unit_cost, reorder_point = 0, reorder_qty = 0 } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `INSERT INTO inventory_items (company_id, name, sku, description, category, unit, unit_cost, reorder_point, reorder_qty, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [companyId, name.trim(), sku?.trim() || null, description?.trim() || null,
       category?.trim() || null, unit, unit_cost != null ? parseFloat(unit_cost) : null,
       parseInt(reorder_point) || 0, parseInt(reorder_qty) || 0, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'SKU already exists for this company' });
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/inventory/items/:id
router.patch('/items/:id', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  const { name, sku, description, category, unit, unit_cost, reorder_point, reorder_qty, active } = req.body;
  try {
    const existing = await pool.query('SELECT id FROM inventory_items WHERE id=$1 AND company_id=$2', [req.params.id, companyId]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Item not found' });
    const sets = [], vals = [req.params.id, companyId]; let idx = 3;
    if (name !== undefined) { sets.push(`name=$${idx++}`); vals.push(name.trim()); }
    if (sku !== undefined) { sets.push(`sku=$${idx++}`); vals.push(sku?.trim() || null); }
    if (description !== undefined) { sets.push(`description=$${idx++}`); vals.push(description?.trim() || null); }
    if (category !== undefined) { sets.push(`category=$${idx++}`); vals.push(category?.trim() || null); }
    if (unit !== undefined) { sets.push(`unit=$${idx++}`); vals.push(unit); }
    if (unit_cost !== undefined) { sets.push(`unit_cost=$${idx++}`); vals.push(unit_cost != null ? parseFloat(unit_cost) : null); }
    if (reorder_point !== undefined) { sets.push(`reorder_point=$${idx++}`); vals.push(parseInt(reorder_point) || 0); }
    if (reorder_qty !== undefined) { sets.push(`reorder_qty=$${idx++}`); vals.push(parseInt(reorder_qty) || 0); }
    if (active !== undefined) { sets.push(`active=$${idx++}`); vals.push(!!active); }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    sets.push(`updated_at=NOW()`);
    const result = await pool.query(
      `UPDATE inventory_items SET ${sets.join(',')} WHERE id=$1 AND company_id=$2 RETURNING *`,
      vals
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'SKU already exists for this company' });
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/inventory/items/:id  (soft delete)
router.delete('/items/:id', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const stock = await pool.query(
      'SELECT COALESCE(SUM(quantity),0) as total FROM inventory_stock WHERE item_id=$1 AND company_id=$2',
      [req.params.id, companyId]
    );
    if (parseFloat(stock.rows[0].total) > 0) {
      return res.status(409).json({ error: 'Item has stock on hand. Transfer or adjust to zero before archiving.' });
    }
    const result = await pool.query(
      'UPDATE inventory_items SET active=false, updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING id',
      [req.params.id, companyId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Item not found' });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/inventory/items/categories  — distinct categories for filter dropdowns
router.get('/items/categories', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT category FROM inventory_items WHERE company_id=$1 AND category IS NOT NULL ORDER BY category`,
      [req.user.company_id]
    );
    res.json(result.rows.map(r => r.category));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── Locations ─────────────────────────────────────────────────────────────────

// GET /api/inventory/locations
router.get('/locations', requireAuth, async (req, res) => {
  const { active = 'true' } = req.query;
  const companyId = req.user.company_id;
  try {
    const conditions = ['l.company_id = $1'];
    const values = [companyId]; let idx = 2;
    if (active !== 'all') { conditions.push(`l.active = $${idx++}`); values.push(active !== 'false'); }
    const result = await pool.query(
      `SELECT l.*, p.name as project_name
       FROM inventory_locations l
       LEFT JOIN projects p ON l.project_id = p.id
       WHERE ${conditions.join(' AND ')} ORDER BY l.name`,
      values
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/inventory/locations
router.post('/locations', requireAdmin, async (req, res) => {
  const { name, type = 'warehouse', project_id, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `INSERT INTO inventory_locations (company_id, name, type, project_id, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [companyId, name.trim(), type, project_id || null, notes?.trim() || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /api/inventory/locations/:id
router.patch('/locations/:id', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  const { name, type, project_id, notes, active } = req.body;
  try {
    const existing = await pool.query('SELECT id FROM inventory_locations WHERE id=$1 AND company_id=$2', [req.params.id, companyId]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Location not found' });
    const sets = [], vals = [req.params.id, companyId]; let idx = 3;
    if (name !== undefined) { sets.push(`name=$${idx++}`); vals.push(name.trim()); }
    if (type !== undefined) { sets.push(`type=$${idx++}`); vals.push(type); }
    if (project_id !== undefined) { sets.push(`project_id=$${idx++}`); vals.push(project_id || null); }
    if (notes !== undefined) { sets.push(`notes=$${idx++}`); vals.push(notes?.trim() || null); }
    if (active !== undefined) { sets.push(`active=$${idx++}`); vals.push(!!active); }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    const result = await pool.query(
      `UPDATE inventory_locations SET ${sets.join(',')} WHERE id=$1 AND company_id=$2 RETURNING *`,
      vals
    );
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/inventory/locations/:id  (soft delete)
router.delete('/locations/:id', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const stock = await pool.query(
      'SELECT COALESCE(SUM(ABS(quantity)),0) as total FROM inventory_stock WHERE location_id=$1 AND company_id=$2',
      [req.params.id, companyId]
    );
    if (parseFloat(stock.rows[0].total) > 0) {
      return res.status(409).json({ error: 'Location has stock on hand. Transfer all items out before archiving.' });
    }
    const result = await pool.query(
      'UPDATE inventory_locations SET active=false WHERE id=$1 AND company_id=$2 RETURNING id',
      [req.params.id, companyId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Location not found' });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── Stock ─────────────────────────────────────────────────────────────────────

// GET /api/inventory/stock
router.get('/stock', requireAuth, async (req, res) => {
  const { location_id, item_id } = req.query;
  const companyId = req.user.company_id;
  const admin = isAdmin(req);
  try {
    const conditions = ['s.company_id = $1'];
    const values = [companyId]; let idx = 2;
    if (location_id) { conditions.push(`s.location_id = $${idx++}`); values.push(location_id); }
    if (item_id) { conditions.push(`s.item_id = $${idx++}`); values.push(item_id); }
    const result = await pool.query(
      `SELECT s.id, s.item_id, i.name as item_name, i.sku, i.category, i.unit,
              ${admin ? 'i.unit_cost,' : ''}
              i.reorder_point, s.location_id, l.name as location_name, l.type as location_type,
              s.area, s.bay, s.compartment, s.rack, s.quantity, s.updated_at
       FROM inventory_stock s
       JOIN inventory_items i ON s.item_id = i.id
       JOIN inventory_locations l ON s.location_id = l.id
       WHERE ${conditions.join(' AND ')} AND i.active = true AND l.active = true
       ORDER BY l.name, i.name`,
      values
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/inventory/stock/low
router.get('/stock/low', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `SELECT i.id as item_id, i.name as item_name, i.sku, i.unit, i.unit_cost,
              i.reorder_point, i.reorder_qty,
              COALESCE(SUM(s.quantity), 0) as total_qty,
              json_agg(json_build_object(
                'location_id', l.id, 'location_name', l.name, 'quantity', s.quantity
              ) ORDER BY l.name) FILTER (WHERE l.id IS NOT NULL) as locations
       FROM inventory_items i
       LEFT JOIN inventory_stock s ON i.id = s.item_id
       LEFT JOIN inventory_locations l ON s.location_id = l.id AND l.active = true
       WHERE i.company_id = $1 AND i.active = true AND i.reorder_point > 0
       GROUP BY i.id
       HAVING COALESCE(SUM(s.quantity), 0) <= i.reorder_point
       ORDER BY i.name`,
      [companyId]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── Transactions ──────────────────────────────────────────────────────────────

// POST /api/inventory/transactions
router.post('/transactions', requireAuth, async (req, res) => {
  const { type, item_id, quantity, from_location_id, to_location_id, project_id, notes, reference_no, unit_cost, area, bay, compartment, rack } = req.body;
  const companyId = req.user.company_id;
  const admin = isAdmin(req);

  if (!type) return res.status(400).json({ error: 'type required' });
  if (!['receive','issue','transfer','adjust'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if (!admin && type !== 'issue') return res.status(403).json({ error: 'Workers may only post issue transactions' });
  if (!item_id) return res.status(400).json({ error: 'item_id required' });
  const qty = parseFloat(quantity);
  if (isNaN(qty) || qty === 0) return res.status(400).json({ error: 'quantity must be a non-zero number' });

  // Type-specific validation
  if (type === 'receive' && !to_location_id) return res.status(400).json({ error: 'to_location_id required for receive' });
  if (type === 'issue' && !from_location_id) return res.status(400).json({ error: 'from_location_id required for issue' });
  if (type === 'transfer' && (!from_location_id || !to_location_id)) return res.status(400).json({ error: 'from_location_id and to_location_id required for transfer' });
  if (type === 'transfer' && from_location_id === to_location_id) return res.status(400).json({ error: 'from and to locations must differ' });
  if (type === 'adjust' && !to_location_id) return res.status(400).json({ error: 'to_location_id required for adjust' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify item belongs to company
    const item = await client.query('SELECT id, unit_cost FROM inventory_items WHERE id=$1 AND company_id=$2 AND active=true', [item_id, companyId]);
    if (item.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Item not found' }); }

    // Verify locations belong to company
    if (from_location_id) {
      const loc = await client.query('SELECT id FROM inventory_locations WHERE id=$1 AND company_id=$2', [from_location_id, companyId]);
      if (loc.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'from_location not found' }); }
    }
    if (to_location_id) {
      const loc = await client.query('SELECT id FROM inventory_locations WHERE id=$1 AND company_id=$2', [to_location_id, companyId]);
      if (loc.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'to_location not found' }); }
    }

    const absQty = Math.abs(qty);
    const snapshotCost = unit_cost != null ? parseFloat(unit_cost) : item.rows[0].unit_cost;

    // Insert transaction record
    const txn = await client.query(
      `INSERT INTO inventory_transactions
       (company_id, type, item_id, quantity, from_location_id, to_location_id, project_id, performed_by, notes, reference_no, unit_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [companyId, type, item_id, absQty, from_location_id || null, to_location_id || null,
       project_id || null, req.user.id, notes?.trim() || null, reference_no?.trim() || null, snapshotCost]
    );

    // Update stock — bin fields (area/bay/compartment/rack) apply to the destination slot
    const bin = { area, bay, compartment, rack };
    if (type === 'receive')  await applyStockDelta(client, companyId, item_id, to_location_id, absQty, bin);
    if (type === 'issue')    await applyStockDelta(client, companyId, item_id, from_location_id, -absQty);
    if (type === 'transfer') {
      await applyStockDelta(client, companyId, item_id, from_location_id, -absQty);
      await applyStockDelta(client, companyId, item_id, to_location_id, absQty, bin);
    }
    if (type === 'adjust')   await applyStockDelta(client, companyId, item_id, to_location_id, qty, bin); // signed

    await client.query('COMMIT');

    // Check if resulting stock is negative and include warning
    let warning = null;
    const stockCheck = await pool.query('SELECT quantity FROM inventory_stock WHERE item_id=$1 AND company_id=$2', [item_id, companyId]);
    const anyNegative = stockCheck.rows.some(r => parseFloat(r.quantity) < 0);
    if (anyNegative) warning = 'stock_negative';

    res.status(201).json({ ...txn.rows[0], warning });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// GET /api/inventory/transactions
router.get('/transactions', requireAuth, async (req, res) => {
  const { item_id, location_id, type, project_id, from, to, limit = 50, offset = 0 } = req.query;
  const companyId = req.user.company_id;
  const admin = isAdmin(req);
  try {
    const conditions = ['t.company_id = $1'];
    const values = [companyId]; let idx = 2;
    if (!admin) { conditions.push(`t.performed_by = $${idx++}`); values.push(req.user.id); }
    if (item_id) { conditions.push(`t.item_id = $${idx++}`); values.push(item_id); }
    if (location_id) { conditions.push(`(t.from_location_id = $${idx} OR t.to_location_id = $${idx})`); values.push(location_id); idx++; }
    if (type) { conditions.push(`t.type = $${idx++}`); values.push(type); }
    if (project_id) { conditions.push(`t.project_id = $${idx++}`); values.push(project_id); }
    if (from) { conditions.push(`t.created_at >= $${idx++}`); values.push(from); }
    if (to) { conditions.push(`t.created_at < ($${idx++}::date + interval '1 day')`); values.push(to); }
    const result = await pool.query(
      `SELECT t.*, i.name as item_name, i.unit,
              fl.name as from_location_name, tl.name as to_location_name,
              p.name as project_name, u.full_name as performed_by_name
       FROM inventory_transactions t
       JOIN inventory_items i ON t.item_id = i.id
       LEFT JOIN inventory_locations fl ON t.from_location_id = fl.id
       LEFT JOIN inventory_locations tl ON t.to_location_id = tl.id
       LEFT JOIN projects p ON t.project_id = p.id
       JOIN users u ON t.performed_by = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, parseInt(limit), parseInt(offset)]
    );
    const total = await pool.query(`SELECT COUNT(*) FROM inventory_transactions t WHERE ${conditions.join(' AND ')}`, values);
    res.json({ transactions: result.rows, total: parseInt(total.rows[0].count) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── Cycle Counts ──────────────────────────────────────────────────────────────

// GET /api/inventory/cycle-counts
router.get('/cycle-counts', requireAdmin, async (req, res) => {
  const { location_id, status } = req.query;
  const companyId = req.user.company_id;
  try {
    const conditions = ['cc.company_id = $1'];
    const values = [companyId]; let idx = 2;
    if (location_id) { conditions.push(`cc.location_id = $${idx++}`); values.push(location_id); }
    if (status) { conditions.push(`cc.status = $${idx++}`); values.push(status); }
    const result = await pool.query(
      `SELECT cc.*, l.name as location_name,
              u.full_name as started_by_name,
              cu.full_name as completed_by_name,
              (SELECT COUNT(*) FROM inventory_cycle_count_lines WHERE cycle_count_id = cc.id) as line_count,
              (SELECT COUNT(*) FROM inventory_cycle_count_lines WHERE cycle_count_id = cc.id AND counted_qty IS NOT NULL) as counted_count
       FROM inventory_cycle_counts cc
       JOIN inventory_locations l ON cc.location_id = l.id
       JOIN users u ON cc.started_by = u.id
       LEFT JOIN users cu ON cc.completed_by = cu.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY cc.started_at DESC`,
      values
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/inventory/cycle-counts
router.post('/cycle-counts', requireAdmin, async (req, res) => {
  const { location_id, notes } = req.body;
  const companyId = req.user.company_id;
  if (!location_id) return res.status(400).json({ error: 'location_id required' });
  try {
    // Block if an active count already exists for this location
    const existing = await pool.query(
      `SELECT id FROM inventory_cycle_counts WHERE company_id=$1 AND location_id=$2 AND status IN ('draft','in_progress')`,
      [companyId, location_id]
    );
    if (existing.rowCount > 0) return res.status(409).json({ error: 'An active cycle count already exists for this location.' });

    // Verify location
    const loc = await pool.query('SELECT id FROM inventory_locations WHERE id=$1 AND company_id=$2', [location_id, companyId]);
    if (loc.rowCount === 0) return res.status(404).json({ error: 'Location not found' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cc = await client.query(
        `INSERT INTO inventory_cycle_counts (company_id, location_id, started_by, notes)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [companyId, location_id, req.user.id, notes?.trim() || null]
      );
      const countId = cc.rows[0].id;

      // Snapshot current stock at this location
      const stock = await client.query(
        `SELECT s.item_id, s.quantity FROM inventory_stock s
         JOIN inventory_items i ON s.item_id = i.id
         WHERE s.location_id = $1 AND s.company_id = $2 AND i.active = true`,
        [location_id, companyId]
      );

      if (stock.rows.length > 0) {
        const lineValues = stock.rows.map((r, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(', ');
        const lineParams = [countId];
        stock.rows.forEach(r => { lineParams.push(r.item_id); lineParams.push(r.quantity); });
        await client.query(
          `INSERT INTO inventory_cycle_count_lines (cycle_count_id, item_id, expected_qty) VALUES ${lineValues}`,
          lineParams
        );
      }

      await client.query('COMMIT');

      // Return with lines
      const lines = await pool.query(
        `SELECT l.*, i.name as item_name, i.unit, i.sku
         FROM inventory_cycle_count_lines l
         JOIN inventory_items i ON l.item_id = i.id
         WHERE l.cycle_count_id = $1 ORDER BY i.name`,
        [countId]
      );
      res.status(201).json({ ...cc.rows[0], lines: lines.rows });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/inventory/cycle-counts/:id
router.get('/cycle-counts/:id', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const cc = await pool.query(
      `SELECT cc.*, l.name as location_name,
              u.full_name as started_by_name,
              cu.full_name as completed_by_name
       FROM inventory_cycle_counts cc
       JOIN inventory_locations l ON cc.location_id = l.id
       JOIN users u ON cc.started_by = u.id
       LEFT JOIN users cu ON cc.completed_by = cu.id
       WHERE cc.id = $1 AND cc.company_id = $2`,
      [req.params.id, companyId]
    );
    if (cc.rowCount === 0) return res.status(404).json({ error: 'Cycle count not found' });
    const lines = await pool.query(
      `SELECT l.*, i.name as item_name, i.unit, i.sku, u.full_name as counted_by_name
       FROM inventory_cycle_count_lines l
       JOIN inventory_items i ON l.item_id = i.id
       LEFT JOIN users u ON l.counted_by = u.id
       WHERE l.cycle_count_id = $1 ORDER BY i.name`,
      [req.params.id]
    );
    res.json({ ...cc.rows[0], lines: lines.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /api/inventory/cycle-counts/:id  (header fields + draft→in_progress)
router.patch('/cycle-counts/:id', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  const { notes, status } = req.body;
  try {
    const cc = await pool.query('SELECT * FROM inventory_cycle_counts WHERE id=$1 AND company_id=$2', [req.params.id, companyId]);
    if (cc.rowCount === 0) return res.status(404).json({ error: 'Cycle count not found' });
    if (cc.rows[0].status === 'completed') return res.status(409).json({ error: 'Cannot modify a completed count' });
    if (status && status !== 'in_progress') return res.status(400).json({ error: 'Can only advance status to in_progress' });
    const sets = [], vals = [req.params.id, companyId]; let idx = 3;
    if (notes !== undefined) { sets.push(`notes=$${idx++}`); vals.push(notes); }
    if (status === 'in_progress') { sets.push(`status='in_progress'`); }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    const result = await pool.query(
      `UPDATE inventory_cycle_counts SET ${sets.join(',')} WHERE id=$1 AND company_id=$2 RETURNING *`,
      vals
    );
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /api/inventory/cycle-counts/:id/lines/:lineId
router.patch('/cycle-counts/:id/lines/:lineId', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  const { counted_qty, notes } = req.body;
  try {
    // Verify count belongs to company and isn't completed
    const cc = await pool.query(
      'SELECT id, status FROM inventory_cycle_counts WHERE id=$1 AND company_id=$2',
      [req.params.id, companyId]
    );
    if (cc.rowCount === 0) return res.status(404).json({ error: 'Cycle count not found' });
    if (cc.rows[0].status === 'completed') return res.status(409).json({ error: 'Count is already completed' });

    const sets = [], vals = [req.params.lineId, req.params.id]; let idx = 3;
    if (counted_qty !== undefined) {
      const qty = parseFloat(counted_qty);
      if (isNaN(qty) || qty < 0) return res.status(400).json({ error: 'counted_qty must be a non-negative number' });
      sets.push(`counted_qty=$${idx++}`); vals.push(qty);
      sets.push(`counted_by=$${idx++}`); vals.push(req.user.id);
      sets.push(`counted_at=NOW()`);
    }
    if (notes !== undefined) { sets.push(`notes=$${idx++}`); vals.push(notes); }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    const result = await pool.query(
      `UPDATE inventory_cycle_count_lines SET ${sets.join(',')}
       WHERE id=$1 AND cycle_count_id=$2 RETURNING *`,
      vals
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Line not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/inventory/cycle-counts/:id/complete
router.post('/cycle-counts/:id/complete', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const cc = await pool.query(
      'SELECT * FROM inventory_cycle_counts WHERE id=$1 AND company_id=$2',
      [req.params.id, companyId]
    );
    if (cc.rowCount === 0) return res.status(404).json({ error: 'Cycle count not found' });
    if (cc.rows[0].status === 'completed') return res.status(409).json({ error: 'Already completed' });

    const lines = await pool.query(
      'SELECT * FROM inventory_cycle_count_lines WHERE cycle_count_id=$1',
      [req.params.id]
    );

    // Block if any line uncounted
    const uncounted = lines.rows.filter(l => l.counted_qty === null);
    if (uncounted.length > 0) {
      const itemIds = uncounted.map(l => l.item_id);
      const items = await pool.query('SELECT id, name FROM inventory_items WHERE id = ANY($1)', [itemIds]);
      const names = items.rows.map(i => i.name);
      return res.status(422).json({ error: `${uncounted.length} item(s) not yet counted: ${names.join(', ')}` });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Post adjust transactions for lines with non-zero variance
      const linesWithVariance = lines.rows.filter(l => parseFloat(l.variance) !== 0);
      for (const line of linesWithVariance) {
        const delta = parseFloat(line.variance); // positive = counted more, negative = counted less
        await client.query(
          `INSERT INTO inventory_transactions
           (company_id, type, item_id, quantity, to_location_id, performed_by, notes)
           VALUES ($1,'adjust',$2,$3,$4,$5,'Cycle count adjustment')`,
          [companyId, line.item_id, Math.abs(delta), cc.rows[0].location_id, req.user.id]
        );
        await applyStockDelta(client, companyId, line.item_id, cc.rows[0].location_id, delta);
      }

      // Mark count complete
      await client.query(
        `UPDATE inventory_cycle_counts SET status='completed', completed_by=$1, completed_at=NOW()
         WHERE id=$2`,
        [req.user.id, req.params.id]
      );

      await client.query('COMMIT');
      res.json({ success: true, adjustments_posted: linesWithVariance.length });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
