# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

Two-workspace monorepo with **no root `package.json`** — install and run commands from `client/` or `server/` directly.

- `client/` — React 18 + Vite 5 + Tailwind SPA (Zustand for auth/UI state, TanStack Query for server state)
- `server/` — Node 20 + Express 4 API, Prisma + PostgreSQL (pgvector), OpenAI via `openai` SDK, WebSocket via `ws`

## Common commands

### Server (`cd server`)

- `npm run dev` — nodemon on `src/index.js` (port 5000)
- `npm run start` / `npm run start:prod` — production start; `start:prod` runs `prisma migrate deploy` first
- `npm run build` — `prisma generate` (there is no TS/bundle step; Node runs `src/` directly as ESM)
- `npm run db:migrate` — `prisma migrate dev` (dev DB)
- `npm run db:migrate:prod` — `prisma migrate deploy`
- `npm run db:seed` — runs `prisma/seed.js`
- `npm run db:studio` — Prisma Studio
- `npm run db:reset` — **destructive**; resets dev DB
- No test runner is configured.

### Client (`cd client`)

- `npm run dev` — Vite on port 5173 (strict), proxies `/api` → `http://localhost:5000`
- `npm run build` / `npm run preview` (preview on 4173)
- `npm run lint` — ESLint with `--max-warnings 0`
- No test runner is configured.

### Dev flow

Start both in separate terminals: `cd server && npm run dev`, then `cd client && npm run dev`. The Vite proxy means the client calls `/api/...` relative URLs in dev. In production the client uses `VITE_API_URL` (baked in at build time via Dockerfile `ARG`).

## Environment

- `server/.env.example` is the canonical list. Key vars: `DATABASE_URL` (Postgres + pgvector in prod, schema uses `Unsupported("vector(1536)")` placeholders), `JWT_SECRET`, `CLIENT_URL` (used for CORS), `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`), `AI_RATE_LIMIT_PER_DAY`.
- Client reads `VITE_API_URL` at build time; base default in `src/services/api.js` is `http://localhost:4000/api` — the dev setup relies on the Vite proxy rather than that fallback.

## Architecture

### Multi-tenancy model

Shared DB, shared schema, `teamId` FK on every tenant-scoped table. Two middleware invariants drive this (`server/src/middleware/`):

1. `authenticate` decodes JWT and sets `req.user = { id, globalRole, currentTeamId, teamRole }`. It does **not** re-query the DB per request (latency) and fires a non-blocking `lastActiveAt` update.
2. `requireTeamContext` validates the team is `ACTIVE` and sets `req.teamId`. **Every team-scoped controller must filter by `req.teamId`** — using `req.user.currentTeamId` directly bypasses the status check and SUPER_ADMIN override.

SUPER_ADMIN users can override team context with `?teamId=...` or the `X-Team-Id` header — this is intentional for cross-team admin tooling. Regular users cannot.

Roles live in two dimensions:
- `globalRole`: `USER` | `SUPER_ADMIN` (platform-wide)
- `teamRole`: `MEMBER` | `TEAM_ADMIN` (per-team, travels with `currentTeamId`)

Personal-mode users have an auto-created team with `isPersonal: true` — treat the same as regular teams in queries.

### API routing

`server/src/index.js` mounts each router twice via `mountRoutes(prefix)`: canonical `/api/v1/*` and backward-compat `/api/*` (same routers, no duplication). Add new routes inside `mountRoutes`, not after. Three rate limiters are applied at mount time: `authLimiter` (login/register/forgot), `aiLimiter` (AI + admin + platform), `apiLimiter` (everything else).

Response envelope is standardized — success: `{ success, data, meta? }`; error: `{ success: false, error: { message, code?, requestId?, details? } }`. Client's `src/services/api.js` extracts via `extractErrorMessage` / `extractErrorCode` / `extractRequestId`. A 401 globally logs the user out and redirects; a 403 with specific codes does role-based redirects.

### Prisma schema (`server/prisma/schema.prisma`)

~1600 lines, ~25 models. Key decisions (documented in the schema header):

- **CUIDs** (not UUIDs) for sortable, B-tree-friendly IDs.
- **Soft deletes** via `deletedAt` on `User` and `Team`; partial indexes exclude deleted rows. Prisma middleware auto-filters soft-deleted users.
- **JSON columns** (`categoryData`, `phases`, `workspace`, `debrief`, `scores`, etc.) for semi-structured blobs — never used in `WHERE`. If you need to filter/sort on something, give it its own column.
- **Vector columns** use `Unsupported("vector(1536)")` placeholders; the real columns and HNSW indexes are in raw SQL migrations (see `20260802000001_baseline_vector_indexes`, `prisma/manual_vector_setup.sql`). Don't try to manage pgvector via Prisma directly.
- **SM-2 spaced repetition**: `sm2EasinessFactor`, `sm2Interval`, `sm2Repetitions` are real columns on `Solution`. All SM-2 state is computed server-side; the client only sends a 1–5 confidence rating. Logic in `server/src/utils/sm2.js`.
- **Cascade rules**: deleting a Team cascades to team-scoped data; deleting a User nullifies authored content (problems stay with `[deleted user]`) but cascades personal data (solutions, sessions, messages).

When writing migrations, be explicit about vector/HNSW changes in raw SQL — `prisma db pull` will show them as `Unsupported("vector")` with no dimension info, which is expected (dimension is enforced at the DB level).

### AI layer

- `server/src/services/ai.service.js` is the single OpenAI client + in-memory per-user-per-day rate limiter (keyed `${userId}:${YYYY-MM-DD}`, cleaned probabilistically). Default model from `OPENAI_MODEL` (`gpt-4o-mini`).
- `server/src/services/ai.prompts.js` and `ai.schemas.js` hold prompts and Zod/JSON schemas for structured outputs.
- `designStudio.controller.js` hardcodes model names per call (mix of `gpt-4o-mini` and `gpt-4o` for the final synthesis) — intentional, not a bug.
- `platform.controller.js` uses `OPENAI_MODEL_PREMIUM` falling back to `OPENAI_MODEL` for admin-only heavyweight analysis.
- `embedding.service.js` produces 1536-dim embeddings stored in pgvector columns; used for similarity search via HNSW indexes.

### Interview + Design Studio

Two realtime-ish AI-driven experiences:

- **Mock Interview** (`interview.engine.js`, `interview.phases.js`, `websocket.service.js`) — phase-driven state machine over a WebSocket. Sessions persisted as `InterviewSession` + `InterviewMessage`.
- **Design Studio** (`designStudioRoutes` / `designStudio.controller.js`) — self-paced system-design practice with Excalidraw canvas on the client (`DesignStudioPage.jsx`). Sessions in `DesignSession` with JSON `phases`/`workspace`/`debrief`/`scores` blobs.

### Client routing (`client/src/App.jsx`)

Three layered route groups under `BrowserRouter`, all inside a `QueryClientProvider` (staleTime 2m, gcTime 10m, retry 1, no refetch-on-focus):

1. **Public** — `/auth/*`
2. **Auth-only** (logged in, no team yet) — `/onboarding`, `/auth/change-password`
3. **Main app** (auth + onboarding + active team) — wrapped in `AppShell`, uses `<ProtectedRoute requireTeamContext>`. Team-admin-only subroutes add `<ProtectedRoute requireTeamAdmin>` inside.
4. **SuperAdmin** — `/super-admin/*`, uses `<ProtectedRoute requireSuperAdmin>`, does **not** require team context.

Heavy pages (`MockInterviewPage`, `DesignStudioPage`, Excalidraw-based flows, Showcase, docs) are `React.lazy`'d and wrapped in a `<Lazy>` Suspense helper. `vite.config.js` manualChunks splits vendor/query/ui/charts/forms/highlight/excalidraw for caching.

### Client state split

- **Zustand** (`src/store/useAuthStore.js`, `useUIStore.js`) — auth token/user (mirrored to `localStorage`), UI toggles. Derived getters (`isSuperAdmin`, `isTeamAdmin`, `isPersonalMode`, `currentTeamId`, `needsOnboarding`, `needsPasswordChange`) read from `user` — don't duplicate them as separate fields.
- **TanStack Query** — all server data. Hooks in `src/hooks/use*.js` wrap API calls from `src/services/*.api.js`. Keep query keys consistent with the hook that owns them.

Path aliases (`@/`, `@components`, `@pages`, `@hooks`, `@store`, `@services`, `@utils`, `@styles`) are defined in `vite.config.js` — prefer them over relative traversals.

### Error / logging / observability

- `requestId.middleware.js` stamps each request with an ID that flows into log lines and error envelopes (`error.requestId`) and the `X-Request-Id` response header — surface it in bug reports.
- `queryLogger.middleware.js` wires slow-query logging onto the Prisma client.
- `dev`/`prodLogger` are Morgan variants; prod uses structured output.

## Conventions to preserve

- **Never** add a team-scoped DB query that doesn't filter by `req.teamId`. If you're tempted to use `req.user.currentTeamId`, stop — it bypasses status + SUPER_ADMIN override.
- When adding a route: put it inside `mountRoutes()` in `server/src/index.js` so it's available at both `/api/v1/*` and `/api/*`. Pick a rate limiter (`authLimiter`/`aiLimiter`/`apiLimiter`).
- Return errors through the standard envelope; `response.js` helpers and `errorHandler` already handle the shape.
- For new tables with team scope: add `teamId` FK + a composite index with the most-common co-filter (usually `createdAt` or `userId`). Add cascade rules deliberately.
- For new vector columns: add as `Unsupported("vector(1536)")` in schema, then write raw SQL in the migration for column + HNSW index.
- For new AI calls: route through `ai.service.js` so the rate limiter + error handler apply. Use Zod schemas from `ai.schemas.js` for structured outputs.
- For new heavy client pages: `React.lazy` + `<Lazy>` wrapper, and add a `manualChunks` entry in `vite.config.js` if it brings a large dependency.
