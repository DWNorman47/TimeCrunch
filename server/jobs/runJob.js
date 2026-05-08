const logger = require('../logger');
const Sentry = require('@sentry/node');

const RETRYABLE_DB_ERROR_PATTERNS = [
  /Connection terminated/i,
  /Connection terminated unexpectedly/i,
  /timeout/i,
];

function isRetryableDbError(err) {
  if (!err) return false;
  if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', '57P01', '57P02', '57P03'].includes(err.code)) return true;
  const message = `${err.message || ''} ${err.cause?.message || ''}`;
  return RETRYABLE_DB_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wraps an async job function so that any uncaught error is:
 *   - Logged to pino (structured, with job name)
 *   - Forwarded to Sentry (when DSN is set)
 *   - Prevented from propagating back to node-cron / setInterval, which
 *     would otherwise swallow it silently and possibly stop the schedule.
 *
 * Also logs a structured 'job.start' / 'job.done' pair with duration.
 *
 * Usage:
 *   cron.schedule('0 8 * * *', () => runJob('inactiveWorkers', checkInactiveWorkers));
 */
async function runJob(name, fn) {
  const start = Date.now();
  logger.debug({ job: name }, 'job.start');
  try {
    try {
      await fn();
    } catch (err) {
      if (!isRetryableDbError(err)) throw err;
      logger.warn({ err, job: name }, 'job.retry');
      await wait(Number(process.env.JOB_RETRY_DELAY_MS) || 2000);
      await fn();
    }
    logger.info({ job: name, duration_ms: Date.now() - start }, 'job.done');
  } catch (err) {
    logger.error({ err, job: name, duration_ms: Date.now() - start }, 'job.failed');
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(err, { tags: { job: name } });
    }
  }
}

module.exports = { runJob };
