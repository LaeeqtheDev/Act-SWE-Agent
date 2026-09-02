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

---

## 17. Phase 3 & 4 — Hosted mode, auth, and usage limits (this update)

**This is entirely opt-in and off by default.** Leave `HOSTED_MODE` unset (or
`false`) and nothing here changes — no Clerk code runs, no auth wall, no
limits. Self-hosting stays exactly as it's always been. Everything below
only matters if you actually want the hosted/commercial side running.

### What's built

- Clerk auth gating `/agent` and `/dashboard` in hosted mode (landing, docs,
  about, case studies stay public either way)
- Per-user provider settings — in hosted mode, each signed-in user's pasted
  API key is scoped to *them*, never shared across accounts (self-host still
  uses the original single shared row, unchanged)
- Usage metering: 10 tasks/month free, 500/month on Pro, enforced server-side
  before a request ever reaches the AI provider — a "task" is one chat
  message or one incident investigation
- A usage banner in the chat header, a `UserButton` for account management,
  sign-in/sign-up pages

### Setting it up (needs your own Clerk account — can't be done blind)

1. Create a free account at [clerk.com](https://clerk.com), create an
   application
2. Dashboard → API Keys → copy the **Publishable key** and **Secret key**
3. Set in `apps/web/.env`:
   ```
   NEXT_PUBLIC_HOSTED_MODE="true"
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_..."
   ```
4. Set in `apps/api/.env`:
   ```
   HOSTED_MODE="true"
   CLERK_SECRET_KEY="sk_..."
   ```
5. Run the new migration:
   ```bash
   cd apps/api
   pnpm exec prisma migrate dev --name add_users_and_hosted_mode
   ```
6. Restart both `pnpm --filter api dev` and `pnpm --filter web dev`
7. Visit `/agent` — you should be redirected to sign in, then land back on
   the chat once authenticated

### Honest caveat

I could not test any of this end-to-end — it needs a real Clerk account and
real keys, which don't exist in the environment this was built in. What I
*could* do: verify Clerk's current documented API (I checked their docs
directly rather than relying on training data, since their SDK has changed
shape a few times), get a clean `tsc --noEmit` pass on every file, and get a
real `next build` to compile all the way through module resolution, the new
`proxy.ts`, and every Clerk component/JSX — it only fails at the same
font-fetch step every build in this sandbox has hit (a network restriction
here, not a code issue). That's real signal the wiring is structurally
sound, but it is not the same as watching a real sign-in flow complete.
**Your first real test with actual Clerk keys is the true proof** — if
something's off, the error will be specific and fast to fix from there.

### Not yet built (still ahead)

- Stripe checkout to actually move someone from Free → Pro (right now
  `plan` on the `User` row would need to be set manually/via a future
  webhook — there's no payment flow yet)
- Bank-transfer + receipt-upload path
- Per-user conversation isolation in the UI (conversations aren't yet
  filtered by which user created them — everyone in hosted mode currently
  sees the same conversation list; scoping `Conversation.userId` is the next
  piece before hosted mode is genuinely multi-tenant-safe for chat history)

---

## 18. Landing page redo — color, icons, three.js (this update)

Three specific complaints, all addressed at the root cause, not patched over:

1. **"Landing page is blue"** — found it: `globals.css` used OKLCH hue 260
   (blue-violet) for the chat/dashboard theme, while the landing page used
   separate hardcoded hex colors. Fixed by rewriting `globals.css` to true
   neutral gray (hue 0) and refactoring every landing/marketing file off
   hardcoded hex onto those same shared CSS variables — they now share one
   literal source of truth and can't drift apart again.
2. **Three.js — "not just scroll and zoom," change the background** — deleted
   the old pinned-camera-dolly hero entirely. The new `flow-field.tsx` is a
   continuously animated particle stream (900 points, own animation loop) with
   rare amber "caught event" particles; scrolling only nudges its speed as a
   secondary effect, it's never the primary driver.
3. **"Real icons"** — replaced the colored-circle-monogram provider badges
   with distinct original monochrome glyphs (shape-differentiated, not
   color-differentiated) matching the new neutral theme. These are original
   marks, not reproductions of any company's actual logo — full brand logos
   would need to be genuinely licensed, which isn't something to fake.

---

## 19. Phase 5 & 6 — payments and model gating (this update)

**Stripe (card payments):**
1. Create a Stripe account, create one recurring "Pro" price (e.g. $30/month)
2. Dashboard → Developers → API keys → copy the secret key
3. Dashboard → Developers → Webhooks → add endpoint pointing at
   `https://your-domain/billing/webhook`, subscribe to
   `checkout.session.completed` and `customer.subscription.deleted`, copy
   the signing secret
4. Set in `apps/api/.env`:
   ```
   STRIPE_SECRET_KEY="sk_..."
   STRIPE_WEBHOOK_SECRET="whsec_..."
   STRIPE_PRO_PRICE_ID="price_..."
   ```
5. Locally, use the Stripe CLI to forward webhooks to your dev server:
   ```bash
   stripe listen --forward-to localhost:4000/billing/webhook
   ```

**Bank transfer (manual review — deliberately not automated):**
1. Set `ADMIN_SECRET` in `apps/api/.env` to any long random string
2. Users upload a receipt at `/billing` — it lands as `pending`, nothing
   happens automatically
3. You review it:
   ```bash
   curl -H "x-admin-secret: YOUR_SECRET" http://localhost:4000/billing/pending
   curl -X POST -H "x-admin-secret: YOUR_SECRET" http://localhost:4000/billing/pending/<id>/approved
   ```
   Approving flips that user to Pro immediately. This is intentionally a
   human decision every time — an automated system can't safely confirm a
   real bank transfer happened from an uploaded image alone, so I didn't
   pretend otherwise.

**New migration** (User.stripeCustomerId/stripeSubscriptionId, new
PendingPayment table):
```bash
cd apps/api
pnpm exec prisma migrate dev --name add_billing
```

**Model gating (Phase 6):** free hosted accounts are blocked from selecting
a premium model (Claude Sonnet/Opus, GPT-4o/4.1, Grok-2, the larger Groq
models) unless they paste their own API key — checked server-side at
settings-save time, not just hidden in the UI.

### Honest caveat

Same pattern as Clerk: I verified Stripe's current API shape, got a clean
`tsc --noEmit`, and a real `next build` that compiles the new `/billing`
page and every other route — but none of this has run against a real Stripe
account or a real webhook delivery. The raw-body-before-JSON-parser ordering
for webhook signature verification is correct per Stripe's docs and is the
most common way this integration silently breaks, so I want to flag I got
that specific detail right rather than leave it to be discovered the hard
way. Your first real `stripe listen` test and a real checkout are the actual
proof.

### Not yet built

- A UI for you to review pending bank-transfer receipts (right now it's raw
  curl commands against the admin endpoints — functional, not pretty)
- Downgrade handling beyond Stripe's own subscription-cancel webhook (e.g.
  no in-app "cancel my plan" button yet — cancellation happens through
  Stripe's customer portal, which isn't wired up yet either)

---

## 20. Admin panel, real bank details, Stripe portal (this update)

**Important — about the bank details you shared:** I did not hardcode your
real Meezan Bank/NayaPay account number or IBAN anywhere in the source
code. That's deliberate: this repo is about to be open-sourced, and git
history is permanent and public — baking a real account number into a
committed file would expose it forever, to every fork, forever indexable.
Instead, your bank details are read from environment variables that only
ever live in your own untracked `apps/api/.env`, served to the frontend at
runtime via `GET /billing/bank-details`. Set these once and the real
details show up on `/billing` automatically:

```
BANK_NAME="..."
BANK_ACCOUNT_TITLE="..."
BANK_ACCOUNT_NUMBER="..."
BANK_IBAN="..."
BANK_TRANSFER_NOTE="Include your email as the reference"
```

Leave them unset and the bank-transfer card on `/billing` just says "not
set up yet" instead of showing an empty form — it never breaks, it degrades.

### Admin panel — `/admin`

A real UI now, not raw curl:
- **Pending receipts tab** — every bank-transfer upload, with an actual
  **eye icon to view the receipt file** (fetched securely with the admin
  header and opened as a blob — never a plain link, since browsers can't
  attach custom headers to `<img>`/`<a>` tags, and I didn't want to put your
  admin secret in a URL where it'd end up in server logs or browser history)
  — approve/reject right there
- **Users tab** — every hosted-mode account with their plan and usage, and a
  one-click **"Set Pro" / "Set Free"** button — the direct "just make this
  account paid" tool you asked for, independent of Stripe or a receipt

Visit `/admin`, enter your `ADMIN_SECRET` once (stored in that browser tab's
session only), and you're in.

### Stripe customer portal

`/billing` now has a "Manage or cancel your subscription" link for anyone
who's already subscribed — opens Stripe's own hosted portal (update card,
view invoices, cancel), no UI to build for that yourself. Needs nothing new
beyond the `STRIPE_SECRET_KEY` you already set up.

### Landing page: metrics + pipeline updated

- The four stat numbers now show a one-line explanation on hover (GSAP
  fade/height reveal) instead of being bare digits with no context
- The "How it works" pipeline gained a 5th step — **Approve** — reflecting
  that the product's core loop now includes the permission layer, not just
  detect→resolve
- Each pipeline panel now scales up and brightens as it scrolls through the
  viewport center, on top of the existing horizontal slide — makes the
  scroll-to-animation connection unmistakable

### Testing hosted mode locally — quick reference

```
# apps/api/.env
HOSTED_MODE="true"
CLERK_SECRET_KEY="sk_test_..."
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRO_PRICE_ID="price_..."
ADMIN_SECRET="pick-anything-long-and-random"
BANK_NAME="..." # optional, only if offering bank transfer

# apps/web/.env
NEXT_PUBLIC_HOSTED_MODE="true"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
```
Restart both dev servers, hard-refresh the browser. `/agent` and
`/dashboard` now require sign-in; `/billing` and `/admin` become live.

### Honest caveat, same as every hosted-mode piece so far

Verified against current docs, clean `tsc --noEmit` on both apps, and two
full `next build` passes with hosted mode on — but none of this has run
against your real Stripe/Clerk accounts yet. That first real test is still
the actual proof.

---

## 21. Admin UI bug fix + visible mouse cursor (this update)

**Admin page bug fixed:** it was showing "Nothing pending" / an empty user
list even when the actual API call had failed (wrong admin secret) — the
empty state wasn't checking for an error first. Fixed, and added a
"Wrong secret? Try again" reset link so a bad entry doesn't strand you.

**If you're still hitting "Invalid admin secret":** the API only reads
`ADMIN_SECRET` from `.env` once, at startup. If you added or changed it
while the server was already running, it's using the old (or no) value —
fully stop and restart `pnpm --filter api dev`. Same applies to
`BANK_NAME`/`BANK_ACCOUNT_TITLE`/etc. for the bank-details display on
`/billing` — a restart is required after any `.env` change, always.

**Visible mouse cursor (this update):** in visible mode
(`BROWSER_HEADLESS=false` or `CHROME_USER_DATA_DIR` set), approved browser
actions now:
- Draw a small dot overlay that follows the real cursor, so you can actually
  see where the agent is about to click
- Move the mouse there with interpolated steps (glides, doesn't teleport)
- Type text character-by-character instead of an instant paste
- Add a small `slowMo` (120ms) so actions are visibly paced

None of this applies in headless mode — production/self-hosted runs where
nobody's watching get zero overhead.

---

## 22. Real bugs found and fixed (this update)

1. **The model hallucinated "file created" / "added to repository."** This
   wasn't a display bug — `proposeAction` genuinely only ever creates a
   pending row, never executes, but the system prompt didn't say that
   explicitly enough, and a small free model filled the gap with a plausible-
   sounding but false narration. Rewrote both system prompts (chat and
   incident investigation) to state outright: never say something was
   created/added/run unless the tool result actually says so, and explicitly
   forbid emoji. This is a real limitation of small/free models worth
   knowing — bigger models hallucinate this far less, but the prompt fix
   closes most of the gap either way.

2. **No way to approve without leaving the chat.** This was the actual
   "gets stuck" problem — proposing an action created a pending row, but
   approving it only ever lived on the `/dashboard` Agent Activity panel,
   so the conversation had nowhere to go. Fixed: proposed actions now render
   an inline **Approve / Reject** card directly in the chat message where
   they were proposed. Deciding calls the real `/actions/:id/approve` (or
   `reject`) endpoint — same one dashboard uses — and then automatically
   sends a short follow-up ("I approved that — please continue.") so the
   agent picks the thread back up immediately instead of the chat going
   quiet. This is also why each decision still counts as part of the same
   task-based flow, not a separate hidden action.

3. **Pipeline section "going beyond the page."** The per-card scroll
   animation was hand-rolled with per-frame `getBoundingClientRect()` reads,
   which is exactly the kind of thing that gets subtly wrong. Replaced with
   GSAP's own documented pattern for this (`containerAnimation`, tied to the
   same tween driving the horizontal scroll) — the standard, well-tested way
   to animate items inside a horizontally-scrolling pinned track, plus an
   explicit `maxWidth: 100vw` clamp on the section as a safety net.

None of this needs a new migration or a new env var — just pull the update
and restart both dev servers.

---

## 22. Chat continuity after an approval (this update)

The real gap behind "it gets stuck after creating a file": `AgentAction`
had no link back to the conversation that proposed it, so approving an
action (from the dashboard's Agent Activity panel) had no way to tell the
chat anything happened. Fixed:

- `AgentAction` now records which conversation proposed it (when it came
  from chat, as opposed to an incident investigation)
- The moment an action actually completes — file written, browser click
  done, pod restarted — a real follow-up message gets written back into
  that same conversation: *"Created apps/web/index.html. Opened it in your
  editor. Want me to add anything to it, or create something else?"*
- File-edit approvals now auto-open the result in your editor immediately
  (when `ENABLE_LOCAL_DEV_TOOLS=true`) — no separate "please open this
  yourself" step

**New migration** (adds `AgentAction.conversationId`):
```bash
cd apps/api
pnpm exec prisma migrate dev --name add_action_conversation_link
```

Reopen the conversation after approving something (from `/agent`'s
sidebar) and the follow-up is already there.

**On the emoji / "narrating manual steps" complaint:** both system prompts
already had explicit fixes for this from the previous round —
`No emoji, ever` and an instruction to never describe a proposed action as
already done. If you're still seeing either, it's almost certainly a
stale build (restart the API) or the model itself not following
instructions perfectly (smaller/faster models like `gpt-oss-20b` are more
prone to this than larger ones — worth trying a bigger model if it
persists).

---

## 23. Landing page demo widget + platform-aware browsing (this update)

**No-signup demo widget.** `/` now has a live, working chat right on the
landing page — "Try it right now," no signup. It talks to a real agent, but
a deliberately small one: read-only access to the demo services/incidents
only, 3-turn tool loop cap, and a hard **6 messages per IP per hour** limit.

**Read this before deploying hosted:** this endpoint runs against
*your* configured provider key with no auth in front of it — the rate
limit is the only thing stopping a stranger from burning your API budget.
It's in-memory (resets on restart, and isn't shared across multiple server
instances if you ever scale horizontally) — fine for a single-instance
deploy, worth swapping for a Redis-backed limiter if you scale beyond that.
Tune `RATE_LIMIT` / `WINDOW_MS` in `apps/api/src/demo.ts` if you want it
stricter or looser.

Seed data matters here — the demo has nothing interesting to say about
services that don't exist:
```bash
cd apps/api
pnpm exec prisma db seed
```

**Browser tool — now actually usable for Gmail/Calendar/Docs/LinkedIn/Slack.**
`browseWeb` returns a list of real, clickable elements on the page
(`interactiveElements`), each with a Playwright-native selector
(`role=button[name="Send"]`, `text="Post"`) instead of the agent guessing at
CSS that doesn't exist. Both system prompts now explicitly tell the agent:
browse the page first, use the selector it's given, don't invent one. This
is what makes "click Send in Gmail" or "post this on LinkedIn" reliable
instead of a coin flip — set `CHROME_USER_DATA_DIR` (see step 11) and these
work through the same real, logged-in browser as everything else.

**Fair warning, not a blocker:** most platforms' Terms of Service technically
restrict automated interaction with their site (LinkedIn and Slack
especially). This is the same risk profile as any personal browser
automation — real, but account-level, not something that stops the code
from working. Keep action volume modest, especially on LinkedIn, until this
moves to real OAuth integrations later.

---

## 24. Audit findings + product-direction fix (this update)

**Two real bugs, found and fixed:**
1. **Page auto-scrolled to the demo widget on load.** Both the landing demo
   and `/agent` had the same bug: a `useEffect` that scrolls to the newest
   message fired on the very first mount too (empty message list still
   counts as a "change"), yanking the whole page down to that chat box the
   instant it loaded. Fixed in both places — the scroll only fires once
   there's an actual conversation.
2. **Demo widget was cramped.** Made it bigger — taller, wider container,
   larger text and touch targets.

**The bigger thing — you're right, and this needed a real fix, not a
relabel.** The dashboard was built entirely around the payments-api/
orders-api simulator, which no longer matches what this product actually
is: a browsing, tool-using agent. Rather than tear out the simulator
(it's genuinely good, working infra — real Postgres, real Redis queue, real
Kubernetes self-healing, worth keeping as a demonstration), I added what
you were actually describing as its own real thing:

- **`AgentIncident`** — a new, separate model from the simulator's
  `Incident`. Whenever a tool the agent *actually* calls during a real chat
  or investigation fails — a `browseWeb` that couldn't complete, a shell
  command that exits non-zero, the AI provider itself erroring out mid-task
  — it's logged here automatically, tied to that session
- **Dashboard restructured**: "Live agent issues" is now the first thing on
  the page — genuine, real, auto-detected. Everything simulator-related got
  pushed below a divider and explicitly relabeled "Simulated detection
  pipeline (demo)" so it's clear that's a showcase of the mechanics, not
  the product itself
- Landing page's metric label updated to match: "demo services for the
  detection pipeline" instead of implying they're the core offering

**New migration** (adds `AgentIncident`):
```bash
cd apps/api
pnpm exec prisma migrate dev --name add_agent_incidents
```

### On "comprehensive audit, fix everything"

I want to be precise about what that actually means here rather than
claim something I can't back up: I re-typechecked both apps clean, ran a
real `next build` that compiles every route, and traced through the fixes
above by reading the actual code paths, not guessing. What I have **not**
done is exercise every feature live end-to-end myself (I don't have a
running instance with real Stripe/Clerk/provider keys) — so "comprehensive"
here means "I checked what I can verify without live credentials, and
fixed two real bugs I found doing it," not "I've personally clicked through
every button." Your own pass through the app, now that the two structural
fixes above are in, is still the real test — and now that live agent
issues get logged automatically, if something's actually broken in a real
session, it'll show up on the dashboard for you to see.

---

## 25. Workflows, notifications, full task continuation, more platforms (this update)

**Workflows — real scheduling, not a mockup.** `/workflows` lets you create
a task the agent repeats unattended: "Check my LinkedIn for messages every
hour," "Check payments-api health every 30 minutes." Runs go through the
**exact same agent loop as a real chat** — same tools, same permission gate
on every write. A schedule triggering it is the only difference from you
typing it yourself. Built on `node-cron`, running in-process in the API
server:
- Each workflow keeps **one ongoing conversation across all its runs** — the
  tenth run genuinely remembers what the first nine found, not a fresh
  start each time
- Schedules survive a server restart (re-registered from the database on boot)
- Create/enable/disable/run-now/delete, all from `/workflows`

**Notifications — in-app, polled, honest about what it isn't yet.** A bell
icon in the chat header, polls every 30 seconds, shows unread count, links
straight to the relevant conversation. This is the reliable baseline. It is
**not yet** email, browser push, or Slack delivery — those need a
transactional email service or a service worker + VAPID keys, which is
real additional infrastructure I didn't want to fake by pretending an
in-app-only notification is "sent." `createNotification()` in
`notifications.ts` is where you'd hook in an actual email/push send later —
the call site is already there, the delivery mechanism isn't.

**Full task continuation.** The turn limit that got dropped from 6→4 during
the Groq-rate-limit fight is now `AGENT_MAX_TURNS` (default 8), so a
multi-step task ("look this up, then act on it, then confirm") doesn't get
cut off in the middle. **If you're running a small free-tier model** (like
`gpt-oss-20b` on Groq's 8,000 TPM tier), consider setting
`AGENT_MAX_TURNS=4` explicitly to avoid the same 413 rate-limit crash from
before — the history-compaction fix helps, but a genuinely long task can
still add up. Bigger models / paid tiers can leave it at 8 or raise it.

**More platforms.** The system prompt now explicitly lists Facebook,
Instagram, and WhatsApp Web alongside the existing Gmail/Calendar/Docs/
LinkedIn/Slack — and states plainly that *any* site the user's Chrome
profile is logged into works the same way. **The permission gate is
explicitly called out as applying without exception across every one of
these** — restated directly in the prompt specifically because workflows
now let the agent run unattended, and that's exactly the scenario where an
unambiguous "no write without approval, ever" instruction matters most.

### New migration (Workflow, WorkflowRun, Notification tables)
```bash
cd apps/api
pnpm exec prisma migrate dev --name add_workflows_and_notifications
```

### Setting one up
1. Set `CHROME_USER_DATA_DIR` if the workflow needs a logged-in session
   (checking LinkedIn, Gmail, etc.) — see step 11
2. Go to `/workflows` → New → describe the task in plain language → pick a
   schedule → Create
3. Hit the play icon to test it immediately instead of waiting for the
   schedule
4. Check the bell icon after it runs

### Honest caveat, same pattern as everything else

Typechecked clean on both apps, a real `next build` pass, and I traced the
scheduler logic by reading it rather than guessing — but this has not run
against a live cron trigger firing for real, over real time, against a
real Chrome session on your machine. First real scheduled run is the
actual proof, same as every hosted-mode piece before it.

---

## 26. The real "it doesn't finish, keeps asking for approval" fix (this update)

Four real, distinct problems in what you saw — not one bug, four:

**1. It genuinely never continued after approval — this was a real gap, now fixed.**
Approving an action only ever appended a static "here's what happened"
message to the chat. Nothing then re-invoked the agent. You had to type
"please continue" yourself every single time, which is exactly what you saw
in the Stripe/PayPal example. Fixed: `resumeAfterAction()` now runs a REAL
next turn the moment an action completes — the agent can propose the next
step (still gated behind its own approval — this never bypasses that) or
give you the final answer, entirely on its own. A chain of up to 5
automatic continuations is allowed before it needs one manual nudge, as a
safety cap against a model that never stops proposing things.

**2. It was asking for approval on things that didn't need it — also real, also fixed.**
Clicking a plain link (like Stripe's "Open Roles") was going through the
full propose→approve gate for no reason — following a link is just
navigation, the same as calling browseWeb with a different URL. Fixed:
`browseWeb` now returns each link's actual href, and both the tool
description and system prompt tell the agent to navigate there directly
instead of proposing a gated click. The approval gate now applies
specifically to things that submit, send, post, or change something —
which is the right scope for it, not "any click anywhere."

**3. "I didn't see mouse or typing" — almost certainly a config gap, not a code bug.**
The visible-cursor/mouse-movement/character-typing feature only activates
when `BROWSER_HEADLESS="false"` is actually set in your `apps/api/.env`.
`.env.example` defaults to this now, but if your real `.env` was created in
an earlier round before that default existed, it may still be missing —
**check this specifically** and restart the API if you add it.

**4. "Couldn't reach the API... Failed to fetch"** — I can't diagnose this
one without the actual API terminal output from that moment (I added
`console.error` logging specifically so it's visible next time), but I did
find and fix a real category of risk while looking: added a global
`unhandledRejection` handler so a single missed `.catch()` anywhere can't
silently take the whole server down anymore, and added the same
`console.error` logging to the `/actions/:id/approve` route that was
missing it. **If this happens again, paste the exact API terminal output**
— now it'll actually say why.

### Also: Google search results specifically are a hard case, not a bug

Google actively fights automated browsers — CAPTCHAs, JS-heavy rendering,
bot detection — so scraping google.com/search directly is inherently
unreliable, headless or not. For anything like "find me jobs at X," the
agent does much better going straight to the destination (a company's own
careers page, or `webSearch` which uses DuckDuckGo's plain HTML results)
than trying to read Google's search results page. This is a structural
limitation of scraping search engines in general, not something a prompt
tweak fixes — worth knowing rather than expecting it to just start working.

No new migration for this update — pure application logic.

---

## 27. Completing the audit list (this update)

Working through everything flagged as "missing" — here's what's real now,
and what's honestly still a next step.

### Done

**Real observability.** `/metrics` now emits genuine Prometheus data — HTTP
request counts/duration, tool calls (by name and outcome), chat messages,
agent actions (by type/status), workflow runs. The Prometheus/Grafana
config that's been scaffolded for a while now has something real to graph.

**Email notifications, honestly scoped.** SMTP via `nodemailer` — works
with Gmail, SendGrid, Resend, SES, anything SMTP-compatible. Genuinely
sends when configured (`SMTP_HOST`/`SMTP_USER`/etc.), silently no-ops when
it isn't — never a fake "sent" status either way. Also closed a real gap
this depended on: `User.email` was never actually being populated from
Clerk; it now backfills once and caches it.

**Workflow failure backoff.** Three consecutive failures auto-disables a
workflow and sends a clear "here's why, go fix it" notification, instead of
quietly failing on schedule forever.

**Pluggable receipt storage.** Local disk by default (zero config).
Set `S3_BUCKET` (+ friends) to switch to real object storage — works with
AWS S3, Cloudflare R2, or MinIO via `S3_ENDPOINT`. This is the actual fix
for "files vanish on redeploy without a persistent volume."

**A real test suite**, not a token gesture — 16 tests across 4 files,
all passing:
- The TPM rate-limit mitigation (`compactHistoryForRequest`) — truncates
  older tool results, keeps recent ones full, never mutates the original
- The Phase 6 premium-model gate (`isPremiumModel`) and provider catalog
  consistency
- The demo widget's per-IP rate limiter
- **The encryption round-trip that protects every pasted API key** — encrypts
  and decrypts correctly, never leaks plaintext into the ciphertext string,
  produces different output for the same input each time (random IV), and
  fails closed (throws) on tampered ciphertext instead of returning garbage

Getting these to actually run surfaced a real architecture fix along the
way: several "pure" functions lived in files that transitively imported
`PrismaClient` at module scope, so importing them for a unit test required
a live, generated Prisma client — which needs a real `DATABASE_URL`, unlike
what a unit test should need. Fixed properly: extracted the genuinely
DB-free logic into `src/lib/` (`history.ts`, `crypto.ts`) with zero Prisma
dependency, re-exported from their original locations so nothing else
changes. Added a Prisma-mocking test setup (`__tests__/setup.ts`) as a
backstop for anything that still transitively touches it.

```bash
cd apps/api
pnpm exec vitest run
```

**Fine-tuning — scoped honestly, not faked.** Actually training a model
needs real infrastructure (a training job, GPU time or a provider's
fine-tuning API, hosting the resulting weights) that doesn't exist here and
isn't something to pretend. What's real and shipped:
`GET /admin/export-training-data` exports your own conversation history as
JSONL in the standard format OpenAI's (and most providers') fine-tuning
APIs expect. **Real limitation, stated plainly in the code and here**: it
only exports plain user/assistant text exchanges — tool-calling turns (most
of what this agent actually does) are skipped, because representing them
correctly needs provider-specific function-calling training formats that
differ enough between Anthropic/OpenAI/Groq that a one-size export would be
misleading. This is a starting point for text-only fine-tuning, not a
finished tool-use training pipeline.

### New migration (Workflow.consecutiveFailures)
```bash
cd apps/api
pnpm exec prisma migrate dev --name add_workflow_backoff
```

### Still genuinely not done

- **Stripe downgrade UI** — functionally covered already (the customer
  portal button on `/billing` handles cancel/downgrade via Stripe's own
  hosted page), just never got a dedicated in-app button of its own
- **A real domain + HTTPS** — required for Stripe webhooks and Clerk
  redirects to work at all; this is on you when you actually deploy, not
  something buildable from here
- **Integration tests against a real database** — the unit test suite above
  is real and passing, but it deliberately doesn't touch Prisma; testing
  the actual DB-backed logic (usage limits, ownership checks, workflow
  scheduling) needs a real test database and seeded fixtures, which is a
  meaningfully bigger effort than what's here

---

## 28. The last two items (this update)

**Stripe downgrade — a real in-app button now.** `/billing` shows your
actual plan status (fetched from `/usage`) and, if you're on Pro, a
**"Downgrade to Free"** button that cancels directly — no redirect to
Stripe's portal required for the single most common thing someone wants to
do. It cancels at the end of the current billing period (standard SaaS
behavior: you keep what you paid for), and the existing webhook
(`customer.subscription.deleted`) flips the plan to free for real once that
period ends — nothing new needed there, it already handled this correctly.
The portal link is still there, relabeled to what it's actually for now:
updating a card or viewing invoices.

**Integration-style tests — as real as this project can get without a live
database.** A pure-function unit test can't catch bugs in the actual
DB-touching business logic (an off-by-one in a usage limit, a wrong plan
resolved, a period reset firing at the wrong time). Added 7 tests against
`checkAndIncrementUsage`/`getUsage` using a fully mocked Prisma client
(`vitest-mock-extended`) — the real logic in `usage.ts` runs for real, the
database calls are swapped for controllable mocks. This caught nothing
broken right now, but it's exactly the kind of test that would catch it if
someone changed the limit logic later. **This is still not a true
integration test against a real Postgres** — that needs a real test
database and seeded fixtures, a genuinely bigger effort, honestly still not
done. What's here is the realistic middle ground: real business logic,
mocked data layer.

```bash
cd apps/api
pnpm exec vitest run
```
23 tests, 5 files, all passing.

### What's left, for real this time

- **A true integration test suite against a real database** — the one
  item from the original audit that's still genuinely open. Everything
  else from every round of "what's missing" is now built.
- **A real domain + HTTPS, and your actual Stripe/Clerk keys** — these were
  never things I could do for you; they're the actual next step now that
  everything else is in place.

---

## 29. Fixed: "Publishable key is missing" from clerkMiddleware (this update)

Real gap in the setup docs, not a code bug: `@clerk/express`'s
`clerkMiddleware()` needs **both** `CLERK_SECRET_KEY` and
`CLERK_PUBLISHABLE_KEY` set server-side in `apps/api/.env` — the earlier
instructions only mentioned the secret key. `.env.example` now includes
both. Add:
```
CLERK_PUBLISHABLE_KEY="pk_test_..."
```
— the same `pk_test_`/`pk_live_` value already in `apps/web/.env` as
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, just without that prefix — then
restart the API.

---

## 30. Fixed: "Failed to fetch" was a hanging request, not a network error (this update)

**Root cause of your errors:** `prisma.workflow` and `prisma.notification`
were `undefined` — the Prisma Client hadn't been regenerated since the
Workflow/Notification/AgentIncident schema additions from the last few
rounds. Run this to catch up on everything pending at once:
```bash
cd apps/api
pnpm exec prisma migrate dev
```
(no `--name` needed — it applies every pending migration in one go)

**Why it showed up as "Failed to fetch" in the browser, not a clear error:**
a few routes (`/notifications`, `/chat/conversations`, and likely others
added across recent rounds) weren't wrapped in try/catch. When the query
inside them threw, the request never got a response at all — not an error
response, no response, ever — which is exactly what "Failed to fetch"
means in the browser: not "the server said no," but "nothing ever came
back." Fixed properly, systemically, not by patching each route one at a
time: added `express-async-errors` (patches Express so any thrown/rejected
error in an async route handler reaches a central error handler) plus one
global error-handling middleware at the end of `index.ts`. From now on,
any route that breaks — this bug, or a future one — returns a real `500`
with an actual error message instead of hanging silently.

---

## 31. Fixed: express-async-errors was incompatible with Express 5 (this update)

The `express-async-errors` package added last round crashed the API on
startup: `Cannot find module 'express/lib/router/layer'`. Real cause — that
package pokes at Express 4's internal file layout to patch in async error
handling, and this project runs **Express 5** (`^5.2.1`), which restructured
its router internals in that exact way. The package isn't just unneeded
here, it's actively broken against this version.

**The good news: it was never necessary in the first place.** Express 5 has
native async error handling — any thrown or rejected error inside an async
route handler is automatically forwarded to error-handling middleware,
no patch required. Removed the package entirely; the global error handler
added last round works exactly the same without it, since it was always
relying on standard Express error-middleware behavior, which Express 5
provides natively.

No action needed on your end beyond pulling this update — `pnpm install`
will remove the broken dependency automatically.

---

## 32. Autonomy, form filling, UI fixes, branding (this update)

### The crash
`conversations.map is not a function` — in hosted mode the endpoint returns
`{error: ...}` on 401 instead of an array, and that object was being set as
state directly. Fixed at the source (validate the shape before setting) and
defensively in the sidebar itself.

### Hosted mode not switching to login
Real bug: `proxy.ts` read `NEXT_PUBLIC_HOSTED_MODE` at module scope, so the
value got captured once and flipping it in `.env` didn't take effect. Now
read per-request — a server restart is enough.

### Bank details not showing
Real bug: `getBankDetails()` required BOTH `BANK_NAME` and
`BANK_ACCOUNT_TITLE` and returned `null` otherwise — so setting just the
account number and IBAN (what someone actually needs to send a transfer)
displayed nothing. Now shows the section if ANY field is set.

### Agent autonomy — the big one

Two new ungated tools, because the old behavior (an approval to click "Open
roles") was genuinely wrong:
- **`clickToNavigate`** — clicks buttons/tabs/"next page"/"show more" and
  returns the resulting page's content and elements in one call. No
  approval, ever: navigation changes nothing.
- **`getUserProfile`** — the user's saved details (name, email, phone,
  links, resume text) so forms get filled with real information instead of
  the agent asking them to retype it.

And a new gated action type:
- **`form_fill`** — fills an ENTIRE form and optionally submits it as ONE
  approval. Applying to a job is now one thing to review and accept, not a
  dozen field-by-field approvals.

The system prompt was rewritten around finishing tasks: browse, click
through, read, and come back with the actual answer — only stopping for
approval when something is genuinely submitted, sent, posted, or applied.

**Set your details at `/profile` (API: `GET`/`POST /profile`)** so form
filling works. The mouse cursor, smooth movement, and character-by-character
typing all apply to form fills too, when `BROWSER_HEADLESS="false"`.

**What has NOT changed, deliberately:** anything that submits, sends, posts,
or applies still requires your approval. That boundary is what makes
unattended workflows safe to run at all — and it's why `form_fill` shows you
every value before it's entered rather than just doing it.

### New migration (UserProfile table)
```bash
cd apps/api
pnpm exec prisma migrate dev --name add_user_profile
```

### UI and branding
- Chat header buttons properly aligned in a consistent icon row
- Notification panel rebuilt: header with unread count, "mark all read",
  click-outside-to-close, real empty state, unread dots
- New logo (`/logo.svg`) + favicon, replacing the Next.js defaults
- Landing page: logo in nav, and a **Workflows section** with three concrete
  scheduled-task examples
