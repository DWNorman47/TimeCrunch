const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { uploadBase64 } = require('../r2');
const { incrementStorage, decrementStorage, checkStorageLimit } = require('../storage');
const { getAdvancedSettings, ADVANCED_DEFAULTS } = require('./admin');

// GET /api/reimbursements/categories
// Returns:
//   active — shown in form dropdowns (defaults minus suppressed, plus custom)
//   known  — all valid category values for display (all defaults + current custom)
//            if a stored category isn't in "known", the client shows "Other"
router.get('/categories', requireAuth, async (req, res) => {
  try {
    const all = await getAdvancedSettings(req.user.company_id);
    const cfg = all.reimbursement_categories;
    const active = [
      ...cfg.defaults.filter(c => !cfg.suppressed.includes(c)),
      ...cfg.custom,
    ];
    const known = [...cfg.defaults, ...cfg.custom];
    res.json({ active, known });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/reimbursements — worker: list own reimbursements
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.amount, r.description, r.category, r.expense_date, r.receipt_url,
              r.status, r.admin_notes, r.created_at, r.project_id, p.name AS project_name
       FROM reimbursements r
       LEFT JOIN projects p ON p.id = r.project_id
       WHERE r.company_id = $1 AND r.user_id = $2
       ORDER BY r.expense_date DESC, r.created_at DESC`,
      [req.user.company_id, req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load reimbursements' });
  }
});

// POST /api/reimbursements — worker: submit a reimbursement
router.post('/', requireAuth, async (req, res) => {
  const { amount, description, category, expense_date, receipt, project_id } = req.body;
  if (!amount || !expense_date) {
    return res.status(400).json({ error: 'amount and expense_date are required' });
  }
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'amount must be a positive number' });

  try {
    let receiptUrl = null;
    let receiptSizeBytes = null;

    if (receipt) {
      const { allowed } = await checkStorageLimit(req.user.company_id, 5 * 1024 * 1024);
      if (!allowed) return res.status(400).json({ error: 'Storage limit reached. Upgrade your plan to upload more files.' });

      const uploaded = await uploadBase64(receipt, 'receipts');
      receiptUrl = uploaded.url;
      receiptSizeBytes = uploaded.sizeBytes;
      await incrementStorage(req.user.company_id, receiptSizeBytes);
    }

    const { rows } = await pool.query(
      `INSERT INTO reimbursements (company_id, user_id, amount, description, category, expense_date, receipt_url, receipt_size_bytes, project_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, amount, description, category, expense_date, receipt_url, status, admin_notes, created_at, project_id`,
      [req.user.company_id, req.user.id, amt, description || null, category || null, expense_date, receiptUrl, receiptSizeBytes, project_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit reimbursement' });
  }
});

// DELETE /api/reimbursements/:id — worker: delete own pending reimbursement
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM reimbursements WHERE id = $1 AND company_id = $2 AND user_id = $3 AND status = 'pending'
       RETURNING receipt_size_bytes`,
      [req.params.id, req.user.company_id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found or cannot be deleted' });
    if (rows[0].receipt_size_bytes) {
      await decrementStorage(req.user.company_id, rows[0].receipt_size_bytes);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete reimbursement' });
  }
});

// --- Admin routes ---

// POST /api/reimbursements/admin — admin: submit a reimbursement for any worker (or self)
router.post('/admin', requireAuth, requireAdmin, async (req, res) => {
  const { user_id, amount, description, category, expense_date, receipt, project_id, status = 'approved' } = req.body;
  if (!user_id || !amount || !expense_date) {
    return res.status(400).json({ error: 'user_id, amount, and expense_date are required' });
  }
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'amount must be a positive number' });
  if (!['pending', 'approved'].includes(status)) return res.status(400).json({ error: 'status must be pending or approved' });

  try {
    const worker = await pool.query('SELECT id FROM users WHERE id = $1 AND company_id = $2', [user_id, req.user.company_id]);
    if (!worker.rows.length) return res.status(404).json({ error: 'Worker not found' });

    let receiptUrl = null;
    let receiptSizeBytes = null;
    if (receipt) {
      const { allowed } = await checkStorageLimit(req.user.company_id, 5 * 1024 * 1024);
      if (!allowed) return res.status(400).json({ error: 'Storage limit reached.' });
      const uploaded = await uploadBase64(receipt, 'receipts');
      receiptUrl = uploaded.url;
      receiptSizeBytes = uploaded.sizeBytes;
      await incrementStorage(req.user.company_id, receiptSizeBytes);
    }

    const { rows } = await pool.query(
      `INSERT INTO reimbursements (company_id, user_id, amount, description, category, expense_date, receipt_url, receipt_size_bytes, status, project_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, amount, description, category, expense_date, receipt_url, status, admin_notes, created_at, project_id`,
      [req.user.company_id, user_id, amt, description || null, category || null, expense_date, receiptUrl, receiptSizeBytes, status, project_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit reimbursement' });
  }
});

// GET /api/reimbursements/admin — admin: list all reimbursements for company
router.get('/admin', requireAuth, requireAdmin, async (req, res) => {
  const { status, user_id } = req.query;
  const conditions = ['r.company_id = $1'];
  const params = [req.user.company_id];
  if (status) { params.push(status); conditions.push(`r.status = $${params.length}`); }
  if (user_id) { params.push(user_id); conditions.push(`r.user_id = $${params.length}`); }

  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.amount, r.description, r.category, r.expense_date, r.receipt_url,
              r.status, r.admin_notes, r.created_at, r.project_id, p.name AS project_name,
              u.full_name, u.username
       FROM reimbursements r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN projects p ON p.id = r.project_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.expense_date DESC, r.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load reimbursements' });
  }
});

// PATCH /api/reimbursements/admin/:id — admin: approve or reject
router.patch('/admin/:id', requireAuth, requireAdmin, async (req, res) => {
  const { status, admin_notes } = req.body;
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'status must be approved, rejected, or pending' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE reimbursements
       SET status = $1, admin_notes = $2, updated_at = NOW()
       WHERE id = $3 AND company_id = $4
       RETURNING id, amount, description, category, expense_date, receipt_url,
                 status, admin_notes, created_at, project_id`,
      [status, admin_notes || null, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update reimbursement' });
  }
});

module.exports = router;
