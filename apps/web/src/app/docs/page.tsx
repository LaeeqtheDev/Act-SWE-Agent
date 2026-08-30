import { MarketingShell } from "@/components/marketing/marketing-shell";
import { Terminal, GitFork, Wrench, ShieldCheck, Gift } from "lucide-react";

export const metadata = { title: "Docs — Act · SWE Agent" };

const CodeBlock = ({ children }: { children: string }) => (
  <pre style={{ fontFamily: "var(--font-mono)" }} className="text-xs bg-[#0D131C] border border-[#1E2630] rounded-md p-4 overflow-x-auto text-[#E8ECEF] my-3">
    {children}
  </pre>
);

export default function DocsPage() {
  return (
    <MarketingShell>
      <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-[#35C7C0] mb-4">
        Docs
      </p>
      <h1 style={{ fontFamily: "var(--font-mono)" }} className="text-3xl md:text-4xl font-medium text-[#E8ECEF] mb-8">
        For developers
      </h1>

      <section className="mb-12">
        <div className="flex items-center gap-2 mb-3">
          <Terminal className="h-4 w-4 text-[#35C7C0]" />
          <h2 className="text-lg font-medium text-[#E8ECEF]">Local setup</h2>
        </div>
        <CodeBlock>{`git clone https://github.com/LaeeqtheDev/Act-SWE-Agent.git
cd Act-SWE-Agent
pnpm install
docker compose up postgres redis -d
cd apps/api && pnpm exec prisma migrate dev
cp apps/api/.env.example apps/api/.env   # add at least one AI provider key
pnpm --filter api dev      # terminal 1
pnpm --filter api worker   # terminal 2
pnpm --filter web dev      # terminal 3`}</CodeBlock>
        <p className="text-sm text-[#7C8A99] mt-2">
          Full setup notes, including the local browser and dev-tools opt-ins, live in{" "}
          <code className="text-[#E8ECEF] bg-[#1E2630] px-1.5 py-0.5 rounded text-xs">NEXT_STEPS.md</code> in the repo.
        </p>
      </section>

      <section className="mb-12">
        <div className="flex items-center gap-2 mb-3">
          <Wrench className="h-4 w-4 text-[#35C7C0]" />
          <h2 className="text-lg font-medium text-[#E8ECEF]">Adding a new AI provider</h2>
        </div>
        <p className="text-sm text-[#9AA7B4] leading-relaxed mb-3">
          Every provider implements one interface (<code className="text-[#E8ECEF] bg-[#1E2630] px-1.5 py-0.5 rounded text-xs">apps/api/src/providers/types.ts</code>):
        </p>
        <CodeBlock>{`interface AIProvider {
  name: string;
  model: string;
  runTurn(opts: {
    system: string;
    tools: ToolDef[];
    history: AgentMessage[];
  }): Promise<AgentTurn>;
}`}</CodeBlock>
        <p className="text-sm text-[#9AA7B4] leading-relaxed">
          If the provider speaks the OpenAI chat-completions + function-calling format (most do), you likely
          don&apos;t need a new file — add a preset to <code className="text-[#E8ECEF] bg-[#1E2630] px-1.5 py-0.5 rounded text-xs">OPENAI_COMPATIBLE_PRESETS</code> in
          <code className="text-[#E8ECEF] bg-[#1E2630] px-1.5 py-0.5 rounded text-xs ml-1">providers/index.ts</code> with its base URL and env var name. Otherwise,
          copy <code className="text-[#E8ECEF] bg-[#1E2630] px-1.5 py-0.5 rounded text-xs">providers/anthropic.ts</code> as a template.
        </p>
      </section>

      <section className="mb-12">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="h-4 w-4 text-[#35C7C0]" />
          <h2 className="text-lg font-medium text-[#E8ECEF]">Adding a new agent tool</h2>
        </div>
        <p className="text-sm text-[#9AA7B4] leading-relaxed mb-3">
          Tools live in <code className="text-[#E8ECEF] bg-[#1E2630] px-1.5 py-0.5 rounded text-xs">apps/api/src/tools/index.ts</code>. Add a <code className="text-[#E8ECEF] bg-[#1E2630] px-1.5 py-0.5 rounded text-xs">ToolDef</code> entry
          and a matching <code className="text-[#E8ECEF] bg-[#1E2630] px-1.5 py-0.5 rounded text-xs">case</code> in <code className="text-[#E8ECEF] bg-[#1E2630] px-1.5 py-0.5 rounded text-xs">runTool()</code>. The one rule
          that matters: <strong className="text-[#E8ECEF]">read tools execute immediately, write tools never do.</strong> Anything
          that changes state — restarting a pod, clicking something in a browser, editing a file, running a
          shell command — must go through <code className="text-[#E8ECEF] bg-[#1E2630] px-1.5 py-0.5 rounded text-xs">proposeAction</code> instead of executing directly, so a human
          approves it via <code className="text-[#E8ECEF] bg-[#1E2630] px-1.5 py-0.5 rounded text-xs">/actions/:id/approve</code> before <code className="text-[#E8ECEF] bg-[#1E2630] px-1.5 py-0.5 rounded text-xs">performAction()</code> in{" "}
          <code className="text-[#E8ECEF] bg-[#1E2630] px-1.5 py-0.5 rounded text-xs">agent.ts</code> actually runs it.
        </p>
      </section>

      <section className="mb-12">
        <div className="flex items-center gap-2 mb-3">
          <GitFork className="h-4 w-4 text-[#35C7C0]" />
          <h2 className="text-lg font-medium text-[#E8ECEF]">Contributing a PR</h2>
        </div>
        <ol className="text-sm text-[#9AA7B4] leading-relaxed space-y-2 list-decimal pl-5">
          <li>Fork the repo, create a branch off <code className="text-[#E8ECEF] bg-[#1E2630] px-1.5 py-0.5 rounded text-xs">main</code></li>
          <li>Keep PRs focused — one provider, one tool, or one bug fix is easier to review than a bundle of unrelated changes</li>
          <li>Run <code className="text-[#E8ECEF] bg-[#1E2630] px-1.5 py-0.5 rounded text-xs">pnpm exec tsc --noEmit</code> in <code className="text-[#E8ECEF] bg-[#1E2630] px-1.5 py-0.5 rounded text-xs">apps/api</code> and <code className="text-[#E8ECEF] bg-[#1E2630] px-1.5 py-0.5 rounded text-xs">apps/web</code> before opening the PR</li>
          <li>Open the PR against the repo on GitHub — <a href="https://github.com/LaeeqtheDev/Act-SWE-Agent" target="_blank" rel="noreferrer" className="text-[#35C7C0] hover:underline">LaeeqtheDev/Act-SWE-Agent</a></li>
        </ol>
      </section>

      <section className="border-t border-[#1E2630] pt-8">
        <div className="flex items-center gap-2 mb-3">
          <Gift className="h-4 w-4 text-[#35C7C0]" />
          <h2 className="text-lg font-medium text-[#E8ECEF]">Free Pro access for contributors</h2>
        </div>
        <p className="text-sm text-[#9AA7B4] leading-relaxed">
          Merged a PR to the open-source core? Open an issue with the PR link and we&apos;ll upgrade your
          hosted account to Pro at no cost — our way of saying thanks for making the free, self-hosted core
          better for everyone.
        </p>
      </section>
    </MarketingShell>
  );
}
