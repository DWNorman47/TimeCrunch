const router = require('express').Router();
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendPushToCompanyAdmins } = require('../push');

// GET /field-reports — worker gets own; admin gets full company feed
router.get('/', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
  try {
    const { project_id, worker_id, status, from, to } = req.query;
    const conditions = ['r.company_id = $1'];
    const params = [companyId];

    if (!isAdmin) {
      params.push(req.user.id);
      conditions.push(`r.user_id = $${params.length}`);
    } else if (worker_id) {
      params.push(worker_id);
      conditions.push(`r.user_id = $${params.length}`);
    }
    if (project_id) { params.push(project_id); conditions.push(`r.project_id = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`r.status = $${params.length}`); }
    if (from) { params.push(from); conditions.push(`r.reported_at >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`r.reported_at < ($${params.length}::date + interval '1 day')`); }

    const result = await pool.query(
      `SELECT r.*, u.full_name as worker_name, p.name as project_name,
              COALESCE(json_agg(ph ORDER BY ph.created_at) FILTER (WHERE ph.id IS NOT NULL), '[]') as photos
       FROM field_reports r
       JOIN users u ON r.user_id = u.id
       LEFT JOIN projects p ON r.project_id = p.id
       LEFT JOIN field_report_photos ph ON ph.report_id = r.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY r.id, u.full_name, p.name
       ORDER BY r.reported_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /field-reports — create a report with photos
router.post('/', requireAuth, async (req, res) => {
  const { title, notes, project_id, lat, lng, photos = [] } = req.body;
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `INSERT INTO field_reports (company_id, user_id, project_id, title, notes, lat, lng)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [companyId, req.user.id, project_id || null, title || null, notes || null, lat || null, lng || null]
    );
    const report = result.rows[0];

    if (photos.length > 0) {
      const photoValues = photos.map((p, i) => `($1, $2, $${i * 2 + 3}, $${i * 2 + 4})`).join(', ');
      const photoParams = [report.id, companyId];
      photos.forEach(p => { photoParams.push(p.url); photoParams.push(p.caption || null); });
      await pool.query(
        `INSERT INTO field_report_photos (report_id, company_id, url, caption) VALUES ${photoValues}`,
        photoParams
      );
    }

    // Notify admins of new field report
    sendPushToCompanyAdmins(companyId, {
      title: `Field report from ${req.user.full_name}`,
      body: title || notes?.substring(0, 80) || 'New field report submitted',
      url: '/field',
    });

    // Return with photos included
    const full = await pool.query(
      `SELECT r.*, u.full_name as worker_name, p.name as project_name,
              COALESCE(json_agg(ph ORDER BY ph.created_at) FILTER (WHERE ph.id IS NOT NULL), '[]') as photos
       FROM field_reports r
       JOIN users u ON r.user_id = u.id
       LEFT JOIN projects p ON r.project_id = p.id
       LEFT JOIN field_report_photos ph ON ph.report_id = r.id
       WHERE r.id = $1
       GROUP BY r.id, u.full_name, p.name`,
      [report.id]
    );
    res.status(201).json(full.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /field-reports/:id — worker updates their own report (if not yet reviewed)
router.patch('/:id', requireAuth, async (req, res) => {
  const { title, notes, project_id } = req.body;
  const companyId = req.user.company_id;
  try {
    const existing = await pool.query(
      'SELECT * FROM field_reports WHERE id = $1 AND company_id = $2',
      [req.params.id, companyId]
    );
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Report not found' });
    const report = existing.rows[0];
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    if (!isAdmin && report.user_id !== req.user.id) return res.status(403).json({ error: 'Not your report' });
    if (!isAdmin && report.status === 'reviewed') return res.status(403).json({ error: 'Reviewed reports cannot be edited' });

    const result = await pool.query(
      `UPDATE field_reports SET title = $1, notes = $2, project_id = $3 WHERE id = $4 RETURNING *`,
      [title ?? report.title, notes ?? report.notes, project_id ?? report.project_id, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /field-reports/:id/review — admin marks reviewed
router.patch('/:id/review', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE field_reports SET status = 'reviewed' WHERE id = $1 AND company_id = $2 RETURNING *`,
      [req.params.id, req.user.company_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Report not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /field-reports/:id — worker deletes own unreviewed report
router.delete('/:id', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  try {
    const existing = await pool.query(
      'SELECT * FROM field_reports WHERE id = $1 AND company_id = $2',
      [req.params.id, companyId]
    );
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Report not found' });
    const report = existing.rows[0];
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    if (!isAdmin && report.user_id !== req.user.id) return res.status(403).json({ error: 'Not your report' });
    if (!isAdmin && report.status === 'reviewed') return res.status(403).json({ error: 'Reviewed reports cannot be deleted' });

    await pool.query('DELETE FROM field_reports WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /field-reports/photos — aggregated photo gallery for the company
router.get('/photos', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
  const { project_id, from, to } = req.query;

  const conditions = ['r.company_id = $1'];
  const params = [companyId];

  if (!isAdmin) {
    params.push(req.user.id);
    conditions.push(`r.user_id = $${params.length}`);
  }
  if (project_id) { params.push(project_id); conditions.push(`r.project_id = $${params.length}`); }
  if (from) { params.push(from); conditions.push(`r.reported_at >= $${params.length}`); }
  if (to) { params.push(to); conditions.push(`r.reported_at < ($${params.length}::date + interval '1 day')`); }

  try {
    const result = await pool.query(
      `SELECT ph.id, ph.url, ph.caption,
              r.id as report_id, r.reported_at, r.title as report_title,
              r.project_id, r.lat, r.lng,
              p.name as project_name, u.full_name as worker_name
       FROM field_report_photos ph
       JOIN field_reports r ON ph.report_id = r.id
       JOIN users u ON r.user_id = u.id
       LEFT JOIN projects p ON r.project_id = p.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.reported_at DESC, ph.id ASC`,
      params
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
