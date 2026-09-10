"use client";

import { useEffect, useState, Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Loader2, Search, Plus, X } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { ClerkTokenBridge } from "@/components/auth/clerk-token-bridge";
import { ServiceIcon } from "@/components/agent/service-icon";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface CatalogEntry {
  service: string;
  label: string;
  description: string;
  category: string;
  configured: boolean;
  connected: boolean;
  workspaceName: string | null;
}

function ConnectionsInner() {
  const params = useSearchParams();
  const [getToken, setGetToken] = useState<(() => Promise<string | null>) | undefined>(undefined);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [selfHosted, setSelfHosted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const justConnected = params.get("connected");
  const workspace = params.get("workspace");
  const error = params.get("error");

  async function authHeaders(): Promise<Record<string, string>> {
    if (typeof getToken !== "function") return {};
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function load() {
    try {
      const res = await fetch(`${API_URL}/connections`, { headers: await authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCatalog(Array.isArray(data.catalog) ? data.catalog : []);
        setSelfHosted(!!data.selfHosted);
      }
    } catch {
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken]);

  async function remove(service: string) {
    setBusy(service);
    await fetch(`${API_URL}/connections/${service}/disconnect`, {
      method: "POST",
      headers: await authHeaders(),
    });
    await load();
    setBusy(null);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (c) => c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
    );
  }, [catalog, query]);

  const connected = filtered.filter((c) => c.connected);
  const categories = useMemo(() => {
    const groups = new Map<string, CatalogEntry[]>();
    for (const entry of filtered) {
      if (entry.connected) continue;
      const list = groups.get(entry.category) ?? [];
      list.push(entry);
      groups.set(entry.category, list);
    }
    return [...groups.entries()];
  }, [filtered]);

  return (
    <div className="min-h-screen bg-background">
      <ClerkTokenBridge onReady={(fn) => setGetToken(() => fn)} />
      <AppNav getToken={getToken} />

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between gap-6 mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-1.5">Connections</h1>
            <p className="text-sm text-muted-foreground max-w-md">
              Connect an app and the agent can work with it directly. It only ever reads without asking —
              anything that posts or sends still needs your approval.
            </p>
          </div>
          <div className="relative shrink-0 hidden sm:block">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-48 text-sm rounded-md border border-border bg-background pl-8 pr-3 py-2"
            />
          </div>
        </div>

        {justConnected && (
          <div className="mb-6 p-3 rounded-lg border border-warn/30 bg-warn/[0.06] text-sm text-foreground flex items-center gap-2">
            <Check className="h-4 w-4 text-warn shrink-0" />
            Connected to {workspace || justConnected}.
          </div>
        )}
        {error && (
          <div className="mb-6 p-3 rounded-lg border border-destructive/30 bg-destructive/[0.06] text-sm text-destructive">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading
          </div>
        )}

        {!loading && connected.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xs font-medium text-foreground mb-3">Connected</h2>
            <div className="space-y-2">
              {connected.map((c) => (
                <div key={c.service} className="p-3 rounded-lg border border-border flex items-center gap-3">
                  <ServiceIcon service={c.service} className="h-9 w-9 shrink-0 text-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-foreground">{c.label}</p>
                      <Check className="h-3.5 w-3.5 text-warn" />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.workspaceName || c.description}
                    </p>
                  </div>
                  <button
                    onClick={() => remove(c.service)}
                    disabled={busy === c.service}
                    className="shrink-0 text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
                  >
                    {busy === c.service ? <Loader2 className="h-3 w-3 animate-spin" /> : "Disconnect"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {!loading &&
          categories.map(([category, entries]) => (
            <section key={category} className="mb-8">
              <h2 className="text-xs font-medium text-foreground mb-3">{category}</h2>
              <div className="grid sm:grid-cols-2 gap-2">
                {entries.map((c) => (
                  <div
                    key={c.service}
                    className="p-3 rounded-lg border border-border flex items-center gap-3 hover:border-foreground/20 transition-colors"
                  >
                    <ServiceIcon service={c.service} className="h-9 w-9 shrink-0 text-lg" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{c.label}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{c.description}</p>
                    </div>

                    {c.configured ? (
                      // A plain link, not a fetch — OAuth needs a real
                      // top-level navigation to the provider's consent page.
                      <a
                        href={`${API_URL}/connections/${c.service}/start`}
                        title={`Connect ${c.label}`}
                        className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                      </a>
                    ) : (
                      // Deliberately does NOT tell the end user to edit a
                      // .env file — that's the operator's job. They just
                      // see that it isn't available here yet.
                      <span
                        title={
                          selfHosted
                            ? `Register an app with ${c.label} and add its client ID and secret to apps/api/.env`
                            : "Not enabled on this server yet"
                        }
                        className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/50 px-2"
                      >
                        {selfHosted ? "Set up" : "Soon"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}

        {!loading && filtered.length === 0 && (
          <div className="py-12 text-center">
            <X className="h-5 w-5 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nothing matches &ldquo;{query}&rdquo;.</p>
          </div>
        )}

        {selfHosted && catalog.some((c) => !c.configured) && (
          <div className="mt-8 p-4 rounded-lg border border-border bg-card/50">
            <p className="text-sm text-foreground font-medium mb-2">Enabling the rest</p>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              You&apos;re running this yourself, so these need a one-time setup — register an app with the
              provider, then add its credentials. Every user of this server can then connect with one
              click; they never see any of this.
            </p>
            <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>
                Slack: <span className="text-foreground">api.slack.com/apps</span> &rarr; Create App &rarr;
                OAuth &amp; Permissions. Notion: <span className="text-foreground">notion.so/my-integrations</span>{" "}
                &rarr; New integration &rarr; type &ldquo;Public&rdquo;.
              </li>
              <li>
                Set the redirect URL to{" "}
                <code className="text-foreground bg-muted px-1 py-0.5 rounded">
                  {API_URL}/connections/&lt;service&gt;/callback
                </code>
              </li>
              <li>
                Put the client ID and secret in{" "}
                <code className="text-foreground bg-muted px-1 py-0.5 rounded">apps/api/.env</code> as{" "}
                <code className="text-foreground bg-muted px-1 py-0.5 rounded">SLACK_CLIENT_ID</code> /{" "}
                <code className="text-foreground bg-muted px-1 py-0.5 rounded">SLACK_CLIENT_SECRET</code>,
                then restart the API.
              </li>
            </ol>
          </div>
        )}

        <p className="text-xs text-muted-foreground/60 mt-10 pt-6 border-t border-border">
          Connecting opens that app&apos;s own sign-in page — we never see your password. Access tokens are
          encrypted before storage, and disconnecting deletes them. You can also revoke access from within
          the app itself at any time.
        </p>
      </div>
    </div>
  );
}

export default function ConnectionsPage() {
  return (
    <Suspense fallback={null}>
      <ConnectionsInner />
    </Suspense>
  );
}
