// ============================================================================
// Mentor Orchestrator — v1.2 skeleton (hand-coded rules)
// ============================================================================
//
// Three pure functions over the Topic Mastery Tracks data model:
//
//   planNextAction(userId, topicId, teamId) → { stage, concept, surface, minutes, reason }
//   detectStuck(userId, topicId, teamId)    → { stuck, signals[], recommendation }
//   updateMastery(userId, conceptId, signal) → updated ConceptMastery row
//
// v1.2 = hand-coded rules. The shape of these functions is locked here so
// future versions can swap in LLM-driven personalization (RAG, calibration-
// aware planning, learning-style adaptation) without changing call sites.
//
// ARCHITECTURAL CONSTRAINTS:
//   - All inputs from these functions are READ from curated, validated DB
//     state. They never invent facts. (LLM additions in later versions
//     will retrieve over the curated KB, never improvise.)
//   - Stage signals (INTAKE / EXPLORE / REFLECT / TEACH / VALIDATE) map
//     1:1 to existing ProbSolver surfaces — no new evaluation pipelines.
//
// TENANCY (W6.T1):
//   - `planNextAction`, `detectStuck`, and the internal `loadTopicState`
//     REQUIRE a `teamId` argument and throw when it is missing. The team
//     filter is threaded into every Prisma `concept.findMany` and
//     `conceptMastery.findMany` clause so a user who is a member of two
//     teams cannot have Team A evidence bleed into Team B decisions.
//     Callers MUST NOT read `req.user.currentTeamId` — see CLAUDE.md
//     multi-tenancy invariants.
// ============================================================================

import prisma from "../lib/prisma.js";

// ── Tunables ─────────────────────────────────────────────────────────
// Mastery score thresholds. These are tunable and will become per-topic
// or per-user as the system matures; for v1.2 they're constants.
const MASTERY = {
  /** Score below which a concept is considered "untouched / fragile" — practice it. */
  developing: 50,
  /** Score at which a concept is "ready to teach" — Feynman test gate. */
  readyToTeach: 80,
  /** Score for full mastery (after teaching + validate). */
  mastered: 90,
};

// Estimated minutes per stage. Used for the "Today" planner UX. Loose
// estimates; refined when real session-time signals start flowing.
const STAGE_MINUTES = {
  CALIBRATION: 10,
  INTAKE: 25,
  EXPLORE: 40,
  REFLECT: 15,
  TEACH: 60,
  VALIDATE: 45,
};

// Mastery weighting per signal source. Roscoe & Chi 2007 → teaching
// is the highest-fidelity test of mastery; weighted accordingly.
// Quiz is a reasonable but gameable signal; practice + mock are the
// solid middle. These are the v1.2 weights; future versions may
// per-topic tune them.
//
// `checkin` is the 3-question grader (recall / apply / build). Weighted
// alongside `practice` (0.30) — a completed check-in is a first-class
// signal of concept mastery (Karpicke & Roediger 2008 retrieval-practice
// research). `primer_read` is engagement-only and does NOT contribute
// to the score; kept in the weight table with weight 0 so it passes
// VALID_SIGNAL_SOURCES gating without leaking into the numerator.
const SIGNAL_WEIGHTS = {
  quiz: 0.20,
  practice: 0.30,
  teaching: 0.30,
  mock: 0.20,
  checkin: 0.30,
  // Reading the primer is logged but does NOT contribute to the mastery
  // score — knowledge isn't proven by reading. The mentor uses the
  // presence of this signal as a "skip in INTAKE" marker so the user
  // advances through unread concepts in order.
  primer_read: 0,
};
const VALID_SIGNAL_SOURCES = new Set(Object.keys(SIGNAL_WEIGHTS));

// Signals older than this don't contribute to the score — knowledge decay.
// 90 days is a conservative half-life; FSRS will replace this in a later sub-PR.
const SIGNAL_FRESHNESS_DAYS = 90;

// ── planNextAction ───────────────────────────────────────────────────

/**
 * Decide the next thing the user should do on this topic.
 *
 * Decision flow:
 *   1. If no enrollment → null (caller surfaces enroll CTA)
 *   2. If enrollment requires calibration and not yet completed → CALIBRATION
 *   3. Find the first concept with all prereqs ≥ developing AND own score < developing → INTAKE
 *   4. Find the first concept with score in [developing, readyToTeach) → EXPLORE
 *   5. Find the first concept with score ≥ readyToTeach AND not teachingReady → TEACH
 *   6. If all concepts ≥ readyToTeach → VALIDATE (mock interview)
 *   7. If all concepts ≥ mastered → COMPLETE
 *
 * @param {string} userId
 * @param {string} topicId
 * @param {string} teamId — required. Scopes every concept + mastery read so
 *   a member of two teams can't have Team A signals influence Team B planning.
 * @returns {Promise<{
 *   stage: string,
 *   concept: { id, slug, name } | null,
 *   surface: { route, params } | null,
 *   minutes: number,
 *   reason: string,
 * } | null>}
 */
export async function planNextAction(userId, topicId, teamId) {
  if (!teamId) throw new Error("planNextAction: teamId required");
  const enrollment = await prisma.topicEnrollment.findUnique({
    where: { userId_topicId: { userId, topicId } },
    select: { status: true, calibration: true },
  });
  if (!enrollment) return null;

  // Calibration gate: if the enrollment exists but no calibration result
  // is recorded, the mentor needs that signal before planning can be
  // meaningful. (Calibration UI lands in a later sub-PR; this branch
  // exists so the orchestrator is correct from day one.)
  if (!enrollment.calibration) {
    return {
      stage: "CALIBRATION",
      concept: null,
      surface: { route: `/learn/${await topicSlugFor(topicId)}/calibration`, params: {} },
      minutes: STAGE_MINUTES.CALIBRATION,
      reason:
        "Day-1 calibration quiz required before the mentor can personalize the path.",
    };
  }

  const { topic, concepts, masteryById } = await loadTopicState(
    userId,
    topicId,
    teamId,
  );
  if (concepts.length === 0) {
    return {
      stage: "COMPLETE",
      concept: null,
      surface: null,
      minutes: 0,
      reason: "No published concepts yet — content is still being authored.",
    };
  }

  // Compute per-concept state.
  const stateById = new Map(
    concepts.map((c) => [c.id, conceptState(c, masteryById.get(c.id))]),
  );

  // 1) INTAKE: untouched, all prereqs at developing+, primer not yet read
  for (const c of concepts) {
    const s = stateById.get(c.id);
    if (s.score >= MASTERY.developing) continue;
    if (s.primerRead) continue; // already read — let EXPLORE / next concept claim it
    const prereqOk = c.prerequisites.every((p) => {
      const ps = stateById.get(p.prereqId);
      return ps && ps.score >= MASTERY.developing;
    });
    if (prereqOk) {
      return {
        stage: "INTAKE",
        concept: { id: c.id, slug: c.slug, name: c.name },
        surface: { route: `/learn/${topic.slug}/concepts/${c.slug}`, params: {} },
        minutes: STAGE_MINUTES.INTAKE,
        reason:
          s.score === 0
            ? "First encounter — read the primer and check yourself with the Socratic questions."
            : "Foundation is shaky — re-read with fresh eyes.",
      };
    }
  }

  // 2) EXPLORE: in-progress (score 50–79). Practice on the topic's surface.
  for (const c of concepts) {
    const s = stateById.get(c.id);
    if (s.score >= MASTERY.developing && s.score < MASTERY.readyToTeach) {
      const surface = exploreSurfaceFor(topic);
      return {
        stage: "EXPLORE",
        concept: { id: c.id, slug: c.slug, name: c.name },
        surface,
        minutes: STAGE_MINUTES.EXPLORE,
        reason: `You're at ${s.score}/100 on this concept. Practice tightens it.`,
      };
    }
  }

  // 3) TEACH: ready-to-teach but not yet taught.
  for (const c of concepts) {
    const s = stateById.get(c.id);
    if (s.score >= MASTERY.readyToTeach && !s.teachingReady) {
      return {
        stage: "TEACH",
        concept: { id: c.id, slug: c.slug, name: c.name },
        surface: { route: "/teaching/new", params: { topic: topic.slug, concept: c.slug } },
        minutes: STAGE_MINUTES.TEACH,
        reason:
          "You're at teaching readiness — explaining it is the highest-fidelity mastery test (Roscoe & Chi 2007).",
      };
    }
  }

  // 4) VALIDATE: every concept is ready-to-teach. Run a topic-scoped mock interview.
  const allReady = concepts.every(
    (c) => (stateById.get(c.id)?.score ?? 0) >= MASTERY.readyToTeach,
  );
  if (allReady && topic.mockInterviewCategory) {
    return {
      stage: "VALIDATE",
      concept: null,
      surface: {
        route: "/mock-interview",
        params: { category: topic.mockInterviewCategory },
      },
      minutes: STAGE_MINUTES.VALIDATE,
      reason:
        "Every concept is at teaching-ready level. Mock interview is the readiness gate.",
    };
  }

  // 5) COMPLETE
  return {
    stage: "COMPLETE",
    concept: null,
    surface: null,
    minutes: 0,
    reason:
      "All concepts are mastered. Treat the track as in maintenance — spaced retrieval will keep it fresh.",
  };
}

// ── detectStuck ──────────────────────────────────────────────────────

/**
 * Detect whether the user appears stuck on this topic + return a
 * recommended recovery action. Hand-coded thresholds for v1.2.
 *
 * @returns {Promise<{
 *   stuck: boolean,
 *   signals: string[],
 *   recommendation: { action: string, message: string } | null,
 * }>}
 */
export async function detectStuck(userId, topicId, teamId) {
  if (!teamId) throw new Error("detectStuck: teamId required");
  const enrollment = await prisma.topicEnrollment.findUnique({
    where: { userId_topicId: { userId, topicId } },
    select: { status: true, lastActiveAt: true, startedAt: true },
  });
  if (!enrollment || enrollment.status !== "ACTIVE") {
    return { stuck: false, signals: [], recommendation: null };
  }

  const signals = [];
  const now = Date.now();
  const lastActive = enrollment.lastActiveAt
    ? new Date(enrollment.lastActiveAt).getTime()
    : new Date(enrollment.startedAt).getTime();
  const daysSinceActive = (now - lastActive) / (1000 * 60 * 60 * 24);

  if (daysSinceActive > 7) {
    signals.push(`inactive-${Math.round(daysSinceActive)}d`);
  }

  // Per-concept signal: 2+ consecutive practice failures (score < 40).
  // Loaded directly from the signals JSON log on ConceptMastery.
  // Defense-in-depth: filter by BOTH the concept's topicId AND its teamId
  // so a Team A concept can't leak into a Team B detectStuck call even if
  // callers accidentally passed the wrong topicId.
  const masteries = await prisma.conceptMastery.findMany({
    where: {
      userId,
      concept: { topicId, teamId },
    },
    select: { conceptId: true, signals: true, score: true },
  });
  for (const m of masteries) {
    const log = Array.isArray(m.signals) ? m.signals : [];
    const recent = log.slice(-3); // last 3 signals
    const recentFailures = recent.filter(
      (s) => s.source === "practice" && Number(s.value) < 40,
    );
    if (recentFailures.length >= 2) {
      signals.push(`concept-stuck:${m.conceptId}`);
    }
  }

  if (signals.length === 0) {
    return { stuck: false, signals: [], recommendation: null };
  }

  // Pick the most actionable recommendation. Order: re-scaffold beats pause
  // beats pair (pair requires team context the v1.2 doesn't fetch yet).
  if (signals.some((s) => s.startsWith("concept-stuck"))) {
    return {
      stuck: true,
      signals,
      recommendation: {
        action: "rescaffold",
        message:
          "You've stalled on a concept after multiple attempts. Drop the difficulty: re-read the primer, work through the worked example, then come back.",
      },
    };
  }
  if (signals.some((s) => s.startsWith("inactive"))) {
    return {
      stuck: true,
      signals,
      recommendation: {
        action: "pause",
        message:
          "You haven't engaged in over a week. A short pause is fine — just don't let the streak quietly turn into 30 days. Resume with one short session.",
      },
    };
  }
  return { stuck: true, signals, recommendation: null };
}

// ── updateMastery ────────────────────────────────────────────────────

/**
 * Append a signal to the user's mastery log for a concept and recompute
 * the score. Idempotent — same signal recorded twice is just two entries
 * in the log; the score reflects whatever is currently logged.
 *
 * Signal shape: { source: 'quiz'|'practice'|'teaching'|'mock'|'checkin'|'primer_read',
 *                  value: 0-100, evidence?: any }
 *
 * @returns {Promise<ConceptMastery>}
 */
export async function updateMastery(userId, conceptId, signal) {
  if (!signal || !VALID_SIGNAL_SOURCES.has(signal.source)) {
    throw new Error(
      `signal.source must be one of: ${[...VALID_SIGNAL_SOURCES].join(", ")}`,
    );
  }
  const value = Number(signal.value);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("signal.value must be a number 0-100");
  }

  // Verify the concept exists; getting userId wrong would orphan the
  // mastery row.
  const concept = await prisma.concept.findUnique({
    where: { id: conceptId },
    select: { id: true },
  });
  if (!concept) throw new Error("concept not found");

  // Append + recompute in a single transaction to avoid races on the
  // signals log.
  //
  // Concurrency: signals is a JSON array we mutate via read-modify-write.
  // Two concurrent writers at READ COMMITTED would both read the same
  // `existing.signals`, both append, and the second write clobbers the
  // first's append (lost update). SELECT ... FOR UPDATE can't lock a row
  // that doesn't exist yet, so we serialize on a `pg_advisory_xact_lock`
  // keyed by `hashtext("<userId>:<conceptId>")`. Auto-released at commit.
  //
  // Timeouts: default $transaction options are `maxWait: 2s / timeout: 5s`.
  // Under a burst of concurrent writers on the same row, the advisory
  // lock queues them; each holder does a few short queries so per-holder
  // time is small, but queue depth can push later writers past 5s. Bump
  // to 15s to absorb realistic contention without masking a real slow
  // query (which would be a separate bug).
  //
  // Return shape: attaches `_scoreBefore` (non-enumerable) to the row so
  // callers logging `signal_shift_delta` don't need a second SELECT before
  // the update. Value is the pre-update score or `null` for fresh rows.
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${conceptId}`})::bigint)`;

      const existing = await tx.conceptMastery.findUnique({
        where: { userId_conceptId: { userId, conceptId } },
      });
      const scoreBefore = existing?.score ?? null;
      const log = Array.isArray(existing?.signals) ? [...existing.signals] : [];
      log.push({
        source: signal.source,
        value,
        at: new Date().toISOString(),
        evidence: signal.evidence ?? null,
      });
      const score = computeScore(log);

      const row = existing
        ? await tx.conceptMastery.update({
            where: { id: existing.id },
            data: { signals: log, score },
          })
        : await tx.conceptMastery.create({
            data: { userId, conceptId, signals: log, score },
          });
      Object.defineProperty(row, "_scoreBefore", {
        value: scoreBefore,
        enumerable: false,
      });
      return row;
    },
    // Timeouts sized for the 8-parallel-writer race test (a stress case,
    // not real production load — no real user gets 8 concurrent signal
    // writes on the same (user, concept) row). Under the corporate proxy
    // path, the advisory-lock queue on 8 writers has crossed 15s more
    // than once. Bump to 30s to absorb realistic queue depth without
    // masking a genuine slow query (which would still be visible in
    // Railway logs).
    { maxWait: 30000, timeout: 30000 },
  );
}

// ── Internal helpers ────────────────────────────────────────────────

async function topicSlugFor(topicId) {
  const t = await prisma.topic.findUnique({
    where: { id: topicId },
    select: { slug: true },
  });
  return t?.slug ?? "";
}

/**
 * Load the topic + its published concepts + the user's mastery rows in
 * one round-trip. Returns concepts with prerequisites pre-joined.
 *
 * Tenancy: `teamId` is required. Both the concept query and the mastery
 * query filter by it so a user with membership in two teams can never
 * pull Team A rows into a Team B planning decision — even in the presence
 * of a caller-side bug that passed a mismatched topicId.
 */
async function loadTopicState(userId, topicId, teamId) {
  if (!teamId) throw new Error("loadTopicState: teamId required");
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      mockInterviewCategory: true,
    },
  });
  const concepts = await prisma.concept.findMany({
    where: { topicId, teamId, status: "PUBLISHED" },
    orderBy: { order: "asc" },
    include: {
      prerequisites: { select: { prereqId: true } },
    },
  });
  const masteries = await prisma.conceptMastery.findMany({
    where: {
      userId,
      conceptId: { in: concepts.map((c) => c.id) },
      concept: { teamId },
    },
  });
  const masteryById = new Map(masteries.map((m) => [m.conceptId, m]));
  return { topic, concepts, masteryById };
}

function conceptState(concept, mastery) {
  const log = Array.isArray(mastery?.signals) ? mastery.signals : [];
  const primerRead = log.some((s) => s?.source === "primer_read");
  return {
    score: mastery?.score ?? 0,
    teachingReady: mastery?.teachingReady ?? false,
    primerRead,
  };
}

/** Pick the EXPLORE-stage surface for a topic. */
function exploreSurfaceFor(topic) {
  const cat = topic.mockInterviewCategory;
  // Design-shaped topics → Design Studio. Coding-shaped → Solutions.
  // Others → fallback to the topic detail page until native surfaces ship.
  if (cat === "SYSTEM_DESIGN" || cat === "LOW_LEVEL_DESIGN") {
    return { route: "/design-studio", params: { topic: topic.slug } };
  }
  if (cat === "CODING") {
    return { route: "/problems", params: { topic: topic.slug } };
  }
  return { route: `/learn/${topic.slug}`, params: {} };
}

/**
 * Compute a 0-100 mastery score from a signal log. Weighted average over
 * the most recent fresh signal per source, with weights that re-normalize
 * if some sources are absent. Signals older than SIGNAL_FRESHNESS_DAYS
 * are ignored — knowledge decays.
 */
function computeScore(log) {
  if (!Array.isArray(log) || log.length === 0) return null;
  const cutoff = Date.now() - SIGNAL_FRESHNESS_DAYS * 24 * 60 * 60 * 1000;

  // Most recent fresh value per source.
  const latestPerSource = {};
  for (const s of log) {
    if (!s || !VALID_SIGNAL_SOURCES.has(s.source)) continue;
    const t = new Date(s.at).getTime();
    if (!Number.isFinite(t) || t < cutoff) continue;
    const prev = latestPerSource[s.source];
    if (!prev || t > prev.t) {
      latestPerSource[s.source] = { value: Number(s.value), t };
    }
  }

  let sum = 0;
  let weightTotal = 0;
  for (const [source, { value }] of Object.entries(latestPerSource)) {
    const w = SIGNAL_WEIGHTS[source];
    sum += value * w;
    weightTotal += w;
  }
  if (weightTotal === 0) return null;
  return Math.round(sum / weightTotal);
}
