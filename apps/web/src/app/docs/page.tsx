import { DocsLayout, type DocSection } from "@/components/docs/docs-layout";
import { H2, H3, P, Code, Pre, Note, Table } from "@/components/docs/doc-parts";

export const metadata = { title: "Docs — Act · SWE Agent" };

const sections: DocSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    items: [
      { id: "install", title: "Install" },
      { id: "providers", title: "Choosing a model" },
      { id: "run", title: "Running it" },
    ],
  },
  {
    id: "browser",
    title: "Browser control",
    items: [
      { id: "visible", title: "Watching it work" },
      { id: "your-chrome", title: "Using your Chrome" },
      { id: "captchas", title: "CAPTCHAs" },
    ],
  },
  {
    id: "capabilities",
    title: "Capabilities",
    items: [
      { id: "tools", title: "Tool reference" },
      { id: "approval", title: "The approval gate" },
      { id: "profile", title: "Form auto-fill" },
    ],
  },
  {
    id: "workflows",
    title: "Workflows",
    items: [{ id: "scheduling", title: "Scheduling" }, { id: "notifications", title: "Notifications" }],
  },
  {
    id: "contributing",
    title: "Contributing",
    items: [
      { id: "add-provider", title: "Add a provider" },
      { id: "add-tool", title: "Add a tool" },
      { id: "pr", title: "Opening a PR" },
    ],
  },
];

export default function DocsPage() {
  return (
    <DocsLayout sections={sections}>
      <div className="mb-12">
        <h1 className="text-3xl font-semibold text-foreground mb-3">Documentation</h1>
        <p className="text-base text-muted-foreground leading-relaxed">
          Everything needed to run Act locally, point it at a model, and extend it. Self-hosting is the
          default — no accounts, no limits, no billing.
        </p>
      </div>

      <H2 id="getting-started">Getting started</H2>

      <H3 id="install">Install</H3>
      <P>Node 20+, pnpm, PostgreSQL, and Redis. Docker handles the last two if you&apos;d rather not install them.</P>
      <Pre>{`git clone https://github.com/LaeeqtheDev/Act-SWE-Agent.git
cd Act-SWE-Agent
pnpm install
docker compose up postgres redis -d

cp apps/api/.env.example apps/api/.env
cd apps/api && pnpm exec prisma migrate dev && cd ../..`}</Pre>

      <H3 id="providers">Choosing a model</H3>
      <P>
        Set one provider and its key in <Code>apps/api/.env</Code>, or paste a key in the app&apos;s settings
        panel — that&apos;s stored encrypted and takes priority over the env var.
      </P>
      <Table
        head={["Provider", "Env var", "Notes"]}
        rows={[
          [<Code key="g">groq</Code>, <Code key="gk">GROQ_API_KEY</Code>, "Free tier. Default: openai/gpt-oss-20b"],
          [<Code key="a">anthropic</Code>, <Code key="ak">ANTHROPIC_API_KEY</Code>, "Claude models"],
          [<Code key="o">openai</Code>, <Code key="ok">OPENAI_API_KEY</Code>, "GPT-4o and others"],
          [<Code key="x">grok</Code>, <Code key="xk">XAI_API_KEY</Code>, "xAI"],
          [<Code key="ol">ollama</Code>, "—", "Fully local, no key needed"],
        ]}
      />
      <Note tone="warn">
        Groq&apos;s free tier allows 8,000 tokens per minute. A long multi-step task can hit that ceiling. If
        you see <Code>413</Code> or <Code>429</Code>, set <Code>AGENT_MAX_TURNS=&quot;4&quot;</Code> or switch to a
        larger model — bigger models often finish in fewer steps, so they can be faster overall.
      </Note>

      <H3 id="run">Running it</H3>
      <Pre>{`pnpm --filter api dev       # API on :4000
pnpm --filter api worker    # incident detection worker
pnpm --filter web dev       # web on :3000`}</Pre>
      <P>
        Then open <Code>localhost:3000/agent</Code>.
      </P>

      <H2 id="browser">Browser control</H2>

      <H3 id="visible">Watching it work</H3>
      <P>
        By default the browser runs headless. Set this to see a real window, with a visible cursor that
        moves and types:
      </P>
      <Pre>{`BROWSER_HEADLESS="false"`}</Pre>
      <P>The API confirms it at startup:</P>
      <Pre>{`[browser] launched session "abc123" — visible: YES, profile: yours`}</Pre>

      <H3 id="your-chrome">Using your Chrome</H3>
      <P>
        Point it at your own Chrome profile and it inherits every session you&apos;re already signed into —
        Gmail, LinkedIn, Slack — with no separate login step.
      </P>
      <Pre>{`CHROME_USER_DATA_DIR="C:\\\\Users\\\\you\\\\AppData\\\\Local\\\\Google\\\\Chrome\\\\User Data"`}</Pre>
      <Table
        head={["OS", "Profile path"]}
        rows={[
          ["Windows", <Code key="w">%LOCALAPPDATA%\\Google\\Chrome\\User Data</Code>],
          ["macOS", <Code key="m">~/Library/Application Support/Google/Chrome</Code>],
          ["Linux", <Code key="l">~/.config/google-chrome</Code>],
        ]}
      />
      <Note tone="warn">
        Close all other Chrome windows first — Chrome locks its profile directory while running. Parallel
        tasks beyond the first use isolated copies, which start logged out.
      </Note>
      <P>
        This is local automation of your own browser on your own machine — the same trust boundary as
        clicking around yourself. It never runs in a hosted deployment, and every write still needs approval.
      </P>

      <H3 id="captchas">CAPTCHAs</H3>
      <P>
        The browser masks the obvious automation signals, which stops well-behaved sites over-triggering.
        It will not defeat serious bot detection — Google Search and Cloudflare-protected sites still block.
        Using your own Chrome profile helps most, since real history and cookies get challenged far less.
      </P>

      <H2 id="capabilities">Capabilities</H2>

      <H3 id="tools">Tool reference</H3>
      <Table
        head={["Tool", "What it does", "Approval"]}
        rows={[
          [<Code key="1">browseWeb</Code>, "Open a URL, read it, list every clickable element", "No"],
          [<Code key="2">webSearch</Code>, "Search and get structured results back", "No"],
          [<Code key="3">clickToNavigate</Code>, "Click a button, tab, or link", "No"],
          [<Code key="4">scrollPage</Code>, "Scroll — lazy-loaded content needs this", "No"],
          [<Code key="5">goBack</Code>, "Return to the previous page", "No"],
          [<Code key="6">readPageAsMarkdown</Code>, "Read a page with headings and lists intact", "No"],
          [<Code key="7">pressKey</Code>, "Enter, Escape, Tab, arrows", "No"],
          [<Code key="8">getUserProfile</Code>, "Your saved details, for filling forms", "No"],
          [<Code key="9">proposeAction</Code>, "Submit, send, post, restart, edit, run", <span key="y" className="text-warn">Yes</span>],
        ]}
      />

      <H3 id="approval">The approval gate</H3>
      <P>
        Reading and navigating happen freely. Anything that submits, sends, posts, or changes state stops
        and waits for you. That split is what makes it safe to hand over a vague task and walk away — or to
        run it on a schedule when nobody&apos;s watching.
      </P>
      <P>
        When it does propose something, it proposes the <em>complete</em> action — an entire filled form plus
        the submit button, not one field at a time. You review once, approve once, and it continues from
        there automatically.
      </P>

      <H3 id="profile">Form auto-fill</H3>
      <P>
        Save your details at <Code>/profile</Code> — name, email, phone, location, links, and a resume for
        longer fields. Then &quot;find SWE roles at Stripe and apply to the backend one&quot; works end to end: it
        browses, reads the listings, finds the form, and proposes it filled in for review.
      </P>

      <H2 id="workflows">Workflows</H2>

      <H3 id="scheduling">Scheduling</H3>
      <P>
        Describe a task in plain language at <Code>/workflows</Code>, pick a cadence, and it runs unattended.
        Each workflow keeps one ongoing conversation across all its runs, so the tenth run still remembers
        what the first nine found — it can tell you what&apos;s genuinely new.
      </P>
      <P>Three consecutive failures auto-disables a workflow and notifies you, rather than failing silently forever.</P>

      <H3 id="notifications">Notifications</H3>
      <P>
        Results appear in the in-app bell. Configure SMTP for email as well — works with Gmail, SendGrid,
        Resend, or SES.
      </P>
      <Pre>{`SMTP_HOST="..."
SMTP_PORT="587"
SMTP_USER="..."
SMTP_PASS="..."`}</Pre>

      <H2 id="contributing">Contributing</H2>

      <H3 id="add-provider">Add a provider</H3>
      <P>
        If it speaks OpenAI&apos;s chat-completions format, add a preset — no new file needed:
      </P>
      <Pre>{`// apps/api/src/providers/index.ts
myprovider: {
  baseURL: "https://api.example.com/v1",
  envKey: "MYPROVIDER_API_KEY",
  defaultModel: "some-model",
  models: ["some-model", "another"],
},`}</Pre>
      <P>
        Otherwise copy <Code>providers/anthropic.ts</Code> and implement the <Code>AIProvider</Code> interface.
      </P>

      <H3 id="add-tool">Add a tool</H3>
      <P>
        Add a <Code>ToolDef</Code> to <Code>baseTools</Code> and a matching <Code>case</Code> in{" "}
        <Code>runTool()</Code>, both in <Code>apps/api/src/tools/index.ts</Code>.
      </P>
      <Note tone="warn">
        One rule that matters: reads execute immediately, writes never do. Anything that changes state must
        go through <Code>proposeAction</Code> rather than acting directly.
      </Note>

      <H3 id="pr">Opening a PR</H3>
      <P>Fork, branch off main, keep it focused, and run these before opening:</P>
      <Pre>{`pnpm exec tsc --noEmit    # in both apps/api and apps/web
pnpm test                 # in apps/api`}</Pre>
      <P>
        Merged a PR? Open an issue with the link and we&apos;ll upgrade your hosted account to Pro for free.
      </P>
    </DocsLayout>
  );
}
