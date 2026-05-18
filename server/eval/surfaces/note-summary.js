// ============================================================================
// Surface adapter — note-summary
// ============================================================================
//
// Wraps the existing AI surface so the eval runner can call it as a black box.
// Reuses:
//   noteSummaryPrompt(...) from ai.prompts.js — the actual prompt
//   aiComplete(...)        from ai.service.js — rate-limit, retry, timeout
//   validateNoteSummary    from ai.validators.js — schema-shape check
//
// Output:
//   { output, raw, tokens, error?, validation }
//   - output:      validated parsed JSON (or `null` if validation failed)
//   - raw:         the parsed JSON regardless of validation
//   - tokens:      { prompt, completion, total } if SDK reports them
//   - error:       string if the call threw or output was unparseable
//   - validation:  { valid, violations[] } from validateNoteSummary
// ============================================================================

import { aiComplete } from "../../src/services/ai.service.js";
import { noteSummaryPrompt, NOTE_SUMMARY_FEWSHOT } from "../../src/services/ai.prompts.js";
import { validateNoteSummary } from "../../src/services/ai.validators.js";

// A synthetic user id for eval runs. The rate limiter is per-user; a
// dedicated id keeps eval traffic separate from real-user counts.
const EVAL_USER_ID = "eval:note-summary";

export async function run(input) {
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
      surface: "eval:note-summary",
      fewShotMessages: NOTE_SUMMARY_FEWSHOT,
      temperature: 0.4,
      maxTokens: 700,
    });
    const elapsedMs = Date.now() - t0;

    const validation = validateNoteSummary(parsed, {
      hasContent: !!(input.contentMarkdown && input.contentMarkdown.trim()),
    });

    return {
      output: validation.valid ? parsed : null,
      raw: parsed,
      tokens: null, // aiComplete doesn't surface token counts; usage tracked via emitter
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
  }
}
