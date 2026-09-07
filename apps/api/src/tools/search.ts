import { browseWeb } from "./browser.js";

// Returns STRUCTURED results — title, url, snippet — instead of the raw text
// of a search results page. Piping the HTML through as plain text handed the
// model a wall of nav chrome and cookie banners, so it couldn't tell what
// the actual results were and burned its turn budget re-searching.
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function webSearch(
  query: string,
  sessionKey?: string
): Promise<{ query: string; results: SearchResult[] } | { error: string }> {
  try {
    // Uses the SHARED visible session rather than its own headless browser.
    // Previously a search-only task (which is most tasks) opened no visible
    // window at all, so there was nothing to watch.
    const { interactiveElements, text } = await browseWeb(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      sessionKey
    );

    // DuckDuckGo's HTML results are plain links; pull them out of the
    // interactive elements we already collected, unwrapping the redirect.
    const results: SearchResult[] = [];
    for (const el of interactiveElements) {
      if (!el.href || results.length >= 5) continue;
      if (el.href.includes("duckduckgo.com") && !el.href.includes("uddg=")) continue;

      let url = el.href;
      const match = url.match(/[?&]uddg=([^&]+)/);
      if (match) url = decodeURIComponent(match[1]);
      if (!url.startsWith("http")) continue;

      results.push({ title: el.text.slice(0, 120), url, snippet: "" });
    }

    if (results.length === 0) {
      return { error: `No results found for "${query}". Try different wording, or browseWeb a specific site directly.` };
    }

    // Page text carries the snippets; hand back a trimmed slice so the model
    // has context beyond bare titles.
    return { query, results: results.map((r, i) => ({ ...r, snippet: text.slice(i * 150, i * 150 + 150) })) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "search failed" };
  }
}
