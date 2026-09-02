"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Check, UserCog } from "lucide-react";
import { ClerkTokenBridge } from "@/components/auth/clerk-token-bridge";
import { AppNav } from "@/components/app-nav";
import { COUNTRIES } from "@/lib/countries";
import { isHostedMode } from "@/lib/hosted-mode";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Profile {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  country?: string | null;
  dialCode?: string | null;
  linkedin?: string | null;
  github?: string | null;
  website?: string | null;
  resume?: string | null;
}

const FIELDS: { key: keyof Profile; label: string; placeholder: string }[] = [
  { key: "fullName", label: "Full name", placeholder: "Jane Doe" },
  { key: "email", label: "Email", placeholder: "jane@example.com" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/..." },
  { key: "github", label: "GitHub", placeholder: "https://github.com/..." },
  { key: "website", label: "Website", placeholder: "https://..." },
];

// The details the agent uses to fill forms it encounters — job applications,
// contact forms, signups — so you never retype the same information. Read
// server-side only via the getUserProfile tool; never sent anywhere except
// the form you approve.
export default function ProfilePage() {
  const [getToken, setGetToken] = useState<(() => Promise<string | null>) | undefined>(undefined);
  const [profile, setProfile] = useState<Profile>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function authHeaders(): Promise<Record<string, string>> {
    if (typeof getToken !== "function") return {};
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  useEffect(() => {
    (async () => {
      if (isHostedMode() && typeof getToken !== "function") return;
      try {
        const res = await fetch(`${API_URL}/profile`, { headers: await authHeaders() });
        if (res.ok) setProfile((await res.json()) ?? {});
      } catch {
        // API unreachable — start with an empty form rather than break the page.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken]);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save.");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  function set(key: keyof Profile, value: string) {
    setProfile((p) => ({ ...p, [key]: value }));
    setSaved(false);
  }

  return (
    <div className="min-h-screen bg-background">
      <ClerkTokenBridge onReady={(fn) => setGetToken(() => fn)} />
      <AppNav getToken={getToken} />

      <div className="max-w-2xl mx-auto px-6 py-10">

        <div className="flex items-center gap-2 mb-2">
          <UserCog className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-semibold text-foreground">Your details</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8">
          The agent uses these to fill out forms it finds — job applications, contact forms, signups —
          so you don&apos;t retype the same information every time. Nothing is submitted without your approval.
        </p>

        {error && <p className="text-sm text-destructive mb-4">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Country</label>
            <select
              value={profile.country ?? ""}
              onChange={(e) => {
                const match = COUNTRIES.find((x) => x.name === e.target.value);
                setProfile((p) => ({
                  ...p,
                  country: e.target.value,
                  location: e.target.value,
                  // Auto-fill the dial code to match, unless they've already
                  // set one — saves picking the same thing twice.
                  dialCode: match ? match.dial : p.dialCode,
                }));
                setSaved(false);
              }}
              className="w-full text-sm rounded-md border bg-background px-3 py-2"
            >
              <option value="">Select a country</option>
              {COUNTRIES.map((x) => (
                <option key={x.code} value={x.name}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Phone</label>
            <div className="flex gap-2">
              <select
                value={profile.dialCode ?? ""}
                onChange={(e) => set("dialCode", e.target.value)}
                className="w-28 text-sm rounded-md border bg-background px-2 py-2 shrink-0"
              >
                <option value="">Code</option>
                {[...new Set(COUNTRIES.map((x) => x.dial))].sort().map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <input
                value={profile.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="300 1234567"
                className="flex-1 text-sm rounded-md border bg-background px-3 py-2"
              />
            </div>
          </div>

          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="text-xs text-muted-foreground mb-1.5 block">{f.label}</label>
              <input
                value={(profile[f.key] as string) ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full text-sm rounded-md border bg-background px-3 py-2"
              />
            </div>
          ))}

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">
              Resume / summary — used for longer form fields like &quot;tell us about yourself&quot;
            </label>
            <textarea
              value={profile.resume ?? ""}
              onChange={(e) => set("resume", e.target.value)}
              rows={8}
              placeholder="Paste your resume or a summary of your experience..."
              className="w-full text-sm rounded-md border bg-background px-3 py-2 resize-none"
            />
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <>
                <Check className="h-4 w-4" /> Saved
              </>
            ) : (
              "Save details"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
