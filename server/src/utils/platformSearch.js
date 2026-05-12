// ============================================================================
// Platform search-URL fallback
// ============================================================================
//
// When the AI problem-generation pipeline reports low urlConfidence on a
// generated problem's source URL, we previously cleared the URL entirely —
// the admin approved a problem with no link at all, and the member ended
// up with nothing to click.
//
// This helper returns a platform-specific **search URL** instead. It's not
// the exact problem page, but it lands the user on the platform's search
// results for the problem title — always better than a dead link.
// ============================================================================

const PLATFORM_SEARCH = {
  LEETCODE: (q) => `https://leetcode.com/problemset/?search=${q}`,
  GFG: (q) => `https://www.geeksforgeeks.org/explore?page=1&searchQuery=${q}`,
  HACKERRANK: (q) =>
    `https://www.hackerrank.com/domains/algorithms?filters%5Bsearch%5D%5B%5D=${q}`,
  CODECHEF: (q) => `https://www.codechef.com/search?search_term=${q}`,
  INTERVIEWBIT: (q) => `https://www.interviewbit.com/search?query=${q}`,
  CODEFORCES: (q) => `https://codeforces.com/problemset?search=${q}`,
};

/**
 * Build a platform search URL for a given title. Returns null if the
 * platform isn't one we know how to search (caller can then decide what
 * fallback behavior to use — usually leaving the URL empty).
 */
export function getPlatformSearchUrl(platform, title) {
  if (!platform || !title) return null;
  const builder = PLATFORM_SEARCH[String(platform).toUpperCase()];
  if (!builder) return null;
  return builder(encodeURIComponent(title.trim()));
}

/**
 * Convenience: resolve the URL to actually store on a generated problem.
 * Applies this policy:
 *   - HR problems never have external URLs.
 *   - High/medium confidence → use the AI-provided URL.
 *   - Low confidence OR missing URL → platform search URL (or "" if the
 *     platform is unknown).
 */
export function resolveGeneratedSourceUrl({
  isHRProblem,
  urlConfidence,
  url,
  platform,
  title,
}) {
  if (isHRProblem) return "";
  const confidence = (urlConfidence || "high").toLowerCase();
  if (confidence !== "low" && url) return url;
  // Low-confidence OR missing — fall back to search.
  return getPlatformSearchUrl(platform, title) || "";
}
