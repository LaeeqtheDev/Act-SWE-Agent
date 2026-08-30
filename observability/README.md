# Observability stack (Sprint 11)

Not started by default. Bring it up alongside the app with:

```bash
docker compose --profile observability up -d
```

- **Prometheus:** http://localhost:9090 — scrapes `/metrics` on the API (see "What's left to do" below)
- **Grafana:** http://localhost:3001 — login `admin` / `admin`, add Prometheus (`http://prometheus:9090`) as a data source
- **OTel Collector:** receives OTLP traces/metrics on `4317` (gRPC) / `4318` (HTTP)

## What's left to do (on your end)

The collector and dashboards are scaffolded, but the API doesn't emit metrics yet.
To finish this sprint:

1. `pnpm add @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node --filter api`
2. Add an OTel SDK bootstrap file (`apps/api/src/otel.ts`) that's imported first in `index.ts`, pointed at
   `http://otel-collector:4317`
3. Add a `prom-client`-based `/metrics` endpoint to the Express app (request counts, incident counts, queue depth)
4. Import a dashboard JSON into Grafana, or build one against the `sentinelops-api` Prometheus job

This is deliberately left as a next step rather than guessed at blind, since metric
names and dashboards are usually iterated on live against real data.
