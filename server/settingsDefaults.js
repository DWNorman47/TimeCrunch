const FEATURE_KEYS = ['feature_scheduling', 'feature_analytics', 'feature_chat', 'feature_prevailing_wage', 'feature_reimbursements', 'feature_pto', 'module_field', 'module_timeclock', 'module_projects', 'module_inventory', 'module_analytics', 'feature_project_integration', 'feature_overtime', 'feature_geolocation', 'feature_inactive_alerts', 'feature_overtime_alerts', 'feature_broadcast', 'feature_media_gallery', 'show_worker_wages', 'notification_use_work_hours', 'media_delete_on_project_archive', 'notify_timeoff_requests', 'notify_budget_alerts', 'notify_entry_submitted', 'report_weekly_payroll', 'report_weekly_low_stock', 'report_monthly_valuation', 'qbo_auto_push', 'qbo_auto_push_expenses', 'qbo_auto_create_customers', 'notify_qbo_disconnect'];
const STRING_KEYS = ['overtime_rule', 'currency', 'company_timezone', 'invoice_signature', 'default_temp_password', 'global_required_checklist_template_id', 'cycle_count_reconcile_threshold_type', 'qbo_expense_account_id', 'qbo_bank_account_id', 'qbo_labor_item_id'];

// Defaults available to all authenticated users
const SETTINGS_DEFAULTS = {
  prevailing_wage_rate: 45, default_hourly_rate: 30, overtime_multiplier: 1.5,
  overtime_rule: 'daily', overtime_threshold: 8,
  feature_scheduling: true, feature_analytics: true, feature_chat: true, feature_prevailing_wage: true, feature_reimbursements: true, feature_pto: true, module_field: false, module_timeclock: true, module_projects: true, module_inventory: true, module_analytics: true, feature_project_integration: true, feature_overtime: true, feature_geolocation: true, feature_inactive_alerts: true, feature_overtime_alerts: true, feature_broadcast: true, feature_media_gallery: false,
  show_worker_wages: false, notification_use_work_hours: true, media_delete_on_project_archive: false,
  notify_timeoff_requests: false, notify_budget_alerts: false, notify_entry_submitted: false,
  report_weekly_payroll: false, report_weekly_low_stock: false, report_monthly_valuation: false,
  qbo_auto_push: false, qbo_auto_push_expenses: false, qbo_auto_create_customers: false, notify_qbo_disconnect: false,
  media_retention_days: 0,
  currency: 'USD', invoice_signature: 'optional', default_temp_password: '', global_required_checklist_template_id: '',
};

// Admin-only defaults (superset of SETTINGS_DEFAULTS)
const ADMIN_SETTINGS_DEFAULTS = {
  ...SETTINGS_DEFAULTS,
  notification_inactive_days: 3, notification_start_hour: 6, notification_end_hour: 20,
  notification_use_work_hours: true,
  shift_reminder_hour: 7,
  chat_retention_days: 3,
  company_timezone: '',
  pto_annual_days: 0,
  cycle_count_audit_pct: 15,
  cycle_count_reconcile_threshold: 0,
  cycle_count_reconcile_threshold_type: 'units',
  qbo_labor_item_id: '',
  qbo_bill_terms_days: 0,
};

function applySettingsRows(rows, defaults) {
  const s = { ...defaults };
  rows.forEach(r => {
    if (STRING_KEYS.includes(r.key)) s[r.key] = r.value;
    else if (FEATURE_KEYS.includes(r.key)) s[r.key] = r.value === '1';
    else s[r.key] = parseFloat(r.value);
  });
  return s;
}

module.exports = { FEATURE_KEYS, STRING_KEYS, SETTINGS_DEFAULTS, ADMIN_SETTINGS_DEFAULTS, applySettingsRows };
