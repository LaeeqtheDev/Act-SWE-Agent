"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clock, ChevronRight } from "lucide-react";
import type { Incident, IncidentEvent } from "@sentinelops/types";

const severityVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "secondary",
  medium: "default",
  high: "destructive",
  critical: "destructive",
};

const severityBorder: Record<string, string> = {
  low: "border-l-slate-400",
  medium: "border-l-blue-500",
  high: "border-l-red-500",
  critical: "border-l-red-600",
};

export function IncidentsSection({ incidents, apiUrl }: { incidents: Incident[]; apiUrl: string }) {
  const [selected, setSelected] = useState<Incident | null>(null);
  const [events, setEvents] = useState<IncidentEvent[]>([]);
  const [resolving, setResolving] = useState(false);

  async function openIncident(incident: Incident) {
    setSelected(incident);
    const res = await fetch(`${apiUrl}/incidents/${incident.id}/events`);
    setEvents(await res.json());
  }

  async function resolveIncident() {
    if (!selected) return;
    setResolving(true);
    await fetch(`${apiUrl}/incidents/${selected.id}/resolve`, { method: "POST" });
    setResolving(false);
    setSelected(null);
    window.location.reload();
  }

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Incidents</h2>
      <div className="space-y-2">
        {incidents.map((incident) => (
          <Card
            key={incident.id}
            className={`cursor-pointer hover:bg-muted/50 transition-colors border-l-4 ${severityBorder[incident.severity]}`}
            onClick={() => openIncident(incident)}
          >
            <CardContent className="flex justify-between items-center p-4">
              <div>
                <p className="font-medium">{incident.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{incident.id.slice(0, 8)}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={severityVariant[incident.severity]} className="uppercase">
                  {incident.severity}
                </Badge>
                <span className="text-xs text-muted-foreground uppercase w-24 text-right">{incident.status}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-1 mt-2">
                {events.map((event, i) => (
                  <div key={event.id} className="flex gap-3 text-sm py-2 border-l-2 border-muted pl-3 relative">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <span className="text-muted-foreground text-xs">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                      <p>{event.message}</p>
                    </div>
                  </div>
                ))}
                {events.length === 0 && (
                  <p className="text-sm text-muted-foreground">No timeline events recorded.</p>
                )}
              </div>
              {selected.status !== "resolved" && (
                <Button onClick={resolveIncident} disabled={resolving} className="mt-4">
                  {resolving ? "Resolving..." : "Mark Resolved"}
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}