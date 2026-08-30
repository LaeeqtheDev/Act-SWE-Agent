# Kubernetes manifests (Sprint 5/6)

## What's here

- `payments-api-deployment.yaml` — the proven, working deployment (built and verified
  during the original session: pod runs, connects to Postgres + Redis via
  `host.docker.internal`, and Kubernetes self-heals it if the pod is deleted).
- `orders-api-deployment.yaml`, `auth-api-deployment.yaml`, `notification-api-deployment.yaml`
  — the same pattern applied to the other three services.
- `services.yaml` — a stable in-cluster network address for each deployment.
- `load-images-into-cluster.ps1` — the exact workaround this session discovered for
  getting locally-built images visible to Docker Desktop's Kubernetes (containerd
  image store isolation). Run this after every `docker build`/`docker buildx build`.
- `apply-all.sh` — applies every manifest in one command.

## What's left to do (on your end)

This can't be run or verified from here — it needs your actual Docker Desktop +
Kubernetes environment. Steps, in order:

1. Make sure Docker Desktop's Kubernetes is enabled (Settings → Kubernetes → Enable).
2. Build the images:
   ```powershell
   docker buildx build --tag sentinelops-api:latest --file apps/api/Dockerfile --load .
   docker buildx build --tag sentinelops-web:latest --file apps/web/Dockerfile --load .
   ```
3. Load them into the cluster:
   ```powershell
   .\infrastructure\kubernetes\load-images-into-cluster.ps1
   ```
4. Apply everything:
   ```bash
   bash infrastructure/kubernetes/apply-all.sh
   ```
5. Verify:
   ```powershell
   kubectl get pods
   kubectl get services
   kubectl logs -l app=payments-api
   ```
   All four services should reach `1/1 Running` and their logs should show
   `API running on http://localhost:4000` with no `ECONNREFUSED` errors.

6. **Self-healing demo** (good for interviews): delete a pod on purpose and watch
   Kubernetes replace it automatically —
   ```powershell
   kubectl delete pod <pod-name>
   kubectl get pods
   ```

## Known limitation

All four services currently point at your **host's** Postgres/Redis via
`host.docker.internal`, not services running inside the cluster. That's fine for a
local demo, but a "real" setup would run Postgres/Redis as their own Kubernetes
Deployments (or use a managed service once on AWS in Sprint 9). Left as-is here to
keep this sprint's scope to "get real pods running and self-healing," which is
proven and working.
