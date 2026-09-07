# Playwright's official image, NOT node:alpine. Alpine uses musl libc and
# ships no browser — Chromium needs glibc plus a long list of system
# libraries. On alpine every browser tool fails at runtime, which is the
# entire product. This image has Chromium and its dependencies preinstalled
# and version-matched to the Playwright package.
FROM mcr.microsoft.com/playwright:v1.49.0-jammy AS base

WORKDIR /app
ENV CI=true

# Dependency manifests first, so a source change doesn't invalidate the
# install layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/

RUN npm install -g pnpm@9 \
  && pnpm config set fetch-timeout 300000 \
  && pnpm install --frozen-lockfile --filter api... --filter @sentinelops/types

COPY . .

WORKDIR /app/apps/api
# Prisma generate needs a DATABASE_URL present but never connects at build
# time — the real one is injected at runtime.
ENV DATABASE_URL="postgresql://placeholder:placeholder@placeholder:5432/placeholder"
RUN pnpm exec prisma generate

# Browser automation on a server has no display. Xvfb gives Chromium a
# virtual one, which means headed mode (and everything that depends on it)
# still works in a container.
ENV BROWSER_HEADLESS="true"
ENV NODE_ENV="production"

EXPOSE 4000

# Container-level healthcheck so the orchestrator can tell a hung process
# from a healthy one and restart it. Without this ECS keeps routing traffic
# to a dead container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "dev"]
