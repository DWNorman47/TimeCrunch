const { Pool } = require('pg');
require('dotenv').config();
const logger = require('./logger');

// Strip sslmode= from the connection string. Hosts like Neon and Render
// include `?sslmode=require` in the URL they hand out; pg-connection-string
// 2.x prints a deprecation warning whenever it sees one of the legacy modes
// (prefer / require / verify-ca) because it will treat them as verify-full
// in v3. We pass `ssl` explicitly below, so the URL hint is redundant.
const { stripSslMode } = require('./utils/dbConnString');

// Default SSL on — Neon and Render-hosted Postgres both require it, and
// the URL we used to receive carried `?sslmode=require` to express that.
// Stripping sslmode (above) means the SSL signal has to come from this
// option instead. Local Postgres without TLS can opt out via DATABASE_SSL=false.
const ssl = process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false };

function envInt(name, fallback) {
  const value = parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const pool = new Pool({
  connectionString: stripSslMode(process.env.DATABASE_URL),
  ssl,
  max: envInt('PG_POOL_MAX', 10),
  idleTimeoutMillis: envInt('PG_IDLE_TIMEOUT_MS', 30000),
  connectionTimeoutMillis: envInt('PG_CONNECTION_TIMEOUT_MS', 10000),
});

pool.on('error', err => {
  logger.warn({ err }, 'postgres idle client error');
});

module.exports = pool;
