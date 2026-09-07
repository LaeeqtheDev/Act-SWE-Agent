"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Plug, Loader2 } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { ClerkTokenBridge } from "@/components/auth/clerk-token-bridge";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Connections {
  connected: { service: string; workspaceName: string | null }[];
  available: { service: string; label: string }[];
}

const DESCRIPTIONS: Record<string, string> = {
  slack: "Read channels, search messages, and post — with your approval.",
  notion: "Search and read your pages, and append to them.",
};

function ConnectionsInner() {
  const params = useSearchParams();
  const [getToken, setGetToken] = useState<(() => Promise<string | null>) | undefined>(undefined);
  const [data, setData] = useState<Connections | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
      if (res.ok) setData(await res.json());
    } catch {
      setData({ connected: [], available: [] });
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

  const connectedSet = new Set(data?.connected.map((c) => c.service) ?? []);

  return (
    <div className="min-h-screen bg-background">
      <ClerkTokenBridge onReady={(fn) => setGetToken(() => fn)} />
      <AppNav getToken={getToken} />

      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-center gap-2 mb-2">
          <Plug className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-semibold text-foreground">Connections</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8">
          Connect a service and the agent talks to it directly through its API — much faster and more
          reliable than driving the web interface. Reading is free; anything that posts still needs your
          approval.
        </p>

        {justConnected && (
          <div className="mb-6 p-3 rounded-lg border border-warn/30 bg-warn/[0.06] text-sm text-foreground">
            Connected to {workspace || justConnected}.
          </div>
        )}
        {error && (
          <div className="mb-6 p-3 rounded-lg border border-destructive/30 bg-destructive/[0.06] text-sm text-destructive">
            {error}
          </div>
        )}

        {data?.available.length === 0 && (
          <div className="p-4 rounded-lg border border-border text-sm text-muted-foreground">
            No integrations are configured on this server yet. Set{" "}
            <code className="text-foreground bg-muted px-1.5 py-0.5 rounded text-xs">SLACK_CLIENT_ID</code> or{" "}
            <code className="text-foreground bg-muted px-1.5 py-0.5 rounded text-xs">NOTION_CLIENT_ID</code> in{" "}
            <code className="text-foreground bg-muted px-1.5 py-0.5 rounded text-xs">apps/api/.env</code> — see the docs
            for setup.
          </div>
        )}

        <div className="space-y-3">
          {data?.available.map((a) => {
            const isConnected = connectedSet.has(a.service);
            const conn = data.connected.find((c) => c.service === a.service);

            return (
              <div key={a.service} className="p-4 rounded-lg border border-border flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{a.label}</p>
                    {isConnected && <Check className="h-3.5 w-3.5 text-warn" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isConnected && conn?.workspaceName ? conn.workspaceName : DESCRIPTIONS[a.service]}
                  </p>
                </div>

                {isConnected ? (
                  <button
                    onClick={() => remove(a.service)}
                    disabled={busy === a.service}
                    className="text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors shrink-0"
                  >
                    {busy === a.service ? <Loader2 className="h-3 w-3 animate-spin" /> : "Disconnect"}
                  </button>
                ) : (
                  <a
                    href={`${API_URL}/connections/${a.service}/start`}
                    className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity shrink-0"
                  >
                    Connect
                  </a>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground/70 mt-8">
          Tokens are encrypted before storage and never shown again. Disconnecting deletes them — you can
          also revoke access from within Slack or Notion directly.
        </p>
      </div>
    </div>
  );
}

export default function ConnectionsPage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={null}>
      <ConnectionsInner />
    </Suspense>
  );
}
