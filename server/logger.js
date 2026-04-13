// Central pino logger. JSON in production (searchable in Render), pretty in dev.
//
// Usage:
//   const log = require('./logger');
//   log.info({ userId: 42 }, 'clocked in');
//   log.error({ err }, 'failed to save entry');
//
// Every request gets req.log (via pino-http), which is a child logger with
// a unique reqId attached. Prefer req.log inside route handlers so logs can
// be correlated across a single request.

const pino = require('pino');

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  // Drop noisy tokens and secrets if they sneak into logged objects.
  redact: {
    paths: [
      'password',
      'password_hash',
      'token',
      'authorization',
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
    ],
    censor: '[redacted]',
  },
  // Pretty-print in dev so console output is readable; raw JSON in prod
  // so Render's log viewer can index it.
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname,reqId',
        },
      }
    : undefined,
});

module.exports = logger;
