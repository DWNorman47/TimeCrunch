require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { requireAuth } = require('./middleware/auth');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/time-entries', require('./routes/timeEntries'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/qbo', require('./routes/qbo'));
app.use('/api/clock', require('./routes/clock'));
app.use('/api/superadmin', require('./routes/superadmin'));

// Read-only company settings — available to all authenticated users
app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT key, value FROM settings WHERE company_id = $1', [req.user.company_id]);
    const s = { prevailing_wage_rate: 45, default_hourly_rate: 30, overtime_multiplier: 1.5 };
    result.rows.forEach(r => { s[r.key] = parseFloat(r.value); });
    res.json(s);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
