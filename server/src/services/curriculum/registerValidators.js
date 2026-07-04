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
import { AI_MODEL_PRIMARY } from "../../config/env.js";
import { curriculumReviewSchema } from "../ai.schemas.js";
import { validateCurriculumReview } from "../ai.validators.js";
import { buildFallbackCurriculumReview } from "../ai.fallbacks.js";
import { buildCurriculumReviewPrompt } from "../ai.prompts.js";

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
}

/**
 * Test-only helper — clears the idempotency flag so a test can re-run init
 * after `_resetValidatorsForTest()` on the orchestrator.
 */
export function _resetInitForTest() {
    _initialized = false;
}
