import { PrismaClient } from "@prisma/client";
import { encrypt, decrypt, mask } from "./lib/crypto.js";

const prisma = new PrismaClient();

// API keys pasted into the settings UI are stored encrypted at rest
// (AES-256-GCM), never in plaintext, and never sent back to the frontend
// after they're saved — only a masked preview (e.g. "sk-...ab12"). Decryption
// only ever happens server-side, right before an outbound call to the
// provider. The actual encrypt/decrypt/mask logic lives in lib/crypto.ts,
// kept Prisma-free so it's independently unit-tested.
//
// Scoping: in self-hosted mode there's no concept of "users," so settings
// live under a single fixed row id ("active") — exactly the original
// single-tenant behavior. In hosted mode, each Clerk user gets their own row
// (id = their Clerk user id), so one person's pasted key is never used for
// anyone else's chats. Every function below takes an optional userId for
// this reason — omit it (self-host) and you get the original shared row.

function rowId(userId?: string): string {
  return userId ?? "active";
}

export interface ProviderSettings {
  provider: string;
  model: string;
  hasKey: boolean;
  maskedKey: string | null;
}

export async function getProviderSettings(userId?: string): Promise<ProviderSettings | null> {
  const config = await prisma.providerConfig.findUnique({ where: { id: rowId(userId) } });
  if (!config) return null;
  let maskedKey: string | null = null;
  if (config.apiKeyEnc) {
    try {
      maskedKey = mask(decrypt(config.apiKeyEnc));
    } catch {
      maskedKey = "••••";
    }
  }
  return { provider: config.provider, model: config.model, hasKey: !!config.apiKeyEnc, maskedKey };
}

export async function saveProviderSettings(opts: { provider: string; model: string; apiKey?: string; userId?: string }) {
  const id = rowId(opts.userId);
  const apiKeyEnc = opts.apiKey ? encrypt(opts.apiKey) : undefined;
  await prisma.providerConfig.upsert({
    where: { id },
    create: { id, provider: opts.provider, model: opts.model, apiKeyEnc },
    update: { provider: opts.provider, model: opts.model, ...(apiKeyEnc ? { apiKeyEnc } : {}) },
  });
}

// Server-side only — the actual plaintext key, used right before calling the
// provider. Never exposed over HTTP.
export async function getDecryptedProviderConfig(
  userId?: string
): Promise<{ provider: string; model: string; apiKey: string | null } | null> {
  const config = await prisma.providerConfig.findUnique({ where: { id: rowId(userId) } });
  if (!config) return null;
  return {
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKeyEnc ? decrypt(config.apiKeyEnc) : null,
  };
}
