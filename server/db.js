const { Pool } = require('pg');
require('dotenv').config();

// Strip sslmode= from the connection string. Hosts like Neon and Render
// include `?sslmode=require` in the URL they hand out; pg-connection-string
// 2.x prints a deprecation warning whenever it sees one of the legacy modes
// (prefer / require / verify-ca) because it will treat them as verify-full
// in v3. We pass `ssl` explicitly below, so the URL hint is redundant.
const { stripSslMode } = require('./utils/dbConnString');

const pool = new Pool({
  connectionString: stripSslMode(process.env.DATABASE_URL),
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,                    // max concurrent connections (default is 10)
  idleTimeoutMillis: 30000,   // close idle connections after 30s
  connectionTimeoutMillis: 3000, // fail fast if no connection available within 3s
});

module.exports = pool;
