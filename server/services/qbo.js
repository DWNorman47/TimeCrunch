const axios = require('axios');
const pool = require('../db');
const { encrypt, decrypt } = require('./encryption');

const IS_PRODUCTION = process.env.QBO_ENVIRONMENT === 'production';
const QBO_BASE = IS_PRODUCTION
  ? 'https://quickbooks.api.intuit.com'
  : 'https://sandbox-quickbooks.api.intuit.com';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';

function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: process.env.QBO_REDIRECT_URI,
    state,
    prompt: 'login',
  });
  return `${AUTH_URL}?${params}`;
}

function basicAuthHeader() {
  return 'Basic ' + Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64');
}

async function exchangeCode(code) {
  const r = await axios.post(TOKEN_URL,
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: process.env.QBO_REDIRECT_URI }),
    { headers: { Authorization: basicAuthHeader(), 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return r.data;
}

async function refreshAccessToken(companyId) {
  const result = await pool.query('SELECT qbo_refresh_token FROM companies WHERE id = $1', [companyId]);
  const refreshToken = decrypt(result.rows[0]?.qbo_refresh_token);
  if (!refreshToken) throw new Error('QuickBooks not connected');

  try {
    const r = await axios.post(TOKEN_URL,
      new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
      { headers: { Authorization: basicAuthHeader(), 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const expiresAt = new Date(Date.now() + r.data.expires_in * 1000);
    await pool.query(
      'UPDATE companies SET qbo_access_token = $1, qbo_refresh_token = $2, qbo_token_expires_at = $3 WHERE id = $4',
      [encrypt(r.data.access_token), encrypt(r.data.refresh_token), expiresAt, companyId]
    );
    return r.data.access_token;
  } catch (err) {
    // Any auth failure from the token endpoint means we can't recover — mark disconnected
    const status = err.response?.status;
    const errorCode = err.response?.data?.error;
    const isAuthFailure = status === 400 && (errorCode === 'invalid_grant' || errorCode === 'Token expired')
      || status === 401
      || status === 403;
    if (isAuthFailure) {
      await pool.query(
        `UPDATE companies
         SET qbo_access_token = NULL, qbo_refresh_token = NULL,
             qbo_token_expires_at = NULL, qbo_disconnected = true
         WHERE id = $1`,
        [companyId]
      );
      const authErr = new Error('QuickBooks authorization expired. Please reconnect your QuickBooks account.');
      authErr.code = 'qbo_auth_expired';
      throw authErr;
    }
    throw err;
  }
}

async function getAccessToken(companyId) {
  const result = await pool.query(
    'SELECT qbo_access_token, qbo_token_expires_at FROM companies WHERE id = $1',
    [companyId]
  );
  const row = result.rows[0];
  if (!row?.qbo_access_token) throw new Error('QuickBooks not connected');
  // Refresh if expiring within 5 minutes
  if (new Date(row.qbo_token_expires_at) < new Date(Date.now() + 5 * 60 * 1000)) {
    return refreshAccessToken(companyId);
  }
  return decrypt(row.qbo_access_token);
}

async function qboGet(companyId, path) {
  const token = await getAccessToken(companyId);
  const realmResult = await pool.query('SELECT qbo_realm_id FROM companies WHERE id = $1', [companyId]);
  const realmId = decrypt(realmResult.rows[0].qbo_realm_id);
  try {
    const r = await axios.get(`${QBO_BASE}/v3/company/${realmId}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const tid = r.headers['intuit_tid'];
    if (tid) console.log(`[QBO] intuit_tid=${tid} path=${path}`);
    return r.data;
  } catch (err) {
    if (err.response?.status === 401 || err.response?.status === 403) {
      await pool.query(
        `UPDATE companies SET qbo_access_token = NULL, qbo_refresh_token = NULL,
         qbo_token_expires_at = NULL, qbo_disconnected = true WHERE id = $1`,
        [companyId]
      );
      const authErr = new Error('QuickBooks authorization expired. Please reconnect your QuickBooks account.');
      authErr.code = 'qbo_auth_expired';
      throw authErr;
    }
    throw err;
  }
}

async function qboPost(companyId, path, body) {
  const token = await getAccessToken(companyId);
  const realmResult = await pool.query('SELECT qbo_realm_id FROM companies WHERE id = $1', [companyId]);
  const realmId = decrypt(realmResult.rows[0].qbo_realm_id);

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await axios.post(`${QBO_BASE}/v3/company/${realmId}${path}`, body, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      });
      const tid = r.headers['intuit_tid'];
      if (tid) console.log(`[QBO] intuit_tid=${tid} path=${path}`);
      return r.data;
    } catch (err) {
      lastErr = err;
      if (err.response?.status === 429) {
        // Respect Retry-After header if present, otherwise exponential backoff
        const retryAfter = parseInt(err.response.headers['retry-after'] || '0', 10);
        const delay = retryAfter > 0 ? retryAfter * 1000 : (attempt + 1) * 2000;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function getCompanyInfo(companyId) {
  const realmResult = await pool.query('SELECT qbo_realm_id FROM companies WHERE id = $1', [companyId]);
  const realmId = decrypt(realmResult.rows[0].qbo_realm_id);
  const data = await qboGet(companyId, `/companyinfo/${realmId}?minorversion=65`);
  return data.CompanyInfo || null;
}

async function listEmployees(companyId) {
  const data = await qboGet(companyId, '/query?query=SELECT * FROM Employee WHERE Active = true MAXRESULTS 1000&minorversion=65');
  return data.QueryResponse?.Employee || [];
}

async function listCustomers(companyId) {
  const data = await qboGet(companyId, '/query?query=SELECT * FROM Customer WHERE Active = true MAXRESULTS 1000&minorversion=65');
  return data.QueryResponse?.Customer || [];
}

async function pushTimeActivity(companyId, { employeeId, customerId, workDate, hours, description }) {
  const body = {
    NameOf: 'Employee',
    EmployeeRef: { value: String(employeeId) },
    CustomerRef: { value: String(customerId) },
    TxnDate: workDate,
    Hours: Math.floor(hours),
    Minutes: Math.round((hours % 1) * 60),
    Description: description || '',
  };
  const data = await qboPost(companyId, '/timeactivity?minorversion=65', body);
  return data.TimeActivity;
}

module.exports = { getAuthUrl, exchangeCode, refreshAccessToken, getCompanyInfo, listEmployees, listCustomers, pushTimeActivity };
