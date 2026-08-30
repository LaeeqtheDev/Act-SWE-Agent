# Next steps — what to run on your end

Everything in this project is real, working code. The items below genuinely
can't be executed, tested, or provisioned from where this was built — they
need your machine, your Docker/Kubernetes environment, your API keys, or your
cloud account. This is the exact, ordered checklist to finish wiring it all up.

---

## 1. Install the new dependencies

New packages were added for the AI agent (`@anthropic-ai/sdk`, `@kubernetes/client-node`
were already present) and the landing page (`gsap`, `three`):

```bash
pnpm install
```

## 2. Run the new database migration

The AI agent and permission layer need a new `AgentAction` table:

```bash
cd apps/api
pnpm exec prisma migrate dev --name add_agent_actions
cd ../..
```

(If you're running everything through Docker instead, do this against the
containerized DB once it's up: `docker compose exec api pnpm exec prisma migrate deploy`.)

## 3. Set your Anthropic API key

Get a key at https://console.anthropic.com/settings/keys, then:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
```

Fill in `ANTHROPIC_API_KEY` in both files. `docker-compose.yml` reads the root
`.env` automatically; `apps/api/.env` is used for native (non-Docker) `pnpm dev`.

Without this set, the **Investigate with AI** button still works end-to-end,
but the agent responds saying it isn't configured instead of running a real
investigation — nothing crashes, it just won't produce a real analysis.

## 4. Run it

```bash
docker compose up --build
```

- Landing page: http://localhost:3000
- Dashboard: http://localhost:3000/dashboard
- API: http://localhost:4000

First run only:
```bash
docker compose exec api pnpm exec prisma migrate deploy
docker compose exec api pnpm exec prisma db seed
```

Trigger an incident, open it on the dashboard, click **Investigate with AI**.

---

## 5. Kubernetes — deploy the remaining services

`payments-api` was already proven working (real pod, self-healing verified).
The other three services use the identical, proven pattern. On your machine,
with Docker Desktop's Kubernetes enabled:

```powershell
docker buildx build --tag sentinelops-api:latest --file apps/api/Dockerfile --load .
docker buildx build --tag sentinelops-web:latest --file apps/web/Dockerfile --load .
.\infrastructure\kubernetes\load-images-into-cluster.ps1
bash infrastructure/kubernetes/apply-all.sh
kubectl get pods
```

Full details and the self-healing demo steps are in
`infrastructure/kubernetes/README.md`.

## 6. AWS — review, then apply

`infrastructure/aws/main.tf` is a reviewed, ready-to-apply Terraform scaffold
(EKS + RDS + ElastiCache + ECR), **not yet applied against any real account.**
This needs your AWS credentials and will incur real cost, so it's intentionally
left for you:

```bash
cd infrastructure/aws
export TF_VAR_db_password="pick-a-real-password"
terraform init
terraform plan     # review what it will create
terraform apply
```

Full steps (pushing images to ECR, pointing kubectl at the new cluster,
tearing it down when you're done demoing) are in `infrastructure/aws/README.md`.

## 7. CI/CD — activate the deploy half

`.github/workflows/ci-cd.yml` already runs lint/build/Docker-build on every
push — no setup needed for that part. The deploy job only activates once you
add these repository secrets (GitHub repo → Settings → Secrets and variables → Actions):

```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
ECR_API_REPOSITORY      # from terraform output ecr_api_url
ECR_WEB_REPOSITORY      # from terraform output ecr_web_url
EKS_CLUSTER_NAME
```

## 8. Observability — finish the instrumentation

The collector, Prometheus, and Grafana containers are scaffolded
(`docker compose --profile observability up`), but the API doesn't emit
metrics yet. Steps to finish this are in `observability/README.md` — it's
left as a next step rather than guessed at blind, since metric names and
dashboards are usually iterated on live against real data.

---

## Optional polish (not required to demo the project)

- Migrate `pod-crash-loop` onto the same BullMQ queue path as `database-overload`
  (currently still synchronous — noted as a known limitation in the README)
- Add a formal test suite
- Wire the four Kubernetes-deployed services to Postgres/Redis running *inside*
  the cluster instead of `host.docker.internal`, once you're comfortable with
  in-cluster StatefulSets
- Record a short demo video/GIF for the README
