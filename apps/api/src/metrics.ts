import client from "prom-client";
import type express from "express";

// Real Prometheus metrics — the observability config in /observability was
// scaffolded a while back with nothing behind it. This is what actually
// emits data for it to graph.

const register = new client.Registry();
client.collectDefaultMetrics({ register }); // process CPU, memory, event loop lag, etc. for free

export const httpRequestsTotal = new client.Counter({
  name: "act_swe_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [register],
});

export const httpRequestDuration = new client.Histogram({
  name: "act_swe_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const toolCallsTotal = new client.Counter({
  name: "act_swe_tool_calls_total",
  help: "Total agent tool calls",
  labelNames: ["tool", "outcome"], // outcome: success | error
  registers: [register],
});

export const chatMessagesTotal = new client.Counter({
  name: "act_swe_chat_messages_total",
  help: "Total chat messages processed",
  registers: [register],
});

export const agentActionsTotal = new client.Counter({
  name: "act_swe_agent_actions_total",
  help: "Total agent actions by type and status",
  labelNames: ["type", "status"],
  registers: [register],
});

export const workflowRunsTotal = new client.Counter({
  name: "act_swe_workflow_runs_total",
  help: "Total scheduled workflow runs",
  labelNames: ["status"], // completed | failed
  registers: [register],
});

// Express middleware — records every request's method/route/status and
// timing. Registered once, near the top of index.ts, before routes.
export function metricsMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    // req.route is only set once Express matches a route; fall back to the
    // raw path for 404s so those still get counted somewhere.
    const route = req.route?.path ?? req.path;
    const labels = { method: req.method, route, status: String(res.statusCode) };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, durationSeconds);
  });
  next();
}

export async function renderMetrics(): Promise<string> {
  return register.metrics();
}

export const metricsContentType = register.contentType;
