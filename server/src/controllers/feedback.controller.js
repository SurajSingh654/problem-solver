// ============================================================================
// ProbSolver v3.0 — Feedback Controller
// ============================================================================
//
// DESIGN DECISIONS:
//
// 1. submitFeedback: Available to all authenticated users regardless of role.
//    Works in both team and individual (personal) mode.
//    Captures team context at submission time — useful for admin triage.
//
// 2. Email notification: Fire-and-forget after DB write.
//    A failed email does NOT fail the submission — member gets their
//    confirmation, admin gets notified best-effort.
//
// 3. listFeedback: SUPER_ADMIN sees all reports platform-wide.
//    TEAM_ADMIN sees reports from their team members only.
//    Members see only their own reports.
//
// 4. updateFeedbackStatus: SUPER_ADMIN only.
//    Admin can add a note and move the status through the lifecycle.
//    resolvedAt is set server-side when status becomes RESOLVED.
//
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { sendFeedbackNotificationEmail } from "../services/email.service.js";
import { FEEDBACK_NOTIFICATION_EMAIL } from "../config/env.js";
import { exportFeedbackQuerySchema } from "../schemas/feedback.schema.js";

// ── Severity sort order for admin inbox ───────────────────────
const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

// ============================================================================
// SUBMIT FEEDBACK
// ============================================================================
export async function submitFeedback(req, res) {
  try {
    const userId = req.user.id;
    const teamId = req.teamId || null; // null in individual mode — that's fine

    const {
      type,
      title,
      description,
      severity,
      affectedArea,
      stepsToReproduce,
    } = req.body;

    const report = await prisma.feedbackReport.create({
      data: {
        type,
        title,
        description,
        severity,
        affectedArea: affectedArea || null,
        stepsToReproduce: stepsToReproduce || null,
        userId,
        teamId,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        team: { select: { id: true, name: true } },
      },
    });

    // Fire-and-forget email notification to admin
    // Failure here should never fail the submission
    if (FEEDBACK_NOTIFICATION_EMAIL) {
      sendFeedbackNotificationEmail(FEEDBACK_NOTIFICATION_EMAIL, report).catch(
        (err) => {
          console.error("[Feedback] Email notification failed:", err.message);
        },
      );
    }

    return success(
      res,
      {
        message: "Feedback submitted. Thank you — we review every report.",
        report,
      },
      201,
    );
  } catch (err) {
    console.error("Submit feedback error:", err);
    return error(res, "Failed to submit feedback.", 500);
  }
}

// ============================================================================
// UPDATED: listFeedback — all authenticated members see all reports
// ============================================================================
export async function listFeedback(req, res) {
  try {
    const { user } = req;
    const isSuperAdmin = user.globalRole === "SUPER_ADMIN";
    const isTeamAdmin = user.teamRole === "TEAM_ADMIN";

    const { status, type, severity, page = 1, limit = 20 } = req.query;

    const where = {};

    // UPDATED VISIBILITY RULE:
    // SUPER_ADMIN: all reports platform-wide
    // TEAM_ADMIN: all reports from their team
    // Member: all reports from their team (same as team admin, no longer restricted to own)
    // This turns feedback into a shared issue tracker — members see what's
    // already reported, reducing duplicate submissions.
    if (isSuperAdmin) {
      // No filter — sees everything
    } else if (req.teamId) {
      // Team admin AND regular members both see their team's reports
      where.teamId = req.teamId;
    } else {
      // Personal mode: see own reports only (no team to scope by)
      where.userId = user.id;
    }

    if (status) where.status = status;
    if (type) where.type = type;
    if (severity) where.severity = severity;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [reports, total] = await Promise.all([
      prisma.feedbackReport.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          team: { select: { id: true, name: true } },
        },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        skip,
        take,
      }),
      prisma.feedbackReport.count({ where }),
    ]);

    const sorted =
      isSuperAdmin || isTeamAdmin || req.teamId
        ? reports.sort((a, b) => {
            if (a.status === "OPEN" && b.status === "OPEN") {
              return (
                (SEVERITY_ORDER[a.severity] ?? 99) -
                (SEVERITY_ORDER[b.severity] ?? 99)
              );
            }
            return 0;
          })
        : reports;

    return success(res, {
      reports: sorted,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
      ...(isSuperAdmin && {
        summary: await getFeedbackSummary(),
      }),
    });
  } catch (err) {
    console.error("List feedback error:", err);
    return error(res, "Failed to fetch feedback.", 500);
  }
}

// ============================================================================
// NEW: GET SIMILAR REPORTS
// ============================================================================
// Called in real-time as the member types their title.
// Returns open/in-progress reports with the same type and affectedArea,
// or reports whose titles share significant word overlap.
// Used to surface potential duplicates BEFORE submission, not block them.
// The member decides if their issue is already reported.
//
// Deduplication strategy:
//   1. Same type + same affectedArea that are still OPEN or IN_PROGRESS
//   2. Title keyword overlap (3+ words in common after stripping stop words)
// We do not hard-block — we surface and let the submitter decide.
export async function getSimilarReports(req, res) {
  try {
    const { user } = req;
    const isSuperAdmin = user.globalRole === "SUPER_ADMIN";
    const { title, type, affectedArea } = req.query;

    if (!title && !affectedArea) {
      return success(res, { similar: [] });
    }

    // Scope: same platform-wide for super admin, same team otherwise
    const scopeWhere = isSuperAdmin
      ? {}
      : req.teamId
        ? { teamId: req.teamId }
        : { userId: user.id };

    // Only surface OPEN and IN_PROGRESS reports as potential duplicates
    // RESOLVED and WONT_FIX are not relevant — those are closed
    const activeFeedback = await prisma.feedbackReport.findMany({
      where: {
        ...scopeWhere,
        status: { in: ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"] },
        ...(type ? { type } : {}),
      },
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        severity: true,
        status: true,
        affectedArea: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50, // Check last 50 active reports
    });

    if (activeFeedback.length === 0) {
      return success(res, { similar: [] });
    }

    // ── Similarity scoring ─────────────────────────────────
    // Score each report against the incoming title + affectedArea.
    // Returns reports scoring above threshold as "similar."
    const STOP_WORDS = new Set([
      "a",
      "an",
      "the",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "shall",
      "can",
      "not",
      "no",
      "nor",
      "so",
      "yet",
      "both",
      "either",
      "neither",
      "for",
      "and",
      "but",
      "or",
      "at",
      "by",
      "in",
      "of",
      "on",
      "to",
      "up",
      "as",
      "it",
      "its",
      "my",
      "i",
      "me",
      "we",
      "us",
      "with",
      "this",
      "that",
      "these",
      "those",
      "when",
      "where",
      "how",
      "what",
      "which",
      "who",
      "whom",
      "why",
    ]);

    function tokenize(text) {
      if (!text) return new Set();
      return new Set(
        text
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
      );
    }

    const incomingTokens = tokenize(title);
    const incomingArea = affectedArea?.toLowerCase() || "";

    const similar = activeFeedback
      .map((report) => {
        let score = 0;

        // Area match — strong signal
        if (
          incomingArea &&
          report.affectedArea?.toLowerCase() === incomingArea
        ) {
          score += 40;
        }

        // Title keyword overlap
        if (incomingTokens.size > 0) {
          const reportTokens = tokenize(report.title);
          const overlap = [...incomingTokens].filter((t) =>
            reportTokens.has(t),
          );
          // Jaccard similarity: intersection / union
          const union = new Set([...incomingTokens, ...reportTokens]);
          const jaccard = union.size > 0 ? overlap.length / union.size : 0;
          score += Math.round(jaccard * 60);
        }

        return { ...report, similarityScore: score };
      })
      .filter((r) => r.similarityScore >= 25) // Threshold: meaningful overlap
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, 3) // Surface at most 3 similar reports
      .map(({ similarityScore, ...report }) => report); // Strip score from response

    return success(res, { similar });
  } catch (err) {
    console.error("Get similar reports error:", err);
    return error(res, "Failed to check for similar reports.", 500);
  }
}

// ============================================================================
// UPDATE FEEDBACK STATUS (SUPER_ADMIN only)
// ============================================================================
export async function updateFeedbackStatus(req, res) {
  try {
    const { feedbackId } = req.params;
    const { status, adminNote } = req.body;

    const existing = await prisma.feedbackReport.findUnique({
      where: { id: feedbackId },
      select: { id: true },
    });

    if (!existing) return error(res, "Feedback report not found.", 404);

    const data = { status };
    if (adminNote !== undefined) data.adminNote = adminNote;
    if (status === "RESOLVED") data.resolvedAt = new Date();
    // Clear resolvedAt if moved back out of resolved
    if (status !== "RESOLVED") data.resolvedAt = null;

    const updated = await prisma.feedbackReport.update({
      where: { id: feedbackId },
      data,
      include: {
        user: { select: { id: true, name: true, email: true } },
        team: { select: { id: true, name: true } },
      },
    });

    return success(res, { message: "Status updated.", report: updated });
  } catch (err) {
    console.error("Update feedback status error:", err);
    return error(res, "Failed to update feedback.", 500);
  }
}

// ============================================================================
// GET SINGLE FEEDBACK REPORT
// ============================================================================
export async function getFeedback(req, res) {
  try {
    const { feedbackId } = req.params;
    const { user } = req;
    const isSuperAdmin = user.globalRole === "SUPER_ADMIN";

    const report = await prisma.feedbackReport.findUnique({
      where: { id: feedbackId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        team: { select: { id: true, name: true } },
      },
    });

    if (!report) return error(res, "Feedback report not found.", 404);

    // Non-admins can only view their own reports
    if (!isSuperAdmin && report.userId !== user.id) {
      return error(res, "Not authorized.", 403);
    }

    return success(res, { report });
  } catch (err) {
    console.error("Get feedback error:", err);
    return error(res, "Failed to fetch feedback.", 500);
  }
}

// ============================================================================
// HELPER — Summary counts for admin dashboard
// ============================================================================
async function getFeedbackSummary() {
  const [open, acknowledged, inProgress, critical] = await Promise.all([
    prisma.feedbackReport.count({ where: { status: "OPEN" } }),
    prisma.feedbackReport.count({ where: { status: "ACKNOWLEDGED" } }),
    prisma.feedbackReport.count({ where: { status: "IN_PROGRESS" } }),
    prisma.feedbackReport.count({
      where: { status: "OPEN", severity: "CRITICAL" },
    }),
  ]);

  return { open, acknowledged, inProgress, critical };
}

// ============================================================================
// EXPORT FEEDBACK (SUPER_ADMIN only)
// ============================================================================
//
// Streams a downloadable CSV / JSON / Markdown of selected or filtered
// feedback reports. The Markdown format is structured so it can be pasted
// directly into any AI assistant with project context and the AI will
// understand each report well enough to propose or implement a fix.
//
// Query params (all optional except format):
//   format   — csv | json | markdown  (required)
//   ids      — comma-separated feedback IDs (overrides all filters)
//   type     — comma-separated: BUG,SUGGESTION,QUESTION
//   status   — comma-separated: OPEN,ACKNOWLEDGED,IN_PROGRESS,RESOLVED,WONT_FIX
//   severity — comma-separated: LOW,MEDIUM,HIGH,CRITICAL
//   teamId   — scope to one team
//   userId   — scope to one submitter
//   from / to — ISO dates for createdAt range
//
// Hard cap: MAX_EXPORT_ROWS = 5000 to keep memory bounded.
// Route middleware (requireSuperAdmin) enforces access — re-checked here
// as defense-in-depth.
// ============================================================================
const MAX_EXPORT_ROWS = 5000;

export async function exportFeedback(req, res) {
  try {
    // Defense in depth
    if (req.user?.globalRole !== "SUPER_ADMIN") {
      return error(res, "Not authorized.", 403, "SUPER_ADMIN_REQUIRED");
    }

    // Validate query
    const parsed = exportFeedbackQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return error(
        res,
        "Invalid export parameters.",
        400,
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      );
    }

    const { format, ids, type, status, severity, teamId, userId, from, to } =
      parsed.data;

    // Build where clause — if ids are given, they win
    const where = {};
    if (ids && ids.length > 0) {
      where.id = { in: ids };
    } else {
      if (type?.length) where.type = { in: type };
      if (status?.length) where.status = { in: status };
      if (severity?.length) where.severity = { in: severity };
      if (teamId) where.teamId = teamId;
      if (userId) where.userId = userId;
      if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = new Date(from);
        if (to) where.createdAt.lte = new Date(to);
      }
    }

    const reports = await prisma.feedbackReport.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        team: { select: { id: true, name: true } },
      },
      orderBy: [{ type: "asc" }, { createdAt: "desc" }],
      take: MAX_EXPORT_ROWS,
    });

    // Audit log
    console.log(
      `[Feedback Export] user=${req.user.id} format=${format} ` +
        `count=${reports.length} ids=${ids?.length || 0} ` +
        `filters={type:${type?.join("|") || ""},status:${status?.join("|") || ""},` +
        `severity:${severity?.join("|") || ""},teamId:${teamId || ""},` +
        `userId:${userId || ""},from:${from || ""},to:${to || ""}}`,
    );

    if (reports.length === 0) {
      return error(
        res,
        "No feedback reports match the selected filters.",
        404,
        "EXPORT_EMPTY",
      );
    }

    // Build filename
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
    const typeSlug =
      type && type.length === 1 ? type[0].toLowerCase() : "feedback";
    const ext = format === "csv" ? "csv" : format === "json" ? "json" : "md";
    const filename = `probsolver-${typeSlug}-${ts}.${ext}`;

    // Build body
    let body;
    let contentType;
    if (format === "csv") {
      body = buildCsv(reports);
      contentType = "text/csv; charset=utf-8";
    } else if (format === "json") {
      body = JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          exportedBy: { id: req.user.id, email: req.user.email },
          count: reports.length,
          filters: { ids, type, status, severity, teamId, userId, from, to },
          reports: reports.map(toPlainReport),
        },
        null,
        2,
      );
      contentType = "application/json; charset=utf-8";
    } else {
      body = buildMarkdown(reports, { exportedBy: req.user.email });
      contentType = "text/markdown; charset=utf-8";
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Disposition, X-Export-Count",
    );
    res.setHeader("X-Export-Count", String(reports.length));
    return res.status(200).send(body);
  } catch (err) {
    console.error("Export feedback error:", err);
    return error(res, "Failed to export feedback.", 500);
  }
}

// ── Plain object used by JSON format ─────────────────────
function toPlainReport(r) {
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    severity: r.severity,
    title: r.title,
    description: r.description,
    stepsToReproduce: r.stepsToReproduce,
    affectedArea: r.affectedArea,
    submitterName: r.user?.name || null,
    submitterEmail: r.user?.email || null,
    submitterId: r.userId,
    teamName: r.team?.name || null,
    teamId: r.teamId,
    adminNote: r.adminNote,
    createdAt: r.createdAt?.toISOString?.() || r.createdAt,
    updatedAt: r.updatedAt?.toISOString?.() || r.updatedAt,
    resolvedAt: r.resolvedAt
      ? r.resolvedAt.toISOString?.() || r.resolvedAt
      : null,
  };
}

// ── CSV builder (RFC 4180) ──────────────────────────────
function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

function buildCsv(reports) {
  const headers = [
    "id",
    "type",
    "status",
    "severity",
    "title",
    "description",
    "stepsToReproduce",
    "affectedArea",
    "submitterName",
    "submitterEmail",
    "teamName",
    "teamId",
    "adminNote",
    "createdAt",
    "updatedAt",
    "resolvedAt",
  ];

  // Prefix with UTF-8 BOM so Excel opens it with correct encoding
  const BOM = "\uFEFF";
  const lines = [headers.join(",")];

  for (const r of reports) {
    const row = [
      r.id,
      r.type,
      r.status,
      r.severity,
      r.title,
      r.description,
      r.stepsToReproduce || "",
      r.affectedArea || "",
      r.user?.name || "",
      r.user?.email || "",
      r.team?.name || "",
      r.teamId || "",
      r.adminNote || "",
      r.createdAt?.toISOString?.() || r.createdAt || "",
      r.updatedAt?.toISOString?.() || r.updatedAt || "",
      r.resolvedAt ? r.resolvedAt.toISOString?.() || r.resolvedAt : "",
    ];
    lines.push(row.map(csvEscape).join(","));
  }

  return BOM + lines.join("\r\n");
}

// ── Markdown builder — AI-ready format ──────────────────
// Each report is a self-contained section with all context an AI needs
// (ProbSolver project context + reproduction steps + submitter) to
// understand and resolve the issue.
function buildMarkdown(reports, { exportedBy } = {}) {
  const byType = { BUG: [], SUGGESTION: [], QUESTION: [] };
  for (const r of reports) (byType[r.type] || byType.BUG).push(r);

  const now = new Date().toISOString();
  const out = [];

  // ── Header ──────────────────────────────────────────
  out.push(`# ProbSolver — Feedback Export`);
  out.push("");
  out.push(`> Exported ${now}${exportedBy ? ` by ${exportedBy}` : ""}`);
  out.push(
    `> Total: **${reports.length}** — ` +
      `🐛 ${byType.BUG.length} bugs · ` +
      `💡 ${byType.SUGGESTION.length} suggestions · ` +
      `❓ ${byType.QUESTION.length} questions`,
  );
  out.push("");

  // ── AI instruction block ───────────────────────────
  // Gives any downstream AI the context it needs to act on these reports.
  out.push(`## Instructions for AI assistants`);
  out.push("");
  out.push(
    "These are user-submitted reports for **ProbSolver**, a production interview-preparation platform " +
      "(React 18 + Vite client, Express + PostgreSQL/pgvector server, Prisma ORM, GPT-4o for AI features). " +
      "Each report below is self-contained. For bugs, reproduction steps are provided where the submitter " +
      "included them. Treat every fix as production-grade: proper error handling, edge cases, input validation, " +
      "and no shortcuts.",
  );
  out.push("");

  // ── Table of contents ──────────────────────────────
  out.push(`## Contents`);
  out.push("");
  let idx = 1;
  for (const t of ["BUG", "SUGGESTION", "QUESTION"]) {
    if (byType[t].length === 0) continue;
    const label =
      t === "BUG" ? "Bugs" : t === "SUGGESTION" ? "Suggestions" : "Questions";
    out.push(`### ${label} (${byType[t].length})`);
    for (const r of byType[t]) {
      out.push(
        `${idx}. [${r.title}](#${slugify(`${idx}-${r.title}`)}) — \`${r.severity}\` · \`${r.status}\``,
      );
      idx++;
    }
    out.push("");
  }

  // ── Individual reports ─────────────────────────────
  idx = 1;
  for (const t of ["BUG", "SUGGESTION", "QUESTION"]) {
    if (byType[t].length === 0) continue;
    const header =
      t === "BUG"
        ? "🐛 Bugs"
        : t === "SUGGESTION"
          ? "💡 Suggestions"
          : "❓ Questions";
    out.push("---");
    out.push("");
    out.push(`# ${header}`);
    out.push("");

    for (const r of byType[t]) {
      const anchor = slugify(`${idx}-${r.title}`);
      out.push(`<a id="${anchor}"></a>`);
      out.push(`## ${idx}. ${r.title}`);
      out.push("");

      // Metadata table — compact, scannable
      out.push(`| | |`);
      out.push(`|---|---|`);
      out.push(`| **ID** | \`${r.id}\` |`);
      out.push(`| **Type** | ${r.type} |`);
      out.push(`| **Status** | ${r.status} |`);
      out.push(`| **Severity** | ${r.severity} |`);
      if (r.affectedArea) out.push(`| **Affected Area** | ${r.affectedArea} |`);
      out.push(
        `| **Submitter** | ${escapeMd(r.user?.name || "—")} (${r.user?.email || "—"}) |`,
      );
      if (r.team?.name) out.push(`| **Team** | ${escapeMd(r.team.name)} |`);
      out.push(`| **Created** | ${toIso(r.createdAt)} |`);
      if (r.resolvedAt) out.push(`| **Resolved** | ${toIso(r.resolvedAt)} |`);
      out.push("");

      // Description
      out.push(`### Description`);
      out.push("");
      out.push(r.description || "_(no description provided)_");
      out.push("");

      // Bug-specific: repro steps
      if (r.type === "BUG" && r.stepsToReproduce) {
        out.push(`### Steps to Reproduce`);
        out.push("");
        out.push("```");
        out.push(r.stepsToReproduce);
        out.push("```");
        out.push("");
      }

      // Admin note if any
      if (r.adminNote) {
        out.push(`### Admin Note`);
        out.push("");
        out.push(`> ${r.adminNote.split("\n").join("\n> ")}`);
        out.push("");
      }

      idx++;
    }
  }

  return out.join("\n");
}

// ── Markdown helpers ─────────────────────────────────
function escapeMd(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/\|/g, "\\|");
}

function toIso(d) {
  if (!d) return "";
  if (typeof d === "string") return d;
  return d.toISOString?.() || String(d);
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
