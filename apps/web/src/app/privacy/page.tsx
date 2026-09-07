import { LegalShell, Section } from "@/components/legal/legal-shell";

export const metadata = { title: "Privacy — Act" };

// Written to describe what this software genuinely does, since the
// architecture is unusual: the browser runs on the user's own machine, so
// much of what a normal SaaS privacy policy covers doesn't apply here.
//
// FOR THE OPERATOR: this is a plain-English starting point, not legal
// advice. Have a lawyer review it before launch, and fill in the contact
// address below.
export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="September 2026">
      <Section title="The short version">
        <p>
          The agent runs a browser on your own machine using sessions you&apos;re already signed into. We
          never receive your passwords, and we don&apos;t store the pages it visits. Your conversations and
          saved profile details are kept so the product works across sessions, and you can delete them.
        </p>
      </Section>

      <Section title="What we store">
        <p>
          <strong className="text-foreground">Your account</strong> — email and authentication details,
          handled by our authentication provider. We don&apos;t store your password.
        </p>
        <p>
          <strong className="text-foreground">Your conversations</strong> — messages and the results of
          actions taken, so chats persist and scheduled tasks remember prior runs.
        </p>
        <p>
          <strong className="text-foreground">Profile details you choose to save</strong> — name, email,
          phone, location, links, and any resume text you enter for form filling. Entirely optional.
        </p>
        <p>
          <strong className="text-foreground">API keys you provide</strong> — encrypted at rest with
          AES-256-GCM and never displayed again after saving, only a masked preview.
        </p>
        <p>
          <strong className="text-foreground">Usage counts</strong> — how many tasks you&apos;ve run, for
          plan limits.
        </p>
      </Section>

      <Section title="What we don't store">
        <p>
          Passwords or session cookies for any third-party site. The browser uses your local Chrome
          profile directly; those credentials never leave your machine and are never transmitted to us.
        </p>
        <p>The contents of pages the agent reads, beyond what appears in your conversation history.</p>
        <p>Payment card details. Card payments are handled entirely by Stripe.</p>
      </Section>

      <Section title="Third parties">
        <p>
          Your messages are sent to whichever AI provider you select (Anthropic, OpenAI, xAI, Groq, or a
          local model) for processing. Their handling is governed by their own policies. Choosing a local
          Ollama model means nothing leaves your machine at all.
        </p>
        <p>
          We also use an authentication provider for sign-in and Stripe for payments. Self-hosted
          deployments involve none of these — no data reaches us.
        </p>
      </Section>

      <Section title="Your control">
        <p>
          Delete any conversation from the sidebar, clear your saved profile at any time, or ask us to
          delete your account entirely. Deletion removes your conversations, profile, and stored keys.
        </p>
      </Section>

      <Section title="Self-hosting">
        <p>
          If you run this yourself, none of the above applies to us — your data stays in your own
          database, on your own infrastructure, and we have no access to it.
        </p>
      </Section>

      <Section title="Contact">
        <p>Questions about your data or a deletion request: laeeq@northfoundry.co.</p>
      </Section>
    </LegalShell>
  );
}
