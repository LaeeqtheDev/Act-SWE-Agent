FROM node:24-alpine AS base
WORKDIR /app

COPY . .
ENV CI=true
RUN npm install -g pnpm && pnpm config set fetch-timeout 300000 && pnpm config set network-concurrency 1 && pnpm install --frozen-lockfile

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node_modules/.bin/next", "dev"]