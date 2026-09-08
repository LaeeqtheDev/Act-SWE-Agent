"use client";

import { useEffect, useState } from "react";
import { Check, X, Loader2, Lock } from "lucide-react";

interface ProposedAction {
  actionId: string;
  status?: string;
}

// Renders right where a proposeAction tool call happened in the chat — this
// is the whole fix for "why doesn't approving continue the conversation":
// previously the only way to approve was navigating away to the dashboard,
// which broke the thread. Now it's a button right here, and deciding
// automatically sends a short follow-up so the agent picks up immediately
// instead of the chat going quiet.
export function ProposedActionCard({
  action,
  apiUrl,
  authHeaders,
  onDecided,
}: {
  action: ProposedAction;
  apiUrl: string;
  authHeaders: () => Promise<Record<string, string>>;
  onDecided: (decision: "approved" | "rejected") => void;
}) {
  const [deciding, setDeciding] = useState<"approved" | "rejected" | null>(null);
  // Seeded from the action's REAL status, not just local state. Approving
  // then reloading (or scrolling back to an older message) re-rendered a
  // fresh card that was clickable again — so the same action could be
  // approved twice, and already-decided actions from earlier in the
  // conversation still showed live buttons.
  const [done, setDone] = useState<"approved" | "rejected" | null>(
    action.status === "approved" || action.status === "rejected" ? action.status : null
  );

  // Confirm against the server on mount — the status embedded in the tool
  // result is a snapshot from when it was proposed, so an action approved
  // from the dashboard (or in another tab) would still look pending here.
  useEffect(() => {
    if (done) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/actions/${action.actionId}`, { headers: await authHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && (data.status === "approved" || data.status === "rejected")) setDone(data.status);
      } catch {
        // status check is best-effort — never block the buttons on it
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.actionId]);

  async function decide(decision: "approved" | "rejected") {
    setDeciding(decision);
    try {
      await fetch(`${apiUrl}/actions/${action.actionId}/${decision}`, {
        method: "POST",
        headers: await authHeaders(),
      });
      setDone(decision);
      onDecided(decision);
    } finally {
      setDeciding(null);
    }
  }

  if (done) {
    return (
      <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground border rounded-md px-3 py-1.5">
        {done === "approved" ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
        {done === "approved" ? "Approved and executed" : "Rejected"}
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2 border rounded-md px-3 py-2">
      <Lock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
      <span className="text-xs text-muted-foreground flex-1">Waiting on your approval to run this.</span>
      <button
        onClick={() => decide("approved")}
        disabled={!!deciding}
        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border hover:bg-muted/50 transition-colors"
      >
        {deciding === "approved" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        Approve
      </button>
      <button
        onClick={() => decide("rejected")}
        disabled={!!deciding}
        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border hover:bg-muted/50 transition-colors text-destructive"
      >
        {deciding === "rejected" ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
        Reject
      </button>
    </div>
  );
}
