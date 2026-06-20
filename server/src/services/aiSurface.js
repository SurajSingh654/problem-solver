// Single AI orchestration helper for every AI-calling controller.
// Encodes: validate→fallback pipeline, structured logging, failure-reason
// taxonomy, optional content-hash idempotency. Persistence stays in callers.

import { aiComplete, isAIEnabled } from "./ai.service.js";

export const FALLBACK_REASONS = Object.freeze({
  AI_DISABLED:     "AI_DISABLED",
  TIMEOUT:         "TIMEOUT",
  RATE_LIMIT:      "RATE_LIMIT",
  MODEL_NOT_FOUND: "MODEL_NOT_FOUND",
  VALIDATION:      "VALIDATION",
  UNKNOWN:         "UNKNOWN",
});

// Maps the wrapped-AIError codes that ai.service.js actually throws.
// See ai.service.js mapErrorToCode() and direct throw sites for source codes.
//
// AIError codes observed in ai.service.js:
//   Thrown directly:
//     "RATE_LIMITED"        — per-user-per-day cap (checkRateLimit)
//     "EMPTY_RESPONSE"      — AI returned empty content
//     "PARSE_ERROR"         — jsonMode response wasn't valid JSON
//
//   From mapErrorToCode() → wrapped in AIError:
//     "OPENAI_RATE_LIMITED" — HTTP 429 from OpenAI
//     "INVALID_API_KEY"     — HTTP 401
//     "OPENAI_DOWN"         — HTTP 500 / 502 / 503 / 504
//     "OPENAI_TIMEOUT"      — HTTP 408
//     "AI_ERROR"            — catch-all fallback
//
//   Note: "model_not_found" / "model_not_available" are handled by
//   callWithModelFallback to trigger a model swap; if the swap fails the
//   re-thrown raw OpenAI error goes through mapErrorToCode which returns
//   "AI_ERROR" (404 is not in its status list). Neither string appears as
//   an AIError.code in normal production flow — but both are mapped here
//   for defence in depth.
export function classifyAIError(err) {
  const code = err?.code;
  if (code === "OPENAI_TIMEOUT")                                    return FALLBACK_REASONS.TIMEOUT;
  if (code === "RATE_LIMITED" || code === "OPENAI_RATE_LIMITED")    return FALLBACK_REASONS.RATE_LIMIT;
  if (code === "model_not_found" || code === "model_not_available") return FALLBACK_REASONS.MODEL_NOT_FOUND;
  return FALLBACK_REASONS.UNKNOWN;
}

// runAISurface — main orchestration entry point.
//
// Parameters:
//   surface       (string)   — identifies the AI feature surface for logs/usage
//   promptVersion (string)   — version tag for the prompt template
//   buildPrompt   (fn)       — sync or async () => { system, user }
//   validate      (fn)       — (parsedAiOutput) => { valid, data?, violations? }
//   buildFallback (fn)       — (reason, violations?) => fallbackData
//   transform     (fn?)      — optional (validData) => transformedData
//   cacheKey      (string?)  — cache lookup key; skipped when falsy
//   cacheLookup   (fn?)      — async (key) => cachedValue | null | undefined
//   aiOptions     (object)   — forwarded to aiComplete (model, userId, teamId, etc.)
//   requestId     (string?)  — request ID for log correlation
//
// Return shape: { data, fromFallback, reason, fromCache, violations? }
//   violations is only present when reason === FALLBACK_REASONS.VALIDATION
export async function runAISurface({
  surface,
  promptVersion,
  buildPrompt,
  validate,
  buildFallback,
  transform,
  cacheKey,
  cacheLookup,
  aiOptions = {},
  requestId,
}) {
  const t0 = Date.now();

  // ── Cache short-circuit ────────────────────────────────────────────
  // Use !== null && !== undefined so falsy-but-valid values (0, "") are hits.
  if (cacheKey && cacheLookup) {
    const cached = await cacheLookup(cacheKey);
    if (cached !== null && cached !== undefined) {
      logSurfaceCall({
        surface, promptVersion, fromCache: true, latencyMs: Date.now() - t0,
        model: aiOptions.model,
        userId: aiOptions.userId,
        teamId: aiOptions.teamId,
        requestId,
      });
      return { data: cached, fromFallback: false, reason: null, fromCache: true };
    }
  }

  // ── AI disabled ────────────────────────────────────────────────────
  if (!isAIEnabled()) {
    return finalize({ data: buildFallback(FALLBACK_REASONS.AI_DISABLED), reason: FALLBACK_REASONS.AI_DISABLED });
  }

  // ── Build prompt (sync or async) ───────────────────────────────────
  let promptResult;
  try {
    promptResult = await buildPrompt();
  } catch (err) {
    return finalize({ data: buildFallback(FALLBACK_REASONS.UNKNOWN), reason: FALLBACK_REASONS.UNKNOWN, error: err });
  }
  const { system, user } = promptResult;

  // ── Call AI ────────────────────────────────────────────────────────
  let parsed = null;
  let aiError = null;
  try {
    parsed = await aiComplete({
      systemPrompt: system,
      userPrompt: user,
      ...aiOptions,
      surface,
    });
  } catch (err) {
    aiError = err;
  }

  if (aiError) {
    const reason = classifyAIError(aiError);
    return finalize({ data: buildFallback(reason), reason, error: aiError });
  }

  // ── Validate ───────────────────────────────────────────────────────
  let validation;
  try {
    validation = validate(parsed);
  } catch (err) {
    const violations = [err?.message ?? "validator threw"];
    return finalize({
      data: buildFallback(FALLBACK_REASONS.VALIDATION, violations),
      reason: FALLBACK_REASONS.VALIDATION,
      violations,
    });
  }

  if (!validation.valid) {
    const { violations } = validation;
    return finalize({
      data: buildFallback(FALLBACK_REASONS.VALIDATION, violations),
      reason: FALLBACK_REASONS.VALIDATION,
      violations,
    });
  }

  // ── Transform ──────────────────────────────────────────────────────
  let out;
  try {
    out = transform ? transform(validation.data) : validation.data;
  } catch (err) {
    return finalize({ data: buildFallback(FALLBACK_REASONS.UNKNOWN), reason: FALLBACK_REASONS.UNKNOWN, error: err });
  }

  return finalize({ data: out, reason: null });

  // ── Shared finalize + log ──────────────────────────────────────────
  function finalize({ data, reason, violations, error }) {
    const latencyMs = Date.now() - t0;
    logSurfaceCall({
      surface, promptVersion, latencyMs,
      fromFallback: reason !== null,
      reason, violations, errorCode: error?.code,
      model: aiOptions.model,
      userId: aiOptions.userId,
      teamId: aiOptions.teamId,
      requestId,
    });
    const result = { data, fromFallback: reason !== null, reason, fromCache: false };
    if (violations !== undefined) result.violations = violations;
    return result;
  }
}

function logSurfaceCall(entry) {
  // Sentry / JSON-log pipeline is roadmap NEXT per CLAUDE.md.
  // Shape matters; sink is later.
  console.log("[ai-surface]", JSON.stringify(entry));
}
