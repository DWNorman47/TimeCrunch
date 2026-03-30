const router = require('express').Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendPushToAllWorkers } = require('../push');
const { getPresignedUploadUrl } = require('../r2');

// GET /safety-talks
router.get('/', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  const { project_id, from, to } = req.query;

  try {
    const conditions = ['st.company_id = $1'];
    const params = [companyId];

    if (project_id) { params.push(project_id); conditions.push(`st.project_id = $${params.length}`); }
    if (from) { params.push(from); conditions.push(`st.talk_date >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`st.talk_date <= $${params.length}`); }

    const result = await pool.query(
      `SELECT st.*, p.name as project_name, u.full_name as created_by_name,
              COUNT(DISTINCT s.id) as signoff_count,
              COUNT(DISTINCT q.id) as question_count
       FROM safety_talks st
       LEFT JOIN projects p ON st.project_id = p.id
       LEFT JOIN users u ON st.created_by = u.id
       LEFT JOIN safety_talk_signoffs s ON s.talk_id = st.id
       LEFT JOIN safety_talk_questions q ON q.talk_id = st.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY st.id, p.name, u.full_name
       ORDER BY st.talk_date DESC, st.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /safety-talks/:id — full with signoffs and questions
router.get('/:id', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
  try {
    const [talk, signoffs, questions, attachments] = await Promise.all([
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
      pool.query(
        `SELECT id, question, options, order_index
           ${isAdmin ? ', correct_index' : ''}
         FROM safety_talk_questions
         WHERE talk_id = $1
         ORDER BY order_index`,
        [req.params.id]
      ),
      pool.query(
        `SELECT id, name, url, content_type, size_bytes, created_at
         FROM safety_talk_attachments
         WHERE talk_id = $1
         ORDER BY created_at`,
        [req.params.id]
      ),
    ]);
    if (talk.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ...talk.rows[0], signoffs: signoffs.rows, questions: questions.rows, attachments: attachments.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /safety-talks
router.post('/', requireAuth, async (req, res) => {
  const { project_id, title, content, given_by, talk_date, questions, pass_threshold } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  if (!talk_date) return res.status(400).json({ error: 'talk_date required' });
  const companyId = req.user.company_id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO safety_talks (company_id, project_id, title, content, given_by, talk_date, created_by, pass_threshold)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [companyId, project_id || null, title, content || null, given_by || null, talk_date, req.user.id,
       pass_threshold != null ? parseInt(pass_threshold) : null]
    );
    const id = result.rows[0].id;

    // Insert questions
    const validQuestions = (questions || []).filter(q => q.question?.trim() && q.options?.filter(o => o?.trim()).length >= 2);
    for (let i = 0; i < validQuestions.length; i++) {
      const q = validQuestions[i];
      const opts = q.options.filter(o => o?.trim());
      await client.query(
        `INSERT INTO safety_talk_questions (talk_id, question, options, correct_index, order_index)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, q.question.trim(), JSON.stringify(opts), Math.min(q.correct_index || 0, opts.length - 1), i]
      );
    }

    await client.query('COMMIT');

    const full = await pool.query(
      `SELECT st.*, p.name as project_name, u.full_name as created_by_name, 0 as signoff_count,
              (SELECT COUNT(*) FROM safety_talk_questions WHERE talk_id = st.id) as question_count
       FROM safety_talks st
       LEFT JOIN projects p ON st.project_id = p.id
       LEFT JOIN users u ON st.created_by = u.id
       WHERE st.id = $1`,
      [id]
    );

    sendPushToAllWorkers(companyId, {
      title: 'New safety talk: ' + title,
      body: validQuestions.length > 0 ? 'Open the app to take the quiz and sign off.' : 'Open the app to read and sign off.',
      url: '/field#safety',
    });

    res.status(201).json({ ...full.rows[0], signoffs: [], questions: validQuestions });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// PATCH /safety-talks/:id
router.patch('/:id', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
  if (!isAdmin) return res.status(403).json({ error: 'Admins only' });

  const { title, content, given_by, talk_date, project_id, questions, pass_threshold } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE safety_talks SET
         title=COALESCE($1, title), content=COALESCE($2, content),
         given_by=COALESCE($3, given_by), talk_date=COALESCE($4, talk_date),
         project_id=COALESCE($5, project_id),
         pass_threshold=COALESCE($6, pass_threshold)
       WHERE id=$7 AND company_id=$8 RETURNING id`,
      [title, content, given_by, talk_date, project_id,
       pass_threshold != null ? parseInt(pass_threshold) : null,
       req.params.id, companyId]
    );
    if (result.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }

    // Replace questions if provided
    if (questions !== undefined) {
      await client.query('DELETE FROM safety_talk_questions WHERE talk_id = $1', [req.params.id]);
      const validQuestions = questions.filter(q => q.question?.trim() && q.options?.filter(o => o?.trim()).length >= 2);
      for (let i = 0; i < validQuestions.length; i++) {
        const q = validQuestions[i];
        const opts = q.options.filter(o => o?.trim());
        await client.query(
          `INSERT INTO safety_talk_questions (talk_id, question, options, correct_index, order_index)
           VALUES ($1,$2,$3,$4,$5)`,
          [req.params.id, q.question.trim(), JSON.stringify(opts), Math.min(q.correct_index || 0, opts.length - 1), i]
        );
      }
    }

    await client.query('COMMIT');

    const full = await pool.query(
      `SELECT st.*, p.name as project_name, u.full_name as created_by_name,
              (SELECT COUNT(*) FROM safety_talk_signoffs WHERE talk_id = st.id) as signoff_count,
              (SELECT COUNT(*) FROM safety_talk_questions WHERE talk_id = st.id) as question_count
       FROM safety_talks st
       LEFT JOIN projects p ON st.project_id = p.id
       LEFT JOIN users u ON st.created_by = u.id
       WHERE st.id = $1`,
      [req.params.id]
    );
    res.json(full.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
});

// POST /safety-talks/:id/signoff — worker signs (with optional quiz answers)
router.post('/:id/signoff', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  const { answers } = req.body; // array of selected option indices

  try {
    const talk = await pool.query(
      'SELECT id, pass_threshold FROM safety_talks WHERE id=$1 AND company_id=$2',
      [req.params.id, companyId]
    );
    if (talk.rowCount === 0) return res.status(404).json({ error: 'Not found' });

    // Check already signed
    const existing = await pool.query(
      'SELECT id FROM safety_talk_signoffs WHERE talk_id=$1 AND worker_id=$2',
      [req.params.id, req.user.id]
    );
    if (existing.rowCount > 0) return res.json({ already_signed: true });

    // Check if quiz is required
    const questions = await pool.query(
      'SELECT id, correct_index FROM safety_talk_questions WHERE talk_id=$1 ORDER BY order_index',
      [req.params.id]
    );

    let quizScore = null;
    let quizPassed = null;

    if (questions.rowCount > 0) {
      if (!Array.isArray(answers) || answers.length !== questions.rowCount) {
        return res.status(400).json({ error: 'answers required', total: questions.rowCount });
      }
      const correct = questions.rows.filter((q, i) => parseInt(answers[i]) === q.correct_index).length;
      const needed = talk.rows[0].pass_threshold ?? questions.rowCount;
      quizScore = correct;
      quizPassed = correct >= needed;

      if (!quizPassed) {
        return res.json({ quiz_failed: true, score: correct, needed, total: questions.rowCount });
      }
    }

    await pool.query(
      `INSERT INTO safety_talk_signoffs (talk_id, worker_id, worker_name, quiz_score, quiz_passed)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.id, req.user.id, req.user.full_name, quizScore, quizPassed]
    );

    res.json({ signed: true, quiz_score: quizScore, quiz_passed: quizPassed });
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

// GET /safety-talks/attachment-upload-url — presigned URL for direct R2 upload (admin)
router.get('/attachment-upload-url', requireAuth, async (req, res) => {
  const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
  if (!isAdmin) return res.status(403).json({ error: 'Admins only' });
  const { ext, type } = req.query;
  if (!ext || !type) return res.status(400).json({ error: 'ext and type required' });
  try {
    const result = await getPresignedUploadUrl('safety-talk-attachments', ext, type);
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /safety-talks/:id/attachments — save attachment metadata after upload (admin)
router.post('/:id/attachments', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
  if (!isAdmin) return res.status(403).json({ error: 'Admins only' });
  const { name, url, content_type, size_bytes } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });
  try {
    const talk = await pool.query('SELECT id FROM safety_talks WHERE id=$1 AND company_id=$2', [req.params.id, companyId]);
    if (talk.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    const result = await pool.query(
      `INSERT INTO safety_talk_attachments (talk_id, name, url, content_type, size_bytes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, name, url, content_type || null, size_bytes || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /safety-talks/:id/attachments/:attId (admin)
router.delete('/:id/attachments/:attId', requireAuth, async (req, res) => {
  const companyId = req.user.company_id;
  const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
  if (!isAdmin) return res.status(403).json({ error: 'Admins only' });
  try {
    const talk = await pool.query('SELECT id FROM safety_talks WHERE id=$1 AND company_id=$2', [req.params.id, companyId]);
    if (talk.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    const result = await pool.query(
      'DELETE FROM safety_talk_attachments WHERE id=$1 AND talk_id=$2 RETURNING id',
      [req.params.attId, req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
