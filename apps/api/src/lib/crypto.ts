import crypto from "node:crypto";

// Zero DB dependency on purpose — this is the actual encryption logic
// protecting every API key a user pastes into the settings UI, and keeping
// it Prisma-free is what makes it independently unit-testable without a
// live database.
//
// SETTINGS_ENCRYPTION_KEY should be set explicitly (openssl rand -hex 32) for
// any real deployment. If it's missing — e.g. quick local testing — a key is
// derived from DATABASE_URL instead so the settings UI still works rather
// than hard-failing; this is logged once so it's never silently weaker than
// you'd expect.

let warnedAboutFallbackKey = false;

export function getEncryptionKey(): Buffer {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (raw) {
    return /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : crypto.createHash("sha256").update(raw).digest();
  }
  if (!warnedAboutFallbackKey) {
    console.warn(
      "[settings] SETTINGS_ENCRYPTION_KEY is not set — deriving a fallback key from DATABASE_URL. " +
        "Fine for local testing. Before deploying, generate a real one with `pnpm gen-key` " +
        "(from apps/api) and put it in apps/api/.env — note that changing it later makes any " +
        "already-saved API keys unreadable, so set it before people start saving keys."
    );
    warnedAboutFallbackKey = true;
  }
  return crypto.createHash("sha256").update(`act-swe-agent-fallback:${process.env.DATABASE_URL ?? "no-db-url"}`).digest();
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decrypt(ciphertextB64: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(ciphertextB64, "base64");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf-8");
}

export function mask(key: string): string {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}
