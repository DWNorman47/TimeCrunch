const sgMail = require('@sendgrid/mail');

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM = process.env.EMAIL_FROM || 'info@opsfloa.com';
const REDIRECT_TO = process.env.EMAIL_REDIRECT_TO || 'info@opsfloa.com';

// EMAIL_MODE controls non-production behaviour:
//   real     — send to the real recipient (used in production automatically)
//   redirect — send to REDIRECT_TO with the original recipient noted in the subject (default for non-prod)
//   suppress — log but do not send; callers behave as if the email succeeded
//
// In production (NODE_ENV=production) EMAIL_MODE is always treated as "real"
// regardless of what is set, so there is no risk of accidentally suppressing
// production email by leaving a staging env var in place.
const isProd = process.env.NODE_ENV === 'production';
const emailMode = isProd ? 'real' : (process.env.EMAIL_MODE || 'redirect');

async function sendEmail(to, subject, html) {
  if (!to) return;

  if (emailMode === 'suppress') {
    console.log(`[EMAIL suppress] To: ${to} | Subject: ${subject}`);
    return;
  }

  if (emailMode === 'redirect') {
    const env = process.env.NODE_ENV || 'development';
    console.log(`[EMAIL redirect] ${env} → Would send to: ${to} | Subject: ${subject}`);
    if (!process.env.SENDGRID_API_KEY) return;
    try {
      await sgMail.send({
        to: REDIRECT_TO,
        from: FROM,
        subject: `[${env.toUpperCase()} → ${to}] ${subject}`,
        html: `
          <div style="background:#fef3c7;border:2px solid #f59e0b;border-radius:8px;padding:16px 20px;margin-bottom:24px;font-family:system-ui,sans-serif">
            <strong style="color:#92400e">Non-production email intercept</strong><br>
            <span style="color:#78350f;font-size:13px">
              Environment: <strong>${env}</strong><br>
              Would have sent to: <strong>${to}</strong><br>
              Subject: <strong>${subject}</strong>
            </span>
          </div>
          ${html}`,
      });
    } catch (err) {
      console.error('Email redirect error:', err?.response?.body || err.message);
    }
    return;
  }

  // emailMode === 'real'
  if (!process.env.SENDGRID_API_KEY) return;
  try {
    await sgMail.send({ to, from: FROM, subject, html });
  } catch (err) {
    console.error('Email send error:', err?.response?.body || err.message);
  }
}

module.exports = { sendEmail };
