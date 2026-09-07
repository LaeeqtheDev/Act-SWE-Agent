import { PrismaClient } from "@prisma/client";
import type { ToolDef, AgentMessage } from "../providers/index.js";
import { getPodStatus, getRecentEvents as getK8sEvents } from "../k8s.js";
import { browseWeb, clickToNavigate, scrollPage, goBack, readPageAsMarkdown, pressKey, typeInto, waitForElement, verifyPageContains } from "./browser.js";
import { webSearch } from "./search.js";
import { readProjectFile, listProjectDirectory, openInEditor, searchProjectFiles } from "./devtools.js";
import { compactHistoryForRequest } from "../lib/history.js";
import { appendToSheet, readSheet, listSheets } from "./spreadsheet.js";
import {
  listSlackChannels,
  readSlackChannel,
  searchSlack,
  searchNotion,
  readNotionPage,
} from "./integrations.js";
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
      "Open a URL, read its text, and get clickable elements with selectors and hrefs. Uses your logged-in Chrome (Gmail, Calendar, Docs, LinkedIn, Slack) if CHROME_USER_DATA_DIR is set; otherwise a logged-out browser.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "clickToNavigate",
    description:
      "Click a button, tab, or link that only navigates or reveals content (no href to browseWeb directly to). Returns the new page's text and elements.",
    inputSchema: {
      type: "object",
      properties: { selector: { type: "string", description: "A selector from a prior browseWeb/clickToNavigate interactiveElements list." } },
      required: ["selector"],
    },
  },
  {
    name: "typeInto",
    description:
      "Type text into a field — a search box, a filter, a message box. No approval needed: typing changes nothing on its own, it's the submit that matters. Follow with pressKey('Enter') or clickToNavigate on the submit button. Refuses password and payment fields, which must go through proposeAction instead.",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "A selector from interactiveElements." },
        text: { type: "string" },
      },
      required: ["selector", "text"],
    },
  },
  {
    name: "verifyPageContains",
    description:
      "Check whether text is actually present on the page right now. Use this AFTER doing something — typing, submitting, clicking — to confirm it worked before telling the user it did. Never claim a task succeeded without verifying it.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "Text you expect to find." } },
      required: ["text"],
    },
  },
  {
    name: "waitForElement",
    description:
      "Wait for an element to appear before acting on it. Use when a page loads content dynamically and a click just failed — it's usually a timing problem, not a missing element.",
    inputSchema: {
      type: "object",
      properties: { selector: { type: "string" } },
      required: ["selector"],
    },
  },
  {
    name: "scrollPage",
    description:
      "Scroll the current page and get back what's newly visible. Most feeds, job boards, and search results lazy-load — content below the fold does not exist in the page until you scroll. If a page looks short or you need more results, scroll before concluding there aren't any.",
    inputSchema: {
      type: "object",
      properties: { direction: { type: "string", enum: ["down", "up", "bottom", "top"] } },
    },
  },
  {
    name: "goBack",
    description:
      "Go back to the previous page — the way a person recovers from opening the wrong result. Much cheaper than re-running a search to get back to a results list.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "readPageAsMarkdown",
    description:
      "Read the current page as structured markdown, preserving headings, lists, and tables. Use this for documents, articles, and long job descriptions where structure matters — plain text loses which heading a paragraph belongs to.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "pressKey",
    description:
      "Press a keyboard key on the current page — 'Enter' to submit a search box, 'Escape' to dismiss a dialog, 'Tab' to move between fields, 'PageDown' to scroll. Use after filling a search field when there's no visible submit button.",
    inputSchema: {
      type: "object",
      properties: { key: { type: "string", description: "e.g. Enter, Escape, Tab, ArrowDown, PageDown" } },
      required: ["key"],
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
        type: { type: "string", enum: ["restart_pod", "rollback", "browser_action", "form_fill", "file_edit", "shell_command", "slack_message", "notion_append"] },
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
        slackPayload: {
          type: "object",
          description: "Required when type is slack_message.",
          properties: { channel: { type: "string" }, text: { type: "string" } },
        },
        notionPayload: {
          type: "object",
          description: "Required when type is notion_append.",
          properties: { pageId: { type: "string" }, text: { type: "string" } },
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
    name: "appendToSheet",
    description:
      "Add rows to a spreadsheet (.xlsx), creating it if needed. Rows ACCUMULATE across runs, so a scheduled workflow builds one growing sheet rather than a new file each time. Use this for lead lists, research results, anything tabular. Pass rows as objects — the keys become columns.",
    inputSchema: {
      type: "object",
      properties: {
        sheetName: { type: "string", description: "e.g. 'plumber-leads'. Reused to append to the same sheet." },
        rows: {
          type: "array",
          description: 'e.g. [{"Business":"Joes Cafe","Website":"none","Phone":"555-0100"}]',
          items: { type: "object" },
        },
      },
      required: ["sheetName", "rows"],
    },
  },
  {
    name: "readSheet",
    description:
      "Read back a spreadsheet you've built. Use this to check what's already in there before adding more — avoids duplicating businesses you've already found, and lets a later workflow stage work through rows collected earlier.",
    inputSchema: {
      type: "object",
      properties: { sheetName: { type: "string" } },
      required: ["sheetName"],
    },
  },
  {
    name: "listSheets",
    description: "List the spreadsheets that exist.",
    inputSchema: { type: "object", properties: {} },
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
    name: "searchProjectFiles",
    description:
      "Search the codebase for text — a function name, a string, a config key. Returns file paths with line numbers. This is how you find where something lives; don't guess at file paths one at a time.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
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

const integrationTools: ToolDef[] = [
  {
    name: "listSlackChannels",
    description: "List the Slack channels you can access. Use this first if you need a channel ID.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "readSlackChannel",
    description:
      "Read recent messages from a Slack channel, with sender names resolved. Accepts '#general' or a channel ID. Far faster than opening Slack in the browser.",
    inputSchema: {
      type: "object",
      properties: { channel: { type: "string" }, limit: { type: "number", description: "default 20, max 50" } },
      required: ["channel"],
    },
  },
  {
    name: "searchSlack",
    description: "Search Slack messages across the workspace.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "searchNotion",
    description:
      "Search Notion pages and databases. Only pages shared with the integration during setup are visible — if something's missing, that's why.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "readNotionPage",
    description: "Read a Notion page's content as text. Get the page ID from searchNotion first.",
    inputSchema: {
      type: "object",
      properties: { pageId: { type: "string" } },
      required: ["pageId"],
    },
  },
];

const INFRA_TOOL_NAMES = new Set([
  "getServiceHealth",
  "getRecentErrors",
  "listServices",
  "listIncidents",
  "getDeploymentHistory",
  "getKubernetesPodStatus",
  "getKubernetesEvents",
]);

// Which integrations are connected. Refreshed per task by chat.ts rather
// than queried inside getTools, which is called synchronously mid-loop.
let connectedServices = new Set<string>();

export function setConnectedServices(services: string[]): void {
  connectedServices = new Set(services);
}

export function getTools(): ToolDef[] {
  // Drop the infra/monitoring tools unless this deployment actually runs
  // them. They're dead weight for a browsing agent and their schemas are
  // resent on every single turn.
  const withInfra = process.env.ENABLE_INFRA_TOOLS === "true";
  const core = withInfra ? baseTools : baseTools.filter((t) => !INFRA_TOOL_NAMES.has(t.name));

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
  // Only offer Slack/Notion tools when they're actually connected —
  // otherwise the model burns steps calling tools that can only ever
  // return "not connected".
  const withIntegrations = [
    ...core,
    ...integrationTools.filter((t) =>
      t.name.toLowerCase().includes("slack") ? connectedServices.has("slack") : connectedServices.has("notion")
    ),
  ];

  return process.env.ENABLE_LOCAL_DEV_TOOLS === "true"
    ? [...withIntegrations, ...localDevTools]
    : withIntegrations;
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
  /** Aborted when the user presses Stop. Checked before any tool that
   * launches a browser or makes a network call, so cancelling actually
   * prevents work rather than just discarding its result. */
  signal?: AbortSignal;
}

export async function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext = {}) {
  // Bail before doing anything expensive. Without this, a tool call that was
  // already queued would still launch Chrome after the user hit Stop.
  if (ctx.signal?.aborted) return { error: "Cancelled by user." };

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
        return await webSearch(input.query as string, ctx.conversationId);
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
    case "typeInto":
      try {
        return await typeInto(input.selector as string, input.text as string, ctx.conversationId);
      } catch (err) {
        return { error: err instanceof Error ? err.message : "typing failed" };
      }
    case "verifyPageContains":
      try {
        return await verifyPageContains(input.text as string, ctx.conversationId);
      } catch (err) {
        return { error: err instanceof Error ? err.message : "verify failed" };
      }
    case "waitForElement":
      try {
        return await waitForElement(input.selector as string, ctx.conversationId);
      } catch (err) {
        return { error: err instanceof Error ? err.message : "wait failed" };
      }
    case "scrollPage":
      try {
        return await scrollPage((input.direction as "down" | "up" | "bottom" | "top") ?? "down", ctx.conversationId);
      } catch (err) {
        return { error: err instanceof Error ? err.message : "scroll failed" };
      }
    case "goBack":
      try {
        return await goBack(ctx.conversationId);
      } catch (err) {
        return { error: err instanceof Error ? err.message : "go back failed" };
      }
    case "readPageAsMarkdown":
      try {
        return await readPageAsMarkdown(ctx.conversationId);
      } catch (err) {
        return { error: err instanceof Error ? err.message : "read failed" };
      }
    case "pressKey":
      try {
        return await pressKey(input.key as string, ctx.conversationId);
      } catch (err) {
        return { error: err instanceof Error ? err.message : "key press failed" };
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
    case "searchProjectFiles":
      return searchProjectFiles(input.query as string);
    case "openInEditor":
      return openInEditor((input.path as string) ?? ".");
    case "listSlackChannels":
      return listSlackChannels(ctx.userId);
    case "readSlackChannel":
      return readSlackChannel(input.channel as string, ctx.userId, (input.limit as number) ?? 20);
    case "searchSlack":
      return searchSlack(input.query as string, ctx.userId);
    case "searchNotion":
      return searchNotion(input.query as string, ctx.userId);
    case "readNotionPage":
      return readNotionPage(input.pageId as string, ctx.userId);
    case "appendToSheet":
      return appendToSheet(input.sheetName as string, input.rows as Record<string, string | number | null>[]);
    case "readSheet":
      return readSheet(input.sheetName as string);
    case "listSheets":
      return listSheets();
    case "createDocument": {
      const title = input.title as string;
      const content = input.content as string;
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "document";
      const filePayload = { path: `generated-docs/${slug}.md`, content: `# ${title}\n\n${content}` };
      const action = await prisma.agentAction.create({
        data: {
          incidentId: ctx.incidentId ?? null,
          userId: ctx.userId ?? null,
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

      const payload = input.browserPayload ?? input.formPayload ?? input.slackPayload ?? input.notionPayload ?? input.filePayload ?? input.shellPayload;
      const action = await prisma.agentAction.create({
        data: {
          incidentId,
          userId: ctx.userId ?? null,
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
