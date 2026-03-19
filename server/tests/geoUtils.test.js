const { haversineDistanceFt, validCoords } = require('../utils/geoUtils');

describe('haversineDistanceFt', () => {
  test('same point is zero distance', () => {
    expect(haversineDistanceFt(34.0, -118.0, 34.0, -118.0)).toBe(0);
  });

  test('distance is symmetric', () => {
    const d1 = haversineDistanceFt(34.0, -118.0, 34.1, -118.1);
    const d2 = haversineDistanceFt(34.1, -118.1, 34.0, -118.0);
    expect(d1).toBeCloseTo(d2, 5);
  });

  test('one degree of latitude is approximately 364,000–366,000 feet', () => {
    const d = haversineDistanceFt(0, 0, 1, 0);
    expect(d).toBeGreaterThan(364000);
    expect(d).toBeLessThan(366000);
  });

  test('short distance useful for geofencing (~500 feet)', () => {
    // 0.00137 degrees lat ≈ 500 ft at the equator
    const d = haversineDistanceFt(34.0, -118.0, 34.00137, -118.0);
    expect(d).toBeGreaterThan(450);
    expect(d).toBeLessThan(550);
  });

  test('worker clearly inside a 500 ft radius is less than 500 ft', () => {
    // ~200 ft north
    const d = haversineDistanceFt(34.0, -118.0, 34.00055, -118.0);
    expect(d).toBeLessThan(500);
  });

  test('worker clearly outside a 500 ft radius is more than 500 ft', () => {
    // ~1 mile north
    const d = haversineDistanceFt(34.0, -118.0, 34.015, -118.0);
    expect(d).toBeGreaterThan(500);
  });
});

describe('validCoords', () => {
  test('valid coordinates pass', () => {
    expect(validCoords(0, 0)).toBe(true);
    expect(validCoords(34.0, -118.0)).toBe(true);
  });

  test('boundary values are valid', () => {
    expect(validCoords(90, 180)).toBe(true);
    expect(validCoords(-90, -180)).toBe(true);
    expect(validCoords(0, 0)).toBe(true);
  });

  test('latitude out of range fails', () => {
    expect(validCoords(90.001, 0)).toBe(false);
    expect(validCoords(-90.001, 0)).toBe(false);
    expect(validCoords(180, 0)).toBe(false);
  });

  test('longitude out of range fails', () => {
    expect(validCoords(0, 180.001)).toBe(false);
    expect(validCoords(0, -180.001)).toBe(false);
    expect(validCoords(0, 360)).toBe(false);
  });

  test('non-numeric values fail', () => {
    expect(validCoords(NaN, 0)).toBe(false);
    expect(validCoords(null, null)).toBe(false);
    expect(validCoords('abc', 0)).toBe(false);
    expect(validCoords(undefined, undefined)).toBe(false);
  });
});
