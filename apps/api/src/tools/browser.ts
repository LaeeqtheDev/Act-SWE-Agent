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
// Anything that CHANGES state (clicking, filling, sending, creating) only
// ever happens through performBrowserAction, which is only ever called
// after a human has approved the proposed action.

let context: BrowserContext | null = null;
let page: Page | null = null;
let throwawayBrowser: Browser | null = null;
let launching: Promise<void> | null = null;

async function ensureBrowser(): Promise<void> {
  // Already have a live page? Reuse it — this is what makes multi-step
  // browsing (open something, then act on it) feel continuous instead of
  // spawning a new window per step.
  if (page && !page.isClosed()) return;
  if (launching) return launching;

  launching = (async () => {
    const userDataDir = process.env.CHROME_USER_DATA_DIR;
    const wantHeadless = process.env.BROWSER_HEADLESS !== "false";

    try {
      if (userDataDir) {
        context = await chromium.launchPersistentContext(userDataDir, { headless: false, channel: "chrome" });
      } else {
        throwawayBrowser = await chromium.launch({ headless: wantHeadless });
        context = await throwawayBrowser.newContext();
      }
      page = await context.newPage();

      // If the user closes the window/tab themselves, don't keep pointing at
      // a dead page — the next call will notice via page.isClosed() and
      // relaunch cleanly instead of throwing into a broken session.
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
  // Kept small on purpose — Groq's free tier has a very tight tokens-per-minute
  // budget (as low as 8,000 TPM), and a multi-step tool-calling conversation
  // resends the whole history on every turn. A handful of full-length page
  // dumps blows that budget fast; 1200 chars is plenty for the model to work
  // from without hitting rate limits mid-task.
  return { title, text: text.slice(0, 1200), status: response?.status() ?? null };
}

export interface BrowserActionPayload {
  url: string;
  action: "click" | "fill";
  selector: string;
  value?: string;
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
    if (payload.action === "click") {
      await page.click(payload.selector, { timeout: 10_000 });
      return { success: true, note: `clicked ${payload.selector}` };
    }
    if (payload.action === "fill") {
      await page.fill(payload.selector, payload.value ?? "", { timeout: 10_000 });
      return { success: true, note: `filled ${payload.selector}` };
    }
    return { success: false, error: `unknown action: ${payload.action}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "browser action failed" };
  }
}
