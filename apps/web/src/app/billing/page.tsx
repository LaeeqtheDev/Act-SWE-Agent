"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard, Upload, Loader2, Check, Landmark, ExternalLink, XCircle } from "lucide-react";
import { ClerkTokenBridge } from "@/components/auth/clerk-token-bridge";
import { AppNav } from "@/components/app-nav";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface BankDetails {
  configured: boolean;
  bankName?: string;
  accountTitle?: string;
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

// Only meaningful in hosted mode — self-hosted deployments have no concept
// of plans, so there's nothing to upgrade.
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
  const [myPayments, setMyPayments] = useState<
    { id: string; amount: string | null; status: string; createdAt: string; reviewedAt: string | null }[]
  >([]);
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/billing/bank-details`)
      .then((r) => r.json())
      .then(setBank)
      .catch(() => setBank({ configured: false }));
  }, []);

  async function authHeaders(): Promise<Record<string, string>> {
    if (typeof getToken !== "function") return {};
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

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
    if (!confirm("Downgrade to Free? You'll keep Pro access until the current billing period ends.")) return;
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

  async function startCheckout() {
    setCheckingOut(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          successUrl: `${window.location.origin}/agent?upgraded=true`,
          cancelUrl: `${window.location.origin}/billing`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed.");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setCheckingOut(false);
    }
  }

  async function openPortal() {
    setOpeningPortal(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/billing/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ returnUrl: window.location.href }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't open the billing portal.");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setOpeningPortal(false);
    }
  }

  async function submitReceipt(formData: FormData) {
    setUploading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/billing/bank-transfer`, {
        method: "POST",
        headers: await authHeaders(),
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setUploaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <ClerkTokenBridge onReady={(fn) => setGetToken(() => fn)} />
      <AppNav getToken={getToken} />

      <div className="max-w-2xl mx-auto px-6 py-12">

        <h1 className="text-2xl font-semibold text-foreground mb-2">Billing</h1>
        <p className="text-sm text-muted-foreground mb-6">
          2,000 steps a month and smarter models on Pro. $30/month, cancel anytime. Using your own AI
          key removes limits entirely on any plan.
        </p>

        {usage?.hosted && usage.plan !== "pro" && (
          <div className="p-4 rounded-lg border border-border mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-foreground font-medium">You&apos;re on the Free plan</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {usage.tasksUsed} of {usage.limit} steps used this period.
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1.5 max-w-sm">
                A step is one thing the agent does — reading a page, running a search, filling a form.
                A quick question is 1&ndash;2; a full job application is around 8&ndash;12.
              </p>
            </div>
          </div>
        )}

        {usage?.plan === "pro" && (
          <div className="p-4 rounded-lg border border-border mb-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground font-medium">You're on Pro</p>
              {cancelled ? (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Downgrading to Free {cancelled ? `on ${cancelled.toLocaleDateString()}` : "at period end"} — you keep Pro until then.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {usage.tasksUsed} of {usage.limit} steps used this period
                </p>
              )}
            </div>
            {usage?.limit ? (
              <div className="w-32 shrink-0 mr-4">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-warn transition-all"
                    style={{ width: `${Math.min(100, ((usage.tasksUsed ?? 0) / usage.limit) * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}
            {!cancelled && (
              <button
                onClick={cancelPlan}
                disabled={cancelling}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
              >
                {cancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                Downgrade to Free
              </button>
            )}
          </div>
        )}

        <button
          onClick={openPortal}
          disabled={openingPortal}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground underline mb-10"
        >
          {openingPortal ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
          Update payment method or view invoices
        </button>

        {error && <p className="text-sm text-destructive mb-6">{error}</p>}

        <div className="grid md:grid-cols-2 gap-6">
          <div className="p-6 rounded-lg border border-border">
            <CreditCard className="h-5 w-5 text-muted-foreground mb-3" />
            <h2 className="text-sm font-medium text-foreground mb-1">Pay by card</h2>
            <p className="text-xs text-muted-foreground mb-4">Instant, handled securely by Stripe.</p>
            <button
              onClick={startCheckout}
              disabled={checkingOut}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {checkingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue to checkout"}
            </button>
          </div>

          <div className="p-6 rounded-lg border border-border">
            <Upload className="h-5 w-5 text-muted-foreground mb-3" />
            <h2 className="text-sm font-medium text-foreground mb-1">Bank transfer</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Upload a receipt after transferring — reviewed manually, usually within a day.
            </p>

            {bank && bank.configured && (
              <div className="mb-4 p-3 rounded-md bg-muted/50 text-xs space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
                  <Landmark className="h-3 w-3" /> Transfer to:
                </div>
                {bank.bankName && <p className="text-foreground font-medium">{bank.bankName}</p>}
                {bank.accountTitle && <p className="text-foreground">{bank.accountTitle}</p>}
                {bank.accountNumber && (
                  <p className="text-muted-foreground font-mono">Account: {bank.accountNumber}</p>
                )}
                {bank.iban && <p className="text-muted-foreground font-mono">IBAN: {bank.iban}</p>}
                {bank.note && <p className="text-muted-foreground mt-1.5">{bank.note}</p>}
              </div>
            )}
            {bank && !bank.configured && (
              <p className="text-xs text-muted-foreground mb-4">
                Bank transfer isn't set up yet — use card payment instead, or contact support.
              </p>
            )}

            {uploaded ? (
              <p className="text-sm text-foreground flex items-center gap-2">
                <Check className="h-4 w-4" /> Receipt submitted — pending review.
              </p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitReceipt(new FormData(e.currentTarget));
                }}
                className="space-y-3"
              >
                <input
                  type="file"
                  name="receipt"
                  accept=".png,.jpg,.jpeg,.webp,.pdf"
                  required
                  className="w-full text-xs text-muted-foreground file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-border file:bg-transparent file:text-foreground file:text-xs"
                />
                <input
                  type="text"
                  name="amount"
                  placeholder="Amount transferred"
                  className="w-full text-sm rounded-md border bg-background px-3 py-2"
                />
                <input
                  type="text"
                  name="note"
                  placeholder="Optional note (e.g. transfer reference)"
                  className="w-full text-sm rounded-md border bg-background px-3 py-2"
                />
                <button
                  type="submit"
                  disabled={uploading || !bank?.configured}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md border border-border text-foreground text-sm hover:bg-muted/50 transition-colors disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit receipt"}
                </button>
              </form>
            )}
          </div>
        </div>

        {myPayments.length > 0 && (
          <div className="mt-10">
            <p className="text-sm font-medium text-foreground mb-3">Your bank transfers</p>
            <div className="space-y-2">
              {myPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border text-sm">
                  <div>
                    <p className="text-foreground">{p.amount || "Receipt submitted"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Sent {new Date(p.createdAt).toLocaleDateString()}
                      {p.reviewedAt && ` · Reviewed ${new Date(p.reviewedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-md capitalize ${
                      p.status === "approved"
                        ? "bg-warn/15 text-warn"
                        : p.status === "rejected"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {p.status === "pending" ? "Awaiting review" : p.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-8">
          Prefer to keep using your own API key instead? Premium models are available to anyone
          who pastes their own key in <Link href="/agent" className="underline">Settings</Link> —
          no upgrade needed.
        </p>
      </div>
    </div>
  );
}
