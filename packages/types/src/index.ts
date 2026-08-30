export type ServiceStatus = "healthy" | "degraded" | "down";

export interface Service {
  id: string;
  name: string;
  status: ServiceStatus;
  createdAt: string;
  updatedAt: string;
}

export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "open" | "investigating" | "resolved";

export interface Incident {
  id: string;
  serviceId: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  errorRate?: number;
  createdAt: string;
  resolvedAt?: string;
}

export interface DeploymentRecord {
  id: string;
  serviceId: string;
  version: string;
  deployedAt: string;
}

export interface IncidentEvent {
  id: string;
  incidentId: string;
  message: string;
  timestamp: string;
}
export type AgentActionType = "investigation" | "rollback" | "restart_pod" | "scale" | "browser_action" | "file_edit" | "shell_command";
export type AgentActionStatus = "pending" | "approved" | "rejected" | "completed";

export interface AgentAction {
  id: string;
  incidentId: string;
  type: AgentActionType;
  status: AgentActionStatus;
  summary?: string;
  confidence?: number;
  evidence?: unknown;
  createdAt: string;
  resolvedAt?: string;
}
