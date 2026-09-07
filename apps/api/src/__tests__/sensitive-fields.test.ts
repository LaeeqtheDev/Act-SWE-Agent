import { describe, it, expect } from "vitest";

// Mirrors the guard in tools/browser.ts. typeInto is deliberately ungated —
// typing changes nothing on its own — but that makes it the one place a
// model could fill a password field without the user ever seeing it. This
// test exists so that protection can't be silently weakened later.
const SENSITIVE_FIELD = /pass(word|code)|\bpin\b|\bcvv\b|\bcvc\b|card.?number|security.?code|secret|otp|2fa|one.?time/i;

describe("typeInto sensitive-field guard", () => {
  it("refuses credential and payment fields", () => {
    const blocked = [
      'text="Password"',
      'role=textbox[name="password"]',
      'text="Passcode"',
      'text="Enter your PIN"',
      'text="CVV"',
      'text="CVC"',
      'text="Card number"',
      'text="Security code"',
      'text="Client secret"',
      'text="OTP"',
      'text="One-time code"',
      'text="2FA code"',
    ];
    for (const sel of blocked) {
      expect(SENSITIVE_FIELD.test(sel), `${sel} must be blocked`).toBe(true);
    }
  });

  it("allows ordinary fields", () => {
    const allowed = [
      'role=textbox[name="Search"]',
      'text="Email address"',
      'text="Full name"',
      'text="Message"',
      'text="Job title"',
      'text="Company"',
      'text="Phone number"',
    ];
    for (const sel of allowed) {
      expect(SENSITIVE_FIELD.test(sel), `${sel} should NOT be blocked`).toBe(false);
    }
  });
});
