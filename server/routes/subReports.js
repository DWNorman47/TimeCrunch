const router = require('express').Router();
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// GET /sub-reports
router.get('/', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  const { project_id, from, to, sub_company } = req.query;

  const conditions = ['s.company_id = $1'];
  const params = [companyId];

  if (project_id) { params.push(project_id); conditions.push(`s.project_id = $${params.length}`); }
  if (from) { params.push(from); conditions.push(`s.report_date >= $${params.length}`); }
  if (to) { params.push(to); conditions.push(`s.report_date <= $${params.length}`); }
  if (sub_company) { params.push(`%${sub_company}%`); conditions.push(`s.sub_company ILIKE $${params.length}`); }

  try {
    const result = await pool.query(
      `SELECT s.*, p.name as project_name, u.full_name as created_by_name
       FROM sub_reports s
       LEFT JOIN projects p ON s.project_id = p.id
       LEFT JOIN users u ON s.created_by = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.report_date DESC, s.created_at DESC
       LIMIT 500`,
      params
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /sub-reports
router.post('/', requireAdmin, async (req, res) => {
  const { project_id, report_date, sub_company, foreman_name, headcount, work_performed, notes } = req.body;
  if (!report_date || !sub_company?.trim()) {
    return res.status(400).json({ error: 'report_date and sub_company are required' });
  }
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `INSERT INTO sub_reports
         (company_id, project_id, report_date, sub_company, foreman_name, headcount, work_performed, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [companyId, project_id || null, report_date, sub_company.trim(),
       foreman_name || null, headcount ? parseInt(headcount) : null,
       work_performed || null, notes || null, req.user.id]
    );
    const full = await pool.query(
      `SELECT s.*, p.name as project_name, u.full_name as created_by_name
       FROM sub_reports s
       LEFT JOIN projects p ON s.project_id = p.id
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.id = $1`,
      [result.rows[0].id]
    );
    res.status(201).json(full.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /sub-reports/:id
router.patch('/:id', requireAdmin, async (req, res) => {
  const { project_id, report_date, sub_company, foreman_name, headcount, work_performed, notes } = req.body;
  if (!report_date || !sub_company?.trim()) {
    return res.status(400).json({ error: 'report_date and sub_company are required' });
  }
  const companyId = req.user.company_id;
  try {
    const result = await pool.query(
      `UPDATE sub_reports SET project_id=$1, report_date=$2, sub_company=$3, foreman_name=$4,
         headcount=$5, work_performed=$6, notes=$7
       WHERE id=$8 AND company_id=$9 RETURNING *`,
      [project_id || null, report_date, sub_company.trim(),
       foreman_name || null, headcount ? parseInt(headcount) : null,
       work_performed || null, notes || null, req.params.id, companyId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Report not found' });
    const full = await pool.query(
      `SELECT s.*, p.name as project_name, u.full_name as created_by_name
       FROM sub_reports s
       LEFT JOIN projects p ON s.project_id = p.id
       LEFT JOIN users u ON s.created_by = u.id
       WHERE s.id = $1`,
      [req.params.id]
    );
    res.json(full.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /sub-reports/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM sub_reports WHERE id=$1 AND company_id=$2 RETURNING id',
      [req.params.id, req.user.company_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Report not found' });
    res.json({ deleted: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
