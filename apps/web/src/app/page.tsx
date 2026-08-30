import Link from "next/link";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import {
  ArrowRight,
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
} from "lucide-react";
import { NodeCanvas } from "@/components/landing/node-canvas";
import { SignalLine } from "@/components/landing/signal-line";
import { Reveal } from "@/components/landing/reveal";

const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });

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
    <div className={`${plexMono.variable} ${plexSans.variable}`} style={{ fontFamily: "var(--font-sans)" }}>
      {/* Nav */}
      <nav className="relative z-10 max-w-6xl mx-auto px-6 md:px-8 py-6 flex items-center justify-between">
        <span style={{ fontFamily: "var(--font-mono)" }} className="text-sm tracking-widest uppercase text-[#E8ECEF]">
          Act · SWE Agent
        </span>
        <div className="flex items-center gap-5">
          <a
            href="https://github.com/LaeeqtheDev/Act-SWE-Agent"
            target="_blank"
            rel="noreferrer"
            className="text-[#7C8A99] hover:text-[#E8ECEF] transition-colors"
            aria-label="View source on GitHub"
          >
            <GitFork className="h-5 w-5" />
          </a>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-md bg-[#E8ECEF] text-[#0B0F14] font-medium hover:opacity-90 transition-opacity"
          >
            Open dashboard <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <NodeCanvas />
        <div className="relative max-w-6xl mx-auto px-6 md:px-8 pt-16 pb-20 md:pt-24 md:pb-28">
          <p
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-xs tracking-[0.2em] uppercase text-[#35C7C0] mb-5"
          >
            Incident response, automated
          </p>
          <h1
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-4xl md:text-6xl leading-[1.05] font-medium text-[#E8ECEF] max-w-3xl"
          >
            Something breaks.
            <br />
            It gets caught, explained, and healed.
          </h1>
          <p className="mt-6 text-base md:text-lg text-[#9AA7B4] max-w-xl leading-relaxed">
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
              href="https://github.com/LaeeqtheDev/Act-SWE-Agent"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-md border border-[#2A3644] text-[#E8ECEF] hover:border-[#3A4656] transition-colors"
            >
              <GitFork className="h-4 w-4" /> View source
            </a>
          </div>

          <div className="mt-14 max-w-2xl">
            <SignalLine />
          </div>
        </div>
      </section>

      {/* Pipeline */}
      <section className="border-t border-[#1E2630]">
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

      {/* Stack */}
      <section className="border-t border-[#1E2630]">
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
      <section className="border-t border-[#1E2630]">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-20 text-center">
          <Reveal className="flex flex-col items-center">
            <h2 className="text-2xl md:text-3xl font-semibold text-[#E8ECEF] max-w-lg">
              Trigger a failure. Watch it get caught.
            </h2>
            <p className="mt-4 text-[#7C8A99] max-w-md">
              The dashboard is live — simulate an incident and follow it through detection,
              investigation, and resolution.
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
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#7C8A99]">
          <span style={{ fontFamily: "var(--font-mono)" }}>Act · SWE Agent</span>
          <span>A portfolio project — not affiliated with Datadog or PagerDuty.</span>
        </div>
      </footer>
    </div>
  );
}
