import { PrismaClient } from "@prisma/client";
import type { ToolDef, AgentMessage } from "../providers/index.js";
import { getPodStatus, getRecentEvents as getK8sEvents } from "../k8s.js";
import { browseWeb, clickToNavigate } from "./browser.js";
import { webSearch } from "./search.js";
import { readProjectFile, listProjectDirectory, openInEditor } from "./devtools.js";
import { compactHistoryForRequest } from "../lib/history.js";
import { getUserProfile } from "../profile.js";

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
      "Open a URL in a real browser and read its text content, plus a list of clickable/fillable elements on the page (each with a ready-to-use selector). Links in that list also include their resolved href — for plain navigation (opening a link, going to a different page/section), just call browseWeb on that href directly instead of proposing a browser_action click; it's the same destination either way, and only actions that actually submit, send, or change something need an approval. If CHROME_USER_DATA_DIR is configured, this uses the user's own already-logged-in local Chrome profile — Gmail (mail.google.com), Calendar (calendar.google.com), Docs (docs.google.com), LinkedIn (linkedin.com), Slack (app.slack.com) all work this way, using whatever the user is already signed into in that browser. Without it, this is a logged-out headless browser, fine only for public pages.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "clickToNavigate",
    description:
      "Click a button/tab/control that only NAVIGATES or reveals content — an 'Open roles' button, a tab, 'next page', 'show more', expanding a listing. Returns the resulting page's text and interactiveElements so you can keep working immediately. Use this instead of proposeAction for anything that just moves you around or reveals information: it needs no approval because it changes nothing. Only use proposeAction when something is actually submitted, sent, posted, or applied.",
    inputSchema: {
      type: "object",
      properties: { selector: { type: "string", description: "A selector from a prior browseWeb/clickToNavigate interactiveElements list." } },
      required: ["selector"],
    },
  },
  {
    name: "getUserProfile",
    description:
      "Get the user's saved personal details (name, email, phone, location, links, resume text, and any other saved fields) for filling out forms — job applications, contact forms, signups. Call this BEFORE proposing a form fill so you use their real information instead of asking them to repeat it.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "proposeAction",
    description:
      "Propose a write action for a human to approve — restarting a pod, rolling back a deployment, or clicking/filling something in a browser (e.g. sending an email, creating a calendar event). This does NOT execute anything; it only creates a pending approval that shows up for the user to accept or reject.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["restart_pod", "rollback", "browser_action", "form_fill", "file_edit", "shell_command"] },
        summary: { type: "string", description: "One sentence explaining what this action does and why." },
        serviceName: { type: "string", description: "Required for restart_pod / rollback." },
        browserPayload: {
          type: "object",
          description: "Required only when type is browser_action.",
          properties: {
            url: { type: "string" },
            action: { type: "string", enum: ["click", "fill"] },
            selector: { type: "string", description: "A selector from a prior browseWeb call's interactiveElements — never guess a raw CSS selector." },
            value: { type: "string" },
          },
        },
        formPayload: {
          type: "object",
          description: "Required only when type is form_fill. Fills every field then optionally clicks submit — ONE approval for the whole form, which is what makes applying to a job or filling a contact form practical.",
          properties: {
            url: { type: "string" },
            fields: {
              type: "array",
              description: "Each field's selector (from interactiveElements) and the value to enter. Use getUserProfile first so these are the user's real details.",
              items: {
                type: "object",
                properties: { selector: { type: "string" }, value: { type: "string" } },
              },
            },
            submitSelector: { type: "string", description: "Optional — the submit/apply button to click after filling." },
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
  // ENABLE_LOCAL_DEV_TOOLS is the single switch, hosted or not — you decide
  // whether the agent gets filesystem and shell access on YOUR server.
  //
  // Worth being clear about what that means when other people can sign in:
  // these tools operate on the machine running the API, not on the visitor's
  // computer. Turning them on in a multi-user deployment gives every
  // signed-up user read access to that server's files and the ability to
  // propose shell commands on it. That's a legitimate choice for a
  // single-operator deployment, and a serious one for a public signup — so
  // it stays opt-in and off by default rather than silently enabled.
  return process.env.ENABLE_LOCAL_DEV_TOOLS === "true" ? [...baseTools, ...localDevTools] : baseTools;
}

// Kept for anything importing the flat list directly.
export const tools = baseTools;

// compactHistoryForRequest lives in lib/history.ts (kept dependency-free from
// Prisma so it's independently unit-testable) — re-exported here since
// chat.ts and agent.ts already import it from this module.
export { compactHistoryForRequest };

export interface ToolContext {
  incidentId?: string; // present when the caller is investigating a specific incident
  conversationId?: string; // present when the caller is a chat conversation
  userId?: string; // present in hosted mode — scopes the user's saved profile
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
    case "clickToNavigate":
      try {
        // Session key = conversation id, so parallel chats and scheduled
        // workflows each drive their own browser window instead of fighting
        // over one shared tab.
        return await clickToNavigate(input.selector as string, ctx.conversationId);
      } catch (err) {
        return { error: err instanceof Error ? err.message : "click failed" };
      }
    case "getUserProfile": {
      const profile = await getUserProfile(ctx.userId);
      return profile ?? { error: "No profile saved yet — the user can add their details in Settings so forms can be filled automatically." };
    }
    case "browseWeb":
      try {
        return await browseWeb(input.url as string, ctx.conversationId);
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

      const payload = input.browserPayload ?? input.formPayload ?? input.filePayload ?? input.shellPayload;
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
    default: {
      // Tell the model exactly what it CAN call, so it self-corrects on the
      // next turn instead of repeating the same invented tool name.
      const available = getTools().map((t) => t.name).join(", ");
      return { error: `There is no tool called "${name}". Available tools: ${available}. Use one of those.` };
    }
  }
}
