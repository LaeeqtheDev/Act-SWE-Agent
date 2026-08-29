import { IncidentsSection } from "@/components/incidents-section";
import { Card, CardContent } from "@/components/ui/card";
import type { Service, Incident } from "@sentinelops/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const statusColor: Record<string, string> = {
  healthy: "bg-green-600",
  degraded: "bg-amber-600",
  down: "bg-red-600",
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

  return (
    <main className="p-8 space-y-10 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold">SentinelOps</h1>

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

      <IncidentsSection incidents={incidents} apiUrl={API_URL} />
    </main>
  );
}