const router = require('express').Router();
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { uploadBase64 } = require('../r2');
const { checkStorageLimit, incrementStorage } = require('../storage');
const { sendPushToCompanyAdmins } = require('../push');
const { createInboxItemBatch } = require('./inbox');

// ── Helpers ───────────────────────────────────────────────────────────────────

function isAdmin(req) {
  return req.user.role === 'admin' || req.user.role === 'super_admin';
}

// Apply a signed quantity delta to inventory_stock atomically.
// delta is positive to add, negative to subtract.
// bin    = { area_id, rack_id, bay_id, compartment_id } — optional FK IDs
// uomId  = inventory_item_uoms.id — null means item's primary unit (no UOM row)
// Must be called inside a BEGIN/COMMIT block.
async function applyStockDelta(client, companyId, itemId, locationId, delta, bin = {}, uomId = null) {
  const area_id        = bin.area_id        ? parseInt(bin.area_id)        : null;
  const rack_id        = bin.rack_id        ? parseInt(bin.rack_id)        : null;
  const bay_id         = bin.bay_id         ? parseInt(bin.bay_id)         : null;
  const compartment_id = bin.compartment_id ? parseInt(bin.compartment_id) : null;
  const uom            = uomId              ? parseInt(uomId)              : null;
  await client.query(
    `INSERT INTO inventory_stock
       (company_id, item_id, location_id, uom_id, quantity, area_id, rack_id, bay_id, compartment_id, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (item_id, location_id, (COALESCE(uom_id, 0)))
     DO UPDATE SET
       quantity       = inventory_stock.quantity + EXCLUDED.quantity,
       area_id        = COALESCE(EXCLUDED.area_id,        inventory_stock.area_id),
       rack_id        = COALESCE(EXCLUDED.rack_id,        inventory_stock.rack_id),
       bay_id         = COALESCE(EXCLUDED.bay_id,         inventory_stock.bay_id),
       compartment_id = COALESCE(EXCLUDED.compartment_id, inventory_stock.compartment_id),
       updated_at     = NOW()`,
    [companyId, itemId, locationId, uom, delta, area_id, rack_id, bay_id, compartment_id]
  );
}

// Fire low-stock push + inbox notification to admins when stock falls at/below reorder_point.
// Called after COMMIT so it never blocks the transaction.
async function maybeSendLowStockAlert(companyId, itemId) {
  try {
    const r = await pool.query(
      `SELECT i.name, i.reorder_point, COALESCE(SUM(s.quantity), 0) AS total_qty
       FROM inventory_items i
       LEFT JOIN inventory_stock s ON i.id = s.item_id AND s.company_id = i.company_id
       WHERE i.id = $1 AND i.company_id = $2 AND i.active = true
       GROUP BY i.id`,
      [itemId, companyId]
    );
    if (r.rowCount === 0) return;
    const { name, reorder_point, total_qty } = r.rows[0];
    const rp = parseFloat(reorder_point);
    const qty = parseFloat(total_qty);
    if (rp <= 0 || qty > rp) return; // not low
    const isOut = qty <= 0;
    const title = isOut ? `Out of stock: ${name}` : `Low stock: ${name}`;
    const body  = isOut
      ? `${name} is out of stock. Reorder point: ${rp}.`
      : `${name} has ${qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(2)} units remaining (reorder at ${rp}).`;
    // Push notification
    await sendPushToCompanyAdmins(companyId, { title, body, url: '/inventory#stock' });
    // In-app inbox — get all admin user IDs
    const admins = await pool.query(
      `SELECT id FROM users WHERE company_id=$1 AND role IN ('admin','super_admin') AND active=true`,
      [companyId]
    );
    if (admins.rowCount > 0) {
      await createInboxItemBatch(admins.rows.map(u => u.id), companyId, 'low_stock', title, body, '/inventory#stock');
    }
  } catch (err) {
    console.error('maybeSendLowStockAlert error:', err);
  }
}

// Process an array of photo values (existing https:// URLs or new base64 data: URIs).
// Uploads any base64 images to R2, tracks storage, returns array of https:// URLs.
async function processPhotos(photos, companyId) {
  if (!photos || photos.length === 0) return [];
  const base64Photos = photos.filter(p => typeof p === 'string' && p.startsWith('data:'));
  if (base64Photos.length > 0) {
    const estimatedBytes = base64Photos.reduce((sum, p) => {
      const b64 = p.split(',')[1] || '';
      return sum + Math.floor(b64.length * 3 / 4);
    }, 0);
    if (estimatedBytes > 0) {
      const { allowed } = await checkStorageLimit(companyId, estimatedBytes);
      if (!allowed) throw Object.assign(new Error('Storage limit reached'), { storageLimit: true });
    }
  }
  return Promise.all(
    photos.map(async p => {
      if (typeof p === 'string' && p.startsWith('data:')) {
        const { url, sizeBytes } = await uploadBase64(p, 'inventory');
        if (sizeBytes > 0) incrementStorage(companyId, sizeBytes).catch(() => {});
        return url;
      }
      return p;
    })
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
    if ('unit_spec' in req.body) { sets.push(`unit_spec=$${idx++}`); vals.push(req.body.unit_spec?.trim() || null); }
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

// ── Item UOMs ─────────────────────────────────────────────────────────────────

// GET /api/inventory/items/:id/uoms
router.get('/items/:id/uoms', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const item = await pool.query('SELECT id FROM inventory_items WHERE id=$1 AND company_id=$2', [req.params.id, companyId]);
    if (item.rowCount === 0) return res.status(404).json({ error: 'Item not found' });
    const result = await pool.query(
      `SELECT * FROM inventory_item_uoms WHERE item_id=$1 ORDER BY is_base DESC, factor`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/inventory/items/:id/uoms
router.post('/items/:id/uoms', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  const { unit, unit_spec, factor = 1, is_base = false } = req.body;
  if (!unit?.trim()) return res.status(400).json({ error: 'unit required' });
  const f = parseFloat(factor);
  if (isNaN(f) || f <= 0) return res.status(400).json({ error: 'factor must be a positive number' });
  try {
    const item = await pool.query('SELECT id FROM inventory_items WHERE id=$1 AND company_id=$2', [req.params.id, companyId]);
    if (item.rowCount === 0) return res.status(404).json({ error: 'Item not found' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (is_base) {
        await client.query('UPDATE inventory_item_uoms SET is_base=false WHERE item_id=$1', [req.params.id]);
      }
      const result = await client.query(
        `INSERT INTO inventory_item_uoms (company_id, item_id, unit, unit_spec, factor, is_base)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [companyId, req.params.id, unit.trim(), unit_spec?.trim() || null, f, !!is_base]
      );
      await client.query('COMMIT');
      // Return full list
      const all = await pool.query('SELECT * FROM inventory_item_uoms WHERE item_id=$1 ORDER BY is_base DESC, factor', [req.params.id]);
      res.status(201).json(all.rows);
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') return res.status(409).json({ error: 'A UOM with that unit and spec already exists for this item.' });
      throw err;
    } finally { client.release(); }
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /api/inventory/items/:id/uoms/:uomId
router.patch('/items/:id/uoms/:uomId', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  const { unit, unit_spec, factor, is_base, active } = req.body;
  try {
    const existing = await pool.query(
      'SELECT u.id FROM inventory_item_uoms u JOIN inventory_items i ON u.item_id=i.id WHERE u.id=$1 AND i.company_id=$2',
      [req.params.uomId, companyId]
    );
    if (existing.rowCount === 0) return res.status(404).json({ error: 'UOM not found' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (is_base) {
        await client.query('UPDATE inventory_item_uoms SET is_base=false WHERE item_id=$1', [req.params.id]);
      }
      const sets = [], vals = [req.params.uomId]; let idx = 2;
      if (unit     !== undefined) { sets.push(`unit=$${idx++}`);      vals.push(unit.trim()); }
      if ('unit_spec' in req.body) { sets.push(`unit_spec=$${idx++}`); vals.push(unit_spec?.trim() || null); }
      if (factor   !== undefined) { sets.push(`factor=$${idx++}`);    vals.push(parseFloat(factor)); }
      if (is_base  !== undefined) { sets.push(`is_base=$${idx++}`);   vals.push(!!is_base); }
      if (active   !== undefined) { sets.push(`active=$${idx++}`);    vals.push(!!active); }
      if (sets.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'No fields to update' }); }
      await client.query(`UPDATE inventory_item_uoms SET ${sets.join(',')} WHERE id=$1`, vals);
      await client.query('COMMIT');
      const all = await pool.query('SELECT * FROM inventory_item_uoms WHERE item_id=$1 ORDER BY is_base DESC, factor', [req.params.id]);
      res.json(all.rows);
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') return res.status(409).json({ error: 'A UOM with that unit and spec already exists for this item.' });
      throw err;
    } finally { client.release(); }
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/inventory/items/:id/uoms/:uomId  (soft delete if in use; hard delete otherwise)
router.delete('/items/:id/uoms/:uomId', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const existing = await pool.query(
      'SELECT u.id FROM inventory_item_uoms u JOIN inventory_items i ON u.item_id=i.id WHERE u.id=$1 AND i.company_id=$2',
      [req.params.uomId, companyId]
    );
    if (existing.rowCount === 0) return res.status(404).json({ error: 'UOM not found' });
    const inStock = await pool.query('SELECT 1 FROM inventory_stock WHERE uom_id=$1 LIMIT 1', [req.params.uomId]);
    const inTxns  = await pool.query('SELECT 1 FROM inventory_transactions WHERE uom_id=$1 OR to_uom_id=$1 LIMIT 1', [req.params.uomId]);
    if (inStock.rowCount > 0) {
      return res.status(409).json({ error: 'UOM is in use by existing stock. Transfer or adjust stock to zero first.' });
    }
    if (inTxns.rowCount > 0) {
      await pool.query('UPDATE inventory_item_uoms SET active=false WHERE id=$1', [req.params.uomId]);
    } else {
      await pool.query('DELETE FROM inventory_item_uoms WHERE id=$1', [req.params.uomId]);
    }
    const all = await pool.query('SELECT * FROM inventory_item_uoms WHERE item_id=$1 ORDER BY is_base DESC, factor', [req.params.id]);
    res.json(all.rows);
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
  const { name, type = 'warehouse', project_id, notes, address } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `INSERT INTO inventory_locations (company_id, name, type, project_id, notes, address)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [companyId, name.trim(), type, project_id || null, notes?.trim() || null, address?.trim() || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /api/inventory/locations/:id
router.patch('/locations/:id', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  const { name, type, project_id, notes, address, active, photo_urls } = req.body;
  try {
    const existing = await pool.query('SELECT id FROM inventory_locations WHERE id=$1 AND company_id=$2', [req.params.id, companyId]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Location not found' });
    const sets = [], vals = [req.params.id, companyId]; let idx = 3;
    if (name !== undefined) { sets.push(`name=$${idx++}`); vals.push(name.trim()); }
    if (type !== undefined) { sets.push(`type=$${idx++}`); vals.push(type); }
    if (project_id !== undefined) { sets.push(`project_id=$${idx++}`); vals.push(project_id || null); }
    if (notes !== undefined) { sets.push(`notes=$${idx++}`); vals.push(notes?.trim() || null); }
    if (address !== undefined) { sets.push(`address=$${idx++}`); vals.push(address?.trim() || null); }
    if (active !== undefined) { sets.push(`active=$${idx++}`); vals.push(!!active); }
    if (photo_urls !== undefined) {
      const processed = await processPhotos(photo_urls, companyId);
      sets.push(`photo_urls=$${idx++}`); vals.push(JSON.stringify(processed));
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    const result = await pool.query(
      `UPDATE inventory_locations SET ${sets.join(',')} WHERE id=$1 AND company_id=$2 RETURNING *`,
      vals
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.storageLimit) return res.status(413).json({ error: err.message, storage_limit: true });
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
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
      `SELECT s.id, s.item_id, i.name as item_name, i.sku, i.category,
              COALESCE(u.unit, i.unit)           as unit,
              COALESCE(u.unit_spec, i.unit_spec) as unit_spec,
              ${admin ? 'i.unit_cost,' : ''}
              i.reorder_point, s.location_id, l.name as location_name, l.type as location_type,
              s.uom_id, u.unit as uom_unit, u.unit_spec as uom_spec, u.factor as uom_factor, u.is_base as uom_is_base,
              s.area_id, ia.name as area_name,
              s.rack_id, ir.name as rack_name,
              s.bay_id,  ib.name as bay_name,
              s.compartment_id, ic.name as compartment_name,
              s.quantity, s.updated_at
       FROM inventory_stock s
       JOIN inventory_items i ON s.item_id = i.id
       JOIN inventory_locations l ON s.location_id = l.id
       LEFT JOIN inventory_item_uoms    u  ON s.uom_id        = u.id
       LEFT JOIN inventory_areas        ia ON s.area_id        = ia.id
       LEFT JOIN inventory_racks        ir ON s.rack_id        = ir.id
       LEFT JOIN inventory_bays         ib ON s.bay_id         = ib.id
       LEFT JOIN inventory_compartments ic ON s.compartment_id = ic.id
       WHERE ${conditions.join(' AND ')} AND i.active = true AND l.active = true
       ORDER BY l.name, ia.name, ir.name, ib.name, i.name`,
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
  const { type, item_id, quantity, from_location_id, to_location_id, project_id, notes, reference_no, unit_cost,
          area_id, rack_id, bay_id, compartment_id,
          uom_id, to_uom_id, to_quantity,
          supplier_id, lot_number } = req.body;
  const companyId = req.user.company_id;
  const admin = isAdmin(req);

  if (!type) return res.status(400).json({ error: 'type required' });
  if (!['receive','issue','transfer','adjust','convert'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
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
  if (type === 'convert') {
    if (!from_location_id) return res.status(400).json({ error: 'from_location_id required for convert' });
    if (!to_uom_id)        return res.status(400).json({ error: 'to_uom_id required for convert' });
    const toQty = parseFloat(to_quantity);
    if (isNaN(toQty) || toQty <= 0) return res.status(400).json({ error: 'to_quantity must be a positive number' });
  }

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

    // Validate UOM IDs belong to this item if provided
    const resolvedUomId   = uom_id   ? parseInt(uom_id)   : null;
    const resolvedToUomId = to_uom_id ? parseInt(to_uom_id) : null;
    if (resolvedUomId) {
      const u = await client.query('SELECT id FROM inventory_item_uoms WHERE id=$1 AND item_id=$2', [resolvedUomId, item_id]);
      if (u.rowCount === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'uom_id does not belong to this item' }); }
    }
    if (resolvedToUomId) {
      const u = await client.query('SELECT id FROM inventory_item_uoms WHERE id=$1 AND item_id=$2', [resolvedToUomId, item_id]);
      if (u.rowCount === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'to_uom_id does not belong to this item' }); }
    }

    const toQty = to_quantity ? parseFloat(to_quantity) : null;

    // Validate supplier belongs to company if provided
    const resolvedSupplierId = supplier_id ? parseInt(supplier_id) : null;
    if (resolvedSupplierId) {
      const sup = await client.query('SELECT id FROM inventory_suppliers WHERE id=$1 AND company_id=$2', [resolvedSupplierId, companyId]);
      if (sup.rowCount === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'supplier_id not found' }); }
    }

    // Insert transaction record
    const txn = await client.query(
      `INSERT INTO inventory_transactions
       (company_id, type, item_id, quantity, from_location_id, to_location_id, project_id, performed_by, notes, reference_no, unit_cost,
        uom_id, to_uom_id, to_quantity, supplier_id, lot_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [companyId, type, item_id, absQty,
       from_location_id || null, type === 'convert' ? null : (to_location_id || null),
       project_id || null, req.user.id, notes?.trim() || null, reference_no?.trim() || null, snapshotCost,
       resolvedUomId, resolvedToUomId, toQty, resolvedSupplierId, lot_number?.trim() || null]
    );

    // Update stock — bin FK IDs apply to the destination slot
    const bin = { area_id, rack_id, bay_id, compartment_id };
    if (type === 'receive')  await applyStockDelta(client, companyId, item_id, to_location_id, absQty, bin, resolvedUomId);
    if (type === 'issue')    await applyStockDelta(client, companyId, item_id, from_location_id, -absQty, {}, resolvedUomId);
    if (type === 'transfer') {
      await applyStockDelta(client, companyId, item_id, from_location_id, -absQty, {}, resolvedUomId);
      await applyStockDelta(client, companyId, item_id, to_location_id, absQty, bin, resolvedUomId);
    }
    if (type === 'adjust')   await applyStockDelta(client, companyId, item_id, to_location_id, qty, bin, resolvedUomId); // signed
    if (type === 'convert') {
      // Subtract from source UOM, add to target UOM — both at the same location
      await applyStockDelta(client, companyId, item_id, from_location_id, -absQty, {}, resolvedUomId);
      await applyStockDelta(client, companyId, item_id, from_location_id, toQty,   bin, resolvedToUomId);
    }

    await client.query('COMMIT');

    // Check if resulting stock is negative and include warning
    let warning = null;
    const stockCheck = await pool.query('SELECT quantity FROM inventory_stock WHERE item_id=$1 AND company_id=$2', [item_id, companyId]);
    const anyNegative = stockCheck.rows.some(r => parseFloat(r.quantity) < 0);
    if (anyNegative) warning = 'stock_negative';

    res.status(201).json({ ...txn.rows[0], warning });

    // Fire low-stock alert (async, after response sent)
    maybeSendLowStockAlert(companyId, item_id).catch(() => {});
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// GET /api/inventory/transactions
router.get('/transactions', requireAuth, async (req, res) => {
  const { item_id, location_id, type, project_id, from, to, supplier_id, lot_number, limit = 50, offset = 0 } = req.query;
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
    if (supplier_id) { conditions.push(`t.supplier_id = $${idx++}`); values.push(supplier_id); }
    if (lot_number) { conditions.push(`t.lot_number ILIKE $${idx++}`); values.push(`%${lot_number}%`); }
    const result = await pool.query(
      `SELECT t.*,
              i.name as item_name,
              COALESCE(fu.unit, i.unit) as unit,
              fu.unit || CASE WHEN fu.unit_spec IS NOT NULL THEN ' (' || fu.unit_spec || ')' ELSE '' END as uom_label,
              tu.unit || CASE WHEN tu.unit_spec IS NOT NULL THEN ' (' || tu.unit_spec || ')' ELSE '' END as to_uom_label,
              fl.name as from_location_name, tl.name as to_location_name,
              p.name as project_name, u.full_name as performed_by_name,
              sup.name as supplier_name
       FROM inventory_transactions t
       JOIN inventory_items i ON t.item_id = i.id
       LEFT JOIN inventory_item_uoms fu ON t.uom_id    = fu.id
       LEFT JOIN inventory_item_uoms tu ON t.to_uom_id = tu.id
       LEFT JOIN inventory_locations fl ON t.from_location_id = fl.id
       LEFT JOIN inventory_locations tl ON t.to_location_id = tl.id
       LEFT JOIN projects p ON t.project_id = p.id
       JOIN users u ON t.performed_by = u.id
       LEFT JOIN inventory_suppliers sup ON t.supplier_id = sup.id
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
  const { location_id, status, count_type } = req.query;
  const companyId = req.user.company_id;
  try {
    const conditions = ['cc.company_id = $1'];
    const values = [companyId]; let idx = 2;
    if (location_id) { conditions.push(`cc.location_id = $${idx++}`); values.push(location_id); }
    if (status) { conditions.push(`cc.status = $${idx++}`); values.push(status); }
    if (count_type) { conditions.push(`cc.count_type = $${idx++}`); values.push(count_type); }
    const result = await pool.query(
      `SELECT cc.*, COALESCE(l.name, 'All Locations') as location_name,
              u.full_name as started_by_name,
              cu.full_name as completed_by_name,
              (SELECT COUNT(*) FROM inventory_cycle_count_lines WHERE cycle_count_id = cc.id) as line_count,
              (SELECT COUNT(*) FROM inventory_cycle_count_lines WHERE cycle_count_id = cc.id AND counted_qty IS NOT NULL) as counted_count
       FROM inventory_cycle_counts cc
       LEFT JOIN inventory_locations l ON cc.location_id = l.id
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
  const { location_id, notes, count_type = 'cycle' } = req.body;
  const companyId = req.user.company_id;
  const VALID_TYPES = ['cycle', 'full', 'audit', 'reconcile'];
  if (!VALID_TYPES.includes(count_type)) return res.status(400).json({ error: 'Invalid count_type' });

  // Full counts don't need a location; all others do
  if (count_type !== 'full' && !location_id) return res.status(400).json({ error: 'location_id required' });

  try {
    if (count_type === 'full') {
      // Block if an active full count already exists
      const existing = await pool.query(
        `SELECT id FROM inventory_cycle_counts WHERE company_id=$1 AND count_type='full' AND status IN ('draft','in_progress')`,
        [companyId]
      );
      if (existing.rowCount > 0) return res.status(409).json({ error: 'An active full count already exists.' });
    } else {
      // Block if an active count already exists for this location
      const existing = await pool.query(
        `SELECT id FROM inventory_cycle_counts WHERE company_id=$1 AND location_id=$2 AND status IN ('draft','in_progress')`,
        [companyId, location_id]
      );
      if (existing.rowCount > 0) return res.status(409).json({ error: 'An active count already exists for this location.' });

      const loc = await pool.query('SELECT id FROM inventory_locations WHERE id=$1 AND company_id=$2', [location_id, companyId]);
      if (loc.rowCount === 0) return res.status(404).json({ error: 'Location not found' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cc = await client.query(
        `INSERT INTO inventory_cycle_counts (company_id, location_id, started_by, notes, count_type)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [companyId, location_id || null, req.user.id, notes?.trim() || null, count_type]
      );
      const countId = cc.rows[0].id;

      let stock;
      if (count_type === 'full') {
        // Snapshot all stock across all locations
        stock = await client.query(
          `SELECT s.item_id, s.location_id, s.quantity, s.uom_id FROM inventory_stock s
           JOIN inventory_items i ON s.item_id = i.id
           WHERE s.company_id = $1 AND i.active = true
           ORDER BY s.location_id, i.name`,
          [companyId]
        );
      } else {
        stock = await client.query(
          `SELECT s.item_id, NULL::integer as location_id, s.quantity, s.uom_id FROM inventory_stock s
           JOIN inventory_items i ON s.item_id = i.id
           WHERE s.location_id = $1 AND s.company_id = $2 AND i.active = true`,
          [location_id, companyId]
        );
      }

      if (stock.rows.length > 0) {
        const lineValues = stock.rows.map((r, i) => `($1, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4}, $${i * 4 + 5})`).join(', ');
        const lineParams = [countId];
        stock.rows.forEach(r => { lineParams.push(r.item_id); lineParams.push(r.location_id); lineParams.push(r.quantity); lineParams.push(r.uom_id || null); });
        await client.query(
          `INSERT INTO inventory_cycle_count_lines (cycle_count_id, item_id, location_id, expected_qty, stock_uom_id) VALUES ${lineValues}`,
          lineParams
        );
      }

      await client.query('COMMIT');

      // Return with lines
      const lines = await pool.query(
        `SELECT l.*, i.name as item_name, i.unit, i.sku, loc.name as location_name,
              su.unit as stock_uom_unit, su.unit_spec as stock_uom_spec, su.factor as stock_uom_factor,
              cu.unit as counted_uom_unit, cu.unit_spec as counted_uom_spec, cu.factor as counted_uom_factor
         FROM inventory_cycle_count_lines l
         JOIN inventory_items i ON l.item_id = i.id
         LEFT JOIN inventory_locations loc ON l.location_id = loc.id
         LEFT JOIN inventory_item_uoms su ON l.stock_uom_id = su.id
         LEFT JOIN inventory_item_uoms cu ON l.counted_uom_id = cu.id
         WHERE l.cycle_count_id = $1 ORDER BY loc.name NULLS FIRST, i.name`,
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
      `SELECT cc.*, COALESCE(l.name, 'All Locations') as location_name,
              u.full_name as started_by_name,
              cu.full_name as completed_by_name
       FROM inventory_cycle_counts cc
       LEFT JOIN inventory_locations l ON cc.location_id = l.id
       JOIN users u ON cc.started_by = u.id
       LEFT JOIN users cu ON cc.completed_by = cu.id
       WHERE cc.id = $1 AND cc.company_id = $2`,
      [req.params.id, companyId]
    );
    if (cc.rowCount === 0) return res.status(404).json({ error: 'Cycle count not found' });
    const lines = await pool.query(
      `SELECT l.*, i.name as item_name, i.unit, i.sku, u.full_name as counted_by_name,
              loc.name as location_name
       FROM inventory_cycle_count_lines l
       JOIN inventory_items i ON l.item_id = i.id
       LEFT JOIN users u ON l.counted_by = u.id
       LEFT JOIN inventory_locations loc ON l.location_id = loc.id
       WHERE l.cycle_count_id = $1 ORDER BY loc.name NULLS FIRST, i.name`,
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
  const { counted_qty, counted_uom_id, notes } = req.body;
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

      // Resolve UOM and calculate variance in stock UOM units
      const resolvedCountedUomId = counted_uom_id != null ? parseInt(counted_uom_id) : null;
      sets.push(`counted_uom_id=$${idx++}`); vals.push(resolvedCountedUomId);

      // Fetch line's expected_qty and UOM factors to compute variance
      const lineRow = await pool.query(
        `SELECT l.expected_qty, l.stock_uom_id,
                su.factor as stock_factor,
                cu.factor as counted_factor
         FROM inventory_cycle_count_lines l
         LEFT JOIN inventory_item_uoms su ON l.stock_uom_id = su.id
         LEFT JOIN inventory_item_uoms cu ON cu.id = $1
         WHERE l.id = $2`,
        [resolvedCountedUomId, req.params.lineId]
      );
      if (lineRow.rowCount > 0) {
        const { expected_qty, stock_factor, counted_factor } = lineRow.rows[0];
        const stockF   = parseFloat(stock_factor   || 1);
        const countedF = parseFloat(counted_factor || 1);
        // Convert counted qty to stock UOM: qty_in_stock_uom = qty * (counted_factor / stock_factor)
        const qtyInStockUom = qty * (countedF / stockF);
        const variance = qtyInStockUom - parseFloat(expected_qty);
        sets.push(`variance=$${idx++}`); vals.push(variance);
      }
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
      const isFullCount = cc.rows[0].count_type === 'full';
      for (const line of linesWithVariance) {
        const delta = parseFloat(line.variance); // in stock UOM units
        const locationId = isFullCount ? line.location_id : cc.rows[0].location_id;
        const stockUomId = line.stock_uom_id || null;
        const typeLabel = cc.rows[0].count_type === 'reconcile' ? 'Reconcile count adjustment'
          : cc.rows[0].count_type === 'audit' ? 'Audit count adjustment'
          : cc.rows[0].count_type === 'full' ? 'Full count adjustment'
          : 'Cycle count adjustment';
        await client.query(
          `INSERT INTO inventory_transactions
           (company_id, type, item_id, quantity, to_location_id, performed_by, notes, uom_id)
           VALUES ($1,'adjust',$2,$3,$4,$5,$6,$7)`,
          [companyId, line.item_id, Math.abs(delta), locationId, req.user.id, typeLabel, stockUomId]
        );
        await applyStockDelta(client, companyId, line.item_id, locationId, delta, {}, stockUomId);
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

// ── Setup: Storage Hierarchy (Areas → Racks → Bays → Compartments) ────────────
//
// Generic helpers reused for each level:
//   buildSetupRoutes(prefix, table, parentKey, parentTable)
// Each level supports:
//   GET    /setup/:level          — list (filter by parent + active)
//   POST   /setup/:level          — create
//   PATCH  /setup/:level/:id      — update name/notes/active/photos
//   DELETE /setup/:level/:id      — soft delete (requires no stock references)

function buildSetupRoutes(prefix, table, parentKey, parentTable) {
  // LIST
  router.get(`/setup/${prefix}`, requireAdmin, async (req, res) => {
    const companyId = req.user.company_id;
    const { active = 'true' } = req.query;
    const parentId = req.query[parentKey];
    try {
      const conds = [`e.company_id = $1`];
      const vals = [companyId]; let idx = 2;
      if (active !== 'all') { conds.push(`e.active = $${idx++}`); vals.push(active !== 'false'); }
      if (parentId) { conds.push(`e.${parentKey} = $${idx++}`); vals.push(parentId); }
      const result = await pool.query(
        `SELECT e.*, p.name as parent_name
         FROM ${table} e
         LEFT JOIN ${parentTable} p ON e.${parentKey} = p.id
         WHERE ${conds.join(' AND ')} ORDER BY e.name`,
        vals
      );
      res.json(result.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
  });

  // CREATE
  router.post(`/setup/${prefix}`, requireAdmin, async (req, res) => {
    const companyId = req.user.company_id;
    const { name, notes, photo_urls } = req.body;
    const parentId = req.body[parentKey];
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    if (!parentId) return res.status(400).json({ error: `${parentKey} required` });
    try {
      const parentCheck = await pool.query(
        `SELECT id FROM ${parentTable} WHERE id=$1 AND company_id=$2`,
        [parentId, companyId]
      );
      if (parentCheck.rowCount === 0) return res.status(404).json({ error: 'Parent not found' });
      const photos = await processPhotos(photo_urls || [], companyId);
      const result = await pool.query(
        `INSERT INTO ${table} (company_id, ${parentKey}, name, notes, photo_urls)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [companyId, parentId, name.trim(), notes?.trim() || null, JSON.stringify(photos)]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.storageLimit) return res.status(413).json({ error: err.message, storage_limit: true });
      console.error(err); res.status(500).json({ error: 'Server error' });
    }
  });

  // UPDATE
  router.patch(`/setup/${prefix}/:id`, requireAdmin, async (req, res) => {
    const companyId = req.user.company_id;
    const { name, notes, active, photo_urls } = req.body;
    try {
      const existing = await pool.query(
        `SELECT id FROM ${table} WHERE id=$1 AND company_id=$2`,
        [req.params.id, companyId]
      );
      if (existing.rowCount === 0) return res.status(404).json({ error: 'Not found' });
      const sets = [], vals = [req.params.id, companyId]; let idx = 3;
      if (name !== undefined) { sets.push(`name=$${idx++}`); vals.push(name.trim()); }
      if (notes !== undefined) { sets.push(`notes=$${idx++}`); vals.push(notes?.trim() || null); }
      if (active !== undefined) { sets.push(`active=$${idx++}`); vals.push(!!active); }
      if (photo_urls !== undefined) {
        const processed = await processPhotos(photo_urls, companyId);
        sets.push(`photo_urls=$${idx++}`); vals.push(JSON.stringify(processed));
      }
      if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
      const result = await pool.query(
        `UPDATE ${table} SET ${sets.join(',')} WHERE id=$1 AND company_id=$2 RETURNING *`,
        vals
      );
      res.json(result.rows[0]);
    } catch (err) {
      if (err.storageLimit) return res.status(413).json({ error: err.message, storage_limit: true });
      console.error(err); res.status(500).json({ error: 'Server error' });
    }
  });

  // SOFT DELETE
  router.delete(`/setup/${prefix}/:id`, requireAdmin, async (req, res) => {
    const companyId = req.user.company_id;
    try {
      const result = await pool.query(
        `UPDATE ${table} SET active=false WHERE id=$1 AND company_id=$2 RETURNING id`,
        [req.params.id, companyId]
      );
      if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
  });
}

buildSetupRoutes('areas',        'inventory_areas',        'location_id', 'inventory_locations');
buildSetupRoutes('racks',        'inventory_racks',        'area_id',     'inventory_areas');
buildSetupRoutes('bays',         'inventory_bays',         'rack_id',     'inventory_racks');
buildSetupRoutes('compartments', 'inventory_compartments', 'bay_id',      'inventory_bays');

// ── Suppliers ─────────────────────────────────────────────────────────────────

// GET /api/inventory/suppliers
router.get('/suppliers', requireAdmin, async (req, res) => {
  const { active = 'true' } = req.query;
  const companyId = req.user.company_id;
  try {
    const conditions = ['company_id = $1'];
    const values = [companyId]; let idx = 2;
    if (active !== 'all') { conditions.push(`active = $${idx++}`); values.push(active !== 'false'); }
    const result = await pool.query(
      `SELECT * FROM inventory_suppliers WHERE ${conditions.join(' AND ')} ORDER BY name`,
      values
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/inventory/suppliers
router.post('/suppliers', requireAdmin, async (req, res) => {
  const { name, contact_name, phone, email, website, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `INSERT INTO inventory_suppliers (company_id, name, contact_name, phone, email, website, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [companyId, name.trim(), contact_name?.trim() || null, phone?.trim() || null,
       email?.trim() || null, website?.trim() || null, notes?.trim() || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /api/inventory/suppliers/:id
router.patch('/suppliers/:id', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  const { name, contact_name, phone, email, website, notes, active } = req.body;
  try {
    const existing = await pool.query('SELECT id FROM inventory_suppliers WHERE id=$1 AND company_id=$2', [req.params.id, companyId]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Supplier not found' });
    const sets = [], vals = [req.params.id, companyId]; let idx = 3;
    if (name !== undefined)         { sets.push(`name=$${idx++}`);         vals.push(name.trim()); }
    if (contact_name !== undefined) { sets.push(`contact_name=$${idx++}`); vals.push(contact_name?.trim() || null); }
    if (phone !== undefined)        { sets.push(`phone=$${idx++}`);        vals.push(phone?.trim() || null); }
    if (email !== undefined)        { sets.push(`email=$${idx++}`);        vals.push(email?.trim() || null); }
    if (website !== undefined)      { sets.push(`website=$${idx++}`);      vals.push(website?.trim() || null); }
    if (notes !== undefined)        { sets.push(`notes=$${idx++}`);        vals.push(notes?.trim() || null); }
    if (active !== undefined)       { sets.push(`active=$${idx++}`);       vals.push(!!active); }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    const result = await pool.query(
      `UPDATE inventory_suppliers SET ${sets.join(',')} WHERE id=$1 AND company_id=$2 RETURNING *`,
      vals
    );
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/inventory/suppliers/:id  (soft delete)
router.delete('/suppliers/:id', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      'UPDATE inventory_suppliers SET active=false WHERE id=$1 AND company_id=$2 RETURNING id',
      [req.params.id, companyId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Supplier not found' });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── Purchase Orders ───────────────────────────────────────────────────────────

// Generate next PO number for a company: PO-YYYY-NNNN
async function nextPONumber(client, companyId) {
  const year = new Date().getFullYear();
  const res = await client.query(
    `SELECT COUNT(*) FROM purchase_orders WHERE company_id=$1 AND po_number LIKE $2`,
    [companyId, `PO-${year}-%`]
  );
  const seq = parseInt(res.rows[0].count) + 1;
  return `PO-${year}-${String(seq).padStart(4, '0')}`;
}

// GET /api/inventory/purchase-orders
router.get('/purchase-orders', requireAdmin, async (req, res) => {
  const { status, supplier_id } = req.query;
  const companyId = req.user.company_id;
  try {
    const conditions = ['po.company_id = $1'];
    const values = [companyId]; let idx = 2;
    if (status) { conditions.push(`po.status = $${idx++}`); values.push(status); }
    if (supplier_id) { conditions.push(`po.supplier_id = $${idx++}`); values.push(supplier_id); }
    const result = await pool.query(
      `SELECT po.*,
              sup.name AS supplier_name,
              loc.name AS to_location_name,
              u.full_name AS created_by_name,
              (SELECT COUNT(*)        FROM purchase_order_lines WHERE po_id = po.id) AS line_count,
              (SELECT COALESCE(SUM(qty_ordered),  0) FROM purchase_order_lines WHERE po_id = po.id) AS total_ordered,
              (SELECT COALESCE(SUM(qty_received), 0) FROM purchase_order_lines WHERE po_id = po.id) AS total_received
       FROM purchase_orders po
       LEFT JOIN inventory_suppliers  sup ON po.supplier_id    = sup.id
       LEFT JOIN inventory_locations  loc ON po.to_location_id = loc.id
       JOIN  users u ON po.created_by = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY po.created_at DESC`,
      values
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/inventory/purchase-orders
router.post('/purchase-orders', requireAdmin, async (req, res) => {
  const { supplier_id, order_date, expected_date, to_location_id, notes, reference_no, lines = [] } = req.body;
  const companyId = req.user.company_id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const poNumber = await nextPONumber(client, companyId);
    const poResult = await client.query(
      `INSERT INTO purchase_orders
         (company_id, po_number, supplier_id, order_date, expected_date, to_location_id, notes, reference_no, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [companyId, poNumber, supplier_id || null,
       order_date || new Date().toISOString().slice(0,10),
       expected_date || null, to_location_id || null,
       notes?.trim() || null, reference_no?.trim() || null, req.user.id]
    );
    const po = poResult.rows[0];
    for (const line of lines) {
      if (!line.item_id || !line.qty_ordered || parseFloat(line.qty_ordered) <= 0) continue;
      await client.query(
        `INSERT INTO purchase_order_lines (po_id, item_id, qty_ordered, unit_cost, uom_id, notes)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [po.id, parseInt(line.item_id), parseFloat(line.qty_ordered),
         line.unit_cost != null ? parseFloat(line.unit_cost) : null,
         line.uom_id ? parseInt(line.uom_id) : null, line.notes?.trim() || null]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(po);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// GET /api/inventory/purchase-orders/:id  (with lines)
router.get('/purchase-orders/:id', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const poResult = await pool.query(
      `SELECT po.*,
              sup.name AS supplier_name,
              loc.name AS to_location_name,
              u.full_name AS created_by_name
       FROM purchase_orders po
       LEFT JOIN inventory_suppliers sup ON po.supplier_id    = sup.id
       LEFT JOIN inventory_locations loc ON po.to_location_id = loc.id
       JOIN users u ON po.created_by = u.id
       WHERE po.id=$1 AND po.company_id=$2`,
      [req.params.id, companyId]
    );
    if (poResult.rowCount === 0) return res.status(404).json({ error: 'PO not found' });
    const linesResult = await pool.query(
      `SELECT pol.*, i.name AS item_name, i.sku, i.unit,
              u.unit AS uom_unit, u.unit_spec AS uom_spec
       FROM purchase_order_lines pol
       JOIN inventory_items i ON pol.item_id = i.id
       LEFT JOIN inventory_item_uoms u ON pol.uom_id = u.id
       WHERE pol.po_id = $1 ORDER BY pol.id`,
      [req.params.id]
    );
    res.json({ ...poResult.rows[0], lines: linesResult.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /api/inventory/purchase-orders/:id
router.patch('/purchase-orders/:id', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  const { supplier_id, order_date, expected_date, to_location_id, notes, reference_no, status } = req.body;
  try {
    const existing = await pool.query(
      'SELECT id, status FROM purchase_orders WHERE id=$1 AND company_id=$2',
      [req.params.id, companyId]
    );
    if (existing.rowCount === 0) return res.status(404).json({ error: 'PO not found' });
    const cur = existing.rows[0];
    if (['received', 'cancelled'].includes(cur.status) && status === undefined) {
      return res.status(400).json({ error: `Cannot edit a ${cur.status} PO` });
    }
    const sets = [], vals = [req.params.id, companyId]; let idx = 3;
    if (supplier_id  !== undefined) { sets.push(`supplier_id=$${idx++}`);    vals.push(supplier_id  || null); }
    if (order_date   !== undefined) { sets.push(`order_date=$${idx++}`);     vals.push(order_date); }
    if (expected_date!== undefined) { sets.push(`expected_date=$${idx++}`);  vals.push(expected_date || null); }
    if (to_location_id!==undefined) { sets.push(`to_location_id=$${idx++}`); vals.push(to_location_id || null); }
    if (notes        !== undefined) { sets.push(`notes=$${idx++}`);          vals.push(notes?.trim() || null); }
    if (reference_no !== undefined) { sets.push(`reference_no=$${idx++}`);   vals.push(reference_no?.trim() || null); }
    if (status       !== undefined) {
      const VALID = ['draft','submitted','partial','received','cancelled'];
      if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid status' });
      sets.push(`status=$${idx++}`); vals.push(status);
      if (status === 'submitted')  { sets.push(`submitted_at=NOW()`); }
      if (status === 'received')   { sets.push(`received_at=NOW()`); }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    const result = await pool.query(
      `UPDATE purchase_orders SET ${sets.join(',')} WHERE id=$1 AND company_id=$2 RETURNING *`,
      vals
    );
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/inventory/purchase-orders/:id  (hard-delete drafts; cancel others)
router.delete('/purchase-orders/:id', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const existing = await pool.query(
      'SELECT id, status FROM purchase_orders WHERE id=$1 AND company_id=$2',
      [req.params.id, companyId]
    );
    if (existing.rowCount === 0) return res.status(404).json({ error: 'PO not found' });
    const { status } = existing.rows[0];
    if (status === 'received') return res.status(409).json({ error: 'Cannot delete a received PO' });
    if (status === 'draft') {
      await pool.query('DELETE FROM purchase_orders WHERE id=$1', [req.params.id]);
    } else {
      await pool.query(
        'UPDATE purchase_orders SET status=$1, received_at=NULL WHERE id=$2',
        ['cancelled', req.params.id]
      );
    }
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/inventory/purchase-orders/:id/lines
router.post('/purchase-orders/:id/lines', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  const { item_id, qty_ordered, unit_cost, uom_id, notes } = req.body;
  if (!item_id || !qty_ordered || parseFloat(qty_ordered) <= 0) {
    return res.status(400).json({ error: 'item_id and positive qty_ordered required' });
  }
  try {
    const po = await pool.query(
      'SELECT id, status FROM purchase_orders WHERE id=$1 AND company_id=$2',
      [req.params.id, companyId]
    );
    if (po.rowCount === 0) return res.status(404).json({ error: 'PO not found' });
    if (po.rows[0].status !== 'draft') return res.status(409).json({ error: 'Can only add lines to a draft PO' });
    const item = await pool.query('SELECT id FROM inventory_items WHERE id=$1 AND company_id=$2', [item_id, companyId]);
    if (item.rowCount === 0) return res.status(404).json({ error: 'Item not found' });
    await pool.query(
      `INSERT INTO purchase_order_lines (po_id, item_id, qty_ordered, unit_cost, uom_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.params.id, parseInt(item_id), parseFloat(qty_ordered),
       unit_cost != null ? parseFloat(unit_cost) : null,
       uom_id ? parseInt(uom_id) : null, notes?.trim() || null]
    );
    const lines = await pool.query(
      `SELECT pol.*, i.name AS item_name, i.sku, i.unit
       FROM purchase_order_lines pol JOIN inventory_items i ON pol.item_id = i.id
       WHERE pol.po_id=$1 ORDER BY pol.id`,
      [req.params.id]
    );
    res.status(201).json(lines.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /api/inventory/purchase-orders/:id/lines/:lineId
router.patch('/purchase-orders/:id/lines/:lineId', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  const { qty_ordered, unit_cost, uom_id, notes } = req.body;
  try {
    const po = await pool.query(
      'SELECT id, status FROM purchase_orders WHERE id=$1 AND company_id=$2',
      [req.params.id, companyId]
    );
    if (po.rowCount === 0) return res.status(404).json({ error: 'PO not found' });
    if (po.rows[0].status !== 'draft') return res.status(409).json({ error: 'Can only edit lines on a draft PO' });
    const sets = [], vals = [req.params.lineId]; let idx = 2;
    if (qty_ordered !== undefined) { sets.push(`qty_ordered=$${idx++}`); vals.push(parseFloat(qty_ordered)); }
    if (unit_cost   !== undefined) { sets.push(`unit_cost=$${idx++}`);   vals.push(unit_cost != null ? parseFloat(unit_cost) : null); }
    if (uom_id      !== undefined) { sets.push(`uom_id=$${idx++}`);      vals.push(uom_id ? parseInt(uom_id) : null); }
    if (notes       !== undefined) { sets.push(`notes=$${idx++}`);       vals.push(notes?.trim() || null); }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    await pool.query(`UPDATE purchase_order_lines SET ${sets.join(',')} WHERE id=$1`, vals);
    const lines = await pool.query(
      `SELECT pol.*, i.name AS item_name, i.sku, i.unit
       FROM purchase_order_lines pol JOIN inventory_items i ON pol.item_id = i.id
       WHERE pol.po_id=$1 ORDER BY pol.id`,
      [req.params.id]
    );
    res.json(lines.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/inventory/purchase-orders/:id/lines/:lineId
router.delete('/purchase-orders/:id/lines/:lineId', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const po = await pool.query(
      'SELECT id, status FROM purchase_orders WHERE id=$1 AND company_id=$2',
      [req.params.id, companyId]
    );
    if (po.rowCount === 0) return res.status(404).json({ error: 'PO not found' });
    if (po.rows[0].status !== 'draft') return res.status(409).json({ error: 'Can only remove lines from a draft PO' });
    await pool.query('DELETE FROM purchase_order_lines WHERE id=$1 AND po_id=$2', [req.params.lineId, req.params.id]);
    const lines = await pool.query(
      `SELECT pol.*, i.name AS item_name, i.sku, i.unit
       FROM purchase_order_lines pol JOIN inventory_items i ON pol.item_id = i.id
       WHERE pol.po_id=$1 ORDER BY pol.id`,
      [req.params.id]
    );
    res.json(lines.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/inventory/purchase-orders/:id/receive
router.post('/purchase-orders/:id/receive', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  const { location_id, lines } = req.body; // lines: [{ line_id, qty_to_receive }]
  if (!location_id) return res.status(400).json({ error: 'location_id required' });
  if (!Array.isArray(lines) || lines.length === 0) return res.status(400).json({ error: 'lines required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const po = await client.query(
      'SELECT id, status, company_id FROM purchase_orders WHERE id=$1 AND company_id=$2',
      [req.params.id, companyId]
    );
    if (po.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'PO not found' }); }
    if (!['submitted','partial'].includes(po.rows[0].status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Can only receive against a submitted or partial PO' });
    }
    const loc = await client.query('SELECT id FROM inventory_locations WHERE id=$1 AND company_id=$2', [location_id, companyId]);
    if (loc.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Location not found' }); }

    const receivedItemIds = new Set();
    for (const entry of lines) {
      const qty = parseFloat(entry.qty_to_receive);
      if (!entry.line_id || isNaN(qty) || qty <= 0) continue;
      const lineResult = await client.query(
        `SELECT pol.*, ii.unit_cost AS catalog_cost
         FROM purchase_order_lines pol
         JOIN inventory_items ii ON pol.item_id = ii.id
         WHERE pol.id=$1 AND pol.po_id=$2`,
        [entry.line_id, req.params.id]
      );
      if (lineResult.rowCount === 0) continue;
      const line = lineResult.rows[0];
      const remaining = parseFloat(line.qty_ordered) - parseFloat(line.qty_received);
      const actualQty = Math.min(qty, remaining);
      if (actualQty <= 0) continue;
      const unitCost = line.unit_cost != null ? parseFloat(line.unit_cost) : (line.catalog_cost != null ? parseFloat(line.catalog_cost) : null);
      // Create receive transaction
      await client.query(
        `INSERT INTO inventory_transactions
           (company_id, type, item_id, quantity, to_location_id, performed_by, unit_cost, uom_id, supplier_id)
         VALUES ($1,'receive',$2,$3,$4,$5,$6,$7,
           (SELECT supplier_id FROM purchase_orders WHERE id=$8))`,
        [companyId, line.item_id, actualQty, location_id, req.user.id,
         unitCost, line.uom_id || null, req.params.id]
      );
      // Update stock
      await applyStockDelta(client, companyId, line.item_id, location_id, actualQty, {}, line.uom_id || null);
      // Update line qty_received
      await client.query(
        'UPDATE purchase_order_lines SET qty_received = qty_received + $1 WHERE id=$2',
        [actualQty, entry.line_id]
      );
      receivedItemIds.add(line.item_id);
    }

    // Update PO status based on received amounts
    const totals = await client.query(
      `SELECT COALESCE(SUM(qty_ordered),0) AS ordered, COALESCE(SUM(qty_received),0) AS received
       FROM purchase_order_lines WHERE po_id=$1`,
      [req.params.id]
    );
    const { ordered, received } = totals.rows[0];
    let newStatus = 'partial';
    if (parseFloat(received) >= parseFloat(ordered)) newStatus = 'received';
    await client.query(
      `UPDATE purchase_orders SET status=$1${newStatus === 'received' ? ', received_at=NOW()' : ''} WHERE id=$2`,
      [newStatus, req.params.id]
    );

    await client.query('COMMIT');
    // Return updated PO with lines
    const updated = await pool.query(
      `SELECT po.*, sup.name AS supplier_name, loc.name AS to_location_name
       FROM purchase_orders po
       LEFT JOIN inventory_suppliers sup ON po.supplier_id = sup.id
       LEFT JOIN inventory_locations loc ON po.to_location_id = loc.id
       WHERE po.id=$1`,
      [req.params.id]
    );
    const updatedLines = await pool.query(
      `SELECT pol.*, i.name AS item_name, i.sku, i.unit
       FROM purchase_order_lines pol JOIN inventory_items i ON pol.item_id = i.id
       WHERE pol.po_id=$1 ORDER BY pol.id`,
      [req.params.id]
    );
    res.json({ ...updated.rows[0], lines: updatedLines.rows });

    // Fire low-stock alerts for all received items (stock may have dipped below reorder point before this receipt)
    for (const itemId of receivedItemIds) {
      maybeSendLowStockAlert(companyId, itemId).catch(() => {});
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// ── Purchase Order Email ───────────────────────────────────────────────────────

// POST /api/inventory/purchase-orders/:id/email
router.post('/purchase-orders/:id/email', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    // Load PO + lines + supplier + company
    const poResult = await pool.query(
      `SELECT po.*,
              sup.name AS supplier_name, sup.email AS supplier_email,
              sup.contact_name AS supplier_contact,
              loc.name AS to_location_name,
              u.full_name AS created_by_name,
              co.name AS company_name, co.address AS company_address,
              co.phone AS company_phone, co.contact_email AS company_email
       FROM purchase_orders po
       LEFT JOIN inventory_suppliers sup ON po.supplier_id = sup.id
       LEFT JOIN inventory_locations loc ON po.to_location_id = loc.id
       JOIN users u ON po.created_by = u.id
       JOIN companies co ON po.company_id = co.id
       WHERE po.id = $1 AND po.company_id = $2`,
      [req.params.id, companyId]
    );
    if (poResult.rowCount === 0) return res.status(404).json({ error: 'PO not found' });
    const po = poResult.rows[0];

    if (!po.supplier_email) {
      return res.status(400).json({ error: 'Supplier has no email address on file. Add one in Setup → Suppliers.' });
    }

    const linesResult = await pool.query(
      `SELECT pol.*, i.name AS item_name, i.sku, i.unit
       FROM purchase_order_lines pol
       JOIN inventory_items i ON pol.item_id = i.id
       WHERE pol.po_id = $1 ORDER BY pol.id`,
      [req.params.id]
    );
    const lines = linesResult.rows;
    if (lines.length === 0) return res.status(400).json({ error: 'Cannot email a PO with no line items.' });

    const fmt = n => n != null ? parseFloat(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '—';
    const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    const lineTotal = lines.reduce((s, l) => s + (l.unit_cost != null ? parseFloat(l.unit_cost) * parseFloat(l.qty_ordered) : 0), 0);
    const hasAnyPricing = lines.some(l => l.unit_cost != null);

    const tableRows = lines.map(l => {
      const qty = parseFloat(l.qty_ordered);
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-weight:600">${l.item_name}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-family:monospace;font-size:12px;color:#6b7280">${l.sku || '—'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;text-align:right">${qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(2)} ${l.unit}</td>
        ${hasAnyPricing ? `<td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;text-align:right">${l.unit_cost != null ? fmt(l.unit_cost) : '—'}</td>` : ''}
        ${hasAnyPricing ? `<td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:700">${l.unit_cost != null ? fmt(parseFloat(l.unit_cost) * qty) : '—'}</td>` : ''}
        ${l.notes ? `<td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280">${l.notes}</td>` : '<td style="padding:8px 10px;border-bottom:1px solid #f3f4f6"></td>'}
      </tr>`;
    }).join('');

    const { sendEmail } = require('../email');
    await sendEmail(
      po.supplier_email,
      `Purchase Order ${po.po_number} from ${po.company_name}`,
      `<div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;padding:24px">
        <div style="border-bottom:3px solid #92400e;padding-bottom:12px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:8px">
          <div>
            <h2 style="color:#92400e;margin:0;font-size:22px">Purchase Order</h2>
            <p style="color:#6b7280;margin:4px 0 0;font-size:13px">${po.po_number}</p>
          </div>
          <div style="text-align:right;font-size:13px;color:#374151">
            <strong>${po.company_name}</strong><br>
            ${po.company_address ? po.company_address + '<br>' : ''}
            ${po.company_phone ? po.company_phone + '<br>' : ''}
            ${po.company_email ? `<a href="mailto:${po.company_email}" style="color:#92400e">${po.company_email}</a>` : ''}
          </div>
        </div>

        <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:20px;font-size:13px">
          <div><span style="color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;display:block">To</span><strong>${po.supplier_name}</strong>${po.supplier_contact ? '<br>' + po.supplier_contact : ''}</div>
          <div><span style="color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;display:block">Order Date</span>${fmtDate(po.order_date)}</div>
          ${po.expected_date ? `<div><span style="color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;display:block">Expected By</span>${fmtDate(po.expected_date)}</div>` : ''}
          ${po.to_location_name ? `<div><span style="color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;display:block">Ship To</span>${po.to_location_name}</div>` : ''}
          ${po.reference_no ? `<div><span style="color:#6b7280;font-size:11px;font-weight:700;text-transform:uppercase;display:block">Your Ref #</span>${po.reference_no}</div>` : ''}
        </div>

        <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px">
          <thead>
            <tr style="background:#f9fafb">
              <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb">Item</th>
              <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb">SKU</th>
              <th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb">Qty</th>
              ${hasAnyPricing ? '<th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb">Unit Price</th>' : ''}
              ${hasAnyPricing ? '<th style="padding:8px 10px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb">Total</th>' : ''}
              <th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb">Notes</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
          ${hasAnyPricing ? `<tfoot><tr style="background:#f0fdf4;border-top:2px solid #d1fae5">
            <td colspan="${3 + (lines[0]?.notes ? 1 : 0)}" style="padding:10px;font-weight:700">Order Total</td>
            <td colspan="2" style="padding:10px;text-align:right;font-weight:800;font-size:16px">${fmt(lineTotal)}</td>
          </tr></tfoot>` : ''}
        </table>

        ${po.notes ? `<div style="margin-top:16px;background:#f9fafb;border-radius:8px;padding:12px 16px;font-size:13px"><strong style="font-size:11px;text-transform:uppercase;color:#6b7280">Notes</strong><p style="margin:6px 0 0">${po.notes}</p></div>` : ''}

        <p style="margin-top:24px;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:16px">
          Please confirm receipt of this purchase order by replying to this email.
          This order was generated by ${po.company_name} via OpsFloa.
        </p>
      </div>`
    );

    res.json({ ok: true, sent_to: po.supplier_email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Valuation ─────────────────────────────────────────────────────────────────

// GET /api/inventory/valuation
router.get('/valuation', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  const { location_id } = req.query;
  try {
    const conditions = ['i.company_id = $1', 'i.active = true'];
    const values = [companyId]; let idx = 2;
    if (location_id) { conditions.push(`s.location_id = $${idx++}`); values.push(location_id); }
    const result = await pool.query(
      `SELECT i.id, i.name, i.sku, i.category, i.unit, i.unit_cost,
              COALESCE(SUM(s.quantity), 0) AS total_qty,
              COALESCE(SUM(s.quantity), 0) * COALESCE(i.unit_cost, 0) AS total_value,
              json_agg(
                json_build_object(
                  'location_id', l.id,
                  'location_name', l.name,
                  'quantity', s.quantity
                ) ORDER BY l.name
              ) FILTER (WHERE l.id IS NOT NULL) AS locations
       FROM inventory_items i
       LEFT JOIN inventory_stock s ON i.id = s.item_id AND s.company_id = i.company_id
       LEFT JOIN inventory_locations l ON s.location_id = l.id AND l.active = true
       WHERE ${conditions.join(' AND ')}
       GROUP BY i.id
       ORDER BY i.name`,
      values
    );
    const grandTotal = result.rows.reduce((sum, r) => sum + parseFloat(r.total_value || 0), 0);
    res.json({ items: result.rows, grand_total: grandTotal });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
