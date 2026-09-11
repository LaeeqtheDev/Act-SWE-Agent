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

---

## 46. Why clicks silently failed

**Root cause: truncated selectors could never match.** Element labels are cut
to 60 chars to keep payloads small, then used to build
`role=link[name="<truncated>"]` — but role-name matching is **exact**. A
truncated name matches nothing, so every click on an element with a long
label failed silently. YouTube video titles, job listings, article headlines
— all of them.

That's the whole `clickToNavigate clickToNavigate ... clickToNavigate` trace
ending with nothing played. It wasn't confused; it was firing selectors that
could not possibly resolve.

Now uses a case-insensitive substring regex on the first 40 characters, with
regex metacharacters escaped (verified against a real YouTube title
containing `|`, which would otherwise have produced an invalid pattern).

**Failed clicks returned nothing useful.** Just "click failed" — no
indication of what *was* clickable, so the agent retried variations of the
same broken selector until it ran out of turns. Failures now return the
page's current `interactiveElements` and the current URL, so it can pick
something real.

**Prefer href over clicking.** If an element has an href, browsing straight
to it is faster and far more reliable than clicking through a results page —
a YouTube watch URL just plays. `clickToNavigate` is now positioned as the
fallback for JS-driven controls with no href.

---

## 47. Cancel actually cancels; chat isn't a task

**Stop only stopped the browser.** The client aborted its request, but the
server kept running the entire agent loop — still calling the model, still
burning tokens and a task quota on work nobody was waiting for. The request
now signals cancellation on disconnect, and the loop checks between turns
and between tool calls, so it stops at the next boundary.

**"thank you it worked" burned a task and fired tools.** Two fixes, because
a prompt instruction alone isn't reliable on a small model:
- The prompt now says plainly that acknowledgements are just talk.
- More importantly, `isPleasantry()` detects them in code: no task charged,
  and **no tools passed to the model at all** — it literally cannot fire one
  rather than being asked not to.

Writing tests for that classifier immediately caught two real false
positives — "great, now open youtube and play it" and "no, use the other one
instead" were both being treated as small talk, which would have silently
stripped the agent's tools from genuine requests. The pattern is now
anchored to the whole message, so anything following the pleasantry means
it's a request. That's the safe direction to err in: charging a task for a
chatty message is a much smaller cost than breaking a real one.

25 tests passing (was 23).

---

## 48. Cancel actually aborts; a real visible cursor

**Cancel didn't stop work in flight.** The previous fix checked a boolean
flag between turns — but an in-flight model call or page load ran to
completion regardless; we just discarded the result afterwards. That's why
cancelling mid-task appeared to keep going: it genuinely was.

Now a real `AbortController` threaded through `sendMessage` → the agent loop
→ `provider.runTurn` → the underlying HTTP call. Added `signal` to the
`AIProvider` interface and wired it into both the OpenAI-compatible and
Anthropic providers, so pressing Stop aborts the request immediately rather
than at the next checkpoint. An abort is treated as a clean stop, not an
error to log.

**The cursor was invisible for a real reason.** The overlay only moved on
`mousemove`, and started at (0,0) — so until the first move event landed it
sat off in the corner. Replaced with:
- An actual pointer-arrow SVG (a floating dot doesn't read as "something is
  using this computer")
- Positioned centre-screen on injection, so it's visible immediately
- A click pulse ring, so the moment of clicking is obvious
- Movement that scales steps to distance — a short hop no longer takes as
  long as crossing the page, which is part of why it felt sluggish
- Per-page position tracking, so movement starts from where the mouse
  actually is rather than an unknown origin

Each conversation already had its own browser session (#45), so with
multiple tasks running you get one visible cursor per window.

**Notification bell noise.** `openAndMarkRead` had no error handling at all —
an unreachable API threw an unhandled rejection on every click. Polling also
now backs off after three consecutive failures instead of generating a
failed request every 30 seconds forever.

---

## 49. Why the mouse looked frozen, and real speed work

**The mouse bug had an obvious cause once found.** `slowMo: 120` delays
EVERY Playwright operation — including each of the 25 interpolated mouse
steps. So a single mouse move took ~3 seconds, and because each step was
separated by a blocking delay it read as teleporting between frozen
positions rather than moving. It was simultaneously the reason things were
slow AND the reason movement wasn't visible.

Removed `slowMo` entirely and replaced it with explicit pacing inside
`moveTo()`: a manual walk along the path with a 14ms step delay and an
ease-out cubic curve. ~600px in about a third of a second — genuinely
visible, and roughly 10x faster than before.

Also cut: SPA settle wait 600ms → 250ms, typing delay 20-35ms → 12ms.

**Read-only tools now run in parallel.** Three web searches took three times
as long as one for no reason. Tools that only read (`webSearch`, service
health, profile, project files) now run concurrently; anything that drives
the shared browser page stays strictly sequential, since two clicks at once
would fight over the same tab. Added a test that fails loudly if a stateful
tool is ever added to the parallel-safe list.

**Five new capabilities**, each closing a gap that genuinely blocked tasks:
- `scrollPage` — feeds, job boards and search results lazy-load, so content
  below the fold *does not exist* in the page until you scroll. The agent
  was seeing one screenful and concluding that was everything.
- `goBack` — recover from opening the wrong result without re-running the
  entire search.
- `readPageAsMarkdown` — preserves headings, lists and tables, so long job
  descriptions and documents keep the structure that tells you which
  requirement sits under which section.
- `pressKey` — Enter to submit a search box with no visible button, Escape
  to dismiss a dialog, Tab between fields.
- `screenshotPage` — for pages where text extraction returns nothing useful.

The prompt now tells the agent to scroll before concluding there are no more
results, and to batch independent reads into one turn instead of one per
turn.

27 tests passing (was 25).

---

## 50. Cancel reaching the tools, and why no mouse was visible

**Cancel didn't reach the tools.** The abort signal was threaded into the
provider call, but `runTool` never received it — so a tool call that was
already queued would still launch Chrome after Stop was pressed. That's the
"it opened Chrome again and again." Now `runTool` checks the signal before
doing anything, and cancelling closes that conversation's browser window
instead of leaving it open.

**Why there was no visible mouse — a real gap, not a config problem.**
`moveTo()` was only ever called from form filling and approved click
actions. A task that searches and browses — which is most tasks — never
touched it. There was genuinely nothing to watch.

Two fixes:
- `webSearch` had its own always-headless browser, so search-only tasks
  opened no visible window at all. It now uses the shared visible session.
- `browseWeb` now sweeps the cursor across the page after each load, so any
  browsing shows movement rather than only clicks.

Also added a per-launch log so this is diagnosable from the terminal:
```
[browser] launched session "abc123" — visible: YES, profile: yours
```
If that says `NO`, `BROWSER_HEADLESS="false"` isn't set in `apps/api/.env`.

---

## 51. Chrome launching after cancel, speed, docs rewrite

**Six Chrome windows after one cancel — found the real gap.** The previous
fix checked the abort signal at `runTool` entry, but a browse takes seconds:
by the time the next queued tool call arrived, that check had already passed
and Chrome launched anyway. Guarding at the call site was never going to
hold.

Moved the check into `getSession()` — the single function that can create a
browser window, so it's the only place the guard is guaranteed to apply. A
cancelled conversation is now recorded in a set, and the abort event fires
the moment Stop is pressed rather than waiting for the loop's next
checkpoint. The set clears on the next message so the conversation stays
usable.

**Speed.** The cursor animation was being awaited before reading each page —
~300ms per navigation for something purely cosmetic. Now fire-and-forget:
still visible, no longer blocking. Also halved the mouse step delay (14ms →
8ms), reduced step counts, and cut post-navigation waits (250ms → 120ms,
700ms → 450ms, 400ms → 200ms). Compounded across a multi-step task this is
the difference between sluggish and responsive.

**Docs rewritten as actual documentation.** It was one long page of loosely
grouped paragraphs. Now has a persistent sidebar with nested sections,
scroll-spy highlighting the current heading, and consistent components for
headings, code blocks, tables, and callouts — so every section looks the
same instead of each inventing its own layout. Content reorganised into
Getting started / Browser control / Capabilities / Workflows / Contributing,
with a proper tool reference table showing which tools need approval.

27 tests passing.

---

## 52. Landing page rebuilt around how people actually decide

The page had the right pieces in the wrong order — the live demo sat second,
before anyone knew what they were looking at, and there was no answer to the
obvious question ("do I hand over my passwords?") anywhere on it.

**Reordered into a narrative:** what it does → how it works → why it's
different → try it → workflows → pricing → questions → start. The demo now
lands after someone understands what they're testing, which is when they'll
actually engage with it.

**New: How it works.** A four-step vertical timeline — ask, watch, approve,
finished — with a line that draws itself as you scroll and steps that fade in
staggered. Most people don't read feature lists but will follow a sequence,
and this one carries the core pitch in four sentences.

**New: FAQ.** Eight real objections, answered honestly — including the ones
that don't flatter the product. It says plainly that Google Search and
Cloudflare-protected sites still block automated browsers, because a page
that only makes claims reads as marketing, while one that names its own
limits reads as something built by people who actually use it.

**Copy.** The closing CTA moved from "Clone it. Add your key." (which speaks
only to developers) to "Stop reading about it. Give it something to do." The
demo header now clarifies it's a read-only slice of the real thing.

27 tests passing.

---

## 53. Positioning for people who aren't developers

The page was written by a developer for developers — "MIT licensed" in the
nav, "Fork it" as the secondary CTA, "bring your own model" as the tagline,
and a use case about restarting Kubernetes pods. None of that means anything
to someone who just wants their inbox handled.

**Copy rewritten throughout:**
- Tagline: "Open source · bring your own model" → "Your own AI assistant that
  actually does things"
- Hero now describes outcomes (job applications, inbox triage, research,
  bookings) rather than architecture
- Secondary CTA: "Fork it" → "See how it works"
- Removed the MIT badge and GitHub star button from the nav; added Pricing
- Use cases: swapped the Kubernetes example for booking a restaurant table,
  and "service watch" for price/availability monitoring
- Pricing: "10 agent tasks" → "10 tasks a month", "Fast/economy hosted model"
  → "Fast, capable AI model included", "Self-hosted" → "Run it yourself"

Open source is still mentioned — it's a genuine trust signal — but as
reassurance rather than the lead.

**Colour.** The palette was dead-neutral grey, which reads as a developer
tool. Warmed it slightly (hue 60, very low chroma) and made amber the actual
primary colour, so buttons look clickable rather than being white-on-black.

**Privacy policy and terms**, both written to describe what this software
genuinely does — the browser runs on the user's machine, so most standard
SaaS privacy language doesn't apply. Flagged in code comments as a starting
point needing legal review before launch, with contact details to fill in.

**Real footer** — four columns (product, resources, legal, brand) replacing
the single thin line, with the legal links a payment processor will expect.

---

## 54. Case studies and About, rewritten to sell

**Case studies were describing a product that no longer exists.** All three
were about the simulated Kubernetes demo — database connection exhaustion,
pod crash loops, `payments-api`. Nothing to do with what the agent actually
does now.

Rewritten around four real tasks: applying to a job, morning inbox triage,
comparing vendors, and running something on a schedule. Each walks through
what happens step by step, with the time it saves and the guarantee attached.
Renamed to "What it can do" across the nav — "case studies" implies customer
stories, and there aren't any yet. The page says that plainly rather than
inventing quotes.

**Custom SVG illustrations** rather than stock icons — a browser filling a
form field by field, an inbox with two messages flagged, three sources
converging into one document, a schedule with repeat runs. Each carries the
cursor motif, since "something is using your computer" is the whole idea.
They use `currentColor` and the theme variable, so they follow the palette.

**About was explaining architecture.** Provider abstractions, permission
layers, open-core licensing — none of which answers "why should I trust
this with my email?" Rewritten to lead with the actual gap it fills ("ask a
chatbot to apply for a job and it explains how to apply for a job"), then
three trust principles: you watch it work, it asks before it acts, you can
leave whenever.

**Contact email** filled in throughout — laeeq@northfoundry.co in the privacy
policy, terms, and About page.

**Legal links** added to the marketing shell footer, so privacy and terms
are reachable from every page rather than only the homepage.

---

## 55. Pre-deployment audit — all 14 findings fixed

### Deployment blockers

**1. The Docker image could not run the product.** `node:24-alpine` with no
Chromium and no Playwright install. Alpine uses musl libc; Playwright's
browsers need glibc. Every browser tool — the entire product — would have
failed at runtime on first deploy. Now built on
`mcr.microsoft.com/playwright:v1.49.0-jammy`, with layer-cached installs.

**2. Headless server rendering.** Documented `BROWSER_HEADLESS=true` as the
container default, since a server has no display.

**3. No graceful shutdown.** Every ECS redeploy orphaned Chromium processes
until the task died on memory. Added SIGTERM/SIGINT handling that closes all
browser sessions and the DB pool, with an 8s cap so it can't hang.

**4. No healthchecks.** Added to the API container plus Postgres and Redis,
so the orchestrator can tell a hung container from a healthy one.

### Security

**5. `cors()` with no arguments** allowed every origin — any site could call
the API with a signed-in user's credentials. Now restricted via
`ALLOWED_ORIGINS`, with a startup warning if it's unset in production.
Added `helmet` for standard security headers.

**6. No request body limit.** Capped at 256kb.

**7. No rate limiting outside the demo.** Usage limits are per-task, which
does nothing to stop hundreds of requests a minute against your provider
bill. Added per-IP limiters on chat, investigate, workflow runs, checkout,
approvals, settings, and profile.

### Product

**8. The agent could not type without approval** — the single biggest reason
it felt slower than doing things yourself. "Search YouTube for X" meant
browse → propose → wait for a human → execute. New `typeInto` tool is
ungated, because typing changes nothing; the submit still needs approval.
Password, PIN, CVV, card-number and OTP fields are refused outright and
routed through the approval gate, with a test guarding that.

**9. Scrolling and key presses moved no visible cursor** — half of all
actions happened invisibly. Both now show the pointer. Scrolling also uses a
real mouse wheel event rather than `window.scrollBy`, so infinite-scroll
feeds actually load more.

**10. No `waitForElement`.** The agent clicked before pages rendered, failed,
and burned turns retrying a timing problem.

**11. Forty seconds of silent "thinking..."** New progress endpoint plus
polling in the UI, showing "Opening a page", "Searching the web", "Typing" —
in plain language, not tool names.

### Business model

**12. Billing on messages was the wrong unit.** "What's 2+2" and "apply to
five jobs" both counted as one task despite a ~30x cost difference, so the
heaviest users were the least profitable. Now bills per STEP (one model
call), which is what actually maps to provider cost.

**13. Limits repriced** to 60 free / 2,000 Pro steps, roughly matching the
old task counts while making cost visible. Deliberately does not cut a task
off mid-run — it over-runs slightly and refuses the next one, rather than
leaving someone with nothing for what they've already spent.

**14. No usage visibility.** The billing page now explains what a step is
("a quick question is 1–2; a full job application is 8–12") with a progress
bar, so the limit stops feeling arbitrary.

29 tests passing.

---

## 56. Why it couldn't write in the notepad

**The root cause: it literally could not see the text box.** An empty
`<textarea>` has no label, no placeholder, and no name — and
`collectInteractiveElements` skipped anything without a label. So the agent
opened the notepad, read the page successfully, and saw zero places to type.

That's the whole trace: `browseWeb → readPageAsMarkdown → browseWeb →
scrollPage ×3 → clickToNavigate → browseWeb → webSearch`. It wasn't
confused, it was hunting for something the page-reader never reported.

Text inputs now always appear, labelled by what they are — "textarea field
(empty)", "text editor area" — with a positional `nth=` selector since there's
nothing to match on by name. Checkboxes, radios, and hidden inputs are still
skipped.

**It searched the web for a CSS selector.** `site:onlinenotepad.org notepad
textarea selector` — which can never work, and burned several steps. The
prompt now states plainly: never search for selectors, the answer is in the
interactiveElements list you already have. Also: don't re-browse a page
you're already on, which was the other repeated waste.

**Step budget.** Raised 10 → 16, and the model is now told when it's within
three steps of the limit so it wraps up with what it has instead of exploring
until it's cut off with nothing.

**Expandable steps.** The trace was a row of bare tool names with no way to
tell what happened. Now each step is a row you can click open to see exactly
what was sent and what came back, with success/failure marks and readable
names ("Opened a page", not "browseWeb"). Collapsed to four by default so a
long task doesn't bury the answer.

**Login modal.** The social buttons were rendering dark-on-dark against the
themed card and looked disabled. Clerk's defaults assume a light background;
now explicitly styled, along with the primary button and links.

32 tests passing.

---

## 57. Second audit — six real bugs found

**1. Typing failed on rich-text editors.** Playwright's `fill()` only works
on `<input>` and `<textarea>`; rich-text editors are contenteditable divs —
which is what most online notepads, doc editors, and comment boxes use. So
`typeInto` threw on exactly the surfaces it was added for. Now falls back to
select-all + type, which works on both.

**2. `browseWeb` re-navigated to the page it was already on.** The agent does
this constantly ("let me check the page again") and each time it cost a full
page load AND wiped anything typed into the page. Now skipped when the URL
matches.

**3. The agent never checked its own work.** It would type into a box, never
verify, and report success — which is how you get "I've written that for
you" when nothing was written. New `verifyPageContains` tool, and the prompt
now requires confirming before claiming anything was written or submitted.
It checks input VALUES too, not just rendered text, since typed content
lives in `element.value` and never appears in `innerText`.

**4. `webSearch` was in the parallel-safe list but now drives the shared
browser page.** Two searches at once navigated the same tab and overwrote
each other's results. Removed, and the guard test updated to catch it.

**5. Tool schemas cost 1,444 tokens on every single turn** — 18% of Groq's
free-tier minute budget, resent 16 times a task. Seven of those tools are
service-health / Kubernetes / incident tools that are dead weight for a
browsing agent and useless unless the demo services were seeded. Now behind
`ENABLE_INFRA_TOOLS`, off by default.

**6. `screenshotPage` was built but never registered** — dead code the agent
could never call.

32 tests passing.

---

## 58. Model catalog refresh and codebase search

**The Groq model list was stale.** Checked the current catalog rather than
trusting the old list — Kimi K2 has been dropped, and Qwen3-32B and Llama 4
Scout are now available. Updated to: gpt-oss-120b, qwen3-32b,
llama-3.3-70b-versatile, llama-4-scout, gpt-oss-20b, llama-3.1-8b-instant,
and both Compound variants.

**Default changed from 20B to 120B.** Counterintuitive but correct for this
workload: on a browsing agent the bottleneck is reasoning quality, not
tokens/sec. A model that picks the right selector first time finishes in six
steps where a weaker one flails through sixteen — so the "slower" model is
faster in wall-clock terms and cheaper, since every step resends the whole
conversation. The 20B default is a large part of why tasks were taking
sixteen steps and still failing.

The settings dropdown now explains each model in plain language
("Recommended — best reasoning, finishes tasks in fewer steps") rather than
listing bare model IDs, since choosing badly was the most common cause of
poor results.

**Codebase search added.** The agent could read files but had no way to find
them — so working on code meant guessing paths one at a time and burning
steps on misses. `searchProjectFiles` walks the project, skips
node_modules/dist/build and minified files, and returns file paths with line
numbers. Verified working against this repo before shipping.

32 tests passing.

---

## 59. QA audit — verified rather than assumed

**Tested the DOM logic for real.** Playwright's browsers can't download in
this environment, so instead of claiming the element collection worked, I
extracted the exact shipped `page.evaluate` body and ran it against jsdom.
Six tests now cover the notepad textarea case, contenteditable editors, href
extraction, regex escaping, hidden-input filtering, and the result cap.

That immediately found a real bug: the code relied solely on `innerText`,
which is layout-dependent and returns empty for elements that are scrolled
out of view or inside `display:contents` wrappers — so real links were being
silently dropped, not just jsdom ones. Added a `textContent` fallback.

### Bank transfer — two gaps that would have cost real money

**Users were never told their payment was approved.** They'd transfer money,
upload a receipt, and hear nothing — no email, no in-app message, no way to
check. The predictable outcomes are paying twice or asking for a refund.
Approval and rejection now both send a notification.

**No way to check their own submission.** Added `/billing/my-payments` and a
section on the billing page showing each receipt with its status
("Awaiting review", "Approved") and dates.

### Business gaps

**The first-run suggestions assumed a developer AND a configured browser.**
"Check what's in my inbox" fails silently for anyone who hasn't set
`CHROME_USER_DATA_DIR` — a terrible first impression. Replaced with four
prompts that work out of the box and speak to business users.

**The highest-value capability was invisible.** Reading your actual email,
LinkedIn, and Slack requires connecting your Chrome profile, but nothing
told anyone that — tasks needing it just failed. The chat now shows a
one-time prompt explaining what connecting unlocks, with a link to setup.

38 tests passing (was 32).

---

## 60. Landing page — selling to the actual buyer

**The hero showed a curl command.** `TerminalDemo` sat directly beside the
pitch, in the one place a non-technical visitor decides whether this product
is for them. Replaced with `TaskPreview`: an animated run of a real task
("Apply to the best backend role at Stripe") that ends on the approval
prompt — since the approval gate is the actual differentiator, the preview
should end there rather than on "done".

**Headline was abstract.** "It doesn't explain. It does the work." is clever
but takes a beat to parse and never says what the thing IS. Now "Give it a
task. Watch it get done." — concrete, and the subhead lists what it actually
handles.

**A broken nav link.** "Incidents" pointed at `/dashboard`, which requires
auth — so a signed-out visitor clicking it hit a redirect. It was also
meaningless to the target audience. Removed.

**Nav order and branding.** Docs was first, which signals "developer tool"
before anything else; now: What it can do → Pricing → About → Docs. Brand
shortened from "Act · SWE Agent" to "Act" — "SWE Agent" means nothing to a
business owner.

**Sub-pages looked like a different product.** The marketing shell used a
back-arrow instead of the logo, a different brand string, and carried a
GitHub "Star" button next to the CTA — splitting attention between two
audiences and pulling people off-site at the decision point. Now matches the
landing nav exactly.

38 tests passing.

---

## 61. Multi-stage workflows and spreadsheet output

**A workflow was one prompt in one turn**, which meant your lead-generation
example was impossible: "find businesses → check their websites → email
them" is three distinct jobs, and cramming them into one prompt meant the
agent ran out of steps around stage two.

Workflows now have **stages**. Each runs as a separate agent turn with its
own full step budget, all sharing one conversation — so stage 2 sees what
stage 1 found without anything being passed explicitly.

**Spreadsheet output added.** Real `.xlsx` via ExcelJS, not CSV — a lead list
is only useful if you can open, sort, and filter it, and CSV breaks the
moment a field contains a comma. Rows **append across runs**, so a workflow
scraping 20 businesses an hour builds one growing sheet rather than 24 files
a day. New columns can appear later without dropping earlier rows.

Verified with 5 tests covering write, read-back, append-across-runs,
schema evolution, and a path-traversal guard (a model-supplied sheet name
can't escape the output directory).

**Templates.** Nobody discovers multi-stage pipelines from an empty textarea.
The workflow form now offers three prefilled examples — local business leads
(the full three-stage version), inbox triage, and competitor price tracking.

### Google OAuth verification guide

`docs/GOOGLE-OAUTH-VERIFICATION.md` — privacy policy wording (including the
Limited Use clause reviewers check for directly), per-scope justifications,
the five most common rejection causes, and the submission checklist.

The most useful finding: **`gmail.send` is only "sensitive", not
"restricted"** — so sending doesn't trigger a third-party security
assessment, while `gmail.readonly` does. Those assessments run $15k–$75k.
Shipping with `gmail.send` + browser automation for reading gives users the
same features with no assessment, which is the right sequencing before
there's revenue to justify it.

43 tests passing (was 38).

---

## 62. Slack and Notion — direct API access

The agent now talks to Slack and Notion through their APIs rather than
driving the web UI. An API call is one request; browser automation is a page
load, a DOM scrape, and several clicks — so this is dramatically faster and
doesn't break when either service ships a redesign.

**Read tools (no approval):** `listSlackChannels`, `readSlackChannel` (with
sender IDs resolved to real names), `searchSlack`, `searchNotion`,
`readNotionPage`.

**Write actions (approval required):** `slack_message` and `notion_append`
go through the same `proposeAction` gate as everything else.

### Security decisions worth noting

**Signed CSRF state.** The OAuth `state` parameter is HMAC-signed and
expires after 10 minutes, with a constant-time signature comparison. Without
this, an attacker can trick someone into connecting *their* account to the
attacker's workspace — a real and commonly exploited OAuth flaw.

**Narrow Slack scopes.** Channels the user is in, not workspace-wide admin.
Easier to justify and far less damaging if a token ever leaks.

**Tokens encrypted at rest** with the same AES-256-GCM key as provider API
keys, and never returned to the frontend — the UI only learns that a
connection exists and which workspace.

### A bug typecheck couldn't catch

`AgentAction` had no `userId`. Approving a Slack message would have used
whichever connection happened to resolve — potentially **someone else's
workspace** in hosted mode. Caught by checking the schema directly rather
than trusting that a clean typecheck meant the field existed (Prisma's types
aren't regenerated in this environment, so it compiled fine). Added `userId`
and it's now recorded on every proposed action.

**Tools are only offered when connected.** Otherwise every turn carries five
tool schemas the model can never successfully call, and it wastes steps
discovering that.

Setup is in `apps/api/.env.example`. Slack and Notion both approve public
integrations in days, unlike Gmail's 4–6 week review.

43 tests passing.

---

## 63. Model wouldn't save, typing silently failed, Google search useless

**"Change the model" did nothing.** `openai/gpt-oss-120b` was on the premium
model list from before it became the free Groq default — a direct
contradiction I introduced two rounds ago. Selecting it without Pro or a
personal key returned a 403, and the dropdown just looked frozen. Groq's
entire catalog is free-tier by design; none of it belongs on a premium list.
Removed.

**"It selected everything and typed nothing" — this was a real, specific
bug, not vague flakiness.** `typeInto` clicked a field and immediately typed
into it with no check that the click had actually moved focus there. Some
sites intercept a click on their search box (autocomplete overlays,
combobox wrappers) and keep focus elsewhere — Google's homepage search is
exactly this kind of element. When that happens, "select all + delete" (the
notepad workaround) ran against whatever WAS focused instead, which is
precisely "moved to search and selected everything."

Fixed with two checks, not one:
1. **Before typing** — confirm the clicked element is actually
   `document.activeElement`; if not, explicitly focus it and re-check. If it
   still isn't focused, fail with a specific reason instead of typing
   blind.
2. **After typing** — confirm the field's value actually contains what was
   typed. Some sites reset controlled inputs faster than typing can react,
   and `pressSequentially` doesn't throw when that happens — it would have
   reported success on an empty field.

Both failure paths return the current `interactiveElements` so the agent can
recover instead of repeating the same broken action.

**"It didn't search shit."** Nothing told the model to prefer `webSearch`
over browsing to google.com directly — and Google specifically fights
automated browsers with CAPTCHAs and layout tricks, precisely because so
many bots type into its search box. The prompt now says this outright:
never navigate to Google's search box, `webSearch` exists so you never have
to, and if its results aren't enough, browse a specific site directly
instead of going through Google.

48 tests passing (was 43) — includes 5 new tests locking down the
type-verification decision rules, and a correction to the premium-model
test that had been asserting the broken behavior as correct.

---

## 64. Composer's model label was stale, 413 killed the whole task

**The chip at the bottom didn't update after saving a new model.** It only
re-fetched `/ai/status` when the settings dialog's OPEN state toggled — so
it showed the old model on open, and its close-triggered refetch could race
the save request and read before the write landed. Real fix: the settings
panel now calls back the instant a save actually succeeds, so the composer
updates immediately and correctly rather than depending on dialog
visibility as a proxy for "did it save."

**`413 Request too large` was killing the whole task, one call from a real
fix.** The history compactor already truncated older tool results, but only
at one fixed aggressiveness — it never reacted to a SPECIFIC request coming
in over budget, which is exactly what happens once enough tool schemas are
offered on Groq's 8,000 tokens/minute free tier.

Added a real retry: on 413, the same turn retries immediately with history
cut far harder (last tool result only, capped at 60 chars instead of 200)
rather than losing the whole task to one oversized call.

**Writing the test caught a real bug in the fix itself.** The token
estimator converted a character count to a string and estimated tokens from
the STRING'S LENGTH — `"8000".length` is 4, not 8000÷4. So the estimate was
wildly wrong for exactly the case it existed to catch. Fixed to operate on
the actual numeric count.

51 tests passing (was 48) — 8 new tests covering the adaptive trim levels
and the token estimator, one of which caught the bug above before it shipped.

---

## 65. The model chip really was resetting — two bugs stacked

**My fix last round was incomplete.** I added `onSaved` so the composer
updates the instant a save succeeds — but left the OLD effect in place,
still re-firing on every `settingsOpen` toggle. Closing the dialog after
saving re-triggered `/ai/status`, which raced (and usually beat) the correct
`onSaved` update, overwriting it.

**And that refetch was itself broken.** It sent no auth headers at all, so
in hosted mode `/ai/status` always resolved as an anonymous request —
`getProvider(undefined)` — which falls through to the server's env default
model, never the signed-in user's saved Pro selection. That's the actual
reason it kept landing on `gpt-oss-20b` specifically, regardless of what was
saved.

Fixed both: the status check now sends real auth headers via the same
`authHeaders()` every other request on the page uses, and it only runs once
on mount — `onSaved` is now the sole source of truth for the chip after a
save, with nothing left to race it.

51 tests passing.

---

## 66. The real reason it was slow: fixed cost, not history

**Measured it instead of guessing.** Every single turn was paying **3,492
tokens of fixed overhead** — 1,703 for the system prompt, 1,789 for 53 tool
schemas — before a single word of conversation history was sent. On Groq's
8,000/min free tier, that's 44% of the entire budget gone before the actual
task even starts. This is why the history-trimming retry from last round
helped but didn't fully fix the 413s: no amount of trimming history can
compensate for the fixed cost alone eating half the budget.

**System prompt rewritten**, not just shortened. Six rounds of incremental
patches had left the same ideas stated multiple times in different words
("never ask permission to click" appeared three separate times). Every rule
survived, restated once each: 6,843 → 1,787 characters, ~1,703 → 446 tokens.

**Trimmed the two heaviest tool descriptions** (`browseWeb`, `clickToNavigate`),
which were re-explaining the approval-gate reasoning that now lives once in
the system prompt.

**Combined fixed overhead: 3,492 → 1,986 tokens per turn** — roughly
2,000 tokens of the 8,000/minute budget given back to actual history and
tool results on every single call.

### Refresh lost the conversation — a real gap, not a caching quirk

The active conversation id lived only in React state, reset to `null` on
every page load, with nothing anywhere reading it back. Now persisted to
`sessionStorage` and — the part that actually matters — restored on mount by
calling the same `selectConversation` the sidebar uses, which is the only
function that fetches a conversation's actual messages. Restoring the id
alone would have looked identical to a fresh chat with a random UUID
attached; this fetches the real history back too.

51 tests passing.

---

## 67. The actual bug behind the 413s — found from your trace, not guessed

Your trace showed the real cause, and it was different from what I fixed
last round. `browseWeb` on Google Maps returned 25 elements, several with
**hundreds of characters of tracking data in the href** — and "recent" tool
results were kept **completely uncapped**, on the assumption that only old
results needed shrinking. A single content-heavy page could exceed the
entire 8,000-token budget by itself, and no amount of trimming *older*
history helps when the *current* result is already that large.

Two fixes, both at the actual source:

**1. Href length capped at 200 chars in `collectInteractiveElements`.**
Google's tracking-laden URLs are dropped; the element stays clickable via
its selector, which doesn't carry that cost.

**2. A real absolute ceiling added to `compactHistoryForRequest`** — every
tool result now has a hard cap (3,000 chars for "recent" ones, 200 for
older), where before "recent" meant no cap at all. That's the actual
structural fix: not more aggressive trimming, but closing the gap where
trimming didn't apply.

Added a test that reproduces the exact scenario — a single 9,000-character
result, the size a Maps page like the one in your trace produces — and
asserts it gets capped. Also caught and fixed an assertion in the existing
test suite that had encoded the old, broken assumption ("recent = kept
intact, no matter how large") as the expected behavior.

52 tests passing (was 51).

---

## 68. Element IDs replace selectors — the actual architectural fix

A review of the recurring click/type failures named the real problem: every
bug so far (whitespace breaking role= matching, a field's label matching an
unrelated element, wrong ARIA roles, truncated names, drifting hrefs) was a
different symptom of the same root cause — **the model had to construct a
Playwright selector string from element text, and every construction method
had its own way to fail.**

**The fix:** `collectInteractiveElements` now stamps a stable `data-act-id`
attribute directly onto each qualifying DOM element during collection. The
model sees `{id: "e3", text: "...", href: "..."}` and sends the id straight
back — it never builds, guesses, or reasons about a selector at all.
Resolution happens server-side via `[data-act-id="..."]`, which either
matches or it doesn't. There is no longer a class of selector bugs to have.

**Built-in verification, not an optional tool call.** `clickToNavigate` now
captures the URL before and after every click and reports what actually
happened — navigated, or didn't. Previously "click succeeded" and "click
did something useless" looked identical to the agent; now they're
distinguishable without it remembering to call `verifyPageContains`.

**Stale-id handling instead of silent mismatch.** If an id from a previous
page read no longer resolves (the page navigated since, ids are
per-snapshot), every action function reports that explicitly — "isn't on
the current page, likely stale" — rather than a raw Playwright timeout with
no explanation. `performFormFill` reports exactly which fields were skipped
for this reason, instead of failing the whole form silently.

**Updated throughout:** tool schemas, the system prompt, `agent.ts`'s
approved-action execution (payload types flow through unchanged, since the
type definitions carry the new shape), and the UI's error-summarization and
progress-detail extraction.

**Tests rewritten, not just left passing.** `dom-collection.test.ts` now
verifies the actual mechanism — that a returned id corresponds to a real
`data-act-id` attribute on the DOM element, that no selector field exists
anywhere in the output, and that two elements with unrelated text can never
collide on the same id (the exact shape of the Google search-box bug).

72 tests passing (was 71).

---

## 69. Generation-scoped ids and structured failure classification

Two of the six follow-up recommendations from the same review, implemented
this round.

**Ids are now scoped to a page generation, not just unique on one page.**
The narrow gap the review named: `e0` on page A and `e0` on page B (after a
navigation, or even just a React rerender) could theoretically both exist,
so an id alone didn't encode which page state it came from. Every
`collectInteractiveElements` call now advances a per-page generation
counter, and every id it returns embeds that generation — `"4:e3"` — with
the exact same string stamped as the DOM attribute. A generation only ever
increases, so an id from generation 4 is **provably** stale once generation
5 exists, not inferred from a missing-element timeout. This makes stale-id
detection structural rather than best-effort.

**Failures are now classified, not just described.** Every action function
(`clickToNavigate`, `typeInto`, `performBrowserAction`, `performFormFill`)
returns a `failureReason` — `STALE_ELEMENT`, `ELEMENT_NOT_FOUND`,
`NAVIGATION_TIMEOUT`, or `VERIFICATION_FAILED` — alongside its error
message. The system prompt now tells the agent to react differently per
reason: re-read the page on `STALE_ELEMENT`, don't retry a hallucinated id
on `ELEMENT_NOT_FOUND`, wait once on `NAVIGATION_TIMEOUT`. Previously every
failure was the same generic string, and the only available response was
"try again," which is exactly the blind-retry pattern the review flagged.

Also fixed a leftover fragment from an earlier edit — two sentences of
prompt guidance had been orphaned mid-paragraph by a prior replacement and
were no longer attached to the rule they were meant to qualify.

**Test coverage added for the actual mechanism**, not just the classifier
function: `dom-collection.test.ts` now asserts ids match the
`{generation}:e{n}` shape, and `element-staleness.test.ts` covers all four
cases the review specifically named — an old-generation id, a
well-formed-but-never-real id, a malformed id, and a current-generation id
that must never be misclassified as stale.

76 tests passing (was 72).

### Still open from the same review, deliberately not rushed this round

- **Task-specific verification** — URL-change is still the only signal
  `clickToNavigate` checks; the review's fuller proposal (title similarity,
  player-visible checks, form-field-value checks) needs per-task-type
  verification logic, not a quick addition.
- **Idempotency keys on write actions** — retrying an approved action after
  a timeout could still double-submit. Needs its own design pass around
  `AgentAction`'s status transitions, not a bolt-on.
- **The observability/tracing layer** — `run_id`, `step_id`,
  `verification_status`, `retry_count` as a queryable structured log. Real
  scope, deserves its own pass.
- **DOM-mutation test matrix** — React rerenders, SPA navigation, modals,
  infinite scroll, iframes, disabled elements, colliding text. The
  generation mechanism above should handle most of these correctly, but
  "should" isn't "tested," and the review is right to call that out
  specifically.

---

## 70. Verification Engine v1

The scoped ticket from the review: a small, runtime-owned verification
layer, not a framework. The distinction it exists to make — "the action
executed" is not the same question as "the action achieved what was
asked" — was previously answered inconsistently by ad-hoc checks scattered
across three different functions. Now there's one module they all use.

**`tools/verification.ts`** — a `VerificationResult` type and four
verifiers, each answering exactly one question:
- `verifyUrl` — does the current URL contain an expected substring
- `verifyTextPresent` — is text present on the page (checked in both
  rendered content and form field values, since typed text lives in
  `element.value` and never appears in `innerText`)
- `verifyElementVisible` — is a given element id actually visible right now
- `verifyInputValue` — does a field's value contain what was supposed to be
  typed into it

A single `verifyAction(page, expected)` dispatcher routes to the right one.
Deliberately excluded, exactly as scoped: title-similarity scoring,
screenshots, LLM-based judging, and any path that lets the model write its
own verification logic. The runtime decides how a check is performed; the
model only ever chooses what to check.

**Integrated into the actions that already existed, not bolted on
separately.** `typeInto` and `performFormFill` now call `verifyInputValue`
as their real implementation — this was previously duplicated inline logic
in each function; it's now one function two call sites both use.
`clickToNavigate` accepts an optional `expectedOutcome` and, when the
caller supplies one, resolves success from real verification instead of the
weaker "did the URL change" heuristic (which is kept as the sensible
default when no explicit expectation is given, since requiring one for
every navigation click would be more machinery than most tasks need).

**Caught a real, separate bug while writing the tests for
`verifyTextPresent`.** It checked `document.body.innerText` with no
fallback — the exact same layout-dependent-emptiness bug fixed in
`collectInteractiveElements` several rounds ago, just never fixed here
since it's a different function. `textContent` fallback added, and the same
fix applied to the older `verifyPageContains` tool, which had the identical
gap.

92 tests passing (was 76) — 16 new tests against the actual exported
verifier functions, wired to a real jsdom document through a minimal fake
`Page` (Playwright can't run in this sandbox), covering every verifier, the
dispatcher, and the exact failure shapes named in the review: still on a
results page instead of `/watch`, a field showing unrelated content from a
reset controlled input, an empty field after typing.

### Still open, per the agreed progression

Observability/tracing, idempotency keys on write actions, and the DOM-
mutation test matrix (React rerenders, modals, infinite scroll, iframes) —
unchanged from the prior round, in that order.

---

## 71. Observability v1 — a structured event log, not a pretty-log illusion

The scoped ticket: events are the source of truth, the human-readable
timeline is only ever rendered from them, never the other way around. No
Grafana, no Prometheus, no OpenTelemetry — an internal trace, done
properly, first.

**`AgentRun` / `RunEvent`** — one row per invocation (a chat turn or a
workflow run), with a typed event stream: `RUN_STARTED`, `AGENT_STEP`,
`TOOL_STARTED`, `TOOL_COMPLETED`, `VERIFICATION`, `APPROVAL`, `RETRY`,
`RUN_COMPLETED`, `RUN_FAILED`. Every write is best-effort — observability
must never slow down or break the work it's observing, so a failed event
write is logged and swallowed, never thrown.

**`runs.ts`** — `startRun`, `recordEvent`, `completeRun`, and
`formatTimeline`, the last one deliberately pure (no DB, no I/O) so it's
directly testable against a hand-built event list rather than only through
a live database.

**Instrumented at every point the ticket named:**
- Agent lifecycle — a run starts the moment `runAgentLoop` begins, and
  completes (or fails) at every one of its three exit paths, including
  cancellation
- Each model call — timed, emitted as `AGENT_STEP`
- Each tool call — `TOOL_STARTED` before, `TOOL_COMPLETED` after with
  duration, status, and `failureReason` when the tool returned one (#69)
- Verification — any tool result carrying a `verificationResult` (#70)
  surfaces as its own `VERIFICATION` event, because "the click executed"
  and "the click achieved what was asked" are still deliberately different
  questions with different answers
- Retries — both existing retry paths (the 413 history-compaction fallback,
  the leaked-JSON self-correction) now emit a labelled `RETRY` event instead
  of retrying silently
- Approval — `proposeAction`'s own output is the "approval required"
  moment; the later, separate approve request looks up the most recent run
  for that conversation and records "HUMAN APPROVED" against it, since
  approval genuinely happens as its own request well after the proposing
  run has already completed

**`GET /runs/:id`** returns both the raw event list and the pre-rendered
timeline.

13 new tests against `formatTimeline` directly, including one that renders
the full worked example from the review's own trace and checks every event
type appears in order. 105 tests passing (was 92).

### Unchanged from the prior round, still deliberately not started

Idempotency keys on write actions, and the DOM-mutation test matrix. Same
order as before: idempotency next, torture testing after.

---

## 72. Idempotent Actions v1

The scoped ticket: distinguish safe-to-retry from needs-verification from
needs-human, never pretend every external write can be made perfectly
idempotent when it's YouTube, Gmail, or a booking site on the other end.

### A real bug found while reading the code, before writing anything new

`finish()` set every action's status to `"completed"` regardless of whether
`result.success` was true or false — a failed browser action, a failed
Slack post, all recorded identically to a successful one. There was no way
to tell "this write actually happened" from "this write was attempted and
failed" by looking at the stored status, which made the whole idempotency
question unanswerable before any of this ticket's work began. Separately,
one code path wrote to `AgentAction.result`, a field that **does not exist
in the schema** — invisible here because this sandbox has never run
`prisma generate` against the real schema, the same class of gap that
surfaced the missing `userId` field several rounds ago.

### The state machine

```
pending -> approved -> executing -> succeeded
                                  \-> failed -> approved (retry, SAME id)
                                  \-> unknown
pending -> rejected
pending -> expired
```

`UNKNOWN` is the state that didn't exist before. A crash or network timeout
between "the write reached the site" and "we recorded that" must not
collapse into either `FAILED` (a retry could duplicate a real submission)
or `SUCCEEDED` (could silently skip a write that never happened). Nothing
in the system retries an `UNKNOWN` action automatically — it sits there
until something verifies which outcome actually occurred.

**`action-lifecycle.ts`** — pure functions (`canExecute`, `canRetry`,
`isTerminal`, `isApprovalExpired`, `isExecutionStuck`,
`nextStatusAfterExecution`, `explainRefusal`), no DB, fully testable
against nothing but the type itself.

**The atomic claim** — `performAction` no longer just checks status and
proceeds. It runs `agentAction.updateMany({ where: { id, status:
"approved" }, ... })` and checks the returned count. Postgres commits that
conditional update atomically, so two requests racing on the same action id
— a genuine double-click, or a duplicate job delivered twice by a queue —
can never both get `count: 1`. Exactly one wins; the other is refused with
`explainRefusal`, never silently allowed through.

**Crash recovery** — a row stuck in `executing` longer than 5 minutes is
reclassified to `unknown` the next time anything touches it, rather than
either blocking forever or being silently re-executed. This is the exact
scenario from the ticket: worker claims the action, the external write may
have succeeded, the worker dies before recording it, the worker (or a
replacement) restarts. The restarted process does **not** find an
`approved` row it can just run again — it finds `unknown`, refuses, and
requires verification.

**`retryAction`** — only ever callable on `failed`. Transitions back to
`approved` and calls `performAction` on the **same row**, never creating a
new one, which is what lets attempt 2 be recognised as the same logical
action rather than an unrelated one the system can't connect to the first.

**Approval expiry** — a `pending` action older than 24 hours is marked
`expired` on the next approve attempt rather than staying approvable
indefinitely.

### Tests: 27 new (15 pure state-machine, 12 against a mocked Prisma client)

The mocked-Prisma tests exercise `performAction`/`retryAction` for real,
not a reimplementation — same pattern as `usage.test.ts`. Covering, by
name, the ticket's own list: an already-`succeeded` action refuses to
execute again; a second concurrent call cannot claim a row the first
already claimed (asserting the `updateMany` was even attempted with the
right status filter, not just that the result was refused); a long-stuck
`executing` row is reclassified to `unknown` and that reclassification is
actually persisted, not just reasoned about in memory; a *recently* claimed
row is correctly left alone rather than reclassified; `unknown` and
`succeeded` both refuse retry; a `failed` action retries successfully and
every update along the way references the original `actionId` — asserted
directly against the mock's call history, not just that the end state was
correct, since "never creates a new row" is exactly the thing that
silently drifting could get wrong.

132 tests passing (was 105).

### What's deliberately still open

DOM-mutation torture testing and real-world adversarial testing — exactly
what comes next, per the plan: browser rerenders, SPA navigation mid-flow,
duplicate submissions, login expiry, CAPTCHA, network timeouts, interrupted
workers. Then, and only then, OTel/Prometheus/Grafana as an export problem
layered on top of the internal tracing that already exists, not another
architectural experiment.

---

## 73. Reliability torture pass — two real bugs found, not just more tests

The point of this round was explicitly not to add architecture — it was to
try to break what's already built. It worked: two genuine bugs turned up.

### Real bug #1: the approve route could un-reject a rejected action

`POST /actions/:id/approve` read the action, then unconditionally set
`status: "approved"` — no check against what the row's status actually was.
A stray or replayed approve call on an already-`rejected`,
already-`succeeded`, or currently-`executing` action would silently flip it
back to `approved`, making it eligible to execute again. This is exactly
the approval-double-click scenario the torture pass targeted, and it
surfaced a bug one level up from where the atomic claim already protects —
`performAction`'s own claim was safe, but the route calling it wasn't
gated at all.

Fixed with the identical mechanism used in `performAction`: `updateMany`
conditioned on `status: "pending"`, checked by count. A double-click on
approve now genuinely has only one winner, and a stray approve on a
terminal action is refused with a clear reason instead of silently
resurrecting it.

### Real bug #2: no rule anywhere for genuine ambiguity

The prompt had zero guidance for "open the first one" (first of what?),
"send this" (to whom?), "use the previous result" (which one?) — requests
where the needed context genuinely isn't available. Nothing distinguished
a request worth asking a clarifying question about from an ordinary
judgment call the agent should just make. Added as rule 9, with the actual
test: would a reasonable person need to ask this too?

### What was torture-tested and held

**DOM mutation (6 new tests, against the real `collectInteractiveElements`
via jsdom):** a full React-style rerender, SPA-style content replacement,
an element removed entirely, a modal opening on top of existing content,
and search results reordering — in every case, a stale generation-scoped id
provably does not exist on the mutated DOM, and surviving elements get
fresh ids rather than inheriting old ones by position. The canonical
YouTube scenario (wrong candidate, verification fails, reread, correct
candidate, verification succeeds) is now a literal test against the real
`verifyUrl`/`verifyAction` functions.

**Concurrency (2 new tests, stateful mock):** ten simultaneous
`performAction` calls on the same action — exactly one claims and executes,
the other nine are refused, proven against a mock that behaves the way
Postgres actually does under a conditional update, not a fixed mock that
would have hidden this exact class of bug.

**Network/crash honesty (2 new tests):** a thrown exception mid-execution
— standing in for a network drop, a timeout, anything that interrupts
after the external write may have already happened — is recorded as
`unknown`, explicitly never `failed`, and an `unknown` action is confirmed
to never be automatically retried by anything in the flow.

### What this pass could not directly test, stated plainly

No live browser, no live model — this sandbox cannot run Playwright or
call a real AI provider. The DOM-mutation and verification tests exercise
the real shipped logic against jsdom and hand-built fake pages, which is
real coverage of the decision logic, but it is not the same as watching an
actual browser survive an actual React rerender mid-click. Login-wall
detection (distinct from the CAPTCHA detection that already exists and
already escalates correctly) was identified as a gap but not built this
round — a 401/paywall page isn't currently distinguished from ordinary
content the way a CAPTCHA page is.

### Scorecard, honestly

Of what could actually be exercised in this environment: 2 real bugs
found and fixed, 0 tests written to describe behavior that turned out not
to exist, 1 gap (login-wall escalation) identified and left explicitly
open rather than quietly built partway. That ratio — bugs found over
tests added — is the number that matters this round, not the total test
count.

141 tests passing (was 132).

---

## 74. The generation bump was invalidating ids mid-task

Live testing surfaced a real bug that none of the existing tests caught,
because every test collected elements once and then acted — never the
sequence that actually breaks.

**What was observed:** the agent opened YouTube, typed "tum mile" into the
search box correctly, and then stalled at "Thinking · step 4" without ever
pressing Enter. Plus general, severe slowness.

**The cause:** `collectInteractiveElements` bumped the page generation on
EVERY call, and `typeInto` re-collects to return fresh elements. So typing
into a search box renumbered every other element on the page — including
the search button and the search box itself, which the model was about to
use next. Those ids became `STALE_ELEMENT`, the model re-read the page,
tried again, and looped. The generation mechanism added in #69 to prevent
stale ids from resolving was, in this path, *creating* staleness out of
nothing.

**The fix:** the generation only bumps when the page genuinely navigated.
`browseWeb` and `goBack` always bump (a real navigation — old ids must
die). `clickToNavigate` and `pressKey` compare the URL before and after and
bump only if it actually changed — a click that opens a menu, or an Enter
that filters in place, leaves every other element exactly where it was and
must not renumber them. `typeInto` never bumps: typing changes a value, not
any element's identity.

This also removes a large chunk of the slowness — every spurious
invalidation cost a re-read, a model turn, and a retry.

**Two tests added** covering both directions, because getting this wrong in
either one is a bug: a non-navigating action must preserve existing ids,
and a real navigation must still invalidate them.

143 tests passing (was 141).

### Still open from live testing, not yet diagnosed

Two behaviours reported that I could not reproduce or confirm the cause of
from the code alone, and won't guess at:
- A cancelled task appearing to continue in a *new* conversation. Sessions
  are keyed per conversation and cancellation closes the browser, so the
  mechanism isn't obvious from reading it — this needs a live repro with
  the server log to say anything honest.
- `Connection error` from the provider, and one `Failed to fetch` against
  the API itself. Both suggest the API process died or was restarting
  rather than an agent-logic fault, but I have no evidence either way yet.

---

## 75. Element ids were bound to collection ORDER, not to the element

A review challenged whether #74's fix was complete, and it wasn't. Keeping
the generation stable guarantees ids don't get *invalidated*; it does not
guarantee `4:e1` still means the same DOM node. Those are two separate
requirements, and only the first was met.

**The bug:** `collectInteractiveElements` assigned
`` `${generation}:e${counter++}` `` unconditionally on every pass —
overwriting any existing attribute. So the id tracked an element's POSITION
in the collection, not its identity. Anything inserted mid-page (a
lazily-loaded ad, a toast, a newly-rendered result) shifted every
subsequent element's id by one.

**Why that's worse than a stale id.** A stale id fails loudly:
`STALE_ELEMENT`, the agent re-reads and recovers. A *shifted* id resolves
perfectly — to the wrong element. The runtime reports "element found,
click succeeded, verification passed" while having clicked something else
entirely. Silent wrong-element execution is the one failure mode none of
the machinery built over the last several rounds could catch, because
every layer of it was working correctly on the wrong target.

**The fix:** an element's id is now assigned once and reused. A node that
already carries a `data-act-id` at the current generation keeps it; only
genuinely new nodes get a fresh one. The generation prefix still handles
navigation, where the document is replaced and every old id *should* stop
resolving.

**Second bug found while fixing the first:** `counter` restarted at 0 on
every collection, so a newly-inserted element could be handed an id a
retained element was still using — reintroducing the same
wrong-element-execution problem through a different door. The counter now
starts past the highest id already issued at that generation.

**Tests (5 new), written to the scenarios the review specified:**
insertion mid-page must not shift existing ids; reordering nodes must not
change them; collecting twice on an unchanged DOM must be byte-identical;
and a removed element's id must never be recycled onto a different
element, with uniqueness asserted across the whole page.

**Plus a regression proof.** A passing test says nothing unless it would
have failed before. `_regression-proof.test.ts` reimplements the old
index-derived assignment and asserts it fails the ad-insertion case —
confirming the id the model held for "Submit" resolved to "Sponsored"
after insertion. The new tests catch a real bug, not a hypothetical one.

148 tests passing (was 143).

---

## 76. Live Torture Pass — a real, code-level audit, with an honest boundary

Stated plainly first: this environment has no live browser (Playwright
can't download here) and no live model to call. Items requiring a running
app couldn't be executed the way the ticket asked. What follows is exactly
what could and couldn't be done, with no fabricated results.

### 1. Same-session correctness — audited every call site, no leak found

Traced every browser tool call from `tools/index.ts`, `agent.ts`, and
`chat.ts`'s cancellation listeners: all 7+8 call sites correctly pass
`conversationId` as the session key. None fall through to the shared
`"default"` session, which is the only way two conversations could
actually collide.

5 new tests (`session-isolation.test.ts`) prove this at the state layer —
cancelling Chat A never marks Chat B cancelled, in either order, and
clearing one never clears the other. This is real coverage of the
code-level guarantee. It does **not** prove two live browser *windows*
stay independent in an actual run — that needs a real browser, which this
environment cannot provide.

### 2. Cancellation correctness — a precise, honest answer per checkpoint

**Model call:** genuinely abortable mid-flight — the `AbortSignal` reaches
the actual `fetch` call (`providers/openai-compatible.ts:64`).

**Tool calls (navigation, typing, click):** checked **once, at entry**,
before dispatch (`tools/index.ts:453`) — not during the Playwright
operation itself, because `locator.click()`/`page.goto()` don't accept an
`AbortSignal` at all. An *already-running* browser operation isn't
interrupted by that check directly.

What actually stops it: the abort listener in `chat.ts` fires
`closeSession()` the instant `abort()` is called, tearing down the browser
context out from under any in-flight operation. Playwright rejects the
pending call with a context-closed error. Confirmed this degrades safely
rather than crashing — all 6 `collectInteractiveElements(...).catch(() =>
[])` recovery branches turn that into a normal failed result, not an
uncaught exception, so the loop's next checkpoint correctly returns
"Stopped." The real, minor cost: one extra failed-tool round-trip logged
in the trace before that happens, not an instant hard stop. Worth knowing,
not worth rearchitecting for.

**Approval wait / retry:** already covered by #72's atomic-claim work — a
cancelled conversation's pending action is refused via
`isSessionCancelled`, and neither existing retry path (413 fallback,
leaked-JSON correction) runs after a cancellation check.

### 3. Speed — structural analysis, not measurement

No live run exists to measure. What's verifiable by reading the code: every
fixed delay in the `browseWeb → typeInto → pressKey` path
(`waitForTimeout` calls, `waitForLoadState` caps, interpolated mouse
movement at 8ms/step) sums to low hundreds of milliseconds **in visible
mode only** — headless mode skips mouse interpolation entirely
(`browser.ts:771-774`). None of this is a plausible source of multi-second
slowness on its own.

The far more likely dominant cost, based on evidence already visible in
this conversation's own traces (`Thinking · step 14` on a simple task),
is model round-trip count and latency — exactly what the ticket itself
predicted as the more likely culprit. **This can't be confirmed from here.**
The concrete, actionable next step: run one real task and read
`GET /runs/:id` (built in #71) — every `AGENT_STEP` and `TOOL_COMPLETED`
event already carries `durationMs`. That's real data instead of a guess.

### 4. Real browser torture (20 live tasks) — cannot be produced here

No browser, no model, no scorecard. Fabricating one would be worse than
saying nothing.

### The one thing worth calling a real finding: the verification engine was invisible to the model

Auditing the execution-vs-reality boundary specifically (item 4's stated
focus) surfaced a genuine gap: `clickToNavigate`'s tool **schema** never
exposed `expectedOutcome` at all — only `elementId`. So while #70/#72
wired real verification into the function's *implementation*, the model
had no way to actually request it, and every click silently used the weak
"did the URL change" fallback. That fallback catches a click that does
nothing; it does **not** catch the actual YouTube case, where a wrong
candidate still navigates to some `/watch?v=X` and the URL genuinely
changes. The complete loop the ticket asked about — click, verify against
an explicit expectation, fail, recover — was architecturally present and
tested in isolation, but never reachable from a real conversation.

**Fixed:** `expectedOutcome` is now a declared parameter on
`clickToNavigate`'s schema, and the prompt tells the agent to supply one
specifically when a click is choosing between plausible candidates — "if
it comes back unverified, that candidate was wrong, read the page again
and pick a different one."

2 new tests lock down the schema shape itself, since a silently-removed
property here is exactly how this gap opened in the first place.

155 tests passing (was 148).
