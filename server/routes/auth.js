const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const sgMail = require('@sendgrid/mail');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

function validatePassword(password, username) {
  if (password.length < 6) return 'Password must be at least 6 characters';
  if (password.length > 128) return 'Password must be 128 characters or fewer';
  if (username && password.toLowerCase().includes(username.toLowerCase())) return 'Password cannot contain your username';
  return null;
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, full_name: user.full_name, invoice_name: user.invoice_name || null, language: user.language, company_id: user.company_id, company_name: user.company_name, admin_permissions: user.admin_permissions || null, worker_access_ids: user.worker_access_ids || null },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
}

// Login
router.post('/login', loginLimiter, async (req, res) => {
  const { password } = req.body;
  const username = req.body.username?.trim();
  const company_name = req.body.company_name?.trim();
  if (!username || !password || !company_name) {
    return res.status(400).json({ error: 'Company name, username, and password required' });
  }
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
  const logFailure = (reason) => pool.query(
    'INSERT INTO login_failures (attempted_company, attempted_username, failure_reason, ip) VALUES ($1, $2, $3, $4)',
    [company_name, username, reason, ip]
  ).catch(() => {});
  try {
    // Step 1: check company name
    const companyRes = await pool.query(
      'SELECT id FROM companies WHERE LOWER(name) = LOWER($1)', [company_name]
    );
    if (!companyRes.rows[0]) {
      await logFailure('company_not_found');
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const companyId = companyRes.rows[0].id;

    // Step 2: check username within that company
    const userRes = await pool.query(
      'SELECT u.*, $2::text as company_name FROM users u WHERE LOWER(u.username) = LOWER($1) AND u.company_id = $3 AND u.active = true',
      [username, company_name, companyId]
    );
    const user = userRes.rows[0];

    // Check lockout before verifying password (don't reveal whether user exists)
    if (user && user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return res.status(423).json({ error: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.` });
    }

    if (!user) {
      await logFailure('user_not_found');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      await logFailure('wrong_password');
      // Increment failed attempts and lock if threshold reached
      const newCount = (user.failed_login_attempts || 0) + 1;
      if (newCount >= 10) {
        await pool.query(
          'UPDATE users SET failed_login_attempts = $1, locked_until = NOW() + INTERVAL \'24 hours\' WHERE id = $2',
          [newCount, user.id]
        );
      } else {
        await pool.query('UPDATE users SET failed_login_attempts = $1 WHERE id = $2', [newCount, user.id]);
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Reset failed attempts on successful password match
    await pool.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);

    // Track first login for welcome modal
    let isFirstLogin = false;
    try {
      isFirstLogin = !user.welcomed_at;
      if (isFirstLogin) {
        await pool.query('UPDATE users SET welcomed_at = NOW() WHERE id = $1', [user.id]);
      }
    } catch {
      // welcomed_at column may not exist yet — login proceeds normally
    }

    if (!user.email_confirmed) {
      return res.status(403).json({ error: 'email_not_confirmed', email: user.email });
    }
    // If worker must change their temporary password, issue a short-lived setup token
    if (user.must_change_password) {
      const setupToken = jwt.sign({ id: user.id, setup_pending: true }, process.env.JWT_SECRET, { expiresIn: '15m' });
      return res.json({ must_change_password: true, setup_token: setupToken });
    }
    // If MFA is enabled, issue a short-lived MFA token instead of the full JWT
    if (user.mfa_enabled) {
      const mfaToken = jwt.sign({ id: user.id, mfa_pending: true }, process.env.JWT_SECRET, { expiresIn: '5m' });
      return res.json({ mfa_required: true, mfa_token: mfaToken });
    }
    const token = signToken(user);
    res.json({ token, first_login: isFirstLogin, user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name, language: user.language, company_id: user.company_id, company_name: user.company_name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user — includes live company billing info for client-side plan gating
router.get('/me', requireAuth, async (req, res) => {
  try {
    const [companyRes, userRes] = await Promise.all([
      pool.query('SELECT plan, subscription_status, addon_qbo, trial_ends_at FROM companies WHERE id = $1', [req.user.company_id]),
      pool.query('SELECT mfa_enabled, language, admin_permissions, hourly_rate, rate_type FROM users WHERE id = $1', [req.user.id]),
    ]);
    const company = companyRes.rows[0] || {};
    const userRow = userRes.rows[0] || {};
    res.json({
      user: {
        ...req.user,
        language: userRow.language || req.user.language,
        plan: company.plan || 'free',
        subscription_status: company.subscription_status,
        addon_qbo: company.addon_qbo || false,
        trial_ends_at: company.trial_ends_at,
        mfa_enabled: userRow.mfa_enabled || false,
        admin_permissions: userRow.admin_permissions || null,
        worker_access_ids: userRow.worker_access_ids || null,
        hourly_rate: userRow.hourly_rate != null ? parseFloat(userRow.hourly_rate) : null,
        rate_type: userRow.rate_type || 'hourly',
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Register — creates a new company and its first admin user
router.post('/register', authLimiter, async (req, res) => {
  const { password, timezone } = req.body;
  const company_name = req.body.company_name?.trim();
  const full_name = req.body.full_name?.trim();
  const first_name = req.body.first_name?.trim() || null;
  const middle_name = req.body.middle_name?.trim() || null;
  const last_name = req.body.last_name?.trim() || null;
  const username = req.body.username?.trim();
  const email = req.body.email?.trim();
  if (!company_name || !full_name || !username || !password || !email) {
    return res.status(400).json({ error: 'company_name, full_name, email, username, and password are required' });
  }
  if (company_name.length > 100) return res.status(400).json({ error: 'Company name must be 100 characters or fewer' });
  if (full_name.length > 100) return res.status(400).json({ error: 'Full name must be 100 characters or fewer' });
  if (username.length > 50) return res.status(400).json({ error: 'Username must be 50 characters or fewer' });
  const pwErr = validatePassword(password, username);
  if (pwErr) return res.status(400).json({ error: pwErr });

  // Capture real client IP (req.ip respects trust proxy setting)
  const registrationIp = req.ip || 'unknown';

  // Owner/dev IPs bypass all trial-limit checks
  const whitelistedIps = (process.env.WHITELISTED_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ipIsWhitelisted = whitelistedIps.includes(registrationIp);

  // Block IPs that have registered too many trials recently (skipped for whitelisted IPs)
  const TRIAL_LIMIT = parseInt(process.env.TRIAL_LIMIT_PER_IP) || 5;
  if (!ipIsWhitelisted) {
    const ipQuery = await pool.query(
      `SELECT COUNT(*), array_agg(name ORDER BY created_at) as company_names
       FROM companies WHERE registration_ip = $1 AND created_at > NOW() - INTERVAL '30 days'`,
      [registrationIp]
    );
    const priorCount = parseInt(ipQuery.rows[0].count);
    if (priorCount >= TRIAL_LIMIT) {
      return res.status(429).json({ error: 'This IP address has been flagged for suspicious activity. Further registration attempts from this network are being logged and reviewed by our trust and safety team.' });
    }
    // Alert on second registration from same IP (priorCount >= 1 means this is #2+)
    if (priorCount >= 1) {
      const priorNames = ipQuery.rows[0].company_names || [];
      sgMail.send({
      from: { name: 'OpsFloa', email: process.env.SENDGRID_FROM_EMAIL },
      to: 'info@opsfloa.com',
      subject: `⚠️ Multiple trial registrations from IP ${registrationIp}`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
          <h2 style="color:#dc2626;margin-bottom:8px">Multiple trial registrations</h2>
          <p style="color:#444">A new company is being registered from an IP address that has already signed up for a trial in the last 30 days.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
            <tr><td style="padding:6px 0;color:#6b7280;width:140px">IP Address</td><td style="padding:6px 0;font-weight:600">${registrationIp}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">New company</td><td style="padding:6px 0;font-weight:600">${company_name}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">New email</td><td style="padding:6px 0">${email}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Prior registrations</td><td style="padding:6px 0">${priorNames.join(', ')}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Total from this IP</td><td style="padding:6px 0">${priorCount + 1} in last 30 days</td></tr>
          </table>
          <p style="color:#9ca3af;font-size:12px">Registration was allowed (limit is ${TRIAL_LIMIT}). You'll receive another alert if they register again.</p>
        </div>
      `,
    }).catch(err => console.error('Trial abuse alert email failed:', err));
  }
  } // end if (!ipIsWhitelisted)

  const slug = company_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT id FROM companies WHERE lower(name) = lower($1)', [company_name]);
    if (existing.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'A company with that name already exists' });
    }
    const trialDays = parseInt(process.env.TRIAL_DAYS) || 14;
    const companyResult = await client.query(
      `INSERT INTO companies (name, slug, subscription_status, trial_ends_at, registration_ip)
       VALUES ($1, $2, 'trial', NOW() + ($3 || ' days')::INTERVAL, $4) RETURNING id`,
      [company_name, slug, trialDays, registrationIp]
    );
    const companyId = companyResult.rows[0].id;
    const defaults = [['prevailing_wage_rate', 45], ['default_hourly_rate', 30], ['overtime_multiplier', 1.5]];
    for (const [key, value] of defaults) {
      await client.query('INSERT INTO settings (company_id, key, value) VALUES ($1, $2, $3)', [companyId, key, value]);
    }
    if (timezone && /^[A-Za-z_]+\/[A-Za-z_\/]+$/.test(timezone)) {
      await client.query('INSERT INTO settings (company_id, key, value) VALUES ($1, $2, $3)', [companyId, 'company_timezone', timezone]);
    }
    const hash = await bcrypt.hash(password, 10);
    const confirmToken = crypto.randomBytes(32).toString('hex');
    const confirmExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await client.query(
      `INSERT INTO users (company_id, username, password_hash, full_name, first_name, middle_name, last_name, role, email,
        email_confirmed, email_confirm_token, email_confirm_token_expires)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'admin',$8,false,$9,$10)
       RETURNING id, username, full_name, role, company_id, email`,
      [companyId, username, hash, full_name, first_name||null, middle_name||null, last_name||null, email, confirmToken, confirmExpires]
    );

    // Send confirmation email — COMMIT only after success so email failure rolls back the account
    const confirmUrl = `${process.env.APP_URL}/confirm-email?token=${confirmToken}`;
    await sgMail.send({
      from: { name: 'OpsFloa', email: process.env.SENDGRID_FROM_EMAIL },
      to: email,
      subject: 'Confirm your OpsFloa email',
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="color:#1a56db;margin-bottom:8px">Confirm your email</h2>
          <p style="color:#444;margin-bottom:24px">Hi ${full_name}, click below to confirm your email and activate your OpsFloa account.</p>
          <a href="${confirmUrl}" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">Confirm email</a>
          <p style="color:#999;font-size:13px;margin-top:24px">This link expires in 24 hours.</p>
        </div>
      `,
    });

    await client.query('COMMIT');
    res.status(201).json({ pending_confirmation: true, email });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Username already taken at this company' });
    if (err.response) {
      console.error('Confirmation email failed — account not created:', err.response.body);
      return res.status(500).json({ error: 'Failed to send confirmation email. Please check your email address and try again.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Confirm email
router.post('/confirm-email', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email_confirm_token = $1 AND email_confirm_token_expires > NOW()',
      [token]
    );
    if (result.rowCount === 0) return res.status(400).json({ error: 'Confirmation link is invalid or has expired' });
    const user = result.rows[0];
    await pool.query(
      'UPDATE users SET email_confirmed = true, email_confirm_token = NULL, email_confirm_token_expires = NULL WHERE id = $1',
      [user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Complete setup — worker sets a permanent password after first login
router.post('/complete-setup', async (req, res) => {
  const { setup_token, new_password } = req.body;
  if (!setup_token || !new_password) return res.status(400).json({ error: 'setup_token and new_password required' });
  let payload;
  try {
    payload = jwt.verify(setup_token, process.env.JWT_SECRET);
  } catch {
    return res.status(400).json({ error: 'Setup session expired. Please sign in again.' });
  }
  if (!payload.setup_pending) return res.status(400).json({ error: 'Invalid setup token' });
  const pwErr = validatePassword(new_password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  try {
    const userRes = await pool.query(
      `SELECT u.*, c.name as company_name FROM users u
       JOIN companies c ON c.id = u.company_id
       WHERE u.id = $1 AND u.active = true`,
      [payload.id]
    );
    const user = userRes.rows[0];
    if (!user) return res.status(400).json({ error: 'User not found' });
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
      [hash, user.id]
    );
    const token = signToken(user);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name, language: user.language, company_id: user.company_id, company_name: user.company_name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Resend confirmation email
router.post('/resend-confirmation', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND email_confirmed = false AND active = true',
      [email]
    );
    if (result.rowCount === 0) return res.json({ success: true }); // don't leak whether email exists
    const user = result.rows[0];
    const confirmToken = crypto.randomBytes(32).toString('hex');
    const confirmExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await pool.query(
      'UPDATE users SET email_confirm_token = $1, email_confirm_token_expires = $2 WHERE id = $3',
      [confirmToken, confirmExpires, user.id]
    );
    const confirmUrl = `${process.env.APP_URL}/confirm-email?token=${confirmToken}`;
    try {
      await sgMail.send({
        from: { name: 'OpsFloa', email: process.env.SENDGRID_FROM_EMAIL },
        to: email,
        subject: 'Confirm your OpsFloa email',
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
            <h2 style="color:#1a56db;margin-bottom:8px">Confirm your email</h2>
            <p style="color:#444;margin-bottom:24px">Hi ${user.full_name}, here's a fresh confirmation link.</p>
            <a href="${confirmUrl}" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">Confirm email</a>
            <p style="color:#999;font-size:13px;margin-top:24px">This link expires in 24 hours.</p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error('Resend confirmation email failed:', emailErr?.response?.body || emailErr.message);
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Forgot password — sends reset email
router.post('/forgot-password', authLimiter, async (req, res) => {
  const { email, company } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    let result;
    if (company && company.trim()) {
      result = await pool.query(
        `SELECT u.* FROM users u
         JOIN companies c ON c.id = u.company_id
         WHERE u.email = $1 AND LOWER(c.name) = LOWER($2) AND u.active = true
         LIMIT 1`,
        [email, company.trim()]
      );
    } else {
      result = await pool.query(
        'SELECT * FROM users WHERE email = $1 AND active = true LIMIT 1',
        [email]
      );
    }
    // Always return success to avoid leaking whether the email exists
    if (result.rowCount === 0) return res.json({ success: true });

    const user = result.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [token, expires, user.id]
    );

    const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`;

    await sgMail.send({
      from: { name: 'OpsFloa', email: process.env.SENDGRID_FROM_EMAIL },
      to: email,
      subject: 'Reset your OpsFloa password',
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="color:#1a56db;margin-bottom:8px">Reset your password</h2>
          <p style="color:#444;margin-bottom:24px">Hi ${user.full_name}, click the button below to reset your password. This link expires in 1 hour.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">Reset password</a>
          <p style="color:#999;font-size:13px;margin-top:24px">If you didn't request this, you can ignore this email.</p>
          <p style="color:#ccc;font-size:12px;margin-top:4px">${resetUrl}</p>
        </div>
      `,
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset password — validates token, sets new password
router.post('/reset-password', authLimiter, async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'token and password required' });
  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );
    if (result.rowCount === 0) return res.status(400).json({ error: 'Reset link is invalid or has expired' });

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [hash, result.rows[0].id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Accept invite — set password from invite link
router.post('/accept-invite', authLimiter, async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'token and password required' });
  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  try {
    const result = await pool.query(
      `SELECT u.*, c.name as company_name FROM users u
       JOIN companies c ON c.id = u.company_id
       WHERE u.invite_token = $1 AND u.invite_token_expires > NOW() AND u.invite_pending = true`,
      [token]
    );
    if (result.rowCount === 0) return res.status(400).json({ error: 'Invite link is invalid or has expired' });
    const user = result.rows[0];
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1, invite_token = NULL, invite_token_expires = NULL, invite_pending = false, email_confirmed = true, must_change_password = false WHERE id = $2',
      [hash, user.id]
    );
    res.json({ success: true, username: user.username, company_name: user.company_name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Change password
router.post('/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password required' });
  }
  const pwErr = validatePassword(new_password, req.user.username);
  if (pwErr) return res.status(400).json({ error: pwErr });
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!(await bcrypt.compare(current_password, user.password_hash))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// MFA: complete login after TOTP verification
router.post('/mfa/confirm', loginLimiter, async (req, res) => {
  const { mfa_token, code } = req.body;
  if (!mfa_token || !code) return res.status(400).json({ error: 'mfa_token and code required' });
  try {
    let payload;
    try {
      payload = jwt.verify(mfa_token, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ error: 'MFA session expired. Please sign in again.' });
    }
    if (!payload.mfa_pending) return res.status(400).json({ error: 'Invalid MFA token' });

    const result = await pool.query(
      `SELECT u.*, c.name as company_name FROM users u
       JOIN companies c ON c.id = u.company_id
       WHERE u.id = $1 AND u.active = true`,
      [payload.id]
    );
    const user = result.rows[0];
    if (!user || !user.mfa_secret) return res.status(400).json({ error: 'MFA not configured' });

    const valid = speakeasy.totp.verify({ secret: user.mfa_secret, encoding: 'base32', token: code, window: 1 });
    if (!valid) return res.status(401).json({ error: 'Invalid code. Try again.' });

    const token = signToken(user);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name, language: user.language, company_id: user.company_id, company_name: user.company_name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// MFA: generate setup QR code
router.get('/mfa/setup', requireAuth, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({ name: `OpsFloa (${req.user.username})`, length: 20 });
    await pool.query('UPDATE users SET mfa_secret_pending = $1 WHERE id = $2', [secret.base32, req.user.id]);
    const qr = await qrcode.toDataURL(secret.otpauth_url);
    res.json({ qr, secret: secret.base32 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// MFA: verify first code and enable
router.post('/mfa/enable', requireAuth, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code required' });
  try {
    const result = await pool.query('SELECT mfa_secret_pending FROM users WHERE id = $1', [req.user.id]);
    const secret = result.rows[0]?.mfa_secret_pending;
    if (!secret) return res.status(400).json({ error: 'No pending MFA setup. Start setup again.' });

    const valid = speakeasy.totp.verify({ secret, encoding: 'base32', token: code, window: 1 });
    if (!valid) return res.status(401).json({ error: 'Invalid code. Try again.' });

    await pool.query(
      'UPDATE users SET mfa_secret = $1, mfa_secret_pending = NULL, mfa_enabled = true WHERE id = $2',
      [secret, req.user.id]
    );
    res.json({ enabled: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// MFA: disable with password confirmation
router.post('/mfa/disable', requireAuth, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'password required' });
  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await bcrypt.compare(password, result.rows[0].password_hash))) {
      return res.status(401).json({ error: 'Incorrect password' });
    }
    await pool.query(
      'UPDATE users SET mfa_secret = NULL, mfa_secret_pending = NULL, mfa_enabled = false WHERE id = $1',
      [req.user.id]
    );
    res.json({ disabled: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update language
router.post('/update-language', requireAuth, async (req, res) => {
  const { language } = req.body;
  if (!language) return res.status(400).json({ error: 'language required' });
  try {
    await pool.query('UPDATE users SET language = $1 WHERE id = $2', [language, req.user.id]);
    res.json({ success: true, language });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
