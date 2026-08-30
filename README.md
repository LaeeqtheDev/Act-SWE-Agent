# Act-SWE-Agent

**AI-powered incident response & cloud operations platform** — a miniature, self-built version of the Datadog + PagerDuty + AI-SRE-agent stack, built to demonstrate full-stack, distributed-systems, and cloud-native engineering in one project.

---

## What it does

Act-SWE-Agent simulates a small fleet of microservices (`payments-api`, `orders-api`, `auth-api`, `notification-api`) and gives you the tools to:

1. **Trigger a realistic failure** — a simulator endpoint fakes a database-connection-exhaustion or pod-crash-loop scenario, emitting a burst of timestamped events, just like real infrastructure telemetry would.
2. **Detect it automatically** — a background worker consumes those events off a queue and applies threshold/pattern-based rules to decide whether they add up to a real incident.
3. **Surface it on a live dashboard** — services flip from healthy to degraded, a new incident appears with a severity badge, and clicking it opens a full event timeline.
4. **Resolve it** — a "Mark Resolved" action closes the incident and restores the service to healthy, closing the loop.

The goal isn't to compete with Datadog or PagerDuty commercially — it's to build a credible miniature of the *architecture* those tools run on, end to end.

---

## Architecture

```
Next.js Dashboard
       │
       ▼
  Express API ──────► PostgreSQL (Prisma ORM)
       │
       ▼
  Redis Queue (BullMQ)
       │
       ▼
Background Worker ──► Rule-based Detection ──► Incident + Timeline
```

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui — server-rendered dashboard with a client-side incident timeline modal
- **Backend:** Express (TypeScript) — REST API for services, incidents, and simulation endpoints
- **Database:** PostgreSQL via Prisma ORM — typed schema, migrations, seeding
- **Queue:** Redis + BullMQ — decouples "an event happened" from "something processed it," mirroring how real observability pipelines separate ingestion from analysis
- **Containerization:** Docker (multi-stage builds) + Docker Compose — the full stack (Postgres, Redis, API, web) runs with one command
- **Orchestration (in progress):** Kubernetes — one service (`payments-api`) deployed as a real K8s Deployment on a local `kind`-based cluster (via Docker Desktop), with self-healing verified by manually killing a pod and watching Kubernetes replace it automatically

## Monorepo layout

```
act-swe-agent/
├── apps/
│   ├── web/          # Next.js dashboard
│   └── api/           # Express API + BullMQ worker
├── packages/
│   └── types/          # Shared TypeScript types (Service, Incident, IncidentEvent)
├── infrastructure/
│   └── kubernetes/      # K8s deployment manifests
└── docker-compose.yml
```

Managed with **Turborepo + pnpm workspaces**, so the frontend and backend share a single source of truth for data shapes via `@sentinelops/types` instead of duplicating interfaces.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, TypeScript, Tailwind CSS, shadcn/ui (Radix), Lucide icons |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL, Prisma ORM |
| Queue / Workers | Redis, BullMQ |
| Containerization | Docker, Docker Compose |
| Orchestration | Kubernetes (local, via Docker Desktop / kind) |
| Tooling | Turborepo, pnpm workspaces |

---

## Features implemented

- ✅ Real-time dashboard with services grid, incident list, and live summary stats
- ✅ Incident detail view with a full, dynamically generated event timeline
- ✅ Two independent failure-simulation scenarios (database overload, pod crash loop), each using a **different detection rule** (co-occurrence of event types vs. a restart-count threshold) — deliberately built to show the detection engine supports more than one pattern-matching strategy
- ✅ Manual incident resolution flow
- ✅ Fully event-driven backend: simulator publishes to a Redis queue; a completely separate worker process consumes it, applies detection rules, and writes the result — API and processing are decoupled, not synchronous
- ✅ Full Docker Compose stack: Postgres, Redis, API, and web all run together with `docker compose up`
- ✅ One service deployed as a real Kubernetes Deployment, with verified self-healing (pod deleted manually → Kubernetes automatically replaced it)

## In progress / known limitations

This project prioritizes *breadth of real, working infrastructure* over polishing every corner. A few things are intentionally left as next steps:

- **Kubernetes networking fix pending:** the deployed `payments-api` pod needs its Redis connection env var wired through correctly inside the cluster — the deployment mechanism and self-healing are proven, this is a small remaining configuration detail.
- Only `payments-api` is deployed to Kubernetes so far; the pattern is proven and repeatable for the other three services.
- `pod-crash-loop` still uses the earlier synchronous (pre-queue) detection path, not yet migrated to the worker.
- No AI agent yet — detection is currently rule-based (if/then thresholds), not LLM-driven. This is the next major feature (see Roadmap).
- No AWS deployment yet — everything currently runs locally.
- No CI/CD pipeline yet.
- No formal test suite yet.

None of these block the app from running and demonstrating the core architecture — they're the next layers to build.

---

## Roadmap

The project follows a phased build-out, in order:

1. ~~Core domain + Postgres + Express API~~ ✅
2. ~~Simulator + rule-based detection~~ ✅
3. ~~Dockerize the full stack~~ ✅
4. ~~Redis + BullMQ event-driven workers~~ ✅
5. 🔄 Kubernetes deployment (in progress)
6. K8s integration — API reads real cluster state (pods, events, logs) instead of simulated rows
7. **AI Agent v1** — real tool-calling loop against an LLM API; the agent investigates an incident using tools like `getServiceHealth()`, `getPodLogs()`, `getRecentErrors()` and produces a probable root cause with a confidence score and evidence trail
8. Permission layer — AI-suggested actions (like a rollback) require human approval before executing, with a full audit log
9. AWS deployment (EKS, RDS, ElastiCache)
10. CI/CD pipeline (GitHub Actions → build → deploy → health check → auto-rollback)
11. Observability (OpenTelemetry, Prometheus, Grafana) — the AI's confidence score gets backed by real metrics instead of synthetic data
12. Polish + full architecture write-up

---

## Running it locally

**Prerequisites:** Node.js 20+, pnpm, Docker Desktop

```bash
git clone https://github.com/LaeeqtheDev/Act-SWE-Agent.git
cd Act-SWE-Agent
docker compose up --build
```

Once running:
- Dashboard: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:4000](http://localhost:4000)

Seed the database (first run only):
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

Refresh the dashboard to watch the incident appear.
