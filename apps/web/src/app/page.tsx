import Link from "next/link";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import {
  ArrowRight,
  ExternalLink,
  GitFork,
  Zap,
  Layers,
  Search,
  CheckCircle2,
  Boxes,
  Database,
  Workflow,
  Bot,
  ShieldCheck,
  Terminal,
  HeartPulse,
  AlertCircle,
  History,
  Box,
  Radio,
} from "lucide-react";
import { NodeCanvas } from "@/components/landing/node-canvas";
import { SignalLine } from "@/components/landing/signal-line";
import { Reveal } from "@/components/landing/reveal";
import { MetricCounter } from "@/components/landing/metric-counter";
import { TerminalDemo } from "@/components/landing/terminal-demo";

const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });

const GITHUB_URL = "https://github.com/LaeeqtheDev";
const LINKEDIN_URL = "https://www.linkedin.com/in/syed-laeeq-ahmed/";
const REPO_URL = "https://github.com/LaeeqtheDev/Act-SWE-Agent";

const metrics = [
  { value: 4, label: "microservices simulated" },
  { value: 2, label: "independent detection rules" },
  { value: 5, label: "tools available to the AI agent" },
  { value: 1, suffix: "×", label: "K8s deployment, self-healing verified" },
];

const pipeline = [
  {
    icon: Zap,
    title: "Simulate",
    body: "Trigger a realistic failure — a database connection spike or a pod crash loop — through a single API call.",
  },
  {
    icon: Layers,
    title: "Queue",
    body: "Raw telemetry events are published to Redis via BullMQ instead of handled inline, decoupling ingestion from analysis.",
  },
  {
    icon: Search,
    title: "Detect",
    body: "An independent worker consumes the queue and applies rule-based, pattern-matching detection to decide if it's a real incident.",
  },
  {
    icon: CheckCircle2,
    title: "Resolve",
    body: "The incident appears on the dashboard with a full timeline, gets investigated, and is closed out — the loop a real on-call engineer runs.",
  },
];

const agentTools = [
  { icon: HeartPulse, name: "getServiceHealth", body: "Current status of a named service." },
  { icon: AlertCircle, name: "getRecentErrors", body: "Raw telemetry events for a service, last N minutes." },
  { icon: History, name: "getDeploymentHistory", body: "Prior incidents on the service and how they resolved." },
  { icon: Box, name: "getKubernetesPodStatus", body: "Live pod phase, restarts, readiness — if a cluster is reachable." },
  { icon: Radio, name: "getKubernetesEvents", body: "Recent cluster events for the service — crashes, scheduling failures." },
];

const stack = [
  { icon: Terminal, label: "Next.js + TypeScript", note: "server-rendered dashboard" },
  { icon: Database, label: "PostgreSQL + Prisma", note: "typed schema, migrations" },
  { icon: Workflow, label: "Redis + BullMQ", note: "event queue, background worker" },
  { icon: Boxes, label: "Docker + Kubernetes", note: "containerized, self-healing" },
  { icon: Bot, label: "Anthropic tool-calling", note: "AI incident investigation" },
  { icon: ShieldCheck, label: "Permission layer", note: "human approval before writes" },
];

export default function LandingPage() {
  return (
    <div
      className={`${plexMono.variable} ${plexSans.variable} bg-[#0B0F14]`}
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {/* Nav */}
      <nav className="relative z-10 max-w-6xl mx-auto px-6 md:px-8 py-6 flex items-center justify-between">
        <span style={{ fontFamily: "var(--font-mono)" }} className="text-sm tracking-widest uppercase text-[#E8ECEF]">
          Act · SWE Agent
        </span>
        <div className="flex items-center gap-5 text-sm">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center gap-1 text-[#7C8A99] hover:text-[#E8ECEF] transition-colors"
          >
            GitHub <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href={LINKEDIN_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center gap-1 text-[#7C8A99] hover:text-[#E8ECEF] transition-colors"
          >
            LinkedIn <ExternalLink className="h-3 w-3" />
          </a>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#E8ECEF] text-[#0B0F14] font-medium hover:opacity-90 transition-opacity"
          >
            Open dashboard <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <NodeCanvas />
        <div className="relative max-w-6xl mx-auto px-6 md:px-8 pt-14 pb-16 md:pt-20">
          <div className="grid lg:grid-cols-[1.15fr_1fr] gap-12 lg:gap-16 items-center">
            <div>
              <p
                style={{ fontFamily: "var(--font-mono)" }}
                className="text-xs tracking-[0.2em] uppercase text-[#35C7C0] mb-5"
              >
                Incident response, automated
              </p>
              <h1
                style={{ fontFamily: "var(--font-mono)" }}
                className="text-4xl md:text-[3.4rem] leading-[1.05] font-medium text-[#E8ECEF]"
              >
                Something breaks.
                <br />
                It gets caught, explained,
                <br />
                and healed.
              </h1>
              <p className="mt-6 text-base md:text-lg text-[#9AA7B4] max-w-lg leading-relaxed">
                A miniature, self-built version of the Datadog + PagerDuty + AI-SRE-agent
                stack — real Postgres, a real event queue, a real Kubernetes deployment,
                and an AI agent that investigates incidents instead of just alerting on them.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-[#35C7C0] text-[#0B0F14] font-medium hover:opacity-90 transition-opacity"
                >
                  Open the dashboard <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-md border border-[#2A3644] text-[#E8ECEF] hover:border-[#3A4656] transition-colors"
                >
                  <GitFork className="h-4 w-4" /> View source
                </a>
              </div>
            </div>

            <Reveal delay={0.15}>
              <TerminalDemo />
            </Reveal>
          </div>

          <div className="mt-16 md:mt-20 max-w-2xl mx-auto">
            <SignalLine />
          </div>
        </div>
      </section>

      {/* Metrics */}
      <section className="border-y border-[#1E2630] bg-[#0D131C]">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-14">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {metrics.map((m, i) => (
              <Reveal key={m.label} delay={i * 0.08}>
                <MetricCounter value={m.value} suffix={m.suffix} label={m.label} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Pipeline */}
      <section className="border-b border-[#1E2630]">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-20">
          <Reveal>
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-[#7C8A99] mb-3">
              How it works
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold text-[#E8ECEF] max-w-xl">
              A real pipeline, end to end — not a mockup.
            </h2>
          </Reveal>

          <div className="mt-12 grid md:grid-cols-4 gap-px bg-[#1E2630] rounded-lg overflow-hidden">
            {pipeline.map((step, i) => (
              <Reveal key={step.title} delay={i * 0.08} className="bg-[#0B0F14] p-6">
                <span style={{ fontFamily: "var(--font-mono)" }} className="text-xs text-[#3A4656]">
                  0{i + 1}
                </span>
                <step.icon className="h-5 w-5 text-[#35C7C0] mt-3 mb-4" />
                <h3 className="text-[#E8ECEF] font-medium mb-2">{step.title}</h3>
                <p className="text-sm text-[#7C8A99] leading-relaxed">{step.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Inside the agent */}
      <section className="border-b border-[#1E2630] bg-[#0D131C]">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-20">
          <div className="grid lg:grid-cols-[1fr_1.2fr] gap-12">
            <Reveal>
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-[#7C8A99] mb-3">
                Inside the agent
              </p>
              <h2 className="text-2xl md:text-3xl font-semibold text-[#E8ECEF] max-w-md">
                A fixed menu of tools — not raw database access.
              </h2>
              <p className="mt-4 text-sm text-[#7C8A99] max-w-md leading-relaxed">
                The agent never queries the database or cluster directly. It calls one of
                five narrow, auditable tools, gathers evidence, then returns a structured
                report — a probable cause, a confidence score, and a recommended action —
                which a human approves before anything actually changes.
              </p>
            </Reveal>

            <div className="space-y-px bg-[#1E2630] rounded-lg overflow-hidden">
              {agentTools.map((tool, i) => (
                <Reveal key={tool.name} delay={i * 0.06} className="bg-[#0B0F14] p-5 flex items-start gap-4">
                  <tool.icon className="h-4 w-4 text-[#F5A623] shrink-0 mt-1" />
                  <div>
                    <p style={{ fontFamily: "var(--font-mono)" }} className="text-[13px] text-[#E8ECEF]">
                      {tool.name}()
                    </p>
                    <p className="text-sm text-[#7C8A99] mt-0.5">{tool.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Stack */}
      <section className="border-b border-[#1E2630]">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-20">
          <Reveal>
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-[#7C8A99] mb-3">
              Under the hood
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold text-[#E8ECEF] max-w-xl">
              Built with the tools real platforms run on.
            </h2>
          </Reveal>

          <div className="mt-12 grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {stack.map((item, i) => (
              <Reveal key={item.label} delay={i * 0.05}>
                <div className="flex items-start gap-3 p-5 rounded-lg border border-[#1E2630] hover:border-[#2A3644] transition-colors h-full">
                  <item.icon className="h-5 w-5 text-[#F5A623] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[#E8ECEF] text-sm font-medium">{item.label}</p>
                    <p className="text-[#7C8A99] text-xs mt-1">{item.note}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-20 text-center">
          <Reveal className="flex flex-col items-center">
            <h2 className="text-2xl md:text-3xl font-semibold text-[#E8ECEF] max-w-lg">
              Trigger a failure. Watch it get caught.
            </h2>
            <p className="mt-4 text-[#7C8A99] max-w-md">
              The dashboard is live — simulate an incident and follow it through detection,
              AI investigation, and resolution.
            </p>
            <Link
              href="/dashboard"
              className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-md bg-[#E8ECEF] text-[#0B0F14] font-medium hover:opacity-90 transition-opacity"
            >
              Open the dashboard <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-[#1E2630]">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#7C8A99]">
          <span style={{ fontFamily: "var(--font-mono)" }}>Act · SWE Agent — a portfolio project</span>
          <div className="flex items-center gap-5">
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-[#E8ECEF] transition-colors inline-flex items-center gap-1">
              Repository <ExternalLink className="h-3 w-3" />
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-[#E8ECEF] transition-colors inline-flex items-center gap-1">
              GitHub <ExternalLink className="h-3 w-3" />
            </a>
            <a href={LINKEDIN_URL} target="_blank" rel="noreferrer" className="hover:text-[#E8ECEF] transition-colors inline-flex items-center gap-1">
              LinkedIn <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
