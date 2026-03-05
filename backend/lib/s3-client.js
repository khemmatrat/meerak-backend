/**
 * AWS S3 Storage Client — แทน Cloudinary
 * ใช้ @aws-sdk/client-s3
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadBucketCommand } from '@aws-sdk/client-s3';

const bucket = process.env.AWS_S3_BUCKET || 'aqond-uploads';
const region = process.env.AWS_REGION || 'ap-southeast-1';

const s3Client = new S3Client({
  region,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

/**
 * สร้าง URL สาธารณะของไฟล์ (ใช้เมื่อ bucket เป็น public-read)
 * หรือใช้ presigned URL ถ้า bucket เป็น private
 */
function getPublicUrl(key) {
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

/**
 * อัปโหลด buffer ไป S3
 * @param {Buffer} buffer
 * @param {Object} options - { folder, key, contentType, resourceType }
 * @returns {Promise<{ url, key, bytes }>}
 */
export async function uploadToS3(buffer, options = {}) {
  const folder = options.folder || 'uploads';
  const ext = options.extension || '';
  const key = options.key || `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`;

  const contentType = options.contentType || (options.resourceType === 'video' ? 'video/mp4' : 'application/octet-stream');

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read', // ให้ URL เข้าถึงได้โดยตรง (ต้องปิด Block Public Access ใน bucket settings)
    })
  );

  const url = getPublicUrl(key);
  return {
    url,
    secure_url: url,
    key,
    public_id: key,
    bytes: buffer.length,
    format: ext.replace(/^\./, '') || 'bin',
    resource_type: options.resourceType || 'auto',
  };
}

/**
 * ลบไฟล์จาก S3 (key = path ใน bucket)
 */
export async function deleteFromS3(key) {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
  return { result: 'ok' };
}

/**
 * รายการไฟล์ใน bucket (prefix = folder)
 */
export async function listS3Files(prefix = '', maxKeys = 50) {
  const result = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: maxKeys,
    })
  );

  const resources = (result.Contents || []).map((obj) => ({
    public_id: obj.Key,
    secure_url: getPublicUrl(obj.Key),
    bytes: obj.Size,
    created_at: obj.LastModified,
  }));

  return { resources };
}

/**
 * ตรวจสอบว่า S3 พร้อมใช้งาน
 */
export async function checkS3Health() {
  try {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      return 'not_configured';
    }
    await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
    return 'healthy';
  } catch (e) {
    return 'unhealthy';
  }
}
