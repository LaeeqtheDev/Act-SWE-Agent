import { MarketingShell } from "@/components/marketing/marketing-shell";

export const metadata = { title: "About — Act · SWE Agent" };

export default function AboutPage() {
  return (
    <MarketingShell>
      <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-warn mb-4">
        About
      </p>
      <h1 style={{ fontFamily: "var(--font-mono)" }} className="text-3xl md:text-4xl font-medium text-foreground mb-8">
        Why this exists
      </h1>

      <div className="prose-invert space-y-6 text-muted-foreground leading-relaxed text-[15px]">
        <p>
          Most AI SRE tooling is either a black-box SaaS product you have no visibility into, or a thin
          wrapper around a single vendor&apos;s model that locks you in the moment you adopt it. Act SWE
          Agent is built the other way around: the agent loop, the tool menu, and the permission layer are
          all yours to read, run, and change — and the model behind it is whichever one you choose, with
          your own key.
        </p>
        <p>
          The project started as a demonstration of the full incident-response stack real platforms run on
          — event queues, Kubernetes self-healing, rule-based detection — then grew into something more
          ambitious: an agent that doesn&apos;t just alert you to a problem, but investigates it, browses the
          web when it needs external context, and can act on your behalf inside your own already-logged-in
          browser, with every write gated behind your explicit approval.
        </p>
        <p>
          That last part is a deliberate design stance, not an afterthought. An agent that can act — click
          things, send things, restart things — is only trustworthy if it can&apos;t act without you. Every
          tool that changes state in this project goes through the same <code className="text-foreground bg-muted px-1.5 py-0.5 rounded text-xs">proposeAction</code> gate,
          whether it&apos;s restarting a Kubernetes pod or clicking a button in your browser.
        </p>

        <h2 style={{ fontFamily: "var(--font-mono)" }} className="text-xl text-foreground pt-6">
          Open core, on purpose
        </h2>
        <p>
          The core agent, dashboard, and tool system are MIT licensed and free to self-host, forever, with no
          usage limits — that&apos;s the whole point of building it in the open. A hosted version exists for
          people who&apos;d rather not run their own Postgres/Redis/Kubernetes stack, with a free tier and a
          paid tier for heavier usage. Contributors to the open-source core get the paid tier free — see the{" "}
          <a href="/docs" className="text-warn hover:underline">docs</a> for how that works.
        </p>

        <h2 style={{ fontFamily: "var(--font-mono)" }} className="text-xl text-foreground pt-6">
          Built by
        </h2>
        <p>
          Syed Laeeq Ahmed — full-stack engineer.{" "}
          <a href="https://github.com/LaeeqtheDev" target="_blank" rel="noreferrer" className="text-warn hover:underline">GitHub</a>{" "}
          ·{" "}
          <a href="https://www.linkedin.com/in/syed-laeeq-ahmed/" target="_blank" rel="noreferrer" className="text-warn hover:underline">LinkedIn</a>
        </p>
      </div>
    </MarketingShell>
  );
}
