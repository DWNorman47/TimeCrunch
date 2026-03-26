const cron = require('node-cron');
const pool = require('../db');
const { sendPushToCompanyAdmins } = require('../push');
const { createInboxItem } = require('../routes/inbox');

async function checkEquipmentMaintenance() {
  try {
    // Get all active companies
    const companies = await pool.query(`
      SELECT id, name FROM companies
      WHERE subscription_status IN ('trial', 'active')
    `);

    for (const company of companies.rows) {
      const { id: companyId } = company;

      // Find equipment that has reached or exceeded its maintenance interval
      const overdue = await pool.query(`
        SELECT id, name, total_hours, maintenance_interval_hours
        FROM equipment_items
        WHERE company_id = $1
          AND active = true
          AND maintenance_interval_hours IS NOT NULL
          AND maintenance_interval_hours > 0
          AND total_hours >= maintenance_interval_hours
      `, [companyId]);

      if (overdue.rowCount === 0) continue;

      const count = overdue.rowCount;
      const names = overdue.rows.map(r => r.name).join(', ');
      const alertTitle = `${count} equipment item${count !== 1 ? 's' : ''} due for maintenance`;
      const alertBody = `${names} ${count !== 1 ? 'have' : 'has'} reached the maintenance interval`;

      await sendPushToCompanyAdmins(companyId, {
        title: alertTitle,
        body: alertBody,
        url: '/field#equip',
      });

      const adminRows = await pool.query(
        `SELECT id FROM users WHERE company_id = $1 AND role IN ('admin','super_admin') AND active = true`,
        [companyId]
      );
      for (const a of adminRows.rows) {
        createInboxItem(a.id, companyId, 'equipment_maintenance', alertTitle, alertBody, '/field#equip');
      }
    }
  } catch (err) {
    console.error('Equipment maintenance check error:', err);
  }
}

function startEquipmentMaintenanceJob() {
  // Run at 8 AM server time every day
  cron.schedule('0 8 * * *', checkEquipmentMaintenance);
  console.log('Equipment maintenance alert job scheduled (daily at 8 AM)');
}

module.exports = { startEquipmentMaintenanceJob };
