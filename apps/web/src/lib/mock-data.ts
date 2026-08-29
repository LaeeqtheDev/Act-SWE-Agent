import type { Service, Incident, IncidentEvent } from "@sentinelops/types";

export const mockServices: Service[] = [
  { id: "svc-1", name: "payments-api", status: "healthy", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-08-29T00:00:00Z" },
  { id: "svc-2", name: "orders-api", status: "healthy", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-08-29T00:00:00Z" },
  { id: "svc-3", name: "auth-api", status: "healthy", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-08-29T00:00:00Z" },
  { id: "svc-4", name: "notification-api", status: "degraded", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-08-29T00:00:00Z" },
];

export const mockIncidents: Incident[] = [
  { id: "inc-1042", serviceId: "svc-1", title: "Database connection exhaustion", severity: "high", status: "investigating", errorRate: 18.4, createdAt: "2026-08-29T14:02:31Z" },
  { id: "inc-1041", serviceId: "svc-2", title: "Pod crash loop", severity: "medium", status: "resolved", createdAt: "2026-08-28T09:15:00Z", resolvedAt: "2026-08-28T09:22:00Z" },
  { id: "inc-1040", serviceId: "svc-4", title: "API latency spike", severity: "low", status: "resolved", createdAt: "2026-08-27T11:00:00Z", resolvedAt: "2026-08-27T11:10:00Z" },
];

export const mockEvents: IncidentEvent[] = [
  { id: "evt-1", incidentId: "inc-1042", message: "Deployment v43 started", timestamp: "2026-08-29T14:02:31Z" },
  { id: "evt-2", incidentId: "inc-1042", message: "Database connections +38%", timestamp: "2026-08-29T14:02:44Z" },
  { id: "evt-3", incidentId: "inc-1042", message: "payments-api latency +210%", timestamp: "2026-08-29T14:02:51Z" },
  { id: "evt-4", incidentId: "inc-1042", message: "5xx rate exceeds threshold", timestamp: "2026-08-29T14:02:54Z" },
];