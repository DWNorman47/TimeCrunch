const { Pool } = require('pg');
require('dotenv').config();

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

const pool = new Pool({
  connectionString: stripSslMode(process.env.DATABASE_URL),
  ssl,
  max: 20,                    // max concurrent connections (default is 10)
  idleTimeoutMillis: 30000,   // close idle connections after 30s
  connectionTimeoutMillis: 3000, // fail fast if no connection available within 3s
});

module.exports = pool;
