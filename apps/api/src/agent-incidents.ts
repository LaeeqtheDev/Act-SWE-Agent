import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Real, live self-monitoring: the agent's own tool calls during actual
// chat/investigation sessions get watched, and a genuine failure — a tool
// that errored, a browse that couldn't complete, a shell command that
// exited non-zero — gets logged here automatically. This is intentionally
// separate from the simulated Incident/Service model (payments-api,
// orders-api, etc.), which stays as a demo of the detection pipeline. This
// is the real thing: the agent noticing its own session had a problem.

function severityFor(toolName: string): string {
  if (toolName === "browseWeb" || toolName === "webSearch") return "low"; // often transient (timeout, site down)
  if (toolName === "shellCommand" || toolName === "performShellCommand") return "high";
  return "medium";
}

export async function detectToolFailure(toolName: string, output: unknown): Promise<void> {
  if (!output || typeof output !== "object") return;
  const message = (output as { error?: string }).error;
  if (!message) return;

  await reportAgentIncident(toolName, message);
}

export async function reportAgentIncident(toolName: string, message: string, conversationId?: string): Promise<void> {
  await prisma.agentIncident.create({
    data: { toolName, message: message.slice(0, 500), severity: severityFor(toolName), conversationId },
  });
}

export async function listAgentIncidents(status?: string) {
  return prisma.agentIncident.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function resolveAgentIncident(id: string) {
  return prisma.agentIncident.update({ where: { id }, data: { status: "resolved", resolvedAt: new Date() } });
}
