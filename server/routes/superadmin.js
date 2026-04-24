const router = require('express').Router();
const pool = require('../db');
const logger = require('../logger');
const jwt = require('jsonwebtoken');
const { requireSuperAdmin } = require('../middleware/auth');

// GET /superadmin/client-errors — browser-reported errors, newest first
router.get('/client-errors', requireSuperAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const since = req.query.since; // ISO date string, optional
    const params = [];
    let where = '';
    if (since) {
      params.push(since);
      where = `WHERE ce.created_at >= $${params.length}`;
    }
    params.push(limit);
    const { rows } = await pool.query(
      `SELECT ce.id, ce.created_at, ce.company_id, ce.user_id, ce.kind, ce.message,
              ce.stack, ce.url, ce.user_agent, ce.app_version, ce.ip,
              u.full_name AS user_name, c.name AS company_name
       FROM client_errors ce
       LEFT JOIN users u ON u.id = ce.user_id
       LEFT JOIN companies c ON c.id = ce.company_id
       ${where}
       ORDER BY ce.created_at DESC
       LIMIT $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /superadmin/companies — all companies with usage stats
router.get('/companies', requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.slug, c.active, c.created_at, c.plan, c.subscription_status,
              c.trial_ends_at, c.mrr_cents, c.affiliate_id, c.addon_qbo, c.addon_certified_payroll,
              a.name AS affiliate_name,
              COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'worker' AND u.active = true) AS worker_count,
              COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'admin' AND u.active = true) AS admin_count,
              COUNT(DISTINCT te.id) AS entry_count,
              MAX(te.created_at) AS last_entry_at
       FROM companies c
       LEFT JOIN users u ON u.company_id = c.id
       LEFT JOIN time_entries te ON te.company_id = c.id
       LEFT JOIN affiliates a ON c.affiliate_id = a.id
       GROUP BY c.id, c.name, c.slug, c.active, c.created_at, c.plan, c.subscription_status,
                c.trial_ends_at, c.mrr_cents, c.affiliate_id, c.addon_qbo, c.addon_certified_payroll, a.name
       ORDER BY c.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /superadmin/companies/:id — update any combination of fields
router.patch('/companies/:id', requireSuperAdmin, async (req, res) => {
  const { active, affiliate_id, subscription_status, plan, name, trial_ends_at, addon_qbo, addon_certified_payroll } = req.body;
  if (
    active === undefined && affiliate_id === undefined &&
    subscription_status === undefined && plan === undefined &&
    name === undefined && trial_ends_at === undefined &&
    addon_qbo === undefined && addon_certified_payroll === undefined
  ) return res.status(400).json({ error: 'No fields to update' });

  const VALID_STATUSES = ['trial', 'active', 'past_due', 'canceled', 'trial_expired', 'exempt'];
  const VALID_PLANS = ['free', 'starter', 'business'];
  if (subscription_status !== undefined && !VALID_STATUSES.includes(subscription_status))
    return res.status(400).json({ error: 'Invalid subscription_status' });
  if (plan !== undefined && !VALID_PLANS.includes(plan))
    return res.status(400).json({ error: 'Invalid plan' });
  if (name !== undefined && !name?.trim())
    return res.status(400).json({ error: 'Name cannot be empty' });

  try {
    const fields = [];
    const values = [];
    let idx = 1;
    if (active !== undefined)              { fields.push(`active = $${idx++}`);               values.push(active); }
    if (affiliate_id !== undefined)        { fields.push(`affiliate_id = $${idx++}`);         values.push(affiliate_id || null); }
    if (subscription_status !== undefined) { fields.push(`subscription_status = $${idx++}`);  values.push(subscription_status); }
    if (plan !== undefined)                { fields.push(`plan = $${idx++}`);                 values.push(plan); }
    if (name !== undefined)                { fields.push(`name = $${idx++}`);                 values.push(name.trim()); }
    if (trial_ends_at !== undefined)       { fields.push(`trial_ends_at = $${idx++}`);        values.push(trial_ends_at || null); }
    if (addon_qbo !== undefined)           { fields.push(`addon_qbo = $${idx++}`);            values.push(!!addon_qbo); }
    if (addon_certified_payroll !== undefined) { fields.push(`addon_certified_payroll = $${idx++}`); values.push(!!addon_certified_payroll); }
    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE companies SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, name, slug, active, affiliate_id, subscription_status, plan, trial_ends_at, addon_qbo, addon_certified_payroll`,
      values
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Company not found' });
    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /superadmin/companies/:id — hard delete all company data in a transaction.
// Also collects R2 media URLs and deletes them from object storage after the
// DB commit succeeds, so a rolled-back transaction never leaves the bucket
// missing files that are still referenced.
//
// Note: this does NOT cancel Stripe subscriptions automatically. If the company
// has an active subscription, deleting the row here would leave Stripe charging
// a card for a company that no longer exists. The handler refuses to delete
// in that case; the super_admin must cancel the subscription (or mark the
// company canceled) before proceeding.
router.delete('/companies/:id', requireSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const check = await pool.query(
    'SELECT name, stripe_subscription_id, subscription_status FROM companies WHERE id = $1',
    [id]
  );
  if (check.rowCount === 0) return res.status(404).json({ error: 'Company not found' });
  const company = check.rows[0];
  if (company.stripe_subscription_id && company.subscription_status !== 'canceled') {
    return res.status(409).json({
      error: 'Cancel the Stripe subscription (or set subscription_status to canceled) before deleting this company.',
      stripe_subscription_id: company.stripe_subscription_id,
    });
  }

  const client = await pool.connect();
  let mediaUrls = [];
  try {
    await client.query('BEGIN');

    // ── Collect R2 URLs before we drop the rows that point to them.
    // Fire deletes against R2 only after the DB commit succeeds.

    // Scalar URL columns
    const scalarUrlQueries = [
      `SELECT url FROM field_report_photos WHERE report_id IN (SELECT id FROM field_reports WHERE company_id = $1) AND url IS NOT NULL`,
      `SELECT receipt_url AS url FROM reimbursements WHERE company_id = $1 AND receipt_url IS NOT NULL`,
      `SELECT url FROM worker_documents   WHERE company_id = $1 AND url IS NOT NULL`,
      `SELECT url FROM project_documents  WHERE company_id = $1 AND url IS NOT NULL`,
      `SELECT url FROM client_documents   WHERE company_id = $1 AND url IS NOT NULL`,
      `SELECT url FROM safety_talk_attachments WHERE talk_id IN (SELECT id FROM safety_talks WHERE company_id = $1) AND url IS NOT NULL`,
    ];
    // Wrap each optional query in a savepoint. Without it, a single
    // failing query (e.g. a table that doesn't exist on this deployment
    // or a schema mismatch) poisons the whole transaction with Postgres
    // 25P02 "current transaction is aborted, commands ignored until end
    // of transaction block" — every subsequent DELETE then fails too.
    // Savepoints let us roll back just the failing read without losing
    // the outer transaction.
    for (const q of scalarUrlQueries) {
      await client.query('SAVEPOINT sp_url');
      try {
        const r = await client.query(q, [id]);
        for (const row of r.rows) if (row.url) mediaUrls.push(row.url);
        await client.query('RELEASE SAVEPOINT sp_url');
      } catch {
        await client.query('ROLLBACK TO SAVEPOINT sp_url');
      }
    }

    // JSONB array columns — photo_urls is a JSONB array of strings. Use
    // jsonb_array_elements_text to flatten and union across all tables.
    const jsonbArrayQueries = [
      `SELECT jsonb_array_elements_text(photo_urls) AS url FROM inventory_locations   WHERE company_id = $1 AND jsonb_array_length(photo_urls) > 0`,
      `SELECT jsonb_array_elements_text(photo_urls) AS url FROM inventory_areas       WHERE company_id = $1 AND jsonb_array_length(photo_urls) > 0`,
      `SELECT jsonb_array_elements_text(photo_urls) AS url FROM inventory_racks       WHERE company_id = $1 AND jsonb_array_length(photo_urls) > 0`,
      `SELECT jsonb_array_elements_text(photo_urls) AS url FROM inventory_bays        WHERE company_id = $1 AND jsonb_array_length(photo_urls) > 0`,
      `SELECT jsonb_array_elements_text(photo_urls) AS url FROM inventory_compartments WHERE company_id = $1 AND jsonb_array_length(photo_urls) > 0`,
      `SELECT jsonb_array_elements_text(photo_urls) AS url FROM service_requests     WHERE company_id = $1 AND jsonb_array_length(photo_urls) > 0`,
    ];
    for (const q of jsonbArrayQueries) {
      await client.query('SAVEPOINT sp_url');
      try {
        const r = await client.query(q, [id]);
        for (const row of r.rows) if (row.url) mediaUrls.push(row.url);
        await client.query('RELEASE SAVEPOINT sp_url');
      } catch {
        await client.query('ROLLBACK TO SAVEPOINT sp_url');
      }
    }

    // ── Leaf tables (children of things we're about to delete) ──────────────
    await client.query(`DELETE FROM field_report_photos WHERE report_id IN (SELECT id FROM field_reports WHERE company_id = $1)`, [id]);
    await client.query(`DELETE FROM entry_messages              WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM equipment_hours             WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM company_chat                WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM incident_reports            WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM sub_reports                 WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM rfis                        WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM inspections                 WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM inspection_templates        WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM safety_checklist_submissions WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM safety_checklist_templates  WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM field_reports               WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM daily_reports               WHERE company_id = $1`, [id]); // cascades report_manpower/equipment/materials
    await client.query(`DELETE FROM punchlist_items             WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM safety_talks                WHERE company_id = $1`, [id]); // cascades signoffs/attachments/quiz

    // ── Timekeeping ─────────────────────────────────────────────────────────
    await client.query(`DELETE FROM time_entries                WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM active_clock                WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM pay_periods                 WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM shifts                      WHERE company_id = $1`, [id]);

    // ── Worker-level records ────────────────────────────────────────────────
    await client.query(`DELETE FROM worker_documents            WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM worker_availability         WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM worker_fringes              WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM certified_payroll_signatures WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM time_off_requests           WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM reimbursements              WHERE company_id = $1`, [id]);

    // ── Inventory (order matters: transactions & cycle counts reference items/locations via RESTRICT) ──
    await client.query(`DELETE FROM inventory_transactions      WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM inventory_cycle_counts      WHERE company_id = $1`, [id]); // cascades cycle_count_lines + worker assignments
    await client.query(`DELETE FROM purchase_orders             WHERE company_id = $1`, [id]); // cascades purchase_order_lines
    await client.query(`DELETE FROM inventory_items             WHERE company_id = $1`, [id]); // cascades stock, item_uoms
    await client.query(`DELETE FROM inventory_locations         WHERE company_id = $1`, [id]); // cascades areas → racks → bays → compartments
    await client.query(`DELETE FROM inventory_suppliers         WHERE company_id = $1`, [id]);

    // ── Project-level records ───────────────────────────────────────────────
    await client.query(`DELETE FROM project_documents           WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM project_invoices            WHERE company_id = $1`, [id]);

    // ── Support / SaaS surfaces ─────────────────────────────────────────────
    await client.query(`DELETE FROM service_requests            WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM qbo_sync_errors             WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM client_errors               WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM inbox                       WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM push_subscriptions          WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM audit_log                   WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM equipment_items             WHERE company_id = $1`, [id]);

    // impersonation_log has a constraint bug: super_admin_id is NOT NULL
    // REFERENCES users(id) ON DELETE SET NULL, which is contradictory. If
    // any user in this company is referenced as super_admin_id, the
    // DELETE FROM users below would fail. Clear out any rows referencing
    // users in this company — and any rows where this company was the
    // impersonation target — before the user delete fires.
    await client.query(
      `DELETE FROM impersonation_log
        WHERE company_id = $1
           OR super_admin_id IN (SELECT id FROM users WHERE company_id = $1)`,
      [id]
    );

    // ── Base entities ───────────────────────────────────────────────────────
    await client.query(`DELETE FROM clients                     WHERE company_id = $1`, [id]); // cascades client_documents
    await client.query(`DELETE FROM projects                    WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM advanced_settings           WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM settings                    WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM users                       WHERE company_id = $1`, [id]);
    await client.query(`DELETE FROM companies                   WHERE id = $1`, [id]);

    await client.query('COMMIT');

    // After commit: best-effort R2 cleanup. Failures here don't undo the
    // delete — they just leave orphaned blobs the R2 lifecycle can reap later.
    if (mediaUrls.length > 0) {
      const { deleteByUrl } = require('../r2');
      Promise.allSettled(mediaUrls.map(u => deleteByUrl(u))).then(results => {
        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed > 0) {
          logger.warn({ company_id: id, failed, total: mediaUrls.length }, 'r2 cleanup had failures after company delete');
        }
      });
    }

    res.json({ deleted: true, name: company.name, media_files: mediaUrls.length });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// POST /superadmin/companies/:id/impersonate — return a short-lived JWT for a
// user of this company. When { user_id } is provided in the body, impersonate
// that specific user (any role). Otherwise default to the first active admin
// so existing "Login as" buttons keep working.
router.post('/companies/:id/impersonate', requireSuperAdmin, async (req, res) => {
  try {
    const targetUserId = req.body?.user_id ? parseInt(req.body.user_id) : null;
    const r = targetUserId
      ? await pool.query(
          `SELECT u.*, c.name AS company_name
           FROM users u
           JOIN companies c ON c.id = u.company_id
           WHERE u.company_id = $1 AND u.id = $2 AND u.active = true`,
          [req.params.id, targetUserId]
        )
      : await pool.query(
          `SELECT u.*, c.name AS company_name
           FROM users u
           JOIN companies c ON c.id = u.company_id
           WHERE u.company_id = $1 AND u.role IN ('admin','super_admin') AND u.active = true
           ORDER BY u.created_at ASC LIMIT 1`,
          [req.params.id]
        );
    if (r.rowCount === 0) {
      return res.status(404).json({ error: targetUserId ? 'User not found in this company' : 'No active admin found for this company' });
    }
    const user = r.rows[0];
    const token = jwt.sign(
      {
        id: user.id, username: user.username, role: user.role,
        full_name: user.full_name, invoice_name: user.invoice_name || null,
        language: user.language, company_id: user.company_id,
        company_name: user.company_name,
        admin_permissions: user.admin_permissions || null,
        worker_access_ids: null,
        // Include role_id so requirePerm middleware resolves the user's
        // permissions against their assigned role during impersonation.
        // Without this the server falls back to the legacy role-based
        // check and misses any custom-role-only perms the user has.
        role_id: user.role_id ?? null,
      },
      process.env.JWT_SECRET,
      { expiresIn: '4h' }
    );

    // Forensic trail — every "Login as" leaves a row so we can answer
    // "did someone log in as me on that date?" without reconstructing
    // from logs. Never let this fail the request.
    pool.query(
      `INSERT INTO impersonation_log
         (super_admin_id, super_admin_name, target_user_id, target_user_name,
          target_role, company_id, company_name, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [req.user.id, req.user.full_name || req.user.username,
       user.id, user.full_name, user.role,
       user.company_id, user.company_name,
       (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null),
       (req.headers['user-agent'] || null)?.slice(0, 500)]
    ).catch(err => logger.warn({ err }, 'impersonation_log insert failed'));

    res.json({ token, full_name: user.full_name, company_name: user.company_name });
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /superadmin/impersonation-log — recent "Login as" events, newest first
router.get('/impersonation-log', requireSuperAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const { rows } = await pool.query(
      `SELECT id, super_admin_name, target_user_name, target_role,
              company_name, ip, created_at
         FROM impersonation_log
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /superadmin/companies/:id/export — dump every row belonging to this
// company as a single JSON blob. Useful for support investigations and for
// giving churned customers their data back. Same company-rooted tables the
// delete handler targets — kept in sync by structure.
router.get('/companies/:id/export', requireSuperAdmin, async (req, res) => {
  const id = req.params.id;
  const companyRes = await pool.query('SELECT * FROM companies WHERE id = $1', [id]);
  if (companyRes.rowCount === 0) return res.status(404).json({ error: 'Company not found' });

  // Same list as the delete handler. If you add a new company_id table,
  // add it both places. Tables are listed parent-first so the JSON reads
  // in a natural order.
  const tables = [
    'users', 'settings', 'advanced_settings',
    'clients', 'projects', 'shifts', 'pay_periods',
    'time_entries', 'active_clock', 'entry_messages',
    'reimbursements', 'time_off_requests',
    'worker_documents', 'worker_availability', 'worker_fringes',
    'certified_payroll_signatures',
    'equipment_items', 'equipment_hours',
    'field_reports', 'field_report_photos',
    'daily_reports', 'punchlist_items', 'safety_talks',
    'safety_checklist_templates', 'safety_checklist_submissions',
    'incident_reports', 'sub_reports', 'rfis',
    'inspection_templates', 'inspections',
    'inventory_locations', 'inventory_areas', 'inventory_racks', 'inventory_bays', 'inventory_compartments',
    'inventory_items', 'inventory_item_uoms', 'inventory_stock',
    'inventory_transactions', 'inventory_cycle_counts', 'inventory_cycle_count_lines',
    'inventory_suppliers', 'purchase_orders', 'purchase_order_lines',
    'project_documents', 'project_invoices', 'service_requests',
    'audit_log', 'inbox', 'push_subscriptions', 'company_chat',
  ];

  const output = {
    exported_at: new Date().toISOString(),
    company: companyRes.rows[0],
    tables: {},
  };

  try {
    for (const table of tables) {
      try {
        // Most tables have company_id directly. A handful don't — skip them
        // gracefully so a refactor elsewhere doesn't break export.
        const r = await pool.query(`SELECT * FROM ${table} WHERE company_id = $1 ORDER BY id`, [id]);
        output.tables[table] = r.rows;
      } catch (err) {
        // Table might not exist in this environment, or might not have a
        // company_id column. Either way, record an empty result + the error
        // message so the output is still consistent.
        output.tables[table] = { error: err.message };
      }
    }

    // Strip sensitive columns that should never leave the server
    output.tables.users = (output.tables.users || []).map(u => {
      const { password_hash, reset_token, reset_token_expires,
              invite_token, invite_token_expires,
              email_confirm_token, email_confirm_token_expires,
              mfa_secret, ...safe } = u;
      return safe;
    });

    const filename = `opsfloa-company-${id}-${Date.now()}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(output, null, 2));
  } catch (err) {
    logger.error({ err }, 'company export failed');
    res.status(500).json({ error: 'Export failed' });
  }
});

// POST /superadmin/users/:id/revoke-sessions — invalidate every JWT for this
// user by bumping their token_version. Their next API call 401s and they're
// bounced to /login. Useful for "a user lost their device" and similar.
router.post('/users/:id/revoke-sessions', requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE users
          SET token_version = COALESCE(token_version, 0) + 1
        WHERE id = $1
        RETURNING id, username, full_name, token_version`,
      [req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ revoked: true, user: result.rows[0] });
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /superadmin/companies/:id/users — all users for a company
router.get('/companies/:id/users', requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, full_name, email, role, active, created_at
       FROM users WHERE company_id = $1 ORDER BY role, full_name`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Affiliates ──────────────────────────────────────────────────────────────

// GET /superadmin/affiliates — list with commission summary
router.get('/affiliates', requireSuperAdmin, async (req, res) => {
  try {
    const [affiliateRows, companyRows] = await Promise.all([
      pool.query(`
        SELECT a.*,
               COUNT(c.id) AS company_count,
               COALESCE(SUM(c.mrr_cents) FILTER (WHERE c.subscription_status = 'active'), 0) AS active_mrr_cents
        FROM affiliates a
        LEFT JOIN companies c ON c.affiliate_id = a.id
        GROUP BY a.id
        ORDER BY a.name
      `),
      pool.query(`
        SELECT c.id, c.name, c.slug, c.plan, c.subscription_status, c.mrr_cents, c.affiliate_id, c.created_at
        FROM companies c
        WHERE c.affiliate_id IS NOT NULL
        ORDER BY c.created_at DESC
      `),
    ]);
    const companiesByAffiliate = {};
    companyRows.rows.forEach(c => {
      if (!companiesByAffiliate[c.affiliate_id]) companiesByAffiliate[c.affiliate_id] = [];
      companiesByAffiliate[c.affiliate_id].push(c);
    });
    const affiliates = affiliateRows.rows.map(a => ({
      ...a,
      companies: companiesByAffiliate[a.id] || [],
    }));
    res.json(affiliates);
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /superadmin/affiliates
router.post('/affiliates', requireSuperAdmin, async (req, res) => {
  const name  = req.body.name?.trim();
  const email = req.body.email?.trim() || null;
  const phone = req.body.phone?.trim() || null;
  const notes = req.body.notes?.trim() || null;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const result = await pool.query(
      `INSERT INTO affiliates (name, email, phone, notes) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, email, phone, notes]
    );
    res.status(201).json({ ...result.rows[0], company_count: 0, active_mrr_cents: 0, companies: [] });
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /superadmin/affiliates/:id
router.patch('/affiliates/:id', requireSuperAdmin, async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM affiliates WHERE id = $1', [req.params.id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    const a = existing.rows[0];
    const result = await pool.query(
      `UPDATE affiliates SET name=$1, email=$2, phone=$3, notes=$4 WHERE id=$5 RETURNING *`,
      [
        req.body.name !== undefined ? (req.body.name?.trim() || a.name) : a.name,
        req.body.email !== undefined ? (req.body.email?.trim() || null) : a.email,
        req.body.phone !== undefined ? (req.body.phone?.trim() || null) : a.phone,
        req.body.notes !== undefined ? (req.body.notes?.trim() || null) : a.notes,
        req.params.id,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /superadmin/affiliates/:id
router.delete('/affiliates/:id', requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM affiliates WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    logger.error({ err }, 'catch block error');
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;