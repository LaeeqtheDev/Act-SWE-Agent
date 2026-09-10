"use client";

import { useEffect, useState, useMemo } from "react";
import { Loader2, Check, UserCog, FileText, Link2, Phone, CircleCheck, Circle } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { ClerkTokenBridge } from "@/components/auth/clerk-token-bridge";
import { isHostedMode } from "@/lib/hosted-mode";
import { COUNTRIES } from "@/lib/countries";

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

// Grouped by what the agent uses them FOR, not by data type — someone
// filling this in wants to know why a field matters, and which ones
// actually unlock something.
const GROUPS: {
  id: string;
  title: string;
  blurb: string;
  icon: typeof UserCog;
  fields: { key: keyof Profile; label: string; placeholder: string; wide?: boolean }[];
}[] = [
  {
    id: "identity",
    title: "Identity",
    blurb: "Goes into the name and email fields on almost every form.",
    icon: UserCog,
    fields: [
      { key: "fullName", label: "Full name", placeholder: "Jane Doe" },
      { key: "email", label: "Email", placeholder: "jane@example.com" },
    ],
  },
  {
    id: "contact",
    title: "Contact",
    blurb: "Phone and location — commonly required on job applications.",
    icon: Phone,
    fields: [],
  },
  {
    id: "links",
    title: "Links",
    blurb: "Optional, but most applications ask for at least one.",
    icon: Link2,
    fields: [
      { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/..." },
      { key: "github", label: "GitHub", placeholder: "https://github.com/..." },
      { key: "website", label: "Website or portfolio", placeholder: "https://...", wide: true },
    ],
  },
];

// Which fields count toward "ready to auto-fill". Deliberately excludes
// links — a form rarely blocks on them.
const ESSENTIAL: (keyof Profile)[] = ["fullName", "email", "phone", "country", "resume"];

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
        // start empty rather than break the page
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

  const filled = useMemo(() => ESSENTIAL.filter((k) => String(profile[k] ?? "").trim().length > 0), [profile]);
  const pct = Math.round((filled.length / ESSENTIAL.length) * 100);

  const input =
    "w-full text-sm rounded-md border border-border bg-background px-3 py-2 focus:outline-none focus:border-foreground/30 transition-colors";

  return (
    <div className="min-h-screen bg-background">
      <ClerkTokenBridge onReady={(fn) => setGetToken(() => fn)} />
      <AppNav getToken={getToken} />

      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold text-foreground mb-1.5">Your details</h1>
        <p className="text-sm text-muted-foreground max-w-xl mb-8">
          The agent uses these to fill out forms it finds — job applications, contact forms, signups — so
          you don&apos;t retype the same information every time. Nothing is ever submitted without your
          approval.
        </p>

        {/* Completeness is the one thing that tells someone whether this is
            actually going to work for them yet. */}
        <div className="mb-8 p-4 rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between gap-4 mb-2.5">
            <p className="text-sm text-foreground font-medium">
              {pct === 100 ? "Ready to auto-fill" : `${filled.length} of ${ESSENTIAL.length} essentials filled in`}
            </p>
            <span className="text-xs text-muted-foreground shrink-0">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3">
            <div className="h-full rounded-full bg-warn transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {ESSENTIAL.map((k) => {
              const done = filled.includes(k);
              const labels: Record<string, string> = {
                fullName: "Name",
                email: "Email",
                phone: "Phone",
                country: "Country",
                resume: "Resume",
              };
              return (
                <span
                  key={k}
                  className={`inline-flex items-center gap-1.5 text-xs ${done ? "text-foreground" : "text-muted-foreground/60"}`}
                >
                  {done ? <CircleCheck className="h-3 w-3 text-warn" /> : <Circle className="h-3 w-3" />}
                  {labels[k]}
                </span>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg border border-destructive/30 bg-destructive/[0.06] text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-8">
          {GROUPS.map((group) => (
            <section key={group.id}>
              <div className="flex items-center gap-2 mb-1">
                <group.icon className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-foreground">{group.title}</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-4">{group.blurb}</p>

              <div className="grid sm:grid-cols-2 gap-4">
                {group.fields.map((f) => (
                  <div key={f.key} className={f.wide ? "sm:col-span-2" : ""}>
                    <label className="text-xs text-muted-foreground mb-1.5 block">{f.label}</label>
                    <input
                      value={(profile[f.key] as string) ?? ""}
                      onChange={(e) => set(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className={input}
                    />
                  </div>
                ))}

                {/* Contact needs custom controls, so it's rendered inline
                    rather than shoehorned into the generic field list. */}
                {group.id === "contact" && (
                  <>
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
                            dialCode: match ? match.dial : p.dialCode,
                          }));
                          setSaved(false);
                        }}
                        className={input}
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
                          className={`${input} w-24 shrink-0`}
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
                          className={input}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>
          ))}

          <section>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-foreground">About you</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Used for longer fields — &ldquo;tell us about yourself&rdquo;, cover letters, and the summary
              boxes applications ask for. The more detail here, the less you fill in by hand.
            </p>
            <textarea
              value={profile.resume ?? ""}
              onChange={(e) => set("resume", e.target.value)}
              rows={10}
              placeholder="Paste your resume, or a few paragraphs about your experience..."
              className={`${input} resize-none leading-relaxed`}
            />
            <p className="text-xs text-muted-foreground/60 mt-1.5">
              {(profile.resume ?? "").length.toLocaleString()} characters
              {(profile.resume ?? "").length > 0 && (profile.resume ?? "").length < 200 && (
                <span className="text-warn"> · a bit short — more detail fills more fields</span>
              )}
            </p>
          </section>
        </div>

        {/* Sticky so it's reachable without scrolling back up a long form. */}
        <div className="sticky bottom-0 mt-8 -mx-6 px-6 py-4 bg-background/90 backdrop-blur border-t border-border">
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
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
            <p className="text-xs text-muted-foreground">
              Stored on your own server. Only ever read to fill a form you approve.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
