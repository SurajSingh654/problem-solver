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

export async function runAISurface({
  surface,
  promptVersion,
  buildPrompt,
  validate,
  buildFallback,
  transform,
  cacheKey,
  cacheLookup,
  aiOptions,
}) {
  const t0 = Date.now();

  if (cacheKey && cacheLookup) {
    const cached = await cacheLookup(cacheKey);
    if (cached) {
      logSurfaceCall({ surface, promptVersion, fromCache: true, latencyMs: Date.now() - t0 });
      return { data: cached, fromFallback: false, reason: null, fromCache: true };
    }
  }

  if (!isAIEnabled()) {
    return finalize({ data: buildFallback(FALLBACK_REASONS.AI_DISABLED), reason: FALLBACK_REASONS.AI_DISABLED });
  }

  const { system, user } = buildPrompt();
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

  const validation = validate(parsed);
  if (!validation.valid) {
    return finalize({
      data: buildFallback(FALLBACK_REASONS.VALIDATION),
      reason: FALLBACK_REASONS.VALIDATION,
      violations: validation.violations,
    });
  }

  const out = transform ? transform(validation.data) : validation.data;
  return finalize({ data: out, reason: null });

  function finalize({ data, reason, violations, error }) {
    const latencyMs = Date.now() - t0;
    logSurfaceCall({
      surface, promptVersion, latencyMs,
      fromFallback: reason !== null,
      reason, violations, errorCode: error?.code,
    });
    return { data, fromFallback: reason !== null, reason, fromCache: false };
  }
}

export function classifyAIError(err) {
  if (err?.code === "TIMEOUT" || err?.code === "ETIMEDOUT") return FALLBACK_REASONS.TIMEOUT;
  if (err?.code === 429 || err?.status === 429)             return FALLBACK_REASONS.RATE_LIMIT;
  if (err?.code === "model_not_found")                      return FALLBACK_REASONS.MODEL_NOT_FOUND;
  return FALLBACK_REASONS.UNKNOWN;
}

function logSurfaceCall(entry) {
  // Sentry / JSON-log pipeline is roadmap NEXT per CLAUDE.md.
  // Shape matters; sink is later.
  console.log("[ai-surface]", JSON.stringify(entry));
}
