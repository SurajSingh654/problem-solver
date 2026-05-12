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
    icon: "🌱",
  },
];

/**
 * Given an overall score (0-100) and a dimension-score object keyed by
 * dimension name, return tier-readiness info.
 *
 * Returns an object with:
 *   tiers: array of per-tier {id, name, companies, threshold, icon,
 *          ready, close, overallGap, failingDimensions}
 *   highest: the tier the user is currently ready for (or null)
 *   next: the next-higher tier they are NOT ready for (or null if already top)
 *
 * A tier is "ready" only if BOTH conditions hold:
 *   1. overall ≥ threshold
 *   2. every requirement key is met by the matching dim score
 *
 * Dimensions with score = null (inactive) count as not-meeting the
 * requirement — you can't claim readiness on an unmeasured skill.
 */
export function classifyReadiness(overallScore, dimScoresByKey = {}) {
  const overall = Number.isFinite(overallScore) ? overallScore : 0;

  const tiers = READINESS_TIERS.map((tier) => {
    const failing = [];
    for (const [dim, needed] of Object.entries(tier.requirements)) {
      const dimScore = dimScoresByKey[dim];
      if (!Number.isFinite(dimScore) || dimScore < needed) {
        failing.push({ dimension: dim, needed, actual: dimScore ?? null });
      }
    }
    const overallGap = Math.max(0, tier.threshold - overall);
    const ready = overall >= tier.threshold && failing.length === 0;
    const close = !ready && overallGap <= 10 && failing.length <= 1;

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
    };
  });

  const highest = tiers.find((t) => t.ready) || null;
  // nextTier = the highest-threshold tier the user has NOT yet reached.
  // READINESS_TIERS is ordered DESC, so find the last un-ready tier.
  const firstNotReady = [...tiers].reverse().find((t) => !t.ready) || null;

  return { tiers, highest, next: firstNotReady };
}
