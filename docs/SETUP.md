# Setup

Complete setup guide, from clone to running. Self-hosting is the default and
needs no accounts, no keys beyond one AI provider, and no billing.

---

## 1. Prerequisites

| Requirement | Notes |
|---|---|
| Node.js 20+ | `node --version` |
| pnpm | `npm install -g pnpm` |
| PostgreSQL | Local install, or `docker compose up postgres -d` |
| Redis | Local install, or `docker compose up redis -d` |
| An AI provider key | Groq is free and works well — see [Providers](#4-choose-an-ai-provider) |

---

## 2. Install

```bash
git clone https://github.com/LaeeqtheDev/Act-SWE-Agent.git
cd Act-SWE-Agent
pnpm install
```

Start Postgres and Redis if you're using Docker for them:

```bash
docker compose up postgres redis -d
```

---

## 3. Configure

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

At minimum, set in `apps/api/.env`:

```bash
DATABASE_URL="postgresql://postgres:devpassword@localhost:5432/sentinelops?schema=public"
REDIS_HOST="localhost"
AI_PROVIDER="groq"
GROQ_API_KEY="gsk_..."
```

Then run migrations:

```bash
cd apps/api
pnpm exec prisma migrate dev
cd ../..
```

Optionally seed demo data (four fake services + incidents, used by the
landing page's try-it-now widget):

```bash
cd apps/api && pnpm exec prisma db seed && cd ../..
```

Remove it later with `pnpm clear-demo` from `apps/api` — that only clears
seeded services/incidents, never your conversations, workflows, or profile.

---

## 4. Choose an AI provider

Set `AI_PROVIDER` plus that provider's key. You can also change this any
time from the in-app settings panel, which stores the key encrypted.

| Provider | Env var | Notes |
|---|---|---|
| `groq` | `GROQ_API_KEY` | Free tier available. Default: `openai/gpt-oss-20b` |
| `anthropic` | `ANTHROPIC_API_KEY` | Claude models |
| `openai` | `OPENAI_API_KEY` | GPT-4o and others |
| `grok` | `XAI_API_KEY` | xAI |
| `ollama` | *(none)* | Fully local. Set `OLLAMA_BASE_URL` if not default |

**On Groq's free tier:** the on-demand tier can be as low as 8,000 tokens
per minute. A long multi-step task can hit that ceiling mid-run. If you see
a `413 Request too large`, set `AGENT_MAX_TURNS="4"` in `apps/api/.env`.

---

## 5. Run

Three terminals:

```bash
pnpm --filter api dev       # API on :4000
pnpm --filter api worker    # Incident detection worker
pnpm --filter web dev       # Web on :3000
```

| URL | What |
|---|---|
| http://localhost:3000 | Landing page, with a live no-signup demo |
| http://localhost:3000/agent | The chat agent |
| http://localhost:3000/workflows | Scheduled tasks |
| http://localhost:3000/profile | Your details, for form auto-fill |
| http://localhost:3000/dashboard | Incidents and agent activity |

---

## 6. Optional: let the agent use your real browser

This is what makes Gmail, LinkedIn, Slack, and anything else you're signed
into actually work — the agent drives *your* Chrome profile, with your
existing sessions.

```bash
# apps/api/.env
BROWSER_HEADLESS="false"                 # see the browser window and cursor
CHROME_USER_DATA_DIR="C:\Users\you\AppData\Local\Google\Chrome\User Data"
```

Profile paths:
- **Windows:** `%LOCALAPPDATA%\Google\Chrome\User Data`
- **macOS:** `~/Library/Application Support/Google/Chrome`
- **Linux:** `~/.config/google-chrome`

Install the browser binary once:

```bash
cd apps/api && npx playwright install chromium
```

**Close all other Chrome windows first** — Chrome locks its profile
directory while running.

**What this is and isn't:** this is local automation of your own browser on
your own machine, the same trust boundary as you clicking around yourself.
It is not a remote or hosted mechanism, and it never runs in a cloud
deployment. Every action that submits, sends, or posts still requires your
approval.

---

## 7. Optional: local dev tools

Lets the agent read this project's files, open VS Code, and — behind
approval — edit files and run shell commands.

```bash
# apps/api/.env
ENABLE_LOCAL_DEV_TOOLS="true"
PROJECT_ROOT="C:\path\to\your\project"   # defaults to the API's cwd
```

Off by default. Shell execution is a real blast radius — treat enabling this
like giving someone terminal access. Never enable it in a hosted deployment.

---

## 8. Optional: hosted mode

Only needed if you're running this as a service for other people. See
**[HOSTING.md](./HOSTING.md)**.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `ECONNREFUSED ...:6379` | Redis isn't running. `docker start <redis-container>` or start the service. |
| `Can't reach database server at localhost:5432` | Postgres isn't running. Start it (`services.msc` on Windows). |
| `Cannot read properties of undefined (reading 'findMany')` | Prisma client is stale. `cd apps/api && pnpm exec prisma migrate dev` |
| `Publishable key is missing` | `@clerk/express` needs **both** `CLERK_SECRET_KEY` **and** `CLERK_PUBLISHABLE_KEY` in `apps/api/.env`. |
| Browser opens but no visible cursor | `BROWSER_HEADLESS="false"` not set, or the API wasn't restarted after setting it. |
| `413 Request too large` | Free-tier token limit. Set `AGENT_MAX_TURNS="4"`. |
| Env change had no effect | Env vars load at process start. Fully restart the affected dev server. |
