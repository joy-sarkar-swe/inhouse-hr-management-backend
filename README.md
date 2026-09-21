# NestJS Auth Template

A lean, production-grade NestJS starter with email/password authentication,
user profiles, transactional email, and health checks — built on hardened
infrastructure (Redis caching, Bloom filters, multi-layer rate limiting,
circuit breakers) with multi-schema Prisma support.

## What's included

- **Auth** — register, email OTP verification, login, JWT sessions (access +
  refresh, Redis-backed, rotated on refresh), logout / logout-all,
  forgot-password (OTP → single-use reset token → reset), change-password,
  change-email (OTP-verified).
- **User** — self-service profile (get/update name, avatar upload/remove via
  GCP Cloud Storage with magic-bytes MIME + decompression-bomb validation).
- **Email** — BullMQ-backed transactional email (general queue + an isolated
  auth/OTP queue so a bulk-email backlog can never delay a verification code),
  circuit-breaker-wrapped SMTP client.
- **Health** — `GET /health` liveness/readiness probe, `GET /metrics`
  Prometheus scrape endpoint.

## Infrastructure kept from the source system

- **Redis** — isolated DB-per-concern (auth sessions, throttle counters,
  two email queues, signed-URL/L2 cache) so a backlog in one never evicts
  another. See `src/common/redis/redis.client.ts`.
- **Bloom filter** — guards user-ID lookups so a request for a
  non-existent/deleted ID never reaches Postgres. Rebuilt on a schedule
  (`src/common/cache/bloom-rebuild.service.ts`) and kept in sync incrementally
  on every create.
- **Multi-layer rate limiting** — sliding-window counters (Lua script, atomic)
  per IP+UA+device *and* per identity (email / userId) on every sensitive
  auth route, plus a generic authenticated-user and public-API guard for
  anything you add later. See `src/common/throttles/`.
- **Circuit breakers** (`opossum`) — wrap the SMTP client and GCS calls so a
  slow/down upstream degrades instead of hanging requests.
- **L1 (in-process) + L2 (Redis) cache** — read-through cache in front of
  Postgres reads, versioned so a config change can bust all cached keys at
  once.

## Stack

NestJS 11 (Fastify) · TypeScript · PostgreSQL + Prisma 6 · Redis (ioredis) ·
BullMQ · Passport JWT · GCP Cloud Storage · Nodemailer · Prometheus
(`prom-client`) · Swagger/OpenAPI.

## Getting Started & Installation Setup

### Quick Start (One Command Setup)

To set up the entire development environment automatically:

```bash
# 1. Environment configuration
cp .env.example .env

# 2. Complete Automated Setup
npm run setup

# 3. Start development server
npm run start:dev
```

### What `npm run setup` does automatically:

1. **Launches Infrastructure**: Spins up background PostgreSQL 16 & Redis 7.4 containers via Docker Compose (`dev.docker-compose.yml`).
2. **Installs Dependencies**: Runs clean `npm install`.
3. **Generates Prisma Client**: Builds `@prisma/client` using the centralized `prisma.config.ts`.
4. **Applies Database Migrations**: Runs `prisma migrate dev` against PostgreSQL.
5. **Seeds Initial Dev Data**: Automatically populates 3 dev accounts (Admin, Shop Owner, Customer).

### Default Seed Accounts

When setup completes, the following dev accounts are ready to use (password for all: `12345678`):

- **ADMIN**: `admin@example.com`
- **SHOP_OWNER**: `shopowner@example.com`
- **CUSTOMER**: `customer@example.com`

Swagger API Documentation is served at **http://localhost:8080/api-doc** once the app is running.

---

## Running with Docker

### Development (Hot-Reload)

```bash
# Starts Postgres + Redis + API with hot-reload and automatic migration deployment
npm run docker:dev:up

# View logs
npm run docker:dev:logs

# Stop containers
npm run docker:dev:down
```

### Production

```bash
# Multi-stage production container build & spin up
npm run docker:prod:up

# View production logs
npm run docker:prod:logs

# Stop production containers
npm run docker:prod:down
```

Both compose files run Postgres, Redis, and the single API process — the API
container executes both the HTTP server and the BullMQ email workers in the
same process (see `src/app.module.ts`).

---

## Prisma Schema Management

This project uses Prisma 6's schema folder feature configured via `prisma.config.ts`:

- **Configuration File**: `prisma.config.ts` specifies `schema: 'prisma/schemas'`.
- **Schema Folder**: `prisma/schemas/` holds domain schemas:
  - `base.prisma` — Datasource & generator configuration.
  - `user.prisma` — User model & `UserRole` enum.
  - `media.prisma` — Media model.

### Prisma CLI Commands

```bash
npm run prisma:generate  # Generate Prisma Client
npm run prisma:migrate   # Apply dev migrations
npm run prisma:deploy    # Deploy migrations (production/CI)
npm run prisma:seed      # Seed dev users
npm run prisma:reset     # Reset database and re-seed
npm run prisma:studio    # Open Prisma Studio web UI
```

---

## Project Structure

```
src/
  modules/
    auth-service/     # register, login, sessions, password reset, change-email
    user-service/      # profile self-service + avatar
    email-service/     # BullMQ email queues + SMTP client
    health/             # liveness probe & metrics
  common/
    redis/, cache/, throttles/, resilience/, gcp-storage/, file-upload/
    decorators/, dto/, filter/, interceptor/, pipes/, metrics/, lifecycle/
  shared/
    config/app.config.ts   # every env var, read once, frozen at startup
    prisma/, interfaces/
prisma/
  config.ts           # Centralized Prisma 6 configuration
  schemas/            # Multi-file schemas (base.prisma, user.prisma, media.prisma)
```

## Testing

```bash
npm run test        # unit tests
npm run test:e2e     # e2e tests (health + metrics)
npm run test:cov     # coverage
```

## Extending this Template

- **New feature module**: follow the `user-service` pattern: `dao/` for Prisma queries, a service for orchestration, DTOs split into `validation/error/success`.
- **New Prisma domain**: Add `prisma/schemas/<domain>.prisma` and run `npm run prisma:generate`.
- **New Redis-backed queue**: Add a DB index in `app.config.ts` + `redis.client.ts`, register queue teardown in `common/lifecycle/queue-lifecycle.service.ts`.
- **New rate-limited route**: Add constants to `common/throttles/config/throttle.config.ts` and a guard following `common/throttles/auth/login-throttle.guard.ts`.
