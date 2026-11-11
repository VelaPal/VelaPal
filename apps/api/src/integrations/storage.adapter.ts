import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
    secretAccessKey: process.env.S3_SECRET_KEY || "minioadminpassword",
  },
});

const BUCKET = process.env.S3_BUCKET || "velapal-private";
const LOCAL_STORAGE_DIR = path.resolve(__dirname, "../../uploads");
const UPLOAD_SIGNING_SECRET = process.env.UPLOAD_SIGNING_SECRET || process.env.MANIFEST_HMAC_SECRET || "velapal-upload-hmac-secret-v61";

function localPath(objectKey: string) {
  const target = path.resolve(LOCAL_STORAGE_DIR, objectKey);
  if (!target.startsWith(`${LOCAL_STORAGE_DIR}${path.sep}`)) {
    throw new Error("Invalid storage object key");
  }
  return target;
}

function uploadSignature(objectKey: string, mime: string, expires: string) {
  return crypto.createHmac("sha256", UPLOAD_SIGNING_SECRET)
    .update(`${objectKey}\n${mime}\n${expires}`)
    .digest("hex");
}

let isS3Available: boolean | null = null;
let lastS3Check = 0;

async function checkS3(): Promise<boolean> {
  const now = Date.now();
  if (isS3Available !== null && now - lastS3Check < 30000) {
    return isS3Available;
  }
  lastS3Check = now;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const endpoint = process.env.S3_ENDPOINT || "http://localhost:9000";
    const res = await fetch(`${endpoint}/minio/health/live`, { signal: controller.signal }).catch(() => null);
    clearTimeout(timeout);
    isS3Available = Boolean(res && res.status < 500);
  } catch {
    isS3Available = false;
  }
  return isS3Available;
}

export const StorageAdapter = {
  async saveObjectBytes(
    objectKey: string,
    bytes: Buffer,
    mime?: string,
  ): Promise<void> {
    // Prefer S3/MinIO when available.
    if (await checkS3()) {
      try {
        const cmd = new PutObjectCommand({
          Bucket: BUCKET,
          Key: objectKey,
          Body: bytes,
          ContentType: mime || "application/octet-stream",
        });
        await s3.send(cmd);
        return;
      } catch {
        // Use the private local development store when S3 is unavailable.
      }
    }

    const filePath = localPath(objectKey);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, bytes);
  },

  async createQuarantineUploadUrl(
    objectKey: string,
    mime: string,
    expiresInSeconds = 600,
  ): Promise<string> {
    const s3Up = await checkS3();
    if (s3Up) {
      try {
        const cmd = new PutObjectCommand({
          Bucket: BUCKET,
          Key: objectKey,
          ContentType: mime,
        });
        return await getSignedUrl(s3, cmd, { expiresIn: expiresInSeconds });
      } catch {
        // Fall back below
      }
    }
    // Short-lived, content-type-bound URL for the private local development store.
    const expires = String(Math.floor(Date.now() / 1000) + expiresInSeconds);
    const signature = uploadSignature(objectKey, mime, expires);
    return `/api/v1/storage/upload?key=${encodeURIComponent(objectKey)}&mime=${encodeURIComponent(mime)}&expires=${expires}&signature=${signature}`;
  },

  async readObjectBytes(
    objectKey: string,
    fallbackName?: string,
    mimeHint?: string,
  ): Promise<{ buffer: Buffer; mime: string }> {
    // 1. Try S3 / MinIO
    try {
      const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: objectKey });
      const res = await s3.send(cmd);
      const stream = res.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const ch of stream) {
        chunks.push(Buffer.isBuffer(ch) ? ch : Buffer.from(ch));
      }
      return {
        buffer: Buffer.concat(chunks),
        mime: res.ContentType || mimeHint || "application/octet-stream",
      };
    } catch {
      // S3 failed, fallback to local disk
    }

    const filePath = localPath(objectKey);
    const buffer = await fs.promises.readFile(filePath);
    return { buffer, mime: mimeHint || "application/octet-stream" };
  },

  verifyLocalUpload(objectKey: string, mime: string, expires: string, signature: string) {
    if (!objectKey.startsWith("cases/") || !mime || !/^\d+$/.test(expires)) return false;
    if (Number(expires) < Math.floor(Date.now() / 1000)) return false;
    if (!/^[a-f0-9]{64}$/.test(signature)) return false;
    const expected = uploadSignature(objectKey, mime, expires);
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  },

  async createProductUploadUrl(
    objectKey: string,
    mime: string,
    expiresInSeconds = 600,
  ) {
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: objectKey,
      ContentType: mime,
    });
    return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
  },

  async createProductDownloadUrl(
    objectKey: string,
    fileName: string,
    expiresInSeconds = 300,
  ) {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: objectKey,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    });
    return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
  },

  async inspectObject(objectKey: string) {
    const result = await s3.send(
      new HeadObjectCommand({ Bucket: BUCKET, Key: objectKey }),
    );
    return {
      byteCount: result.ContentLength ?? 0,
      mime: result.ContentType ?? "application/octet-stream",
    };
  },
};
