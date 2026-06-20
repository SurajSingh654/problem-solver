// ============================================================================
// REVIEW GRADE — semantic match of structured recall vs stored notes
// ============================================================================
//
// Why this exists: the legacy word-diff in RecallDiff.jsx returns harshly
// false negatives when the user uses synonymous concepts ("HashMap" ≈
// "Hashing"). This endpoint runs an LLM as a semantic grader on three
// structured fields (pattern, keyInsight, complexity) and surfaces a
// calibrated suggestedConfidence so the user can self-rate honestly.
//
// Reported by Sooraj Singh (Binary Thinkers, 2026-05-25, feedback ID
// cmpl5lefk0006bvxu3gppm9ph).
//
// Validate→fallback pattern: if the LLM returns a malformed shape, the
// controller emits a deterministic conservative grade so the UI never
// crashes.
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { AI_ENABLED, AI_MODEL_FAST } from "../config/env.js";
import { aiComplete } from "../services/ai.service.js";
import { matchCanonicalApproach } from "../utils/canonicalApproachMatcher.js";
import { stripHtml } from "../utils/stripHtml.js";

const VALID_MATCH = new Set(["YES", "PARTIAL", "NO"]);
const VALID_OVERALL = new Set(["pass", "partial", "miss"]);

const GRADER_AGAINST_MATCHED_SYSTEM = `You are a strict but fair spaced-repetition grader. The server has already identified which approach the user implemented; your job is to grade their RECALL against that specific approach.

You receive:
  - <grade_against>: the approach to grade against (pattern + keyInsight + complexity).
  - <user_recall>: what the user typed just now (pattern, keyInsight, complexity).

Match SEMANTICALLY ("HashMap" matches "Hashing", "linear time" matches "O(n)").

For each field:
  - YES: recall captures the same concept as <grade_against>.
  - PARTIAL: right idea, missed an important detail.
  - NO: empty, wrong, or unrelated.

For complexity: O(n) ≠ O(n log n). If user gives one but <grade_against> has both time and space, PARTIAL on the missing one.

In feedback: be specific. Reference the approach by name when helpful.

suggestedConfidence (1-5):
  5 = all YES, 4 = one PARTIAL, 3 = one NO or two PARTIAL, 2 = multiple gaps, 1 = mostly wrong/empty.
  If \`peeked: true\`, suggestedConfidence MUST be ≤ 3.

Output STRICT JSON (no matchedApproach — the server computed it):
{
  "pattern":            { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "keyInsight":         { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "complexity":         { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "overall":            "pass"|"partial"|"miss",
  "suggestedConfidence": <1-5>
}`;

function clampConfidence(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 3;
  return Math.max(1, Math.min(5, v));
}

function validateRecallGrade(parsed, { peeked = false } = {}) {
  if (!parsed || typeof parsed !== "object") return null;
  const fields = ["pattern", "keyInsight", "complexity"];
  const out = {};
  for (const f of fields) {
    const slot = parsed[f];
    if (!slot || typeof slot !== "object") return null;
    const match = String(slot.match ?? "").toUpperCase();
    if (!VALID_MATCH.has(match)) return null;
    const feedback = typeof slot.feedback === "string" ? slot.feedback.trim().slice(0, 400) : "";
    out[f] = { match, feedback };
  }
  const overall = String(parsed.overall ?? "").toLowerCase();
  if (!VALID_OVERALL.has(overall)) return null;
  out.overall = overall;
  let suggestedConfidence = clampConfidence(parsed.suggestedConfidence);
  if (peeked && suggestedConfidence > 3) {
    console.warn("[recall-grade:peek-clamp] model suggested", suggestedConfidence, "→ 3");
    suggestedConfidence = 3;
  }
  out.suggestedConfidence = suggestedConfidence;
  return out;
}

function buildFallbackRecallGrade({ pattern, keyInsight, complexity, peeked = false } = {}) {
  // Conservative: when the LLM is unavailable, mark every field PARTIAL with
  // an honest "AI offline" message and suggest the middle confidence rating.
  // When the user peeked, lower the suggested confidence to 2 (re-learning).
  const partial = {
    match: "PARTIAL",
    feedback: "AI grading is unavailable right now — review your notes manually and rate honestly.",
  };
  const empty = {
    match: "NO",
    feedback: "Nothing recalled in this field.",
  };
  return {
    pattern: pattern?.trim() ? partial : empty,
    keyInsight: keyInsight?.trim() ? partial : empty,
    complexity: complexity?.trim() ? partial : empty,
    overall: "partial",
    suggestedConfidence: peeked ? 2 : 3,
  };
}

export async function gradeReviewRecall(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, "AI features are disabled.", 503);
    }

    const { solutionId } = req.params;
    const teamId = req.teamId;
    const userId = req.user.id;

    const recall = req.body?.recall ?? {};
    const pattern = typeof recall.pattern === "string" ? recall.pattern.trim().slice(0, 500) : "";
    const keyInsight = typeof recall.keyInsight === "string" ? recall.keyInsight.trim().slice(0, 1500) : "";
    const complexity = typeof recall.complexity === "string" ? recall.complexity.trim().slice(0, 200) : "";
    const peeked = req.body?.peeked === true;

    // Reject completely empty submissions — there's nothing to grade.
    if (!pattern && !keyInsight && !complexity) {
      return error(res, "Recall is empty — type something in at least one field.", 400);
    }

    const solution = await prisma.solution.findFirst({
      where: { id: solutionId, userId, teamId },
      select: {
        id: true,
        problemId: true,
        patterns: true,
        keyInsight: true,
        optimizedApproach: true,
        feynmanExplanation: true,
        timeComplexity: true,
        spaceComplexity: true,
        aiFeedback: true,
        problem: {
          select: {
            id: true,
            title: true,
            difficulty: true,
            category: true,
            description: true,
            canonicalGeneratedAt: true,
            canonicalPattern: true,
            canonicalKeyInsight: true,
            canonicalTimeComplexity: true,
            canonicalSpaceComplexity: true,
            canonicalAlternatives: true,
          },
        },
      },
    });
    if (!solution) return error(res, "Solution not found.", 404);

    // Decide anchor: canonical (preferred) vs legacy user-notes fallback.
    const prob = solution.problem;
    const hasCanonical =
      prob?.canonicalGeneratedAt != null &&
      (prob.canonicalPattern || prob.canonicalKeyInsight || prob.canonicalTimeComplexity);

    const altsFlagOn = process.env.FEATURE_CANONICAL_ALTERNATIVES === "true";
    const alternatives =
      Array.isArray(prob?.canonicalAlternatives) ? prob.canonicalAlternatives : [];
    const useMultiApproachPrompt = altsFlagOn && hasCanonical && alternatives.length > 0;

    let systemPrompt;
    let userPrompt;
    let matchedApproach = null;
    let discrepancy = null;

    if (useMultiApproachPrompt) {
      // ── Trust → Match → Grade pipeline ───────────────────────────────────
      const primary = {
        pattern: prob.canonicalPattern,
        keyInsight: prob.canonicalKeyInsight,
        timeComplexity: prob.canonicalTimeComplexity,
        spaceComplexity: prob.canonicalSpaceComplexity,
      };
      const latestAiFeedback = Array.isArray(solution.aiFeedback)
        ? solution.aiFeedback[solution.aiFeedback.length - 1] ?? null
        : solution.aiFeedback ?? null;

      const matchResult = matchCanonicalApproach({
        solution: {
          timeComplexity: solution.timeComplexity,
          spaceComplexity: solution.spaceComplexity,
          patterns: solution.patterns,
        },
        primary,
        alternatives,
        aiFeedback: latestAiFeedback,
      });
      matchedApproach = matchResult.matchedApproach;
      discrepancy = matchResult.discrepancy;

      let chosen;
      if (matchedApproach === "primary") {
        chosen = { name: "primary", ...primary };
      } else {
        const norm = (s) => (typeof s === "string" ? s.trim().toLowerCase() : "");
        const found = alternatives.find((a) => norm(a.name) === norm(matchedApproach));
        if (!found) {
          console.warn(
            "[recall-grade:chosen-fallback] matched approach not found in alternatives; grading against primary",
            { matchedApproach, altNames: alternatives.map((a) => a.name) },
          );
          chosen = { name: "primary", ...primary };
        } else {
          chosen = found;
        }
      }

      systemPrompt = GRADER_AGAINST_MATCHED_SYSTEM;
      userPrompt = `Problem: <problem_title>${prob.title}</problem_title> (${prob.difficulty} ${prob.category})

<grade_against>
  approach: ${chosen.name}
  pattern: ${chosen.pattern}
  keyInsight: ${chosen.keyInsight}
  time: ${chosen.timeComplexity}  space: ${chosen.spaceComplexity}
</grade_against>

<user_recall_pattern>${pattern || "(empty)"}</user_recall_pattern>
<user_recall_key_insight>${keyInsight || "(empty)"}</user_recall_key_insight>
<user_recall_complexity>${complexity || "(empty)"}</user_recall_complexity>

peeked: ${peeked}

Grade each field. Return JSON only.`;
    } else if (hasCanonical) {
      // ── Canonical-anchor path ─────────────────────────────────────────────
      const canonicalComplexity = [prob.canonicalTimeComplexity, prob.canonicalSpaceComplexity]
        .filter(Boolean)
        .join(" / ") || "(not recorded)";
      const notesPattern = (solution.patterns ?? []).join(", ") || "(none)";
      const notesInsight =
        stripHtml(solution.keyInsight) ||
        stripHtml(solution.feynmanExplanation) ||
        stripHtml(solution.optimizedApproach) ||
        "(none)";
      const notesComplexity = [solution.timeComplexity, solution.spaceComplexity]
        .filter(Boolean)
        .join(" / ") || "(none)";

      systemPrompt = `You are a strict but fair spaced-repetition grader. The user is recalling a coding problem they previously solved. Judge whether their recall is correct FOR THE PROBLEM, not whether it matches their old notes.

The CANONICAL block is the ground truth. The USER_NOTES block is what the user wrote when they originally solved it — useful as context (they may have discovered a different valid angle), but never override CANONICAL with USER_NOTES if they conflict. If the user's recall matches a valid alternative not captured in CANONICAL, grade YES and note the alternative in feedback.

Grading rules:
- Match SEMANTICALLY. "HashMap" matches "Hashing"; "two-pointer" matches "Two Pointers"; "linear time" matches "O(n)".
- A field is YES if the recall captures the same concept (or a valid alternative for the problem).
- A field is PARTIAL if right idea but missed important detail.
- A field is NO if empty, wrong, or unrelated to the problem.
- For complexity: O(n) ≠ O(n log n). If user gives one but reference has both, PARTIAL on the missing one.
- suggestedConfidence (1-5): 5 = all YES, 4 = one PARTIAL, 3 = one NO or two PARTIAL, 2 = multiple gaps, 1 = mostly wrong/empty. Be honest.
- If \`peeked: true\` is set, suggestedConfidence MUST be ≤ 3 (the user saw the answer; this is a re-learning moment, not a successful recall).

Feedback strings are shown to the user — be specific and constructive.
On PARTIAL/NO, name the gap and the next step ("You said hashmap; the canonical is two-pointers — they're different time/space tradeoffs").

Output STRICT JSON, no prose:
{
  "pattern":            { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "keyInsight":         { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "complexity":         { "match": "YES"|"PARTIAL"|"NO", "feedback": "..." },
  "overall":            "pass"|"partial"|"miss",
  "suggestedConfidence": <1-5>
}`;

      userPrompt = `Problem: <problem_title>${prob.title}</problem_title> (${prob.difficulty} ${prob.category})

<canonical_pattern>${prob.canonicalPattern || "(none)"}</canonical_pattern>
<canonical_key_insight>${prob.canonicalKeyInsight || "(none)"}</canonical_key_insight>
<canonical_complexity>${canonicalComplexity}</canonical_complexity>

<user_notes_pattern>${notesPattern}</user_notes_pattern>
<user_notes_key_insight>${notesInsight.slice(0, 1500)}</user_notes_key_insight>
<user_notes_complexity>${notesComplexity}</user_notes_complexity>

<user_recall_pattern>${pattern || "(empty)"}</user_recall_pattern>
<user_recall_key_insight>${keyInsight || "(empty)"}</user_recall_key_insight>
<user_recall_complexity>${complexity || "(empty)"}</user_recall_complexity>

peeked: ${peeked}

Grade each field. Return JSON only.`;
    } else {
      // ── Legacy notes-anchor path (canonical not yet generated) ────────────
      const referencePattern = (solution.patterns ?? []).join(", ") || "(not recorded)";
      const referenceInsight =
        stripHtml(solution.keyInsight) ||
        stripHtml(solution.feynmanExplanation) ||
        stripHtml(solution.optimizedApproach) ||
        "(not recorded)";
      const referenceComplexity = [solution.timeComplexity, solution.spaceComplexity]
        .filter(Boolean)
        .join(" / ") || "(not recorded)";

      systemPrompt = `You are a strict but fair spaced-repetition grader for coding problems. The user has just attempted to recall a problem they previously solved. You are comparing their recall (in three fields: pattern, keyInsight, complexity) against their own stored notes from when they originally solved it.

Grading rules:
- Match SEMANTICALLY, not by surface words. "HashMap" matches "Hashing" or "Hash Table"; "Two Pointers" matches "two-pointer technique"; "O(n)" matches "linear time".
- A field is YES if the user's recall captures the same concept as the reference, even with different wording.
- A field is PARTIAL if the user got the right idea but missed an important detail, or named a related-but-not-identical concept.
- A field is NO if the user's recall is empty, wrong, or unrelated.
- For complexity: if user says "O(n)" and reference is "O(n log n)", that's NO (different time class). If user says "Time: O(n)" and reference is "O(n)" without specifying space, that's YES on time (PARTIAL if reference also has space and user omits it).
- suggestedConfidence is an integer 1-5 calibrated to the SM-2 scale: 5 = perfect recall (all fields YES), 4 = strong with one PARTIAL, 3 = mostly right but one NO or two PARTIAL, 2 = rough idea but multiple gaps, 1 = mostly wrong or empty. Be honest — overconfident ratings hurt long-term retention.

Return JSON ONLY, no prose:
{
  "pattern":     { "match": "YES"|"PARTIAL"|"NO", "feedback": "<one short sentence>" },
  "keyInsight":  { "match": "YES"|"PARTIAL"|"NO", "feedback": "<one short sentence>" },
  "complexity":  { "match": "YES"|"PARTIAL"|"NO", "feedback": "<one short sentence>" },
  "overall":     "pass"|"partial"|"miss",
  "suggestedConfidence": <1-5 integer>
}

The "feedback" strings are shown directly to the user — be specific and constructive. If a recall is exactly right, say so plainly; don't pad with praise.`;

      userPrompt = `Problem: <problem_title>${prob?.title || solution.problemId}</problem_title> (${prob?.difficulty || ""} ${prob?.category || ""})

<user_notes_pattern>${referencePattern}</user_notes_pattern>
<user_notes_key_insight>${referenceInsight.slice(0, 1500)}</user_notes_key_insight>
<user_notes_complexity>${referenceComplexity}</user_notes_complexity>

<user_recall_pattern>${pattern || "(empty)"}</user_recall_pattern>
<user_recall_key_insight>${keyInsight || "(empty)"}</user_recall_key_insight>
<user_recall_complexity>${complexity || "(empty)"}</user_recall_complexity>

Grade each field semantically. Return JSON only.`;
    }

    let parsed;
    try {
      parsed = await aiComplete({
        systemPrompt,
        userPrompt,
        userId,
        teamId,
        model: AI_MODEL_FAST,
        temperature: 0.2,
        maxTokens: 600,
        jsonMode: true,
        surface: "review-grade",
      });
    } catch (aiErr) {
      // Fall through to deterministic fallback rather than 500 — this surface
      // is interactive; user is staring at the modal waiting for a response.
      // Preserve matchedApproach + discrepancy: the matcher already ran before
      // the AI call, so the educational signal must survive an LLM outage.
      console.error("review-grade aiComplete failed:", aiErr);
      const fallback = buildFallbackRecallGrade({ pattern, keyInsight, complexity, peeked });
      return success(res, { ...fallback, fallback: true, matchedApproach, discrepancy });
    }

    const validated = validateRecallGrade(parsed, { peeked });
    if (!validated) {
      console.warn("review-grade: validator rejected LLM output, using fallback");
      const fallback = buildFallbackRecallGrade({ pattern, keyInsight, complexity, peeked });
      return success(res, { ...fallback, fallback: true, matchedApproach, discrepancy });
    }

    // Server is authoritative for matchedApproach and discrepancy.
    return success(res, {
      ...validated,
      matchedApproach,
      discrepancy,
      fallback: false,
    });
  } catch (err) {
    console.error("Review grade error:", err);
    return error(res, "Failed to grade recall.", 500);
  }
}
