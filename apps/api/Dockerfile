FROM node:24-alpine AS base
WORKDIR /app

COPY . .
ENV CI=true
RUN npm install -g pnpm && pnpm config set fetch-timeout 300000 && pnpm config set network-concurrency 1 && pnpm install --frozen-lockfile

WORKDIR /app/apps/api
ENV DATABASE_URL="postgresql://placeholder:placeholder@placeholder:5432/placeholder"
RUN pnpm exec prisma generate

EXPOSE 4000
CMD ["pnpm", "dev"]