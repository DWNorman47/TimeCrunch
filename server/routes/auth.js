const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
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

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, full_name: user.full_name, language: user.language, company_id: user.company_id, company_name: user.company_name },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
}

// Login
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password, company_name } = req.body;
  if (!username || !password || !company_name) {
    return res.status(400).json({ error: 'Company name, username, and password required' });
  }
  try {
    const result = await pool.query(
      `SELECT u.*, c.name as company_name FROM users u
       JOIN companies c ON c.id = u.company_id
       WHERE u.username = $1 AND u.active = true AND LOWER(c.name) = LOWER($2)`,
      [username, company_name]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!user.email_confirmed) {
      return res.status(403).json({ error: 'email_not_confirmed', email: user.email });
    }
    const token = signToken(user);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name, language: user.language, company_id: user.company_id, company_name: user.company_name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Register — creates a new company and its first admin user
router.post('/register', authLimiter, async (req, res) => {
  const { full_name, first_name, middle_name, last_name, username, password, email } = req.body;
  const company_name = req.body.company_name?.trim();
  if (!company_name || !full_name || !username || !password || !email) {
    return res.status(400).json({ error: 'company_name, full_name, email, username, and password are required' });
  }
  if (company_name.length > 100) return res.status(400).json({ error: 'Company name must be 100 characters or fewer' });
  if (full_name.length > 100) return res.status(400).json({ error: 'Full name must be 100 characters or fewer' });
  if (username.length > 50) return res.status(400).json({ error: 'Username must be 50 characters or fewer' });
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
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
      `INSERT INTO companies (name, slug, subscription_status, trial_ends_at)
       VALUES ($1, $2, 'trial', NOW() + ($3 || ' days')::INTERVAL) RETURNING id`,
      [company_name, slug, trialDays]
    );
    const companyId = companyResult.rows[0].id;
    const defaults = [['prevailing_wage_rate', 45], ['default_hourly_rate', 30], ['overtime_multiplier', 1.5]];
    for (const [key, value] of defaults) {
      await client.query('INSERT INTO settings (company_id, key, value) VALUES ($1, $2, $3)', [companyId, key, value]);
    }
    const hash = await bcrypt.hash(password, 10);
    const confirmToken = crypto.randomBytes(32).toString('hex');
    const confirmExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const userResult = await client.query(
      `INSERT INTO users (company_id, username, password_hash, full_name, first_name, middle_name, last_name, role, email,
        email_confirmed, email_confirm_token, email_confirm_token_expires)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'admin',$8,false,$9,$10)
       RETURNING id, username, full_name, role, company_id, email`,
      [companyId, username, hash, full_name, first_name||null, middle_name||null, last_name||null, email, confirmToken, confirmExpires]
    );
    await client.query('COMMIT');

    const confirmUrl = `${process.env.APP_URL}/confirm-email?token=${confirmToken}`;
    await sgMail.send({
      from: { name: 'Time Crunch', email: process.env.SENDGRID_FROM_EMAIL },
      to: email,
      subject: 'Confirm your Time Crunch email',
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="color:#1a56db;margin-bottom:8px">Confirm your email</h2>
          <p style="color:#444;margin-bottom:24px">Hi ${full_name}, click below to confirm your email and activate your Time Crunch account.</p>
          <a href="${confirmUrl}" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">Confirm email</a>
          <p style="color:#999;font-size:13px;margin-top:24px">This link expires in 24 hours.</p>
        </div>
      `,
    });

    res.status(201).json({ pending_confirmation: true, email });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Username already taken at this company' });
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
    await sgMail.send({
      from: { name: 'Time Crunch', email: process.env.SENDGRID_FROM_EMAIL },
      to: email,
      subject: 'Confirm your Time Crunch email',
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="color:#1a56db;margin-bottom:8px">Confirm your email</h2>
          <p style="color:#444;margin-bottom:24px">Hi ${user.full_name}, here's a fresh confirmation link.</p>
          <a href="${confirmUrl}" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">Confirm email</a>
          <p style="color:#999;font-size:13px;margin-top:24px">This link expires in 24 hours.</p>
        </div>
      `,
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Forgot password — sends reset email
router.post('/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1 AND active = true', [email]);
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
      from: { name: 'Time Crunch', email: process.env.SENDGRID_FROM_EMAIL },
      to: email,
      subject: 'Reset your Time Crunch password',
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
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
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
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE invite_token = $1 AND invite_token_expires > NOW() AND invite_pending = true',
      [token]
    );
    if (result.rowCount === 0) return res.status(400).json({ error: 'Invite link is invalid or has expired' });
    const user = result.rows[0];
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1, invite_token = NULL, invite_token_expires = NULL, invite_pending = false, email_confirmed = true WHERE id = $2',
      [hash, user.id]
    );
    res.json({ success: true, username: user.username });
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
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
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
