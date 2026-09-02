import { isHostedMode } from "@/lib/hosted-mode";

const API_URL = process.env.API_URL_INTERNAL || "http://localhost:4000";

interface ApiConfig {
  hostedMode?: boolean;
  clerkConfigured?: boolean;
  stripeConfigured?: boolean;
  bankTransferConfigured?: boolean;
  smtpConfigured?: boolean;
  browserVisible?: boolean;
  localDevTools?: boolean;
  chromeProfile?: boolean;
}

async function getApiConfig(): Promise<ApiConfig | null> {
  try {
    const res = await fetch(`${API_URL}/config`, { cache: "no-store" });
    return res.json();
  } catch {
    return null;
  }
}

function Row({ label, ok, hint }: { label: string; ok: boolean; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border last:border-0">
      <div>
        <p className="text-sm text-foreground">{label}</p>
        {hint && !ok && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <span className={`text-xs font-mono shrink-0 ${ok ? "text-green-500" : "text-muted-foreground"}`}>
        {ok ? "on" : "off"}
      </span>
    </div>
  );
}

// Diagnostic page — answers "I set the flag, why isn't it working?" with
// facts instead of guesswork. Shows what the WEB app sees and what the API
// sees side by side, since a mismatch between the two is the single most
// common cause of hosted mode appearing not to work.
export default async function DebugPage() {
  const web = isHostedMode();
  const api = await getApiConfig();
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const mismatch = api !== null && web !== !!api.hostedMode;

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-xl mx-auto px-6 py-12">
        <h1 className="text-xl font-semibold text-foreground mb-1">Configuration check</h1>
        <p className="text-sm text-muted-foreground mb-8">
          What each side of the app currently sees. Delete this page before deploying publicly.
        </p>

        {api === null && (
          <div className="p-4 rounded-lg border border-destructive/40 bg-destructive/5 mb-6">
            <p className="text-sm text-destructive">Can&apos;t reach the API at {API_URL}.</p>
            <p className="text-xs text-muted-foreground mt-1">Is `pnpm --filter api dev` running?</p>
          </div>
        )}

        {mismatch && (
          <div className="p-4 rounded-lg border border-warn/40 bg-warn/5 mb-6">
            <p className="text-sm text-warn font-medium">Mismatch — this is your problem.</p>
            <p className="text-xs text-muted-foreground mt-1.5">
              Web says <code className="bg-muted px-1 rounded">{String(web)}</code>, API says{" "}
              <code className="bg-muted px-1 rounded">{String(!!api?.hostedMode)}</code>. Both must be
              true. Set <code className="bg-muted px-1 rounded">NEXT_PUBLIC_HOSTED_MODE=&quot;true&quot;</code> in{" "}
              <code className="bg-muted px-1 rounded">apps/web/.env</code> and{" "}
              <code className="bg-muted px-1 rounded">HOSTED_MODE=&quot;true&quot;</code> in{" "}
              <code className="bg-muted px-1 rounded">apps/api/.env</code>, then restart both dev servers.
            </p>
          </div>
        )}

        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Web app (apps/web/.env)</h2>
          <div className="rounded-lg border border-border px-4">
            <Row
              label="NEXT_PUBLIC_HOSTED_MODE"
              ok={web}
              hint='Not set to "true" — this is why there is no login UI.'
            />
            <Row
              label="NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
              ok={!!clerkKey}
              hint="Missing — sign-in buttons will render but fail on click."
            />
            <Row
              label="CLERK_SECRET_KEY (yes, here too)"
              ok={!!process.env.CLERK_SECRET_KEY}
              hint="proxy.ts runs server-side inside Next and needs its own copy — separate from the API's. Without it: 'Missing secretKey' and 404s on protected routes."
            />
          </div>
        </section>

        <section>
          <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">API (apps/api/.env)</h2>
          <div className="rounded-lg border border-border px-4">
            <Row label="HOSTED_MODE" ok={!!api?.hostedMode} hint='Not set to "true".' />
            <Row
              label="Clerk keys (secret + publishable)"
              ok={!!api?.clerkConfigured}
              hint="Both CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY are required."
            />
            <Row label="Bank transfer details" ok={!!api?.bankTransferConfigured} hint="No BANK_* vars set." />
            <Row label="Stripe" ok={!!api?.stripeConfigured} hint="No STRIPE_SECRET_KEY." />
            <Row label="SMTP (email)" ok={!!api?.smtpConfigured} hint="Notifications are in-app only." />
            <Row label="Visible browser" ok={!!api?.browserVisible} hint='Set BROWSER_HEADLESS="false" to watch it work.' />
            <Row label="Your Chrome profile" ok={!!api?.chromeProfile} hint="Set CHROME_USER_DATA_DIR for logged-in sites." />
            <Row label="Local dev tools" ok={!!api?.localDevTools} hint="Off by default." />
          </div>
        </section>
      </div>
    </main>
  );
}
