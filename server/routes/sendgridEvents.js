const express = require('express');
const pool = require('../db');
const logger = require('../logger');

const router = express.Router();

// SendGrid event types we care about (email is likely broken after these)
// See https://docs.sendgrid.com/for-developers/tracking-events/event
const BAD_EVENT_TYPES = new Set([
  'bounce',      // Hard bounce — mailbox doesn't exist / rejected
  'blocked',    // Receiving server refused (not necessarily permanent but treat as bad)
  'dropped',     // We didn't even attempt send (invalid/unsubscribed/prior bounce)
  'spamreport',  // Recipient marked as spam — stop sending to them
]);

/**
 * POST /api/sendgrid-events/:secret
 *
 * SendGrid event webhook. Configure in SendGrid dashboard:
 *   Settings → Mail Settings → Event Webhook
 *   POST URL: https://<server>/api/sendgrid-events/<SENDGRID_WEBHOOK_SECRET>
 *   Select: Bounced, Dropped, Spam Reports
 *
 * Auth is a shared secret in the URL path. Not ECDSA signature verification
 * (which SendGrid supports via the Signed Event Webhook toggle), but the
 * blast radius of a forged request is limited: the worst an attacker can do
 * is mark email addresses as bounced, which just causes us to stop emailing
 * them. No data exfiltration or destructive action is possible. Can be
 * tightened to signature verification later by flipping the Signed Event
 * Webhook toggle in SendGrid and swapping this to @sendgrid/eventwebhook.
 */
router.post('/:secret', async (req, res) => {
  const expected = process.env.SENDGRID_WEBHOOK_SECRET;
  if (!expected) {
    logger.warn('sendgrid-events received but SENDGRID_WEBHOOK_SECRET is not set');
    return res.status(503).json({ error: 'Webhook not configured' });
  }
  // Constant-time compare so attackers can't learn the secret via timing.
  const provided = req.params.secret || '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !require('crypto').timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const events = Array.isArray(req.body) ? req.body : [];
  let marked = 0;

  for (const e of events) {
    if (!BAD_EVENT_TYPES.has(e.event)) continue;
    const email = (e.email || '').trim().toLowerCase();
    if (!email) continue;
    try {
      const reason = `${e.event}${e.reason ? ': ' + e.reason : ''}`.slice(0, 255);
      const result = await pool.query(
        `UPDATE users SET email_bounced_at = NOW(), email_bounce_reason = $1
         WHERE LOWER(email) = $2 AND email_bounced_at IS NULL
         RETURNING id, company_id`,
        [reason, email]
      );
      if (result.rowCount > 0) {
        marked++;
        logger.info({ email, event: e.event, userId: result.rows[0].id }, 'user email marked as bounced');
      }
    } catch (err) {
      logger.error({ err, email, event: e.event }, 'failed to process sendgrid event');
    }
  }

  // SendGrid expects a 2xx response or it will retry. Don't send failure
  // even if individual rows failed — the individual errors are logged.
  res.status(200).json({ received: events.length, marked });
});

module.exports = router;
