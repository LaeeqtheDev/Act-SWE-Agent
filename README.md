<div align="center">
  <img src="apps/web/public/logo.svg" width="64" height="64" alt="" />
  <h1>Act · SWE Agent</h1>
  <p><strong>An open-source AI agent that actually does the work — and asks before it changes anything.</strong></p>
  <p>
    <a href="#quick-start">Quick start</a> ·
    <a href="docs/SETUP.md">Setup</a> ·
    <a href="docs/USAGE.md">Usage</a> ·
    <a href="docs/HOSTING.md">Hosting</a> ·
    <a href="docs/ARCHITECTURE.md">Architecture</a>
  </p>
  <p><em>MIT licensed · bring your own model · self-host free forever</em></p>
</div>

---

Ask it to find jobs at a company and it browses the careers page, clicks
into the listings, and comes back with real roles. Ask it to apply, and it
fills the form with your saved details and shows you the completed
application before anything is submitted.

It drives **your own logged-in Chrome**, so Gmail, LinkedIn, Slack, and
anything else you're signed into just work — no separate login, no OAuth
dance, no credentials handed to a third party.

**The one rule:** reading and clicking happen freely. Anything that submits,
sends, posts, or changes state stops and waits for you. That's what makes it
safe to hand a vague task and walk away — or schedule it to run unattended.

---

## What it does

- **Browses for real** — a visible Chrome window with a visible cursor, using your existing sessions
- **Finishes tasks** — chains searches, clicks, and reads until it has an actual answer, not a status update
- **Fills forms** — job applications and contact forms, from details you save once
- **Runs on a schedule** — unattended workflows that remember what previous runs found
- **Any model** — Anthropic, OpenAI, Grok, Groq, or fully local Ollama. Your key, swappable from the UI, stored encrypted
- **Watches itself** — real tool failures from real sessions surface on the dashboard automatically
- **Never writes without asking** — one approval for a complete action, not a dozen for its parts

---

## Quick start

```bash
git clone https://github.com/LaeeqtheDev/Act-SWE-Agent.git
cd Act-SWE-Agent
pnpm install
docker compose up postgres redis -d

cp apps/api/.env.example apps/api/.env    # add one AI provider key
cd apps/api && pnpm exec prisma migrate dev && cd ../..

pnpm --filter api dev       # :4000
pnpm --filter api worker    # detection worker
pnpm --filter web dev       # :3000
```

Open http://localhost:3000/agent.

Full walkthrough, including using your real browser: **[docs/SETUP.md](docs/SETUP.md)**

---

## Stack

**Frontend** Next.js 16 · TypeScript · Tailwind · shadcn/ui · GSAP · three.js
**Backend** Express · Prisma · PostgreSQL · Redis + BullMQ · Playwright
**Infra** Docker Compose · Kubernetes manifests · Terraform (AWS) · GitHub Actions
**Hosted extras** Clerk · Stripe · Prometheus · SMTP

Turborepo + pnpm workspaces.

---

## Documentation

| | |
|---|---|
| **[Setup](docs/SETUP.md)** | Install, configure, run, troubleshoot |
| **[Usage](docs/USAGE.md)** | What the agent can do, and where the boundaries are |
| **[Hosting](docs/HOSTING.md)** | Auth, billing, limits — all opt-in |
| **[Architecture](docs/ARCHITECTURE.md)** | How it works, how to add providers and tools |
| **[Changelog](docs/CHANGELOG.md)** | Full development history |

---

## Honest status

**Working and tested:** the agent loop, browser automation, workflows,
notifications, encrypted BYOK, the permission layer, dashboard, demo widget,
metrics, and 23 passing unit tests.

**Built but not battle-tested:** Clerk auth, Stripe billing, and email
delivery all typecheck and build clean, but haven't run against production
credentials — that's the next step, not a claim.

**Not built:** actual model fine-tuning (the training-data export at
`/admin/export-training-data` is the honest, buildable piece), and
integration tests against a real database.

---

## License

MIT. Fork it, self-host it, sell services on it — no limits, no attribution
required.

Built by [Syed Laeeq Ahmed](https://github.com/LaeeqtheDev) · [LinkedIn](https://www.linkedin.com/in/syed-laeeq-ahmed/)
