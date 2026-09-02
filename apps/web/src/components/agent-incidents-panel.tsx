"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check } from "lucide-react";

interface AgentIncident {
  id: string;
  toolName: string;
  message: string;
  severity: string;
  status: string;
  createdAt: string;
}

const severityVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "secondary",
  medium: "default",
  high: "destructive",
};

// Real, live self-monitoring — the agent's own actual tool failures during
// real chat/investigation sessions, not the simulated payments-api/orders-api
// scenarios below. This is what "the agent notices its own session has a
// problem" actually looks like.
export function AgentIncidentsPanel({ apiUrl }: { apiUrl: string }) {
  const [incidents, setIncidents] = useState<AgentIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`${apiUrl}/agent-incidents`, { cache: "no-store" });
    const data = await res.json();
    setIncidents(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function resolve(id: string) {
    setBusyId(id);
    await fetch(`${apiUrl}/agent-incidents/${id}/resolve`, { method: "POST" });
    await load();
    setBusyId(null);
  }

  if (loading) return null;

  const open = incidents.filter((i) => i.status === "open");

  if (open.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No live issues — every real tool call the agent has made recently succeeded.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {open.map((i) => (
        <Card key={i.id}>
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-start gap-3 min-w-0">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm truncate">{i.message}</p>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{i.toolName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={severityVariant[i.severity]} className="uppercase">
                {i.severity}
              </Badge>
              <Button size="sm" variant="outline" disabled={busyId === i.id} onClick={() => resolve(i.id)}>
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
