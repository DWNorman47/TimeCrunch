const cron = require('node-cron');
const pool = require('../db');
const { deleteByUrl } = require('../r2');
const { decrementStorage } = require('../storage');
const { applySettingsRows, ADMIN_SETTINGS_DEFAULTS } = require('../settingsDefaults');

async function deleteMediaForProject(companyId, projectId) {
  const photos = await pool.query(
    `SELECT p.id, p.url, p.size_bytes
     FROM field_report_photos p
     JOIN field_reports r ON p.report_id = r.id
     WHERE r.company_id = $1 AND r.project_id = $2`,
    [companyId, projectId]
  );
  if (photos.rowCount === 0) return 0;

  let totalBytes = 0;
  for (const p of photos.rows) {
    await deleteByUrl(p.url).catch(() => {});
    totalBytes += parseInt(p.size_bytes || 0);
  }

  const ids = photos.rows.map(p => p.id);
  await pool.query(`DELETE FROM field_report_photos WHERE id = ANY($1)`, [ids]);
  if (totalBytes > 0) await decrementStorage(companyId, totalBytes).catch(() => {});
  return photos.rowCount;
}

async function runMediaRetention() {
  try {
    const companies = await pool.query(
      `SELECT c.id FROM companies c WHERE c.subscription_status IN ('trial', 'active')`
    );

    for (const { id: companyId } of companies.rows) {
      const settingsRows = await pool.query(
        'SELECT key, value FROM settings WHERE company_id = $1', [companyId]
      );
      const s = applySettingsRows(settingsRows.rows, ADMIN_SETTINGS_DEFAULTS);
      const retentionDays = parseInt(s.media_retention_days) || 0;
      if (retentionDays <= 0) continue;

      // Delete field report photos older than retention_days
      const oldPhotos = await pool.query(
        `SELECT p.id, p.url, p.size_bytes
         FROM field_report_photos p
         JOIN field_reports r ON p.report_id = r.id
         WHERE r.company_id = $1
           AND r.reported_at < NOW() - ($2 || ' days')::interval`,
        [companyId, retentionDays]
      );

      let totalBytes = 0;
      for (const p of oldPhotos.rows) {
        await deleteByUrl(p.url).catch(() => {});
        totalBytes += parseInt(p.size_bytes || 0);
      }
      if (oldPhotos.rowCount > 0) {
        const ids = oldPhotos.rows.map(p => p.id);
        await pool.query(`DELETE FROM field_report_photos WHERE id = ANY($1)`, [ids]);
        if (totalBytes > 0) await decrementStorage(companyId, totalBytes).catch(() => {});
        console.log(`[mediaRetention] Company ${companyId}: deleted ${oldPhotos.rowCount} photos (${(totalBytes / (1024 * 1024)).toFixed(1)} MB)`);
      }

      // Delete safety talk attachments older than retention_days
      const oldAttachments = await pool.query(
        `SELECT a.id, a.url, a.size_bytes
         FROM safety_talk_attachments a
         JOIN safety_talks t ON a.talk_id = t.id
         WHERE t.company_id = $1
           AND a.created_at < NOW() - ($2 || ' days')::interval`,
        [companyId, retentionDays]
      );

      let attBytes = 0;
      for (const a of oldAttachments.rows) {
        await deleteByUrl(a.url).catch(() => {});
        attBytes += parseInt(a.size_bytes || 0);
      }
      if (oldAttachments.rowCount > 0) {
        const ids = oldAttachments.rows.map(a => a.id);
        await pool.query(`DELETE FROM safety_talk_attachments WHERE id = ANY($1)`, [ids]);
        if (attBytes > 0) await decrementStorage(companyId, attBytes).catch(() => {});
        console.log(`[mediaRetention] Company ${companyId}: deleted ${oldAttachments.rowCount} attachments (${(attBytes / (1024 * 1024)).toFixed(1)} MB)`);
      }
    }
  } catch (err) {
    console.error('[mediaRetention] Error:', err.message);
  }
}

function startMediaRetentionJob() {
  cron.schedule('0 2 * * *', runMediaRetention); // 2 AM daily
  console.log('[mediaRetention] Scheduled (daily 2 AM)');
}

module.exports = { startMediaRetentionJob, deleteMediaForProject };
