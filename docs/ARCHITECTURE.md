# Architecture

For contributors and anyone wanting to understand how this fits together.

---

## Shape

```
apps/web (Next.js)                apps/api (Express)
  /            landing + demo  →    /demo/chat        rate-limited, read-only
  /agent       chat console    →    /chat/*           the main agent loop
  /workflows   scheduling      →    /workflows/*      node-cron scheduler
  /profile     form-fill data  →    /profile
  /dashboard   incidents       →    /incidents, /actions, /agent-incidents
  /billing     plans           →    /billing/*        Stripe + bank transfer
  /admin       operator tools  →    /admin/*          ADMIN_SECRET gated
                                        │
                                        ▼
                            Provider layer (swappable)
                     Anthropic │ OpenAI-compatible (OpenAI,
                                 Grok, Groq, Ollama)
                                        │
                                        ▼
                              Shared tool menu
                    read tools run free │ writes → proposeAction
                                        │
                     PostgreSQL (Prisma) │ Redis (BullMQ) │ Playwright
```

---

## Key modules

| File | Responsibility |
|---|---|
| `chat.ts` | The agent loop. `runAgentLoop` is shared by user messages and auto-continuation. |
| `agent.ts` | One-shot incident investigation, and `performAction` — where approved actions actually execute. |
| `tools/index.ts` | The shared tool menu. Add a tool here and both the chat agent and investigator get it. |
| `tools/browser.ts` | Playwright. One persistent page reused across the session, visible cursor, form filling. |
| `providers/index.ts` | Provider resolution: DB-saved key first, then env. `PREMIUM_MODELS` lives here. |
| `settings.ts` / `lib/crypto.ts` | Encrypted BYOK storage. Crypto is Prisma-free so it's unit-testable. |
| `usage.ts` | Hosted-mode task metering. |
| `workflows.ts` | Cron scheduling, run history, failure backoff. |
| `demo.ts` | The landing widget's isolated, rate-limited, read-only agent. |

---

## Design decisions worth knowing

**Provider abstraction.** The agent loop never imports Anthropic or OpenAI
directly — everything goes through the `AIProvider` interface. Most new
providers need only a preset entry in `OPENAI_COMPATIBLE_PRESETS`, not a new
file.

**One shared tool menu.** Chat and incident investigation call the same
`runTool`. There's no second place to keep in sync.

**Approval gate as a single choke point.** No tool executes a write
directly. They call `proposeAction`, which creates a pending row. Only
`performAction` — reachable only via an explicit approval endpoint —
actually runs anything. One place to audit.

**Auto-continuation.** When an approved action completes,
`resumeAfterAction` runs a real next turn so the task continues without the
user typing "continue." Capped at 5 chained continuations, counted from the
conversation itself rather than a passed parameter.

**History compaction.** Every turn resends the whole conversation, which
kills small free-tier models. `compactHistoryForRequest` truncates older
tool results while keeping recent ones intact.

**Fail soft everywhere.** No Kubernetes cluster? Tools return
`{available: false}`. No provider configured? A friendly message. The point
is that a missing optional dependency never crashes the app.

**Two incident concepts, deliberately.** `Incident` belongs to the simulated
demo services. `AgentIncident` is real — actual tool failures from actual
sessions. They're separate models because they're genuinely different things.

---

## Adding things

### A provider

If it speaks OpenAI's chat-completions format, just add a preset:

```ts
// providers/index.ts
myprovider: {
  baseURL: "https://api.example.com/v1",
  envKey: "MYPROVIDER_API_KEY",
  defaultModel: "some-model",
  models: ["some-model", "another"],
},
```

Otherwise copy `providers/anthropic.ts` and implement `AIProvider`.

### A tool

Add a `ToolDef` to `baseTools` and a `case` in `runTool`
(`tools/index.ts`). **The one rule:** reads execute immediately, writes go
through `proposeAction` and get handled in `performAction`. Never execute a
state change directly from a tool.

---

## Tests

```bash
cd apps/api && pnpm test
```

23 tests covering history compaction, the premium-model gate, demo rate
limiting, the API-key encryption round-trip, and usage-limit logic against a
mocked Prisma client.

**What's not covered:** integration tests against a real database. The
usage tests mock Prisma, which catches real business-logic bugs but isn't
the same as testing actual queries. That gap is real and known.

---

## Contributing

1. Fork, branch off `main`
2. Keep PRs focused — one provider, one tool, one fix
3. Run `pnpm exec tsc --noEmit` in both `apps/api` and `apps/web`, plus
   `pnpm test` in `apps/api`
4. Open the PR against
   [LaeeqtheDev/Act-SWE-Agent](https://github.com/LaeeqtheDev/Act-SWE-Agent)

Merged a PR? Open an issue with the link and we'll upgrade your hosted
account to Pro for free.
