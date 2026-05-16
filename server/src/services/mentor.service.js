// ============================================================================
// Mentor Orchestrator — v1.2 skeleton (hand-coded rules)
// ============================================================================
//
// Three pure functions over the Topic Mastery Tracks data model:
//
//   planNextAction(userId, topicId) → { stage, concept, surface, minutes, reason }
//   detectStuck(userId, topicId)    → { stuck, signals[], recommendation }
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
const SIGNAL_WEIGHTS = {
  quiz: 0.20,
  practice: 0.30,
  teaching: 0.30,
  mock: 0.20,
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
 * @returns {Promise<{
 *   stage: string,
 *   concept: { id, slug, name } | null,
 *   surface: { route, params } | null,
 *   minutes: number,
 *   reason: string,
 * } | null>}
 */
export async function planNextAction(userId, topicId) {
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
      surface: { route: `/learn/${await topicSlugFor(topicId)}`, params: {} },
      minutes: STAGE_MINUTES.CALIBRATION,
      reason:
        "Day-1 calibration quiz required before the mentor can personalize the path.",
    };
  }

  const { topic, concepts, masteryById } = await loadTopicState(userId, topicId);
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

  // 1) INTAKE: untouched, all prereqs at developing+
  for (const c of concepts) {
    const s = stateById.get(c.id);
    if (s.score >= MASTERY.developing) continue;
    const prereqOk = c.prerequisites.every((p) => {
      const ps = stateById.get(p.prereqId);
      return ps && ps.score >= MASTERY.developing;
    });
    if (prereqOk) {
      return {
        stage: "INTAKE",
        concept: { id: c.id, slug: c.slug, name: c.name },
        surface: { route: `/learn/${topic.slug}`, params: { concept: c.slug } },
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
export async function detectStuck(userId, topicId) {
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
  const masteries = await prisma.conceptMastery.findMany({
    where: { userId, concept: { topicId } },
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
 * Signal shape: { source: 'quiz'|'practice'|'teaching'|'mock', value: 0-100, evidence?: any }
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
  return prisma.$transaction(async (tx) => {
    const existing = await tx.conceptMastery.findUnique({
      where: { userId_conceptId: { userId, conceptId } },
    });
    const log = Array.isArray(existing?.signals) ? [...existing.signals] : [];
    log.push({
      source: signal.source,
      value,
      at: new Date().toISOString(),
      evidence: signal.evidence ?? null,
    });
    const score = computeScore(log);

    if (existing) {
      return tx.conceptMastery.update({
        where: { id: existing.id },
        data: { signals: log, score },
      });
    }
    return tx.conceptMastery.create({
      data: { userId, conceptId, signals: log, score },
    });
  });
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
 */
async function loadTopicState(userId, topicId) {
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
    where: { topicId, status: "PUBLISHED" },
    orderBy: { order: "asc" },
    include: {
      prerequisites: { select: { prereqId: true } },
    },
  });
  const masteries = await prisma.conceptMastery.findMany({
    where: {
      userId,
      conceptId: { in: concepts.map((c) => c.id) },
    },
  });
  const masteryById = new Map(masteries.map((m) => [m.conceptId, m]));
  return { topic, concepts, masteryById };
}

function conceptState(concept, mastery) {
  return {
    score: mastery?.score ?? 0,
    teachingReady: mastery?.teachingReady ?? false,
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
