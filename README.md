# Act-SWE-Agent

**AI-powered incident response & cloud operations platform** — a miniature, self-built version of the Datadog + PagerDuty + AI-SRE-agent stack, built to demonstrate full-stack, distributed-systems, cloud-native, and AI-agent engineering in one project.

A landing page, live dashboard, event-driven backend, Kubernetes deployment, and a real AI agent that investigates incidents — with the pieces that need your own cloud credentials, API keys, or hands-on commands clearly called out in **[NEXT_STEPS.md](./NEXT_STEPS.md)**.

---

## What it does

Act-SWE-Agent simulates a small fleet of microservices (`payments-api`, `orders-api`, `auth-api`, `notification-api`) and gives you the tools to:

1. **Trigger a realistic failure** — a simulator endpoint fakes a database-connection-exhaustion or pod-crash-loop scenario, emitting a burst of timestamped events.
2. **Detect it automatically** — a background worker consumes those events off a Redis queue and applies threshold/pattern-based rules to decide whether they add up to a real incident.
3. **Investigate it with AI** — a real tool-calling agent (Anthropic API) pulls service health, recent events, incident history, and live Kubernetes pod/cluster data, then produces a structured root-cause report with a confidence score.
4. **Gate write actions behind human approval** — the agent can *propose* an action (restart a pod, roll back), but nothing executes until a person approves it.
5. **Surface it all on a live dashboard** — services flip from healthy to degraded, incidents appear with severity badges, and each has a full event timeline plus an "Investigate with AI" button.
6. **Resolve it** — closing the loop a real on-call engineer runs.

---

## Architecture

```
Landing Page (Next.js)
        │
        ▼
   Dashboard ──────► Express API ──────► PostgreSQL (Prisma ORM)
        │                   │
        │                   ▼
        │             Redis Queue (BullMQ)
        │                   │
        │                   ▼
        │           Background Worker ──► Rule-based Detection ──► Incident + Timeline
        │                   │
        └───────────────────┴──────► AI Agent (Anthropic tool-calling)
                                            │
                                            ▼
                              Permission Layer ──► Kubernetes (read/write, human-gated)
```

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + GSAP + three.js — a marketing landing page at `/` and a server-rendered live dashboard at `/dashboard`
- **Backend:** Express (TypeScript) — REST API for services, incidents, simulation, agent investigations, and action approval
- **Database:** PostgreSQL via Prisma ORM
- **Queue:** Redis + BullMQ — decouples ingestion from analysis, running as its own container/process
- **AI Agent:** Anthropic tool-calling loop with a fixed tool menu (`getServiceHealth`, `getRecentErrors`, `getDeploymentHistory`, `getKubernetesPodStatus`, `getKubernetesEvents`) and a structured JSON output contract
- **Permission layer:** proposed write actions (`restart_pod`, `rollback`) are stored as `pending` and only execute once approved via `/actions/:id/approve`
- **Containerization:** Docker (multi-stage builds) + Docker Compose — Postgres, Redis, API, worker, and web all run with one command
- **Orchestration:** Kubernetes manifests for all four services, proven self-healing (see `infrastructure/kubernetes/`)
- **IaC:** Terraform scaffold for AWS (EKS, RDS, ElastiCache, ECR) in `infrastructure/aws/`
- **CI/CD:** GitHub Actions workflow — lint/build/Docker-build on every push, deploy-to-EKS on `main` once AWS secrets are configured
- **Observability:** optional Prometheus + Grafana + OTel Collector stack (`docker compose --profile observability up`)

## Monorepo layout

```
act-swe-agent/
├── apps/
│   ├── web/                  # Next.js — landing page + dashboard
│   └── api/                  # Express API, BullMQ worker, AI agent, K8s client
├── packages/
│   └── types/                 # Shared TypeScript types
├── infrastructure/
│   ├── kubernetes/             # K8s manifests + image-load helper script
│   └── aws/                    # Terraform scaffold (EKS, RDS, ElastiCache, ECR)
├── observability/               # Prometheus + OTel Collector config
├── .github/workflows/            # CI/CD pipeline
└── docker-compose.yml
```

---

## Features implemented

- ✅ Landing page with a GSAP-animated signature moment (an incident signal spiking then healing), a quiet three.js node-cluster hero background, and scroll-triggered reveals — built as its own distinct visual identity from the dashboard's utilitarian UI
- ✅ Real-time dashboard: services grid, incident list, live summary stats, full event timelines
- ✅ Two failure-simulation scenarios, each using a different detection rule
- ✅ Fully event-driven backend: simulator → Redis queue → independent worker → detection → incident
- ✅ **AI agent (Sprint 7):** real Anthropic tool-calling loop; investigates an incident using DB + live Kubernetes data and returns a structured root-cause report with a confidence score, shown right in the incident dialog
- ✅ **Permission layer (Sprint 8):** agent-proposed actions require explicit human approval before anything executes against the cluster
- ✅ Full Docker Compose stack, including the worker as its own container
- ✅ Kubernetes manifests for all four services (self-healing proven for `payments-api`; the same pattern applies to the rest)
- ✅ Terraform scaffold for AWS (EKS/RDS/ElastiCache/ECR)
- ✅ GitHub Actions CI/CD pipeline (CI runs standalone; CD activates once AWS secrets are set)
- ✅ Optional observability stack scaffolded (Prometheus, Grafana, OTel Collector)

## What's left — see [NEXT_STEPS.md](./NEXT_STEPS.md)

Everything above is real, working code — but several pieces genuinely can't be run, tested, or provisioned from where this was built, because they need *your* machine, cloud account, or API keys:

- Installing the new dependencies and running the DB migration for the AI agent
- Setting your `ANTHROPIC_API_KEY`
- Building/loading images and applying the Kubernetes manifests for the three remaining services
- Reviewing and applying the Terraform AWS scaffold (real cost, needs your credentials)
- Adding GitHub Actions secrets to activate the CD half of the pipeline
- Finishing OTel instrumentation + a Grafana dashboard against real metrics

**NEXT_STEPS.md has the exact commands, in order, for all of it.**

---

## Running it locally

**Prerequisites:** Node.js 20+, pnpm, Docker Desktop

```bash
git clone https://github.com/LaeeqtheDev/Act-SWE-Agent.git
cd Act-SWE-Agent
pnpm install
docker compose up --build
```

- Landing page: [http://localhost:3000](http://localhost:3000)
- Dashboard: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- API: [http://localhost:4000](http://localhost:4000)

First run:
```bash
docker compose exec api pnpm exec prisma migrate deploy
docker compose exec api pnpm exec prisma db seed
```

Trigger a simulated incident:
```bash
curl -X POST http://localhost:4000/simulate/database-overload \
  -H "Content-Type: application/json" \
  -d '{"serviceName": "payments-api"}'
```

Refresh the dashboard, open the incident, and click **Investigate with AI** (needs `ANTHROPIC_API_KEY` set — see `.env.example`).

---

## Why this project

Real interview conversations about "have you worked with Kubernetes?" or "tell me about an AI agent you built" are a lot more convincing backed by something you can actually walk through — the architecture decisions, the failure modes you hit, and how you debugged them — than a line on a CV. This project exists to make those conversations concrete.
