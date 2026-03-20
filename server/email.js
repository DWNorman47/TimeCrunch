const sgMail = require('@sendgrid/mail');

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM = process.env.EMAIL_FROM || 'info@opsfloa.com';

async function sendEmail(to, subject, html) {
  if (!process.env.SENDGRID_API_KEY || !to) return;
  try {
    await sgMail.send({ to, from: FROM, subject, html });
  } catch (err) {
    console.error('Email send error:', err?.response?.body || err.message);
  }
}

module.exports = { sendEmail };
