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
export function compactHistoryForRequest(history: AgentMessage[], keepFullLastN = 2): AgentMessage[] {
  const toolIndices = history.map((m, i) => (m.role === "tool" ? i : -1)).filter((i) => i >= 0);
  const keepFull = new Set(toolIndices.slice(-keepFullLastN));

  return history.map((m, i) => {
    // Balancing act: free tiers have tiny token budgets, but truncating too
    // hard destroys the interactiveElements list the agent needs to actually
    // click something on the next turn. Keeping the last two results intact
    // means "browse a page, then click a thing on it" still works.
    if (m.role === "tool" && !keepFull.has(i) && m.content.length > 200) {
      return { ...m, content: `${m.content.slice(0, 200)}... [older result truncated to save context]` };
    }
    return m;
  });
}
