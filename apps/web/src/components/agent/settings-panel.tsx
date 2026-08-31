"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ProviderIcon } from "./provider-icon";
import { Check, Eye, EyeOff, Loader2 } from "lucide-react";

const PROVIDERS = ["groq", "anthropic", "openai", "grok", "ollama"];

interface Catalog {
  [provider: string]: { models: string[] };
}

interface Settings {
  provider: string;
  model: string;
  hasKey: boolean;
  maskedKey: string | null;
}

export function SettingsPanel({
  apiUrl,
  open,
  onOpenChange,
  getToken,
}: {
  apiUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getToken?: () => Promise<string | null>;
}) {
  const [catalog, setCatalog] = useState<Catalog>({});
  const [settings, setSettings] = useState<Settings | null>(null);
  const [provider, setProvider] = useState("groq");
  const [model, setModel] = useState("openai/gpt-oss-20b");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function authHeaders(): Promise<Record<string, string>> {
    if (!getToken) return {};
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  useEffect(() => {
    if (!open) return;
    authHeaders().then((headers) =>
      fetch(`${apiUrl}/settings/provider`, { headers })
        .then((r) => r.json())
        .then((data) => {
          setCatalog(data.catalog);
          if (data.settings) {
            setSettings(data.settings);
            setProvider(data.settings.provider);
            setModel(data.settings.model);
          }
        })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, apiUrl]);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/settings/provider`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ provider, model, apiKey: apiKey || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save settings.");
        return;
      }
      setSettings(data.settings);
      setApiKey("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reach the API.");
    } finally {
      setSaving(false);
    }
  }

  const models = catalog[provider]?.models ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Model & API key</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <button
            type="button"
            onClick={() => {
              setProvider("groq");
              setModel("openai/gpt-oss-20b");
            }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Reset to recommended free default (Groq · gpt-oss-20b)
          </button>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Provider</label>
            <div className="grid grid-cols-5 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setProvider(p);
                    setModel(catalog[p]?.models[0] ?? "");
                  }}
                  className={`flex flex-col items-center gap-1.5 p-2.5 rounded-md border text-xs capitalize transition-colors ${
                    provider === p ? "border-foreground bg-muted" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <ProviderIcon provider={p} size={22} />
                  {p}
                </button>
              ))}
            </div>
          </div>

          {models.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full text-sm rounded-md border bg-background px-3 py-2"
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              API key {settings?.provider === provider && settings?.maskedKey && `(currently ${settings.maskedKey})`}
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={settings?.provider === provider && settings?.hasKey ? "Paste a new key to replace it" : "Paste your API key"}
                className="w-full text-sm rounded-md border bg-background px-3 py-2 pr-9 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Stored encrypted. Never shown again after saving — only a masked preview.
            </p>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button onClick={save} disabled={saving || !model} className="w-full">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...
              </>
            ) : saved ? (
              <>
                <Check className="h-4 w-4 mr-2" /> Saved
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
