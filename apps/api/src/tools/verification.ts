import type { Page } from "playwright";

// Runtime-owned objective checks. Deliberately NOT something the model
// writes or configures dynamically — the whole point is that "the action
// executed" and "the action achieved what was asked" are different
// questions, and only the runtime can answer the second one honestly. The
// model chooses WHAT to check (a URL, some text, a field's value); it never
// gets to decide HOW that check is performed.
export interface VerificationResult {
  verified: boolean;
  check: "url" | "text-present" | "element-visible" | "input-value";
  expected: string;
  actual: string;
}

// --- Individual verifiers — each one answers exactly one question ---

export function verifyUrl(page: Page, expectedSubstring: string): VerificationResult {
  const actual = page.url();
  return {
    verified: actual.toLowerCase().includes(expectedSubstring.toLowerCase()),
    check: "url",
    expected: expectedSubstring,
    actual,
  };
}

export async function verifyTextPresent(page: Page, text: string): Promise<VerificationResult> {
  // Checks input VALUES too, not just rendered text — typed content lives
  // in element.value and never appears in innerText, so a text-only check
  // would wrongly report "not found" for exactly the case this exists for.
  const found = await page.evaluate((needle: string) => {
    const lowered = needle.toLowerCase();
    // innerText is layout-dependent and can be empty/undefined for
    // elements that aren't laid out yet — the same class of bug fixed in
    // collectInteractiveElements. textContent is the reliable fallback.
    const bodyText = document.body.innerText || document.body.textContent || "";
    if (bodyText.toLowerCase().includes(lowered)) return true;
    const fields = Array.from(document.querySelectorAll("input, textarea, [contenteditable='true']"));
    return fields.some((el) => {
      const value = (el as HTMLInputElement).value ?? (el as HTMLElement).innerText ?? "";
      return value.toLowerCase().includes(lowered);
    });
  }, text);

  return { verified: found, check: "text-present", expected: text, actual: found ? "present" : "not found" };
}

export async function verifyElementVisible(page: Page, elementId: string): Promise<VerificationResult> {
  const visible = await page
    .locator(`[data-act-id="${elementId}"]`)
    .first()
    .isVisible()
    .catch(() => false);
  return { verified: visible, check: "element-visible", expected: elementId, actual: visible ? "visible" : "not visible" };
}

export async function verifyInputValue(page: Page, elementId: string, expectedValue: string): Promise<VerificationResult> {
  const actual = await page
    .locator(`[data-act-id="${elementId}"]`)
    .first()
    .evaluate((el) => (el as HTMLInputElement).value ?? (el as HTMLElement).textContent ?? "")
    .catch(() => "");

  // Substring, not exact match — a field showing "mera piya ghar aya "
  // (trailing space, autocomplete suggestion appended) still counts as the
  // typed text having landed. Probe on the first 10 chars: enough to rule
  // out "field is empty" or "field shows something unrelated" without being
  // so strict that a site's own formatting counts as failure.
  const probe = expectedValue.slice(0, Math.min(10, expectedValue.length));
  return {
    verified: probe.length > 0 && actual.toLowerCase().includes(probe.toLowerCase()),
    check: "input-value",
    expected: expectedValue,
    actual,
  };
}

// A single expectation the caller can pass in, dispatched to the right
// verifier. Kept intentionally small — no title-similarity scoring, no
// screenshots, no LLM-based judging. Those are real follow-ups, not part of
// this pass.
export type ExpectedOutcome =
  | { type: "url"; value: string }
  | { type: "text-present"; value: string }
  | { type: "element-visible"; value: string } // value = elementId
  | { type: "input-value"; value: string; elementId: string };

export async function verifyAction(page: Page, expected: ExpectedOutcome): Promise<VerificationResult> {
  switch (expected.type) {
    case "url":
      return verifyUrl(page, expected.value);
    case "text-present":
      return verifyTextPresent(page, expected.value);
    case "element-visible":
      return verifyElementVisible(page, expected.value);
    case "input-value":
      return verifyInputValue(page, expected.elementId, expected.value);
  }
}
