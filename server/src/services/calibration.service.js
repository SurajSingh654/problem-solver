// ============================================================================
// Calibration service — pure shaping + scoring (no Prisma).
// ============================================================================
//
// Two responsibilities:
//   1. Strip answer keys when serving questions to the wire.
//   2. Score a submitted set of responses against the question bank.
//
// Both are pure functions of (topicSlug, responses). The controller owns
// the side-effects (DB find, persist, mentor.replan).
// ============================================================================

import { CALIBRATION_BANKS } from "./calibration/registry.js";

export class CalibrationError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "CalibrationError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Returns the wire-safe question list for a topic — `correct` and
 * `rationale` are stripped. Throws CalibrationError("BANK_NOT_FOUND") if
 * no bank is registered for the slug.
 */
export function getCalibrationForTopic(topicSlug) {
  const bank = CALIBRATION_BANKS[topicSlug];
  if (!bank) {
    throw new CalibrationError(
      "BANK_NOT_FOUND",
      `No calibration questions registered for topic '${topicSlug}'.`,
    );
  }
  const questions = bank.map((q) => ({
    id: q.id,
    conceptSlug: q.conceptSlug,
    prompt: q.prompt,
    choices: q.choices.map((c) => ({ key: c.key, text: c.text })),
  }));
  return { questions };
}

/**
 * Scores a set of responses against the topic's question bank.
 *
 * Inputs:
 *   topicSlug — Topic.slug
 *   responses — Array<{ questionId: string, answer: 'A'|'B'|'C'|'D' }>
 *
 * Output:
 *   { score, total, perConceptCorrectness, perQuestionCorrectness, rationales }
 *   where:
 *     score: number of correct answers
 *     total: total questions in bank
 *     perConceptCorrectness: { [conceptSlug]: boolean }
 *       — `true` only if EVERY question for that concept was answered correctly
 *     perQuestionCorrectness: { [questionId]: boolean }
 *     rationales: { [questionId]: string } — released only after submit
 *
 * Errors (CalibrationError):
 *   - BANK_NOT_FOUND       no bank for slug
 *   - INVALID_RESPONSES    responses not an array
 *   - UNKNOWN_QUESTION_IDS questionIds not in the bank (details.unknown[])
 *   - MISSING_RESPONSES    coverage gap (details.missing[])
 *   - INVALID_ANSWER       answer not one of the choice keys (details.questionId, details.answer)
 */
export function scoreCalibration(topicSlug, responses) {
  const bank = CALIBRATION_BANKS[topicSlug];
  if (!bank) {
    throw new CalibrationError(
      "BANK_NOT_FOUND",
      `No calibration questions registered for topic '${topicSlug}'.`,
    );
  }
  if (!Array.isArray(responses)) {
    throw new CalibrationError(
      "INVALID_RESPONSES",
      "responses must be an array of { questionId, answer }.",
    );
  }

  const byId = new Map(bank.map((q) => [q.id, q]));

  // Coverage check — every bank question must appear in responses (no partial submits).
  const submittedIds = new Set(responses.map((r) => r?.questionId));
  const missing = bank.map((q) => q.id).filter((id) => !submittedIds.has(id));
  if (missing.length > 0) {
    throw new CalibrationError(
      "MISSING_RESPONSES",
      `Missing answers for ${missing.length} question(s).`,
      { missing },
    );
  }

  // Unknown-id check — reject any response that doesn't map to a bank question.
  const unknown = responses
    .map((r) => r?.questionId)
    .filter((id) => !byId.has(id));
  if (unknown.length > 0) {
    throw new CalibrationError(
      "UNKNOWN_QUESTION_IDS",
      `Unknown question id(s): ${unknown.join(", ")}.`,
      { unknown },
    );
  }

  // Per-question scoring.
  const perQuestionCorrectness = {};
  const rationales = {};
  let score = 0;
  for (const r of responses) {
    const q = byId.get(r.questionId);
    const validKeys = new Set(q.choices.map((c) => c.key));
    if (!validKeys.has(r.answer)) {
      throw new CalibrationError(
        "INVALID_ANSWER",
        `Answer '${r.answer}' is not a valid choice for question '${q.id}'.`,
        { questionId: q.id, answer: r.answer },
      );
    }
    const correct = r.answer === q.correct;
    perQuestionCorrectness[q.id] = correct;
    rationales[q.id] = q.rationale;
    if (correct) score += 1;
  }

  // Per-concept rollup — concept counts as "correct" only if ALL its
  // questions are correct. Strict by design: this is a baseline signal,
  // not a gradient.
  const perConceptCorrectness = {};
  for (const q of bank) {
    const correctSoFar = perConceptCorrectness[q.conceptSlug];
    const thisCorrect = perQuestionCorrectness[q.id] === true;
    perConceptCorrectness[q.conceptSlug] =
      correctSoFar === undefined ? thisCorrect : correctSoFar && thisCorrect;
  }

  return {
    score,
    total: bank.length,
    perConceptCorrectness,
    perQuestionCorrectness,
    rationales,
  };
}
