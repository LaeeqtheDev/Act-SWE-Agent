"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Incident, IncidentEvent } from "@sentinelops/types";

const severityVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "secondary",
  medium: "default",
  high: "destructive",
  critical: "destructive",
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
      <div className="space-y-3">
        {incidents.map((incident) => (
          <Card
            key={incident.id}
            className="cursor-pointer hover:border-foreground/30 transition-colors"
            onClick={() => openIncident(incident)}
          >
            <CardContent className="flex justify-between items-center p-4">
              <span>
                <span className="text-muted-foreground">{incident.id.slice(0, 8)}</span> — {incident.title}
              </span>
              <div className="flex gap-2 items-center">
                <Badge variant={severityVariant[incident.severity]}>{incident.severity}</Badge>
                <span className="text-sm text-muted-foreground uppercase">{incident.status}</span>
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
              <div className="space-y-3 mt-2">
                {events.map((event) => (
                  <div key={event.id} className="flex gap-3 text-sm">
                    <span className="text-muted-foreground w-20 shrink-0">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                    <span>{event.message}</span>
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