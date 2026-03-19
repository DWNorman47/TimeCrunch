require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { requireAuth } = require('./middleware/auth');
const pool = require('./db');

const app = express();
app.use(helmet());
app.use(cors());
// Stripe webhook needs raw body before express.json parses it
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/time-entries', require('./routes/timeEntries'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/qbo', require('./routes/qbo'));
app.use('/api/clock', require('./routes/clock'));
app.use('/api/superadmin', require('./routes/superadmin'));
app.use('/api/shifts', require('./routes/shifts'));
app.use('/api/push', require('./routes/push'));
app.use('/api/stripe', require('./routes/stripe'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/field-reports', require('./routes/fieldReports'));
app.use('/api/daily-reports', require('./routes/dailyReports'));
app.use('/api/punchlist', require('./routes/punchlist'));
app.use('/api/safety-talks', require('./routes/safetyTalks'));

// Read-only company settings — available to all authenticated users
const FEATURE_KEYS = ['feature_scheduling', 'feature_analytics', 'feature_chat', 'feature_prevailing_wage'];
app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT key, value FROM settings WHERE company_id = $1', [req.user.company_id]);
    const s = {
      prevailing_wage_rate: 45, default_hourly_rate: 30, overtime_multiplier: 1.5,
      overtime_rule: 'daily', overtime_threshold: 8,
      feature_scheduling: true, feature_analytics: true, feature_chat: true, feature_prevailing_wage: true,
    };
    result.rows.forEach(r => {
      if (r.key === 'overtime_rule') s.overtime_rule = r.value;
      else if (FEATURE_KEYS.includes(r.key)) s[r.key] = r.value === '1';
      else s[r.key] = parseFloat(r.value);
    });
    res.json(s);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
