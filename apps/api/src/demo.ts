import { getProvider } from "./providers/index.js";
import type { AgentMessage } from "./providers/index.js";
import { compactHistoryForRequest } from "./tools/index.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// The landing page's try-it-now widget. Deliberately separate from the real
// chat agent: no auth, no persistence, a small fixed read-only tool menu,
// and a strict per-IP rate limit — this runs against WHOEVER'S provider key
// is configured server-side (yours, if you're running this hosted), so the
// rate limit is the only thing standing between this being a nice demo and
// a stranger burning your API budget. Take it seriously if you deploy this.

const RATE_LIMIT = Number(process.env.DEMO_RATE_LIMIT) || 6; // messages per IP per window
const WINDOW_MS = (Number(process.env.DEMO_RATE_WINDOW_MINUTES) || 60) * 60 * 1000;
const hits = new Map<string, { count: number; resetAt: number }>();

export function checkDemoRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT - 1 };
  }
  if (entry.count >= RATE_LIMIT) return { allowed: false, remaining: 0 };
  entry.count += 1;
  return { allowed: true, remaining: RATE_LIMIT - entry.count };
}

// A small, deliberately read-only tool menu — no browser, no local files,
// no write actions. This is a taste of the product, not full access to it.
const DEMO_TOOLS = [
  {
    name: "listServices",
    description: "List every simulated service and its current status.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "listIncidents",
    description: "List recent incidents, most recent first.",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "getServiceHealth",
    description: "Current status of a named service.",
    inputSchema: {
      type: "object",
      properties: { serviceName: { type: "string" } },
      required: ["serviceName"],
    },
  },
];

async function runDemoTool(name: string, input: Record<string, unknown>) {
  switch (name) {
    case "listServices":
      return prisma.service.findMany();
    case "listIncidents":
      return prisma.incident.findMany({
        orderBy: { createdAt: "desc" },
        take: (input.limit as number) ?? 5,
        include: { service: true },
      });
    case "getServiceHealth": {
      const service = await prisma.service.findFirst({ where: { name: input.serviceName as string } });
      return service ?? { error: "service not found" };
    }
    default:
      return { error: "unavailable in the demo" };
  }
}

const DEMO_SYSTEM_PROMPT = `You are a short, unauthenticated demo of Act SWE Agent, embedded on its landing page.
If listServices returns an empty list, say the demo dataset isn't loaded on this instance and point the
visitor at the real agent — don't invent services or incidents that don't exist.
You have READ-ONLY access to a small simulated set of services and incidents — no browser, no file
access, no write actions here (the real product has all of that, this is just a taste). Be concise —
visitors are trying this for a few seconds, not reading an essay. If asked to do something outside your
demo tools, briefly say so and point them to signing up for the full agent. No emoji, ever.`;

export interface DemoTurn {
  role: "user" | "assistant";
  content: string;
}

export async function runDemoChat(history: DemoTurn[]): Promise<{ reply: string; toolTrace: string[] }> {
  const provider = await getProvider();
  if (!provider) {
    return {
      reply: "The demo isn't configured yet — no AI provider is set server-side. The real agent works once you set one up.",
      toolTrace: [],
    };
  }

  const messages: AgentMessage[] = history.map((m) => ({ role: m.role, content: m.content }));
  const toolTrace: string[] = [];
  let finalText = "";

  try {
    for (let turn = 0; turn < 3; turn++) {
      const result = await provider.runTurn({
        system: DEMO_SYSTEM_PROMPT,
        tools: DEMO_TOOLS,
        history: compactHistoryForRequest(messages),
      });

      if (result.toolCalls.length === 0) {
        finalText = result.text ?? "";
        break;
      }

      messages.push({ role: "assistant", content: result.text ?? "", toolCalls: result.toolCalls });
      for (const call of result.toolCalls) {
        toolTrace.push(call.name);
        const output = await runDemoTool(call.name, call.input);
        messages.push({ role: "tool", toolCallId: call.id, toolName: call.name, content: JSON.stringify(output) });
      }
    }
    if (!finalText.trim()) finalText = "Try asking something more specific — this is a small demo.";
  } catch (err) {
    finalText = `Demo error: ${err instanceof Error ? err.message : "something went wrong"}.`;
  }

  return { reply: finalText, toolTrace };
}
