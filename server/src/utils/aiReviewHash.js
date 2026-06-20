// computeReviewInputHash — content hash of the review's input fields used
// for cache short-circuiting in reviewSolution. Extracted from
// ai.controller.js so the new aiReview.controller.js can import it directly.
import crypto from "node:crypto";

// ── Stable serialization for the review-input hash ─────────────────
// JSON.stringify isn't deterministic across object key insertion order,
// so we walk objects with sorted keys. Anything in the hash input means
// "changing this re-runs the AI review."
function stableStringify(value) {
  if (value == null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") +
    "}"
  );
}

export function computeReviewInputHash(solution) {
  // The review prompt incorporates these fields. If any change → rerun.
  // RAG context (teammate solutions, pattern baseline) is intentionally
  // OUTSIDE the hash — those evolve with the team's other activity and
  // we don't want every teammate submission to invalidate every cache.
  // The cost of that decision: a user might see the same review even
  // though new RAG context exists. Force button is the escape hatch.
  const inputs = {
    problemVersion: solution.problemVersion ?? null,
    code: solution.code ?? "",
    approach: solution.approach ?? "",
    bruteForce: solution.bruteForce ?? "",
    optimizedApproach: solution.optimizedApproach ?? "",
    timeComplexity: solution.timeComplexity ?? "",
    spaceComplexity: solution.spaceComplexity ?? "",
    keyInsight: solution.keyInsight ?? "",
    feynmanExplanation: solution.feynmanExplanation ?? "",
    realWorldConnection: solution.realWorldConnection ?? "",
    patterns: [...(solution.patterns ?? [])].sort(),
    categorySpecificData: stableStringify(solution.categorySpecificData),
    followUpAnswers: (solution.followUpAnswers ?? [])
      .slice()
      .sort((a, b) =>
        (a.followUpQuestion?.id || "").localeCompare(b.followUpQuestion?.id || ""),
      )
      .map((a) => ({ qId: a.followUpQuestion?.id || "", a: a.answer ?? "" })),
  };
  return crypto.createHash("sha256").update(stableStringify(inputs)).digest("hex");
}
