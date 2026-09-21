# AGENTS.md — NestJS Auth Template

NestJS 11 + Fastify 5 + Prisma 6 + PostgreSQL 16 + Redis 7.4 + BullMQ.
Email/password auth + user profiles + transactional email + health checks,
built on production-grade infra (Redis, Bloom filter, multi-layer rate
limiting, circuit breakers).

## Provenance — read this before "restoring" anything

This template was carved down from a much larger multi-vendor marketplace
backend. Everything outside auth/user/email/health was deliberately removed,
including:

- **Phone/SMS auth** — the original supported email XOR phone registration
  and login via an SMS OTP provider. This template is **email-only by
  design**. `User.phone` and the SMS-related DTOs/guards/validators are gone,
  not stubbed. If you need phone auth, you're re-adding a real feature, not
  restoring dead code.
- **i18n** — the original had an `en`/`bn` message-translation layer
  (`src/common/i18n/`, a `@Lang()` decorator, an i18n-aware validation pipe).
  This template is **English-only**, with plain string constants at the top
  of each file that has user-facing messages (see `M` in `auth.service.ts`).
  Don't reintroduce a `lang` header/param without reintroducing the whole
  layer — a halfway version is worse than neither.
- **Admin user-suspension management** — the original's `user-service` had
  an `AdminUserController`/`AdminUserService` for suspending/unsuspending
  accounts, backed by a notification service (email+SMS+in-app) and an audit
  log table. That whole feature was removed because it was entangled with
  infrastructure this template doesn't have. What's left: `User.is_suspended`
  is still a real column, and `AuthService.login` still checks it — so
  suspension *works* if something sets the flag, there's just no admin UI to
  set it from. Build that as a real feature when you need one, backed by
  whatever notification approach fits your project — don't try to resurrect
  the old queue-based one piecemeal.
- **Everything else** (products, shops, orders, reviews, chat, AI assistant,
  subscriptions, admin dashboard, analytics, notifications, site settings,
  SMS, locations, Cloudinary, Socket.IO, the separate worker process) — gone
  entirely, including their Prisma models, env vars, and Redis DB
  allocations.

If you're an agent picking up a task in this repo and a request implies one
of the above ("add phone login", "translate this to Bangla", "let admins
suspend users"), treat it as new feature work, not a bug fix — plan
accordingly rather than assuming there's a removed implementation to restore.

## Entrypoints

- **`src/main.ts`** — the only entrypoint. HTTP API (Fastify) *and* the
  BullMQ email workers run in this one process — `EmailModule`'s workers
  start wherever `EmailModule` is imported, and it's imported directly into
  `AppModule`. There is no `worker.ts` / separate worker process in this
  template. If you split workers out again later, follow the pattern the
  original system used: a second `ApplicationContext` entrypoint that
  imports only the modules whose queues need to run there, plus updating
  `docker-compose.yml` and `Dockerfile` to build/run it as a second service.

## Commands

| Context | Command | Notes |
|---|---|---|
| Setup | `npm run setup` | starts docker postgres+redis + install + prisma:generate + prisma:migrate + prisma:seed |
| Dev | `npm run start:dev` | watch mode; uses `NODE_OPTIONS=--dns-result-order=ipv4first` |
| Format | `npm run format` | prettier on src/ and test/ |
| Lint | `npm run lint` | ESLint flat config (`eslint.config.mjs`); Prettier integration |
| Unit tests | `npm test` | jest, rootDir: `src`, `**/*.spec.ts` |
| E2E tests | `npm run test:e2e` | jest config `test/jest-e2e.json`, `**/*.e2e-spec.ts` |
| Coverage | `npm run test:cov` | jest --coverage |
| Docker dev | `npm run docker:dev:up` | builds + starts postgres + redis + api with hot reload |
| Docker prod | `npm run docker:prod:up` | multi-stage Dockerfile build |

### Prisma (configured via `prisma.config.ts`)

- `npm run prisma:generate` — client gen
- `npm run prisma:migrate` — dev migration
- `npm run prisma:deploy` — prod migration
- `npm run prisma:reset` — reset + re-seed
- `npm run prisma:seed` — `ts-node prisma/seed.ts` (3 dev users; no-ops in production)

**No migrations are checked in.** This template ships schema-only; the first
`npm run prisma:migrate` (or `npm run setup`) against your own `DATABASE_URL`
creates the initial migration. Don't hand-write migration SQL — always go
through the CLI.

All schemas are split into multiple files in `prisma/schemas/` using the
`prismaSchemaFolder` preview feature: `base.prisma` (generator + datasource),
`user.prisma` (User model + UserRole enum), `media.prisma` (Media model +
MediaEntityType enum, currently just `USER_AVATAR`). Add new domains by
creating a new `<domain>.prisma` file there — no need to touch the others.

## Architecture

- **API prefix:** `/api`, all routes versioned via URI (`/api/v1/…`).
  `app.enableVersioning({ type: VersioningType.URI })`, default `'1'`.
- **Swagger:** `/api-doc` UI, `/api-doc-json` raw spec.
- **Metrics:** `GET /metrics` (Prometheus, excluded from `/api` prefix).
- **Health:** `GET /health` (excluded from `/api` prefix).

### 4 feature modules under `src/modules/`

`auth-service`, `user-service`, `email-service`, `health`. Standard layout:
`dao/` (DB queries only), `dto/` (`validation/` + `success/` + `error/`),
`<name>.controller.ts`, `<name>.service.ts`, `<name>.module.ts`. `auth-service`
additionally has `guards/`, `strategies/`, `services/` (password-reset token).

## Key conventions

- **Config:** All env vars read from `src/shared/config/app.config.ts`.
  NEVER read `process.env` directly anywhere else.
- **DAO isolation:** Services never call `prisma.*` directly — always go
  through the module's DAO (`UserDAO` is the only one right now).
- **Email:** Fire-and-forget via `void emailService.send*(…)` — don't await
  it in the request path.
- **No i18n:** Plain English string constants, not message-lookup functions.
  See "Provenance" above before changing this.
- **Redis tokens:** Clients hold Redis keys (opaque `userId:sessionId`), not
  real JWTs. Real JWTs live in Redis only. Server-side logout = delete the key.
- **ModuleNameMapper:** Tests use `^src/(.*)$` → `<rootDir>/$1` alias. Import
  paths like `src/modules/…` work in both src and tests.
- **Import paths:** Use `src/…` absolute imports (configured via tsconfig `baseUrl`).
- **Prettier:** single quotes, trailing commas.
- **Test utilities:** `src/common/test-utils/` provides mock factories
  (`createMockPrismaService()`, `createMockRedisClientService()`).
- **Test controller** (`EmailTestController`) is gated behind
  `NODE_ENV !== 'production'` in `app.module.ts`.

## Cache architecture (3-tier, fail-open)

L1 (in-process LRU, `CACHE_L1_MAX_SIZE` entries, `CACHE_L1_TTL_MS`) → Bloom
filter (Redis SETBIT, guards the `user` namespace only right now) → request
coalescing → L2 (Redis DB from `REDIS_DB_SIGNED_URL_CACHE`, key pattern
`l2:{CACHE_VERSION}:{ns}:{id}`) → DB.

- Bloom filter namespaces are defined in `bloom-rebuild.service.ts`'s
  `specs` array — currently just `user`. Add a new `RebuildSpec` there (and
  a matching prefix in `cache.constants.ts`) when you add a new DAO that
  should be Bloom-guarded.
- Nightly atomic rebuild cron (`BLOOM_REBUILD_CRON`, default 3 AM). Also
  incrementally updated on every `UserDAO.create()`.
- Bump `CACHE_VERSION` (e.g. `v1`→`v2`) on deploy after a Prisma schema
  change that affects cached shapes, to cold-start L2 without a flush.

## Redis DB allocation

Every concern gets its own Redis DB index so a backlog in one can't evict
keys in another (`--maxmemory-policy noeviction`, so eviction would mean data
loss, not a performance blip):

| DB | Purpose | Env var |
|---|---|---|
| 1 | Auth session tokens | `REDIS_DB_AUTH` |
| 3 | Throttle / rate-limit counters | `REDIS_DB_THROTTLE` |
| 4 | General email queue | `REDIS_DB_EMAIL_QUEUE` |
| 5 | Auth/OTP email queue (isolated so it can't be starved) | `REDIS_DB_AUTH_EMAIL_QUEUE` |
| 12 | Signed-URL cache + L2 cache + Bloom filter bitmaps | `REDIS_DB_SIGNED_URL_CACHE` |

Redis runs with `--databases 32`, so there's plenty of headroom to add more
without renumbering. Follow the pattern in `redis.client.ts`
(`getClientXQueueOptions()` returning plain `RedisOptions`, not a live
`Redis` instance, to avoid the dual-ioredis type conflict with BullMQ).

## Rate limiting

Lua sliding-window script on the throttle Redis DB, atomic per request.
Master switch: `THROTTLE_ENABLED=false` disables all throttle guards (they're
conditionally spread into `@UseGuards()` — see any auth controller method).
Guards live in `src/common/throttles/`; auth routes get both an IP+UA+device
layer and an identity (email/userId) layer, see
`common/throttles/base-throttle.guard.ts` for the shared engine.

## Docker

Each compose file is fully self-contained (Postgres + Redis + a single API
service — no separate worker service, see "Entrypoints" above).

| Context | Command | Notes |
|---|---|---|
| Dev | `npm run docker:dev:up` | Uses `dev.docker-compose.yml` + `Dockerfile.dev` — hot-reload, source mounted |
| Prod | `npm run docker:prod:up` | Uses `docker-compose.yml` + multi-stage `Dockerfile` — compiled `dist/` baked in |

Dev mounts source from host and runs `start:dev`. `node_modules` volume
prevents the host bind mount from shadowing the container's install.

Production Dockerfile uses a 4-stage build: `deps` → `build` → `prod-deps` →
`runner`. The final `runner` stage contains only `dist/`, `prisma/schemas/`,
and production `node_modules/`.

### CI/CD

`.github/workflows/deploy-to-vm.yml` is carried over from the source project
as a worked example (GCP VM + Docker Hub + SSH deploy) — it references a
specific VM name, image registry, and secret names that won't exist for a
new project. Treat it as a reference to adapt, not something to run as-is.
It has no worker-specific build/deploy steps to remove (it already builds
whatever `docker-compose.yml` defines), but the VM name, image tags, and
required secrets are all project-specific and need to be set up fresh.
