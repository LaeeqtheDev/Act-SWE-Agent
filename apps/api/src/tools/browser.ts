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

let context: BrowserContext | null = null;
let page: Page | null = null;
let throwawayBrowser: Browser | null = null;
let launching: Promise<void> | null = null;

function isVisible(): boolean {
  return process.env.BROWSER_HEADLESS === "false" || !!process.env.CHROME_USER_DATA_DIR;
}

async function ensureBrowser(): Promise<void> {
  if (page && !page.isClosed()) return;
  if (launching) return launching;

  launching = (async () => {
    const userDataDir = process.env.CHROME_USER_DATA_DIR;
    const wantHeadless = process.env.BROWSER_HEADLESS !== "false";
    const slowMo = isVisible() ? 120 : 0; // just enough to see it happening, not enough to feel slow

    try {
      if (userDataDir) {
        context = await chromium.launchPersistentContext(userDataDir, { headless: false, channel: "chrome", slowMo });
      } else {
        throwawayBrowser = await chromium.launch({ headless: wantHeadless, slowMo });
        context = await throwawayBrowser.newContext();
      }
      page = await context.newPage();

      page.on("close", () => {
        if (page && page.isClosed()) page = null;
      });
    } catch (err) {
      context = null;
      page = null;
      throw err;
    } finally {
      launching = null;
    }
  })();

  return launching;
}

export async function browseWeb(url: string): Promise<{ title: string; text: string; status: number | null }> {
  await ensureBrowser();
  if (!page) throw new Error("browser page unavailable");
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
  const title = await page.title();
  const text = await page.evaluate(() => document.body.innerText);
  return { title, text: text.slice(0, 1200), status: response?.status() ?? null };
}

export interface BrowserActionPayload {
  url: string;
  action: "click" | "fill";
  selector: string;
  value?: string;
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
  payload: BrowserActionPayload
): Promise<{ success: boolean; note?: string; error?: string }> {
  await ensureBrowser();
  if (!page) return { success: false, error: "browser page unavailable" };
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
