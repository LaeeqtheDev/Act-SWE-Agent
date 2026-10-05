FROM node:24-alpine AS builder
WORKDIR /app
ENV CI=true

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/
RUN npm install -g pnpm@11.23.0 \
  && pnpm config set fetch-timeout 300000 \
  && pnpm install --frozen-lockfile --filter web... --filter @sentinelops/types

COPY . .
WORKDIR /app/apps/web

# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so
# they must be passed as build args, not runtime env.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_HOSTED_MODE=false
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_HOSTED_MODE=$NEXT_PUBLIC_HOSTED_MODE \
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
RUN pnpm exec next build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "exec", "next", "start"]
