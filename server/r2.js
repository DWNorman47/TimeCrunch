const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { randomUUID } = require('crypto');

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Upload a base64 data URL to R2. Returns the public https:// URL.
 * If the value is already an https:// URL, it is returned unchanged.
 */
async function uploadBase64(dataUrl, folder = 'photos') {
  if (!dataUrl.startsWith('data:')) return dataUrl; // already a URL

  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!matches) throw new Error('Invalid data URL');

  const mimeType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  const ext = mimeType.split('/')[1] || 'jpg';
  const key = `${folder}/${randomUUID()}.${ext}`;

  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  }));

  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

module.exports = { uploadBase64 };
