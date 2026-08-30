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
  { value: 4, label: "microservices simulated" },
  { value: 5, label: "model providers supported" },
  { value: 9, label: "tools available to the agent" },
  { value: 0, prefix: "$", label: "hosted cost — bring your own key" },
];

const pipeline = [
  { icon: Zap, title: "Simulate", body: "Trigger a realistic failure through a single API call." },
  { icon: Layers, title: "Queue", body: "Raw telemetry is published to Redis via BullMQ, not handled inline." },
  { icon: Search, title: "Detect", body: "An independent worker applies rule-based detection to the queue." },
  { icon: CheckCircle2, title: "Resolve", body: "The agent investigates, a human approves, the incident closes." },
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
      className={`${plexMono.variable} ${plexSans.variable} bg-[#0B0F14]`}
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {/* Nav */}
      <nav className="relative z-10 max-w-6xl mx-auto px-6 md:px-8 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span style={{ fontFamily: "var(--font-mono)" }} className="text-sm tracking-widest uppercase text-[#E8ECEF]">
            Act · SWE Agent
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-[#7C8A99] border border-[#2A3644] rounded px-2 py-0.5">
            MIT licensed
          </span>
        </div>
        <div className="flex items-center gap-5 text-sm">
          <Link href="/docs" className="hidden md:inline-flex items-center gap-1 text-[#7C8A99] hover:text-[#E8ECEF] transition-colors">
            Docs
          </Link>
          <Link href="/case-studies" className="hidden md:inline-flex items-center gap-1 text-[#7C8A99] hover:text-[#E8ECEF] transition-colors">
            Case studies
          </Link>
          <Link href="/about" className="hidden md:inline-flex items-center gap-1 text-[#7C8A99] hover:text-[#E8ECEF] transition-colors">
            About
          </Link>
          <Link href="/dashboard" className="hidden sm:inline-flex items-center gap-1 text-[#7C8A99] hover:text-[#E8ECEF] transition-colors">
            Incidents
          </Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-[#2A3644] text-[#E8ECEF] hover:border-[#3A4656] transition-colors">
            <Star className="h-3.5 w-3.5" /> Star
          </a>
          <Link href="/agent" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#E8ECEF] text-[#0B0F14] font-medium hover:opacity-90 transition-opacity">
            Chat with the agent <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </nav>

      <HeroSection />

            {/* Metrics */}
      <section className="border-y border-[#1E2630] bg-[#0D131C]">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-14">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {metrics.map((m, i) => (
              <Reveal key={m.label} delay={i * 0.08}>
                <MetricCounter value={m.value} prefix={m.prefix} label={m.label} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Bring your own model */}
      <section className="border-b border-[#1E2630]">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-20">
          <div className="grid lg:grid-cols-[1fr_1.2fr] gap-12">
            <Reveal>
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-[#7C8A99] mb-3">
                Bring your own model
              </p>
              <h2 className="text-2xl md:text-3xl font-semibold text-[#E8ECEF] max-w-md">
                One agent loop. Five backends. Your choice.
              </h2>
              <p className="mt-4 text-sm text-[#7C8A99] max-w-md leading-relaxed">
                Every provider implements the same interface — swap
                <code className="mx-1 px-1.5 py-0.5 rounded bg-[#1E2630] text-[#E8ECEF] text-xs">AI_PROVIDER</code>
                in your <code className="px-1.5 py-0.5 rounded bg-[#1E2630] text-[#E8ECEF] text-xs">.env</code> and restart —
                no code changes, no vendor lock-in, no key ever leaves your own machine.
              </p>
            </Reveal>

            <Reveal delay={0.1} className="grid sm:grid-cols-2 gap-3">
              {providers.map((p) => (
                <div key={p.label} className="flex items-center gap-3 p-4 rounded-lg border border-[#1E2630]">
                  <Cpu className="h-4 w-4 text-[#35C7C0] shrink-0" />
                  <div>
                    <p className="text-[#E8ECEF] text-sm font-medium">{p.label}</p>
                    <p style={{ fontFamily: "var(--font-mono)" }} className="text-[#7C8A99] text-[11px] mt-0.5">{p.env}</p>
                  </div>
                </div>
              ))}
            </Reveal>
          </div>
        </div>
      </section>

      <PipelineScroll steps={pipeline} />

            {/* Inside the agent */}
      <section className="border-b border-[#1E2630] bg-[#0D131C]">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-20">
          <Reveal>
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-[#7C8A99] mb-3">
              Inside the agent
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold text-[#E8ECEF] max-w-lg">
              Real tools. Reads run free. Writes need a human.
            </h2>
            <p className="mt-4 text-sm text-[#7C8A99] max-w-lg leading-relaxed">
              The agent never touches the database, cluster, or a browser directly for
              anything that changes state. It calls <code className="mx-1 px-1.5 py-0.5 rounded bg-[#1E2630] text-[#E8ECEF] text-xs">proposeAction</code>,
              which only creates a pending approval — nothing executes until a person reviews it.
            </p>
          </Reveal>

          <div className="mt-10 grid md:grid-cols-2 gap-px bg-[#1E2630] rounded-lg overflow-hidden">
            {agentTools.map((tool, i) => (
              <Reveal key={tool.name} delay={i * 0.05} className="bg-[#0B0F14] p-5 flex items-start gap-4">
                <tool.icon className={`h-4 w-4 shrink-0 mt-1 ${tool.gated ? "text-[#F5A623]" : "text-[#35C7C0]"}`} />
                <div>
                  <div className="flex items-center gap-2">
                    <p style={{ fontFamily: "var(--font-mono)" }} className="text-[13px] text-[#E8ECEF]">{tool.name}()</p>
                    {tool.gated && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-[#F5A623] border border-[#3A2F1A] rounded px-1.5 py-0.5">
                        <Lock className="h-2.5 w-2.5" /> gated
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[#7C8A99] mt-0.5">{tool.body}</p>
                </div>
              </Reveal>
            ))}
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

      {/* Pricing */}
      <section className="border-b border-[#1E2630] bg-[#0D131C]">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-20">
          <Reveal>
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-[#7C8A99] mb-3">
              Pricing
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold text-[#E8ECEF] max-w-xl">
              Free to fork. Simple to host.
            </h2>
          </Reveal>

          <div className="mt-12 grid md:grid-cols-3 gap-5">
            <Reveal delay={0.05}>
              <div className="h-full p-6 rounded-lg border border-[#1E2630] flex flex-col">
                <p className="text-[#E8ECEF] font-medium">Free</p>
                <p style={{ fontFamily: "var(--font-mono)" }} className="text-3xl text-[#E8ECEF] mt-3">$0</p>
                <p className="text-xs text-[#7C8A99] mt-1">10 agent tasks / month</p>
                <ul className="mt-6 space-y-2 text-sm text-[#9AA7B4] flex-1">
                  <li>Full dashboard + chat agent</li>
                  <li>Fast/economy hosted model</li>
                  <li>All read tools + gated write tools</li>
                </ul>
                <Link href="/agent" className="mt-6 text-center px-4 py-2 rounded-md border border-[#2A3644] text-[#E8ECEF] hover:border-[#3A4656] transition-colors text-sm">
                  Start free
                </Link>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <div className="h-full p-6 rounded-lg border-2 border-[#35C7C0] flex flex-col relative">
                <span className="absolute -top-3 left-6 text-[10px] uppercase tracking-wide bg-[#35C7C0] text-[#0B0F14] px-2 py-0.5 rounded">
                  Most popular
                </span>
                <p className="text-[#E8ECEF] font-medium">Pro</p>
                <p style={{ fontFamily: "var(--font-mono)" }} className="text-3xl text-[#E8ECEF] mt-3">
                  $30<span className="text-sm text-[#7C8A99]">/mo</span>
                </p>
                <p className="text-xs text-[#7C8A99] mt-1">500 agent tasks / month</p>
                <ul className="mt-6 space-y-2 text-sm text-[#9AA7B4] flex-1">
                  <li>Everything in Free</li>
                  <li>Premium hosted models (GPT-4o / Sonnet class)</li>
                  <li>Priority task queue</li>
                  <li>Bring your own key instead, anytime — no lock-in</li>
                </ul>
                <Link href="/agent" className="mt-6 text-center px-4 py-2 rounded-md bg-[#35C7C0] text-[#0B0F14] font-medium hover:opacity-90 transition-opacity text-sm">
                  Upgrade
                </Link>
              </div>
            </Reveal>

            <Reveal delay={0.15}>
              <div className="h-full p-6 rounded-lg border border-[#1E2630] flex flex-col">
                <p className="text-[#E8ECEF] font-medium">Self-hosted</p>
                <p style={{ fontFamily: "var(--font-mono)" }} className="text-3xl text-[#E8ECEF] mt-3">$0</p>
                <p className="text-xs text-[#7C8A99] mt-1">Unlimited — MIT licensed</p>
                <ul className="mt-6 space-y-2 text-sm text-[#9AA7B4] flex-1">
                  <li>Fork it, run it on your own infra</li>
                  <li>No task limits, no account needed</li>
                  <li>Bring your own key for any provider</li>
                </ul>
                <a href={REPO_URL} target="_blank" rel="noreferrer" className="mt-6 text-center px-4 py-2 rounded-md border border-[#2A3644] text-[#E8ECEF] hover:border-[#3A4656] transition-colors text-sm">
                  Fork on GitHub
                </a>
              </div>
            </Reveal>
          </div>
          <p className="mt-6 text-xs text-[#4A5568]">
            A &quot;task&quot; is one chat turn or one incident investigation. Developers contributing to the
            open-source core get Pro free — see <Link href="/docs" className="underline hover:text-[#7C8A99]">the docs</Link>.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-20 text-center">
          <Reveal className="flex flex-col items-center">
            <Key className="h-6 w-6 text-[#35C7C0] mb-4" />
            <h2 className="text-2xl md:text-3xl font-semibold text-[#E8ECEF] max-w-lg">
              Clone it. Add your key. Talk to it.
            </h2>
            <p className="mt-4 text-[#7C8A99] max-w-md">
              MIT licensed, self-hostable, no account required. Fork the repo and make it yours.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link href="/agent" className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-[#E8ECEF] text-[#0B0F14] font-medium hover:opacity-90 transition-opacity">
                Chat with the agent <ArrowRight className="h-4 w-4" />
              </Link>
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-6 py-3 rounded-md border border-[#2A3644] text-[#E8ECEF] hover:border-[#3A4656] transition-colors">
                <Star className="h-4 w-4" /> Star on GitHub
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-[#1E2630]">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#7C8A99]">
          <span style={{ fontFamily: "var(--font-mono)" }}>Act · SWE Agent — MIT licensed, open source</span>
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
