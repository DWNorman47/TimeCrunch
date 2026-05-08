require('dotenv').config();
const { Pool } = require('pg');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { stripSslMode } = require('./utils/dbConnString');

const ssl = process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false };
const ONE_TIME_DEMO_SEED_MARKER = 'one_time_demo_operations_seed_2026_05_07';

function createPool() {
  return new Pool({
    connectionString: stripSslMode(process.env.DATABASE_URL),
    ssl,
  });
}

function runDemoSeed() {
  const companyName = process.env.DEMO_COMPANY_NAME || 'Demo Operations';
  console.log(`[demo-seed] seeding "${companyName}"`);

  const result = spawnSync(process.execPath, [path.join(__dirname, 'scripts', 'seed-demo-data.js')], {
    cwd: __dirname,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Demo seed failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function shouldRunOneTimeProductionDemoSeed() {
  if (process.env.DEMO_SEED_PRODUCTION_ONCE === 'true') return true;
  if (process.env.DEMO_SEED_PRODUCTION_ONCE === 'false') return false;
  return process.env.VERCEL_ENV === 'production' || process.env.VERCEL_GIT_COMMIT_REF === 'main';
}

async function migrate() {
  const pool = createPool();

  try {
    // Create tracking table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const dir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const { rows } = await pool.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file]
      );
      if (rows.length > 0) {
        console.log(`[migrate] skip    ${file}`);
        continue;
      }

      console.log(`[migrate] apply   ${file}`);
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      await pool.query(sql);
      await pool.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file]
      );
      console.log(`[migrate] done    ${file}`);
    }

    console.log('[migrate] all migrations applied');
  } finally {
    await pool.end();
  }
}

async function seedDemoDataIfEnabled() {
  if (process.env.DEMO_SEED_AUTO !== 'true') return;

  console.log('[demo-seed] auto seed enabled');
  runDemoSeed();
}

async function seedDemoDataOnceForProduction() {
  if (!shouldRunOneTimeProductionDemoSeed()) return;

  const pool = createPool();
  try {
    const { rows } = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [ONE_TIME_DEMO_SEED_MARKER]
    );
    if (rows.length > 0) {
      console.log('[demo-seed] one-time production seed already applied');
      return;
    }

    console.log('[demo-seed] one-time production seed pending');
    runDemoSeed();
    await pool.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1)',
      [ONE_TIME_DEMO_SEED_MARKER]
    );
    console.log('[demo-seed] one-time production seed marked complete');
  } finally {
    await pool.end();
  }
}

async function main() {
  await migrate();
  await seedDemoDataOnceForProduction();
  await seedDemoDataIfEnabled();
}

main().catch(err => {
  console.error('[migrate] FAILED:', err.message);
  process.exit(1);
});
