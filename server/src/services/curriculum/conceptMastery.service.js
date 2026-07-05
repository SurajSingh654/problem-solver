// ============================================================================
// ConceptMastery signal writers — Week 4 Task 4.
// ============================================================================
//
// Thin wrappers over `mentor.service.updateMastery(userId, conceptId, signal)`
// that map curriculum domain events (lab attempts, check-ins, primer reads)
// into the `{ source, value, evidence }` signal shape the mentor expects.
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
// ============================================================================

import prisma from "../../lib/prisma.js";
import { updateMastery } from "../mentor.service.js";

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

// Primer read is engagement-only (weight 0 in SIGNAL_WEIGHTS). The value
// itself doesn't move the score; the presence of the signal in the log is
// what matters — the mentor uses it to route past unread concepts in
// INTAKE stage. Value kept nonzero so the signal is well-formed if a
// future weight tune-up flips primer_read to a small nonzero weight.
const PRIMER_READ_VALUE = 10;

// Dedup window for primer_read signals — we don't want to spam the log
// every time a user flips back to a concept page they've already read.
const PRIMER_READ_DEDUP_MS = 24 * 60 * 60 * 1000;

/**
 * Record a "practice" signal for a COMPLETED lab attempt.
 *
 * Called from `onReviewCompleted` — outside any transaction; the caller
 * wraps in try/catch and logs failures (best-effort).
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.conceptId — the Concept the Lab belongs to.
 * @param {'STRONG'|'ADEQUATE'|'WEAK'} params.codeReviewVerdict
 * @param {string} [params.attemptId] — for evidence trail.
 * @returns {Promise<void>} resolves regardless — caller ignores.
 */
export async function recordLabSignal({
  userId,
  conceptId,
  codeReviewVerdict,
  attemptId = null,
}) {
  const value = LAB_VERDICT_VALUES[codeReviewVerdict];
  if (value === undefined) return; // Unknown verdict (e.g. null after ERROR) — no-op.

  await updateMastery(userId, conceptId, {
    source: "practice",
    value,
    evidence: { attemptId, codeReviewVerdict },
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
 * @param {'PASS'|'PARTIAL'|'FAIL'} params.aiVerdict
 * @param {number} [params.calibrationDelta]
 * @param {string} [params.checkInId] — for evidence trail.
 * @returns {Promise<void>}
 */
export async function recordCheckInSignal({
  userId,
  conceptId,
  aiVerdict,
  calibrationDelta = null,
  checkInId = null,
}) {
  const value = CHECKIN_VERDICT_VALUES[aiVerdict];
  if (value === undefined) return; // Unknown verdict — no-op.

  await updateMastery(userId, conceptId, {
    source: "checkin",
    value,
    evidence: { checkInId, aiVerdict, calibrationDelta },
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
 * @returns {Promise<void>}
 */
export async function recordPrimerReadSignal({ userId, conceptId }) {
  const existing = await prisma.conceptMastery.findUnique({
    where: { userId_conceptId: { userId, conceptId } },
    select: { signals: true },
  });

  if (existing?.signals) {
    const signals = Array.isArray(existing.signals) ? existing.signals : [];
    const now = Date.now();
    const recent = signals.find((s) => {
      if (!s || s.source !== "primer_read") return false;
      const at = s.at ? new Date(s.at).getTime() : 0;
      return Number.isFinite(at) && now - at < PRIMER_READ_DEDUP_MS;
    });
    if (recent) return; // Dedup'd — nothing to do.
  }

  await updateMastery(userId, conceptId, {
    source: "primer_read",
    value: PRIMER_READ_VALUE,
    evidence: null,
  });
}
