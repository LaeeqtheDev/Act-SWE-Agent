import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

// Two modes:
//
// 1. Default — a throwaway, logged-out browser. Set BROWSER_HEADLESS=false
//    to actually see it as a real window on screen (recommended for local
//    dev — you want to watch the agent work).
//
// 2. CHROME_USER_DATA_DIR set — launches your REAL local Chrome profile,
//    visibly, with all of its existing sessions already logged in: Gmail,
//    Calendar, whatever you're signed into. This IS the "proper session" —
//    cookies and logins persist across every request and every restart of
//    this server, because it's your actual browser profile on disk, not a
//    throwaway context. Close all other Chrome windows first — Chrome locks
//    its profile directory while running.
//
// Either way: ONE page is reused for every navigation, click, and fill in a
// single running server — the agent keeps working in the same window/tab
// you're looking at, instead of opening a new one for every action. If you
// close that window yourself, the next tool call detects it and opens a
// fresh one rather than silently losing track and multiplying windows.
//
// When visible (BROWSER_HEADLESS=false or a real Chrome profile), actions
// move the mouse smoothly to the target before clicking and type
// character-by-character instead of instantly pasting — so watching it work
// actually looks like something is happening, not just DOM state teleporting.
// A small slowMo is added in visible mode only; headless/production runs get
// none of that overhead.
//
// Anything that CHANGES state (clicking, filling, sending, creating) only
// ever happens through performBrowserAction, which is only ever called
// after a human has approved the proposed action.

// One browser session PER CONVERSATION, not one globally. Previously every
// chat and every scheduled workflow shared a single page, so two running at
// once would fight over the same tab — one navigating away mid-task from
// under the other. Keyed by conversation id, so five tasks genuinely run in
// five independent windows.
interface Session {
  context: BrowserContext;
  page: Page;
  browser: Browser | null; // null when using a persistent Chrome profile
  lastUsed: number;
}

const sessions = new Map<string, Session>();
const launching = new Map<string, Promise<Session>>();

const SESSION_IDLE_MS = 15 * 60 * 1000;
const MAX_SESSIONS = 5;

// Close sessions nobody has touched in a while — otherwise a long-running
// server accumulates browser windows until it runs out of memory.
async function reapIdleSessions(): Promise<void> {
  const now = Date.now();
  for (const [key, s] of sessions) {
    if (now - s.lastUsed > SESSION_IDLE_MS) {
      sessions.delete(key);
      await s.context.close().catch(() => {});
      await s.browser?.close().catch(() => {});
    }
  }

  // Still over the cap? Drop the least recently used.
  while (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
    if (!oldest) break;
    sessions.delete(oldest[0]);
    await oldest[1].context.close().catch(() => {});
    await oldest[1].browser?.close().catch(() => {});
  }
}

function isVisible(): boolean {
  return process.env.BROWSER_HEADLESS === "false" || !!process.env.CHROME_USER_DATA_DIR;
}

async function getSession(key: string): Promise<Session> {
  const existing = sessions.get(key);
  if (existing && !existing.page.isClosed()) {
    existing.lastUsed = Date.now();
    return existing;
  }
  if (existing) sessions.delete(existing.page.isClosed() ? key : key);

  const inFlight = launching.get(key);
  if (inFlight) return inFlight;

  const promise = (async (): Promise<Session> => {
    const userDataDir = process.env.CHROME_USER_DATA_DIR;
    const wantHeadless = process.env.BROWSER_HEADLESS !== "false";
    const slowMo = isVisible() ? 120 : 0; // enough to follow along, not enough to feel slow

    // A default Playwright browser announces itself as automated in several
    // obvious ways, which is a large part of why sites throw CAPTCHAs at it.
    // This reduces challenges; it does not defeat determined bot detection
    // (Google still blocks) and isn't meant to.
    const launchArgs = ["--disable-blink-features=AutomationControlled"];

    let context: BrowserContext;
    let browser: Browser | null = null;

    if (userDataDir) {
      // A Chrome profile directory can only be opened by ONE browser at a
      // time, so parallel sessions each get their own copy-suffixed dir.
      // The base profile keeps its logins; the suffixed ones start fresh
      // but stay isolated from each other.
      const dir = sessions.size === 0 ? userDataDir : `${userDataDir}-act-${sessions.size}`;
      context = await chromium.launchPersistentContext(dir, {
        headless: false,
        channel: "chrome",
        slowMo,
        args: launchArgs,
      });
    } else {
      browser = await chromium.launch({ headless: wantHeadless, slowMo, args: launchArgs });
      context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 800 },
        locale: "en-US",
      });
    }

    // navigator.webdriver is the single most-checked automation signal.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    const page = await context.newPage();
    const session: Session = { context, page, browser, lastUsed: Date.now() };
    sessions.set(key, session);
    launching.delete(key);
    reapIdleSessions().catch(() => {});
    return session;
  })().catch((err) => {
    launching.delete(key);
    throw err;
  });

  launching.set(key, promise);
  return promise;
}

// Every browser tool takes an optional session key (the conversation id).
// Falls back to a shared "default" session for callers that don't have one.
function keyFor(sessionKey?: string): string {
  return sessionKey ?? "default";
}

export interface InteractiveElement {
  selector: string; // a Playwright-native selector (role= or text=) — far more
                     // robust across page updates than a raw CSS path
  text: string;
  href?: string; // resolved absolute URL, only present for plain links — see
                 // browseWeb below for why this matters
}

export async function browseWeb(url: string, sessionKey?: string): Promise<{ title: string; text: string; status: number | null; interactiveElements: InteractiveElement[] }> {
  const { page } = await getSession(keyFor(sessionKey));
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
  // The overlay lives in the DOM, so navigating wipes it. Re-inject after
  // every page load or the cursor disappears mid-task.
  if (isVisible()) await injectCursorOverlay(page).catch(() => {});
  const title = await page.title();
  const text = await page.evaluate(() => document.body.innerText);

  // Automation-detection pages (CAPTCHA, "unusual traffic", Cloudflare
  // challenges) render as a normal page, so without this the agent reads
  // the challenge text and reports it as if it were the real content.
  const blockSignals = ["unusual traffic", "verify you are human", "i'm not a robot", "are you a robot", "complete the security check", "select all images", "captcha"];
  const lowered = `${title} ${text}`.toLowerCase().slice(0, 3000);
  const blocked = blockSignals.some((s) => lowered.includes(s));

  if (blocked) {
    return {
      title,
      text: `[BLOCKED] ${new URL(url).hostname} is showing an automation challenge (CAPTCHA / "verify you are human") instead of the page. Tell the user plainly that this site blocks automated access. If the browser is visible, they can solve the challenge in that window and ask you to retry. Otherwise, suggest a different source — do NOT report the challenge text as the page content.`,
      status: response?.status() ?? null,
      interactiveElements: [],
    };
  }

  const interactiveElements = await collectInteractiveElements(page);

  return { title, text: text.slice(0, 900), status: response?.status() ?? null, interactiveElements };
}

// Surface the actually-clickable things on the page, each with a selector
// the agent can reuse directly — this is what makes "click the Send button
// in Gmail" or "click Post on LinkedIn" reliable instead of the model
// guessing at CSS classes that don't exist or change on every deploy.
// role=/text= selectors are Playwright-native and survive markup changes far
// better than a raw CSS path would. Extracted so clickToNavigate can return
// the same shape after a click, letting the agent keep working from the new
// page without a separate browseWeb round-trip.
async function collectInteractiveElements(p: Page): Promise<InteractiveElement[]> {
  return p.evaluate(() => {
    const els = Array.from(document.querySelectorAll('a, button, input, textarea, select, [role="button"], [role="link"], [role="tab"], [contenteditable="true"]'));
    const results: { selector: string; text: string; href?: string }[] = [];
    for (const el of els) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue; // skip hidden elements
      const label =
        el.getAttribute("aria-label") ||
        (el as HTMLElement).innerText?.trim() ||
        el.getAttribute("placeholder") ||
        el.getAttribute("name") ||
        el.getAttribute("title") ||
        "";
      if (!label) continue;
      const trimmed = label.slice(0, 60);
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role");
      let selector: string;
      let href: string | undefined;
      if (role === "button" || tag === "button") selector = `role=button[name="${trimmed}"]`;
      else if (tag === "a" || role === "link") {
        selector = `role=link[name="${trimmed}"]`;
        // A plain link's destination is just another URL — no reason to
        // require an approval to "click" it when browseWeb can go straight
        // there. This is what cuts the unnecessary approval friction for
        // pure navigation, reserving the gate for things that actually
        // submit, send, or change something.
        const rawHref = (el as HTMLAnchorElement).href;
        if (rawHref && !rawHref.startsWith("javascript:")) href = rawHref;
      } else if (tag === "input" || tag === "textarea" || tag === "select" || el.getAttribute("contenteditable") === "true") {
        selector = `text="${trimmed}" >> visible=true`;
      } else selector = `text="${trimmed}"`;
      results.push({ selector, text: trimmed, href });
      if (results.length >= 25) break; // keep the payload small — see the TPM note above
    }
    return results;
  });
}

export interface FormFillPayload {
  url?: string;
  fields: { selector: string; value: string }[];
  submitSelector?: string;
}

// Fills an entire form in one approved action, then optionally submits it.
// This exists so applying to a job (or any multi-field form) is ONE approval
// the user reviews as a whole — "here's every value I'm about to enter and
// the button I'll press" — rather than a dozen separate approvals for
// individual fields, which is unusable in practice. Still fully gated: it
// only ever runs after the user approves it.
export async function performFormFill(payload: FormFillPayload, sessionKey?: string): Promise<{ success: boolean; filled: number; submitted: boolean; error?: string }> {
  const { page } = await getSession(keyFor(sessionKey));
  try {
    if (payload.url && page.url() !== payload.url) {
      await page.goto(payload.url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    }
    if (isVisible()) await injectCursorOverlay(page);

    let filled = 0;
    for (const field of payload.fields) {
      const locator = page.locator(field.selector).first();
      const box = await locator.boundingBox({ timeout: 8_000 }).catch(() => null);
      if (box) await moveTo(page, box.x + box.width / 2, box.y + box.height / 2);
      await locator.click({ timeout: 8_000 }).catch(() => {});
      await locator.fill("");
      if (isVisible()) {
        await locator.pressSequentially(field.value, { delay: 20 });
      } else {
        await locator.fill(field.value);
      }
      filled++;
    }

    let submitted = false;
    if (payload.submitSelector) {
      const submit = page.locator(payload.submitSelector).first();
      const box = await submit.boundingBox({ timeout: 8_000 }).catch(() => null);
      if (box) await moveTo(page, box.x + box.width / 2, box.y + box.height / 2);
      await submit.click({ timeout: 10_000 });
      await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => {});
      submitted = true;
    }

    return { success: true, filled, submitted };
  } catch (err) {
    return { success: false, filled: 0, submitted: false, error: err instanceof Error ? err.message : "form fill failed" };
  }
}

export interface BrowserActionPayload {
  url: string;
  action: "click" | "fill";
  selector: string;
  value?: string;
}

// Navigation-only clicking — buttons/links that just move you to another
// view (a "Open roles" button, a tab, a "next page" control, expanding a
// job listing). This does NOT need an approval: it changes nothing, submits
// nothing, and sends nothing. It's the same category as browseWeb, just for
// controls that don't expose a plain href (JS-driven tabs, buttons, SPA
// routing) so browseWeb alone can't reach them.
//
// Everything that actually SUBMITS, SENDS, POSTS, or APPLIES still goes
// through proposeAction — that gate is unchanged and non-negotiable.
export async function clickToNavigate(selector: string, sessionKey?: string): Promise<{ success: boolean; title?: string; text?: string; interactiveElements?: InteractiveElement[]; error?: string }> {
  const { page } = await getSession(keyFor(sessionKey));
  try {
    if (isVisible()) await injectCursorOverlay(page);

    const locator = page.locator(selector).first();
    const box = await locator.boundingBox({ timeout: 10_000 }).catch(() => null);
    if (box) await moveTo(page, box.x + box.width / 2, box.y + box.height / 2);

    await locator.click({ timeout: 10_000 });
    // Give SPA routing / lazy content a moment to settle before reading.
    await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(600);
    if (isVisible()) await injectCursorOverlay(page).catch(() => {});

    const title = await page.title();
    const text = await page.evaluate(() => document.body.innerText);
    const interactiveElements = await collectInteractiveElements(page);
    return { success: true, title, text: text.slice(0, 900), interactiveElements };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "click failed" };
  }
}

// Draws a small dot that follows the real mouse position — Playwright moves
// the actual OS-level cursor, but nothing highlights *where* it is on
// screen by default, so in visible mode this makes it obvious to a human
// watching. Purely cosmetic — removed automatically when the page navigates.
async function injectCursorOverlay(p: Page): Promise<void> {
  await p.evaluate(() => {
    if (document.getElementById("__agent_cursor__")) return;
    const dot = document.createElement("div");
    dot.id = "__agent_cursor__";
    Object.assign(dot.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "16px",
      height: "16px",
      borderRadius: "50%",
      background: "rgba(245, 168, 80, 0.85)",
      border: "2px solid white",
      pointerEvents: "none",
      zIndex: "2147483647",
      transform: "translate(-50%, -50%)",
      transition: "left 0.05s linear, top 0.05s linear",
    });
    document.body.appendChild(dot);
    document.addEventListener("mousemove", (e) => {
      dot.style.left = `${e.clientX}px`;
      dot.style.top = `${e.clientY}px`;
    });
  });
}

async function moveTo(p: Page, x: number, y: number): Promise<void> {
  if (!isVisible()) {
    await p.mouse.move(x, y);
    return;
  }
  // Interpolated movement (25 intermediate steps) so the cursor visibly
  // glides to the target instead of teleporting there instantly.
  await p.mouse.move(x, y, { steps: 25 });
}

export async function performBrowserAction(
  payload: BrowserActionPayload,
  sessionKey?: string
): Promise<{ success: boolean; note?: string; error?: string }> {
  const { page } = await getSession(keyFor(sessionKey));
  try {
    if (page.url() !== payload.url) {
      await page.goto(payload.url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    }
    if (isVisible()) await injectCursorOverlay(page);

    const locator = page.locator(payload.selector).first();
    const box = await locator.boundingBox({ timeout: 10_000 }).catch(() => null);
    if (box) {
      await moveTo(page, box.x + box.width / 2, box.y + box.height / 2);
    }

    if (payload.action === "click") {
      await locator.click({ timeout: 10_000 });
      return { success: true, note: `clicked ${payload.selector}` };
    }
    if (payload.action === "fill") {
      await locator.click({ timeout: 10_000 }); // focus the field first, visibly
      await locator.fill(""); // clear
      if (isVisible()) {
        // Types visibly, character by character, instead of an instant paste.
        await locator.pressSequentially(payload.value ?? "", { delay: 35 });
      } else {
        await locator.fill(payload.value ?? "");
      }
      return { success: true, note: `filled ${payload.selector}` };
    }
    return { success: false, error: `unknown action: ${payload.action}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "browser action failed" };
  }
}
