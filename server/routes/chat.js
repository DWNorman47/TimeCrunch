const router = require('express').Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/chat — last 60 messages for this company
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.id, m.sender_id, m.body, m.created_at,
              u.full_name as sender_name, u.role as sender_role
       FROM company_chat m
       JOIN users u ON m.sender_id = u.id
       WHERE m.company_id = $1
       ORDER BY m.created_at DESC
       LIMIT 60`,
      [req.user.company_id]
    );
    res.json(result.rows.reverse());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/chat — send a message
router.post('/', requireAuth, async (req, res) => {
  const { body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'Message body required' });
  try {
    const result = await pool.query(
      `INSERT INTO company_chat (company_id, sender_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, sender_id, body, created_at`,
      [req.user.company_id, req.user.id, body.trim()]
    );
    res.status(201).json({
      ...result.rows[0],
      sender_name: req.user.full_name,
      sender_role: req.user.role,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
