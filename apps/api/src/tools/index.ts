import { PrismaClient } from "@prisma/client";
import type { ToolDef, AgentMessage } from "../providers/index.js";
import { getPodStatus, getRecentEvents as getK8sEvents } from "../k8s.js";
import { browseWeb } from "./browser.js";
import { webSearch } from "./search.js";
import { readProjectFile, listProjectDirectory, openInEditor } from "./devtools.js";

const prisma = new PrismaClient();

// The single, shared tool menu used by BOTH the one-shot incident
// investigator (agent.ts) and the conversational chat agent (chat.ts) — one
// definition, so a tool added here is immediately available in both places.
// Read tools execute immediately; write tools only ever create a pending
// AgentAction via proposeAction, for a human to approve.

const baseTools: ToolDef[] = [
  {
    name: "getServiceHealth",
    description: "Get the current status (healthy/degraded/down) of a service by name.",
    inputSchema: {
      type: "object",
      properties: { serviceName: { type: "string" } },
      required: ["serviceName"],
    },
  },
  {
    name: "getRecentErrors",
    description: "Get raw telemetry events (deployments, connection spikes, latency, errors, pod restarts) for a service in the last N minutes.",
    inputSchema: {
      type: "object",
      properties: {
        serviceName: { type: "string" },
        minutes: { type: "number", description: "How far back to look, default 15" },
      },
      required: ["serviceName"],
    },
  },
  {
    name: "listServices",
    description: "List every service in the system with its current status. Use this when the user asks something like 'how are things looking' without naming a specific service.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "listIncidents",
    description: "List recent incidents across all services, most recent first.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number", description: "default 10" } },
    },
  },
  {
    name: "getDeploymentHistory",
    description: "Get the incident history for a service — prior incidents and how they were resolved.",
    inputSchema: {
      type: "object",
      properties: { serviceName: { type: "string" } },
      required: ["serviceName"],
    },
  },
  {
    name: "getKubernetesPodStatus",
    description: "Get live Kubernetes pod status for a service (restart count, phase, readiness), if a cluster is reachable.",
    inputSchema: {
      type: "object",
      properties: { serviceName: { type: "string" } },
      required: ["serviceName"],
    },
  },
  {
    name: "getKubernetesEvents",
    description: "Get recent Kubernetes cluster events (crashes, scheduling failures) for a service, if a cluster is reachable.",
    inputSchema: {
      type: "object",
      properties: { serviceName: { type: "string" } },
      required: ["serviceName"],
    },
  },
  {
    name: "webSearch",
    description: "Search the web for something and read the results — use this for 'find the best X', 'look up Y', or anything you don't already know.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "browseWeb",
    description:
      "Open a URL in a real browser and read its text content. If CHROME_USER_DATA_DIR is configured, this uses the user's own already-logged-in local Chrome profile, so it can read pages behind their existing logins (email, calendar, etc.) — otherwise it's a logged-out headless browser, fine for public pages.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "proposeAction",
    description:
      "Propose a write action for a human to approve — restarting a pod, rolling back a deployment, or clicking/filling something in a browser (e.g. sending an email, creating a calendar event). This does NOT execute anything; it only creates a pending approval that shows up for the user to accept or reject.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["restart_pod", "rollback", "browser_action", "file_edit", "shell_command"] },
        summary: { type: "string", description: "One sentence explaining what this action does and why." },
        serviceName: { type: "string", description: "Required for restart_pod / rollback." },
        browserPayload: {
          type: "object",
          description: "Required only when type is browser_action.",
          properties: {
            url: { type: "string" },
            action: { type: "string", enum: ["click", "fill"] },
            selector: { type: "string" },
            value: { type: "string" },
          },
        },
        filePayload: {
          type: "object",
          description: "Required only when type is file_edit. Path is relative to the project root.",
          properties: { path: { type: "string" }, content: { type: "string" } },
        },
        shellPayload: {
          type: "object",
          description: "Required only when type is shell_command.",
          properties: { command: { type: "string" } },
        },
      },
      required: ["type", "summary"],
    },
  },
  {
    name: "createDocument",
    description:
      "Create a markdown document with findings, a summary, or a solution write-up (e.g. after researching something). Saved under generated-docs/. This proposes the file for approval, same as any other write.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string", description: "Markdown content." },
      },
      required: ["title", "content"],
    },
  },
];

// Local "computer use" tools — reading the project's own files, listing
// directories, opening the editor. Only offered to the model at all when
// ENABLE_LOCAL_DEV_TOOLS=true; this is a local dev-assistant capability, not
// something meant to run in a hosted deployment.
const localDevTools: ToolDef[] = [
  {
    name: "readProjectFile",
    description: "Read a file from this project's codebase (path relative to the project root).",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "listProjectDirectory",
    description: "List the contents of a directory in this project's codebase.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Relative to project root, default '.'" } },
    },
  },
  {
    name: "openInEditor",
    description: "Open a file or the whole project in the user's local VS Code.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Relative to project root" } },
    },
  },
];

export function getTools(): ToolDef[] {
  return process.env.ENABLE_LOCAL_DEV_TOOLS === "true" ? [...baseTools, ...localDevTools] : baseTools;
}

// Kept for anything importing the flat list directly.
export const tools = baseTools;

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
    if (m.role === "tool" && !keepFull.has(i) && m.content.length > 250) {
      return { ...m, content: `${m.content.slice(0, 250)}... [older result truncated to save context]` };
    }
    return m;
  });
}

export interface ToolContext {
  incidentId?: string; // present when the caller is investigating a specific incident
  conversationId?: string; // present when the caller is a chat conversation
}

export async function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext = {}) {
  const serviceName = input.serviceName as string;

  switch (name) {
    case "getServiceHealth": {
      const service = await prisma.service.findFirst({ where: { name: serviceName } });
      return service ?? { error: "service not found" };
    }
    case "listServices":
      return prisma.service.findMany();
    case "listIncidents": {
      const limit = (input.limit as number) ?? 10;
      return prisma.incident.findMany({ orderBy: { createdAt: "desc" }, take: limit, include: { service: true } });
    }
    case "getRecentErrors": {
      const minutes = (input.minutes as number) ?? 15;
      const service = await prisma.service.findFirst({ where: { name: serviceName } });
      if (!service) return { error: "service not found" };
      return prisma.event.findMany({
        where: { serviceId: service.id, timestamp: { gte: new Date(Date.now() - minutes * 60_000) } },
        orderBy: { timestamp: "asc" },
      });
    }
    case "getDeploymentHistory": {
      const service = await prisma.service.findFirst({ where: { name: serviceName } });
      if (!service) return { error: "service not found" };
      return prisma.incident.findMany({ where: { serviceId: service.id }, orderBy: { createdAt: "desc" }, take: 5 });
    }
    case "getKubernetesPodStatus":
      return getPodStatus(serviceName);
    case "getKubernetesEvents":
      return getK8sEvents(serviceName);
    case "webSearch":
      try {
        return await webSearch(input.query as string);
      } catch (err) {
        return { error: err instanceof Error ? err.message : "search failed" };
      }
    case "browseWeb":
      try {
        return await browseWeb(input.url as string);
      } catch (err) {
        return { error: err instanceof Error ? err.message : "browser tool failed" };
      }
    case "readProjectFile":
      return readProjectFile(input.path as string);
    case "listProjectDirectory":
      return listProjectDirectory((input.path as string) ?? ".");
    case "openInEditor":
      return openInEditor((input.path as string) ?? ".");
    case "createDocument": {
      const title = input.title as string;
      const content = input.content as string;
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "document";
      const filePayload = { path: `generated-docs/${slug}.md`, content: `# ${title}\n\n${content}` };
      const action = await prisma.agentAction.create({
        data: {
          incidentId: ctx.incidentId ?? null,
          conversationId: ctx.conversationId ?? null,
          type: "file_edit",
          status: "pending",
          summary: `Create document: ${title}`,
          evidence: { payload: filePayload },
        },
      });
      return {
        proposed: true,
        actionId: action.id,
        path: filePayload.path,
        status: "pending human approval",
        note: "Do not tell the user to manually perform this action themselves — it will execute automatically once approved, and you'll be notified in this conversation when it completes.",
      };
    }
    case "proposeAction": {
      let incidentId = ctx.incidentId ?? null;
      if (!incidentId && input.serviceName) {
        const service = await prisma.service.findFirst({ where: { name: input.serviceName as string } });
        if (service) {
          const openIncident = await prisma.incident.findFirst({
            where: { serviceId: service.id, status: { not: "resolved" } },
            orderBy: { createdAt: "desc" },
          });
          incidentId = openIncident?.id ?? null;
        }
      }

      const payload = input.browserPayload ?? input.filePayload ?? input.shellPayload;
      const action = await prisma.agentAction.create({
        data: {
          incidentId,
          conversationId: ctx.conversationId ?? null,
          type: (input.type as string) ?? "restart_pod",
          status: "pending",
          summary: input.summary as string,
          evidence: payload ? { payload } : undefined,
        },
      });
      return {
        proposed: true,
        actionId: action.id,
        status: "pending human approval",
        note: "Do not tell the user to manually perform this action themselves — it will execute automatically once approved, and you'll be notified in this conversation when it completes.",
      };
    }
    default:
      return { error: `unknown tool: ${name}` };
  }
}
