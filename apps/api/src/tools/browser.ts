import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { verifyAction, verifyInputValue, type ExpectedOutcome, type VerificationResult } from "./verification.js";

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

// Every collectInteractiveElements call gets a fresh generation number, and
// every id it returns is embedded with it ("4:e3"). This is what makes a
// stale id STRUCTURALLY impossible to accidentally resolve: navigating (or
// even just re-collecting without navigating — a React rerender, an
// infinite-scroll page growing) bumps the generation and re-stamps every
// element with the new prefix, so an id from an earlier snapshot can never
// match anything on the page again, not even by coincidence. Without this,
// "Page A: e0 = a video result" / navigate / "Page B: e0 = something
// completely different" was a real (if narrow) risk — an id alone doesn't
// encode which page state it came from.
const pageGenerations = new WeakMap<Page, number>();

function nextGeneration(p: Page): number {
  const gen = (pageGenerations.get(p) ?? 0) + 1;
  pageGenerations.set(p, gen);
  return gen;
}

function currentGeneration(p: Page): number {
  return pageGenerations.get(p) ?? 0;
}

// Lets the agent react differently to different failures instead of just
// retrying the same thing blindly — the exact distinction the earlier
// error-string approach couldn't make. STALE_ELEMENT means "re-read the
// page", ELEMENT_NOT_FOUND means "that id was never real, don't retry it",
// TIMEOUT usually means a slow page rather than a wrong target.
export type FailureReason =
  | "STALE_ELEMENT"
  | "ELEMENT_NOT_FOUND"
  | "NAVIGATION_TIMEOUT"
  | "VERIFICATION_FAILED"
  | "UNKNOWN";

function classifyMissingElement(p: Page, elementId: string): FailureReason {
  const match = elementId.match(/^(\d+):/);
  if (!match) return "ELEMENT_NOT_FOUND"; // not even shaped like a real id — hallucinated
  const idGeneration = Number(match[1]);
  // Strictly less-than, not not-equal: the current generation only advances
  // forward via nextGeneration(), so any id generation below it is
  // provably from an earlier page state — that's what "stale" means here,
  // not a guess.
  return idGeneration < currentGeneration(p) ? "STALE_ELEMENT" : "ELEMENT_NOT_FOUND";
}

const sessions = new Map<string, Session>();
const launching = new Map<string, Promise<Session>>();

// Conversations the user has cancelled. Checked inside getSession itself —
// the single choke point every browser tool goes through — because guarding
// only at the runTool entry point wasn't enough: a browse takes seconds, so
// by the time the next tool call arrived the earlier check had already
// passed and Chrome launched anyway.
const cancelledSessions = new Set<string>();

export function markSessionCancelled(sessionKey?: string): void {
  cancelledSessions.add(keyFor(sessionKey));
}

export function isSessionCancelled(sessionKey?: string): boolean {
  return cancelledSessions.has(keyFor(sessionKey));
}

export function clearSessionCancelled(sessionKey?: string): void {
  cancelledSessions.delete(keyFor(sessionKey));
}

// Called on SIGTERM/SIGINT. Without this, every redeploy leaves orphaned
// Chromium processes behind — they accumulate until the container dies on
// memory, which looks like a random crash days later.
export async function closeAllSessions(): Promise<void> {
  const all = [...sessions.values()];
  sessions.clear();
  await Promise.all(
    all.map(async (s) => {
      await s.context.close().catch(() => {});
      await s.browser?.close().catch(() => {});
    })
  );
}

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
  // Refuse to launch anything for a cancelled conversation. This is the one
  // place that can create a browser window, so it's the only place the check
  // is guaranteed to hold.
  if (cancelledSessions.has(key)) {
    throw new Error("Cancelled by user — not launching a browser.");
  }

  const existing = sessions.get(key);
  if (existing && !existing.page.isClosed()) {
    existing.lastUsed = Date.now();
    return existing;
  }
  if (existing) {
    // The user closed the window manually. Dropping it from the map alone
    // leaked the context and browser process — they stayed alive headless
    // and orphaned, which is why closing a window just made another appear.
    // Tear the whole thing down before replacing it.
    sessions.delete(key);
    await existing.context.close().catch(() => {});
    await existing.browser?.close().catch(() => {});
  }

  const inFlight = launching.get(key);
  if (inFlight) return inFlight;

  const promise = (async (): Promise<Session> => {
    const userDataDir = process.env.CHROME_USER_DATA_DIR;
    const wantHeadless = process.env.BROWSER_HEADLESS !== "false";
    // Deliberately 0. slowMo delays EVERY Playwright call, including each
    // interpolated mouse step — 25 steps x 120ms was ~3s per move, which
    // made movement look frozen rather than smooth. Pacing is handled
    // explicitly in moveTo() instead, where it can be tuned properly.
    const slowMo = 0;

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

    // launchPersistentContext already opens a page — calling newPage()
    // creates a SECOND, blank one, which is the stray about:blank window
    // that kept appearing (and reappearing, since closing the visible tab
    // left the other alive and the session still registered). Reuse the
    // existing page when there is one.
    const page = context.pages()[0] ?? (await context.newPage());
    // Logged per launch so "I don't see a browser" is answerable from the
    // terminal instead of by guessing at env vars.
    console.log(
      `[browser] launched session "${key}" — visible: ${isVisible() ? "YES" : "NO (set BROWSER_HEADLESS=\"false\")"}, profile: ${userDataDir ? "yours" : "throwaway"}`
    );
    // Launching a browser takes seconds. If the user cancelled DURING that
    // window, the entry check above already passed and this launch would
    // otherwise complete and register a live window anyway — which is
    // exactly how a browser kept opening after Stop was pressed. Re-check
    // now and tear it straight back down.
    if (cancelledSessions.has(key)) {
      launching.delete(key);
      await context.close().catch(() => {});
      await browser?.close().catch(() => {});
      throw new Error("Cancelled by user — not launching a browser.");
    }

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

// Closes a conversation's browser window. Called when the user cancels —
// otherwise a stopped task leaves its Chrome window open forever, which is
// what made it look like new windows kept appearing.
export async function closeSession(sessionKey?: string): Promise<void> {
  const key = keyFor(sessionKey);
  const s = sessions.get(key);
  if (!s) return;
  sessions.delete(key);
  await s.context.close().catch(() => {});
  await s.browser?.close().catch(() => {});
}

// Every browser tool takes an optional session key (the conversation id).
// Falls back to a shared "default" session for callers that don't have one.
function keyFor(sessionKey?: string): string {
  return sessionKey ?? "default";
}

export interface InteractiveElement {
  id: string; // opaque, stable within this page snapshot — never a query
              // string the model has to construct. See collectInteractiveElements.
  text: string;
  href?: string; // resolved absolute URL, only present for plain links — see
                 // browseWeb below for why this matters
}

// Every action function below takes an elementId and resolves it to
// `[data-act-id="..."]` here, in exactly one place. That attribute only
// exists because collectInteractiveElements stamped it onto the DOM during
// the most recent read — so an id from a STALE page snapshot (before the
// last navigation) correctly resolves to nothing rather than silently
// matching some unrelated element, which raw text/role selectors used to do.
function locatorFor(p: Page, elementId: string) {
  return p.locator(`[data-act-id="${elementId}"]`).first();
}

export async function browseWeb(url: string, sessionKey?: string): Promise<{ title: string; text: string; status: number | null; interactiveElements: InteractiveElement[] }> {
  const { page } = await getSession(keyFor(sessionKey));
  // Re-navigating to the page you're already on throws away all page state
  // — a typed-in textarea, an expanded section, scroll position — and costs
  // a full page load. The agent does this constantly ("let me check the
  // page again"), so skipping it is both faster and prevents losing work
  // in progress.
  const alreadyHere = page.url() === url || page.url() === `${url}/`;
  const response = alreadyHere
    ? null
    : await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });

  // Fire-and-forget: the cursor animation is for the human watching, and
  // reading the page doesn't depend on it. Awaiting it added ~300ms to
  // every single navigation for no functional reason.
  if (isVisible()) {
    void injectCursorOverlay(page)
      .then(() => moveTo(page, 620, 400))
      .catch(() => {});
  }

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

  // A genuine navigation: every id from the previous page must become
  // stale, so this is one of the few places that bumps the generation.
  const interactiveElements = await collectInteractiveElements(page, true);

  return { title, text: text.slice(0, 900), status: response?.status() ?? 200, interactiveElements };
}

// Surface the actually-clickable things on the page, each with a selector
// the agent can reuse directly — this is what makes "click the Send button
// in Gmail" or "click Post on LinkedIn" reliable instead of the model
// guessing at CSS classes that don't exist or change on every deploy.
// role=/text= selectors are Playwright-native and survive markup changes far
// better than a raw CSS path would. Extracted so clickToNavigate can return
// the same shape after a click, letting the agent keep working from the new
// page without a separate browseWeb round-trip.
// bumpGeneration: only TRUE when the page actually navigated or its DOM was
// wholly replaced. This distinction is load-bearing and was a real bug:
// every collection used to bump the generation, so a non-navigating action
// like typeInto — which re-collects to return fresh elements — invalidated
// EVERY id the model was still holding, including the search button it
// was about to click next. The model got STALE_ELEMENT, re-read the page,
// tried again, and looped: the observed "typed the query but never pressed
// Enter", plus a large share of the slowness. Typing into a box doesn't
// change any other element's identity, so it must not renumber them.
async function collectInteractiveElements(p: Page, bumpGeneration = false): Promise<InteractiveElement[]> {
  const gen = bumpGeneration ? nextGeneration(p) : currentGeneration(p) || nextGeneration(p);
  return p.evaluate((generation) => {
    // Every collected element gets a stable data-act-id attribute STAMPED
    // DIRECTLY ONTO THE DOM. That id is the ONLY thing the model ever sees
    // or sends back — never a hand-built Playwright query string.
    //
    // This replaces an entire class of bugs that kept recurring: role=
    // selectors matching the wrong element (a form field labelled "Search"
    // matching a footer link with "Search" in its text), truncated names
    // never matching anything, Playwright normalizing whitespace so a raw
    // innerText selector could never match, hrefs drifting or carrying
    // kilobytes of tracking data. An attribute selector doesn't have any
    // of those failure modes — it either exists on the page or it doesn't.
    const els = Array.from(document.querySelectorAll('a, button, input, textarea, select, [role="button"], [role="link"], [role="tab"], [contenteditable="true"]'));
    const results: { id: string; text: string; href?: string }[] = [];

    // Start numbering past the highest id already handed out at this
    // generation. Without this, `counter` would restart at 0 on every
    // collection and a newly-inserted element could be assigned an id that
    // a retained element is still using — reintroducing exactly the
    // wrong-element-execution bug this whole change exists to remove.
    let counter = 0;
    for (const seen of Array.from(document.querySelectorAll("[data-act-id]"))) {
      const existing = seen.getAttribute("data-act-id") ?? "";
      const match = existing.match(new RegExp(`^${generation}:e(\\d+)$`));
      if (match) counter = Math.max(counter, Number(match[1]) + 1);
    }

    for (const el of els) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue; // skip hidden elements

      let label =
        el.getAttribute("aria-label") ||
        (el as HTMLElement).innerText?.trim() ||
        el.textContent?.trim() ||
        el.getAttribute("placeholder") ||
        el.getAttribute("name") ||
        el.getAttribute("title") ||
        "";
      label = label.replace(/\s+/g, " ").trim(); // collapse newlines for a readable label

      const tag = el.tagName.toLowerCase();
      const isTextInput =
        tag === "textarea" ||
        el.getAttribute("contenteditable") === "true" ||
        (tag === "input" && !["hidden", "submit", "button", "checkbox", "radio"].includes((el as HTMLInputElement).type));

      // An empty <textarea> — a notepad, a comment box, a message field —
      // has no label at all. It still needs an id, so it's still
      // clickable/typeable, just described by what it IS rather than a
      // label it doesn't have.
      if (!label && !isTextInput) continue;

      // The id belongs to the ELEMENT, not to its position in this
      // collection. Previously this assigned `${generation}:e${counter++}`
      // unconditionally on every pass, which meant the id tracked
      // collection ORDER — so anything inserted mid-page (a lazily-loaded
      // ad, a toast, a newly-rendered result) shifted every subsequent
      // element's id by one. Worse than going stale: an id the model was
      // holding would still RESOLVE, just to a different element, and the
      // runtime would report "found it, clicked it, success" while
      // clicking the wrong thing entirely.
      //
      // Reusing an existing attribute makes the mapping stable: a node
      // keeps its id for as long as it's in the document, and only nodes
      // that have never been seen get a new one. The generation prefix
      // still handles the navigation case, where the whole document is
      // replaced and every old id should stop resolving.
      const existingId = el.getAttribute("data-act-id");
      let id: string;
      if (existingId && existingId.startsWith(`${generation}:`)) {
        // Same generation and already stamped — this exact node has been
        // seen before on this page, so it keeps the id the model may
        // already be holding.
        id = existingId;
      } else {
        // Never seen at this generation: brand new node, or one carrying a
        // stale id from before a navigation. Either way it needs a fresh
        // one, numbered past anything already handed out for this
        // generation so it can't collide with an id still in use.
        id = `${generation}:e${counter++}`;
        el.setAttribute("data-act-id", id);
      }

      const text = label
        ? label.slice(0, 80)
        : el.getAttribute("contenteditable") === "true"
          ? "text editor area"
          : `${tag} field (empty)`;

      let href: string | undefined;
      if (tag === "a") {
        const rawHref = (el as HTMLAnchorElement).href;
        // Real bug found from a live trace: Google Maps (and similar sites)
        // embed hundreds of characters of tracking/encoded data in every
        // link's href. With up to 25 elements on a page, that alone was
        // several thousand characters, and "recent" tool results were kept
        // uncapped, so a single Maps page could exceed the whole token
        // budget by itself. A long href is dropped; the element is still
        // clickable via its id either way.
        if (rawHref && !rawHref.startsWith("javascript:") && rawHref.length <= 200) href = rawHref;
      }

      results.push({ id, text, href });
      if (results.length >= 25) break; // keep the payload small — see the TPM note above
    }
    return results;
  }, gen);
}

export interface FormFillPayload {
  url?: string;
  // element ids, captured from the SAME page read that proposed this
  // action. If the page had to be re-navigated to reach payload.url,
  // those ids are stale (a fresh page has fresh ids) — handled below by
  // failing that field explicitly rather than silently acting on the
  // wrong element.
  fields: { elementId: string; value: string }[];
  submitElementId?: string;
}

// Fills an entire form in one approved action, then optionally submits it.
// This exists so applying to a job (or any multi-field form) is ONE approval
// the user reviews as a whole — "here's every value I'm about to enter and
// the button I'll press" — rather than a dozen separate approvals for
// individual fields, which is unusable in practice. Still fully gated: it
// only ever runs after the user approves it.
export async function performFormFill(payload: FormFillPayload, sessionKey?: string): Promise<{ success: boolean; filled: number; submitted: boolean; failureReason?: FailureReason; error?: string }> {
  const { page } = await getSession(keyFor(sessionKey));
  try {
    if (payload.url && page.url() !== payload.url) {
      await page.goto(payload.url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    }
    if (isVisible()) await injectCursorOverlay(page);

    let filled = 0;
    const skipped: string[] = [];
    const unverified: string[] = [];
    for (const field of payload.fields) {
      const locator = locatorFor(page, field.elementId);
      const box = await locator.boundingBox({ timeout: 8_000 }).catch(() => null);
      if (!box) {
        // Genuinely useful signal: this field's id doesn't exist on the
        // current page, most likely because navigating to payload.url just
        // reset every id. Skip it rather than typing into whatever that
        // stale attribute selector happens to now match.
        skipped.push(field.elementId);
        continue;
      }
      await moveTo(page, box.x + box.width / 2, box.y + box.height / 2);
      await locator.click({ timeout: 8_000 }).catch(() => {});
      // Same guard typeInto already has, which this path was missing:
      // Ctrl+A with nothing focused selects the ENTIRE PAGE, which is
      // exactly what produced the "everything highlighted blue" screenshot.
      // Only fall back to select-all when this element genuinely holds
      // focus; otherwise skip clearing rather than nuking the page.
      await locator.fill("").catch(async () => {
        const focused = await locator.evaluate((el) => el === document.activeElement).catch(() => false);
        if (!focused) return;
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Delete");
      });
      if (isVisible()) {
        await locator.pressSequentially(field.value, { delay: 12 });
      } else {
        await locator.fill(field.value);
      }

      // Same objective check typeInto uses — did the value actually land,
      // not just "did fill() throw". A form where three fields silently
      // didn't take their values is worse than one that visibly failed.
      const result = await verifyInputValue(page, field.elementId, field.value);
      if (!result.verified) unverified.push(field.elementId);
      filled++;
    }

    let submitted = false;
    if (payload.submitElementId) {
      const submit = locatorFor(page, payload.submitElementId);
      const box = await submit.boundingBox({ timeout: 8_000 }).catch(() => null);
      if (box) await moveTo(page, box.x + box.width / 2, box.y + box.height / 2);
      await submit.click({ timeout: 10_000 });
      await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => {});
      submitted = true;
    }

    return {
      success: skipped.length === 0 && unverified.length === 0,
      filled,
      submitted,
      ...(skipped.length > 0
        ? {
            failureReason: "STALE_ELEMENT" as FailureReason,
            error: `${skipped.length} field(s) had stale ids and were skipped: ${skipped.join(", ")}. The page likely reloaded — read it again and retry with fresh ids.`,
          }
        : unverified.length > 0
          ? {
              failureReason: "VERIFICATION_FAILED" as FailureReason,
              error: `${unverified.length} field(s) don't show the value entered afterward: ${unverified.join(", ")}. The site may have intercepted or reset them.`,
            }
          : {}),
    };
  } catch (err) {
    return { success: false, filled: 0, submitted: false, error: err instanceof Error ? err.message : "form fill failed" };
  }
}

export interface BrowserActionPayload {
  url: string;
  action: "click" | "fill";
  elementId: string;
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
export async function clickToNavigate(
  elementId: string,
  sessionKey?: string,
  expectedOutcome?: ExpectedOutcome
): Promise<{
  success: boolean;
  url?: string;
  title?: string;
  text?: string;
  interactiveElements?: InteractiveElement[];
  verification?: string;
  verificationResult?: VerificationResult;
  failureReason?: FailureReason;
  error?: string;
}> {
  const { page } = await getSession(keyFor(sessionKey));
  try {
    if (isVisible()) await injectCursorOverlay(page);

    const locator = locatorFor(page, elementId);
    const box = await locator.boundingBox({ timeout: 10_000 }).catch(() => null);
    if (!box) {
      const reason = classifyMissingElement(page, elementId);
      const interactiveElements = await collectInteractiveElements(page).catch(() => []);
      return {
        success: false,
        failureReason: reason,
        error:
          reason === "STALE_ELEMENT"
            ? `Element "${elementId}" is from an earlier version of this page — it navigated or reloaded since. Use one of the ids in interactiveElements below, which are current.`
            : `Element "${elementId}" was never on this page. Use one of the ids in interactiveElements below — never invent one.`,
        url: page.url(),
        interactiveElements,
      };
    }
    await moveTo(page, box.x + box.width / 2, box.y + box.height / 2);

    // Captured BEFORE the click so the result can classify what actually
    // happened, instead of the agent guessing from a generic "success".
    const urlBefore = page.url();

    await locator.click({ timeout: 10_000 });
    await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(120); // brief settle for SPA routing
    if (isVisible()) await injectCursorOverlay(page).catch(() => {});

    const title = await page.title();
    const text = await page.evaluate(() => document.body.innerText);
    const urlAfter = page.url();
    // Only bump the generation if the click ACTUALLY navigated. A click
    // that opened a menu or toggled something in place leaves every other
    // element on the page exactly where it was, so renumbering them would
    // needlessly invalidate ids the model still holds and is about to use.
    const interactiveElements = await collectInteractiveElements(page, urlAfter !== urlBefore);

    // When the caller supplied an explicit expectation, that's the real
    // answer to "did this work" — runs through the SAME verifiers used
    // everywhere else, never bespoke logic per call site. Without one,
    // fall back to the URL-changed heuristic: cheap, and still catches the
    // most common case (a click that technically succeeded but did
    // nothing — a menu opened instead of navigating).
    let verificationResult: VerificationResult | undefined;
    let verification: string;
    if (expectedOutcome) {
      verificationResult = await verifyAction(page, expectedOutcome);
      verification = verificationResult.verified
        ? `Verified: ${verificationResult.check} matches "${verificationResult.expected}".`
        : `NOT verified: expected ${verificationResult.check} "${verificationResult.expected}", got "${verificationResult.actual}".`;
    } else {
      verification =
        urlAfter !== urlBefore
          ? `Navigated to ${urlAfter}`
          : "Page did not navigate — the click may have opened a menu or done nothing. Check interactiveElements for what's actually here now.";
    }

    return {
      success: expectedOutcome ? verificationResult!.verified : true,
      url: urlAfter,
      title,
      text: text.slice(0, 900),
      interactiveElements,
      verification,
      verificationResult,
      ...(expectedOutcome && !verificationResult!.verified ? { failureReason: "VERIFICATION_FAILED" as FailureReason } : {}),
    };
  } catch (err) {
    // Hand back the CURRENT page's clickable elements on failure. Without
    // this the agent just saw "click failed" with no idea what it could
    // click instead, so it kept retrying variations of the same broken id.
    const interactiveElements = await collectInteractiveElements(page).catch(() => []);
    return {
      success: false,
      error: `Couldn't click element "${elementId}": ${err instanceof Error ? err.message : "unknown error"}. Pick an id from interactiveElements below — those are what's actually on the page right now.`,
      url: page.url(),
      interactiveElements,
    };
  }
}

// Draws a small dot that follows the real mouse position — Playwright moves
// the actual OS-level cursor, but nothing highlights *where* it is on
// screen by default, so in visible mode this makes it obvious to a human
// watching. Purely cosmetic — removed automatically when the page navigates.
async function injectCursorOverlay(p: Page): Promise<void> {
  await p.evaluate(() => {
    if (document.getElementById("__agent_cursor__")) return;

    // A real pointer-arrow shape, not a floating dot — this should read as
    // "something is using this computer", which a coloured circle doesn't.
    const cursor = document.createElement("div");
    cursor.id = "__agent_cursor__";
    cursor.innerHTML = `
      <svg width="22" height="30" viewBox="0 0 22 30" style="display:block;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">
        <path d="M2 2 L2 22 L7.5 17.5 L11 26 L15 24 L11.5 16 L18 15.5 Z"
              fill="#111" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>
      </svg>`;
    Object.assign(cursor.style, {
      position: "fixed",
      // Start centred rather than at (0,0) — otherwise it sits invisibly in
      // the corner until the first mousemove lands, which is exactly why it
      // looked like nothing was happening.
      left: "50%",
      top: "50%",
      pointerEvents: "none",
      zIndex: "2147483647",
      // Snappy but still visibly a movement, not a teleport.
      transition: "left 90ms linear, top 90ms linear",
      willChange: "left, top",
    });

    // A click pulse, so the moment of clicking is obvious.
    const ring = document.createElement("div");
    ring.id = "__agent_cursor_ring__";
    Object.assign(ring.style, {
      position: "fixed",
      width: "34px",
      height: "34px",
      marginLeft: "-17px",
      marginTop: "-17px",
      borderRadius: "50%",
      border: "2px solid rgba(224,168,80,.9)",
      pointerEvents: "none",
      zIndex: "2147483646",
      opacity: "0",
      transition: "opacity 140ms ease, transform 140ms ease",
    });

    document.body.appendChild(cursor);
    document.body.appendChild(ring);

    document.addEventListener(
      "mousemove",
      (e) => {
        cursor.style.left = `${e.clientX}px`;
        cursor.style.top = `${e.clientY}px`;
        ring.style.left = `${e.clientX}px`;
        ring.style.top = `${e.clientY}px`;
      },
      true
    );

    document.addEventListener(
      "mousedown",
      () => {
        ring.style.opacity = "1";
        ring.style.transform = "scale(0.6)";
        setTimeout(() => {
          ring.style.opacity = "0";
          ring.style.transform = "scale(1.4)";
        }, 150);
      },
      true
    );
  });
}

// Tracks where the mouse actually is per page, so movement starts from the
// last real position instead of teleporting from an unknown origin.
const lastPos = new WeakMap<Page, { x: number; y: number }>();

async function moveTo(p: Page, x: number, y: number): Promise<void> {
  if (!isVisible()) {
    await p.mouse.move(x, y);
    return;
  }

  // Playwright's `steps` option fires every intermediate move as fast as it
  // can — with slowMo removed there was nothing left to actually see. This
  // walks the path manually with a real delay between steps and an ease-out
  // curve, which is what makes it read as a hand moving a mouse rather than
  // a value jumping between positions.
  const from = lastPos.get(p) ?? { x: Math.round(x / 2), y: Math.round(y / 2) };
  const distance = Math.hypot(x - from.x, y - from.y);

  // Roughly 600px in a third of a second: quick enough not to be annoying,
  // slow enough to follow.
  const steps = Math.max(5, Math.min(16, Math.round(distance / 45)));
  const stepDelay = 8;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    await p.mouse.move(from.x + (x - from.x) * eased, from.y + (y - from.y) * eased);
    if (i < steps) await p.waitForTimeout(stepDelay);
  }

  lastPos.set(p, { x, y });
}

export async function performBrowserAction(
  payload: BrowserActionPayload,
  sessionKey?: string
): Promise<{ success: boolean; note?: string; failureReason?: FailureReason; error?: string }> {
  const { page } = await getSession(keyFor(sessionKey));
  try {
    if (page.url() !== payload.url) {
      await page.goto(payload.url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    }
    if (isVisible()) await injectCursorOverlay(page);

    const locator = locatorFor(page, payload.elementId);
    const box = await locator.boundingBox({ timeout: 10_000 }).catch(() => null);
    if (!box) {
      return {
        success: false,
        failureReason: classifyMissingElement(page, payload.elementId),
        error: `Element "${payload.elementId}" isn't on the page — the id is likely stale from before a navigation.`,
      };
    }
    await moveTo(page, box.x + box.width / 2, box.y + box.height / 2);

    if (payload.action === "click") {
      await locator.click({ timeout: 10_000 });
      return { success: true, note: `clicked element ${payload.elementId}` };
    }
    if (payload.action === "fill") {
      await locator.click({ timeout: 10_000 }); // focus the field first, visibly
      await locator.fill(""); // clear
      if (isVisible()) {
        // Types visibly, character by character, instead of an instant paste.
        await locator.pressSequentially(payload.value ?? "", { delay: 12 });
      } else {
        await locator.fill(payload.value ?? "");
      }
      return { success: true, note: `filled element ${payload.elementId}` };
    }
    return { success: false, error: `unknown action: ${payload.action}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "browser action failed" };
  }
}

// --- Capabilities that close real gaps for "replace the user" ---

// Reading a page as flat text loses structure that matters — which heading
// a paragraph sits under, what's in which table column. This returns the
// page as markdown, so the agent can actually reason about documents,
// articles, and job descriptions instead of a wall of text.
export async function readPageAsMarkdown(sessionKey?: string): Promise<{ url: string; markdown: string }> {
  const { page } = await getSession(keyFor(sessionKey));
  const markdown = await page.evaluate(() => {
    const parts: string[] = [];
    const seen = new Set<Element>();

    for (const el of Array.from(
      document.querySelectorAll("h1, h2, h3, h4, p, li, td, th, pre, code, blockquote")
    )) {
      if (seen.has(el)) continue;
      // Skip nested duplicates (a <p> inside an <li> we already captured).
      let parent = el.parentElement;
      let nested = false;
      while (parent) {
        if (seen.has(parent)) { nested = true; break; }
        parent = parent.parentElement;
      }
      if (nested) continue;

      const text = (el as HTMLElement).innerText?.trim();
      if (!text || text.length < 2) continue;
      seen.add(el);

      const tag = el.tagName.toLowerCase();
      if (tag === "h1") parts.push(`# ${text}`);
      else if (tag === "h2") parts.push(`## ${text}`);
      else if (tag === "h3") parts.push(`### ${text}`);
      else if (tag === "h4") parts.push(`#### ${text}`);
      else if (tag === "li") parts.push(`- ${text}`);
      else if (tag === "pre" || tag === "code") parts.push(`\`\`\`\n${text}\n\`\`\``);
      else if (tag === "blockquote") parts.push(`> ${text}`);
      else if (tag === "td" || tag === "th") parts.push(`| ${text}`);
      else parts.push(text);
    }
    return parts.join("\n\n");
  });

  return { url: page.url(), markdown: markdown.slice(0, 6000) };
}

// Scrolling matters more than it sounds: most feeds, job boards, and search
// results lazy-load, so everything below the fold simply doesn't exist in
// the DOM until you scroll. Without this the agent only ever sees the first
// screenful and concludes that's all there is.
export async function scrollPage(
  direction: "down" | "up" | "bottom" | "top" = "down",
  sessionKey?: string
): Promise<{ success: boolean; interactiveElements: InteractiveElement[]; newContent: string }> {
  const { page } = await getSession(keyFor(sessionKey));

  if (isVisible()) {
    await injectCursorOverlay(page).catch(() => {});
    // Move the cursor into the page before scrolling — otherwise scrolling
    // happened with no visible pointer anywhere, which is half of why it
    // looked like nothing was happening.
    await moveTo(page, 640, 420).catch(() => {});
  }

  if (direction === "down" || direction === "up") {
    // A real wheel event, not window.scrollBy — infinite-scroll feeds
    // listen for wheel specifically and won't load more without it.
    const viewport = page.viewportSize()?.height ?? 800;
    await page.mouse.wheel(0, direction === "down" ? viewport * 0.8 : -viewport * 0.8);
  } else {
    await page.evaluate((dir) => {
      window.scrollTo({ top: dir === "bottom" ? document.body.scrollHeight : 0, behavior: "smooth" });
    }, direction);
  }

  await page.waitForTimeout(450); // let lazy-loaded content render
  if (isVisible()) await injectCursorOverlay(page).catch(() => {});

  const newContent = await page.evaluate(() => document.body.innerText.slice(0, 800));
  const interactiveElements = await collectInteractiveElements(page);
  return { success: true, interactiveElements, newContent };
}

// Going back is how a human recovers from a wrong turn — open a result,
// it's not what you wanted, go back and try the next one. Without it the
// agent had to re-run the whole search to get back to a results page.
export async function goBack(sessionKey?: string): Promise<{ success: boolean; url: string; interactiveElements: InteractiveElement[] }> {
  const { page } = await getSession(keyFor(sessionKey));
  await page.goBack({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(250);
  if (isVisible()) await injectCursorOverlay(page).catch(() => {});
  // A real navigation, same as browseWeb — old ids must become stale.
  return { success: true, url: page.url(), interactiveElements: await collectInteractiveElements(page, true) };
}

// Some things are only obvious visually — a chart, a layout, a CAPTCHA, a
// page whose text extraction came back empty. Returns a base64 screenshot
// so a vision-capable model can just look at it.
export async function screenshotPage(sessionKey?: string): Promise<{ image: string; note: string } | { error: string }> {
  const { page } = await getSession(keyFor(sessionKey));
  try {
    const buf = await page.screenshot({ type: "jpeg", quality: 55 });
    return {
      image: buf.toString("base64"),
      note: "Base64 JPEG of the current viewport. Only useful if the model can process images.",
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "screenshot failed" };
  }
}

// Pressing a key is a distinct action from typing text — Enter to submit a
// search, Escape to close a dialog, Tab to move between fields. These are
// everyday interactions that were simply impossible before.
export async function pressKey(
  key: string,
  sessionKey?: string
): Promise<{ success: boolean; url: string; interactiveElements: InteractiveElement[]; error?: string }> {
  const { page } = await getSession(keyFor(sessionKey));
  try {
    if (isVisible()) await injectCursorOverlay(page).catch(() => {});
    // Enter on a search box usually DOES navigate, so capture the URL
    // first and only renumber elements if the page genuinely changed.
    const urlBefore = page.url();
    await page.keyboard.press(key);
    await page.waitForLoadState("domcontentloaded", { timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(200);
    if (isVisible()) await injectCursorOverlay(page).catch(() => {});
    const urlAfter = page.url();
    return {
      success: true,
      url: urlAfter,
      interactiveElements: await collectInteractiveElements(page, urlAfter !== urlBefore),
    };
  } catch (err) {
    return { success: false, url: page.url(), interactiveElements: [], error: err instanceof Error ? err.message : "key press failed" };
  }
}

// Typing into a field changes nothing on its own — it's the SUBMIT that
// matters, and that still needs approval. Requiring approval to type into a
// search box meant "search YouTube for X" became: browse, propose, wait for
// the human, execute. A person types and hits enter. This is the single
// biggest reason the agent felt slower than doing it yourself.
//
// Guarded below: anything that looks like a password, payment, or
// authentication field is refused outright and routed through the approval
// gate instead, so this can't be used to fill credentials unsupervised.
const SENSITIVE_FIELD = /pass(word|code)|\bpin\b|\bcvv\b|\bcvc\b|card.?number|security.?code|secret|otp|2fa|one.?time/i;

export async function typeInto(
  elementId: string,
  text: string,
  sessionKey?: string
): Promise<{
  success: boolean;
  url?: string;
  interactiveElements?: InteractiveElement[];
  failureReason?: FailureReason;
  verificationResult?: VerificationResult;
  error?: string;
}> {
  const { page } = await getSession(keyFor(sessionKey));

  try {
    if (isVisible()) await injectCursorOverlay(page).catch(() => {});

    const locator = locatorFor(page, elementId);
    const box = await locator.boundingBox({ timeout: 8_000 }).catch(() => null);
    if (!box) {
      const reason = classifyMissingElement(page, elementId);
      const interactiveElements = await collectInteractiveElements(page).catch(() => []);
      return {
        success: false,
        failureReason: reason,
        error:
          reason === "STALE_ELEMENT"
            ? `Element "${elementId}" is from an earlier version of this page — it navigated or reloaded since. Use one of the ids in interactiveElements below, which are current.`
            : `Element "${elementId}" was never on this page. Use one of the ids in interactiveElements below — never invent one.`,
        url: page.url(),
        interactiveElements,
      };
    }
    await moveTo(page, box.x + box.width / 2, box.y + box.height / 2);

    // The password/payment guard runs against the element's TEXT (its
    // label), captured now that we've resolved it from the page rather
    // than guessed from a selector string that might not even mention it.
    const fieldLabel = (await locator.evaluate((el) => (el as HTMLElement).innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").catch(() => "")) || "";
    if (SENSITIVE_FIELD.test(fieldLabel) || SENSITIVE_FIELD.test(elementId)) {
      return {
        success: false,
        error:
          "That looks like a password or payment field. Use proposeAction with type form_fill for those — they need the user's explicit approval.",
      };
    }

    await locator.click({ timeout: 8_000 });
    // Confirms the click actually landed focus on this exact element before
    // typing anything. Without this, a site that intercepts the click (an
    // autocomplete overlay, a combobox wrapper — which is exactly what
    // Google's homepage search box is) can leave focus somewhere else
    // entirely, and everything below silently acts on the wrong element:
    // clearing whatever WAS focused, typing nowhere. That's what produced
    // "it selected everything and typed nothing."
    await locator.waitFor({ state: "attached", timeout: 3_000 });
    const focused = await locator.evaluate((el) => el === document.activeElement).catch(() => false);
    if (!focused) {
      await locator.focus({ timeout: 3_000 }).catch(() => {});
    }

    // fill() only works on <input> and <textarea>. Rich-text editors are
    // contenteditable divs — most online notepads, docs, and comment boxes —
    // where fill() throws. Select-all + type works on both, but ONLY once
    // we've confirmed the right element is actually focused (above) —
    // otherwise this is exactly the "Ctrl+A on the wrong thing" bug.
    const stillFocused = await locator.evaluate((el) => el === document.activeElement).catch(() => false);
    if (!stillFocused) {
      const interactiveElements = await collectInteractiveElements(page).catch(() => []);
      return {
        success: false,
        error: `Clicked into that field but the page moved focus elsewhere — likely an autocomplete or overlay intercepting it. Try pressKey("Escape") first to dismiss anything covering the field, then retry.`,
        url: page.url(),
        interactiveElements,
      };
    }

    await locator.fill("").catch(async () => {
      // Focus was already verified above, but re-check: fill() can fail
      // precisely because the element lost focus between the two calls,
      // and an unfocused Ctrl+A selects the whole page.
      const stillHasFocus = await locator.evaluate((el) => el === document.activeElement).catch(() => false);
      if (!stillHasFocus) return;
      await page.keyboard.press("Control+A");
      await page.keyboard.press("Delete");
    });

    // Typed character by character so it's visible, and because some search
    // boxes only fire autocomplete/validation on real key events.
    await locator.pressSequentially(text, { delay: isVisible() ? 12 : 0 });

    // Verify the text actually landed — a site can eat keystrokes (React
    // controlled inputs with an onChange that resets, IME handling, etc.)
    // and pressSequentially won't throw when that happens. Reporting
    // success on an empty field is worse than reporting a clear failure.
    // Runs through the SAME verifyInputValue used by the verification
    // engine everywhere else — this was the one check that existed before
    // the engine did, so it's now the engine's implementation, not a
    // parallel one.
    const verificationResult = await verifyInputValue(page, elementId, text);
    if (!verificationResult.verified) {
      const interactiveElements = await collectInteractiveElements(page).catch(() => []);
      return {
        success: false,
        failureReason: "VERIFICATION_FAILED",
        verificationResult,
        error: `Typed into that field but it doesn't show the text afterward — the site likely intercepted or reset it. Call verifyPageContains to double-check, or try a different field.`,
        url: page.url(),
        interactiveElements,
      };
    }

    return {
      success: true,
      url: page.url(),
      interactiveElements: await collectInteractiveElements(page),
      verificationResult,
    };
  } catch (err) {
    const interactiveElements = await collectInteractiveElements(page).catch(() => []);
    return {
      success: false,
      error: `Couldn't type into that field: ${err instanceof Error ? err.message : "unknown error"}. Pick a field from interactiveElements below.`,
      url: page.url(),
      interactiveElements,
    };
  }
}

// Waits for something to appear before acting on it. Deliberately takes
// visible TEXT, not an element id — its entire purpose is waiting for
// content that doesn't exist in interactiveElements yet, so it can't
// reference an id from that list. Without this the agent clicks before a
// page has rendered, gets a failure, and burns a turn retrying what was
// only ever a timing problem.
export async function waitForElement(
  text: string,
  sessionKey?: string
): Promise<{ success: boolean; error?: string }> {
  const { page } = await getSession(keyFor(sessionKey));
  try {
    await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: 10_000 });
    return { success: true };
  } catch {
    return { success: false, error: `"${text}" didn't appear within 10s. It may not exist on this page — browseWeb again to see what's actually there.` };
  }
}

// Lets the agent confirm its own work instead of assuming. Without this it
// types into a box, never checks, and reports success — which is how you
// get "I've written that for you" when nothing was written.
export async function verifyPageContains(
  text: string,
  sessionKey?: string
): Promise<{ found: boolean; url: string; note: string }> {
  const { page } = await getSession(keyFor(sessionKey));

  // Checks input VALUES too, not just rendered text — typed content lives
  // in element.value and never appears in innerText, so a text-only check
  // would always say "not found" for exactly the case this is meant for.
  const found = await page.evaluate((needle: string) => {
    const lowered = needle.toLowerCase();
    // Same layout-dependent fallback as verifyTextPresent in
    // verification.ts — innerText can be empty for elements not yet laid
    // out; textContent is reliable regardless.
    const bodyText = document.body.innerText || document.body.textContent || "";
    if (bodyText.toLowerCase().includes(lowered)) return true;
    const fields = Array.from(document.querySelectorAll("input, textarea, [contenteditable='true']"));
    return fields.some((el) => {
      const value = (el as HTMLInputElement).value ?? (el as HTMLElement).innerText ?? "";
      return value.toLowerCase().includes(lowered);
    });
  }, text);

  return {
    found,
    url: page.url(),
    note: found
      ? "Confirmed — it's on the page."
      : "Not found. Don't tell the user this succeeded; check interactiveElements and try again.",
  };
}
