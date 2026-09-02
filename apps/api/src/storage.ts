import fs from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

// Local disk by default — zero config, works out of the box for self-host
// and single-instance deployments. Set S3_BUCKET (+ the other S3_* vars) to
// switch to real object storage instead — required if you ever run more
// than one API instance or redeploy without a persistent volume, since
// local files under apps/api/uploads/ don't survive either of those.
// S3_ENDPOINT lets this point at R2, MinIO, or anything else S3-compatible,
// not just AWS.

function s3Configured(): boolean {
  return !!process.env.S3_BUCKET;
}

function getClient(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials:
      process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
        : undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT, // needed for R2/MinIO-style endpoints
  });
}

// Moves an uploaded file (multer's local temp path) into permanent storage
// and returns the key to store in the database. "local:<path>" or
// "s3:<key>" — the prefix is what getReceiptFile() below branches on.
export async function storeUploadedFile(tempPath: string, originalName: string): Promise<string> {
  if (!s3Configured()) {
    return `local:${tempPath}`;
  }

  const key = `receipts/${Date.now()}-${path.basename(originalName)}`;
  const body = await fs.readFile(tempPath);
  await getClient().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: body }));
  await fs.unlink(tempPath).catch(() => {}); // don't leave a duplicate copy on local disk
  return `s3:${key}`;
}

export async function getReceiptFile(storageKey: string): Promise<{ buffer: Buffer; contentType?: string }> {
  if (storageKey.startsWith("s3:")) {
    const key = storageKey.slice(3);
    const result = await getClient().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    const buffer = Buffer.from(await result.Body!.transformToByteArray());
    return { buffer, contentType: result.ContentType };
  }
  const localPath = storageKey.startsWith("local:") ? storageKey.slice(6) : storageKey; // tolerate pre-existing rows without the prefix
  const buffer = await fs.readFile(path.resolve(localPath));
  return { buffer };
}
