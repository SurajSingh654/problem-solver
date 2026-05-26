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
/**
 * Mastery-requirement keys that are MAXIMUMS rather than minimums — the
 * actual value must be ≤ the threshold (rate-style metrics where smaller
 * is better). All other masteryRequirement keys use ≥ (minimum) semantics.
 *
 * Add to this set when introducing a new rate / failure-frequency gate.
 * Explicit list rather than name-based heuristic so a typo in a tier
 * requirement can't silently flip the comparison direction.
 */
export const MAX_THRESHOLD_KEYS = new Set([
  "retentionLeechRate",         // D6 v2 — leech sessions / total sessions
  "teachingFlagRate",           // D7 v2 — flagged sessions / total sessions
]);

/**
 * Mastery-requirement keys that belong to OPT-IN dimensions. When the
 * user hasn't opted in (no count present in masteryCounts), the gate is
 * SKIPPED rather than failed — opt-in dims can't punish the silent
 * majority that hasn't engaged with them.
 *
 * Currently teaching is the only opt-in dim. Compare with the baseline
 * dims (D1-D6) where every user has an implicit "n=0" — those gates
 * legitimately fail when activation never happens.
 */
export const OPT_IN_KEYS = new Set([
  "teachingSessions",
  "teachingRatings",
  "teachingScore",
  "teachingFlagRate",
  // D8 Design Aptitude — opt-in like D7. Users who never opened the
  // Design Studio can still be tier-ready on coding alone; the gate is
  // skipped when these keys are absent from masteryCounts.
  "designSessions",
  "designScenarios",
  "designScore",
  "designInterviewerPaired",
]);

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
      // D4 v2 (Optimization) gates — only checked when opt counts are
      // passed (FEATURE_OPTIMIZATION_V2 on). 10/5 mirrors D2's spread.
      optAtTradeOffOrAbove: 10,
      optAtOwned: 5,
      // D6 v2 (Retention) gates — sample size + score floor + max leech
      // rate. retentionLeechRate uses INVERSE comparison (≤ rather than ≥)
      // — see classifyReadiness's isMaxKey branch.
      retentionAttempts: 25,
      retentionScore: 75,
      retentionLeechRate: 0.20, // MAX: actual must be ≤ this
      // D7 v2 (Teaching Contributions) gates — only checked when teaching
      // counts are passed (FEATURE_TEACHING_CONTRIBUTIONS_V2 on AND user has
      // hosted ≥1 session). FAANG requires stable-peer-cohort signal:
      // 5 sessions × 10 ratings × score≥75 (Topping 1996 / Anderson-
      // Shackleton 1990 — peer-rating stability).
      teachingSessions: 5,
      teachingRatings: 10,
      teachingScore: 75,
      teachingFlagRate: 0.10, // MAX: actual must be ≤ this
      // D8 Design Aptitude gates — opt-in. FAANG requires interviewer-
      // paired signal: 5 sessions + 15 evaluated scenarios + score ≥75
      // + ≥1 interviewer-paired session (Schoenfeld 1985 design competency
      // requires repeated stress-tested practice).
      designSessions: 5,
      designScenarios: 15,
      designScore: 75,
      designInterviewerPaired: 1,
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
      // D4 v2: ≥4 solutions at TRADE_OFF+, ≥2 OWNED. Trade-off
      // articulation is the senior-level differentiator (Schoenfeld 1985;
      // interviewing.io 2023 — "did not consider alternatives" is the #1
      // L4/L5 no-hire reason).
      optAtTradeOffOrAbove: 4,
      optAtOwned: 2,
      // D6 v2: ≥10 successful reviews + score ≥60. Lange-Wang-Dunlosky
      // 2013 small-sample threshold for credible retention claim.
      retentionAttempts: 10,
      retentionScore: 60,
      // D7 v2: Tier 2 requires peer-validated signal — 3 sessions, 5
      // ratings, score ≥60. Below this, peer-rating reliability is too
      // low to credibly call teaching a strength (Topping 1996).
      teachingSessions: 3,
      teachingRatings: 5,
      teachingScore: 60,
      // D8 Design Aptitude gates — opt-in. Tier 2 requires scenario-
      // tested signal: 2 sessions + 5 scenarios + score ≥60. Below
      // scenario validation, the score is purely self-report (Schoenfeld
      // 1985 — design competency requires explicit interrogation).
      designSessions: 2,
      designScenarios: 5,
      designScore: 60,
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
      // D4 v2 tier3: Documented-or-Above (not Optimized) — symmetric with
      // D2's tier3 docs gate. Avoids unmarked asymmetry between the two
      // per-solution mastery dims at the same tier.
      optAtDocumentedOrAbove: 4,
      // D6 v2: ≥5 successful reviews — minimum to credibly say "retention
      // is functioning at all" (just past activation gate).
      retentionAttempts: 5,
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
      // D4 v2 junior: ≥3 documented coding solutions.
      optAtDocumentedOrAbove: 3,
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
        // Opt-in dimensions: when the user hasn't engaged with the dim at
        // all (count missing entirely), skip the gate. The user can still
        // be tier-ready without ever hosting a teaching session.
        if (OPT_IN_KEYS.has(key) && actual === undefined) continue;
        // Inverse-comparison keys: these are MAXIMUMS — `actual <= needed`.
        // Add new max-threshold keys here (rate-style metrics where a
        // smaller number is better). The set is intentionally explicit so
        // a typo in a tier requirement doesn't silently flip the direction.
        const fails = MAX_THRESHOLD_KEYS.has(key)
          ? !Number.isFinite(actual) || actual > needed
          : !Number.isFinite(actual) || actual < needed;
        if (fails) {
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
