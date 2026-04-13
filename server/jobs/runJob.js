const logger = require('../logger');
const Sentry = require('@sentry/node');

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
    await fn();
    logger.info({ job: name, duration_ms: Date.now() - start }, 'job.done');
  } catch (err) {
    logger.error({ err, job: name, duration_ms: Date.now() - start }, 'job.failed');
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(err, { tags: { job: name } });
    }
  }
}

module.exports = { runJob };
