const router = require('express').Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/chat?worker_id=X
// Workers: always see their own thread
// Admin: must pass worker_id to see that worker's thread;
//        omit worker_id to get a list of workers with recent messages
router.get('/', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  const isAdmin = req.user.role === 'admin';

  try {
    if (!isAdmin) {
      // Worker: fetch their own thread
      const result = await pool.query(
        `SELECT m.id, m.sender_id, m.body, m.created_at,
                u.full_name as sender_name, u.role as sender_role
         FROM company_chat m
         JOIN users u ON m.sender_id = u.id
         WHERE m.company_id = $1 AND m.worker_id = $2
         ORDER BY m.created_at ASC
         LIMIT 100`,
        [companyId, req.user.id]
      );
      return res.json(result.rows);
    }

    const workerId = req.query.worker_id;
    if (!workerId) {
      // Admin: return list of workers who have messages, with latest message preview
      const result = await pool.query(
        `SELECT DISTINCT ON (m.worker_id)
                m.worker_id, u.full_name as worker_name,
                m.body as last_message, m.created_at as last_at
         FROM company_chat m
         JOIN users u ON m.worker_id = u.id
         WHERE m.company_id = $1
         ORDER BY m.worker_id, m.created_at DESC`,
        [companyId]
      );
      return res.json(result.rows);
    }

    // Admin fetching a specific worker's thread
    const result = await pool.query(
      `SELECT m.id, m.sender_id, m.body, m.created_at,
              u.full_name as sender_name, u.role as sender_role
       FROM company_chat m
       JOIN users u ON m.sender_id = u.id
       WHERE m.company_id = $1 AND m.worker_id = $2
       ORDER BY m.created_at ASC
       LIMIT 100`,
      [companyId, workerId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/chat
// Workers: send to their own thread (worker_id = self)
// Admin: must provide worker_id in body
router.post('/', requireAuth, async (req, res) => {
  const { body, worker_id } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'Message body required' });

  const isAdmin = req.user.role === 'admin';
  const targetWorkerId = isAdmin ? worker_id : req.user.id;
  if (!targetWorkerId) return res.status(400).json({ error: 'worker_id required' });

  try {
    const result = await pool.query(
      `INSERT INTO company_chat (company_id, sender_id, worker_id, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, sender_id, worker_id, body, created_at`,
      [req.user.company_id, req.user.id, targetWorkerId, body.trim()]
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
