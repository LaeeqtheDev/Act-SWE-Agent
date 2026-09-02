import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt, mask } from "../lib/crypto.js";

describe("encrypt/decrypt round-trip", () => {
  const originalKey = process.env.SETTINGS_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.SETTINGS_ENCRYPTION_KEY = "a".repeat(64); // valid 32-byte hex
  });

  afterEach(() => {
    process.env.SETTINGS_ENCRYPTION_KEY = originalKey;
  });

  it("decrypts exactly what was encrypted", () => {
    const plaintext = "sk-test-abc123-super-secret-key";
    const ciphertext = encrypt(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("never stores the plaintext key inside the ciphertext string", () => {
    const plaintext = "gsk_thisShouldNeverAppearInStorage";
    const ciphertext = encrypt(plaintext);
    expect(ciphertext).not.toContain(plaintext);
  });

  it("produces different ciphertext for the same plaintext each time (random IV)", () => {
    const plaintext = "same-input-both-times";
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext));
  });

  it("fails closed on tampered ciphertext instead of silently returning garbage", () => {
    const ciphertext = encrypt("some-api-key");
    const tampered = ciphertext.slice(0, -4) + "aaaa";
    expect(() => decrypt(tampered)).toThrow();
  });
});

describe("mask", () => {
  it("shows only a small prefix and suffix of a real key", () => {
    const masked = mask("sk-abcdefghijklmnop1234");
    expect(masked).toMatch(/^sk-\.\.\.\w{4}$/);
    expect(masked).not.toContain("abcdefghijklmnop");
  });

  it("never reveals a very short key at all", () => {
    expect(mask("short")).toBe("••••");
  });
});
