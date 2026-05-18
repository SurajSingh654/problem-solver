// ============================================================================
// Surface adapter — note-summary
// ============================================================================
//
// Wraps the existing AI surface so the eval runner can call it as a black box.
// Reuses:
//   noteSummaryPrompt(...) from ai.prompts.js — the actual prompt
//   aiComplete(...)        from ai.service.js — rate-limit, retry, timeout
//   validateNoteSummary    from ai.validators.js — schema-shape check
//   onUsageEvent           from ai.service.js — capture token / model / cost
//
// Output:
//   { output, raw, tokens, validation, error?, meta }
//   - output:      validated parsed JSON (or `null` if validation failed)
//   - raw:         the parsed JSON regardless of validation
//   - tokens:      { promptTokens, completionTokens, totalTokens, modelUsed,
//                    costUsd } — captured from the AI usage event
//   - validation:  { valid, violations[] } from validateNoteSummary
//   - error:       string if the call threw or output was unparseable
// ============================================================================

import { aiComplete, onUsageEvent } from "../../src/services/ai.service.js";
import { noteSummaryPrompt, NOTE_SUMMARY_FEWSHOT } from "../../src/services/ai.prompts.js";
import { validateNoteSummary } from "../../src/services/ai.validators.js";
import { calcCostUsd } from "../lib/cost.js";

// A synthetic user id for eval runs. The rate limiter is per-user; a
// dedicated id keeps eval traffic separate from real-user counts.
const EVAL_USER_ID = "eval:note-summary";
const SURFACE = "eval:note-summary";

export async function run(input) {
  // Subscribe to the usage emitter for the duration of this call. The
  // emitter is global; we filter by surface so concurrent runs don't
  // cross-pollute. `off()` is idempotent and called in a finally.
  let captured = null;
  const off = onUsageEvent((e) => {
    if (e.surface === SURFACE && !captured) {
      captured = e;
    }
  });

  try {
    const { system, user } = noteSummaryPrompt({
      title: input.title || "Untitled",
      contentMarkdown: input.contentMarkdown || "",
      tags: input.tags || [],
      isCompressed: !!input.isCompressed,
    });

    const t0 = Date.now();
    const parsed = await aiComplete({
      systemPrompt: system,
      userPrompt: user,
      userId: EVAL_USER_ID,
      surface: SURFACE,
      fewShotMessages: NOTE_SUMMARY_FEWSHOT,
      temperature: 0.4,
      maxTokens: 700,
    });
    const elapsedMs = Date.now() - t0;

    const validation = validateNoteSummary(parsed, {
      hasContent: !!(input.contentMarkdown && input.contentMarkdown.trim()),
    });

    const tokens = captured
      ? {
          promptTokens: captured.promptTokens ?? null,
          completionTokens: captured.completionTokens ?? null,
          totalTokens: captured.totalTokens ?? null,
          modelUsed: captured.modelUsed ?? null,
          costUsd: calcCostUsd({
            model: captured.modelUsed,
            promptTokens: captured.promptTokens,
            completionTokens: captured.completionTokens,
          }),
        }
      : null;

    return {
      output: validation.valid ? parsed : null,
      raw: parsed,
      tokens,
      validation,
      meta: { elapsedMs },
    };
  } catch (err) {
    return {
      output: null,
      raw: null,
      tokens: null,
      validation: { valid: false, violations: ["call-threw"] },
      error: err?.message || String(err),
    };
  } finally {
    off();
  }
}
