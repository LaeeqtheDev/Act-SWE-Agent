import { browseWeb } from "./browser.js";

// A lightweight "search the web" tool built on top of browseWeb — no search
// API key required. Uses DuckDuckGo's HTML endpoint (no JS, scrape-friendly,
// no auth) and returns the page text for the model to read result snippets
// from. Good enough for "find the best X" / "look up Y" style requests.
export async function webSearch(query: string): Promise<{ query: string; results: string }> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const { text } = await browseWeb(url);
  return { query, results: text };
}
