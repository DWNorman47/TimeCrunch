const router = require('express').Router();
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// GET /equipment — list all active equipment items with total hours
router.get('/', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `SELECT e.*,
              COALESCE(SUM(h.hours), 0)::DECIMAL(10,2) AS total_hours,
              COUNT(h.id) AS log_count,
              MAX(h.log_date) AS last_logged
       FROM equipment_items e
       LEFT JOIN equipment_hours h ON h.equipment_id = e.id
       WHERE e.company_id = $1 AND e.active = true
       GROUP BY e.id
       ORDER BY e.name ASC`,
      [companyId]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /equipment — create equipment item (admin)
router.post('/', requireAdmin, async (req, res) => {
  const { name, type, unit_number, maintenance_interval_hours, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `INSERT INTO equipment_items (company_id, name, type, unit_number, maintenance_interval_hours, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [companyId, name.trim(), type || null, unit_number || null,
       maintenance_interval_hours ? parseInt(maintenance_interval_hours) : null, notes || null]
    );
    res.status(201).json({ ...result.rows[0], total_hours: 0, log_count: 0, last_logged: null });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /equipment/:id — update item (admin)
router.patch('/:id', requireAdmin, async (req, res) => {
  const { name, type, unit_number, maintenance_interval_hours, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `UPDATE equipment_items SET name=$1, type=$2, unit_number=$3, maintenance_interval_hours=$4, notes=$5
       WHERE id=$6 AND company_id=$7 RETURNING *`,
      [name.trim(), type || null, unit_number || null,
       maintenance_interval_hours ? parseInt(maintenance_interval_hours) : null,
       notes || null, req.params.id, companyId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Equipment not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /equipment/:id — soft-delete (admin)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE equipment_items SET active = false WHERE id = $1 AND company_id = $2 RETURNING id',
      [req.params.id, req.user.company_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Equipment not found' });
    res.json({ deleted: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /equipment/:id/hours — hours log for one item
router.get('/:id/hours', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  const { from, to, limit = 50 } = req.query;
  const conditions = ['h.company_id = $1', 'h.equipment_id = $2'];
  const params = [companyId, req.params.id];
  if (from) { params.push(from); conditions.push(`h.log_date >= $${params.length}`); }
  if (to) { params.push(to); conditions.push(`h.log_date <= $${params.length}`); }
  try {
    const result = await pool.query(
      `SELECT h.*, p.name AS project_name, u.full_name AS logged_by_name
       FROM equipment_hours h
       LEFT JOIN projects p ON h.project_id = p.id
       LEFT JOIN users u ON h.created_by = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY h.log_date DESC, h.created_at DESC
       LIMIT $${params.length + 1}`,
      [...params, parseInt(limit)]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /equipment/:id/hours — log hours for an item
router.post('/:id/hours', requireAuth, async (req, res) => {
  const { log_date, hours, project_id, operator_name, notes } = req.body;
  if (!log_date || !hours) return res.status(400).json({ error: 'log_date and hours are required' });
  const companyId = req.user.company_id;
  // Verify item belongs to this company
  try {
    const item = await pool.query(
      'SELECT id FROM equipment_items WHERE id = $1 AND company_id = $2 AND active = true',
      [req.params.id, companyId]
    );
    if (item.rowCount === 0) return res.status(404).json({ error: 'Equipment not found' });

    const full = await pool.query(
      `WITH inserted AS (
         INSERT INTO equipment_hours (equipment_id, company_id, project_id, log_date, hours, operator_name, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
       )
       SELECT h.*, p.name AS project_name, u.full_name AS logged_by_name
       FROM inserted h
       LEFT JOIN projects p ON h.project_id = p.id
       LEFT JOIN users u ON h.created_by = u.id`,
      [req.params.id, companyId, project_id || null, log_date, parseFloat(hours),
       operator_name || null, notes || null, req.user.id]
    );
    res.status(201).json(full.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /equipment/hours/:entryId — delete a single hours entry
router.delete('/hours/:entryId', requireAuth, async (req, res) => {
  const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
  try {
    const cond = isAdmin ? 'company_id = $2' : 'company_id = $2 AND created_by = $3';
    const params = isAdmin ? [req.params.entryId, req.user.company_id] : [req.params.entryId, req.user.company_id, req.user.id];
    const result = await pool.query(`DELETE FROM equipment_hours WHERE id = $1 AND ${cond} RETURNING id`, params);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    res.json({ deleted: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
