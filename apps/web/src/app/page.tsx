"use client";

import { useState } from "react";
import { mockServices, mockIncidents, mockEvents } from "@/lib/mock-data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Incident } from "@sentinelops/types";

const statusColor: Record<string, string> = {
  healthy: "bg-green-600",
  degraded: "bg-amber-600",
  down: "bg-red-600",
};

const severityVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "secondary",
  medium: "default",
  high: "destructive",
  critical: "destructive",
};

export default function Home() {
  const [selected, setSelected] = useState<Incident | null>(null);

  const timelineFor = (incidentId: string) =>
    mockEvents
      .filter((e) => e.incidentId === incidentId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return (
    <main className="p-8 space-y-10 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold">SentinelOps</h1>

      <section>
        <h2 className="text-lg font-semibold mb-3">Services</h2>
        <div className="grid grid-cols-2 gap-4">
          {mockServices.map((service) => (
            <Card key={service.id}>
              <CardContent className="flex justify-between items-center p-4">
                <span className="font-medium">{service.name}</span>
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${statusColor[service.status]}`} />
                  {service.status}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Incidents</h2>
        <div className="space-y-3">
          {mockIncidents.map((incident) => (
            <Card
              key={incident.id}
              className="cursor-pointer hover:border-foreground/30 transition-colors"
              onClick={() => setSelected(incident)}
            >
              <CardContent className="flex justify-between items-center p-4">
                <span>
                  <span className="text-muted-foreground">{incident.id}</span> — {incident.title}
                </span>
                <div className="flex gap-2 items-center">
                  <Badge variant={severityVariant[incident.severity]}>{incident.severity}</Badge>
                  <span className="text-sm text-muted-foreground uppercase">{incident.status}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {selected.id} — {selected.title}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                {timelineFor(selected.id).map((event) => (
                  <div key={event.id} className="flex gap-3 text-sm">
                    <span className="text-muted-foreground w-20 shrink-0">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                    <span>{event.message}</span>
                  </div>
                ))}
                {timelineFor(selected.id).length === 0 && (
                  <p className="text-sm text-muted-foreground">No timeline events recorded.</p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}