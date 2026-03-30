require('dotenv').config();

const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`ERROR: Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { requireAuth, requirePlan, requireProAddon } = require('./middleware/auth');
const pool = require('./db');

const app = express();
app.set('trust proxy', 1); // trust first proxy (Render) so req.ip is the real client IP
app.use(helmet());
app.use(cors());

// Block TRACE method
app.use((req, res, next) => {
  if (req.method === 'TRACE') return res.status(405).end();
  next();
});

// Prevent caching of all API responses
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  next();
});

// Stripe webhook needs raw body before express.json parses it
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '20mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/time-entries', require('./routes/timeEntries'));
app.use('/api/admin', require('./routes/admin'));
// QBO OAuth callback must be public (Intuit redirects here without a JWT)
const qboRouter = require('./routes/qbo');
app.get('/api/qbo/callback', qboRouter.oauthCallback);
app.use('/api/qbo', requireAuth, requireProAddon, qboRouter);
app.use('/api/clock', require('./routes/clock'));
app.use('/api/superadmin', require('./routes/superadmin'));
app.use('/api/shifts', require('./routes/shifts'));
app.use('/api/push', require('./routes/push'));
app.use('/api/stripe', require('./routes/stripe'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/field-reports', requireAuth, requirePlan('business'), require('./routes/fieldReports'));
app.use('/api/incidents', requireAuth, requirePlan('business'), require('./routes/incidents'));
app.use('/api/sub-reports', requireAuth, requirePlan('business'), require('./routes/subReports'));
app.use('/api/equipment', requireAuth, requirePlan('business'), require('./routes/equipment'));
app.use('/api/rfis', requireAuth, requirePlan('business'), require('./routes/rfis'));
app.use('/api/daily-reports', requireAuth, requirePlan('business'), require('./routes/dailyReports'));
app.use('/api/punchlist', requireAuth, requirePlan('business'), require('./routes/punchlist'));
app.use('/api/inspections', requireAuth, requirePlan('business'), require('./routes/inspections'));
app.use('/api/safety-talks', requireAuth, requirePlan('business'), require('./routes/safetyTalks'));
app.use('/api/safety-checklists', requireAuth, requirePlan('business'), require('./routes/safetyChecklists'));
app.use('/api/inbox', require('./routes/inbox'));

// Read-only company settings — available to all authenticated users
const { SETTINGS_DEFAULTS, applySettingsRows } = require('./settingsDefaults');
const { limitForPlan } = require('./storage');
app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const [settingsResult, coResult] = await Promise.all([
      pool.query('SELECT key, value FROM settings WHERE company_id = $1', [req.user.company_id]),
      pool.query('SELECT plan, subscription_status, storage_bytes_used FROM companies WHERE id = $1', [req.user.company_id]),
    ]);
    const settings = applySettingsRows(settingsResult.rows, SETTINGS_DEFAULTS);
    const { plan, subscription_status, storage_bytes_used } = coResult.rows[0] || {};
    const resolvedPlan = plan || 'free';
    res.json({
      ...settings,
      plan: resolvedPlan,
      subscription_status: subscription_status || 'trial',
      storage_bytes_used: parseInt(storage_bytes_used ?? 0),
      storage_limit_bytes: limitForPlan(resolvedPlan),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Company contact info — available to all authenticated users (used in worker invoice)
app.get('/api/company-info', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT name, address, phone, contact_email FROM companies WHERE id = $1',
      [req.user.company_id]
    );
    res.json(result.rows[0] || {});
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  const { startInactiveWorkerJob } = require('./jobs/inactiveWorkers');
  startInactiveWorkerJob();
  const { startExpireTrialsJob } = require('./jobs/expireTrials');
  startExpireTrialsJob();
  const { startEquipmentMaintenanceJob } = require('./jobs/equipmentMaintenance');
  startEquipmentMaintenanceJob();
});
