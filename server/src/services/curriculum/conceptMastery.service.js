// ============================================================================
// ConceptMastery signal writers — Week 4 Task 4 + Week 5 Task 5.
// ============================================================================
//
// Thin wrappers over `mentor.service.updateMastery(userId, conceptId, signal)`
// that map curriculum domain events (lab attempts, check-ins, primer reads,
// teaching sessions) into the `{ source, value, evidence }` signal shape the
// mentor expects.
//
// Called from:
//   - `curriculum.controller.onReviewCompleted` — recordLabSignal
//   - `curriculum.controller.submitCheckIn`     — recordCheckInSignal
//   - `curriculum.controller.markPrimerRead`    — recordPrimerReadSignal
// Future (Week 5+):
//   - `teaching.controller` — recordTeachingSignal (peer-taught concept)
//   - `designStudio.controller` — recordDesignSignal (concept applied in DS)
//
// Atomicity note: `updateMastery` owns its own $transaction internally to
// serialize appends to the signals log. That means these writer helpers
// CANNOT be composed inside an outer $transaction — the caller has to
// accept the signal write happening as a separate op just after the
// domain event. In practice this is fine: if the mastery write fails
// after a successful lab review or check-in, the domain row is intact
// and we just miss one signal (recorded by the next attempt or check-in).
// Callers wrap in try/catch and log — signal write is best-effort.
//
// ── Week 5 Task 5 — teachingReady auto-flip truth table ────────────────
//
// After each of the three learner-signal writers commits, we run a
// read-only truth-table check and, if satisfied, fire a `setTeachingReady`
// side-effect. The truth table is:
//
//   primer_read AND ≥1 STRONG/ADEQUATE lab (this team) AND latest PASS check-in
//
// The flip is MONOTONIC — once true, subsequent WEAK attempts or FAIL
// check-ins never un-flip it. teachingReady is the "unlocks TEACH stage"
// gate; a bad follow-up doesn't retract mastery evidence.
//
// Cross-team isolation (Security requirement): the truth-table read
// filters `lab: { conceptId, teamId }` and `concept: { teamId }` so a
// STRONG lab attempt on Team A's lab does NOT count toward Team B's
// teachingReady flip, even for a user who's a member of both teams.
// ============================================================================

import prisma from "../../lib/prisma.js";
import { updateMastery } from "../mentor.service.js";
import logger from "../../utils/logger.js";

// Verdict → 0–100 value mappings. Match the value-choice rationale documented
// in the Week 4 plan §Task 4:
//   STRONG   = 100 — reviewer thinks the code demonstrates the concept
//   ADEQUATE =  70 — passes, but not idiomatic; still positive evidence
//   WEAK     =  40 — struggling; below the "developing" threshold (50)
const LAB_VERDICT_VALUES = { STRONG: 100, ADEQUATE: 70, WEAK: 40 };

// Check-in verdicts are three-state instead of four. PASS = full-signal;
// PARTIAL = mid-range (crosses the developing threshold but not readiness);
// FAIL = well below threshold.
const CHECKIN_VERDICT_VALUES = { PASS: 100, PARTIAL: 60, FAIL: 20 };

// Teaching-session verdicts — Roscoe & Chi 2007: teaching-to-learn is the
// highest-fidelity mastery test. STRONG teaching → same 100 weight as a
// STRONG lab; ADEQUATE = 70; anything else = 30 (present but weak
// evidence — a session that ran but didn't demonstrate the concept).
const TEACHING_VERDICT_VALUES = { STRONG: 100, ADEQUATE: 70 };
const TEACHING_FALLBACK_VALUE = 30;

// Primer read is engagement-only (weight 0 in SIGNAL_WEIGHTS). The value
// itself doesn't move the score; the presence of the signal in the log is
// what matters — the mentor uses it to route past unread concepts in
// INTAKE stage. Value kept nonzero so the signal is well-formed if a
// future weight tune-up flips primer_read to a small nonzero weight.
const PRIMER_READ_VALUE = 10;

// Dedup window for primer_read signals — we don't want to spam the log
// every time a user flips back to a concept page they've already read.
const PRIMER_READ_DEDUP_MS = 24 * 60 * 60 * 1000;

// Verdicts that count as "lab passed" for the teachingReady truth table.
// WEAK does NOT satisfy the gate — a struggling attempt isn't teaching-ready
// evidence. Order in the array matches the SQL `IN (…)` filter.
const TEACHING_READY_LAB_VERDICTS = ["STRONG", "ADEQUATE"];

/**
 * Record a "practice" signal for a COMPLETED lab attempt.
 *
 * Called from `onReviewCompleted` — outside any transaction; the caller
 * wraps in try/catch and logs failures (best-effort).
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.conceptId — the Concept the Lab belongs to.
 * @param {string} params.teamId — the Team the Concept belongs to (used
 *   for the auto-flip truth-table lookup; MUST NOT read `req.user.currentTeamId`).
 * @param {'STRONG'|'ADEQUATE'|'WEAK'} params.codeReviewVerdict
 * @param {string} [params.attemptId] — for evidence trail.
 * @returns {Promise<void>} resolves regardless — caller ignores.
 */
export async function recordLabSignal({
  userId,
  conceptId,
  teamId,
  codeReviewVerdict,
  attemptId = null,
}) {
  const value = LAB_VERDICT_VALUES[codeReviewVerdict];
  if (value === undefined) return; // Unknown verdict (e.g. null after ERROR) — no-op.

  // `updateMastery` reads scoreBefore inside its own transaction and
  // attaches it as a non-enumerable `_scoreBefore` field on the returned
  // row. Reading it here avoids a second SELECT per signal write.
  const after = await updateMastery(userId, conceptId, {
    source: "practice",
    value,
    evidence: { attemptId, codeReviewVerdict },
  });

  const scoreBefore = after?._scoreBefore ?? null;
  const scoreAfter = after?.score ?? null;
  logger.info(
    {
      event: "signal_shift_delta",
      userId,
      conceptId,
      teamId,
      source: "practice",
      value,
      scoreBefore,
      scoreAfter,
      delta:
        scoreBefore != null && scoreAfter != null
          ? scoreAfter - scoreBefore
          : null,
      evidence: { attemptId, codeReviewVerdict },
    },
    "signal_shift_delta",
  );

  await _maybeAutoFlipTeachingReady({
    userId,
    conceptId,
    teamId,
    mastery: after,
  });
}

/**
 * Record a "checkin" signal from a submitted ConceptCheckIn.
 *
 * Note the outer transaction limitation: `updateMastery` owns its own
 * $transaction, so this call must happen AFTER `allocateCheckIn` returns
 * (not inside it). If the mastery write fails, the check-in row is intact
 * and we log a warning — one missing signal is preferable to failing the
 * user-visible response.
 *
 * `calibrationDelta` is stored under evidence for D10 (Verification &
 * Meta-cognition) aggregation — the readiness stats pipeline reads
 * signals arrays and pulls calibration signals out by source.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.conceptId
 * @param {string} params.teamId
 * @param {'PASS'|'PARTIAL'|'FAIL'} params.aiVerdict
 * @param {number} [params.calibrationDelta]
 * @param {string} [params.checkInId] — for evidence trail.
 * @returns {Promise<void>}
 */
export async function recordCheckInSignal({
  userId,
  conceptId,
  teamId,
  aiVerdict,
  calibrationDelta = null,
  checkInId = null,
}) {
  const value = CHECKIN_VERDICT_VALUES[aiVerdict];
  if (value === undefined) return; // Unknown verdict — no-op.

  // scoreBefore is folded into `updateMastery`'s tx-internal read — no
  // separate SELECT round-trip. See recordLabSignal for the same pattern.
  const after = await updateMastery(userId, conceptId, {
    source: "checkin",
    value,
    evidence: { checkInId, aiVerdict, calibrationDelta },
  });

  const scoreBefore = after?._scoreBefore ?? null;
  const scoreAfter = after?.score ?? null;
  logger.info(
    {
      event: "signal_shift_delta",
      userId,
      conceptId,
      teamId,
      source: "checkin",
      value,
      scoreBefore,
      scoreAfter,
      delta:
        scoreBefore != null && scoreAfter != null
          ? scoreAfter - scoreBefore
          : null,
      evidence: { checkInId, aiVerdict, calibrationDelta },
    },
    "signal_shift_delta",
  );

  await _maybeAutoFlipTeachingReady({
    userId,
    conceptId,
    teamId,
    mastery: after,
  });
}

/**
 * Record a low-weight "primer_read" engagement signal.
 *
 * Dedup: if the user recorded a primer_read signal for this concept
 * within the last PRIMER_READ_DEDUP_MS (24h), do NOT append another.
 * Prevents log spam from users flipping back to a concept page multiple
 * times in a session.
 *
 * `updateMastery` uses `signal.at` (assigned server-side) — we read that
 * field on existing signals to compute the dedup window.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.conceptId
 * @param {string} params.teamId
 * @returns {Promise<void>}
 */
export async function recordPrimerReadSignal({ userId, conceptId, teamId }) {
  // Select `teachingReady` too so the same row can feed the auto-flip
  // helper's early-exit check without a second SELECT (see the caller of
  // `_maybeAutoFlipTeachingReady` at the bottom of this function).
  const existing = await prisma.conceptMastery.findUnique({
    where: { userId_conceptId: { userId, conceptId } },
    select: { signals: true, score: true, teachingReady: true },
  });
  const scoreBefore = existing?.score ?? null;

  let wroteNewSignal = false;
  let after = null;
  if (existing?.signals) {
    const signals = Array.isArray(existing.signals) ? existing.signals : [];
    const now = Date.now();
    const recent = signals.find((s) => {
      if (!s || s.source !== "primer_read") return false;
      const at = s.at ? new Date(s.at).getTime() : 0;
      return Number.isFinite(at) && now - at < PRIMER_READ_DEDUP_MS;
    });
    if (!recent) {
      after = await updateMastery(userId, conceptId, {
        source: "primer_read",
        value: PRIMER_READ_VALUE,
        evidence: null,
      });
      wroteNewSignal = true;
    }
  } else {
    after = await updateMastery(userId, conceptId, {
      source: "primer_read",
      value: PRIMER_READ_VALUE,
      evidence: null,
    });
    wroteNewSignal = true;
  }

  // Only emit signal_shift_delta when we actually wrote a new signal.
  // A dedup'd primer_read call means no state change → nothing to log.
  if (wroteNewSignal) {
    const scoreAfter = after?.score ?? null;
    logger.info(
      {
        event: "signal_shift_delta",
        userId,
        conceptId,
        teamId,
        source: "primer_read",
        value: PRIMER_READ_VALUE,
        scoreBefore,
        scoreAfter,
        delta:
          scoreBefore != null && scoreAfter != null
            ? scoreAfter - scoreBefore
            : null,
        evidence: {},
      },
      "signal_shift_delta",
    );
  }

  // Always attempt the auto-flip. Even a dedup'd primer_read call can be
  // the tick that satisfies the truth table if the OTHER two conditions
  // (STRONG lab + PASS check-in) landed after the last flip attempt.
  // `_maybeAutoFlipTeachingReady` is a cheap read + no-op when the flip
  // has already fired (idempotent guard inside setTeachingReady).
  //
  // Pass the freshest mastery view we have: `after` (post-update) when a
  // new signal was written, else `existing` (pre-read at line 235). Either
  // is more current than a fresh SELECT the helper would run.
  await _maybeAutoFlipTeachingReady({
    userId,
    conceptId,
    teamId,
    mastery: after ?? existing,
  });
}

/**
 * Record a "teaching" signal from a completed peer-teaching session.
 *
 * Roscoe & Chi 2007: teaching-to-learn is the highest-fidelity mastery test.
 * Weighted equal to lab practice in the mentor's `SIGNAL_WEIGHTS`.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.conceptId
 * @param {string} [params.teachingSessionId]
 * @param {'STRONG'|'ADEQUATE'|string} params.verdict — mapped via
 *   TEACHING_VERDICT_VALUES; unknown verdicts fall back to
 *   TEACHING_FALLBACK_VALUE (30) rather than being dropped, because a
 *   completed teaching session is meaningful signal even when the grader
 *   is uncertain.
 * @param {string|Date} [params.at] — reserved for future backdating; unused
 *   today (updateMastery stamps `at` server-side to guarantee monotonic
 *   ordering in the log).
 * @returns {Promise<void>}
 */
export async function recordTeachingSignal({
  userId,
  conceptId,
  teachingSessionId = null,
  verdict,
  // eslint-disable-next-line no-unused-vars
  at = null,
}) {
  const value = TEACHING_VERDICT_VALUES[verdict] ?? TEACHING_FALLBACK_VALUE;
  await updateMastery(userId, conceptId, {
    source: "teaching",
    value,
    evidence: { teachingSessionId, verdict },
  });
}

/**
 * Idempotent, monotonic flip of `ConceptMastery.teachingReady` to true.
 *
 * Uses upsert-then-conditional-update inside a $transaction:
 *   1. Upsert the mastery row (creates a fresh row if the concept was
 *      never touched, so the flip works even when called before any
 *      other signal has landed).
 *   2. If the row wasn't already `teachingReady: true`, set it to true
 *      AND append a `{ source: "teachingReady", value: 1, evidence:
 *      { reason }, at: <ISO> }` entry to the signals log for audit.
 *   3. If the row was already true, no write — audit entry stays at
 *      exactly one to preserve the "who caused the flip" trail.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.conceptId
 * @param {string} [params.reason="truthTable"] — free-text tag preserved
 *   in the audit signal evidence. Values in use today:
 *     - "truthTable" — the automatic flip fired
 *     - "manual"     — admin override (e.g. superadmin panel)
 * @returns {Promise<{teachingReady: boolean, alreadyReady: boolean}>}
 */
export async function setTeachingReady({
  userId,
  conceptId,
  teamId = null,
  reason = "truthTable",
}) {
  const result = await prisma.$transaction(async (tx) => {
    // Upsert on the composite unique (userId, conceptId). Without this,
    // a concept the user has never touched (no primer_read, no lab, no
    // check-in) would have no ConceptMastery row and setTeachingReady
    // would be a no-op.
    const existing = await tx.conceptMastery.findUnique({
      where: { userId_conceptId: { userId, conceptId } },
    });

    if (existing?.teachingReady === true) {
      // Idempotent — flip already fired. No new audit entry, no update.
      return { teachingReady: true, alreadyReady: true };
    }

    const existingSignals = Array.isArray(existing?.signals)
      ? existing.signals
      : [];
    const auditSignal = {
      source: "teachingReady",
      value: 1,
      at: new Date().toISOString(),
      evidence: { reason },
    };
    const nextSignals = [...existingSignals, auditSignal];

    if (existing) {
      await tx.conceptMastery.update({
        where: { id: existing.id },
        data: { teachingReady: true, signals: nextSignals },
      });
    } else {
      await tx.conceptMastery.create({
        data: {
          userId,
          conceptId,
          teachingReady: true,
          signals: nextSignals,
          // score stays null — the audit signal has weight 0 and none
          // of the other signals have arrived yet. score will resolve
          // to a real number on the next call to updateMastery().
          score: null,
        },
      });
    }

    return { teachingReady: true, alreadyReady: false };
  });

  // Only emit `teachingReady_flipped` when the flip is NEW. Idempotent
  // re-calls (alreadyReady === true) skip the log so downstream consumers
  // (metrics/alerts) don't see phantom flips.
  if (result.alreadyReady === false) {
    logger.info(
      { event: "teachingReady_flipped", userId, conceptId, teamId, reason },
      "teachingReady_flipped",
    );
  }

  return result;
}

// ── Auto-flip internals ─────────────────────────────────────────────────

/**
 * Read-only truth-table check. Returns true iff ALL of:
 *   - a `primer_read` signal exists in the user's mastery log for this
 *     concept (any age — presence is what matters, dedup handles staleness)
 *   - the user has ≥1 COMPLETED LabAttempt on THIS TEAM'S lab for this
 *     concept with verdict STRONG or ADEQUATE
 *   - the user's LATEST ConceptCheckIn on THIS TEAM'S concept has aiVerdict
 *     PASS (a PASS followed by a FAIL still counts — but our latest check
 *     uses the highest completedAt DESC)
 *
 * The `lab: { conceptId, teamId }` and `concept: { teamId }` filters are
 * load-bearing: they prevent Team A evidence from counting toward Team B
 * mastery for a user in both teams. This is the W5.T5 Security-panel fix.
 *
 * @private
 * @returns {Promise<boolean>}
 */
async function _shouldAutoFlipTeachingReady({
  userId,
  conceptId,
  teamId,
  mastery: masteryHint,
}) {
  if (!teamId) return false; // defensive — caller MUST pass teamId

  // (1) primer_read present? Skip the DB round-trip when the caller already
  // has the just-updated ConceptMastery row (recordLabSignal / recordCheckInSignal
  // pass `after` — the tx result from updateMastery, which is authoritative
  // and fresher than any follow-up SELECT). Fall back to a fetch when no hint
  // was passed (defensive; keeps the internal API tolerant of new callers).
  const mastery =
    masteryHint ??
    (await prisma.conceptMastery.findUnique({
      where: { userId_conceptId: { userId, conceptId } },
      select: { signals: true, teachingReady: true },
    }));
  if (!mastery) return false;
  if (mastery.teachingReady === true) return false; // already flipped — no-op
  const signals = Array.isArray(mastery.signals) ? mastery.signals : [];
  const hasPrimerRead = signals.some((s) => s?.source === "primer_read");
  // No primer_read yet → the truth table cannot possibly satisfy. Short-
  // circuit BEFORE the two more expensive lab + check-in scans. This is
  // the common case for fresh learners; the previous impl ran all three
  // queries even when the first gate was obviously not met.
  if (!hasPrimerRead) return false;

  // (2) ≥1 STRONG/ADEQUATE lab on THIS team's lab.
  const strongLab = await prisma.labAttempt.findFirst({
    where: {
      userId,
      reviewStatus: "COMPLETED",
      codeReviewVerdict: { in: TEACHING_READY_LAB_VERDICTS },
      lab: {
        conceptId,
        teamId,
      },
    },
    select: { id: true },
  });
  if (!strongLab) return false;

  // (3) LATEST check-in on THIS team's concept has aiVerdict = PASS.
  // Filter by conceptId + userId first (backed by the composite index on
  // ConceptCheckIn), then apply the team-scope filter via the relation as
  // a safety check — order matters for index-only scans.
  const latestCheckIn = await prisma.conceptCheckIn.findFirst({
    where: {
      userId,
      conceptId,
      concept: { teamId },
    },
    orderBy: { completedAt: "desc" },
    select: { aiVerdict: true },
  });
  if (!latestCheckIn || latestCheckIn.aiVerdict !== "PASS") return false;

  return true;
}

/**
 * try/catch wrapper — the flip is best-effort. The signal write that
 * triggered this call has ALREADY committed by the time we get here,
 * so any failure here MUST NOT propagate to the caller (who would
 * otherwise mistake a flip failure for a signal-write failure and
 * either retry or surface a user-visible error).
 *
 * MUST NOT be called from inside an open $transaction — `setTeachingReady`
 * opens its own $transaction and would deadlock on the ConceptMastery row
 * lock the outer transaction is holding.
 *
 * `mastery` (optional): pass the just-updated ConceptMastery row from
 * `updateMastery` to skip the initial primer_read presence query — its
 * `signals` array is authoritative.
 *
 * @private
 */
async function _maybeAutoFlipTeachingReady({
  userId,
  conceptId,
  teamId,
  mastery = null,
}) {
  try {
    const shouldFlip = await _shouldAutoFlipTeachingReady({
      userId,
      conceptId,
      teamId,
      mastery,
    });
    if (shouldFlip) {
      await setTeachingReady({
        userId,
        conceptId,
        teamId,
        reason: "truthTable",
      });
    }
  } catch (err) {
    // Signal already committed — swallow so the caller returns success.
    console.warn(
      `[conceptMastery:teachingReady] auto-flip failed for user=${userId} concept=${conceptId} team=${teamId}:`,
      err?.message ?? err,
    );
  }
}
