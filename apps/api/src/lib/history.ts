import type { AgentMessage } from "../providers/index.js";

// Deliberately zero DB/Prisma dependency — this is pure logic, and keeping
// it that way is what lets it be unit-tested without a live database
// connection (Prisma's generated client requires one to even import).

// Small models on tight free-tier rate limits (Groq's on-demand tier can be
// as low as 8,000 tokens/minute) choke fast in a multi-step tool-calling
// conversation, because the ENTIRE history — including every prior tool
// result — gets resent on every single turn. Shrinking older tool results
// before each request keeps the payload from ballooning turn over turn,
// while the full versions stay in the real history for anything that needs
// them (e.g. persisting to the DB).
// Rough token estimate — 4 chars/token is the standard rule-of-thumb ratio
// for English text and close enough to catch an oversized request BEFORE
// it's sent, rather than finding out from a 413.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateHistoryTokens(history: AgentMessage[], systemPrompt: string, toolSchemaChars: number): number {
  const historyChars = history.reduce((sum, m) => sum + m.content.length, 0);
  // toolSchemaChars is already a character COUNT, not text — estimate tokens
  // directly from the number, not from the string length of its digits
  // (which is how this bug shipped: "8000".length is 4, not 8000/4).
  return estimateTokens(systemPrompt) + Math.ceil(toolSchemaChars / 4) + Math.ceil(historyChars / 4);
}

// Absolute ceiling on ANY single tool result, "recent" or not. This is the
// bug a live trace exposed: results kept "full" for recency had NO cap at
// all — and a content-heavy page (Google Maps: 25 elements, each carrying
// a long tracking URL) produced a single result several thousand
// characters on its own. No amount of trimming OLDER history helps when
// one CURRENT result already exceeds the whole per-minute budget by itself.
// keepFullLastN controls which results skip the AGGRESSIVE trim; this cap
// applies regardless, to every result, always.
const ABSOLUTE_MAX_RESULT_LEN = 3000;

export function compactHistoryForRequest(history: AgentMessage[], keepFullLastN = 2, maxLen = 200): AgentMessage[] {
  const toolIndices = history.map((m, i) => (m.role === "tool" ? i : -1)).filter((i) => i >= 0);
  const keepFull = new Set(toolIndices.slice(-keepFullLastN));

  return history.map((m, i) => {
    if (m.role !== "tool") return m;

    // Balancing act: free tiers have tiny token budgets, but truncating too
    // hard destroys the interactiveElements list the agent needs to click
    // something on the next turn — so "recent" results get a much higher
    // ceiling, not zero ceiling.
    const limit = keepFull.has(i) ? ABSOLUTE_MAX_RESULT_LEN : maxLen;
    if (m.content.length > limit) {
      return { ...m, content: `${m.content.slice(0, limit)}... [truncated — result too large to send in full]` };
    }
    return m;
  });
}
