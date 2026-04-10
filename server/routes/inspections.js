const router = require('express').Router();
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ── Templates ─────────────────────────────────────────────────────────────────

// GET /inspections/templates
router.get('/templates', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM inspection_templates WHERE company_id = $1 ORDER BY created_at DESC',
      [req.user.company_id]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /inspections/templates
router.post('/templates', requireAdmin, async (req, res) => {
  const { name, description, items } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const result = await pool.query(
      `INSERT INTO inspection_templates (company_id, name, description, items, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.company_id, name.trim(), description || null, JSON.stringify(items || []), req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /inspections/templates/:id
router.patch('/templates/:id', requireAdmin, async (req, res) => {
  const { name, description, items } = req.body;
  try {
    const existing = await pool.query(
      'SELECT * FROM inspection_templates WHERE id=$1 AND company_id=$2',
      [req.params.id, req.user.company_id]
    );
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Template not found' });
    const t = existing.rows[0];
    const result = await pool.query(
      `UPDATE inspection_templates SET name=$1, description=$2, items=$3, updated_at=NOW()
       WHERE id=$4 AND company_id=$5 RETURNING *`,
      [name?.trim() ?? t.name, description ?? t.description, JSON.stringify(items ?? t.items),
       req.params.id, req.user.company_id]
    );
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /inspections/templates/:id
router.delete('/templates/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM inspection_templates WHERE id=$1 AND company_id=$2 RETURNING id',
      [req.params.id, req.user.company_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Template not found' });
    res.json({ deleted: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── Inspections ───────────────────────────────────────────────────────────────

// GET /inspections
router.get('/', requireAuth, async (req, res) => {
  const { project_id, status, from, to, template_id } = req.query;
  const conditions = ['i.company_id = $1'];
  const params = [req.user.company_id];
  if (project_id) { params.push(project_id); conditions.push(`i.project_id = $${params.length}`); }
  if (status) {
    if (!['pass', 'fail', 'partial'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    params.push(status); conditions.push(`i.status = $${params.length}`);
  }
  if (template_id) { params.push(template_id); conditions.push(`i.template_id = $${params.length}`); }
  if (from) { params.push(from); conditions.push(`i.inspected_at >= $${params.length}`); }
  if (to) { params.push(to); conditions.push(`i.inspected_at <= $${params.length}`); }
  try {
    const result = await pool.query(
      `SELECT i.*, p.name AS project_name, u.full_name AS created_by_name
       FROM inspections i
       LEFT JOIN projects p ON i.project_id = p.id
       LEFT JOIN users u ON i.created_by = u.id
       WHERE ${conditions.join(' AND ')} ORDER BY i.inspected_at DESC LIMIT 500`,
      params
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /inspections
router.post('/', requireAdmin, async (req, res) => {
  const VALID_STATUSES = ['pass', 'fail', 'partial'];
  const { template_id, project_id, results, status, inspected_at } = req.body;
  const name = req.body.name?.trim();
  const inspector = req.body.inspector?.trim() || null;
  const location = req.body.location?.trim() || null;
  const notes = req.body.notes?.trim() || null;
  if (!name || !inspected_at) {
    return res.status(400).json({ error: 'name and inspected_at are required' });
  }
  if (name.length > 255) return res.status(400).json({ error: 'name too long (max 255 characters)' });
  if (inspector && inspector.length > 255) return res.status(400).json({ error: 'inspector too long (max 255 characters)' });
  if (location && location.length > 255) return res.status(400).json({ error: 'location too long (max 255 characters)' });
  if (notes && notes.length > 1000) return res.status(400).json({ error: 'notes too long (max 1000 characters)' });
  if (status && !VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'status must be pass, fail, or partial' });
  try {
    const result = await pool.query(
      `INSERT INTO inspections (company_id, template_id, project_id, name, inspector, location,
         notes, results, status, inspected_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.user.company_id, template_id || null, project_id || null, name,
       inspector, location, notes,
       JSON.stringify(results || {}), status || 'pass', inspected_at, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /inspections/:id
router.patch('/:id', requireAdmin, async (req, res) => {
  const VALID_STATUSES = ['pass', 'fail', 'partial'];
  const { project_id, results, status, inspected_at } = req.body;
  const name = req.body.name !== undefined ? (req.body.name?.trim() || null) : undefined;
  const inspector = req.body.inspector !== undefined ? (req.body.inspector?.trim() || null) : undefined;
  const location = req.body.location !== undefined ? (req.body.location?.trim() || null) : undefined;
  const notes = req.body.notes !== undefined ? (req.body.notes?.trim() || null) : undefined;
  if (name !== undefined && name && name.length > 255) return res.status(400).json({ error: 'name too long (max 255 characters)' });
  if (inspector !== undefined && inspector && inspector.length > 255) return res.status(400).json({ error: 'inspector too long (max 255 characters)' });
  if (location !== undefined && location && location.length > 255) return res.status(400).json({ error: 'location too long (max 255 characters)' });
  if (notes !== undefined && notes && notes.length > 1000) return res.status(400).json({ error: 'notes too long (max 1000 characters)' });
  if (status !== undefined && !VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'status must be pass, fail, or partial' });
  try {
    const existing = await pool.query(
      'SELECT * FROM inspections WHERE id=$1 AND company_id=$2',
      [req.params.id, req.user.company_id]
    );
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Inspection not found' });
    const ins = existing.rows[0];
    const result = await pool.query(
      `UPDATE inspections SET project_id=$1, name=$2, inspector=$3, location=$4,
         notes=$5, results=$6, status=$7, inspected_at=$8, updated_at=NOW()
       WHERE id=$9 AND company_id=$10 RETURNING *`,
      [project_id ?? ins.project_id, name ?? ins.name, inspector ?? ins.inspector,
       location ?? ins.location, notes ?? ins.notes,
       JSON.stringify(results ?? ins.results), status ?? ins.status,
       inspected_at ?? ins.inspected_at, req.params.id, req.user.company_id]
    );
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /inspections/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM inspections WHERE id=$1 AND company_id=$2 RETURNING id',
      [req.params.id, req.user.company_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Inspection not found' });
    res.json({ deleted: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
