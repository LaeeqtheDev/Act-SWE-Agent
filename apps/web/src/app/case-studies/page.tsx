import { MarketingShell } from "@/components/marketing/marketing-shell";
import { AlertTriangle, Bot, CheckCircle2 } from "lucide-react";

export const metadata = { title: "Case studies — Act · SWE Agent" };

const scenarios = [
  {
    title: "Database connection exhaustion",
    trigger: "POST /simulate/database-overload",
    icon: AlertTriangle,
    story: [
      "A deployment event fires, followed by a spike in database connections and a jump in the error rate — four raw telemetry events land on the Redis queue within seconds.",
      "The worker picks each one up independently, and the rule engine recognizes the pattern: a connection spike plus an error-rate spike within the same 60-second window means a real incident, not noise. It opens one HIGH-severity incident and attaches the full timeline.",
      "Asked to investigate, the agent calls getServiceHealth, getRecentErrors, and getDeploymentHistory, correlates the timing against the deployment event, and reports back: probable cause, confidence score, and a recommended rollback — which it can propose, but not execute, without approval.",
    ],
  },
  {
    title: "Pod crash loop",
    trigger: "POST /simulate/pod-crash-loop",
    icon: AlertTriangle,
    story: [
      "Three pod-restart events arrive in quick succession — a different pattern from the database scenario, so it's caught by a different rule: a restart-count threshold, not an event-type co-occurrence.",
      "This is deliberate: the detection engine isn't one hardcoded if-statement, it's a small library of independent pattern rules, each suited to a different failure shape.",
      "On a real Kubernetes deployment, this is the exact failure Kubernetes itself is already designed to self-heal — deleting a pod manually and watching a fresh one appear (proven during development) is the same mechanism this scenario simulates at the application layer.",
    ],
  },
  {
    title: "\"Is payments-api healthy? If not, propose restarting it.\"",
    trigger: "A single chat message",
    icon: Bot,
    story: [
      "This is the difference between a dashboard and an agent: instead of clicking through screens, you ask, and it acts.",
      "The agent calls getServiceHealth, sees the degraded status, checks getKubernetesPodStatus for live cluster context, and — because you asked it to — calls proposeAction with type restart_pod.",
      "Nothing has happened yet. The action sits as pending in Agent Activity until a human clicks approve — at which point performAction actually calls the Kubernetes API to restart the deployment.",
    ],
  },
];

export default function CaseStudiesPage() {
  return (
    <MarketingShell>
      <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-warn mb-4">
        Case studies
      </p>
      <h1 style={{ fontFamily: "var(--font-mono)" }} className="text-3xl md:text-4xl font-medium text-foreground mb-4">
        Real scenarios, walked through
      </h1>
      <p className="text-muted-foreground mb-12 max-w-xl">
        This project doesn&apos;t have paying customers yet, so instead of fabricated testimonials, here&apos;s
        exactly what happens — end to end, with the actual mechanism — for the built-in scenarios you can run
        yourself right now.
      </p>

      <div className="space-y-12">
        {scenarios.map((s) => (
          <div key={s.title} className="border-t border-border pt-8">
            <div className="flex items-start gap-3 mb-4">
              <s.icon className="h-5 w-5 text-warn shrink-0 mt-0.5" />
              <div>
                <h2 className="text-lg font-medium text-foreground">{s.title}</h2>
                <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs text-muted-foreground/60 mt-1">{s.trigger}</p>
              </div>
            </div>
            <div className="space-y-3 pl-8">
              {s.story.map((p, i) => (
                <p key={i} className="text-sm text-muted-foreground leading-relaxed">{p}</p>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-16 border-t border-border pt-8 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-warn" />
        <p className="text-sm text-muted-foreground">
          Want to see it live instead of reading about it? Open the{" "}
          <a href="/agent" className="text-warn hover:underline">chat agent</a> and run any of these yourself.
        </p>
      </div>
    </MarketingShell>
  );
}
