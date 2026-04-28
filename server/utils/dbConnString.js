/**
 * Connection-string sanitizer for pg's pool. Hosts like Neon and Render
 * include `?sslmode=require` in the URL they hand out; pg-connection-string
 * 2.x prints a deprecation warning whenever it sees one of the legacy modes
 * (prefer / require / verify-ca) because v3 will treat them as verify-full.
 * Every place we instantiate a Pool sets `ssl` explicitly, so the URL hint
 * is redundant — strip it before handing the URL to Pool.
 */
function stripSslMode(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.delete('sslmode');
    return u.toString();
  } catch {
    return url;
  }
}

module.exports = { stripSslMode };
