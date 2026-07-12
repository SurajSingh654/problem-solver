// ============================================================================
// Curriculum · Validator registrations.
// ============================================================================
// Registers curriculum-review, lesson-review, code-review, and check-in
// validator specs into the contentReview registry. Tasks 3-6 each add one
// entry here.
//
// Invocation: `initCurriculumValidators()` must be called once at server
// startup (from server/src/index.js) BEFORE any HTTP handler could reach
// runValidator(). Guarded by an idempotency flag so double-init is safe
// (e.g. from vitest suites that import this file directly).
//
// Why not a top-of-file side-effect import from contentReview.service.js?
// Answer: circular. contentReview.service.js's `const VALIDATORS = new Map()`
// is in a temporal dead zone at the moment a side-effect-import would
// evaluate. Explicit startup init sidesteps that entirely.
// ============================================================================
import { registerValidator } from "./contentReview.service.js";
import { aiComplete } from "../ai.service.js";
import { AI_MODEL_PRIMARY, AI_MODEL_FAST } from "../../config/env.js";
import {
    curriculumReviewSchema,
    lessonReviewSchema,
    codeReviewSchema,
    codeWalkthroughSchema,
    checkInSchema,
} from "../ai.schemas.js";
import {
    validateCurriculumReview,
    validateLessonReview,
    validateCodeReview,
    validateCodeWalkthrough,
    validateCheckInReview,
} from "../ai.validators.js";
import {
    buildFallbackCurriculumReview,
    buildFallbackLessonReview,
    buildFallbackCodeReview,
    buildFallbackCodeWalkthrough,
    buildFallbackCheckIn,
} from "../ai.fallbacks.js";
import {
    buildCurriculumReviewPrompt,
    buildLessonReviewPrompt,
    buildCodeReviewPrompt,
    buildCodeWalkthroughPrompt,
    buildCheckInPrompt,
} from "../ai.prompts.js";

let _initialized = false;

/**
 * Register all curriculum content-review validator specs.
 * Idempotent — safe to call multiple times (each call is a no-op after the
 * first).
 *
 * Called from server/src/index.js at startup and (optionally) from any
 * curriculum controller entry point that wants to guarantee registration.
 */
export function initCurriculumValidators() {
    if (_initialized) return;
    _initialized = true;

    // T3 — Curriculum-review validator (Topic-level, TEAM_ADMIN-triggered).
    // Enforces Rules 18 (WORTH_LEARNING cites outcome) + 22-curriculum
    // (WORTH_LEARNING requires ≥4 outcomes). Fallback is NOT_WORTH_TIME.
    registerValidator("CURRICULUM_REVIEW", {
        model: AI_MODEL_PRIMARY,
        buildPrompt: buildCurriculumReviewPrompt,
        schema: curriculumReviewSchema,
        validate: validateCurriculumReview,
        fallback: buildFallbackCurriculumReview,
        targetType: "TOPIC",
        aiComplete,
    });

    // T4 — Lesson-review validator (Concept-level, TEAM_ADMIN-triggered).
    // Model: AI_MODEL_FAST (per-concept, run frequently at author time).
    // Enforces Rule 19 (READY needs ≥6/8 seniorReadiness true + justifications
    // for false checks) + Rule 22-lesson (belt-and-suspenders codified check).
    // Fallback is NOT_READY, all-MISSING content quality.
    registerValidator("LESSON_REVIEW", {
        model: AI_MODEL_FAST,
        buildPrompt: buildLessonReviewPrompt,
        schema: lessonReviewSchema,
        validate: validateLessonReview,
        fallback: buildFallbackLessonReview,
        targetType: "CONCEPT",
        aiComplete,
    });

    // T5 — Code-review validator (Lab-attempt-level, LEARNER-triggered).
    // Model: AI_MODEL_PRIMARY (learner-facing quality bar; per-attempt cost
    // is acceptable). Enforces Rule 20 (STRONG needs ≥1 non-empty lineRef in
    // whatYouGotRight), Rule 21 (STRONG/ADEQUATE requires READY_FOR_REFERENCE;
    // also enforced at Zod .superRefine layer), and Rule 22-code (STRONG/
    // ADEQUATE requires whatYouGotRight.length ≥ 1). Fallback is WEAK +
    // ADDRESS_AND_RESUBMIT with all-MISSING dimensions.
    registerValidator("CODE_REVIEW", {
        model: AI_MODEL_PRIMARY,
        buildPrompt: buildCodeReviewPrompt,
        schema: codeReviewSchema,
        validate: validateCodeReview,
        fallback: buildFallbackCodeReview,
        targetType: "LAB",
        aiComplete,
    });

    // Reveal Walkthrough (Phase R.1, 2026-07-11) — LEARNER-triggered at
    // reveal time. Model: PRIMARY tier per 4-role review (2026-07-11) —
    // fast-tier hallucinates line references, and Rule 23-c requires ≥2
    // yourApproachLineRef + ≥1 referenceApproachLineRef so garbled refs
    // would tank the walkthrough. Cost is per-reveal (rare), not per-
    // submit. Enforces Rule 23 (23-a duplicate/enum dims, 23-b verdict
    // mirror, 23-c line-ref grounding, 23-d hedge vocab). Fallback is a
    // neutral 3-dim placeholder that mirrors priorVerdict; the client
    // badges it as "walkthrough failed — retry" via `usedFallback`.
    registerValidator("CODE_WALKTHROUGH", {
        model: AI_MODEL_PRIMARY,
        buildPrompt: buildCodeWalkthroughPrompt,
        schema: codeWalkthroughSchema,
        validate: validateCodeWalkthrough,
        fallback: buildFallbackCodeWalkthrough,
        targetType: "LAB",
        aiComplete,
    });

    // T6 — Check-in validator (Concept-level 3-question gate, LEARNER-triggered).
    // Model: AI_MODEL_FAST (per-attempt cost must stay cheap — learners hit
    // this per concept, sometimes twice). No Rules 18-22 equivalent: this
    // validator only feeds the D10 calibration signal, not a publish gate;
    // shape correctness is Zod-enforced and validateCheckInReview is an
    // identity pass. `targetType: null` — check-ins are stored in the
    // ConceptCheckIn table at the controller layer, NOT logged to
    // ContentReviewLog (which is scoped to admin/learner-facing review
    // verdicts, not per-question grading state). Fallback is all-PARTIAL
    // with calibrationDelta 0.5 (neutral — no bias into D10 aggregation).
    registerValidator("CHECK_IN", {
        model: AI_MODEL_FAST,
        buildPrompt: buildCheckInPrompt,
        schema: checkInSchema,
        validate: validateCheckInReview,
        fallback: buildFallbackCheckIn,
        targetType: null,
        aiComplete,
    });
}

/**
 * Test-only helper — clears the idempotency flag so a test can re-run init
 * after `_resetValidatorsForTest()` on the orchestrator.
 */
export function _resetInitForTest() {
    _initialized = false;
}
