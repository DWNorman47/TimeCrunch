/**
 * One-time script: backfill storage_bytes_used for all companies
 * by fetching Content-Length for each untracked media URL via HEAD request.
 *
 * Run with: node backfill-storage.js
 * Safe to run multiple times — only processes rows where size_bytes IS NULL.
 */
require('dotenv').config();
const { Pool } = require('pg');
const https = require('https');
const http = require('http');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function headRequest(url) {
  return new Promise(resolve => {
    const mod = url.startsWith('https') ? https : http;
    try {
      const req = mod.request(url, { method: 'HEAD', timeout: 8000 }, res => {
        const len = parseInt(res.headers['content-length'] || '0');
        resolve(len);
      });
      req.on('error', () => resolve(0));
      req.on('timeout', () => { req.destroy(); resolve(0); });
      req.end();
    } catch { resolve(0); }
  });
}

async function run() {
  console.log('[backfill] Starting storage backfill...');

  // ── Field report photos ──────────────────────────────────────────────────
  const photos = await pool.query(
    `SELECT p.id, p.url, r.company_id
     FROM field_report_photos p
     JOIN field_reports r ON p.report_id = r.id
     WHERE p.size_bytes IS NULL AND p.url LIKE 'http%'`
  );
  console.log(`[backfill] ${photos.rows.length} field report photos to process`);

  for (const row of photos.rows) {
    const bytes = await headRequest(row.url);
    if (bytes > 0) {
      await pool.query('UPDATE field_report_photos SET size_bytes = $1 WHERE id = $2', [bytes, row.id]);
    }
    process.stdout.write('.');
  }
  if (photos.rows.length) console.log();

  // ── Safety talk attachments ──────────────────────────────────────────────
  const attachments = await pool.query(
    `SELECT a.id, a.url, t.company_id
     FROM safety_talk_attachments a
     JOIN safety_talks t ON a.talk_id = t.id
     WHERE a.size_bytes IS NULL AND a.url LIKE 'http%'`
  );
  console.log(`[backfill] ${attachments.rows.length} safety talk attachments to process`);

  for (const row of attachments.rows) {
    const bytes = await headRequest(row.url);
    if (bytes > 0) {
      await pool.query('UPDATE safety_talk_attachments SET size_bytes = $1 WHERE id = $2', [bytes, row.id]);
    }
    process.stdout.write('.');
  }
  if (attachments.rows.length) console.log();

  // ── Roll up totals per company ───────────────────────────────────────────
  console.log('[backfill] Rolling up totals per company...');
  const totals = await pool.query(`
    SELECT company_id, SUM(size_bytes) AS total
    FROM (
      SELECT r.company_id, p.size_bytes
      FROM field_report_photos p
      JOIN field_reports r ON p.report_id = r.id
      WHERE p.size_bytes IS NOT NULL
      UNION ALL
      SELECT t.company_id, a.size_bytes
      FROM safety_talk_attachments a
      JOIN safety_talks t ON a.talk_id = t.id
      WHERE a.size_bytes IS NOT NULL
    ) combined
    GROUP BY company_id
  `);

  for (const row of totals.rows) {
    await pool.query(
      'UPDATE companies SET storage_bytes_used = $1 WHERE id = $2',
      [parseInt(row.total), row.company_id]
    );
    console.log(`[backfill] Company ${row.company_id}: ${(row.total / (1024 * 1024)).toFixed(1)} MB`);
  }

  console.log('[backfill] Done.');
  await pool.end();
}

run().catch(err => {
  console.error('[backfill] FAILED:', err.message);
  process.exit(1);
});
