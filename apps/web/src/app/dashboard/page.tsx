import { AppNav } from "@/components/app-nav";
import { IncidentsSection } from "@/components/incidents-section";
import { AgentActivity } from "@/components/agent-activity";
import { AgentIncidentsPanel } from "@/components/agent-incidents-panel";
import { Card, CardContent } from "@/components/ui/card";
import { Bot, ArrowLeft, Sparkles, ShieldAlert, CircleCheck, Clock, Activity, FlaskConical } from "lucide-react";
import type { Service, Incident } from "@sentinelops/types";

const API_URL = process.env.API_URL_INTERNAL || "http://localhost:4000";

const statusColor: Record<string, string> = {
  healthy: "bg-green-500",
  degraded: "bg-amber-500",
  down: "bg-red-500",
};

interface ActionRow {
  id: string;
  incidentId: string | null;
  status: string;
}

async function getServices(): Promise<Service[]> {
  const res = await fetch(`${API_URL}/services`, { cache: "no-store" });
  return res.json();
}

async function getIncidents(): Promise<Incident[]> {
  const res = await fetch(`${API_URL}/incidents`, { cache: "no-store" });
  return res.json();
}

async function getActions(): Promise<ActionRow[]> {
  const res = await fetch(`${API_URL}/actions`, { cache: "no-store" });
  return res.json();
}

export default async function DashboardPage() {
  const [services, incidents, actions] = await Promise.all([getServices(), getIncidents(), getActions()]);
  const publicApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

  const incidentIdsTouchedByAgent = new Set(actions.map((a) => a.incidentId).filter(Boolean));
  const selfHealed = incidents.filter((i) => i.status === "resolved" && !incidentIdsTouchedByAgent.has(i.id)).length;
  const agentHandled = incidents.filter((i) => incidentIdsTouchedByAgent.has(i.id)).length;
  const needsAttention = incidents.filter((i) => i.status !== "resolved" && !incidentIdsTouchedByAgent.has(i.id)).length;
  const pendingApproval = actions.filter((a) => a.status === "pending").length;

  const stats = [
    { label: "Self-healed (no agent needed)", value: selfHealed, icon: Sparkles, tone: "text-muted-foreground" },
    { label: "Agent handled", value: agentHandled, icon: Bot, tone: "text-cyan-500" },
    { label: "Needs agent attention", value: needsAttention, icon: ShieldAlert, tone: needsAttention > 0 ? "text-red-500" : "text-muted-foreground" },
    { label: "Awaiting your approval", value: pendingApproval, icon: Clock, tone: pendingApproval > 0 ? "text-amber-500" : "text-muted-foreground" },
  ];

  return (
    <main className="min-h-screen bg-background">
      <AppNav />

      <div className="max-w-5xl mx-auto px-8 pt-8">
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          What the agent&apos;s actually doing, and what it&apos;s caught along the way
        </p>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-8 space-y-10">
        {/* Real, live — issues the agent hit doing actual work: a browse
            that failed, a tool that errored, a session that broke. This is
            the primary section on purpose; the simulated pipeline below is
            a demo, this is the real thing. */}
        <section>
          <div className="flex items-center gap-2 mb-1">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Live agent issues</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Real failures from real sessions — a browse that couldn&apos;t complete, a tool that errored, a
            provider that timed out. Detected automatically as the agent works, not simulated.
          </p>
          <AgentIncidentsPanel apiUrl={publicApiUrl} />
        </section>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-2xl font-semibold">{stat.value}</p>
                  <stat.icon className={`h-4 w-4 ${stat.tone}`} />
                </div>
                <p className="text-xs text-muted-foreground leading-snug">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <section>
          <div className="flex items-center gap-2 mb-3">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Agent activity</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Everything the agent has proposed or done — from chat or from investigating an incident below.
            Anything pending needs your approval before it runs.
          </p>
          <AgentActivity apiUrl={publicApiUrl} />
        </section>

        {/* The simulated demo services/incidents only render when they
            actually exist — clearing them with `pnpm clear-demo` should
            leave no trace, not empty headers with nothing under them. */}
        {services.length > 0 && (
          <div className="pt-4 border-t border-dashed">
            <div className="flex items-center gap-2 mb-1">
              <FlaskConical className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-muted-foreground">Simulated detection pipeline (demo)</h2>
            </div>
            <p className="text-xs text-muted-foreground/70 mb-6">
              Seeded sample services demonstrating the queue/worker/Kubernetes-detection mechanics.
              Remove them any time with <code className="bg-muted px-1 py-0.5 rounded">pnpm clear-demo</code> in apps/api.
            </p>

            <section className="mb-8">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Services</h3>
              <div className="grid grid-cols-2 gap-4">
                {services.map((service) => (
                  <Card key={service.id}>
                    <CardContent className="flex justify-between items-center p-4">
                      <span className="font-medium">{service.name}</span>
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className={`h-2 w-2 rounded-full ${statusColor[service.status]}`} />
                        {service.status}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            {incidents.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-1">
                  <CircleCheck className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium text-muted-foreground">Incident timeline</h3>
                </div>
                <p className="text-xs text-muted-foreground/70 mb-3">
                  Every simulated incident, whether Kubernetes&apos; own self-healing closed it out or the agent got involved.
                </p>
                <IncidentsSection incidents={incidents} apiUrl={publicApiUrl} />
              </section>
            )}
          </div>
        )}

      </div>
    </main>
  );
}
