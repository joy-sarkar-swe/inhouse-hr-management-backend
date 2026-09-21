# ─────────────────────────────────────────────────────────────────────────────
# Dockerfile — Production multi-stage build for NestJS + Prisma
#
# Stages:
#   deps          All npm dependencies (devDependencies included for build)
#   build         Prisma generate + NestJS compile
#   prod-deps     Production-only npm dependencies
#   runner        Minimal runtime — dist, prisma schema, prod node_modules
#
# Single process — the HTTP API and the BullMQ email queue workers both run
# inside dist/main (EmailModule's workers start wherever EmailModule is
# imported). There is no separate worker entrypoint to build or deploy.
#
# Build:
#   docker build -t your-registry/nest-auth-template:latest .
#
# Run:
#   docker run -p 8080:8080 your-registry/nest-auth-template:latest
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: dependencies (all including devDependencies) ─────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package*.json ./

RUN npm ci

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY . .

RUN npx prisma generate

RUN npm run build

# ── Stage 3: production dependencies only ─────────────────────────────────────
FROM node:20-alpine AS prod-deps

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

# ── Stage 4: runner (minimal runtime) ─────────────────────────────────────────
FROM node:20-alpine AS runner

RUN addgroup -S nodejs && adduser -S nestjs -G nodejs

RUN apk add --no-cache wget

WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/prisma/schemas ./prisma/schemas

USER nestjs

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["node", "dist/main"]
