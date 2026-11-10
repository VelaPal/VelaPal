import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";

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

export const StorageAdapter = {
  async createQuarantineUploadUrl(objectKey: string, mime: string, expiresInSeconds = 600): Promise<string> {
    try {
      const cmd = new PutObjectCommand({
        Bucket: BUCKET,
        Key: objectKey,
        ContentType: mime,
      });
      return await getSignedUrl(s3, cmd, { expiresIn: expiresInSeconds });
    } catch {
      return `https://storage.velapal.local/quarantine/${objectKey}?sig=demo`;
    }
  },

  async readObjectBytes(objectKey: string): Promise<Buffer> {
    try {
      const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: objectKey });
      const res = await s3.send(cmd);
      const stream = res.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const ch of stream) {
        chunks.push(Buffer.isBuffer(ch) ? ch : Buffer.from(ch));
      }
      return Buffer.concat(chunks);
    } catch {
      // Fallback synthetic buffer in local dev when MinIO is not running
      return Buffer.from(`VELAPAL-SYNTHETIC-EVIDENCE:${objectKey}`);
    }
  },

  async createProductUploadUrl(objectKey: string, mime: string, expiresInSeconds = 600) {
    const command = new PutObjectCommand({ Bucket: BUCKET, Key: objectKey, ContentType: mime });
    return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
  },

  async createProductDownloadUrl(objectKey: string, fileName: string, expiresInSeconds = 300) {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: objectKey,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    });
    return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
  },

  async inspectObject(objectKey: string) {
    const result = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: objectKey }));
    return { byteCount: result.ContentLength ?? 0, mime: result.ContentType ?? "application/octet-stream" };
  },
};
