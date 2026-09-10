"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CreditCard, Upload, Loader2, Check, Landmark, ExternalLink,
  XCircle, Zap, Clock, Key,
} from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { ClerkTokenBridge } from "@/components/auth/clerk-token-bridge";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface BankDetails {
  configured: boolean;
  bankName?: string | null;
  accountTitle?: string | null;
  accountNumber?: string | null;
  iban?: string | null;
  note?: string | null;
}

interface Usage {
  hosted: boolean;
  plan?: string;
  tasksUsed?: number;
  limit?: number;
}

interface Payment {
  id: string;
  amount: string | null;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
}

export default function BillingPage() {
  const [getToken, setGetToken] = useState<(() => Promise<string | null>) | undefined>(undefined);
  const [checkingOut, setCheckingOut] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState<Date | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bank, setBank] = useState<BankDetails | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [myPayments, setMyPayments] = useState<Payment[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  async function authHeaders(): Promise<Record<string, string>> {
    if (typeof getToken !== "function") return {};
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  useEffect(() => {
    fetch(`${API_URL}/billing/bank-details`)
      .then((r) => r.json())
      .then(setBank)
      .catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetch(`${API_URL}/usage`, { headers: await authHeaders() });
      if (res.ok) setUsage(await res.json());
      const pay = await fetch(`${API_URL}/billing/my-payments`, { headers: await authHeaders() });
      if (pay.ok) {
        const data = await pay.json();
        setMyPayments(Array.isArray(data) ? data : []);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken]);

  async function cancelPlan() {
    if (!confirm("Downgrade to Free? You'll keep Pro until the current period ends.")) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/billing/cancel`, { method: "POST", headers: await authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cancellation failed.");
      setCancelled(data.cancelsAt ? new Date(data.cancelsAt) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setCancelling(false);
    }
  }

  async function checkout() {
    setCheckingOut(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't start checkout.");
      if (data.url) window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setCheckingOut(false);
    }
  }

  async function openPortal() {
    setOpeningPortal(true);
    try {
      const res = await fetch(`${API_URL}/billing/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setError(data.error || "Couldn't open the billing portal.");
    } catch {
      setError("Couldn't open the billing portal.");
    } finally {
      setOpeningPortal(false);
    }
  }

  async function submitReceipt() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("receipt", file);
      form.append("amount", amount);
      form.append("note", note);
      const res = await fetch(`${API_URL}/billing/bank-transfer`, {
        method: "POST",
        headers: await authHeaders(),
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setUploaded(true);
      setFile(null);
      setAmount("");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setUploading(false);
    }
  }

  const isPro = usage?.plan === "pro";
  const used = usage?.tasksUsed ?? 0;
  const limit = usage?.limit ?? 0;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const nearLimit = pct >= 80;

  const input =
    "w-full text-sm rounded-md border border-border bg-background px-3 py-2 focus:outline-none focus:border-foreground/30 transition-colors";

  return (
    <div className="min-h-screen bg-background">
      <ClerkTokenBridge onReady={(fn) => setGetToken(() => fn)} />
      <AppNav getToken={getToken} />

      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold text-foreground mb-1.5">Billing</h1>
        <p className="text-sm text-muted-foreground max-w-xl mb-8">
          A step is one thing the agent does — reading a page, running a search, filling a form. A quick
          question is 1&ndash;2 steps; a full job application is around 8&ndash;12.
        </p>

        {error && (
          <div className="mb-6 p-3 rounded-lg border border-destructive/30 bg-destructive/[0.06] text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Current plan — the thing someone opens this page to check. */}
        {usage?.hosted && (
          <div className="mb-8 p-5 rounded-xl border border-border bg-card">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Zap className={`h-4 w-4 ${isPro ? "text-warn" : "text-muted-foreground"}`} />
                  <p className="text-base font-medium text-foreground">{isPro ? "Pro" : "Free"} plan</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {cancelled
                    ? `Downgrading on ${cancelled.toLocaleDateString()} — you keep Pro until then.`
                    : isPro
                    ? "$30/month · cancel anytime"
                    : "Upgrade for 2,000 steps a month and smarter models"}
                </p>
              </div>

              {isPro && !cancelled && (
                <button
                  onClick={cancelPlan}
                  disabled={cancelling}
                  className="shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
                >
                  {cancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                  Downgrade
                </button>
              )}
            </div>

            <div className="flex items-baseline justify-between mb-2">
              <p className="text-sm text-foreground">
                <span className="font-medium">{used.toLocaleString()}</span>
                <span className="text-muted-foreground"> of {limit.toLocaleString()} steps</span>
              </p>
              <span className={`text-xs ${nearLimit ? "text-warn" : "text-muted-foreground"}`}>
                {limit - used > 0 ? `${(limit - used).toLocaleString()} left` : "Limit reached"}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${nearLimit ? "bg-warn" : "bg-foreground/40"}`}
                style={{ width: `${pct}%` }}
              />
            </div>

            {isPro && (
              <button
                onClick={openPortal}
                disabled={openingPortal}
                className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {openingPortal ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                Update payment method or view invoices
              </button>
            )}
          </div>
        )}

        {/* Upgrade paths — only shown when there's something to upgrade to. */}
        {!isPro && (
          <div className="grid md:grid-cols-2 gap-4 mb-8">
            <div className="p-5 rounded-xl border border-warn/30 bg-warn/[0.03] flex flex-col">
              <CreditCard className="h-5 w-5 text-warn mb-3" />
              <p className="text-base font-medium text-foreground mb-1">Pay by card</p>
              <p className="text-xs text-muted-foreground mb-4 flex-1">
                Instant. Handled securely by Stripe — we never see your card details.
              </p>
              <p className="text-2xl font-semibold text-foreground mb-4">
                $30<span className="text-sm font-normal text-muted-foreground">/month</span>
              </p>
              <button
                onClick={checkout}
                disabled={checkingOut}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {checkingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upgrade to Pro"}
              </button>
            </div>

            <div className="p-5 rounded-xl border border-border flex flex-col">
              <Upload className="h-5 w-5 text-muted-foreground mb-3" />
              <p className="text-base font-medium text-foreground mb-1">Bank transfer</p>
              <p className="text-xs text-muted-foreground mb-4">
                Transfer, then upload the receipt. Reviewed by a person — usually within a day.
              </p>

              {bank?.configured && (
                <div className="mb-4 p-3 rounded-lg bg-muted/40 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
                    <Landmark className="h-3 w-3" /> Transfer to
                  </div>
                  {bank.bankName && <p className="text-foreground font-medium">{bank.bankName}</p>}
                  {bank.accountTitle && <p className="text-foreground">{bank.accountTitle}</p>}
                  {bank.accountNumber && (
                    <p className="text-muted-foreground font-mono">{bank.accountNumber}</p>
                  )}
                  {bank.iban && <p className="text-muted-foreground font-mono break-all">{bank.iban}</p>}
                  {bank.note && <p className="text-muted-foreground pt-1">{bank.note}</p>}
                </div>
              )}

              {uploaded ? (
                <div className="flex items-center gap-2 text-sm text-warn">
                  <Check className="h-4 w-4" /> Receipt submitted — we&apos;ll email you.
                </div>
              ) : (
                <div className="space-y-2 mt-auto">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="w-full text-xs text-muted-foreground file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-border file:bg-background file:text-foreground file:text-xs file:cursor-pointer"
                  />
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Amount transferred"
                    className={input}
                  />
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Reference (optional)"
                    className={input}
                  />
                  <button
                    onClick={submitReceipt}
                    disabled={uploading || !file}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md border border-border text-sm text-foreground hover:bg-muted/50 transition-colors disabled:opacity-40"
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit receipt"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {myPayments.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-medium text-foreground mb-3">Your bank transfers</h2>
            <div className="space-y-2">
              {myPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{p.amount || "Receipt submitted"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Sent {new Date(p.createdAt).toLocaleDateString()}
                      {p.reviewedAt && ` · Reviewed ${new Date(p.reviewedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md ${
                      p.status === "approved"
                        ? "bg-warn/15 text-warn"
                        : p.status === "rejected"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {p.status === "pending" && <Clock className="h-3 w-3" />}
                    {p.status === "pending" ? "Awaiting review" : p.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* The escape hatch that makes limits a non-issue — worth surfacing
            properly rather than burying in a footnote. */}
        <div className="p-4 rounded-lg border border-border bg-card/50 flex items-start gap-3">
          <Key className="h-4 w-4 text-warn shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-foreground font-medium mb-1">Or use your own AI key</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Paste a key from any provider in{" "}
              <Link href="/agent" className="text-warn hover:underline">
                Settings
              </Link>{" "}
              and step limits stop applying entirely — on any plan, including Free. You pay that provider
              directly instead of us.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
