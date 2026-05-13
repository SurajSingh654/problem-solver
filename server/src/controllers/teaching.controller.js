// ============================================================================
// ProbSolver — Team Teaching Sessions Controller
// ============================================================================
//
// Members of an ACTIVE team schedule peer-to-peer knowledge-sharing
// sessions. v1 scope = link-only (host supplies an external meeting URL)
// + post-session markdown notes. The in-app live room (P1) is presence
// + Q&A only over the existing WebSocket; no recording.
//
// Every endpoint here is gated by `requireTeamContext` upstream so
// `req.teamId` is the canonical scope. Personal teams (isPersonal) are
// not blocked at the controller level — they get the feature too, the
// session list will just always be empty (no peers).
//
// This file ships in P0: create / list / detail / patch / delete /
// transition (start, end, cancel). Notes-submit (P3), rating (P2),
// flag (P2), join/leave (P1) live in their own commits but follow the
// same controller conventions established here.
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { broadcastToTeam } from "../services/websocket.service.js";
import { aiComplete, AIError } from "../services/ai.service.js";
import {
  teachingSummaryPrompt,
  teachingQuizPrompt,
  teachingTopicCoveragePrompt,
  TEACHING_SUMMARY_FEWSHOT,
  TEACHING_QUIZ_FEWSHOT,
  TEACHING_COVERAGE_FEWSHOT,
} from "../services/ai.prompts.js";
import {
  validateTeachingSummary,
  validateTeachingQuiz,
  validateTeachingTopicCoverage,
} from "../services/ai.validators.js";
import {
  buildFallbackTeachingSummary,
  buildFallbackTeachingQuiz,
  buildFallbackTeachingTopicCoverage,
} from "../services/ai.fallbacks.js";
import { AI_MODEL_FAST } from "../config/env.js";
import {
  sendTeachingEndedEmail,
  sendTeachingFlaggedEmail,
} from "../services/email.service.js";
import { fanOutTeachingCreatedEmails } from "../services/teaching.scheduler.js";

// Sessions a candidate user can see vs sessions a host/admin can see —
// non-COMPLETED sessions hide the host's `notes` from non-host viewers.
function dtoForViewer(session, viewerId, isAdmin) {
  if (!session) return null;
  const isHost = session.hostId === viewerId;
  const exposeNotes = isHost || isAdmin || session.status === "COMPLETED";
  return {
    id: session.id,
    teamId: session.teamId,
    hostId: session.hostId,
    host: session.host
      ? {
          id: session.host.id,
          name: session.host.name,
          email: session.host.email,
        }
      : null,
    title: session.title,
    topic: session.topic,
    description: session.description,
    externalMeetingLink: session.externalMeetingLink,
    capacity: session.capacity,
    status: session.status,
    scheduledAt: session.scheduledAt,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    notes: exposeNotes ? session.notes : null,
    summary: session.status === "COMPLETED" ? session.summary : null,
    quiz: session.status === "COMPLETED" ? session.quiz : null,
    topicCoverage: session.status === "COMPLETED" ? session.topicCoverage : null,
    aiGeneratedAt: session.aiGeneratedAt,
    flagCount: isAdmin ? session.flagCount : undefined,
    attendeesCount: session.attendees?.length ?? undefined,
    ratingsCount: session.ratings?.length ?? undefined,
    avgRating:
      session.ratings && session.ratings.length > 0
        ? Math.round(
            (session.ratings.reduce((s, r) => s + r.rating, 0) /
              session.ratings.length) * 10,
          ) / 10
        : null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function isTeamAdmin(req) {
  return (
    req.user.teamRole === "TEAM_ADMIN" || req.user.globalRole === "SUPER_ADMIN"
  );
}

// ============================================================================
// CREATE
// ============================================================================
//
// Open creation — any member of an ACTIVE team can schedule a session.
// `scheduledAt` must be in the future. The cron lifts the row to LIVE
// at the scheduled time; the host can also start manually via
// POST /teaching/:id/start.
// ============================================================================
export async function createTeachingSession(req, res) {
  try {
    const userId = req.user.id;
    const teamId = req.teamId;
    const {
      title,
      topic,
      description,
      externalMeetingLink,
      capacity,
      scheduledAt,
    } = req.body || {};

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return error(res, "Title is required.", 400);
    }
    if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
      return error(res, "Topic is required.", 400);
    }
    if (!scheduledAt) {
      return error(res, "scheduledAt is required (ISO date).", 400);
    }
    const scheduledDate = new Date(scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      return error(res, "scheduledAt must be a valid ISO date.", 400);
    }
    if (scheduledDate.getTime() <= Date.now()) {
      return error(res, "scheduledAt must be in the future.", 400);
    }

    const cap = Number.isFinite(parseInt(capacity, 10))
      ? Math.max(2, Math.min(parseInt(capacity, 10), 200))
      : 20;

    const created = await prisma.teachingSession.create({
      data: {
        teamId,
        hostId: userId,
        title: title.trim(),
        topic: topic.trim(),
        description: description?.trim() || null,
        externalMeetingLink: externalMeetingLink?.trim() || null,
        capacity: cap,
        scheduledAt: scheduledDate,
        status: "SCHEDULED",
      },
      include: {
        host: { select: { id: true, name: true, email: true } },
      },
    });

    // Fire-and-forget create-email fan to every team member except
    // the host. Wrapped inside the helper, so a Resend hiccup doesn't
    // affect the response.
    fanOutTeachingCreatedEmails({ session: created, host: created.host });

    return success(
      res,
      { session: dtoForViewer(created, userId, isTeamAdmin(req)) },
      201,
    );
  } catch (err) {
    console.error("Create teaching session error:", err);
    return error(res, "Failed to create teaching session.", 500);
  }
}

// ============================================================================
// LIST
// ============================================================================
//
// Filterable + paginated. Default ordering: upcoming first (scheduledAt
// asc) then past (scheduledAt desc) — the calendar component splits
// these client-side. The hot-path index (teamId, status, scheduledAt)
// covers both halves.
// ============================================================================
export async function listTeachingSessions(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;
    const isAdmin = isTeamAdmin(req);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const { status, hostId, topic, from, to } = req.query;

    const where = { teamId, deletedAt: null };
    if (status) where.status = status;
    if (hostId) where.hostId = hostId;
    if (topic) where.topic = { contains: topic, mode: "insensitive" };
    if (from || to) {
      where.scheduledAt = {};
      if (from) where.scheduledAt.gte = new Date(from);
      if (to) where.scheduledAt.lte = new Date(to);
    }

    const [rows, total] = await Promise.all([
      prisma.teachingSession.findMany({
        where,
        orderBy: [{ scheduledAt: "desc" }],
        take: limit,
        skip: offset,
        include: {
          host: { select: { id: true, name: true, email: true } },
          ratings: { select: { rating: true } },
          attendees: { select: { id: true } },
        },
      }),
      prisma.teachingSession.count({ where }),
    ]);

    const sessions = rows.map((s) => dtoForViewer(s, userId, isAdmin));
    return success(res, {
      sessions,
      pagination: { total, limit, offset },
    });
  } catch (err) {
    console.error("List teaching sessions error:", err);
    return error(res, "Failed to list teaching sessions.", 500);
  }
}

// ============================================================================
// DETAIL
// ============================================================================
//
// Includes ratings + attendees for the detail page tabs. Returns 404 if
// the session isn't in the caller's team — never leaks cross-team data.
// ============================================================================
export async function getTeachingSession(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;
    const isAdmin = isTeamAdmin(req);
    const { id } = req.params;

    const session = await prisma.teachingSession.findFirst({
      where: { id, teamId, deletedAt: null },
      include: {
        host: { select: { id: true, name: true, email: true } },
        ratings: {
          include: {
            rater: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        attendees: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { joinedAt: "asc" },
        },
        // Flags hidden from non-admin viewers — DTO function strips
        // flagCount too. Keep flags off the include for non-admins.
        ...(isAdmin
          ? {
              flags: {
                where: { status: "OPEN" },
                orderBy: { createdAt: "desc" },
              },
            }
          : {}),
      },
    });

    if (!session) {
      return error(res, "Teaching session not found.", 404);
    }

    // Detail DTO carries more than the list DTO — ratings + attendees.
    const dto = dtoForViewer(session, userId, isAdmin);
    dto.ratings = session.ratings.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      peerLearned: r.peerLearned,
      raterId: r.raterId,
      raterName: r.rater?.name || null,
      // Email exposure: admins always; non-admins only see their own
      // rater email (privacy nuance — peers shouldn't doxx each other).
      raterEmail: isAdmin || r.raterId === userId ? r.rater?.email : null,
      createdAt: r.createdAt,
    }));
    dto.attendees = session.attendees.map((a) => ({
      id: a.id,
      userId: a.userId,
      userName: a.user?.name || null,
      userEmail: isAdmin || a.userId === userId ? a.user?.email : null,
      joinedAt: a.joinedAt,
      leftAt: a.leftAt,
      durationMs: a.durationMs,
    }));
    if (isAdmin) {
      dto.flags = (session.flags || []).map((f) => ({
        id: f.id,
        reason: f.reason,
        status: f.status,
        reporterId: f.reporterId,
        createdAt: f.createdAt,
      }));
    }

    return success(res, { session: dto });
  } catch (err) {
    console.error("Get teaching session error:", err);
    return error(res, "Failed to load teaching session.", 500);
  }
}

// ============================================================================
// PATCH (host or admin, only before LIVE)
// ============================================================================
export async function updateTeachingSession(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;
    const isAdmin = isTeamAdmin(req);
    const { id } = req.params;

    const existing = await prisma.teachingSession.findFirst({
      where: { id, teamId, deletedAt: null },
      select: { id: true, hostId: true, status: true },
    });
    if (!existing) return error(res, "Teaching session not found.", 404);
    if (existing.hostId !== userId && !isAdmin) {
      return error(res, "Only the host or a team admin can edit this session.", 403);
    }
    if (existing.status !== "DRAFT" && existing.status !== "SCHEDULED") {
      return error(
        res,
        `Cannot edit a ${existing.status.toLowerCase()} session.`,
        409,
        "INVALID_TRANSITION",
      );
    }

    const allowed = [
      "title",
      "topic",
      "description",
      "externalMeetingLink",
      "capacity",
      "scheduledAt",
    ];
    const data = {};
    for (const key of allowed) {
      if (req.body && Object.prototype.hasOwnProperty.call(req.body, key)) {
        data[key] = req.body[key];
      }
    }
    if (data.title === "" || data.topic === "") {
      return error(res, "Title and topic must be non-empty.", 400);
    }
    if (data.scheduledAt) {
      const d = new Date(data.scheduledAt);
      if (Number.isNaN(d.getTime())) {
        return error(res, "scheduledAt must be a valid ISO date.", 400);
      }
      if (d.getTime() <= Date.now()) {
        return error(res, "scheduledAt must be in the future.", 400);
      }
      data.scheduledAt = d;
      // Reset notify flags so the cron re-fires for the new time.
      data.notifiedStartingSoonAt = null;
      data.notifiedLiveNowAt = null;
    }
    if (data.capacity !== undefined) {
      const cap = parseInt(data.capacity, 10);
      if (!Number.isFinite(cap) || cap < 2 || cap > 200) {
        return error(res, "capacity must be 2-200.", 400);
      }
      data.capacity = cap;
    }

    const updated = await prisma.teachingSession.update({
      where: { id },
      data,
      include: {
        host: { select: { id: true, name: true, email: true } },
      },
    });

    return success(res, { session: dtoForViewer(updated, userId, isAdmin) });
  } catch (err) {
    console.error("Update teaching session error:", err);
    return error(res, "Failed to update teaching session.", 500);
  }
}

// ============================================================================
// CANCEL (host or admin, any non-COMPLETED state)
// ============================================================================
//
// Soft-delete + status flip. We keep the row around so attendee/rating
// data persists for the host's history; the row is hidden from list
// queries via the deletedAt filter.
// ============================================================================
export async function cancelTeachingSession(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;
    const isAdmin = isTeamAdmin(req);
    const { id } = req.params;

    const existing = await prisma.teachingSession.findFirst({
      where: { id, teamId, deletedAt: null },
      select: { id: true, hostId: true, status: true },
    });
    if (!existing) return error(res, "Teaching session not found.", 404);
    if (existing.hostId !== userId && !isAdmin) {
      return error(res, "Only the host or a team admin can cancel.", 403);
    }
    if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
      return error(
        res,
        `Cannot cancel a ${existing.status.toLowerCase()} session.`,
        409,
        "INVALID_TRANSITION",
      );
    }

    const updated = await prisma.teachingSession.update({
      where: { id },
      data: { status: "CANCELLED", deletedAt: new Date() },
      include: {
        host: { select: { id: true, name: true, email: true } },
      },
    });

    return success(res, { session: dtoForViewer(updated, userId, isAdmin) });
  } catch (err) {
    console.error("Cancel teaching session error:", err);
    return error(res, "Failed to cancel teaching session.", 500);
  }
}

// ============================================================================
// START / END (host only)
// ============================================================================
//
// `start` is host-initiated; the cron also auto-starts at scheduledAt.
// Both paths set `startedAt` exactly once via CAS-style guard
// (only flips SCHEDULED → LIVE).
// ============================================================================
export async function startTeachingSession(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;
    const { id } = req.params;

    const existing = await prisma.teachingSession.findFirst({
      where: { id, teamId, deletedAt: null },
      select: { id: true, hostId: true, status: true },
    });
    if (!existing) return error(res, "Teaching session not found.", 404);
    if (existing.hostId !== userId) {
      return error(res, "Only the host can start this session.", 403);
    }
    if (existing.status !== "SCHEDULED" && existing.status !== "DRAFT") {
      return error(
        res,
        `Cannot start a ${existing.status.toLowerCase()} session.`,
        409,
        "INVALID_TRANSITION",
      );
    }

    const updated = await prisma.teachingSession.update({
      where: { id },
      data: { status: "LIVE", startedAt: new Date() },
      include: {
        host: { select: { id: true, name: true, email: true } },
      },
    });

    // Broadcast to every connected ws in this team so attendees can
    // refresh / show "Join" CTA without polling.
    broadcastToTeam(updated.teamId, {
      type: "teaching:live_now",
      sessionId: updated.id,
      externalMeetingLink: updated.externalMeetingLink,
    });

    return success(res, {
      session: dtoForViewer(updated, userId, isTeamAdmin(req)),
    });
  } catch (err) {
    console.error("Start teaching session error:", err);
    return error(res, "Failed to start teaching session.", 500);
  }
}

export async function endTeachingSession(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;
    const { id } = req.params;

    const existing = await prisma.teachingSession.findFirst({
      where: { id, teamId, deletedAt: null },
      select: { id: true, hostId: true, status: true },
    });
    if (!existing) return error(res, "Teaching session not found.", 404);
    if (existing.hostId !== userId) {
      return error(res, "Only the host can end this session.", 403);
    }
    if (existing.status !== "LIVE") {
      return error(
        res,
        `Cannot end a ${existing.status.toLowerCase()} session.`,
        409,
        "INVALID_TRANSITION",
      );
    }

    const updated = await prisma.teachingSession.update({
      where: { id },
      data: { status: "COMPLETED", endedAt: new Date() },
      include: {
        host: { select: { id: true, name: true, email: true } },
      },
    });

    broadcastToTeam(updated.teamId, {
      type: "teaching:ended",
      sessionId: updated.id,
    });

    // Nudge the host to add notes — the AI artifacts only generate
    // once they do. Fire-and-forget; failure logged inside email layer.
    if (updated.host?.email) {
      sendTeachingEndedEmail({
        to: updated.host.email,
        session: updated,
      }).catch(() => {});
    }

    return success(res, {
      session: dtoForViewer(updated, userId, isTeamAdmin(req)),
    });
  } catch (err) {
    console.error("End teaching session error:", err);
    return error(res, "Failed to end teaching session.", 500);
  }
}

// ============================================================================
// JOIN / LEAVE — REST mirrors of the WS handlers
// ============================================================================
//
// The WS handlers are the canonical path for joining the live room.
// The REST endpoints are the safety net for page reloads + clients
// that lose their socket — they upsert the same TeachingAttendee row
// so attendance is reliably recorded. Calling REST is idempotent: if
// the user already has an active row, joinedAt is refreshed; if they
// just left, a new join cycle starts.
// ============================================================================
export async function joinTeachingSession(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;
    const { id } = req.params;

    const session = await prisma.teachingSession.findFirst({
      where: { id, teamId, deletedAt: null },
      select: { id: true, status: true, hostId: true, capacity: true },
    });
    if (!session) return error(res, "Teaching session not found.", 404);
    if (session.status === "CANCELLED" || session.status === "COMPLETED") {
      return error(
        res,
        `Cannot join a ${session.status.toLowerCase()} session.`,
        409,
        "INVALID_TRANSITION",
      );
    }

    if (userId !== session.hostId) {
      const activeCount = await prisma.teachingAttendee.count({
        where: { sessionId: id, leftAt: null },
      });
      if (activeCount >= session.capacity) {
        return error(res, "Session is at capacity.", 409, "AT_CAPACITY");
      }
    }

    const attendee = await prisma.teachingAttendee.upsert({
      where: { sessionId_userId: { sessionId: id, userId } },
      create: { sessionId: id, userId },
      update: { joinedAt: new Date(), leftAt: null, durationMs: null },
    });

    return success(res, {
      attendee: {
        id: attendee.id,
        sessionId: attendee.sessionId,
        userId: attendee.userId,
        joinedAt: attendee.joinedAt,
      },
    });
  } catch (err) {
    console.error("Join teaching session error:", err);
    return error(res, "Failed to join teaching session.", 500);
  }
}

// ============================================================================
// RATE — peer rating after the session
// ============================================================================
//
// Constraints:
//   • Caller must have attended (TeachingAttendee row exists).
//   • Host cannot rate themselves.
//   • Session must be COMPLETED.
//   • One rating per (sessionId, raterId) — uniqueness enforced by Prisma.
//   • Rating is 1-5; comment optional; peerLearned defaults false.
// ============================================================================
export async function rateTeachingSession(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;
    const { id } = req.params;
    const { rating, comment, peerLearned } = req.body || {};

    const ratingNum = parseInt(rating, 10);
    if (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return error(res, "rating must be an integer 1-5.", 400);
    }

    const session = await prisma.teachingSession.findFirst({
      where: { id, teamId, deletedAt: null },
      select: { id: true, hostId: true, status: true },
    });
    if (!session) return error(res, "Teaching session not found.", 404);
    if (session.status !== "COMPLETED") {
      return error(
        res,
        "Ratings unlock once the session is completed.",
        409,
        "INVALID_TRANSITION",
      );
    }
    if (session.hostId === userId) {
      return error(res, "Hosts cannot rate their own session.", 403);
    }

    const attended = await prisma.teachingAttendee.findUnique({
      where: { sessionId_userId: { sessionId: id, userId } },
      select: { id: true },
    });
    if (!attended) {
      return error(res, "Only attendees can rate this session.", 403);
    }

    // Uniqueness — one rating per (session, rater).
    const existing = await prisma.teachingRating.findUnique({
      where: { sessionId_raterId: { sessionId: id, raterId: userId } },
      select: { id: true },
    });
    if (existing) {
      return error(
        res,
        "You've already rated this session.",
        409,
        "DUPLICATE_RATING",
      );
    }

    const created = await prisma.teachingRating.create({
      data: {
        sessionId: id,
        raterId: userId,
        rating: ratingNum,
        comment: typeof comment === "string" ? comment.trim() || null : null,
        peerLearned: !!peerLearned,
      },
    });

    return success(
      res,
      {
        rating: {
          id: created.id,
          sessionId: created.sessionId,
          rating: created.rating,
          comment: created.comment,
          peerLearned: created.peerLearned,
          createdAt: created.createdAt,
        },
      },
      201,
    );
  } catch (err) {
    console.error("Rate teaching session error:", err);
    return error(res, "Failed to submit rating.", 500);
  }
}

// ============================================================================
// FLAG — any team member can flag a session for admin review
// ============================================================================
//
// Increments flagCount on the session for visibility in admin lists +
// inserts a TeachingFlag row with the reporter's reason. No dedup —
// multiple members can flag the same session for different reasons.
// Self-flagging is allowed (a host who realizes their topic was wrong).
// ============================================================================
export async function flagTeachingSession(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;
    const { id } = req.params;
    const reason = (req.body?.reason || "").trim();

    if (!reason || reason.length < 3) {
      return error(res, "reason must be at least 3 characters.", 400);
    }
    if (reason.length > 500) {
      return error(res, "reason must be 500 characters or fewer.", 400);
    }

    const session = await prisma.teachingSession.findFirst({
      where: { id, teamId, deletedAt: null },
      select: { id: true },
    });
    if (!session) return error(res, "Teaching session not found.", 404);

    const flag = await prisma.$transaction(async (tx) => {
      const created = await tx.teachingFlag.create({
        data: { sessionId: id, reporterId: userId, reason },
      });
      await tx.teachingSession.update({
        where: { id },
        data: { flagCount: { increment: 1 } },
      });
      return created;
    });

    // Notify team admins async. Don't block the response on the
    // membership query; if it fails we log + continue.
    notifyTeamAdminsOfFlag({ teamId, flag, sessionRef: { id, title: undefined } }).catch(
      (err) => {
        console.warn(
          `[teaching] flag-email fan-out failed for ${id}: ${err.message}`,
        );
      },
    );

    return success(
      res,
      {
        flag: {
          id: flag.id,
          sessionId: flag.sessionId,
          reason: flag.reason,
          status: flag.status,
          createdAt: flag.createdAt,
        },
      },
      201,
    );
  } catch (err) {
    console.error("Flag teaching session error:", err);
    return error(res, "Failed to flag teaching session.", 500);
  }
}

// Helper: lookup TEAM_ADMIN members + email each one. Co-located with
// the flag controller because that's the only caller; pulls `title`
// fresh from DB so the email body has it.
async function notifyTeamAdminsOfFlag({ teamId, flag, sessionRef }) {
  const session = await prisma.teachingSession.findUnique({
    where: { id: sessionRef.id },
    select: { id: true, title: true },
  });
  if (!session) return;
  const admins = await prisma.teamMembership.findMany({
    where: { teamId, role: "TEAM_ADMIN", isActive: true },
    include: { user: { select: { email: true } } },
  });
  for (const a of admins) {
    const email = a.user?.email;
    if (!email) continue;
    sendTeachingFlaggedEmail({ to: email, session, flag }).catch(() => {});
  }
}

// ============================================================================
// ADMIN — list flags / dismiss / uphold
// ============================================================================
//
// Visible to TEAM_ADMIN of the team that owns the flagged session, OR to
// any SUPER_ADMIN. Default filter: status=OPEN. Pagination via limit + offset.
// Includes the session + reporter so the admin can see context without an
// extra fetch.
// ============================================================================
export async function listTeachingFlags(req, res) {
  try {
    const teamId = req.teamId;
    if (!isTeamAdmin(req)) {
      return error(res, "Team admin access required.", 403);
    }

    const limit = Math.min(100, parseInt(req.query.limit, 10) || 25);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const status = req.query.status || "OPEN";

    const where = {
      session: { teamId, deletedAt: null },
    };
    if (status !== "ALL") where.status = status;

    const [flags, total, openCount] = await Promise.all([
      prisma.teachingFlag.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          reporter: { select: { id: true, name: true, email: true } },
          session: {
            select: {
              id: true,
              title: true,
              topic: true,
              status: true,
              hostId: true,
              host: { select: { id: true, name: true, email: true } },
              flagCount: true,
              scheduledAt: true,
              endedAt: true,
            },
          },
        },
      }),
      prisma.teachingFlag.count({ where }),
      prisma.teachingFlag.count({
        where: { session: { teamId, deletedAt: null }, status: "OPEN" },
      }),
    ]);

    return success(res, {
      flags,
      pagination: { total, limit, offset },
      stats: { openCount },
    });
  } catch (err) {
    console.error("List teaching flags error:", err);
    return error(res, "Failed to load flags.", 500);
  }
}

export async function dismissTeachingFlag(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;
    if (!isTeamAdmin(req)) {
      return error(res, "Team admin access required.", 403);
    }
    const { flagId } = req.params;
    const note = (req.body?.resolutionNote || "").trim() || null;

    const flag = await prisma.teachingFlag.findFirst({
      where: { id: flagId, session: { teamId } },
      select: { id: true, status: true },
    });
    if (!flag) return error(res, "Flag not found.", 404);
    if (flag.status !== "OPEN") {
      return error(
        res,
        `Flag is already ${flag.status.toLowerCase()}.`,
        409,
        "ALREADY_RESOLVED",
      );
    }

    const updated = await prisma.teachingFlag.update({
      where: { id: flagId },
      data: {
        status: "DISMISSED",
        resolvedById: userId,
        resolvedAt: new Date(),
        resolutionNote: note,
      },
    });

    return success(res, { flag: updated });
  } catch (err) {
    console.error("Dismiss teaching flag error:", err);
    return error(res, "Failed to dismiss flag.", 500);
  }
}

// Upholding a flag cancels the underlying session and broadcasts the
// teaching:ended event so any connected attendees see the room close.
// Mirrors the controller's `cancel` behavior for the session itself.
export async function upholdTeachingFlag(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;
    if (!isTeamAdmin(req)) {
      return error(res, "Team admin access required.", 403);
    }
    const { flagId } = req.params;
    const note = (req.body?.resolutionNote || "").trim() || null;

    const flag = await prisma.teachingFlag.findFirst({
      where: { id: flagId, session: { teamId } },
      include: {
        session: { select: { id: true, status: true, deletedAt: true } },
      },
    });
    if (!flag) return error(res, "Flag not found.", 404);
    if (flag.status !== "OPEN") {
      return error(
        res,
        `Flag is already ${flag.status.toLowerCase()}.`,
        409,
        "ALREADY_RESOLVED",
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedFlag = await tx.teachingFlag.update({
        where: { id: flagId },
        data: {
          status: "REVIEWED",
          resolvedById: userId,
          resolvedAt: new Date(),
          resolutionNote: note,
        },
      });
      // Cancel the session if it isn't already terminal.
      if (
        flag.session &&
        !flag.session.deletedAt &&
        flag.session.status !== "COMPLETED" &&
        flag.session.status !== "CANCELLED"
      ) {
        await tx.teachingSession.update({
          where: { id: flag.session.id },
          data: { status: "CANCELLED", deletedAt: new Date() },
        });
      }
      return updatedFlag;
    });

    // Notify everyone in the team that the session ended (room closes).
    broadcastToTeam(teamId, {
      type: "teaching:ended",
      sessionId: flag.sessionId,
      reason: "flag_upheld",
    });

    return success(res, { flag: result });
  } catch (err) {
    console.error("Uphold teaching flag error:", err);
    return error(res, "Failed to uphold flag.", 500);
  }
}

export async function leaveTeachingSession(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;
    const { id } = req.params;

    const session = await prisma.teachingSession.findFirst({
      where: { id, teamId, deletedAt: null },
      select: { id: true },
    });
    if (!session) return error(res, "Teaching session not found.", 404);

    const existing = await prisma.teachingAttendee.findUnique({
      where: { sessionId_userId: { sessionId: id, userId } },
      select: { id: true, joinedAt: true, leftAt: true },
    });
    if (!existing || existing.leftAt) {
      return success(res, { ok: true });
    }

    await prisma.teachingAttendee.update({
      where: { id: existing.id },
      data: {
        leftAt: new Date(),
        durationMs: existing.joinedAt
          ? Date.now() - new Date(existing.joinedAt).getTime()
          : null,
      },
    });

    return success(res, { ok: true });
  } catch (err) {
    console.error("Leave teaching session error:", err);
    return error(res, "Failed to leave teaching session.", 500);
  }
}

// ============================================================================
// SUBMIT NOTES — host posts markdown notes; kicks off 3 AI surfaces async
// ============================================================================
//
// Flow:
//   1. Persist `notes` immediately and return success — the host shouldn't
//      wait for the AI calls to round-trip.
//   2. In the background, fire all three AI prompts in parallel via
//      Promise.allSettled. Each is independently validated; on failure
//      the matching deterministic fallback is persisted instead.
//   3. The detail-page poll (3s for 30s after submit) sees the artifacts
//      appear as they finish.
//
// Constraints:
//   • Host only.
//   • Session must be COMPLETED (notes are post-session).
//   • Notes must be 50-20,000 chars (validator + LLM context guards).
// ============================================================================
async function runTeachingAiSurfaces({
  sessionId,
  topic,
  notesMarkdown,
  hostName,
  hostUserId,
  teamId,
}) {
  const hasNotes = isNonEmptyMarkdown(notesMarkdown);

  // Build the three (system, user) pairs.
  const summarySys = teachingSummaryPrompt({
    topic,
    notesMarkdown,
    hostName,
  });
  const quizSys = teachingQuizPrompt({ topic, notesMarkdown });
  const coverageSys = teachingTopicCoveragePrompt({ topic, notesMarkdown });

  const callOpts = (system, user, fewShot, surface, temperature) => ({
    systemPrompt: system,
    userPrompt: user,
    userId: hostUserId,
    teamId,
    model: AI_MODEL_FAST,
    temperature,
    maxTokens: 1500,
    jsonMode: true,
    fewShotMessages: fewShot,
    surface,
  });

  const [summaryRes, quizRes, coverageRes] = await Promise.allSettled([
    aiComplete(
      callOpts(
        summarySys.system,
        summarySys.user,
        TEACHING_SUMMARY_FEWSHOT,
        "teaching:summary",
        0.5,
      ),
    ),
    aiComplete(
      callOpts(
        quizSys.system,
        quizSys.user,
        TEACHING_QUIZ_FEWSHOT,
        "teaching:quiz",
        0.6,
      ),
    ),
    aiComplete(
      callOpts(
        coverageSys.system,
        coverageSys.user,
        TEACHING_COVERAGE_FEWSHOT,
        "teaching:coverage",
        0.3,
      ),
    ),
  ]);

  // Validate or fall back per-surface.
  let summary;
  if (summaryRes.status === "fulfilled") {
    const check = validateTeachingSummary(summaryRes.value, { hasNotes });
    if (check.valid) summary = summaryRes.value;
    else {
      console.warn(
        `[teaching:summary] validation failed for session ${sessionId}: ${check.violations.join(", ")}`,
      );
      summary = {
        ...buildFallbackTeachingSummary({ topic, notesMarkdown }),
        _fallbackReason: check.violations,
      };
    }
  } else {
    console.warn(
      `[teaching:summary] AI failed for session ${sessionId}: ${
        summaryRes.reason?.code || summaryRes.reason?.message || "unknown"
      }`,
    );
    summary = {
      ...buildFallbackTeachingSummary({ topic, notesMarkdown }),
      _fallbackReason: [
        `llm-error:${summaryRes.reason?.code || summaryRes.reason?.message || "unknown"}`,
      ],
    };
  }

  let quiz;
  if (quizRes.status === "fulfilled") {
    const check = validateTeachingQuiz(quizRes.value);
    if (check.valid) quiz = quizRes.value;
    else {
      console.warn(
        `[teaching:quiz] validation failed for session ${sessionId}: ${check.violations.join(", ")}`,
      );
      quiz = {
        ...buildFallbackTeachingQuiz({ topic }),
        _fallbackReason: check.violations,
      };
    }
  } else {
    console.warn(
      `[teaching:quiz] AI failed for session ${sessionId}: ${
        quizRes.reason?.code || quizRes.reason?.message || "unknown"
      }`,
    );
    quiz = {
      ...buildFallbackTeachingQuiz({ topic }),
      _fallbackReason: [
        `llm-error:${quizRes.reason?.code || quizRes.reason?.message || "unknown"}`,
      ],
    };
  }

  let topicCoverage;
  if (coverageRes.status === "fulfilled") {
    const check = validateTeachingTopicCoverage(coverageRes.value);
    if (check.valid) topicCoverage = coverageRes.value;
    else {
      console.warn(
        `[teaching:coverage] validation failed for session ${sessionId}: ${check.violations.join(", ")}`,
      );
      topicCoverage = {
        ...buildFallbackTeachingTopicCoverage({ topic, notesMarkdown }),
        _fallbackReason: check.violations,
      };
    }
  } else {
    console.warn(
      `[teaching:coverage] AI failed for session ${sessionId}: ${
        coverageRes.reason?.code || coverageRes.reason?.message || "unknown"
      }`,
    );
    topicCoverage = {
      ...buildFallbackTeachingTopicCoverage({ topic, notesMarkdown }),
      _fallbackReason: [
        `llm-error:${coverageRes.reason?.code || coverageRes.reason?.message || "unknown"}`,
      ],
    };
  }

  // Persist all three at once. If the session was deleted between
  // submit and now, updateMany no-ops.
  await prisma.teachingSession
    .updateMany({
      where: { id: sessionId },
      data: {
        summary,
        quiz,
        topicCoverage,
        aiGeneratedAt: new Date(),
      },
    })
    .catch((err) => {
      console.error(
        `[teaching] failed to persist AI artifacts for ${sessionId}:`,
        err.message,
      );
    });
}

function isNonEmptyMarkdown(s) {
  return typeof s === "string" && s.trim().length > 0;
}

export async function submitTeachingNotes(req, res) {
  try {
    const teamId = req.teamId;
    const userId = req.user.id;
    const { id } = req.params;
    const notes = typeof req.body?.notes === "string" ? req.body.notes : "";

    const trimmed = notes.trim();
    if (trimmed.length < 50) {
      return error(
        res,
        "Notes must be at least 50 characters. Add some real content before submitting.",
        400,
      );
    }
    if (trimmed.length > 20_000) {
      return error(res, "Notes must be 20,000 characters or fewer.", 400);
    }

    const session = await prisma.teachingSession.findFirst({
      where: { id, teamId, deletedAt: null },
      include: {
        host: { select: { id: true, name: true } },
      },
    });
    if (!session) return error(res, "Teaching session not found.", 404);
    if (session.hostId !== userId) {
      return error(res, "Only the host can submit notes.", 403);
    }
    if (session.status !== "COMPLETED") {
      return error(
        res,
        "Submit notes after ending the session.",
        409,
        "INVALID_TRANSITION",
      );
    }

    // Persist notes immediately. AI artifacts run in the background.
    const updated = await prisma.teachingSession.update({
      where: { id },
      data: {
        notes: trimmed,
        // Clear stale artifacts when notes are re-submitted; the
        // background job overwrites them shortly.
        summary: null,
        quiz: null,
        topicCoverage: null,
        aiGeneratedAt: null,
      },
      include: {
        host: { select: { id: true, name: true, email: true } },
      },
    });

    // Fire-and-forget AI generation. Errors are logged inside; we never
    // block the host's notes-submit response on the model.
    runTeachingAiSurfaces({
      sessionId: id,
      topic: session.topic,
      notesMarkdown: trimmed,
      hostName: session.host?.name || null,
      hostUserId: userId,
      teamId,
    }).catch((err) => {
      console.error(`[teaching] AI surfaces dispatch failed for ${id}:`, err);
    });

    return success(res, {
      session: dtoForViewer(updated, userId, isTeamAdmin(req)),
      aiPending: true,
    });
  } catch (err) {
    if (err instanceof AIError && err.code === "RATE_LIMITED") {
      return error(res, err.message, 429, err.code);
    }
    console.error("Submit teaching notes error:", err);
    return error(res, "Failed to submit notes.", 500);
  }
}
