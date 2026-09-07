import { LegalShell, Section } from "@/components/legal/legal-shell";

export const metadata = { title: "Terms — Act" };

// FOR THE OPERATOR: a plain-English starting point, not legal advice. Have
// a lawyer review before launch and fill in the governing-law and contact
// sections.
export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="September 2026">
      <Section title="What this service does">
        <p>
          Act operates a web browser on your behalf to complete tasks you describe. It can read pages,
          navigate, fill forms, and — only after you explicitly approve each one — submit them.
        </p>
      </Section>

      <Section title="You are responsible for what you ask it to do">
        <p>
          The agent acts as you, using your own accounts and sessions. Anything it submits is treated by
          the receiving site as your action. Review what you approve.
        </p>
        <p>
          Don&apos;t use it for anything unlawful, to send unsolicited bulk messages, to impersonate
          someone, or to access accounts you don&apos;t own.
        </p>
      </Section>

      <Section title="Other websites have their own rules">
        <p>
          Many services restrict automated access in their own terms. Using this on such a site is your
          decision and your risk — that risk is typically account-level, such as rate limiting or
          suspension. We can&apos;t and don&apos;t indemnify you against it.
        </p>
      </Section>

      <Section title="Plans and payment">
        <p>
          The free tier includes a monthly task allowance and needs no payment details. Paid plans are
          billed monthly in advance and renew automatically until cancelled.
        </p>
        <p>
          Cancel any time from the billing page. Cancellation takes effect at the end of the current
          period — you keep access to what you&apos;ve already paid for, and we don&apos;t issue partial
          refunds for unused time.
        </p>
        <p>
          Bank transfer payments are reviewed manually and activate once confirmed, usually within one
          business day.
        </p>
      </Section>

      <Section title="Availability">
        <p>
          We aim to keep the service running but don&apos;t guarantee uninterrupted availability. It also
          depends on third parties — AI providers and the websites it visits — whose availability is
          outside our control.
        </p>
      </Section>

      <Section title="Limits of liability">
        <p>
          The service is provided as is. To the extent the law allows, we aren&apos;t liable for indirect
          or consequential losses, and our total liability is limited to what you paid in the preceding
          twelve months.
        </p>
      </Section>

      <Section title="The open source version">
        <p>
          The underlying software is MIT licensed and free to self-host without restriction. These terms
          cover only the hosted service we operate.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          We&apos;ll notify you of material changes to these terms. Questions: laeeq@northfoundry.co.
        </p>
      </Section>
    </LegalShell>
  );
}
