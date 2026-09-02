import Link from "next/link";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import {
  ArrowRight,
  ExternalLink,
  GitFork,
  Star,
  Search,
  Mail,
  Activity,
  Briefcase,
  MessageSquare,
  Clock,
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
import { HeroSection } from "@/components/landing/hero-section";
import { PipelineScroll } from "@/components/landing/pipeline-scroll";
import { DemoChat } from "@/components/landing/demo-chat";
import { AuthNav } from "@/components/auth/auth-nav";
import { Comparison } from "@/components/landing/comparison";

const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });

const GITHUB_URL = "https://github.com/LaeeqtheDev";
const LINKEDIN_URL = "https://www.linkedin.com/in/syed-laeeq-ahmed/";
const REPO_URL = "https://github.com/LaeeqtheDev/Act-SWE-Agent";

// Concrete things the agent actually does, in the user's own words —
// replaces the abstract "4 services / 9 tools" counters, which described
// the codebase rather than the value.
const useCases = [
  {
    icon: "briefcase" as const,
    prompt: "Find backend roles at Stripe and apply to the best fit",
    body: "Browses the careers page, opens each listing, reads the requirements, then fills the application with your saved details — you approve before anything is sent.",
  },
  {
    icon: "mail" as const,
    prompt: "What came in overnight that actually needs me?",
    body: "Reads your real inbox in your own logged-in Gmail, separates the noise from what's waiting on you, and drafts replies you review before they go out.",
  },
  {
    icon: "search" as const,
    prompt: "Compare these three vendors and put it in a doc",
    body: "Searches, opens each site, pulls out pricing and terms, and writes up the comparison as a document you can actually use.",
  },
  {
    icon: "message" as const,
    prompt: "Catch me up on the #incidents channel",
    body: "Opens Slack with your existing session, reads the thread, and tells you what happened and what's still open.",
  },
  {
    icon: "activity" as const,
    prompt: "Is payments-api healthy? Restart it if not.",
    body: "Checks live service health and Kubernetes pod status, then proposes the restart — pending your approval, never automatic.",
  },
  {
    icon: "clock" as const,
    prompt: "Do that every morning at 9",
    body: "Any of the above becomes a scheduled workflow that runs unattended and remembers what it found last time.",
  },
];

const workflowExamples = [
  {
    icon: "mail" as const,
    cadence: "Every morning",
    title: "Inbox triage",
    body: "Read overnight email in your own logged-in Gmail, summarize what actually needs a reply, and flag anything urgent.",
  },
  {
    icon: "search" as const,
    cadence: "Every 6 hours",
    title: "Job hunting",
    body: "Check a company's careers page for new roles matching your stack, and surface only what's actually new since the last run.",
  },
  {
    icon: "activity" as const,
    cadence: "Every 30 minutes",
    title: "Service watch",
    body: "Check service health and Kubernetes pod status, and propose a restart for anything degraded — pending your approval.",
  },
];

// Icons are resolved here, inside the server component's own JSX, rather
// than stored as component references in the array above — React can't
// serialize a component function across the server/client boundary when
// these get passed into <Reveal>.
const workflowIcons = { mail: Mail, search: Search, activity: Activity };
const useCaseIcons = { briefcase: Briefcase, mail: Mail, search: Search, message: MessageSquare, activity: Activity, clock: Clock };

const pipeline = [
  { icon: "zap" as const, title: "Simulate", body: "Trigger a realistic failure through a single API call — or just ask the agent to check something." },
  { icon: "layers" as const, title: "Queue", body: "Raw telemetry is published to Redis via BullMQ, not handled inline." },
  { icon: "search" as const, title: "Detect", body: "An independent worker applies rule-based detection, or the agent investigates directly from chat." },
  { icon: "shield" as const, title: "Approve", body: "Any write action — restart, rollback, a browser click — sits pending until a human says go." },
  { icon: "check" as const, title: "Resolve", body: "The incident closes, the timeline's recorded, and the dashboard reflects what actually happened." },
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={26} height={26} className="rounded-md" />
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
          <AuthNav />
        </div>
      </nav>

      <HeroSection />

      {/* Live demo — the highest-leverage thing on this page: people try
          things, they don't read feature lists. */}
      <section className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 md:px-8 py-20">
          <Reveal className="text-center mb-6">
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
              No signup
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold text-foreground">Try it right now.</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              A small read-only slice of the real agent — ask it about the demo services below.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <DemoChat />
          </Reveal>
        </div>
      </section>

      {/* What it does */}
      <section className="border-y border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-20">
          <Reveal>
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-warn mb-3">
              What you can ask it
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold text-foreground max-w-2xl">
              Real requests, handled end to end.
            </h2>
            <p className="mt-4 text-sm md:text-base text-muted-foreground max-w-2xl leading-relaxed">
              Not a chatbot that tells you how to do something. It opens the browser, clicks through,
              reads what&apos;s there, and comes back with the thing you asked for.
            </p>
          </Reveal>

          <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {useCases.map((u, i) => {
              const Icon = useCaseIcons[u.icon];
              return (
                <Reveal key={u.prompt} delay={i * 0.06}>
                  <div className="h-full p-6 rounded-lg border border-border bg-background flex flex-col">
                    <Icon className="h-5 w-5 text-warn mb-4" />
                    <p style={{ fontFamily: "var(--font-mono)" }} className="text-sm text-foreground mb-3 leading-snug">
                      &ldquo;{u.prompt}&rdquo;
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed flex-1">{u.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="border-b border-border">
        <div className="py-20">
          <div className="max-w-4xl mx-auto px-6 md:px-8 mb-10">
            <Reveal>
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-warn mb-3">
                The difference
              </p>
              <h2 className="text-2xl md:text-3xl font-semibold text-foreground max-w-2xl">
                Most AI tells you what to do. This does it.
              </h2>
            </Reveal>
          </div>
          <Comparison />
        </div>
      </section>

      {/* Workflows */}
      <section className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-20">
          <Reveal>
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-warn mb-3">
              Workflows
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold text-foreground max-w-2xl">
              Give it a schedule and it keeps working without you.
            </h2>
            <p className="mt-4 text-sm md:text-base text-muted-foreground max-w-2xl leading-relaxed">
              Describe a task in plain language, pick how often it should run, and the agent handles it
              unattended — same tools, same browser, same approval gate on anything that writes. Every run
              of a workflow shares one ongoing conversation, so the tenth run still remembers what the
              first nine found.
            </p>
          </Reveal>

          <div className="mt-12 grid md:grid-cols-3 gap-5">
            {workflowExamples.map((w, i) => {
              const Icon = workflowIcons[w.icon];
              return (
              <Reveal key={w.title} delay={i * 0.08}>
                <div className="h-full p-6 rounded-lg border border-border flex flex-col">
                  <Icon className="h-5 w-5 text-muted-foreground mb-4" />
                  <p style={{ fontFamily: "var(--font-mono)" }} className="text-[11px] uppercase tracking-wide text-muted-foreground/60 mb-2">
                    {w.cadence}
                  </p>
                  <h3 className="text-foreground font-medium mb-2">{w.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed flex-1">{w.body}</p>
                </div>
              </Reveal>
              );
            })}
          </div>

          <Reveal delay={0.3}>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/workflows" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md border border-border text-foreground hover:bg-muted/50 transition-colors text-sm">
                Set up a workflow <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <span className="text-xs text-muted-foreground/70">
                Results land in your notifications — and by email, if you configure SMTP.
              </span>
            </div>
          </Reveal>
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
