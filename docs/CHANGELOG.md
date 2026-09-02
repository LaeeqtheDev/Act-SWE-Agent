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

---

## 33. Sign-in UI, duplicate settings, docs restructure (this update)

**No way to sign in (real bug).** Hosted mode had no sign-in UI anywhere —
the proxy redirected protected routes but the landing page offered no entry
point, so API calls just failed with "Sign in required" and nowhere to go.
Added `AuthNav`: real Sign in / Get started buttons when signed out, account
menu when signed in, and a plain CTA in self-host mode where there are no
accounts at all. Also extended the protected route list to cover
`/workflows`, `/billing`, and `/profile`, which were previously unguarded.

**Duplicate settings.** Settings appeared in both the chat header and the
sidebar footer. Removed the sidebar copy; that slot now holds a "Your
details" link to `/profile`, which had no entry point at all despite being
required for form auto-fill.

**Missing `/profile` page.** The API routes existed but there was no UI.
Built it — name, email, phone, location, links, and a resume field for
longer form questions.

**Demo data on the dashboard.** Those services and incidents come from
`prisma/seed.ts` (seeded for the landing demo widget). Added
`pnpm clear-demo` in `apps/api` to remove them while leaving conversations,
workflows, agent incidents, and your profile untouched.

**Documentation restructured.** This file had grown to 1,200 lines of
chronological changelog — genuinely useful history, but unusable as
documentation. Split into:
- `README.md` — a real entry point
- `docs/SETUP.md` — install through troubleshooting
- `docs/USAGE.md` — capabilities and the approval boundary
- `docs/HOSTING.md` — all opt-in hosted-mode setup in one place
- `docs/ARCHITECTURE.md` — for contributors
- `docs/CHANGELOG.md` — this file, kept as history

---

## 34. Hosted mode wasn't actually activating (this update)

**The real bug — same class I fixed in proxy.ts, but I missed the rest.**
`ClerkProviderIfHosted`, `AuthNav`, `ClerkTokenBridge`, and the agent page
all read `NEXT_PUBLIC_HOSTED_MODE` into a **module-scope const**. Next
inlines `NEXT_PUBLIC_*` at build time, and a module-scope const freezes it
again at first evaluation — so setting `HOSTED_MODE=true` genuinely did
nothing without a full clean rebuild. That's why there was still no
login/signup despite the flag being set.

Fixed at the root: one shared `isHostedMode()` helper in
`lib/hosted-mode.ts`, read at call time, used everywhere (including
`proxy.ts`). A dev-server restart is now enough.

**New `/config` diagnostic endpoint** so this is answerable at a glance
instead of by guessing:
```bash
curl http://localhost:4000/config
```
Reports `hostedMode`, `clerkConfigured`, `stripeConfigured`,
`bankTransferConfigured`, `smtpConfigured`, `browserVisible`,
`localDevTools`, `chromeProfile`. If `hostedMode` is false there, the API
never picked up the env change — restart it.

**Empty demo section on the dashboard.** After `pnpm clear-demo` the
services and incidents were gone but their headers still rendered. The whole
demo block is now conditional on the data actually existing.

---

## 35. Landing page 500 + the real reason login didn't work (this update)

**Two bugs, both mine.**

**1. The landing page was 500ing.** The `workflowExamples` and `pipeline`
arrays stored Lucide icon *component references*, then passed them from a
server component into client components (`Reveal`, `PipelineScroll`). React
can't serialize a function across that boundary — hence
`Functions cannot be passed directly to Client Components` for Zap, Layers,
Search, ShieldCheck, CircleCheck. Fixed by storing plain string keys and
resolving the actual icon inside the component that renders it.

**2. `@clerk/nextjs: Missing secretKey`, and 404s on /billing.** `proxy.ts`
runs server-side *inside the Next app*, so it needs its own
`CLERK_SECRET_KEY` in **`apps/web/.env`** — separate from the API's copy.
Every doc so far only mentioned the API's. `apps/web/.env.example` now lists
it explicitly.

So hosted mode needs FOUR values, not three:
```bash
# apps/api/.env
HOSTED_MODE="true"
CLERK_SECRET_KEY="sk_test_..."
CLERK_PUBLISHABLE_KEY="pk_test_..."

# apps/web/.env
NEXT_PUBLIC_HOSTED_MODE="true"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."          # <- the one that was missing
```

**New `/debug` page** — visit http://localhost:3000/debug to see exactly
what the web app and API each currently have set, with a loud warning on
mismatch. Delete the page before deploying publicly.

---

## 36. getToken crash, hosted-mode UX, landing rewrite (this update)

**`getToken is not a function` — real root-cause fix.** `HostedTokenBridge`
called `onReady(getToken)` with the function bare. React state setters treat
a function argument as an *updater* and store its RETURN value, so every
consumer received `undefined` instead of the getter. Fixed at the source
(`onReady(() => getToken())`) and hardened every consumer with a
`typeof === "function"` guard.

**Signed-in users landed on the landing page.** Sign in/up now
`forceRedirectUrl="/agent"`.

**"Why am I asked for an API key when logged in?"** You weren't required to
— the server's own key was already the fallback — but the UI didn't say so.
`/settings/provider` now reports `serverConfigured` + `serverModel`, and the
settings panel shows "You're all set — no key needed. Already running on
groq/openai/gpt-oss-20b." BYOK is now framed as optional.

**Profile form.** Added a country dropdown that auto-fills the matching dial
code, plus a separate dial-code selector — no more typing a full phone
number from scratch. New `country`/`dialCode` columns.

**Chat composer rebuilt** to match the reference: rounded multiline
textarea, auto-growing height, Enter to send / Shift+Enter for newline
(previously impossible — it was a single-line input), the active model shown
as a chip, and an inline send button with a loading state.

**Landing page now sells the product, not the codebase.** The old
"4 services / 5 providers / 9 tools" counters described the repo. Replaced
with six real requests in the user's own words — "Find backend roles at
Stripe and apply to the best fit", "What came in overnight that actually
needs me?" — each explaining what the agent actually does.

**New logo** — a cursor arrow with an amber pulse.

### Migration needed
```bash
cd apps/api && pnpm exec prisma migrate dev --name add_profile_country
```

---

## 37. Infinite render loop, unified navigation (this update)

**`Maximum update depth exceeded` — real fix.** `ClerkTokenBridge` took
`onReady` as an effect dependency, but every caller passes an inline arrow,
so it was a new function on every render: effect runs → setState → rerender
→ new onReady → effect runs → forever. Now held in a ref, so the effect
depends only on `getToken`. This also caused the cascading
`Failed to fetch` spam.

**Prisma `EPERM ... query_engine-windows.dll`.** Not a code bug — Windows
file lock. The migration itself applied fine. Stop every node process, then:
```bash
cd apps/api && pnpm exec prisma generate
```

**Navigation — the real complaint, properly fixed.** Every page had its own
ad-hoc header, so billing and profile were unreachable without knowing the
URL. Added `AppNav`: one shared bar across Chat, Activity, Workflows,
Profile, and Billing (hosted only), with active-route highlighting, the
notification bell, and the account menu. Replaced the bespoke headers and
"Back to chat" breadcrumbs on all five pages.

**Signed-in users no longer land on `/`.** The proxy now redirects them to
`/agent`. Signing out clears the session, so the landing page is reachable
again immediately.

**New logo** — geometric "A" with an amber action node, replacing the
previous mark.

---

## 38. Hallucinated tool calls, duplicate profile link, billing clarity

**`attempted to call tool 'search' which was not in request.tools`.** The
model invented a tool that doesn't exist. Groq validates tool names
server-side and rejects the request with a 400, so it never reached our
error handling — the whole conversation died. Two fixes:
1. `openai-compatible.ts` catches `tool_use_failed` and retries once with a
   system message naming the tools that actually exist. The turn recovers
   instead of failing.
2. `runTool`'s unknown-tool branch now lists the real tool names in its
   error, so a model that gets past validation self-corrects next turn.

This is a small-model failure mode (`gpt-oss-20b` is more prone to it than
larger models), but the app shouldn't break when it happens.

**Duplicate profile link.** The sidebar still had "Your details" from before
`AppNav` existed. Removed — profile lives in the nav now. The sidebar footer
also only renders when there's something to clear, instead of showing an
empty bordered strip.

**Billing.** Free-plan users now see their plan and usage (previously only
Pro users saw any status, so a free user had no idea where they stood).
Admin receipts now show submission and review timestamps — both were
fetched but never displayed.

---

## 39. Security audit + stale suggestions (this update)

### Audit findings — five real issues, all fixed

Every one of these only mattered in hosted mode, but all were genuine:

1. **`/agent-incidents` was fully public.** Any unauthenticated visitor
   could read everything the agent had been doing, and mark incidents
   resolved. Now requires auth.
2. **`/notifications/:id/read` had no auth.** Anyone could mark another
   account's notifications read by guessing an id. Now requires auth.
3. **`/profile` leaked saved details.** It used optional `currentUserId`,
   so an unauthenticated request fell through to the shared "default" row —
   exposing one user's name, email, phone, and resume to anonymous callers.
   Now requires auth.
4. **`/settings/provider` was writable by anyone.** Same optional-userId
   pattern: an anonymous caller could read masked key state or overwrite the
   provider config for everyone. Now requires auth.
5. **Local dev tools weren't blocked in hosted mode.** They were gated on
   `ENABLE_LOCAL_DEV_TOOLS` alone — so enabling both flags together would
   give every signed-up stranger read access to the server's filesystem and
   the ability to propose shell commands. Now hard-blocked whenever
   `HOSTED_MODE=true`, regardless of the other flag.

Also verified clean: no real secrets anywhere in the repo (only test
fixtures and docs placeholders), `.env` properly gitignored, browser tool
correctly requires explicit opt-in.

### Stale chat suggestions

The starter prompts referenced `payments-api` and `orders-api` — seeded
demo services that vanish the moment someone runs `pnpm clear-demo`, so
clicking a suggestion just failed. Replaced with prompts that exercise real
capabilities regardless of seed data (web search, browsing, job hunting,
inbox). The landing demo widget now also says plainly when the demo dataset
isn't loaded rather than inventing services.

### Where the API key goes

The settings panel now links directly to each provider's key page —
`console.groq.com/keys` for Groq, noting the free tier needs no card. Model
selection between all six Groq models already worked in the dropdown;
what was missing was any indication of where to get a key in the first place.

---

## 40. Regression from the audit + landing page conversion work

**`Failed to fetch` on /notifications — my regression.** The audit in #39
added auth guards to `/notifications`, `/profile`, `/settings/provider`, and
`/agent-incidents`. But the frontend fires those requests on mount, before
the Clerk token has arrived — so every one was a guaranteed 401, and the
notification bell polls every 30s, turning it into a steady stream of
unhandled rejections.

Fixed properly rather than by suppressing the symptom: every authenticated
fetch now waits for the token before firing (`isHostedMode() && typeof
getToken !== "function"` → return), and treats a non-OK response as expected
rather than an error. Applied consistently to the notification bell, usage
banner, profile, workflows, and the conversation list.

**Landing page.**
- Hero rewritten: "It doesn't explain. It does the work." — with subcopy
  that describes the actual job-application flow instead of listing features
- Three trust signals under the CTAs answering the objections people
  actually have: approval gate, no credentials handed over, MIT self-host
- New **Comparison** section — six before/after rows contrasting the old way
  with what this does, staggered in on scroll via GSAP. This is the clearest
  way to communicate the difference without a wall of text.

---

## 41. Why searches ran forever, cancel button, hosted local tools

**The real reason "nothing happened" on a web search.** `webSearch` piped
DuckDuckGo's HTML through `browseWeb` and handed the model the raw page
text — nav chrome, cookie banners, and all. It couldn't tell what the actual
results were, so it kept re-searching and browsing until it burned every
turn. That's the `webSearch webSearch browseWeb browseWeb browseWeb
browseWeb webSearch webSearch` trace, ending in nothing.

Rewritten to return **structured results** — title, real URL (unwrapped from
DuckDuckGo's redirect), and snippet. One call now usually answers the
question. The system prompt also tells the agent to answer from snippets
rather than opening every result "to be thorough."

**Running out of turns discarded everything.** The agent would gather real
findings and then throw them away with "I didn't reach a final answer." Now
it makes one final tool-free pass to summarize what it actually found — a
partial answer beats none.

**Cancel button.** An in-flight turn can be stopped: the send button becomes
a stop button while running, wired to an `AbortController`.

**Local dev tools in hosted mode — you were right.** I'd hard-blocked them
whenever `HOSTED_MODE=true`, which was over-restrictive. Reverted:
`ENABLE_LOCAL_DEV_TOOLS` is the single switch, hosted or not. Worth knowing
what you're choosing though — these tools act on the machine running the
API, so enabling them on a public signup gives every registered user read
access to that server's files and the ability to propose shell commands on
it. Fine for a single-operator deployment, serious for open registration.
Still off by default.

**UI.** Removed the border above the chat input, gave the sidebar borders an
explicit color, and themed Clerk's modal to match the dark UI — which also
removes the "Optional" hints on the name fields.

---

## 42. Non-array API responses crashing list views

**`incidents.filter is not a function`** — same root cause as the earlier
sidebar crash, and I only fixed that one spot at the time. When an endpoint
returns `{error: ...}` (401 before auth, or a 500), that object was being
set directly into state typed as an array, so `.filter`/`.map` blew up on
render.

Fixed everywhere it could happen this time, not just where it was reported:
agent activity, agent incidents, incident events, admin pending payments,
admin users, and workflows. Each now validates with `Array.isArray()` before
setting state.

**Visible cursor across navigations.** The overlay lives in the DOM, so it
was wiped on every page load — meaning the cursor showed up for one action
and then vanished. Now re-injected after each navigation, so the pointer
stays visible for a whole multi-step task.

Confirmed wired across all three action paths: form filling (typed
character by character, ~20ms/char), navigation clicks, and approved browser
actions — each moves the mouse in interpolated steps to the target before
clicking. All gated on `BROWSER_HEADLESS="false"` or `CHROME_USER_DATA_DIR`
being set; zero overhead when headless.

---

## 43. Cancel crash, encryption key on Windows, CAPTCHA handling

**`signal is aborted without reason`.** `abort()` with no argument produces
an AbortError that Next's dev overlay surfaces as a runtime crash — for what
is a deliberate user action. Now aborts with an explicit reason, and the
catch checks `err.name` directly (DOMException doesn't extend Error in every
runtime, so `instanceof Error` missed it).

**`SETTINGS_ENCRYPTION_KEY` warning.** The message told you to run
`openssl rand -hex 32`, which isn't available on a default Windows install.
Added `pnpm gen-key` in `apps/api` — works anywhere Node runs. The warning
now points at that, and notes the thing that actually matters: changing this
key later makes already-saved API keys unreadable, so set it before people
start saving keys.

**CAPTCHAs / "select all the buses".** Two changes, and one honest limit.

*Reduced how often they fire:* Playwright's default browser announces itself
as automated in several obvious ways. Now launches with
`--disable-blink-features=AutomationControlled`, a real user agent, a normal
viewport, and `navigator.webdriver` masked — the single most-checked signal.
Well-behaved sites stop over-triggering.

*Handled honestly when they do:* `browseWeb` detects challenge pages and
returns a clear `[BLOCKED]` marker instead of letting the agent read the
CAPTCHA text and report it as page content — which is what made these
failures so confusing.

*The limit:* this does not defeat serious bot detection, and isn't trying
to. Google Search, LinkedIn at volume, and Cloudflare-protected sites will
still block. **The real answer is `CHROME_USER_DATA_DIR`** — using your own
logged-in Chrome profile, with its real history and cookies, gets challenged
far less than any fresh browser. And with `BROWSER_HEADLESS="false"`, if a
challenge does appear you can solve it yourself in the visible window and
tell the agent to retry.

---

## 44. Rate limits and token budget

**429s were killing conversations ~20s before they'd have worked.** Groq
returns a `retry-after` header saying exactly how long to wait, and we
ignored it. Now waits and retries (up to twice, capped at 30s each) — a hard
failure becomes a pause. A genuinely exhausted quota still fails fast rather
than hanging.

**The deeper cause: we were sending too much per turn.** On an 8,000
tokens/minute free tier, a few full tool results is the entire budget.
Trimmed across the board:
- History compaction keeps only the single most recent tool result intact
  (was 2), and truncates older ones to 150 chars (was 250)
- Search returns 5 results with 180-char snippets (was 8 × 300)
- Page text capped at 900 chars (was 1200–1500)
- Interactive elements capped at 25 (was 40)

**Rate-limit errors now say what they are.** Instead of a generic failure,
you get: hit the rate limit, wait a minute, or switch to a larger model —
which is genuinely the better fix, since bigger models need fewer steps.

**Why you're not seeing the browser.** `.env.example` sets
`BROWSER_HEADLESS="false"`, but your `apps/api/.env` was copied before that
default existed, so it's still headless. The API now prints its browser
config at startup:
```
[browser] visible window: OFF (set BROWSER_HEADLESS="false" to watch it work) | your Chrome profile: OFF
```
Add both to `apps/api/.env` and restart — `CHROME_USER_DATA_DIR` also
sharply reduces CAPTCHAs, since a real profile with real history gets
challenged far less than a fresh browser.

---

## 45. Parallel browser sessions + acting instead of describing

**Five tasks can now run five browsers.** The browser tool held ONE global
page shared by every conversation and workflow — so two running at once
fought over the same tab, one navigating away mid-task from under the other.

Now keyed by conversation id: each chat and each scheduled workflow gets its
own independent browser window. Idle sessions close after 15 minutes, capped
at 5 concurrent (least-recently-used evicted) so a long-running server
doesn't accumulate windows until it runs out of memory.

One wrinkle worth knowing: a Chrome profile directory can only be opened by
one browser at a time. The first session uses your real
`CHROME_USER_DATA_DIR` (with your logins); additional parallel sessions get
their own suffixed directories — isolated, but starting logged out.

**"It didn't play anything."** Two causes:

1. *The prompt didn't tell it to act.* It browsed to YouTube, read the
   results, and described them — which is what it was told to do. Now
   explicit: when the task is to DO something on a page, loading the page is
   step one; read the interactiveElements, pick the match, and click it.
   "Play the top song" means search *then click the video*.

2. *My own regression from the last round.* Trimming tool results to 150
   chars to save tokens also destroyed the interactiveElements list the
   agent needs to click anything on the next turn — so even if it wanted to
   act, it no longer had the selectors. Raised to 200 chars with the last
   two results kept intact, which is enough for "browse a page, then click
   something on it" to work.
