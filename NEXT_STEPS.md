# Next steps — what to run on your end

Everything in this project is real, working code. The items below genuinely
can't be executed, tested, or provisioned from where this was built — they
need your machine, your Docker/Kubernetes environment, your API keys, or your
cloud account. This is the exact, ordered checklist to finish wiring it all up.

---

## 1. Install the new dependencies

New packages were added for the AI agent (`@anthropic-ai/sdk`, `@kubernetes/client-node`
were already present) and the landing page (`gsap`, `three`):

```bash
pnpm install
```

## 2. Run the new database migration

The AI agent and permission layer need a new `AgentAction` table:

```bash
cd apps/api
pnpm exec prisma migrate dev --name add_agent_actions
cd ../..
```

(If you're running everything through Docker instead, do this against the
containerized DB once it's up: `docker compose exec api pnpm exec prisma migrate deploy`.)

## 3. Set your Anthropic API key

Get a key at https://console.anthropic.com/settings/keys, then:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
```

Fill in `ANTHROPIC_API_KEY` in both files. `docker-compose.yml` reads the root
`.env` automatically; `apps/api/.env` is used for native (non-Docker) `pnpm dev`.

Without this set, the **Investigate with AI** button still works end-to-end,
but the agent responds saying it isn't configured instead of running a real
investigation — nothing crashes, it just won't produce a real analysis.

## 4. Run it

```bash
docker compose up --build
```

- Landing page: http://localhost:3000
- Dashboard: http://localhost:3000/dashboard
- API: http://localhost:4000

First run only:
```bash
docker compose exec api pnpm exec prisma migrate deploy
docker compose exec api pnpm exec prisma db seed
```

Trigger an incident, open it on the dashboard, click **Investigate with AI**.

---

## 5. Kubernetes — deploy the remaining services

`payments-api` was already proven working (real pod, self-healing verified).
The other three services use the identical, proven pattern. On your machine,
with Docker Desktop's Kubernetes enabled:

```powershell
docker buildx build --tag sentinelops-api:latest --file apps/api/Dockerfile --load .
docker buildx build --tag sentinelops-web:latest --file apps/web/Dockerfile --load .
.\infrastructure\kubernetes\load-images-into-cluster.ps1
bash infrastructure/kubernetes/apply-all.sh
kubectl get pods
```

Full details and the self-healing demo steps are in
`infrastructure/kubernetes/README.md`.

## 6. AWS — review, then apply

`infrastructure/aws/main.tf` is a reviewed, ready-to-apply Terraform scaffold
(EKS + RDS + ElastiCache + ECR), **not yet applied against any real account.**
This needs your AWS credentials and will incur real cost, so it's intentionally
left for you:

```bash
cd infrastructure/aws
export TF_VAR_db_password="pick-a-real-password"
terraform init
terraform plan     # review what it will create
terraform apply
```

Full steps (pushing images to ECR, pointing kubectl at the new cluster,
tearing it down when you're done demoing) are in `infrastructure/aws/README.md`.

## 7. CI/CD — activate the deploy half

`.github/workflows/ci-cd.yml` already runs lint/build/Docker-build on every
push — no setup needed for that part. The deploy job only activates once you
add these repository secrets (GitHub repo → Settings → Secrets and variables → Actions):

```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
ECR_API_REPOSITORY      # from terraform output ecr_api_url
ECR_WEB_REPOSITORY      # from terraform output ecr_web_url
EKS_CLUSTER_NAME
```

## 8. Observability — finish the instrumentation

The collector, Prometheus, and Grafana containers are scaffolded
(`docker compose --profile observability up`), but the API doesn't emit
metrics yet. Steps to finish this are in `observability/README.md` — it's
left as a next step rather than guessed at blind, since metric names and
dashboards are usually iterated on live against real data.

---

## Optional polish (not required to demo the project)

- Migrate `pod-crash-loop` onto the same BullMQ queue path as `database-overload`
  (currently still synchronous — noted as a known limitation in the README)
- Add a formal test suite
- Wire the four Kubernetes-deployed services to Postgres/Redis running *inside*
  the cluster instead of `host.docker.internal`, once you're comfortable with
  in-cluster StatefulSets
- Record a short demo video/GIF for the README

---

## 9. Multi-provider AI + browser tool (this update)

New capability, same "your end" pattern as everything above:

1. **Playwright needs its browser binary downloaded once**, separately from `pnpm install`:
   ```bash
   cd apps/api
   npx playwright install chromium
   ```
   Without this, `browseWeb` and any approved `browser_action` will fail with a clear
   error — nothing else breaks.

2. **Pick a provider** in `apps/api/.env` (and root `.env` if using Docker):
   ```
   AI_PROVIDER=anthropic   # or: openai | grok | groq | ollama
   ANTHROPIC_API_KEY=...   # or whichever key matches your chosen provider
   ```
   Check it's picked up:
   ```bash
   curl http://localhost:4000/ai/status
   ```

3. **Ollama users**: install Ollama, pull a model (`ollama pull llama3.1`), leave
   `AI_PROVIDER=ollama` — no API key needed, it talks to `localhost:11434` by default.

4. The `AgentAction` schema already supports `browser_action` — no new migration needed
   beyond the one from the previous update.

---

## 10. Chat agent (this update)

The primary interface is now a chat console at `/agent`, backed by two new
tables (`Conversation`, `ChatMessage`) and `AgentAction.incidentId` becoming
optional (chat-originated actions aren't always tied to a formal incident).

**Run the migration:**
```bash
cd apps/api
pnpm exec prisma migrate dev --name add_chat
cd ../..
```

That's it — same AI provider setup from step 9 powers the chat agent too
(it reuses the exact same tool menu: service health, K8s data, `browseWeb`,
`proposeAction`). Open http://localhost:3000/agent and try one of the
suggested prompts.

The incident dashboard hasn't gone anywhere — it's now the secondary
`/dashboard` view, linked from the chat page and the landing nav.

---

## 11. Local computer-use tools (this update)

Two new opt-in capabilities, both native-dev-only (not meaningful inside
Docker), documented in `apps/api/.env.example`:

**Your own logged-in Chrome, not session hijacking.** Set `CHROME_USER_DATA_DIR`
to your real Chrome profile directory and `browseWeb` (and any approved
`browser_action`) drives your actual, already-logged-in Chrome — so it can
read pages behind your existing logins. This is local automation of your own
browser on your own machine, not a mechanism for accessing anyone's account
without their own prior login. Every click/fill still requires your approval
via `/actions/:id/approve` before it runs.

**Local dev agent.** Set `ENABLE_LOCAL_DEV_TOOLS=true` to let the agent read
files in this project, list directories, and open VS Code — and, gated behind
approval like everything else, propose file edits and shell commands. File
operations are restricted to `PROJECT_ROOT` (path traversal outside it is
refused). This is a local dev-assistant mode, off by default, and should
never be enabled in a hosted/cloud deployment — shell command execution is a
real blast radius, so treat it the way you'd treat giving someone terminal
access.

Both are picked up automatically once the tool menu loads — try asking the
chat agent "what files are in apps/api/src" once `ENABLE_LOCAL_DEV_TOOLS=true`
is set, or "check my calendar at calendar.google.com" once
`CHROME_USER_DATA_DIR` is set (make sure you're already logged in, in that
same Chrome profile, outside of Playwright, first).

Run the schema migration for the dashboard's global activity feed and the
now-optional `AgentAction.incidentId` (already covered by the `add_chat`
migration in step 10 — no new migration needed for this update).

---

## 12. Settings UI, chat sidebar, agent-centric dashboard, better landing (this update)

**Required for the in-app settings panel to work:**
```bash
# generate one:
openssl rand -hex 32
```
Set the result as `SETTINGS_ENCRYPTION_KEY` in `apps/api/.env`. Without it, pasting a
key from the UI fails with a clear error — env-var-based provider config (from
step 9) still works exactly as before regardless.

**New migration needed** (new `ProviderConfig` table):
```bash
cd apps/api
pnpm exec prisma migrate dev --name add_provider_settings
```

**Note on the two new local endpoints I couldn't fully verify here:** the
sandbox this was built in intermittently blocks Prisma's engine-binary CDN,
so I could type-check every file against the app's own code but not get a
live-generated-client confirmation for the new `ProviderConfig` model
specifically. I hand-reviewed every query against the schema and I'm
confident it's correct — but your first `prisma migrate dev` here is the real
proof, same caveat as the `Conversation`/`ChatMessage` models from the last
update.

Everything else (chat sidebar, dashboard reframe, new landing pages, the
scroll-scrubbed hero) is pure application code with no new external
dependency — nothing else to configure.

---

## 13. Bug fixes (this update) — read this if chat wasn't working

Three real bugs found and fixed, not flakiness:

1. **Settings save silently failed.** If `SETTINGS_ENCRYPTION_KEY` wasn't set,
   saving a key from the UI threw an error the frontend didn't check for — it
   showed "Saved" anyway, so the key never actually persisted. Fixed two ways:
   the settings panel now shows a real error if saving fails, and the backend
   no longer hard-fails when that env var is missing — it derives a fallback
   key from `DATABASE_URL` and logs a warning instead. Still set a real
   `SETTINGS_ENCRYPTION_KEY` for anything beyond local testing.
2. **Blank assistant replies.** If the chat endpoint ever returned an error,
   the frontend rendered an empty bubble instead of the error message —
   `data.reply` was `undefined` and React just renders that as nothing. Fixed:
   the UI now always shows either the real reply or a readable error.
3. **A new empty conversation was created every time you opened `/agent`.**
   Conversations are now created lazily, only when you actually send a first
   message — opening the page or clicking "New chat" no longer touches the
   database at all. A **"Clear empty chats"** button appears in the sidebar
   footer to clean up the leftover empty rows these old page-loads created.

After pulling this update, retest: open `/agent`, paste a real key into
Settings → Save (you should now see either a checkmark or a real error, never
a silent false-positive), then send a message and confirm you get an actual
reply. If it still fails, the API server's own console output will now say
exactly why — paste that if you need another look.

---

## 14. Still blank replies after the last fix? (this update)

The previous fix made the frontend display errors correctly — but the
backend was never actually *logging* errors to the terminal, so if
something failed server-side, your console showed nothing useful (like the
harmless settings-key notice you saw, with the real failure invisible).
Fixed now: any chat or investigation failure prints a full error to the API
server's terminal, and the loop itself is wrapped so a crash produces a
readable in-chat message instead of a generic 500.

**To actually retest:**
1. Fully stop and restart both `pnpm --filter api dev` and `pnpm --filter web dev` (don't just leave old processes running)
2. Hard-refresh the browser: Ctrl+Shift+R
3. Confirm the key actually saved: open Settings → it should show `(currently gsk_...xxxx)` next to the API key field. If it doesn't, the save didn't take — try again and watch for the new inline error text if it fails.
4. Send a message. If it still fails, the API terminal will now print the real error — paste that exact text back, and we'll fix the actual cause instead of guessing.

One likely culprit worth checking directly: if your message causes the agent
to use `browseWeb` (e.g. "open github"), and you never ran
`npx playwright install chromium` (from step 11), that tool call will fail.
It should now surface as a readable error in the chat instead of a blank
bubble either way — but running that install command fixes the underlying
capability rather than just the error message.

---

## 15. Make the browser actually visible (this update)

The earlier "please open github" success was real — the tool worked — but
it ran invisibly (headless) and closed the page immediately after reading
it, so nothing appeared on screen. Two fixes:

1. Set `BROWSER_HEADLESS="false"` in `apps/api/.env` (already the default in
   `.env.example` now) — the agent's browser becomes a real, visible window.
2. `browseWeb` no longer closes the page after reading it — the tab stays
   open in front of you instead of flashing and disappearing.

Restart the API server after setting this. Ask the agent to open something
again — this time an actual Chrome/Chromium window should appear and stay
on screen. For pages behind your own logins (Gmail, Calendar), still set
`CHROME_USER_DATA_DIR` as documented above — that one's always visible
regardless of `BROWSER_HEADLESS`.

---

## 16. Browser session continuity + rate-limit crash (this update)

Three real bugs from actual usage:

1. **New window every time, no continuity.** The browser tool opened a fresh
   page for every single action, so "open github" then "log in" felt like
   two unrelated browsers, not one continuous session. Fixed — one page is
   now created and reused for the life of the running server. Opening
   something, then acting on it, now happens in the same visible window.

2. **Closing the window broke the next request.** If you closed the browser
   yourself, the next tool call now detects that and cleanly opens a fresh
   window instead of the confusing "started a second, unrelated search"
   behavior you saw.

3. **413 "Request too large" mid-task.** Multi-step tool use (search, browse,
   search again...) resends the ENTIRE conversation history — including
   every prior tool result — on every single turn. On Groq's free tier
   (as low as 8,000 tokens/minute), that fills up fast. Fixed two ways:
   page text capped at 1200 characters (was 4000), and older tool results
   get compacted to a short stub before each request — only the most recent
   couple of tool results are sent in full. The turn limit also dropped from
   6 to 4, since fewer round-trips means less cumulative token usage within
   that same 60-second window.

**On "a proper session"** — if you meant the browser staying logged in
across requests: that's exactly what `CHROME_USER_DATA_DIR` is for (see
step 11) — set it once, and every browseWeb/browser action after that uses
your real, already-logged-in Chrome profile, persistently, not a fresh
throwaway session each time. If you instead meant user accounts/login for
the app itself (sign in, personal chat history tied to an account) — that's
Clerk, already on the roadmap as Phase 3, not yet built. Let me know which
one you meant if it's the latter and we'll pick that up next.
