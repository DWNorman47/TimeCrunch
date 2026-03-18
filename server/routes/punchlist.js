const router = require('express').Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /punchlist
router.get('/', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
  const { project_id, status, priority } = req.query;

  try {
    const conditions = ['pi.company_id = $1'];
    const params = [companyId];

    if (project_id) { params.push(project_id); conditions.push(`pi.project_id = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`pi.status = $${params.length}`); }
    if (priority) { params.push(priority); conditions.push(`pi.priority = $${params.length}`); }

    const result = await pool.query(
      `SELECT pi.*, p.name as project_name,
              creator.full_name as created_by_name,
              assignee.full_name as assigned_to_name
       FROM punchlist_items pi
       LEFT JOIN projects p ON pi.project_id = p.id
       LEFT JOIN users creator ON pi.created_by = creator.id
       LEFT JOIN users assignee ON pi.assigned_to = assignee.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY
         CASE pi.priority WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END,
         pi.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /punchlist
router.post('/', requireAuth, async (req, res) => {
  const { project_id, title, description, location, priority, assigned_to } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const companyId = req.user.company_id;

  try {
    const result = await pool.query(
      `INSERT INTO punchlist_items
         (company_id, project_id, title, description, location, priority, assigned_to, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [companyId, project_id || null, title, description || null, location || null,
       priority || 'normal', assigned_to || null, req.user.id]
    );
    const id = result.rows[0].id;
    const full = await pool.query(
      `SELECT pi.*, p.name as project_name, creator.full_name as created_by_name,
              assignee.full_name as assigned_to_name
       FROM punchlist_items pi
       LEFT JOIN projects p ON pi.project_id = p.id
       LEFT JOIN users creator ON pi.created_by = creator.id
       LEFT JOIN users assignee ON pi.assigned_to = assignee.id
       WHERE pi.id = $1`,
      [id]
    );
    res.status(201).json(full.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /punchlist/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  const { title, description, location, priority, status, assigned_to } = req.body;

  try {
    const existing = await pool.query(
      'SELECT * FROM punchlist_items WHERE id=$1 AND company_id=$2', [req.params.id, companyId]
    );
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Not found' });

    const resolvedAt = status === 'verified' && existing.rows[0].status !== 'verified'
      ? new Date() : existing.rows[0].resolved_at;

    await pool.query(
      `UPDATE punchlist_items SET
         title=COALESCE($1, title), description=COALESCE($2, description),
         location=COALESCE($3, location), priority=COALESCE($4, priority),
         status=COALESCE($5, status), assigned_to=$6,
         resolved_at=$7, updated_at=NOW()
       WHERE id=$8`,
      [title, description, location, priority, status,
       assigned_to !== undefined ? (assigned_to || null) : existing.rows[0].assigned_to,
       resolvedAt, req.params.id]
    );

    const full = await pool.query(
      `SELECT pi.*, p.name as project_name, creator.full_name as created_by_name,
              assignee.full_name as assigned_to_name
       FROM punchlist_items pi
       LEFT JOIN projects p ON pi.project_id = p.id
       LEFT JOIN users creator ON pi.created_by = creator.id
       LEFT JOIN users assignee ON pi.assigned_to = assignee.id
       WHERE pi.id = $1`,
      [req.params.id]
    );
    res.json(full.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /punchlist/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
  const cond = isAdmin ? 'company_id=$2' : 'company_id=$2 AND created_by=$3';
  const params = isAdmin ? [req.params.id, companyId] : [req.params.id, companyId, req.user.id];

  try {
    const result = await pool.query(
      `DELETE FROM punchlist_items WHERE id=$1 AND ${cond} RETURNING id`, params
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
