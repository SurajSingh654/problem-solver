// ============================================================================
// ProbSolver v3.0 — AI Canonical Controller
// ============================================================================
//
// Owns two exported functions:
//   generateCanonicalAnswer    — first-time (or regenerate) canonical answer
//   augmentCanonicalAlternatives — legacy backfill: add alternatives to an
//                                  existing primary without modifying it
//
// Both functions are pure AI helpers — no HTTP req/res, no Prisma. Callers
// in problems.controller.js own the persistence + response envelope.
//
// ============================================================================
import { AI_MODEL_FAST } from "../config/env.js";
import { aiComplete } from "../services/ai.service.js";
import {
  validateCanonicalAnswer,
  validateCanonicalAlternative,
  validateAlternativeAllowingPrimaryPattern,
} from "../services/ai.validators.js";
import { dedupAndCapAlternatives } from "../utils/canonicalAltDedup.js";
import { CANONICAL_PATTERN_LABELS } from "../utils/patternTaxonomy.js";

// ============================================================================
// CANONICAL PROMPTS
// ============================================================================

const CANONICAL_TAXONOMY_LIST = CANONICAL_PATTERN_LABELS.join(", ");

const CANONICAL_SYSTEM_PROMPT = `You produce the canonical interview answer for a coding problem. Your output is the ground truth that future spaced-repetition reviews will be graded against. Be precise, terse, and pick the most teachable approach when several are valid.

Rules:
- pattern: pick ONE label from the canonical taxonomy when possible. If the problem is a clear hybrid, pick the more dominant pattern.
- keyInsight: 2-3 sentences. State the core idea, not the implementation. A candidate who reads this should be able to derive the algorithm.
- timeComplexity / spaceComplexity: optimal complexity. Use "O(?)" form.
- Do not include code.
- Do not hedge. This is the canonical answer; admins can override later.

Canonical taxonomy: ${CANONICAL_TAXONOMY_LIST}

Output STRICT JSON:
{
  "pattern":         "<single label>",
  "keyInsight":      "<2-3 sentences>",
  "timeComplexity":  "O(?)",
  "spaceComplexity": "O(?)"
}`;

const CANONICAL_SYSTEM_PROMPT_WITH_ALTS = `You produce the canonical interview answer for a coding problem. Your output is the ground truth that future spaced-repetition reviews will be graded against.

Output a PRIMARY answer plus 0-3 ALTERNATIVES.

Primary rules:
- pattern: pick ONE label from the canonical taxonomy when possible.
- keyInsight: 2-3 sentences. State the core idea, not the implementation.
- timeComplexity / spaceComplexity: optimal complexity for the most teachable approach. Use "O(?)" form.

When to include alternatives:
Many interview problems have 2-3 valid approaches with materially different trade-offs (e.g. iterative O(1) space vs memoized O(n) space). Include an alternative ONLY when it differs from PRIMARY in at least one of:
  - pattern
  - timeComplexity
  - spaceComplexity
And ONLY when it's a textbook approach a strong candidate would mention. Do NOT pad with degenerate variants (e.g. "brute force O(n^3)" when the problem has obvious better solutions). Cap at 3.

Alternative rules:
- name: short label (≤ 60 chars), e.g. "Memoized recursion", "Iterative two-variable", "Heap-based selection".
- pattern: from canonical taxonomy OR same as primary.
- keyInsight: 1-2 sentences specific to this approach (not a copy of primary).
- timeComplexity / spaceComplexity: O(?) form.

Do not include code. Do not hedge. Be terse and precise.

Canonical taxonomy: ${CANONICAL_TAXONOMY_LIST}

Output STRICT JSON:
{
  "pattern":         "<single label>",
  "keyInsight":      "<2-3 sentences>",
  "timeComplexity":  "O(?)",
  "spaceComplexity": "O(?)",
  "alternatives": [
    {
      "name":            "<≤60 char label>",
      "pattern":         "<taxonomy label or same as primary>",
      "keyInsight":      "<1-2 sentences>",
      "timeComplexity":  "O(?)",
      "spaceComplexity": "O(?)"
    }
  ]
}`;

const CANONICAL_AUGMENT_SYSTEM_PROMPT = `You augment an existing canonical answer for a coding problem with valid alternative approaches. The PRIMARY answer is already established and will NOT be modified. Your job: identify 0-3 textbook alternatives.

When to include alternatives:
Many interview problems have 2-3 valid approaches with materially different trade-offs (e.g. iterative O(1) space vs memoized O(n) space). Include an alternative ONLY when it differs from PRIMARY in at least one of:
  - pattern
  - timeComplexity
  - spaceComplexity
And ONLY when it's a textbook approach a strong candidate would mention. Do NOT pad with degenerate variants. Cap at 3.

Alternative rules:
- name: short label (≤ 60 chars), e.g. "Memoized recursion", "Iterative two-variable".
- pattern: from canonical taxonomy OR same as primary.
- keyInsight: 1-2 sentences specific to this approach (not a copy of primary).
- timeComplexity / spaceComplexity: O(?) form.

Do NOT propose changes to the primary. Do NOT include the primary in your output array.

Canonical taxonomy: ${CANONICAL_TAXONOMY_LIST}

Output STRICT JSON:
{
  "alternatives": [
    { "name": "...", "pattern": "...", "keyInsight": "...",
      "timeComplexity": "O(?)", "spaceComplexity": "O(?)" }
  ]
}`;

// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================

/**
 * Generate the canonical answer for a problem. Returns null if the AI call
 * succeeds but the output fails validation — caller should NOT persist
 * canonicalGeneratedAt in that case so the next request retries.
 *
 * Throws on AI errors (timeout / 5xx / not-enabled). Caller handles those
 * with a retry-able 503 envelope.
 */
export async function generateCanonicalAnswer(problem, { userId, teamId }) {
  const userPrompt = `<problem_title>${problem.title}</problem_title>
<problem_description>${problem.description ?? ""}</problem_description>
Difficulty: ${problem.difficulty}
Category: ${problem.category}`;

  const altsEnabled = process.env.FEATURE_CANONICAL_ALTERNATIVES === "true";
  const systemPrompt = altsEnabled
    ? CANONICAL_SYSTEM_PROMPT_WITH_ALTS
    : CANONICAL_SYSTEM_PROMPT;
  const maxTokens = altsEnabled ? 700 : 400;

  const parsed = await aiComplete({
    systemPrompt,
    userPrompt,
    userId,
    teamId,
    model: AI_MODEL_FAST,
    temperature: 0.1,
    maxTokens,
    jsonMode: true,
    surface: "canonical-generate",
  });

  return validateCanonicalAnswer(parsed);
}

/**
 * Generate alternatives for an existing canonical (legacy backfill path).
 * Takes the existing primary as input. Never modifies the primary.
 *
 * Returns: array of validated alternatives (may be empty). Returns [] on
 * malformed responses — caller decides whether to persist.
 *
 * Throws on AI errors (timeout / 5xx / not-enabled). Caller handles.
 */
export async function augmentCanonicalAlternatives(problem, primary, { userId, teamId }) {
  const userPrompt = `<problem_title>${problem.title}</problem_title>
<problem_description>${problem.description ?? ""}</problem_description>
Difficulty: ${problem.difficulty}
Category: ${problem.category}

PRIMARY (already established, do not modify):
<primary_pattern>${primary.pattern}</primary_pattern>
<primary_key_insight>${primary.keyInsight}</primary_key_insight>
<primary_complexity>${primary.timeComplexity} / ${primary.spaceComplexity}</primary_complexity>

Identify 0-3 valid alternatives. Return JSON only.`;

  const parsed = await aiComplete({
    systemPrompt: CANONICAL_AUGMENT_SYSTEM_PROMPT,
    userPrompt,
    userId,
    teamId,
    model: AI_MODEL_FAST,
    temperature: 0.1,
    maxTokens: 400,
    jsonMode: true,
    surface: "canonical-augment",
  });

  if (!parsed || typeof parsed !== "object") return [];
  const rawAlts = Array.isArray(parsed.alternatives) ? parsed.alternatives : [];

  const validatedAlts = rawAlts
    .map((alt) => {
      if (alt && typeof alt === "object" && alt.pattern === primary.pattern) {
        return validateAlternativeAllowingPrimaryPattern(alt);
      }
      return validateCanonicalAlternative(alt);
    })
    .filter((a) => a !== null);

  return dedupAndCapAlternatives(validatedAlts, primary);
}
