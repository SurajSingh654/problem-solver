// ============================================================================
// SuperAdmin Diagnostics Controller
// ============================================================================
//
// Read-only runtime health checks. Each category returns a list of
// findings with consistent shape:
//
//   {
//     id: 'unique-stable-id',          // for client-side dedupe / linking
//     severity: 'INFO' | 'WARNING' | 'ERROR',
//     title: 'Short headline',
//     detail: 'One-paragraph explanation with the number',
//     recommendedFix: 'What to do, ideally with a command/path',
//     metric?: number,                 // optional; for sparkline / trend later
//   }
//
// Categories:
//   ai          — fallback rate per surface, error rate, slow surfaces
//   database    — orphans, missing embeddings, soft-delete bloat
//   schema      — pending migrations / drift
//   runtime     — feature flag mismatch, recent verdict fallback rate
//   featureFlags — current state of all feature flags
//
// All endpoints require SUPER_ADMIN — gated upstream by the route mount.
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import {
  FEATURE_TEACHING_SESSIONS,
  FEATURE_NOTES_ENABLED,
  AI_ENABLED,
  AI_DAILY_LIMIT,
  AI_MODEL_FAST,
  AI_MODEL_PRIMARY,
  AI_MODEL_PREMIUM,
} from "../config/env.js";

// ── Severity helpers ───────────────────────────────────────────────
const SEVERITY = {
  INFO: "INFO",
  WARNING: "WARNING",
  ERROR: "ERROR",
};

// Highest severity wins when summarizing a category.
function rollupSeverity(findings) {
  if (findings.some((f) => f.severity === "ERROR")) return "ERROR";
  if (findings.some((f) => f.severity === "WARNING")) return "WARNING";
  if (findings.length > 0) return "INFO";
  return "OK";
}

function finding({ id, severity, title, detail, recommendedFix, metric }) {
  return {
    id,
    severity,
    title,
    detail,
    recommendedFix,
    ...(metric !== undefined ? { metric } : {}),
  };
}

// ============================================================================
// AI HEALTH
// ============================================================================
//
// Pulls from UsageTracking (last 24h):
//   • per-surface fallback rate — alert when > 5%
//   • per-surface error rate — alert when > 2%
//   • p95 latency — alert when > 8000ms
//   • daily quota saturation — top 3 users near limit
// ============================================================================
async function aiFindings() {
  const findings = [];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  if (!AI_ENABLED) {
    findings.push(
      finding({
        id: "ai-disabled",
        severity: SEVERITY.WARNING,
        title: "AI is disabled",
        detail:
          "OPENAI_API_KEY is not set on the server. All AI surfaces will fall back to deterministic outputs.",
        recommendedFix:
          "Set OPENAI_API_KEY in the server env (Railway Variables tab) and redeploy.",
      }),
    );
    return findings;
  }

  // Per-surface stats via raw SQL — Prisma's groupBy doesn't compose
  // cleanly with conditional counts.
  const rows = await prisma.$queryRaw`
    SELECT
      surface,
      COUNT(*)::int AS total,
      SUM(CASE WHEN "usedFallback" THEN 1 ELSE 0 END)::int AS fallbacks,
      SUM(CASE WHEN "errorCode" IS NOT NULL THEN 1 ELSE 0 END)::int AS errors,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs")::int AS p95_latency
    FROM usage_tracking
    WHERE "createdAt" >= ${since}
    GROUP BY surface
    HAVING COUNT(*) >= 5
    ORDER BY total DESC
  `;

  for (const r of rows) {
    const total = Number(r.total) || 0;
    const fallbacks = Number(r.fallbacks) || 0;
    const errors = Number(r.errors) || 0;
    const p95 = Number(r.p95_latency) || 0;
    const fallbackRate = total > 0 ? (fallbacks / total) * 100 : 0;
    const errorRate = total > 0 ? (errors / total) * 100 : 0;

    if (fallbackRate >= 25) {
      findings.push(
        finding({
          id: `ai-fallback-${r.surface}`,
          severity: SEVERITY.ERROR,
          title: `${r.surface}: ${fallbackRate.toFixed(1)}% fallback rate`,
          detail: `${fallbacks}/${total} calls fell back in the last 24h. Healthy is < 5%; this is way over.`,
          recommendedFix: `Check server logs for "${r.surface}" — likely a validator regression or a bad prompt change. Also check OPENAI_API_KEY validity.`,
          metric: fallbackRate,
        }),
      );
    } else if (fallbackRate >= 5) {
      findings.push(
        finding({
          id: `ai-fallback-${r.surface}`,
          severity: SEVERITY.WARNING,
          title: `${r.surface}: ${fallbackRate.toFixed(1)}% fallback rate`,
          detail: `${fallbacks}/${total} calls fell back in the last 24h. Healthy is < 5%.`,
          recommendedFix: `Sample recent UsageTracking rows for this surface to see error codes; look for patterns (rate limits, validator violations, output truncation).`,
          metric: fallbackRate,
        }),
      );
    }

    if (errorRate >= 5) {
      findings.push(
        finding({
          id: `ai-errors-${r.surface}`,
          severity: SEVERITY.WARNING,
          title: `${r.surface}: ${errorRate.toFixed(1)}% error rate`,
          detail: `${errors}/${total} calls produced an OpenAI error in the last 24h.`,
          recommendedFix: `Check for upstream OpenAI incidents, rate-limit saturation, or model deprecations.`,
          metric: errorRate,
        }),
      );
    }

    if (p95 > 0 && p95 > 12000) {
      findings.push(
        finding({
          id: `ai-latency-${r.surface}`,
          severity: SEVERITY.WARNING,
          title: `${r.surface}: ${(p95 / 1000).toFixed(1)}s p95 latency`,
          detail: `95th-percentile latency exceeds 12s in the last 24h.`,
          recommendedFix: `Check the maxTokens budget for this surface; consider downgrading to a faster model tier or reducing prompt size.`,
          metric: p95,
        }),
      );
    }
  }

  // Quota saturation — top users near AI_DAILY_LIMIT
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const heavy = await prisma.usageTracking.groupBy({
    by: ["userId"],
    where: { createdAt: { gte: today }, userId: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { userId: "desc" } },
    take: 3,
  });
  for (const h of heavy) {
    const used = h._count._all;
    if (used >= AI_DAILY_LIMIT * 0.8) {
      findings.push(
        finding({
          id: `ai-quota-${h.userId}`,
          severity:
            used >= AI_DAILY_LIMIT ? SEVERITY.WARNING : SEVERITY.INFO,
          title: `User near daily AI limit: ${used}/${AI_DAILY_LIMIT}`,
          detail: `User ${h.userId} has used ${used} AI calls today; daily cap is ${AI_DAILY_LIMIT}.`,
          recommendedFix:
            used >= AI_DAILY_LIMIT
              ? "User is rate-limited until tomorrow. If this is unexpected, raise AI_DAILY_LIMIT or investigate abuse."
              : "Monitor; cap will trigger if usage continues at this pace.",
          metric: used,
        }),
      );
    }
  }

  if (findings.length === 0) {
    findings.push(
      finding({
        id: "ai-healthy",
        severity: SEVERITY.INFO,
        title: "All AI surfaces healthy",
        detail: `Across ${rows.length} active surface(s) in the last 24h, fallback rate < 5%, error rate < 5%, and p95 latency < 12s.`,
        recommendedFix: "No action required.",
      }),
    );
  }

  return findings;
}

// ============================================================================
// DATABASE HEALTH
// ============================================================================
//
// Looks for hygiene issues that don't break runtime but accumulate cost
// and risk over time:
//   • Soft-deleted users / teams (archive bloat)
//   • Notes / Problems missing embeddings (silent feature degradation)
//   • Orphan rows (FK SetNull leftovers)
// ============================================================================
async function databaseFindings() {
  const findings = [];

  const [
    deletedUsers,
    deletedTeams,
    notesMissingEmbedding,
    notesTotal,
    problemsMissingEmbedding,
    problemsTotal,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: { not: null } } }),
    prisma.team.count({ where: { deletedAt: { not: null } } }),
    prisma.$queryRaw`SELECT COUNT(*)::int AS c FROM notes WHERE "archivedAt" IS NULL AND embedding IS NULL`,
    prisma.note.count({ where: { archivedAt: null } }),
    prisma.$queryRaw`SELECT COUNT(*)::int AS c FROM problems WHERE embedding IS NULL AND "isPublished" = true`,
    prisma.problem.count({ where: { isPublished: true } }),
  ]);

  const notesMissing = Number(notesMissingEmbedding[0]?.c) || 0;
  const problemsMissing = Number(problemsMissingEmbedding[0]?.c) || 0;

  if (deletedUsers > 50) {
    findings.push(
      finding({
        id: "db-deleted-users",
        severity: SEVERITY.INFO,
        title: `${deletedUsers} soft-deleted users`,
        detail: `These rows are filtered from queries via the Prisma middleware but still occupy storage. Hard-prune older than 90d if disk is tight.`,
        recommendedFix: `Optional: write a one-shot script to permanently delete users where deletedAt < NOW() - INTERVAL '90 days'.`,
        metric: deletedUsers,
      }),
    );
  }

  if (deletedTeams > 20) {
    findings.push(
      finding({
        id: "db-deleted-teams",
        severity: SEVERITY.INFO,
        title: `${deletedTeams} soft-deleted teams`,
        detail: `Same as users — soft-deleted teams cascade to a lot of child data when hard-pruned. Consider a retention policy.`,
        recommendedFix: `Audit soft-deleted teams; hard-prune those older than 90d if they have no active members.`,
        metric: deletedTeams,
      }),
    );
  }

  if (notesTotal > 0) {
    const pct = (notesMissing / notesTotal) * 100;
    if (pct > 20 && notesMissing > 5) {
      findings.push(
        finding({
          id: "db-notes-no-embedding",
          severity: SEVERITY.WARNING,
          title: `${notesMissing} notes missing embeddings (${pct.toFixed(0)}% of active)`,
          detail: `Notes without embeddings can't appear in the "Related" panel. The notes.embedding writer fires 5s after every save; misses usually mean OPENAI_API_KEY was missing during a window.`,
          recommendedFix: `Run a one-shot backfill: iterate notes where embedding IS NULL and call embedAndPersist("Note", id). Mirrors the embedAllExisting() pattern in embedding.service.js.`,
          metric: notesMissing,
        }),
      );
    }
  }

  if (problemsTotal > 0) {
    const pct = (problemsMissing / problemsTotal) * 100;
    if (pct > 20 && problemsMissing > 5) {
      findings.push(
        finding({
          id: "db-problems-no-embedding",
          severity: SEVERITY.WARNING,
          title: `${problemsMissing} published problems missing embeddings (${pct.toFixed(0)}% of all)`,
          detail: `Problems without embeddings don't surface as similarity matches for solutions or notes.`,
          recommendedFix: `Run embedAllExisting() from embedding.service.js — it's idempotent and skips already-embedded rows.`,
          metric: problemsMissing,
        }),
      );
    }
  }

  // Orphans worth checking
  const orphanFlashcards = await prisma.flashcard.count({
    where: { noteId: null, aiGenerated: true, archivedAt: null },
  });
  if (orphanFlashcards > 50) {
    findings.push(
      finding({
        id: "db-orphan-flashcards",
        severity: SEVERITY.INFO,
        title: `${orphanFlashcards} AI-generated flashcards with no parent note`,
        detail: `noteId becomes null when the parent Note is deleted (SetNull cascade). Not a bug — just bloat from deleted notes whose cards survived.`,
        recommendedFix: `Optional: script to archive AI-generated flashcards orphaned > 30d.`,
        metric: orphanFlashcards,
      }),
    );
  }

  if (findings.length === 0) {
    findings.push(
      finding({
        id: "db-healthy",
        severity: SEVERITY.INFO,
        title: "Database hygiene OK",
        detail: "Embedding coverage > 80%, soft-delete bloat under threshold, no significant orphans.",
        recommendedFix: "No action required.",
      }),
    );
  }

  return findings;
}

// ============================================================================
// SCHEMA / MIGRATIONS
// ============================================================================
//
// We can't easily run `prisma migrate status` from inside the running
// server (process-level concerns + Railway permissions). Instead we
// query the Prisma _prisma_migrations table directly and compare with
// the on-disk migration directory list — but the on-disk listing also
// requires fs access we'd rather not bake in. So this check focuses on
// what's queryable: the migrations table itself.
//
// What we report:
//   • Most recently applied migration name + timestamp
//   • Any rolled-back / failed migrations (rolled_back_at IS NOT NULL or
//     finished_at IS NULL with applied_steps_count = 0)
// ============================================================================
async function schemaFindings() {
  const findings = [];

  try {
    const rows = await prisma.$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
      FROM _prisma_migrations
      ORDER BY started_at DESC
      LIMIT 10
    `;

    const failed = rows.filter(
      (r) => r.rolled_back_at !== null || r.finished_at === null,
    );
    const lastSuccess = rows.find(
      (r) => r.rolled_back_at === null && r.finished_at !== null,
    );

    if (failed.length > 0) {
      findings.push(
        finding({
          id: "schema-failed-migrations",
          severity: SEVERITY.ERROR,
          title: `${failed.length} migration(s) failed or rolled back`,
          detail:
            "A migration didn't complete cleanly. The database may be in an inconsistent state.",
          recommendedFix: `Run \`prisma migrate resolve --rolled-back <migration-name>\` for each failed migration after fixing the underlying issue. Failed: ${failed.map((f) => f.migration_name).join(", ")}.`,
          metric: failed.length,
        }),
      );
    }

    if (lastSuccess) {
      const ageDays =
        (Date.now() - new Date(lastSuccess.finished_at).getTime()) /
        (1000 * 60 * 60 * 24);
      findings.push(
        finding({
          id: "schema-last-applied",
          severity: SEVERITY.INFO,
          title: `Last migration: ${lastSuccess.migration_name}`,
          detail: `Applied ${ageDays.toFixed(0)} days ago.`,
          recommendedFix: "No action required.",
        }),
      );
    }
  } catch (err) {
    findings.push(
      finding({
        id: "schema-query-failed",
        severity: SEVERITY.WARNING,
        title: "Couldn't query migration history",
        detail: `_prisma_migrations table query failed: ${err.message}`,
        recommendedFix:
          "Verify Prisma's migration table exists. If this is a freshly seeded DB, run `prisma migrate deploy` once.",
      }),
    );
  }

  return findings;
}

// ============================================================================
// FEATURE FLAGS
// ============================================================================
//
// Reports current server-side flag state. The client can compare this
// against its own `import.meta.env.VITE_FEATURE_*` values to detect a
// mismatch (server has flag on, client doesn't ship the routes — exactly
// the bug the Teaching deploy hit).
// ============================================================================
function featureFlagFindings() {
  const flags = [
    {
      name: "FEATURE_TEACHING_SESSIONS",
      value: FEATURE_TEACHING_SESSIONS,
      clientMirror: "VITE_FEATURE_TEACHING_SESSIONS",
    },
    {
      name: "FEATURE_NOTES_ENABLED",
      value: FEATURE_NOTES_ENABLED,
      clientMirror: "VITE_FEATURE_NOTES_ENABLED",
    },
  ];

  const findings = flags.map((f) =>
    finding({
      id: `flag-${f.name}`,
      severity: SEVERITY.INFO,
      title: `${f.name} = ${f.value}`,
      detail: `Server-side. Client must mirror via ${f.clientMirror} AND declare a matching ARG/ENV pair in client/Dockerfile.`,
      recommendedFix:
        "If you flip this on the server, verify the client bundle was rebuilt with the matching VITE_* var (check the bundle hash + the deployed JS for the literal value).",
    }),
  );

  return findings;
}

// ============================================================================
// RUNTIME — verdict-validator fallback rate, recent error counts
// ============================================================================
async function runtimeFindings() {
  const findings = [];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Verdict log — readiness verdict surface has its own fallback flag
  // (separate from UsageTracking). High fallback rate here means the
  // verdict prompt is producing rule violations.
  try {
    const verdictStats = await prisma.verdictLog.aggregate({
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });
    const verdictTotal = verdictStats._count._all;
    if (verdictTotal > 0) {
      const verdictFallback = await prisma.verdictLog.count({
        where: { createdAt: { gte: since }, usedFallback: true },
      });
      const rate = (verdictFallback / verdictTotal) * 100;
      if (rate >= 5) {
        findings.push(
          finding({
            id: "runtime-verdict-fallback",
            severity: rate >= 20 ? SEVERITY.ERROR : SEVERITY.WARNING,
            title: `Readiness verdict fallback rate: ${rate.toFixed(1)}%`,
            detail: `${verdictFallback}/${verdictTotal} verdicts in the last 24h hit the deterministic fallback. Healthy is < 5%.`,
            recommendedFix:
              "Check /super-admin/verdicts for recent rejection violations. The validator surfaces specific rule violations (e.g., overclaim, missing hedging).",
            metric: rate,
          }),
        );
      }
    }
  } catch (err) {
    console.warn("[diagnostics] verdict-log query failed:", err.message);
  }

  // Per-team active session count snapshot — proxy for "is anyone using
  // the app right now?" Useful for spotting empty deploys.
  const activeUsers24h = await prisma.user.count({
    where: { lastActiveAt: { gte: since } },
  });
  findings.push(
    finding({
      id: "runtime-active-users",
      severity:
        activeUsers24h === 0 ? SEVERITY.WARNING : SEVERITY.INFO,
      title: `${activeUsers24h} users active in last 24h`,
      detail:
        activeUsers24h === 0
          ? "Zero active users. Either the deploy is broken, or genuinely no one logged in."
          : "Active-user count from User.lastActiveAt (updated non-blocking on every authenticated request).",
      recommendedFix:
        activeUsers24h === 0
          ? "Smoke-test the deployed URL: hit /health, attempt login, check WebSocket handshake."
          : "No action required.",
      metric: activeUsers24h,
    }),
  );

  return findings;
}

// ============================================================================
// AGGREGATE — the single endpoint the dashboard calls
// ============================================================================
export async function getDiagnostics(req, res) {
  try {
    const t0 = Date.now();
    const [ai, database, schema, runtime] = await Promise.all([
      aiFindings().catch((e) => [
        finding({
          id: "ai-check-failed",
          severity: SEVERITY.ERROR,
          title: "AI health check failed to run",
          detail: e.message,
          recommendedFix: "Check server logs.",
        }),
      ]),
      databaseFindings().catch((e) => [
        finding({
          id: "db-check-failed",
          severity: SEVERITY.ERROR,
          title: "Database health check failed to run",
          detail: e.message,
          recommendedFix: "Check server logs.",
        }),
      ]),
      schemaFindings().catch((e) => [
        finding({
          id: "schema-check-failed",
          severity: SEVERITY.ERROR,
          title: "Schema check failed to run",
          detail: e.message,
          recommendedFix: "Check server logs.",
        }),
      ]),
      runtimeFindings().catch((e) => [
        finding({
          id: "runtime-check-failed",
          severity: SEVERITY.ERROR,
          title: "Runtime check failed to run",
          detail: e.message,
          recommendedFix: "Check server logs.",
        }),
      ]),
    ]);
    const featureFlags = featureFlagFindings();

    const categories = [
      {
        id: "ai",
        label: "AI Health",
        icon: "🤖",
        severity: rollupSeverity(ai),
        findings: ai,
      },
      {
        id: "database",
        label: "Database",
        icon: "🗄️",
        severity: rollupSeverity(database),
        findings: database,
      },
      {
        id: "schema",
        label: "Schema & Migrations",
        icon: "🧬",
        severity: rollupSeverity(schema),
        findings: schema,
      },
      {
        id: "runtime",
        label: "Runtime",
        icon: "📡",
        severity: rollupSeverity(runtime),
        findings: runtime,
      },
      {
        id: "featureFlags",
        label: "Feature Flags",
        icon: "🚩",
        severity: rollupSeverity(featureFlags),
        findings: featureFlags,
      },
    ];

    const allFindings = categories.flatMap((c) => c.findings);
    const summary = {
      errors: allFindings.filter((f) => f.severity === "ERROR").length,
      warnings: allFindings.filter((f) => f.severity === "WARNING").length,
      info: allFindings.filter((f) => f.severity === "INFO").length,
      overallSeverity: rollupSeverity(allFindings),
    };

    return success(res, {
      summary,
      categories,
      generatedAt: new Date().toISOString(),
      tookMs: Date.now() - t0,
      env: {
        aiEnabled: AI_ENABLED,
        modelFast: AI_MODEL_FAST,
        modelPrimary: AI_MODEL_PRIMARY,
        modelPremium: AI_MODEL_PREMIUM,
        aiDailyLimit: AI_DAILY_LIMIT,
      },
    });
  } catch (err) {
    console.error("getDiagnostics:", err);
    return error(res, "Diagnostics run failed", 500);
  }
}
