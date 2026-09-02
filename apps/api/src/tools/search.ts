import { chromium } from "playwright";

// Returns STRUCTURED results — title, url, snippet — instead of the raw
// text of a search results page. The previous version piped DuckDuckGo's
// HTML through browseWeb and handed the model a wall of nav chrome and
// cookie banners, so it couldn't tell what the actual results were and
// burned its whole turn budget re-searching. Parsed results mean one call
// is usually enough to answer.
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function webSearch(query: string): Promise<{ query: string; results: SearchResult[] } | { error: string }> {
  // Uses its own short-lived browser rather than the shared visible page —
  // a search shouldn't hijack the window the user is watching, and it lets
  // searches run in parallel with whatever else is open.
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });

    const results = await page.evaluate(() => {
      const out: { title: string; url: string; snippet: string }[] = [];
      for (const el of Array.from(document.querySelectorAll(".result")).slice(0, 5)) {
        const link = el.querySelector<HTMLAnchorElement>(".result__a");
        const snippet = el.querySelector(".result__snippet");
        if (!link?.textContent) continue;

        // DuckDuckGo wraps outbound links in a redirect — pull the real URL
        // out so the agent can browse straight to it.
        let url = link.href;
        const match = url.match(/[?&]uddg=([^&]+)/);
        if (match) url = decodeURIComponent(match[1]);

        out.push({
          title: link.textContent.trim().slice(0, 100),
          url,
          snippet: (snippet?.textContent ?? "").trim().slice(0, 180),
        });
      }
      return out;
    });

    if (results.length === 0) {
      return { error: `No results found for "${query}". Try different wording, or browseWeb a specific site directly.` };
    }
    return { query, results };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "search failed" };
  } finally {
    await browser.close();
  }
}
