# syntax=docker/dockerfile:1
# Build context: monorepo root ("/").
# Railway: Root Directory = "/", Dockerfile = "apps/backend/Dockerfile".

FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ── 1. Instalar deps del workspace (capa cacheada: solo se reinicia si cambian los manifests) ──
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY patches/ ./patches/
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY apps/backend/package.json ./apps/backend/
RUN pnpm install --frozen-lockfile

# ── 2. Compilar el backend ──────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app
COPY packages/ ./packages/
COPY apps/backend/ ./apps/backend/
WORKDIR /app/apps/backend
RUN pnpm exec prisma generate
RUN pnpm exec nest build

# ── 3. Extraer deps de producción con pnpm deploy (node_modules plano, sin symlinks) ──
FROM builder AS deployer
WORKDIR /app
RUN pnpm --filter @menyu/api deploy --prod --legacy /standalone
COPY --from=builder /app/apps/backend/dist /standalone/dist
COPY --from=builder /app/apps/backend/prisma /standalone/prisma

# ── 4. Imagen de producción mínima ─────────────────────────────────────────
FROM node:20-alpine AS runner
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deployer /standalone ./
RUN ./node_modules/.bin/prisma generate
EXPOSE 3000
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/main"]
