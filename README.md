# Act SWE Agent

**A chat-first, open-source, model-agnostic AI SRE agent.** Point it at Anthropic, OpenAI, Grok (xAI), Groq, or a local Ollama model — bring your own key, nothing hosted, MIT licensed. It talks to you like Claude or ChatGPT, but it can check your services, browse the real web in a real visible browser window, and read/edit this project's own code — with every write action gated behind your explicit approval before it touches anything.

Pieces that need your own cloud credentials, API keys, or hands-on commands are called out in **[NEXT_STEPS.md](./NEXT_STEPS.md)**. See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for adding a new model provider or agent tool.

---

## What it does

- **Chat with it** at `/agent` — ask how a service is doing, have it investigate an incident, tell it to look something up, or ask it to open a page for you. It calls real tools and reports back, not a scripted demo.
- **Watch it browse** — with `BROWSER_HEADLESS=false`, a real Chrome/Chromium window opens on your screen and stays open across the conversation — the agent keeps working in the same window/tab instead of spawning a new one per action. Set `CHROME_USER_DATA_DIR` to hand it your own already-logged-in Chrome profile for a persistent, real session.
- **Give it write access, safely** — restarting a Kubernetes pod, clicking or filling something in a browser, editing a file, running a shell command: every single one of these only ever creates a *pending* action. Nothing executes until you click approve.
- **Pick your model from the UI** — a settings panel with a provider grid and model dropdown; paste an API key once and it's stored encrypted, never shown again (just a masked preview).
- **See the operations picture, not noise** — the dashboard shows what Kubernetes self-healed on its own vs. what actually needed the agent, plus a live feed of every action the agent has proposed or completed.
- **Simulate real incidents** — a database-overload and a pod-crash-loop scenario, each detected by a different rule (event co-occurrence vs. a restart-count threshold), flowing through a real Redis/BullMQ queue and an independent worker process.

---

## Architecture

```
Landing Page (Next.js)
        │
        ▼
Chat Console ──────► Express API ──────► PostgreSQL (Prisma ORM)
   (/agent)                │                    │
        │                  ▼                    ▼
        │            Shared Tool Menu      Encrypted Settings
        │        (DB / K8s / browser /       (BYOK, per-provider)
        │         local files / propose)
        │                  │
        │                  ▼
        │           AI Provider Layer
        │       (Anthropic / OpenAI-compatible:
        │        OpenAI, Grok, Groq, Ollama)
        │
        ▼
Dashboard (/dashboard) ──► Redis Queue (BullMQ) ──► Worker ──► Rule-based Detection
```

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + GSAP + three.js — a marketing landing page, a chat console with conversation history, and an operations dashboard
- **Backend:** Express (TypeScript) — chat, incident/service data, simulation, agent investigation, and action approval
- **AI provider layer:** one interface, swappable at runtime via a settings UI or `AI_PROVIDER` env var — Anthropic natively, everything else (OpenAI, Grok, Groq, Ollama) through a single OpenAI-compatible adapter
- **Tool menu (shared across chat and incident investigation):** service health, telemetry, incident history, live Kubernetes pod/cluster data, web search, a real browser (with session continuity), local project file read/list/open, and `proposeAction` — the one gate every write goes through
- **Database:** PostgreSQL via Prisma — services, incidents, chat conversations/messages, agent actions, and encrypted provider settings
- **Queue:** Redis + BullMQ — the simulator publishes events, an independent worker consumes them and applies detection rules
- **Containerization:** Docker (multi-stage builds) + Docker Compose
- **Orchestration:** Kubernetes manifests for all four simulated services, self-healing verified

## Monorepo layout

```
act-swe-agent/
├── apps/
│   ├── web/                   # Next.js — landing, chat console, dashboard
│   └── api/
│       └── src/
│           ├── providers/       # AI provider abstraction (Anthropic + OpenAI-compatible)
│           ├── tools/            # Shared tool menu: browser, search, k8s, devtools
│           ├── chat.ts            # Conversational agent loop
│           ├── agent.ts           # Incident-investigation agent loop
│           └── settings.ts         # Encrypted BYOK provider settings
├── packages/types/              # Shared TypeScript types
├── infrastructure/
│   ├── kubernetes/               # K8s manifests + image-load helper script
│   └── aws/                       # Terraform scaffold (EKS, RDS, ElastiCache, ECR)
├── observability/                  # Prometheus + OTel Collector config
├── .github/workflows/                # CI/CD pipeline
└── docker-compose.yml
```

Managed with **Turborepo + pnpm workspaces**.

---

## Features implemented

- ✅ **Chat console** (`/agent`) — multi-conversation sidebar, auto-titled chats, tool-call trace shown inline, persisted history
- ✅ **Provider-agnostic AI layer** — Anthropic, OpenAI, Grok, Groq, Ollama, selectable from the UI with an encrypted key store (AES-256-GCM), masked after saving
- ✅ **Real browser tool** — visible window, persistent single-tab session across a conversation, graceful recovery if you close it, capped output sizes to survive small free-tier rate limits
- ✅ **Web search** (no API key needed) + **local dev tools** (read/list project files, open in VS Code, propose file edits and shell commands — opt-in, gated)
- ✅ **Permission layer** — every write (pod restart, rollback, browser click/fill, file edit, shell command) is a pending `AgentAction` until a human approves it
- ✅ **Operations dashboard** — self-healed vs. agent-handled vs. needs-attention, derived from real data, plus a global agent-activity feed with inline approve/reject
- ✅ **Event-driven backend** — simulator → Redis queue → independent worker → rule-based detection → incident
- ✅ **Full Docker Compose stack** including the worker as its own container
- ✅ **Kubernetes manifests** for all four services, self-healing proven
- ✅ **Terraform scaffold** for AWS (EKS/RDS/ElastiCache/ECR) — reviewed, not yet applied
- ✅ **GitHub Actions CI/CD** — lint/build/Docker-build on every push; deploy activates once AWS secrets are set
- ✅ **Landing page** — scroll-scrubbed three.js hero, pinned horizontal pipeline section, About/Case Studies/Docs pages, pricing tiers

## What's left — see [NEXT_STEPS.md](./NEXT_STEPS.md)

Honest list of what's real but needs your own setup: running the latest Prisma migrations, generating a settings encryption key, installing Playwright's browser binary, setting `CHROME_USER_DATA_DIR` for persistent logins, applying the Kubernetes manifests, reviewing and applying the Terraform scaffold, adding CI/CD secrets, and finishing OTel instrumentation.

**Now built (opt-in, off by default):** Clerk auth + usage limits (10 free tasks/month, 500 on Pro), Stripe checkout, a manually-reviewed bank-transfer path, and premium-model gating by plan — see [NEXT_STEPS.md](./NEXT_STEPS.md) #17-19. Self-hosting is completely unaffected; `HOSTED_MODE` stays unset and none of this code path ever runs.

**Not yet built:** fine-tuning, a UI for reviewing bank-transfer receipts (currently admin API calls), Stripe customer-portal cancellation.

---

## Running it locally

**Prerequisites:** Node.js 20+, pnpm, Docker Desktop

```bash
git clone https://github.com/LaeeqtheDev/Act-SWE-Agent.git
cd Act-SWE-Agent
pnpm install
docker compose up postgres redis -d
cd apps/api && pnpm exec prisma migrate dev && cd ../..
cp apps/api/.env.example apps/api/.env   # add at least one AI provider key
pnpm --filter api dev      # terminal 1
pnpm --filter api worker   # terminal 2
pnpm --filter web dev      # terminal 3
```

- Landing page: [http://localhost:3000](http://localhost:3000)
- Chat: [http://localhost:3000/agent](http://localhost:3000/agent)
- Dashboard: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- API: [http://localhost:4000](http://localhost:4000)

Full setup notes — the browser/session options, local dev tools opt-in, Kubernetes, AWS — are in **[NEXT_STEPS.md](./NEXT_STEPS.md)**.

---

## Why this project

Real interview conversations about "have you worked with Kubernetes?" or "tell me about an AI agent you built" are a lot more convincing backed by something you can actually walk through — the architecture decisions, the failure modes you hit, and how you debugged them — than a line on a CV. This project exists to make those conversations concrete.
