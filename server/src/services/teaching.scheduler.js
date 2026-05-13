// ============================================================================
// TEACHING SCHEDULER — fires the "starting soon" + "live now" transitions
// ============================================================================
//
// One setInterval per process; mirrors the ai.usageWriter prune cron
// pattern (no node-cron dep). Each tick runs two CAS-style claims:
//
//   1. starting_soon — sessions where scheduledAt ∈ [now, now+5min] and
//      notifiedStartingSoonAt is NULL. The CAS is `updateMany WHERE
//      notifiedStartingSoonAt IS NULL` so only one process across N
//      replicas can flip the row → no double broadcasts on multi-instance
//      deploys (Railway can scale us out anytime).
//
//   2. live_now — sessions whose scheduledAt has passed and which are
//      still SCHEDULED. Same CAS guard. Sets status=LIVE, startedAt=now,
//      then broadcasts teaching:live_now over WS so any client viewing
//      the team's calendar sees the room "go live" without polling.
//
// Failures inside a tick are caught and logged — the process must
// survive any single bad tick. interval.unref() so the cron doesn't
// keep the process alive when the rest of the server shuts down.
// ============================================================================
import prisma from "../lib/prisma.js";
import { broadcastToTeam } from "./websocket.service.js";
import {
  sendTeachingStartingSoonEmail,
  sendTeachingSessionCreatedEmail,
} from "./email.service.js";

const POLL_INTERVAL_MS = 60_000;
const STARTING_SOON_WINDOW_MS = 5 * 60_000;

let mounted = false;

export function mountTeachingScheduler() {
  if (mounted) return;
  mounted = true;

  const tick = async () => {
    try {
      const now = new Date();
      const windowEnd = new Date(now.getTime() + STARTING_SOON_WINDOW_MS);

      // ── starting_soon ────────────────────────────────────────
      // Find candidates first so we can batch-broadcast + email; the
      // CAS happens row-by-row inside the loop so each row atomically
      // records the notification once.
      const startingSoonCandidates = await prisma.teachingSession.findMany({
        where: {
          status: "SCHEDULED",
          deletedAt: null,
          scheduledAt: { gte: now, lte: windowEnd },
          notifiedStartingSoonAt: null,
        },
        select: {
          id: true,
          title: true,
          topic: true,
          teamId: true,
          hostId: true,
          scheduledAt: true,
        },
      });

      for (const s of startingSoonCandidates) {
        // CAS — only one replica wins this update.
        const { count } = await prisma.teachingSession.updateMany({
          where: { id: s.id, notifiedStartingSoonAt: null },
          data: { notifiedStartingSoonAt: new Date() },
        });
        if (count !== 1) continue;

        broadcastToTeam(s.teamId, {
          type: "teaching:starting_soon",
          sessionId: s.id,
          scheduledAt: s.scheduledAt,
          title: s.title,
        });

        // Email every team member except the host. Resend handles its
        // own rate limiting; we sequence sends so a 429 on one doesn't
        // tank the whole team's notification.
        sendStartingSoonEmails(s).catch((err) => {
          console.warn(
            `[teaching.scheduler] starting-soon email fan-out failed for ${s.id}: ${err.message}`,
          );
        });
      }

      // ── live_now ─────────────────────────────────────────────
      const liveNowCandidates = await prisma.teachingSession.findMany({
        where: {
          status: "SCHEDULED",
          deletedAt: null,
          scheduledAt: { lte: now },
          notifiedLiveNowAt: null,
        },
        select: {
          id: true,
          title: true,
          teamId: true,
          externalMeetingLink: true,
        },
      });

      for (const s of liveNowCandidates) {
        const { count } = await prisma.teachingSession.updateMany({
          where: { id: s.id, notifiedLiveNowAt: null },
          data: {
            notifiedLiveNowAt: new Date(),
            status: "LIVE",
            startedAt: new Date(),
          },
        });
        if (count !== 1) continue;

        broadcastToTeam(s.teamId, {
          type: "teaching:live_now",
          sessionId: s.id,
          externalMeetingLink: s.externalMeetingLink,
          title: s.title,
        });
      }
    } catch (err) {
      console.warn(
        `[teaching.scheduler] tick failed: ${err?.code || err?.message || err}`,
      );
    }
  };

  // First fire 90s after boot — staggered with ai.usageWriter (60s) so
  // multi-replica restarts don't all hit the DB simultaneously.
  setTimeout(tick, 90_000);
  const interval = setInterval(tick, POLL_INTERVAL_MS);
  if (interval.unref) interval.unref();
  console.log("📚 Teaching scheduler mounted (60s tick)");
}

// Fan out starting-soon emails to every active team member except the
// host. Wrapped here so failures of one recipient don't cascade.
async function sendStartingSoonEmails(session) {
  const memberships = await prisma.teamMembership.findMany({
    where: {
      teamId: session.teamId,
      isActive: true,
      userId: { not: session.hostId },
    },
    include: { user: { select: { email: true } } },
  });
  for (const m of memberships) {
    const email = m.user?.email;
    if (!email) continue;
    sendTeachingStartingSoonEmail({ to: email, session }).catch(() => {});
  }
}

// Helper exported so the controller can fan out the create-email fan
// (parallel to scheduler's starting-soon path) without re-importing
// prisma + email senders.
export async function fanOutTeachingCreatedEmails({ session, host }) {
  try {
    const memberships = await prisma.teamMembership.findMany({
      where: {
        teamId: session.teamId,
        isActive: true,
        userId: { not: session.hostId },
      },
      include: { user: { select: { email: true } } },
    });
    for (const m of memberships) {
      const email = m.user?.email;
      if (!email) continue;
      sendTeachingSessionCreatedEmail({
        to: email,
        hostName: host?.name || null,
        session,
      }).catch(() => {});
    }
  } catch (err) {
    console.warn(
      `[teaching.scheduler] created-email fan-out failed for ${session.id}: ${err.message}`,
    );
  }
}
