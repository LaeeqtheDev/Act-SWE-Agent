"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Play, Trash2, Loader2, Clock, Bell } from "lucide-react";
import { ClerkTokenBridge } from "@/components/auth/clerk-token-bridge";
import { AppNav } from "@/components/app-nav";
import { isHostedMode } from "@/lib/hosted-mode";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Workflow {
  id: string;
  name: string;
  prompt: string;
  cron: string;
  enabled: boolean;
  notifyOnRun: boolean;
  lastRunAt: string | null;
}

const SCHEDULE_PRESETS = [
  { label: "Every 15 minutes", cron: "*/15 * * * *" },
  { label: "Hourly", cron: "0 * * * *" },
  { label: "Every 6 hours", cron: "0 */6 * * *" },
  { label: "Daily at 9am", cron: "0 9 * * *" },
  { label: "Weekdays at 9am", cron: "0 9 * * 1-5" },
];

// Tasks the agent repeats on a schedule, unattended — same tools, same
// permission gate on writes as a real chat, just triggered by cron instead
// of a person typing. Each workflow keeps one ongoing conversation across
// all its runs, so it has real memory of what it found last time.
export default function WorkflowsPage() {
  const [getToken, setGetToken] = useState<(() => Promise<string | null>) | undefined>(undefined);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [cronExpr, setCronExpr] = useState(SCHEDULE_PRESETS[1].cron);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function authHeaders(): Promise<Record<string, string>> {
    if (typeof getToken !== "function") return {};
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  const load = useCallback(async () => {
    if (isHostedMode() && typeof getToken !== "function") return;
    const res = await fetch(`${API_URL}/workflows`, { headers: await authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    setWorkflows(Array.isArray(data) ? data : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    if (!name.trim() || !prompt.trim()) return;
    setSaving(true);
    try {
      await fetch(`${API_URL}/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ name, prompt, cron: cronExpr }),
      });
      setName("");
      setPrompt("");
      setCreating(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggle(w: Workflow) {
    setBusyId(w.id);
    await fetch(`${API_URL}/workflows/${w.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ enabled: !w.enabled }),
    });
    await load();
    setBusyId(null);
  }

  async function runNow(id: string) {
    setBusyId(id);
    await fetch(`${API_URL}/workflows/${id}/run`, { method: "POST", headers: await authHeaders() });
    setBusyId(null);
  }

  async function remove(id: string) {
    setBusyId(id);
    await fetch(`${API_URL}/workflows/${id}`, { method: "DELETE", headers: await authHeaders() });
    await load();
    setBusyId(null);
  }

  return (
    <div className="min-h-screen bg-background">
      <ClerkTokenBridge onReady={(fn) => setGetToken(() => fn)} />
      <AppNav getToken={getToken} />

      <div className="max-w-2xl mx-auto px-6 py-10">

        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-semibold text-foreground">Workflows</h1>
          <button
            onClick={() => setCreating((c) => !c)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted/50 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-8">
          Tasks the agent repeats on a schedule, unattended. Same tools, same approval gate on any write.
        </p>

        {creating && (
          <div className="p-4 rounded-lg border border-border mb-6 space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (e.g. Check LinkedIn messages)"
              className="w-full text-sm rounded-md border bg-background px-3 py-2"
            />
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What should it do each time? (e.g. Check my LinkedIn messages and notes anything new.)"
              rows={3}
              className="w-full text-sm rounded-md border bg-background px-3 py-2 resize-none"
            />
            <select
              value={cronExpr}
              onChange={(e) => setCronExpr(e.target.value)}
              className="w-full text-sm rounded-md border bg-background px-3 py-2"
            >
              {SCHEDULE_PRESETS.map((p) => (
                <option key={p.cron} value={p.cron}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              onClick={create}
              disabled={saving || !name.trim() || !prompt.trim()}
              className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Create workflow"}
            </button>
          </div>
        )}

        <div className="space-y-2">
          {workflows.length === 0 && !creating && (
            <p className="text-sm text-muted-foreground">No workflows yet — create one to have the agent check something on its own.</p>
          )}
          {workflows.map((w) => (
            <div key={w.id} className="p-4 rounded-lg border border-border">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{w.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{w.prompt}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground/70">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {w.cron}
                    </span>
                    {w.notifyOnRun && (
                      <span className="inline-flex items-center gap-1">
                        <Bell className="h-3 w-3" /> notifies
                      </span>
                    )}
                    {w.lastRunAt && <span>last ran {new Date(w.lastRunAt).toLocaleString()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => runNow(w.id)} disabled={busyId === w.id} className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground" title="Run now">
                    <Play className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => toggle(w)}
                    disabled={busyId === w.id}
                    className={`text-[11px] px-2 py-1 rounded-md border ${w.enabled ? "border-border text-foreground" : "border-border text-muted-foreground"}`}
                  >
                    {w.enabled ? "On" : "Off"}
                  </button>
                  <button onClick={() => remove(w.id)} disabled={busyId === w.id} className="p-1.5 rounded-md hover:bg-muted/50 text-destructive" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
