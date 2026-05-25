// ============================================================================
// Readiness tiers — single source of truth
// ============================================================================
//
// Before this file existed, three different threshold systems coexisted:
//   - ReportPage.jsx inline ternary (75/55/35 for Onsite/Phone/Building)
//   - ReportPage.jsx COMPANY_TIERS (80/65/50/35 for FAANG/Tier2/Mid/Junior)
//   - stats.controller.js THRESHOLDS (82/70/58/45 for FAANG/Onsite/Tech/Phone)
//
// Three systems, three sets of numbers, one user seeing "Phone Screen Ready"
// in the header while the readiness card below said "not yet ready for
// Tier 2 Tech (Amazon/Microsoft)." Consolidating on the COMPANY_TIERS
// because it's the most specific — named companies, not vague interview
// stages.
//
// If we ever calibrate these thresholds against real interview outcomes
// (via VerdictLog.interviewOutcome, roadmap: interview-pipeline-tracker),
// they change here and everywhere else updates automatically.
// ============================================================================

/**
 * Tiers, ordered by threshold DESC. Each tier declares its overall-score
 * threshold plus hard per-dimension requirements. A user is "ready" for
 * a tier when overall ≥ tier.threshold AND all per-dim requirements met.
 *
 * `masteryRequirements` are an additional gate enforced only when the
 * Coding Pattern Mastery v2 flag is on. They check counts on the per-
 * pattern mastery breakdown returned by computePatternMastery() — e.g.
 * `coreSolidOrAbove >= 10` means at least 10 of the 15 FAANG-core
 * patterns must be at SOLID or OWNED. When the flag is off (or
 * masteryCounts is not passed to classifyReadiness), these are ignored
 * and tier readiness uses the legacy score-only behavior.
 *
 * Thresholds were picked by product feel, not fit from data. Intentional —
 * we don't have outcome data yet. The VerdictLog table is how we'll
 * calibrate once we do.
 */
export const READINESS_TIERS = [
  {
    id: "faang",
    name: "FAANG / Top Tier",
    companies: "Google, Meta, Apple, Netflix, OpenAI",
    threshold: 80,
    requirements: {
      patternRecognition: 75,
      optimization: 70,
      pressurePerformance: 70,
      solutionDepth: 65,
    },
    masteryRequirements: {
      // 13/15 FAANG-core at SOLID+ leaves room for genuine specialization
      // gaps without letting a 3-pattern-only user pass.
      coreSolidOrAbove: 13,
      owned: 8,
      // D2 v2 (Solution Depth) gates — only checked when depth counts
      // are passed (FEATURE_SOLUTION_DEPTH_V2 on). 10/5 tier2→FAANG spread
      // is real (vs 5/8 in the original sketch which was only a 3-defended
      // gap — too narrow for tier separation).
      solutionsAtDefendedOrAbove: 10,
      solutionsAtOwned: 5,
      // D3 v2 (Communication) gates — only checked when comm counts are
      // passed (FEATURE_COMMUNICATION_V2 on). FAANG requires ≥3 mocks
      // with comm scores (Anderson & Shackleton 1990 rater-stability
      // result: ratings stabilize after 3-4 sessions). Peer ratings are
      // a future tightening once the peer-rating UI ships.
      commMocksWithScores: 3,
    },
    icon: "🏆",
  },
  {
    id: "tier2",
    name: "Tier 2 Tech",
    companies: "Amazon, Microsoft, Uber, Airbnb, Stripe",
    threshold: 65,
    requirements: {
      patternRecognition: 60,
      optimization: 50,
      pressurePerformance: 55,
      solutionDepth: 50,
    },
    masteryRequirements: {
      coreSolidOrAbove: 10,
      owned: 3,
      solutionsAtDefendedOrAbove: 4,
      solutionsAtOwned: 2,
      // D3 v2: Tier 2 requires ≥1 mock with comm scores. A user with only
      // AI-rated written explanations cannot honestly be Tier 2 ready on
      // communication (Levashina 2014: written-only signal r ≈ 0.20).
      commMocksWithScores: 1,
    },
    icon: "🥈",
  },
  {
    id: "tier3",
    name: "Mid-tier / Growth",
    companies: "Series B-D startups, mid-size tech",
    threshold: 50,
    requirements: {
      patternRecognition: 45,
      optimization: 35,
      pressurePerformance: 40,
    },
    masteryRequirements: {
      solidOrAbove: 6,
      solutionsAtDocumentedOrAbove: 5,
    },
    icon: "🥉",
  },
  {
    id: "junior",
    name: "Junior / Startup",
    companies: "Early startups, junior roles",
    threshold: 35,
    requirements: {
      patternRecognition: 30,
      optimization: 20,
    },
    masteryRequirements: {
      workingOrAbove: 4,
      solutionsAtDocumentedOrAbove: 3,
    },
    icon: "🌱",
  },
];

/**
 * Given an overall score (0-100), per-dimension scores, and (optionally)
 * mastery counts from computePatternMastery(), return tier-readiness info.
 *
 * Returns an object with:
 *   tiers: array of per-tier {id, name, companies, threshold, icon,
 *          ready, close, overallGap, failingDimensions, failingMastery}
 *   highest: the tier the user is currently ready for (or null)
 *   next: the next-higher tier they are NOT ready for (or null if already top)
 *
 * A tier is "ready" only if ALL of these hold:
 *   1. overall ≥ threshold
 *   2. every dimension requirement key is met by the matching dim score
 *   3. every mastery requirement key is met by the matching count
 *      (when masteryCounts is provided)
 *
 * Dimensions with score = null (inactive) count as not-meeting the
 * requirement — you can't claim readiness on an unmeasured skill.
 *
 * @param {number} overallScore  0-100
 * @param {Record<string,number>} [dimScoresByKey]  e.g. { patternRecognition: 60, ... }
 * @param {object} [masteryCounts]  shape from computePatternMastery().counts.
 *   When omitted, mastery gates are NOT checked (legacy behavior). Pass it
 *   only when the Pattern Mastery v2 flag is on.
 */
export function classifyReadiness(
  overallScore,
  dimScoresByKey = {},
  masteryCounts = null,
) {
  const overall = Number.isFinite(overallScore) ? overallScore : 0;

  const tiers = READINESS_TIERS.map((tier) => {
    const failing = [];
    for (const [dim, needed] of Object.entries(tier.requirements)) {
      const dimScore = dimScoresByKey[dim];
      if (!Number.isFinite(dimScore) || dimScore < needed) {
        failing.push({ dimension: dim, needed, actual: dimScore ?? null });
      }
    }

    const failingMastery = [];
    if (masteryCounts && tier.masteryRequirements) {
      for (const [key, needed] of Object.entries(tier.masteryRequirements)) {
        const actual = masteryCounts[key];
        if (!Number.isFinite(actual) || actual < needed) {
          failingMastery.push({ key, needed, actual: actual ?? 0 });
        }
      }
    }

    const overallGap = Math.max(0, tier.threshold - overall);
    const ready =
      overall >= tier.threshold
      && failing.length === 0
      && failingMastery.length === 0;
    // "close" — within 10 points overall AND at most one failing dim AND
    // at most one failing mastery requirement. Mastery gates can't make a
    // user "ready", but they can pull them out of "close" when far away.
    const close =
      !ready
      && overallGap <= 10
      && failing.length <= 1
      && failingMastery.length <= 1;

    return {
      id: tier.id,
      name: tier.name,
      companies: tier.companies,
      threshold: tier.threshold,
      icon: tier.icon,
      ready,
      close,
      overallGap,
      failingDimensions: failing,
      failingMastery,
    };
  });

  const highest = tiers.find((t) => t.ready) || null;
  // nextTier = the highest-threshold tier the user has NOT yet reached.
  // READINESS_TIERS is ordered DESC, so find the last un-ready tier.
  const firstNotReady = [...tiers].reverse().find((t) => !t.ready) || null;

  return { tiers, highest, next: firstNotReady };
}
