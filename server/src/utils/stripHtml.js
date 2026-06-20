// Unified stripHtml — used by every server surface that needs to measure
// or compare HTML-flavored user prose against character / token thresholds.
//
// The most-thorough variant: removes all tags, normalizes &nbsp;, trims.
// Replaces 4 drift copies (optimizationStats, solutionDepth, stats.controller,
// ai.controller's stripHtmlServer) consolidated in Sprint 2 (Task 3).

export function stripHtml(s) {
  if (typeof s !== "string") return "";
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}
