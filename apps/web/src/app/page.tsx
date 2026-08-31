import Link from "next/link";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import {
  ArrowRight,
  ExternalLink,
  GitFork,
  Star,
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
  Box,
  Code,
  Globe,
  MousePointerClick,
  Key,
  Lock,
  Cpu,
} from "lucide-react";
import { Reveal } from "@/components/landing/reveal";
import { MetricCounter } from "@/components/landing/metric-counter";
import { HeroSection } from "@/components/landing/hero-section";
import { PipelineScroll } from "@/components/landing/pipeline-scroll";

const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });

const GITHUB_URL = "https://github.com/LaeeqtheDev";
const LINKEDIN_URL = "https://www.linkedin.com/in/syed-laeeq-ahmed/";
const REPO_URL = "https://github.com/LaeeqtheDev/Act-SWE-Agent";

const metrics = [
  { value: 4, label: "microservices simulated", detail: "payments, orders, auth, notifications — real Postgres rows, real Redis events" },
  { value: 5, label: "model providers supported", detail: "Anthropic, OpenAI, Grok, Groq, and local Ollama — one interface, swap anytime" },
  { value: 9, label: "tools available to the agent", detail: "service health, K8s, web search, a real browser, local files — 2 of them gated behind approval" },
  { value: 0, prefix: "$", label: "hosted cost — bring your own key", detail: "self-host is free forever; hosted free tier needs no card either" },
];

const pipeline = [
  { icon: Zap, title: "Simulate", body: "Trigger a realistic failure through a single API call — or just ask the agent to check something." },
  { icon: Layers, title: "Queue", body: "Raw telemetry is published to Redis via BullMQ, not handled inline." },
  { icon: Search, title: "Detect", body: "An independent worker applies rule-based detection, or the agent investigates directly from chat." },
  { icon: ShieldCheck, title: "Approve", body: "Any write action — restart, rollback, a browser click — sits pending until a human says go." },
  { icon: CheckCircle2, title: "Resolve", body: "The incident closes, the timeline's recorded, and the dashboard reflects what actually happened." },
];

const agentTools = [
  { icon: HeartPulse, name: "getServiceHealth", body: "Current status of a named service.", gated: false },
  { icon: AlertCircle, name: "getRecentErrors", body: "Raw telemetry events for a service, last N minutes.", gated: false },
  { icon: Globe, name: "browseWeb", body: "Reads a real page — your own logged-in Chrome profile if configured.", gated: false },
  { icon: Box, name: "getKubernetesPodStatus", body: "Live pod phase, restarts, readiness.", gated: false },
  { icon: MousePointerClick, name: "proposeAction", body: "Click, fill, restart, or roll back — never runs on its own.", gated: true },
  { icon: Code, name: "readProjectFile", body: "Reads this codebase's own files — opt-in dev mode.", gated: false },
];

const providers = [
  { label: "Anthropic", env: "ANTHROPIC_API_KEY" },
  { label: "OpenAI", env: "OPENAI_API_KEY" },
  { label: "Grok (xAI)", env: "XAI_API_KEY" },
  { label: "Groq", env: "GROQ_API_KEY" },
  { label: "Ollama (local)", env: "no key needed" },
];

const stack = [
  { icon: Terminal, label: "Next.js + TypeScript", note: "server-rendered dashboard" },
  { icon: Database, label: "PostgreSQL + Prisma", note: "typed schema, migrations" },
  { icon: Workflow, label: "Redis + BullMQ", note: "event queue, background worker" },
  { icon: Boxes, label: "Docker + Kubernetes", note: "containerized, self-healing" },
  { icon: Bot, label: "Provider-agnostic agent", note: "Anthropic, OpenAI, Grok, Groq, Ollama" },
  { icon: ShieldCheck, label: "Permission layer", note: "human approval before writes" },
];

export default function LandingPage() {
  return (
    <div
      className={`${plexMono.variable} ${plexSans.variable} bg-background`}
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {/* Nav */}
      <nav className="relative z-10 max-w-6xl mx-auto px-6 md:px-8 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span style={{ fontFamily: "var(--font-mono)" }} className="text-sm tracking-widest uppercase text-foreground">
            Act · SWE Agent
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded px-2 py-0.5">
            MIT licensed
          </span>
        </div>
        <div className="flex items-center gap-5 text-sm">
          <Link href="/docs" className="hidden md:inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
            Docs
          </Link>
          <Link href="/case-studies" className="hidden md:inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
            Case studies
          </Link>
          <Link href="/about" className="hidden md:inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
            About
          </Link>
          <Link href="/dashboard" className="hidden sm:inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
            Incidents
          </Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-border text-foreground hover:bg-muted/50 transition-colors">
            <Star className="h-3.5 w-3.5" /> Star
          </a>
          <Link href="/agent" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">
            Chat with the agent <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </nav>

      <HeroSection />

            {/* Metrics */}
      <section className="border-y border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-14">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {metrics.map((m, i) => (
              <Reveal key={m.label} delay={i * 0.08}>
                <MetricCounter value={m.value} prefix={m.prefix} label={m.label} detail={m.detail} />
              </Reveal>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground/60 mt-8">Hover a number for what it actually means.</p>
        </div>
      </section>

      {/* Bring your own model */}
      <section className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-20">
          <div className="grid lg:grid-cols-[1fr_1.2fr] gap-12">
            <Reveal>
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
                Bring your own model
              </p>
              <h2 className="text-2xl md:text-3xl font-semibold text-foreground max-w-md">
                One agent loop. Five backends. Your choice.
              </h2>
              <p className="mt-4 text-sm text-muted-foreground max-w-md leading-relaxed">
                Every provider implements the same interface — swap
                <code className="mx-1 px-1.5 py-0.5 rounded bg-border text-foreground text-xs">AI_PROVIDER</code>
                in your <code className="px-1.5 py-0.5 rounded bg-border text-foreground text-xs">.env</code> and restart —
                no code changes, no vendor lock-in, no key ever leaves your own machine.
              </p>
            </Reveal>

            <Reveal delay={0.1} className="grid sm:grid-cols-2 gap-3">
              {providers.map((p) => (
                <div key={p.label} className="flex items-center gap-3 p-4 rounded-lg border border-border">
                  <Cpu className="h-4 w-4 text-warn shrink-0" />
                  <div>
                    <p className="text-foreground text-sm font-medium">{p.label}</p>
                    <p style={{ fontFamily: "var(--font-mono)" }} className="text-muted-foreground text-[11px] mt-0.5">{p.env}</p>
                  </div>
                </div>
              ))}
            </Reveal>
          </div>
        </div>
      </section>

      <PipelineScroll steps={pipeline} />

            {/* Inside the agent */}
      <section className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-20">
          <Reveal>
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
              Inside the agent
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold text-foreground max-w-lg">
              Real tools. Reads run free. Writes need a human.
            </h2>
            <p className="mt-4 text-sm text-muted-foreground max-w-lg leading-relaxed">
              The agent never touches the database, cluster, or a browser directly for
              anything that changes state. It calls <code className="mx-1 px-1.5 py-0.5 rounded bg-border text-foreground text-xs">proposeAction</code>,
              which only creates a pending approval — nothing executes until a person reviews it.
            </p>
          </Reveal>

          <div className="mt-10 grid md:grid-cols-2 gap-px bg-border rounded-lg overflow-hidden">
            {agentTools.map((tool, i) => (
              <Reveal key={tool.name} delay={i * 0.05} className="bg-background p-5 flex items-start gap-4">
                <tool.icon className={`h-4 w-4 shrink-0 mt-1 ${tool.gated ? "text-warn" : "text-warn"}`} />
                <div>
                  <div className="flex items-center gap-2">
                    <p style={{ fontFamily: "var(--font-mono)" }} className="text-[13px] text-foreground">{tool.name}()</p>
                    {tool.gated && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-warn border border-warn/40 rounded px-1.5 py-0.5">
                        <Lock className="h-2.5 w-2.5" /> gated
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{tool.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Stack */}
      <section className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-20">
          <Reveal>
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
              Under the hood
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold text-foreground max-w-xl">
              Built with the tools real platforms run on.
            </h2>
          </Reveal>

          <div className="mt-12 grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {stack.map((item, i) => (
              <Reveal key={item.label} delay={i * 0.05}>
                <div className="flex items-start gap-3 p-5 rounded-lg border border-border hover:border-border transition-colors h-full">
                  <item.icon className="h-5 w-5 text-warn shrink-0 mt-0.5" />
                  <div>
                    <p className="text-foreground text-sm font-medium">{item.label}</p>
                    <p className="text-muted-foreground text-xs mt-1">{item.note}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-20">
          <Reveal>
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
              Pricing
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold text-foreground max-w-xl">
              Free to fork. Simple to host.
            </h2>
          </Reveal>

          <div className="mt-12 grid md:grid-cols-3 gap-5">
            <Reveal delay={0.05}>
              <div className="h-full p-6 rounded-lg border border-border flex flex-col">
                <p className="text-foreground font-medium">Free</p>
                <p style={{ fontFamily: "var(--font-mono)" }} className="text-3xl text-foreground mt-3">$0</p>
                <p className="text-xs text-muted-foreground mt-1">10 agent tasks / month</p>
                <ul className="mt-6 space-y-2 text-sm text-muted-foreground flex-1">
                  <li>Full dashboard + chat agent</li>
                  <li>Fast/economy hosted model</li>
                  <li>All read tools + gated write tools</li>
                </ul>
                <Link href="/agent" className="mt-6 text-center px-4 py-2 rounded-md border border-border text-foreground hover:bg-muted/50 transition-colors text-sm">
                  Start free
                </Link>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <div className="h-full p-6 rounded-lg border-2 border-warn flex flex-col relative">
                <span className="absolute -top-3 left-6 text-[10px] uppercase tracking-wide bg-primary text-primary-foreground px-2 py-0.5 rounded">
                  Most popular
                </span>
                <p className="text-foreground font-medium">Pro</p>
                <p style={{ fontFamily: "var(--font-mono)" }} className="text-3xl text-foreground mt-3">
                  $30<span className="text-sm text-muted-foreground">/mo</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">500 agent tasks / month</p>
                <ul className="mt-6 space-y-2 text-sm text-muted-foreground flex-1">
                  <li>Everything in Free</li>
                  <li>Premium hosted models (GPT-4o / Sonnet class)</li>
                  <li>Priority task queue</li>
                  <li>Bring your own key instead, anytime — no lock-in</li>
                </ul>
                <Link href="/billing" className="mt-6 text-center px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity text-sm">
                  Upgrade
                </Link>
              </div>
            </Reveal>

            <Reveal delay={0.15}>
              <div className="h-full p-6 rounded-lg border border-border flex flex-col">
                <p className="text-foreground font-medium">Self-hosted</p>
                <p style={{ fontFamily: "var(--font-mono)" }} className="text-3xl text-foreground mt-3">$0</p>
                <p className="text-xs text-muted-foreground mt-1">Unlimited — MIT licensed</p>
                <ul className="mt-6 space-y-2 text-sm text-muted-foreground flex-1">
                  <li>Fork it, run it on your own infra</li>
                  <li>No task limits, no account needed</li>
                  <li>Bring your own key for any provider</li>
                </ul>
                <a href={REPO_URL} target="_blank" rel="noreferrer" className="mt-6 text-center px-4 py-2 rounded-md border border-border text-foreground hover:bg-muted/50 transition-colors text-sm">
                  Fork on GitHub
                </a>
              </div>
            </Reveal>
          </div>
          <p className="mt-6 text-xs text-muted-foreground/60">
            A &quot;task&quot; is one chat turn or one incident investigation. Developers contributing to the
            open-source core get Pro free — see <Link href="/docs" className="underline hover:text-muted-foreground">the docs</Link>.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-20 text-center">
          <Reveal className="flex flex-col items-center">
            <Key className="h-6 w-6 text-warn mb-4" />
            <h2 className="text-2xl md:text-3xl font-semibold text-foreground max-w-lg">
              Clone it. Add your key. Talk to it.
            </h2>
            <p className="mt-4 text-muted-foreground max-w-md">
              MIT licensed, self-hostable, no account required. Fork the repo and make it yours.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link href="/agent" className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">
                Chat with the agent <ArrowRight className="h-4 w-4" />
              </Link>
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-6 py-3 rounded-md border border-border text-foreground hover:bg-muted/50 transition-colors">
                <Star className="h-4 w-4" /> Star on GitHub
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <span style={{ fontFamily: "var(--font-mono)" }}>Act · SWE Agent — MIT licensed, open source</span>
          <div className="flex items-center gap-5">
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors inline-flex items-center gap-1">
              Repository <ExternalLink className="h-3 w-3" />
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors inline-flex items-center gap-1">
              GitHub <ExternalLink className="h-3 w-3" />
            </a>
            <a href={LINKEDIN_URL} target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors inline-flex items-center gap-1">
              LinkedIn <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
