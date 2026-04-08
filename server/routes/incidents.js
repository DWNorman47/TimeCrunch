const router = require('express').Router();
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendPushToCompanyAdmins } = require('../push');

const INCIDENT_COLS = `
  i.*, u.full_name AS reporter_name, p.name AS project_name`;

const BASE_QUERY = `
  SELECT ${INCIDENT_COLS}
  FROM incident_reports i
  JOIN users u ON i.user_id = u.id
  LEFT JOIN projects p ON i.project_id = p.id`;

// GET /incidents — worker sees own; admin sees all company incidents
router.get('/', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
  const { project_id, worker_id, type, status, from, to } = req.query;

  const conditions = ['i.company_id = $1'];
  const params = [companyId];

  if (!isAdmin) {
    params.push(req.user.id);
    conditions.push(`i.user_id = $${params.length}`);
  } else if (worker_id) {
    params.push(worker_id);
    conditions.push(`i.user_id = $${params.length}`);
  }
  if (project_id) { params.push(project_id); conditions.push(`i.project_id = $${params.length}`); }
  if (type) { params.push(type); conditions.push(`i.type = $${params.length}`); }
  if (status) { params.push(status); conditions.push(`i.status = $${params.length}`); }
  if (from) { params.push(from); conditions.push(`i.incident_date >= $${params.length}`); }
  if (to) { params.push(to); conditions.push(`i.incident_date <= $${params.length}`); }

  try {
    const result = await pool.query(
      `${BASE_QUERY} WHERE ${conditions.join(' AND ')} ORDER BY i.incident_date DESC, i.created_at DESC LIMIT 500`,
      params
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /incidents — submit a new incident report
router.post('/', requireAuth, async (req, res) => {
  const {
    incident_date, incident_time, type, project_id,
    injured_name, body_part, treatment, work_stopped,
    description, witnesses, corrective_action,
  } = req.body;

  if (!incident_date || !type || !description?.trim()) {
    return res.status(400).json({ error: 'incident_date, type, and description are required' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(incident_date) || isNaN(Date.parse(incident_date))) {
    return res.status(400).json({ error: 'incident_date must be a valid date (YYYY-MM-DD)' });
  }

  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `INSERT INTO incident_reports
         (company_id, user_id, project_id, incident_date, incident_time, type,
          injured_name, body_part, treatment, work_stopped, description, witnesses, corrective_action)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        companyId, req.user.id, project_id || null,
        incident_date, incident_time || null, type,
        injured_name || null, body_part || null, treatment || null,
        work_stopped || false, description.trim(),
        witnesses || null, corrective_action || null,
      ]
    );
    const report = result.rows[0];

    const full = await pool.query(
      `${BASE_QUERY} WHERE i.id = $1`,
      [report.id]
    );

    sendPushToCompanyAdmins(companyId, {
      title: `Incident report from ${req.user.full_name}`,
      body: `${type.replace('-', ' ')} — ${incident_date}`,
      url: '/field#incident',
    });

    res.status(201).json(full.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /incidents/:id/close — admin closes an incident
router.patch('/:id/close', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE incident_reports SET status = 'closed' WHERE id = $1 AND company_id = $2 RETURNING *`,
      [req.params.id, req.user.company_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Incident not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /incidents/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
  try {
    const existing = await pool.query(
      'SELECT * FROM incident_reports WHERE id = $1 AND company_id = $2',
      [req.params.id, companyId]
    );
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Incident not found' });
    const report = existing.rows[0];
    if (!isAdmin && report.user_id !== req.user.id) return res.status(403).json({ error: 'Not your report' });
    if (!isAdmin && report.status === 'closed') return res.status(403).json({ error: 'Closed incidents cannot be deleted' });

    await pool.query('DELETE FROM incident_reports WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
