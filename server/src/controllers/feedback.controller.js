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
