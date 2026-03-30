const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
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

  return { url: `${process.env.R2_PUBLIC_URL}/${key}`, sizeBytes: buffer.length };
}

/**
 * Generate a short-lived presigned PUT URL for direct browser→R2 uploads.
 * Returns { uploadUrl, publicUrl, key }.
 */
async function getPresignedUploadUrl(folder, ext, contentType) {
  const key = `${folder}/${randomUUID()}.${ext}`;
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
  const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
  return { uploadUrl, publicUrl, key };
}

module.exports = { uploadBase64, getPresignedUploadUrl };
