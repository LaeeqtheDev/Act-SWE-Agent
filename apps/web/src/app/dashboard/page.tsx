import Link from "next/link";
import { IncidentsSection } from "@/components/incidents-section";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, AlertTriangle, CheckCircle2, Server, ArrowLeft } from "lucide-react";
import type { Service, Incident } from "@sentinelops/types";

const API_URL = process.env.API_URL_INTERNAL || "http://localhost:4000";

const statusColor: Record<string, string> = {
  healthy: "bg-green-500",
  degraded: "bg-amber-500",
  down: "bg-red-500",
};

async function getServices(): Promise<Service[]> {
  const res = await fetch(`${API_URL}/services`, { cache: "no-store" });
  return res.json();
}

async function getIncidents(): Promise<Incident[]> {
  const res = await fetch(`${API_URL}/incidents`, { cache: "no-store" });
  return res.json();
}

export default async function Home() {
  const [services, incidents] = await Promise.all([getServices(), getIncidents()]);

  const openIncidents = incidents.filter((i) => i.status !== "resolved").length;
  const degradedServices = services.filter((s) => s.status !== "healthy").length;

  const stats = [
    { label: "Services", value: services.length, icon: Server, tone: "text-foreground" },
    { label: "Degraded", value: degradedServices, icon: AlertTriangle, tone: degradedServices > 0 ? "text-amber-500" : "text-muted-foreground" },
    { label: "Open Incidents", value: openIncidents, icon: Activity, tone: openIncidents > 0 ? "text-red-500" : "text-muted-foreground" },
    { label: "Resolved Today", value: incidents.length - openIncidents, icon: CheckCircle2, tone: "text-green-500" },
  ];

  return (
    <main className="min-h-screen bg-background">
      <div className="border-b">
        <div className="max-w-5xl mx-auto px-8 py-6 flex items-center justify-between">
          <div>
            <Link href="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1">
              <ArrowLeft className="h-3 w-3" /> Overview
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">SentinelOps</h1>
            <p className="text-sm text-muted-foreground mt-0.5">AI-powered incident response</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Live
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-8 space-y-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-semibold mt-1">{stat.value}</p>
                </div>
                <stat.icon className={`h-5 w-5 ${stat.tone}`} />
              </CardContent>
            </Card>
          ))}
        </div>

        <section>
          <h2 className="text-lg font-semibold mb-3">Services</h2>
          <div className="grid grid-cols-2 gap-4">
            {services.map((service) => (
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

        <IncidentsSection incidents={incidents} apiUrl={process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"} />
      </div>
    </main>
  );
}