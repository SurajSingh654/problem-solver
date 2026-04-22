// ============================================================================
// ProbSolver v3.0 — Prisma Client Singleton
// ============================================================================
//
// DESIGN DECISIONS:
//
// 1. Singleton pattern: Prevents multiple PrismaClient instances during
//    hot-reload in development. In production, Node.js module caching
//    handles this, but the globalThis guard is defense-in-depth. [1]
//
// 2. Soft-delete middleware: Automatically injects `deletedAt: null`
//    into all findMany/findFirst/findUnique queries on User and Team.
//    This means every query in the codebase automatically excludes
//    soft-deleted records without developers remembering to filter.
//    To query deleted records explicitly, use `prisma.$queryRaw`. [6]
//
// 3. Query logging: Enabled in development for debugging slow queries.
//    Disabled in production — query logging has measurable overhead
//    at high throughput. [1]
//
// 4. Connection pool: Prisma defaults to `num_cpus * 2 + 1` connections.
//    On Railway's shared infrastructure, we cap this explicitly via
//    the DATABASE_URL `?connection_limit=10` parameter to avoid
//    exhausting PostgreSQL's max_connections. [1]
//
// ============================================================================

import { PrismaClient } from "@prisma/client";

const isProduction = process.env.NODE_ENV === "production";

// ── Create client with environment-appropriate logging ────────
function createPrismaClient() {
  const client = new PrismaClient({
    log: isProduction ? ["error", "warn"] : ["query", "error", "warn"],
  });

  // ── Soft-delete middleware ──────────────────────────────────
  // Intercept reads on User and Team to exclude soft-deleted rows.
  // This runs at the Prisma query engine level — before SQL generation.
  // It does NOT affect $queryRaw or $executeRaw calls.
  //
  // Models that use soft delete:
  const softDeleteModels = ["User", "Team"];

  client.$use(async (params, next) => {
    if (!softDeleteModels.includes(params.model)) {
      return next(params);
    }

    // ── Intercept reads: inject deletedAt filter ─────────────
    if (params.action === "findMany" || params.action === "findFirst") {
      if (!params.args) params.args = {};
      if (!params.args.where) params.args.where = {};

      // Only inject if deletedAt isn't explicitly set in the query
      // This allows intentional queries for deleted records
      if (params.args.where.deletedAt === undefined) {
        params.args.where.deletedAt = null;
      }
    }

    if (params.action === "findUnique") {
      // Convert to findFirst since we're adding non-unique where fields
      params.action = "findFirst";
      if (!params.args) params.args = {};
      if (!params.args.where) params.args.where = {};
      if (params.args.where.deletedAt === undefined) {
        params.args.where.deletedAt = null;
      }
    }

    if (params.action === "findFirstOrThrow") {
      if (!params.args) params.args = {};
      if (!params.args.where) params.args.where = {};
      if (params.args.where.deletedAt === undefined) {
        params.args.where.deletedAt = null;
      }
    }

    // ── Intercept deletes: convert to soft delete ────────────
    if (params.action === "delete") {
      params.action = "update";
      params.args.data = { deletedAt: new Date() };
    }

    if (params.action === "deleteMany") {
      params.action = "updateMany";
      if (!params.args) params.args = {};
      if (!params.args.data) params.args.data = {};
      params.args.data.deletedAt = new Date();
    }

    return next(params);
  });

  return client;
}

// ── Singleton: reuse across hot-reloads ──────────────────────
const globalForPrisma = globalThis;

const prisma = globalForPrisma.__prisma || createPrismaClient();

if (!isProduction) {
  globalForPrisma.__prisma = prisma;
}

export default prisma;
