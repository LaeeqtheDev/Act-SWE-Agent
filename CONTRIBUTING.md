# Contributing

Act SWE Agent is MIT-licensed and built to be provider-agnostic on purpose —
contributions that add a new model backend, a new agent tool, or improve the
detection/permission layers are especially welcome.

## Local setup

```bash
pnpm install
docker compose up postgres redis -d
cd apps/api && pnpm exec prisma migrate dev
cp apps/api/.env.example apps/api/.env   # add at least one AI provider key
pnpm --filter api dev      # terminal 1
pnpm --filter api worker   # terminal 2
pnpm --filter web dev      # terminal 3
```

## Adding a new AI provider

Every provider implements one interface (`apps/api/src/providers/types.ts`):

```ts
interface AIProvider {
  name: string;
  model: string;
  runTurn(opts: { system: string; tools: ToolDef[]; history: AgentMessage[] }): Promise<AgentTurn>;
}
```

- If the provider speaks the OpenAI chat-completions + function-calling format
  (most do), you likely don't need a new file at all — add a preset to
  `OPENAI_COMPATIBLE_PRESETS` in `providers/index.ts` with its base URL and
  env var name.
- If it needs a genuinely different request/response shape (like Anthropic),
  copy `providers/anthropic.ts` as a template: translate the generic
  `AgentMessage[]` history into the provider's native format, call it, and
  translate the response back into `AgentTurn`.

## Adding a new agent tool

Tools live in `apps/api/src/agent.ts`:

1. Add a `ToolDef` entry to the `tools` array (name, description, JSON Schema
   input).
2. Add a `case` to `runTool()` implementing it.
3. **Read tools** (querying the DB, cluster, or web) execute immediately.
   **Write tools** (anything that changes state — restarting a pod, clicking
   something in a browser) must go through `proposeAction` instead of
   executing directly, so a human approves it via `/actions/:id/approve`
   before `performAction()` in `agent.ts` actually runs it. Don't add a tool
   that mutates state outside this pattern — it's the whole point of the
   permission layer.

## Code style

TypeScript, no framework opinions beyond what's already here (Express, plain
fetch on the frontend, Prisma for the DB). Keep PRs focused — one provider,
one tool, or one bug fix per PR is easier to review than a bundle of unrelated
changes.
