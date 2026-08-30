"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, Check, X, Lock } from "lucide-react";

interface ActivityAction {
  id: string;
  type: string;
  status: string;
  summary: string | null;
  createdAt: string;
  incident?: { title: string; service?: { name: string } } | null;
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  approved: "default",
  rejected: "destructive",
  completed: "secondary",
};

// Shows what the AGENT has actually been doing — proposed/completed actions
// from every incident investigation and every chat conversation — not just
// the simulator's synthetic per-service blips. This is the dashboard's
// "what is the agent up to" view, separate from the raw incident list below it.
export function AgentActivity({ apiUrl }: { apiUrl: string }) {
  const [actions, setActions] = useState<ActivityAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`${apiUrl}/actions`, { cache: "no-store" });
    setActions(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function act(id: string, decision: "approve" | "reject") {
    setBusyId(id);
    await fetch(`${apiUrl}/actions/${id}/${decision}`, { method: "POST" });
    await load();
    setBusyId(null);
  }

  if (loading) return null;
  if (actions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No agent activity yet — ask the agent something in chat, or investigate an incident below.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {actions.map((a) => (
        <Card key={a.id}>
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-start gap-3 min-w-0">
              <Bot className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm truncate">{a.summary ?? a.type}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {a.incident ? `${a.incident.service?.name} — ${a.incident.title}` : "from chat"} · {a.type}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={statusVariant[a.status]} className="uppercase">
                {a.status}
              </Badge>
              {a.status === "pending" && (
                <>
                  <Button size="sm" variant="outline" disabled={busyId === a.id} onClick={() => act(a.id, "approve")}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busyId === a.id} onClick={() => act(a.id, "reject")}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              {a.status === "pending" && <Lock className="h-3 w-3 text-amber-500" aria-label="needs approval" />}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
