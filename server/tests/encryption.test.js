/**
 * QBO credential encryption tests. The service encrypts refresh tokens
 * before storing them in the DB; a silent regression here would brick
 * every customer's QuickBooks integration at the next token refresh.
 */

// Valid 32-byte key (64 hex chars). Must be set BEFORE requiring encryption.js
// because getKey() reads env on every call but the check happens there too.
process.env.QBO_ENCRYPTION_KEY = 'a'.repeat(64);

const { encrypt, decrypt } = require('../services/encryption');

describe('encryption round-trip', () => {
  test('ASCII round-trip', () => {
    const plain = 'hello world';
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  test('Unicode round-trip', () => {
    const plain = '日本語テスト — émoji 🔐';
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  test('empty string round-trip', () => {
    expect(decrypt(encrypt(''))).toBe('');
  });

  test('large payload (10KB) round-trip', () => {
    const plain = 'x'.repeat(10_000);
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  test('typical QBO refresh token shape round-trip', () => {
    // Real tokens are ~512 chars of alphanumeric + dots
    const plain = 'AB11' + 'a0'.repeat(240) + '.xyz';
    expect(decrypt(encrypt(plain))).toBe(plain);
  });
});

describe('encryption output properties', () => {
  test('encrypt produces a different ciphertext each call (random IV)', () => {
    const a = encrypt('same input');
    const b = encrypt('same input');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('same input');
    expect(decrypt(b)).toBe('same input');
  });

  test('output format is iv:tag:data (all hex)', () => {
    const enc = encrypt('x');
    const parts = enc.split(':');
    expect(parts).toHaveLength(3);
    parts.forEach(p => expect(p).toMatch(/^[0-9a-f]+$/));
    // IV = 12 bytes = 24 hex chars; tag = 16 bytes = 32 hex chars
    expect(parts[0]).toHaveLength(24);
    expect(parts[1]).toHaveLength(32);
  });
});

describe('decrypt edge cases', () => {
  test('null input returns null', () => {
    expect(decrypt(null)).toBeNull();
  });

  test('empty string input returns null', () => {
    expect(decrypt('')).toBeNull();
  });

  test('tampered ciphertext throws (auth tag check)', () => {
    const enc = encrypt('secret');
    const [iv, tag, data] = enc.split(':');
    // Flip one byte in the data segment — auth tag verification should fail
    const flipped = data.slice(0, -2) + (data.slice(-2) === 'ff' ? '00' : 'ff');
    const tampered = `${iv}:${tag}:${flipped}`;
    expect(() => decrypt(tampered)).toThrow();
  });

  test('tampered auth tag throws', () => {
    const enc = encrypt('secret');
    const [iv, tag, data] = enc.split(':');
    const flippedTag = tag.slice(0, -2) + (tag.slice(-2) === 'ff' ? '00' : 'ff');
    const tampered = `${iv}:${flippedTag}:${data}`;
    expect(() => decrypt(tampered)).toThrow();
  });
});

describe('key validation', () => {
  afterAll(() => {
    process.env.QBO_ENCRYPTION_KEY = 'a'.repeat(64); // restore for later tests
  });

  test('missing key throws', () => {
    const orig = process.env.QBO_ENCRYPTION_KEY;
    delete process.env.QBO_ENCRYPTION_KEY;
    expect(() => encrypt('x')).toThrow(/QBO_ENCRYPTION_KEY/);
    process.env.QBO_ENCRYPTION_KEY = orig;
  });

  test('wrong-length key throws', () => {
    const orig = process.env.QBO_ENCRYPTION_KEY;
    process.env.QBO_ENCRYPTION_KEY = 'deadbeef'; // too short
    expect(() => encrypt('x')).toThrow(/64-character hex/);
    process.env.QBO_ENCRYPTION_KEY = orig;
  });
});
