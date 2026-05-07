# syntax=docker/dockerfile:1
# Build context: raíz del monorepo ("/").
# Railway: Root Directory = "/", Dockerfile = "apps/backend/Dockerfile".

FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ── 1. installer ───────────────────────────────────────────────────────────────
# Workspace completo con lockfile frozen.
# El patch de @expo/metro-config se aplica aquí, donde la dependencia existe.
# Es el único stage que necesita el directorio patches/.
FROM base AS installer
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY patches/ ./patches/
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/ui/package.json ./packages/ui/
COPY apps/backend/package.json ./apps/backend/
RUN pnpm install --frozen-lockfile

# ── 2. builder ─────────────────────────────────────────────────────────────────
# Compila el backend sobre el workspace ya instalado.
FROM installer AS builder
WORKDIR /app
COPY packages/ ./packages/
COPY apps/backend/ ./apps/backend/
WORKDIR /app/apps/backend
RUN pnpm exec prisma generate
RUN pnpm exec nest build

# ── 3. deployer ────────────────────────────────────────────────────────────────
# Extrae las deps de producción del backend en /standalone.
# pnpm deploy falla con ERR_PNPM_UNUSED_PATCH si encuentra patchedDependencies del
# root que no corresponden al filtro @menyu/api. Se eliminan antes de correr deploy
# porque son una config del cliente: este es el único lugar que necesita saberlo.
FROM builder AS deployer
WORKDIR /app
RUN node -e " \
  const fs = require('fs'); \
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); \
  delete pkg.pnpm.patchedDependencies; \
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2)); \
"
RUN pnpm --filter @menyu/api deploy --prod --legacy /standalone
COPY --from=builder /app/apps/backend/dist /standalone/dist
COPY --from=builder /app/apps/backend/prisma /standalone/prisma

# ── 4. runner ──────────────────────────────────────────────────────────────────
# Imagen final mínima. Solo copia el standalone del deployer.
# No sabe nada del monorepo, Expo, patches ni devDependencies.
FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deployer /standalone ./
RUN ./node_modules/.bin/prisma generate
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/health || exit 1
EXPOSE 3000
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/main"]
