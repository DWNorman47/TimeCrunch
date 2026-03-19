/**
 * Geofencing utilities. Extracted here so they can be unit-tested without a database.
 */

/**
 * Returns the distance in feet between two lat/lng points using the Haversine formula.
 */
function haversineDistanceFt(lat1, lng1, lat2, lng2) {
  const R = 20902231; // Earth radius in feet
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns true if lat and lng are valid numeric coordinates within their respective ranges.
 */
function validCoords(lat, lng) {
  const la = parseFloat(lat), lo = parseFloat(lng);
  return !isNaN(la) && !isNaN(lo) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180;
}

module.exports = { haversineDistanceFt, validCoords };
