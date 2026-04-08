const router = require('express').Router();
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const FULL_SELECT = `
  SELECT r.*, p.name AS project_name, u.full_name AS created_by_name
  FROM rfis r
  LEFT JOIN projects p ON r.project_id = p.id
  LEFT JOIN users u ON r.created_by = u.id`;

// GET /rfis
router.get('/', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  const { project_id, status, from, to } = req.query;
  const conditions = ['r.company_id = $1'];
  const params = [companyId];
  if (project_id) { params.push(project_id); conditions.push(`r.project_id = $${params.length}`); }
  if (status) { params.push(status); conditions.push(`r.status = $${params.length}`); }
  if (from) { params.push(from); conditions.push(`r.date_submitted >= $${params.length}`); }
  if (to) { params.push(to); conditions.push(`r.date_submitted <= $${params.length}`); }
  try {
    const result = await pool.query(
      `${FULL_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY r.rfi_number DESC LIMIT 500`,
      params
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /rfis — create with auto-number
router.post('/', requireAdmin, async (req, res) => {
  const { project_id, subject, description, directed_to, submitted_by, date_submitted, date_due } = req.body;
  if (!subject?.trim() || !date_submitted) {
    return res.status(400).json({ error: 'subject and date_submitted are required' });
  }
  const companyId = req.user.company_id;
  try {
    // Auto-number: next sequential RFI number for this company
    const numResult = await pool.query(
      'SELECT COALESCE(MAX(rfi_number), 0) + 1 AS next_num FROM rfis WHERE company_id = $1',
      [companyId]
    );
    const rfiNumber = numResult.rows[0].next_num;

    const result = await pool.query(
      `INSERT INTO rfis (company_id, project_id, rfi_number, subject, description, directed_to,
         submitted_by, date_submitted, date_due, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [companyId, project_id || null, rfiNumber, subject.trim(), description || null,
       directed_to || null, submitted_by || null, date_submitted,
       date_due || null, req.user.id]
    );
    const full = await pool.query(`${FULL_SELECT} WHERE r.id = $1`, [result.rows[0].id]);
    res.status(201).json(full.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PATCH /rfis/:id — update (edit fields or add response)
router.patch('/:id', requireAdmin, async (req, res) => {
  const companyId = req.user.company_id;
  const { project_id, subject, description, directed_to, submitted_by,
          date_submitted, date_due, response, status } = req.body;
  try {
    const existing = await pool.query('SELECT * FROM rfis WHERE id=$1 AND company_id=$2', [req.params.id, companyId]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'RFI not found' });
    const r = existing.rows[0];

    // Auto-set status to 'answered' when response is added
    let newStatus = status ?? r.status;
    if (response?.trim() && r.status === 'open') newStatus = 'answered';

    const result = await pool.query(
      `UPDATE rfis SET project_id=$1, subject=$2, description=$3, directed_to=$4, submitted_by=$5,
         date_submitted=$6, date_due=$7, response=$8, status=$9, updated_at=NOW()
       WHERE id=$10 AND company_id=$11 RETURNING *`,
      [project_id ?? r.project_id, subject?.trim() ?? r.subject, description ?? r.description,
       directed_to ?? r.directed_to, submitted_by ?? r.submitted_by,
       date_submitted ?? r.date_submitted, date_due ?? r.date_due,
       response ?? r.response, newStatus, req.params.id, companyId]
    );
    const full = await pool.query(`${FULL_SELECT} WHERE r.id = $1`, [req.params.id]);
    res.json(full.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /rfis/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM rfis WHERE id=$1 AND company_id=$2 RETURNING id',
      [req.params.id, req.user.company_id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'RFI not found' });
    res.json({ deleted: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
