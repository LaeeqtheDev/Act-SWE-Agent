"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Check, X, Eye, Loader2, Shield, Users } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface PendingPayment {
  id: string;
  userId: string;
  fileName: string;
  amount: string | null;
  note: string | null;
  status: string;
  createdAt: string;
}

interface AdminUser {
  id: string;
  email: string | null;
  plan: string;
  tasksUsed: number;
  createdAt: string;
}

// Single-operator admin panel, gated by ADMIN_SECRET (a shared secret you
// set in apps/api/.env) — not a full role system, since this is meant for
// one person (you) reviewing receipts and adjusting plans by hand. Only
// meaningful in hosted mode.
export default function AdminPage() {
  const [secret, setSecret] = useState<string | null>(null);
  const [secretInput, setSecretInput] = useState("");
  const [tab, setTab] = useState<"pending" | "users">("pending");
  const [pending, setPending] = useState<PendingPayment[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("admin_secret");
    if (stored) setSecret(stored);
  }, []);

  const headers = useCallback((): Record<string, string> => (secret ? { "x-admin-secret": secret } : {}), [secret]);

  const loadPending = useCallback(async () => {
    if (!secret) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/billing/pending`, { headers: headers() });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load.");
      setPending(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [secret, headers]);

  const loadUsers = useCallback(async () => {
    if (!secret) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/users`, { headers: headers() });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load.");
      setUsers(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [secret, headers]);

  useEffect(() => {
    if (!secret) return;
    tab === "pending" ? loadPending() : loadUsers();
  }, [secret, tab, loadPending, loadUsers]);

  function verifySecret() {
    sessionStorage.setItem("admin_secret", secretInput);
    setSecret(secretInput);
  }

  // Receipt files are only ever fetched with the admin header, never as a
  // plain <img src> or link (browsers can't attach custom headers to those)
  // — so we fetch it as a blob and open that instead. The secret never ends
  // up in a URL, browser history, or server logs this way.
  async function viewReceipt(id: string) {
    const res = await fetch(`${API_URL}/billing/receipts/${id}`, { headers: headers() });
    if (!res.ok) return alert("Couldn't load the receipt.");
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), "_blank");
  }

  async function decide(id: string, decision: "approved" | "rejected") {
    setBusyId(id);
    await fetch(`${API_URL}/billing/pending/${id}/${decision}`, { method: "POST", headers: headers() });
    await loadPending();
    setBusyId(null);
  }

  async function changePlan(id: string, plan: "free" | "pro") {
    setBusyId(id);
    await fetch(`${API_URL}/admin/users/${id}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers() },
      body: JSON.stringify({ plan }),
    });
    await loadUsers();
    setBusyId(null);
  }

  if (!secret) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="w-full max-w-xs">
          <Shield className="h-5 w-5 text-muted-foreground mb-3" />
          <h1 className="text-lg font-semibold text-foreground mb-1">Admin</h1>
          <p className="text-xs text-muted-foreground mb-4">Enter the ADMIN_SECRET from apps/api/.env.</p>
          <input
            type="password"
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && verifySecret()}
            placeholder="Admin secret"
            className="w-full text-sm rounded-md border bg-background px-3 py-2 mb-3"
          />
          <button
            onClick={verifySecret}
            className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link href="/agent" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-3 w-3" /> Back to chat
        </Link>

        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => setTab("pending")}
            className={`text-sm pb-2 border-b-2 transition-colors ${tab === "pending" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}
          >
            Pending receipts
          </button>
          <button
            onClick={() => setTab("users")}
            className={`text-sm pb-2 border-b-2 transition-colors flex items-center gap-1.5 ${tab === "users" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}
          >
            <Users className="h-3.5 w-3.5" /> Users
          </button>
        </div>

        {error && (
          <div className="mb-4">
            <p className="text-sm text-destructive">{error}</p>
            <button
              onClick={() => {
                sessionStorage.removeItem("admin_secret");
                setSecret(null);
                setSecretInput("");
              }}
              className="text-xs text-muted-foreground underline mt-1"
            >
              Wrong secret? Try again
            </button>
          </div>
        )}
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

        {tab === "pending" && !loading && !error && (
          <div className="space-y-2">
            {pending.length === 0 && <p className="text-sm text-muted-foreground">Nothing pending.</p>}
            {pending.map((p) => (
              <div key={p.id} className="p-4 rounded-lg border border-border flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{p.fileName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    user {p.userId.slice(0, 12)}... {p.amount && `· ${p.amount}`} {p.note && `· ${p.note}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => viewReceipt(p.id)} className="p-2 rounded-md hover:bg-muted/50 text-muted-foreground">
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => decide(p.id, "approved")}
                    disabled={busyId === p.id}
                    className="p-2 rounded-md hover:bg-muted/50 text-foreground"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => decide(p.id, "rejected")}
                    disabled={busyId === p.id}
                    className="p-2 rounded-md hover:bg-muted/50 text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "users" && !loading && !error && (
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="p-4 rounded-lg border border-border flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{u.email || u.id}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{u.tasksUsed} tasks used this period</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs uppercase text-muted-foreground">{u.plan}</span>
                  <button
                    onClick={() => changePlan(u.id, u.plan === "pro" ? "free" : "pro")}
                    disabled={busyId === u.id}
                    className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted/50 transition-colors"
                  >
                    Set {u.plan === "pro" ? "Free" : "Pro"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
