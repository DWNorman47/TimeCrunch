const { ipKeyGenerator } = require('express-rate-limit');

/**
 * Per-user rate-limit key. When the request is authenticated we bucket by
 * user id so a single user can't burn through everyone else's quota; when
 * it isn't, we fall back to the client IP via the library's
 * `ipKeyGenerator`, which collapses IPv6 addresses into /56 subnets the
 * way express-rate-limit recommends. Calling `req.ip` directly was
 * triggering ERR_ERL_KEY_GEN_IPV6 warnings because raw IPv6 addresses
 * are easy to spoof one bit at a time.
 */
function userOrIpKey(req) {
  if (req.user?.id) return `u:${req.user.id}`;
  return `ip:${ipKeyGenerator(req.ip)}`;
}

module.exports = { userOrIpKey };
