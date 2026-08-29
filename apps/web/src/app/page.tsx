import { mockServices, mockIncidents } from "@/lib/mock-data";
import type { Service } from "@sentinelops/types";

export default function Home() {
  return (
    <main className="p-8 space-y-8">
      <h1 className="text-2xl font-bold">Act</h1>

      <section>
        <h2 className="text-lg font-semibold mb-3">Services</h2>
        <div className="grid grid-cols-2 gap-4">
          {mockServices.map((service) => (
            <div key={service.id} className="border rounded-lg p-4 flex justify-between items-center">
              <span className="font-medium">{service.name}</span>
              <span className={`text-sm ${service.status === "healthy" ? "text-green-600" : "text-amber-600"}`}>
                ● {service.status}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Incidents</h2>
        <div className="space-y-2">
          {mockIncidents.map((incident) => (
            <div key={incident.id} className="border rounded-lg p-3 flex justify-between items-center">
              <span>{incident.id} — {incident.title}</span>
              <span className="text-sm uppercase text-gray-500">{incident.severity} · {incident.status}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}