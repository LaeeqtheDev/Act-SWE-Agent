<div align="center">
  <img src="apps/web/public/logo.svg" width="64" height="64" alt="" />
  <h1>Act</h1>
  <p><strong>An AI assistant that opens a real browser and actually gets things done — and asks before it changes anything.</strong></p>
  <p>
    <a href="#quick-start">Quick start</a> ·
    <a href="docs/SETUP.md">Setup</a> ·
    <a href="docs/USAGE.md">Usage</a> ·
    <a href="docs/HOSTING.md">Hosting</a> ·
    <a href="docs/ARCHITECTURE.md">Architecture</a>
  </p>
  <p><em>Open source · bring your own AI model · self-host free forever</em></p>
</div>

---

Ask it to find a job and apply, and it browses the careers page, reads the
listings, fills the application with your saved details, and shows you
everything before a single field is submitted. Ask it to clear your inbox,
compare vendors, or check something every morning, and it does that too.

It drives **your own logged-in Chrome**, so Gmail, LinkedIn, Slack, and
anything else you're signed into just works — no separate login, no OAuth
dance, no credentials handed to a third party. Slack and Notion also connect
directly through their own APIs, which is faster and more reliable than
driving their web UIs.

**The one rule:** reading, browsing, and clicking happen freely. Anything
that submits, sends, posts, or changes state stops and waits for your
approval — even mid-run, even on a schedule when nobody's watching. That's
what makes it safe to hand over a vague task and walk away.

---

## What it does

- **Browses for real** — a visible Chrome window with a visible cursor and real typing, using your existing sessions
- **Finishes tasks** — chains searches, clicks, scrolls, and reads until it has an actual answer, not a status update
- **Fills forms** — job applications and contact forms, from details you save once in your profile
- **Talks to Slack and Notion directly** — through their APIs, not by driving a browser
- **Builds spreadsheets** — real `.xlsx` output that accumulates across runs, for lead lists and research
- **Runs multi-stage workflows on a schedule** — "find businesses → check their sites → draft outreach," each stage with its own full step budget, sharing one conversation
- **Any AI model** — Anthropic, OpenAI, Grok, Groq, or a fully local Ollama model. Your key, swappable from the UI, stored encrypted
- **Verifies its own work** — confirms typed or submitted text actually landed before claiming success
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

Full walkthrough, including using your real browser and connecting Slack or
Notion: **[docs/SETUP.md](docs/SETUP.md)**

---

## Stack

**Frontend** Next.js 16 · TypeScript · Tailwind · shadcn/ui · GSAP · three.js
**Backend** Express · Prisma · PostgreSQL · Redis + BullMQ · Playwright · ExcelJS
**Infra** Docker (Playwright base image) · Kubernetes manifests · Terraform (AWS) · GitHub Actions
**Hosted extras** Clerk · Stripe · Prometheus · SMTP · Slack & Notion OAuth

Turborepo + pnpm workspaces.

---

## Documentation

| | |
|---|---|
| **[Setup](docs/SETUP.md)** | Install, configure, run, troubleshoot |
| **[Usage](docs/USAGE.md)** | What the agent can do, and where the boundaries are |
| **[Hosting](docs/HOSTING.md)** | Auth, billing, limits, integrations — all opt-in |
| **[Architecture](docs/ARCHITECTURE.md)** | How it works, how to add providers and tools |
| **[Google OAuth verification](docs/GOOGLE-OAUTH-VERIFICATION.md)** | Preparing Gmail scopes for review, without the common rejections |
| **[Changelog](docs/CHANGELOG.md)** | Full development history |

---

## Honest status

**Working and tested:** the agent loop, browser automation (with real
focus-and-verification checks on every typed action), workflows including
multi-stage pipelines, Slack/Notion integrations, spreadsheet output,
notifications, encrypted BYOK, the permission layer, dashboard, demo widget,
metrics, and 52 passing tests across 12 files.

**Built but not battle-tested:** Clerk auth, Stripe billing, email delivery,
and the Slack/Notion OAuth flows all typecheck and build clean, but haven't
run against production credentials — that's the next step, not a claim.

**Not built:** Gmail via OAuth (works today through browser automation;
native Gmail access needs Google's verification review — see the guide
above), actual model fine-tuning (the training-data export at
`/admin/export-training-data` is the honest, buildable piece instead), and
integration tests against a real database.

---

## License

MIT. Fork it, self-host it, sell services on it — no limits, no attribution
required.

Built by [Syed Laeeq Ahmed](https://github.com/LaeeqtheDev) · [LinkedIn](https://www.linkedin.com/in/syed-laeeq-ahmed/)
