const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const hex = process.env.QBO_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) throw new Error('QBO_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  return Buffer.from(hex, 'hex');
}

function encrypt(text) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(encoded) {
  if (!encoded) return null;
  const key = getKey();
  const [ivHex, tagHex, dataHex] = encoded.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
