# Hosted mode

Everything in this file is **opt-in and off by default**. Leave `HOSTED_MODE`
unset and none of it runs — no accounts, no limits, no billing. That's the
self-hosted promise and it doesn't change.

Turn it on only if you're running this as a service for other people.

---

## Turning it on

Both flags must match, or you get a broken half-state (backend rejecting
requests with no way to sign in):

```bash
# apps/api/.env
HOSTED_MODE="true"
CLERK_SECRET_KEY="sk_test_..."
CLERK_PUBLISHABLE_KEY="pk_test_..."      # required — @clerk/express needs BOTH

# apps/web/.env
NEXT_PUBLIC_HOSTED_MODE="true"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."   # same value as above
```

**Fully restart both dev servers.** Env vars only load at process start.

You should now see Sign in / Get started in the landing page nav, and
`/agent`, `/dashboard`, `/workflows`, `/billing`, and `/profile` all require
authentication.

---

## 1. Authentication (Clerk)

1. Create a free app at [clerk.com](https://clerk.com)
2. Dashboard → API Keys → copy the publishable and secret keys
3. Set them as shown above

The most common failure is `Publishable key is missing` — that's
`CLERK_PUBLISHABLE_KEY` missing from the **API** env, not just the web one.
`@clerk/express` needs both server-side.

---

## 2. Usage limits

Free accounts get 10 tasks/month, Pro gets 500. A "task" is one chat message
or one incident investigation, checked server-side **before** the request
ever reaches your AI provider — so an over-limit user costs you nothing.

Users who paste their own API key bypass limits entirely, which is the
intended escape hatch.

Tune the numbers in `apps/api/src/usage.ts`.

---

## 3. Payments

### Stripe

1. Create a recurring price (e.g. $30/month) in the Stripe dashboard
2. Developers → API keys → copy the secret key
3. Developers → Webhooks → add an endpoint at
   `https://your-domain/billing/webhook`, subscribing to
   `checkout.session.completed` and `customer.subscription.deleted`

```bash
STRIPE_SECRET_KEY="sk_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRO_PRICE_ID="price_..."
```

Test webhooks locally with the Stripe CLI:

```bash
stripe listen --forward-to localhost:4000/billing/webhook
```

### Bank transfer

Users upload a payment receipt; it sits pending until **you** review it.
This is deliberately never automated — an uploaded image can't safely prove
a real bank transfer happened, so a human always makes that call.

```bash
BANK_NAME="Your Bank"
BANK_ACCOUNT_TITLE="Your Name"
BANK_ACCOUNT_NUMBER="..."
BANK_IBAN="..."
BANK_TRANSFER_NOTE="Include your email as the reference"
ADMIN_SECRET="any-long-random-string"
```

**Never commit real account details.** These live only in your untracked
`.env` and are served to the frontend at runtime — they are never hardcoded
anywhere in source, because git history is permanent and public.

Review receipts at `/admin` — enter your `ADMIN_SECRET`, view the uploaded
file, approve or reject. Approving flips that account to Pro immediately.
The Users tab also has a direct "Set Pro / Set Free" override.

---

## 4. Model gating

Free accounts are restricted to fast, economical models. Pro unlocks the
larger ones (Claude Sonnet/Opus, GPT-4o, Grok-2, bigger Groq models).
Enforced server-side at save time. BYOK always bypasses it.

Edit `PREMIUM_MODELS` in `apps/api/src/providers/index.ts`.

---

## 5. Before real users

| Item | Why |
|---|---|
| `SETTINGS_ENCRYPTION_KEY` set explicitly | Generate with `openssl rand -hex 32`. Without it a fallback key is derived from `DATABASE_URL` — fine for local testing, not for real user keys. |
| `ADMIN_SECRET` set to something long and random | It's the only thing protecting the receipt review and plan override endpoints. |
| A real domain with HTTPS | Non-negotiable: Stripe webhooks and Clerk redirects both require it. |
| S3-compatible receipt storage | Set `S3_BUCKET` etc. Local disk files vanish on redeploy without a persistent volume. Works with S3, R2, or MinIO. |
| Tighten `DEMO_RATE_LIMIT` | The landing demo runs on **your** API key with no auth. Default is 6/hour/IP — raise the strictness if you expect real traffic. |
| SMTP configured | Otherwise notifications are in-app only, and users won't know a workflow finished. |

---

## 6. Email

Works with any SMTP provider — Gmail, SendGrid, Resend, SES:

```bash
SMTP_HOST="..."
SMTP_PORT="587"
SMTP_USER="..."
SMTP_PASS="..."
SMTP_FROM="..."
NOTIFY_EMAIL="..."   # self-host only: single operator inbox
```

Unset means email silently no-ops. In-app notifications still work.

---

## 7. Observability

Prometheus metrics at `GET /metrics` — HTTP request counts and duration,
tool calls by name and outcome, chat messages, agent actions, workflow runs,
plus default Node process metrics.

```bash
docker compose --profile observability up
```
