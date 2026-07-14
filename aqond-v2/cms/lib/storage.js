import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

const ENDPOINT = process.env.MINIO_ENDPOINT || "http://minio:9000";
const PUBLIC_BASE = (process.env.MINIO_PUBLIC_URL || "http://localhost:9000").replace(/\/$/, "");
const BUCKET = process.env.MINIO_BUCKET || "aqond-products";
const ACCESS_KEY = process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || "aqond_minio";
const SECRET_KEY = process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || "";

const client = new S3Client({
  endpoint: ENDPOINT,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
});

function extFromMime(mime) {
  const map = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  return map[mime] || "jpg";
}

/** Upload buffers to MinIO; returns public URLs */
export async function uploadProductImages(files, { prefix = "products" } = {}) {
  const urls = [];
  for (const file of files) {
    const ext = extFromMime(file.mimetype || "image/jpeg");
    const key = `${prefix}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
    await client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype || "image/jpeg",
      }),
    );
    urls.push(`${PUBLIC_BASE}/${BUCKET}/${key}`);
  }
  return urls;
}

export function storageHealth() {
  return { endpoint: ENDPOINT, bucket: BUCKET, public_base: PUBLIC_BASE };
}
