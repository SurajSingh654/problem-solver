// ============================================================================
// Curriculum · Content Review Service — orchestrator.
// ============================================================================
//
// Dispatches curriculum-review / lesson-review / code-review / check-in
// validators. Handles: input sanitization (delegated to sanitize.service.js
// via each validator's buildPrompt), AI call routing (via ai.service.js),
// Zod parse, rule-based validate, fallback on any failure, ContentReviewLog
// write (with rawPrompt hashing for prompts >8KB).
//
// Validators register into VALIDATORS at module init (from ai.prompts.js /
// ai.schemas.js / ai.validators.js / ai.fallbacks.js). T2 ships the
// orchestrator with an empty registry. Tasks 3-6 fill in one validator each.
// ============================================================================
import prisma from "../../lib/prisma.js";

const VALIDATORS = new Map();

/**
 * Register a validator spec. Called by ai.prompts.js / ai.validators.js
 * indirectly (via a curriculum-specific registry file added in T3-T6).
 *
 * spec shape:
 *   - model: string — model identifier passed to aiComplete.
 *   - buildPrompt: (input) => { prompt, systemPrompt, sanitizedInputs }
 *   - schema: ZodSchema-like { safeParse(data) }
 *   - validate: (parsedData, sanitizedInputs) => body (throws on rule violation)
 *   - fallback: (input) => body
 *   - targetType: "TOPIC" | "CONCEPT" | "LAB" | null  (null → no log row)
 *   - aiComplete: (opts) => Promise<string | object>  (usually ai.service.aiComplete)
 */
export function registerValidator(type, spec) {
    VALIDATORS.set(type, spec);
}

/**
 * Test-only helper to reset the validator registry between tests.
 * Do not use outside vitest.
 */
export function _resetValidatorsForTest() {
    VALIDATORS.clear();
}

/**
 * Test-only helper — merge a partial spec into an existing validator so a
 * single field (usually `aiComplete`) can be swapped for a mock without
 * re-registering the whole spec. Returns the ORIGINAL spec so tests can
 * restore state in afterEach. Do not use outside vitest.
 *
 * Used by the prompt-injection integration test (W2.T7) to feed the real
 * orchestrator adversarial "AI output" strings and assert the validator +
 * fallback chain reject them.
 */
export function _overrideValidatorSpec(type, patch) {
    const existing = VALIDATORS.get(type);
    if (!existing) throw new Error(`No validator registered for ${type}`);
    const original = { ...existing };
    VALIDATORS.set(type, { ...existing, ...patch });
    return original;
}

/**
 * Run a content-review validator end-to-end.
 *
 * Order of operations:
 * 1. Build prompt (validator sanitizes inputs).
 * 2. Call AI (via validator's aiComplete — usually ai.service.js.aiComplete).
 * 3. Zod safeParse. On failure → fallback.
 * 4. Rule-based validate. On throw → fallback.
 * 5. Write ContentReviewLog (unless targetType is null, e.g. CHECK_IN).
 * 6. Return { verdict, body, logId?, usedFallback }.
 */
export async function runValidator(type, input) {
    const spec = VALIDATORS.get(type);
    if (!spec) {
        throw new Error(`Unknown validator type: ${type}`);
    }

    const { prompt, systemPrompt, sanitizedInputs } = spec.buildPrompt(input);

    let body;
    let usedFallback = false;

    try {
        const raw = await spec.aiComplete({
            model: spec.model,
            systemPrompt,
            userPrompt: prompt,
            responseFormat: { type: "json_object" },
        });
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        const zodResult = spec.schema.safeParse(parsed);
        if (!zodResult.success) {
            throw new Error(`Zod validation failed: ${zodResult.error?.message ?? "schema mismatch"}`);
        }
        body = spec.validate(zodResult.data, sanitizedInputs);
    } catch (err) {
        console.warn(`[contentReview:${type}] validation failed, falling back:`, err.message);
        body = spec.fallback(input);
        usedFallback = true;
    }

    let logId;
    if (spec.targetType && input.targetId) {
        try {
            const logRow = await prisma.contentReviewLog.create({
                data: {
                    targetType: spec.targetType,
                    targetId: input.targetId,
                    verdict: body.verdict ?? body.overallVerdict ?? "UNKNOWN",
                    body,
                    rawPrompt: prompt.length > 8000 ? `HASH:${simpleHash(prompt)}` : prompt,
                    reviewerModel: usedFallback ? `${spec.model}:FALLBACK` : spec.model,
                },
            });
            logId = logRow.id;
        } catch (err) {
            // Log write failed. Log to console but don't fail the whole call —
            // the verdict is still valuable even without the audit trail.
            console.warn(`[contentReview:${type}] ContentReviewLog write failed:`, err.message);
        }
    }

    return {
        verdict: body.verdict ?? body.overallVerdict,
        body,
        logId,
        usedFallback,
    };
}

/**
 * Get the most recent verdict for a target. Used by publish gates.
 *
 * Returns null if:
 *   - The target has been deleted (orphan log rows are ignored — publish
 *     gate can't approve a nonexistent target anyway).
 *   - No review has been run yet.
 */
export async function latestVerdictFor(targetType, targetId) {
    // Verify target still exists.
    let targetExists;
    if (targetType === "TOPIC") {
        targetExists = await prisma.topic.findUnique({
            where: { id: targetId },
            select: { id: true },
        });
    } else if (targetType === "CONCEPT") {
        targetExists = await prisma.concept.findUnique({
            where: { id: targetId },
            select: { id: true },
        });
    } else if (targetType === "LAB") {
        targetExists = await prisma.lab.findUnique({
            where: { id: targetId },
            select: { id: true },
        });
    } else {
        return null;
    }

    if (!targetExists) return null;

    return prisma.contentReviewLog.findFirst({
        where: { targetType, targetId },
        orderBy: { createdAt: "desc" },
    });
}

// Non-cryptographic hash — forensic marker only.
function simpleHash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
}
