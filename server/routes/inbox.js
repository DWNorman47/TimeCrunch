// In-app notification bell — per-user inbox
const router = require('express').Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /inbox — fetch recent notifications for the current user
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, type, title, body, link, read_at, created_at
       FROM inbox
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /inbox/:id/read — mark one notification read
router.patch('/:id/read', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE inbox SET read_at = NOW() WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /inbox/read-all — mark all unread notifications read
router.patch('/read-all', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE inbox SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL',
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper used by other routes to create inbox items
async function createInboxItem(userId, companyId, type, title, body, link) {
  try {
    await pool.query(
      'INSERT INTO inbox (user_id, company_id, type, title, body, link) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, companyId, type, title, body || null, link || null]
    );
  } catch (err) {
    console.error('createInboxItem error:', err);
  }
}

module.exports = router;
module.exports.createInboxItem = createInboxItem;
