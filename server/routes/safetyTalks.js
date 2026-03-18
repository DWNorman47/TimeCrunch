const router = require('express').Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /safety-talks
router.get('/', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
  const { project_id, from, to } = req.query;

  try {
    const conditions = ['st.company_id = $1'];
    const params = [companyId];

    if (project_id) { params.push(project_id); conditions.push(`st.project_id = $${params.length}`); }
    if (from) { params.push(from); conditions.push(`st.talk_date >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`st.talk_date <= $${params.length}`); }

    const result = await pool.query(
      `SELECT st.*, p.name as project_name, u.full_name as created_by_name,
              (SELECT COUNT(*) FROM safety_talk_signoffs WHERE talk_id = st.id) as signoff_count
       FROM safety_talks st
       LEFT JOIN projects p ON st.project_id = p.id
       LEFT JOIN users u ON st.created_by = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY st.talk_date DESC, st.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /safety-talks/:id — full with signoffs
router.get('/:id', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const [talk, signoffs] = await Promise.all([
      pool.query(
        `SELECT st.*, p.name as project_name, u.full_name as created_by_name
         FROM safety_talks st
         LEFT JOIN projects p ON st.project_id = p.id
         LEFT JOIN users u ON st.created_by = u.id
         WHERE st.id = $1 AND st.company_id = $2`,
        [req.params.id, companyId]
      ),
      pool.query(
        `SELECT s.*, u.full_name
         FROM safety_talk_signoffs s
         LEFT JOIN users u ON s.worker_id = u.id
         WHERE s.talk_id = $1
         ORDER BY s.signed_at`,
        [req.params.id]
      ),
    ]);
    if (talk.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ...talk.rows[0], signoffs: signoffs.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /safety-talks
router.post('/', requireAuth, async (req, res) => {
  const { project_id, title, content, given_by, talk_date } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  if (!talk_date) return res.status(400).json({ error: 'talk_date required' });
  const companyId = req.user.company_id;

  try {
    const result = await pool.query(
      `INSERT INTO safety_talks (company_id, project_id, title, content, given_by, talk_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [companyId, project_id || null, title, content || null, given_by || null, talk_date, req.user.id]
    );
    const id = result.rows[0].id;
    const full = await pool.query(
      `SELECT st.*, p.name as project_name, u.full_name as created_by_name,
              0 as signoff_count
       FROM safety_talks st
       LEFT JOIN projects p ON st.project_id = p.id
       LEFT JOIN users u ON st.created_by = u.id
       WHERE st.id = $1`,
      [id]
    );
    res.status(201).json({ ...full.rows[0], signoffs: [] });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /safety-talks/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
  if (!isAdmin) return res.status(403).json({ error: 'Admins only' });

  const { title, content, given_by, talk_date, project_id } = req.body;
  try {
    const result = await pool.query(
      `UPDATE safety_talks SET
         title=COALESCE($1, title), content=COALESCE($2, content),
         given_by=COALESCE($3, given_by), talk_date=COALESCE($4, talk_date),
         project_id=COALESCE($5, project_id)
       WHERE id=$6 AND company_id=$7 RETURNING id`,
      [title, content, given_by, talk_date, project_id, req.params.id, companyId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    const full = await pool.query(
      `SELECT st.*, p.name as project_name, u.full_name as created_by_name,
              (SELECT COUNT(*) FROM safety_talk_signoffs WHERE talk_id = st.id) as signoff_count
       FROM safety_talks st
       LEFT JOIN projects p ON st.project_id = p.id
       LEFT JOIN users u ON st.created_by = u.id
       WHERE st.id = $1`,
      [req.params.id]
    );
    res.json(full.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /safety-talks/:id/signoff — worker signs
router.post('/:id/signoff', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    // Verify talk belongs to same company
    const talk = await pool.query(
      'SELECT id FROM safety_talks WHERE id=$1 AND company_id=$2', [req.params.id, companyId]
    );
    if (talk.rowCount === 0) return res.status(404).json({ error: 'Not found' });

    // Upsert: one signoff per worker per talk
    const existing = await pool.query(
      'SELECT id FROM safety_talk_signoffs WHERE talk_id=$1 AND worker_id=$2',
      [req.params.id, req.user.id]
    );
    if (existing.rowCount > 0) return res.json({ already_signed: true });

    await pool.query(
      `INSERT INTO safety_talk_signoffs (talk_id, worker_id, worker_name)
       VALUES ($1, $2, $3)`,
      [req.params.id, req.user.id, req.user.full_name]
    );
    res.json({ signed: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /safety-talks/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
  if (!isAdmin) return res.status(403).json({ error: 'Admins only' });

  try {
    const result = await pool.query(
      'DELETE FROM safety_talks WHERE id=$1 AND company_id=$2 RETURNING id',
      [req.params.id, companyId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
