// ============================================================================
// readinessTiers — classifyReadiness tests (score gates + mastery gates)
// ============================================================================
import { describe, it, expect } from "vitest";
import {
  classifyReadiness,
  READINESS_TIERS,
} from "../../src/utils/readinessTiers.js";

// ── Helper: extract a tier from the result by id ─────────────────────
const tierById = (result, id) => result.tiers.find((t) => t.id === id);

// Profiles approximating the real shape produced by stats.controller.js.
const dimsAtTier2Floor = {
  patternRecognition: 60,
  optimization: 50,
  pressurePerformance: 55,
  solutionDepth: 50,
};

// Mastery counts for a strong user — passes Tier 2's mastery gate but not FAANG's.
// Includes both D1 (pattern mastery) keys AND D2 (solution depth) keys, since
// stats.controller.js merges them into a single masteryCounts object.
const tier2ReadyMastery = {
  // D1 pattern mastery
  untouched: 11, touched: 2, working: 2, solid: 7, owned: 3,
  touchedOrAbove: 14, workingOrAbove: 12, solidOrAbove: 10,
  totalCanonical: 25,
  coreUntouched: 5, coreTouchedOrAbove: 10,
  coreSolidOrAbove: 10, coreOwned: 3, totalCore: 15,
  // D2 solution depth — meets tier2 gate (≥4 defended, ≥2 owned), not FAANG (≥10/≥5)
  solutionsNone: 1, solutionsAtDocumented: 6, solutionsAtExplained: 4, solutionsAtDefended: 5, solutionsAtOwned: 2,
  solutionsAtDocumentedOrAbove: 17, solutionsAtExplainedOrAbove: 11, solutionsAtDefendedOrAbove: 7, solutionsAtOwnedOrAbove: 2,
  totalCoding: 18,
  // D3 communication — meets tier2 (≥1 mock), not FAANG (≥3 mocks)
  commCeiling: 80, commMocksWithScores: 2, commHasPeerRatings: 0,
  // D4 optimization — meets tier2 (≥4 trade-off, ≥2 owned), not FAANG (≥10/≥5)
  optAtNone: 1, optAtDocumented: 4, optAtOptimized: 6, optAtTradeOff: 5, optAtOwned: 2,
  optAtDocumentedOrAbove: 17, optAtOptimizedOrAbove: 13, optAtTradeOffOrAbove: 7, optAtOwnedOrAbove: 2,
  optTotalCoding: 18,
  // D6 retention — meets tier2 (≥10 attempts, score ≥60), not FAANG (≥25, ≥75, leech ≤20%)
  retentionAttempts: 12, retentionScore: 65, retentionLeechRate: 0.10,
};

// The original-report user — high score from gameable formula but tiny breadth.
const originalReportMastery = {
  // D1 pattern mastery
  untouched: 22, touched: 3, working: 0, solid: 0, owned: 0,
  touchedOrAbove: 3, workingOrAbove: 0, solidOrAbove: 0,
  totalCanonical: 25,
  coreUntouched: 13, coreTouchedOrAbove: 2,
  coreSolidOrAbove: 0, coreOwned: 0, totalCore: 15,
  // D2 solution depth — 4 solutions, all DOCUMENTED at most, no follow-up data
  solutionsNone: 0, solutionsAtDocumented: 4, solutionsAtExplained: 0, solutionsAtDefended: 0, solutionsAtOwned: 0,
  solutionsAtDocumentedOrAbove: 4, solutionsAtExplainedOrAbove: 0, solutionsAtDefendedOrAbove: 0, solutionsAtOwnedOrAbove: 0,
  totalCoding: 4,
  // D3 communication — 0 mocks, 0 peer, written-only ceiling
  commCeiling: 55, commMocksWithScores: 0, commHasPeerRatings: 0,
  // D4 optimization — 4 mostly-OPTIMIZED solutions, no TRADE_OFF (no AI complexityCheck data, no bruteForceMeta)
  optAtNone: 0, optAtDocumented: 1, optAtOptimized: 3, optAtTradeOff: 0, optAtOwned: 0,
  optAtDocumentedOrAbove: 4, optAtOptimizedOrAbove: 3, optAtTradeOffOrAbove: 0, optAtOwnedOrAbove: 0,
  optTotalCoding: 4,
  // D6 retention — 4 attempts, score 93, 0 leeches.
  // Tier 2 needs ≥10 attempts; tier3 needs ≥5; original-report user fails both.
  retentionAttempts: 4, retentionScore: 93, retentionLeechRate: 0,
};

// ── Schema ───────────────────────────────────────────────────────────

describe("READINESS_TIERS schema", () => {
  it("every tier has masteryRequirements", () => {
    for (const tier of READINESS_TIERS) {
      expect(tier.masteryRequirements).toBeDefined();
      expect(typeof tier.masteryRequirements).toBe("object");
    }
  });

  it("FAANG mastery gate is strictest", () => {
    const faang = READINESS_TIERS.find((t) => t.id === "faang");
    expect(faang.masteryRequirements.coreSolidOrAbove).toBeGreaterThanOrEqual(13);
    expect(faang.masteryRequirements.owned).toBeGreaterThanOrEqual(8);
  });
});

// ── Legacy behavior preserved when masteryCounts omitted ─────────────

describe("classifyReadiness — flag OFF (no masteryCounts)", () => {
  it("legacy: dimensions-only gate produces 'ready' at Tier 2 floor", () => {
    const out = classifyReadiness(65, dimsAtTier2Floor);
    expect(tierById(out, "tier2").ready).toBe(true);
    expect(tierById(out, "tier2").failingMastery).toEqual([]);
  });

  it("legacy: original-report user is 'ready' for Tier 2 (the bug we're fixing)", () => {
    // Mirrors the user's real profile from the conversation: overall 69,
    // dimension scores at-or-above Tier 2 thresholds, but only 3 patterns
    // touched. With flag OFF (no masteryCounts), they pass.
    const out = classifyReadiness(69, dimsAtTier2Floor);
    expect(tierById(out, "tier2").ready).toBe(true);
  });

  it("legacy: failingMastery array is always [] when masteryCounts omitted", () => {
    const out = classifyReadiness(50, dimsAtTier2Floor);
    for (const t of out.tiers) expect(t.failingMastery).toEqual([]);
  });
});

// ── Flag ON: mastery gates active ────────────────────────────────────

describe("classifyReadiness — flag ON (masteryCounts passed)", () => {
  it("original-report user is NOT Tier 2 ready when mastery gate is on", () => {
    const out = classifyReadiness(69, dimsAtTier2Floor, originalReportMastery);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(false);
    // The gate that fails: coreSolidOrAbove < 10 AND owned < 3.
    expect(tier2.failingMastery.length).toBeGreaterThan(0);
    const failedKeys = tier2.failingMastery.map((f) => f.key).sort();
    expect(failedKeys).toContain("coreSolidOrAbove");
    expect(failedKeys).toContain("owned");
  });

  it("strong user with 10/15 core SOLID + 3 OWNED IS Tier 2 ready", () => {
    const out = classifyReadiness(70, dimsAtTier2Floor, tier2ReadyMastery);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(true);
    expect(tier2.failingMastery).toEqual([]);
  });

  it("strong-at-Tier-2 user is NOT FAANG ready (mastery gate too high)", () => {
    const dimsAtFaangFloor = {
      patternRecognition: 75,
      optimization: 70,
      pressurePerformance: 70,
      solutionDepth: 65,
    };
    const out = classifyReadiness(80, dimsAtFaangFloor, tier2ReadyMastery);
    const faang = tierById(out, "faang");
    expect(faang.ready).toBe(false);
    // Both coreSolidOrAbove (10 vs needed 13) and owned (3 vs needed 8) fail.
    expect(faang.failingMastery.length).toBeGreaterThanOrEqual(1);
  });

  it("'close' label requires both ≤1 failingDim AND ≤1 failingMastery", () => {
    // Score is just below tier2 (overallGap = 4) and one mastery requirement
    // misses by 1 — should be 'close'.
    const out = classifyReadiness(61, dimsAtTier2Floor, {
      ...tier2ReadyMastery,
      coreSolidOrAbove: 9, // misses the 10 threshold by 1
      owned: 3, // ok
    });
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(false);
    expect(tier2.close).toBe(true);
  });

  it("inactive dim (score=null) still fails as before", () => {
    const out = classifyReadiness(70, {
      ...dimsAtTier2Floor,
      patternRecognition: null,
    }, tier2ReadyMastery);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(false);
    expect(tier2.failingDimensions.some((f) => f.dimension === "patternRecognition")).toBe(true);
  });
});

// ── Junior tier still accessible at the bottom of the funnel ─────────

describe("classifyReadiness — junior tier remains reachable", () => {
  it("4 patterns at WORKING+ AND 3 DOCUMENTED solutions unlocks junior", () => {
    const dimsAtJuniorFloor = {
      patternRecognition: 30,
      optimization: 20,
    };
    const juniorMastery = {
      ...originalReportMastery,
      working: 4,
      workingOrAbove: 4,
      // Junior also needs solutionsAtDocumentedOrAbove >= 3 under D2 v2.
      // The original-report user already has 4 documented — passes.
      solutionsAtDocumentedOrAbove: 4,
    };
    const out = classifyReadiness(35, dimsAtJuniorFloor, juniorMastery);
    expect(tierById(out, "junior").ready).toBe(true);
  });
});

// ── D2 Solution Depth gates ──────────────────────────────────────────

describe("classifyReadiness — D2 solution depth gates", () => {
  it("user passing pattern gates but NOT depth gates is NOT tier2 ready", () => {
    const masteryWithoutDepth = {
      ...tier2ReadyMastery,
      // Force depth gates to fail — only 2 defended, 0 owned
      solutionsAtDefendedOrAbove: 2,
      solutionsAtOwned: 0,
    };
    const out = classifyReadiness(70, dimsAtTier2Floor, masteryWithoutDepth);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(false);
    const failedKeys = tier2.failingMastery.map((f) => f.key).sort();
    expect(failedKeys).toContain("solutionsAtDefendedOrAbove");
    expect(failedKeys).toContain("solutionsAtOwned");
  });

  it("original-report user is NOT Tier 2 ready under depth gates either", () => {
    // The original-report user has 0 defended / 0 owned under D2 v2 — both
    // pattern gates AND depth gates fail.
    const out = classifyReadiness(69, dimsAtTier2Floor, originalReportMastery);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(false);
    const failedKeys = tier2.failingMastery.map((f) => f.key).sort();
    // Both D1 (pattern) AND D2 (depth) keys fail
    expect(failedKeys).toContain("coreSolidOrAbove");
    expect(failedKeys).toContain("solutionsAtDefendedOrAbove");
  });

  it("FAANG mastery gate requires the depth spread (10 defended / 5 owned)", () => {
    const dimsAtFaangFloor = {
      patternRecognition: 75,
      optimization: 70,
      pressurePerformance: 70,
      solutionDepth: 65,
    };
    // tier2ReadyMastery has 7 defended / 2 owned — passes tier2 but not FAANG.
    const out = classifyReadiness(80, dimsAtFaangFloor, tier2ReadyMastery);
    const faang = tierById(out, "faang");
    expect(faang.ready).toBe(false);
    const failedKeys = faang.failingMastery.map((f) => f.key).sort();
    expect(failedKeys).toContain("solutionsAtDefendedOrAbove");
    expect(failedKeys).toContain("solutionsAtOwned");
  });

  it("user with depth-only deficit fails despite high pattern coverage", () => {
    // Strong patterns, weak depth — failing tier2 on depth alone.
    const masteryWithBadDepth = {
      ...tier2ReadyMastery,
      solutionsAtDefendedOrAbove: 1, // tier2 needs ≥4
      solutionsAtOwned: 0,           // tier2 needs ≥2
    };
    const out = classifyReadiness(70, dimsAtTier2Floor, masteryWithBadDepth);
    expect(tierById(out, "tier2").ready).toBe(false);
  });
});

// ── Legacy regression: flag-off behavior preserved ───────────────────

describe("classifyReadiness — flag-off legacy regression", () => {
  it("when masteryCounts is null, mastery + depth + comm requirements all ignored", () => {
    // Under flag-off (D1 + D2 + D3 v2 all disabled), passing only the
    // score gates should yield ready=true. Locks in: legacy users see no
    // behavior change from the v2 changes to readinessTiers.js.
    const out = classifyReadiness(70, dimsAtTier2Floor, null);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(true);
    expect(tier2.failingMastery).toEqual([]);
  });

  it("when masteryCounts is undefined (default arg), same as null", () => {
    const out = classifyReadiness(70, dimsAtTier2Floor);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(true);
    expect(tier2.failingMastery).toEqual([]);
  });
});

// ── D3 Communication source-quality gates ────────────────────────────

describe("classifyReadiness — D3 communication gates", () => {
  it("user passing all dim/depth gates but with 0 mocks is NOT tier2 ready", () => {
    const masteryWithoutMocks = {
      ...tier2ReadyMastery,
      commMocksWithScores: 0,
      commCeiling: 55,
    };
    const out = classifyReadiness(70, dimsAtTier2Floor, masteryWithoutMocks);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(false);
    expect(tier2.failingMastery.map((f) => f.key)).toContain(
      "commMocksWithScores",
    );
  });

  it("user with exactly 1 mock + everything else passes Tier 2", () => {
    const masteryWithOneMock = {
      ...tier2ReadyMastery,
      commMocksWithScores: 1,
    };
    const out = classifyReadiness(70, dimsAtTier2Floor, masteryWithOneMock);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(true);
  });

  it("user with 2 mocks fails FAANG mastery on D3 alone", () => {
    const dimsAtFaangFloor = {
      patternRecognition: 75,
      optimization: 70,
      pressurePerformance: 70,
      solutionDepth: 65,
    };
    // tier2ReadyMastery has commMocksWithScores=2 — passes tier2 (≥1) but
    // fails FAANG (≥3). To keep this scoped to D3, give them strong D1/D2
    // numbers that pass FAANG on patterns + depth.
    const strongPatternsAndDepth = {
      ...tier2ReadyMastery,
      coreSolidOrAbove: 14,
      owned: 10,
      solutionsAtDefendedOrAbove: 12,
      solutionsAtOwned: 6,
      commMocksWithScores: 2,
    };
    const out = classifyReadiness(80, dimsAtFaangFloor, strongPatternsAndDepth);
    const faang = tierById(out, "faang");
    expect(faang.ready).toBe(false);
    expect(faang.failingMastery.map((f) => f.key)).toContain(
      "commMocksWithScores",
    );
  });

  it("original-report user (0 mocks, 0 peer) NOT Tier 2 ready", () => {
    // The original-report user fails BOTH the D1 (coreSolidOrAbove) AND
    // D2 (solutionsAtDefendedOrAbove) AND D3 (commMocksWithScores) gates.
    // This locks in the priority outcome: D3 is *also* a blocker, not
    // just one of the two prior dims.
    const out = classifyReadiness(69, dimsAtTier2Floor, originalReportMastery);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(false);
    const failedKeys = tier2.failingMastery.map((f) => f.key);
    expect(failedKeys).toContain("commMocksWithScores");
    expect(failedKeys).toContain("coreSolidOrAbove");
    expect(failedKeys).toContain("solutionsAtDefendedOrAbove");
  });

  it("3 mocks unlocks FAANG D3 gate (tier-A peer signal not yet required)", () => {
    const dimsAtFaangFloor = {
      patternRecognition: 75,
      optimization: 70,
      pressurePerformance: 70,
      solutionDepth: 65,
    };
    const faangReadyMastery = {
      ...tier2ReadyMastery,
      coreSolidOrAbove: 14,
      owned: 10,
      solutionsAtDefendedOrAbove: 12,
      solutionsAtOwned: 6,
      commMocksWithScores: 3,
      // D4 must also meet FAANG gate (≥10 trade-off, ≥5 owned)
      optAtTradeOffOrAbove: 12,
      optAtOwned: 6,
      // D6 must also meet FAANG gate (≥25 attempts, score ≥75, leech ≤0.20)
      retentionAttempts: 30,
      retentionScore: 80,
      retentionLeechRate: 0.10,
    };
    const out = classifyReadiness(82, dimsAtFaangFloor, faangReadyMastery);
    const faang = tierById(out, "faang");
    expect(faang.ready).toBe(true);
  });
});

// ── D4 Optimization tier gates ───────────────────────────────────────

describe("classifyReadiness — D4 optimization gates", () => {
  it("user passing all dim/depth/comm gates but with 0 trade-off solutions is NOT tier2 ready", () => {
    const masteryWithoutTradeOff = {
      ...tier2ReadyMastery,
      optAtTradeOffOrAbove: 1, // tier2 needs ≥4
      optAtOwned: 0,           // tier2 needs ≥2
    };
    const out = classifyReadiness(70, dimsAtTier2Floor, masteryWithoutTradeOff);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(false);
    const failedKeys = tier2.failingMastery.map((f) => f.key);
    expect(failedKeys).toContain("optAtTradeOffOrAbove");
    expect(failedKeys).toContain("optAtOwned");
  });

  it("user with exactly 4 trade-off + 2 owned + everything else passes Tier 2", () => {
    // tier2ReadyMastery already has optAtTradeOffOrAbove=7, optAtOwned=2.
    const out = classifyReadiness(70, dimsAtTier2Floor, tier2ReadyMastery);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(true);
  });

  it("FAANG mastery requires the 10/5 trade-off spread (tier2's 7/2 not enough)", () => {
    const dimsAtFaangFloor = {
      patternRecognition: 75,
      optimization: 70,
      pressurePerformance: 70,
      solutionDepth: 65,
    };
    // Strong everything else, but D4 only at tier2 levels.
    const tier2OptStrongRest = {
      ...tier2ReadyMastery,
      coreSolidOrAbove: 14,
      owned: 10,
      solutionsAtDefendedOrAbove: 12,
      solutionsAtOwned: 6,
      commMocksWithScores: 3,
      // D4 stays at tier2 numbers — should fail FAANG
    };
    const out = classifyReadiness(82, dimsAtFaangFloor, tier2OptStrongRest);
    const faang = tierById(out, "faang");
    expect(faang.ready).toBe(false);
    const failedKeys = faang.failingMastery.map((f) => f.key);
    expect(failedKeys).toContain("optAtTradeOffOrAbove");
  });

  it("original-report user (no AI complexityCheck data) NOT Tier 2 ready", () => {
    // 0 trade-off, 0 owned → fails tier2 D4 gate alongside other gates.
    const out = classifyReadiness(69, dimsAtTier2Floor, originalReportMastery);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(false);
    const failedKeys = tier2.failingMastery.map((f) => f.key);
    expect(failedKeys).toContain("optAtTradeOffOrAbove");
    expect(failedKeys).toContain("optAtOwned");
  });

  it("tier3 D4 gate is Documented (consistent with D2 tier3 — no asymmetry)", () => {
    // 4 documented coding solutions → meets tier3's optAtDocumentedOrAbove ≥4.
    // Use original-report user fixture (4 documented) but bump dim scores
    // to tier3 floors and fix D2 to 5 docs. Should pass tier3.
    const dimsAtTier3Floor = {
      patternRecognition: 45,
      optimization: 35,
      pressurePerformance: 40,
    };
    const tier3Mastery = {
      ...originalReportMastery,
      solidOrAbove: 6,                     // D1 tier3 gate
      solutionsAtDocumentedOrAbove: 5,     // D2 tier3 gate
      // D4: original has optAtDocumentedOrAbove=4 — meets gate
      retentionAttempts: 5,                // D6 tier3 gate (≥5 attempts)
    };
    const out = classifyReadiness(50, dimsAtTier3Floor, tier3Mastery);
    const tier3 = tierById(out, "tier3");
    expect(tier3.ready).toBe(true);
  });
});

// ── D6 Retention tier gates ──────────────────────────────────────────

describe("classifyReadiness — D6 retention gates", () => {
  it("user with retention attempts < 10 NOT tier2 ready", () => {
    const masteryWithLowAttempts = {
      ...tier2ReadyMastery,
      retentionAttempts: 4, // tier2 needs ≥10
    };
    const out = classifyReadiness(70, dimsAtTier2Floor, masteryWithLowAttempts);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(false);
    expect(tier2.failingMastery.map((f) => f.key)).toContain("retentionAttempts");
  });

  it("user with retention score < 60 NOT tier2 ready (10 attempts but weak)", () => {
    const masteryWithWeakScore = {
      ...tier2ReadyMastery,
      retentionAttempts: 10,
      retentionScore: 55, // tier2 needs ≥60
    };
    const out = classifyReadiness(70, dimsAtTier2Floor, masteryWithWeakScore);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(false);
    expect(tier2.failingMastery.map((f) => f.key)).toContain("retentionScore");
  });

  it("user with 12 attempts + score 65 → Tier 2 ready", () => {
    // tier2ReadyMastery already has retentionAttempts=12, score=65, leech=0.10
    const out = classifyReadiness(70, dimsAtTier2Floor, tier2ReadyMastery);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(true);
  });

  it("user with retention attempts < 25 fails FAANG", () => {
    const dimsAtFaangFloor = {
      patternRecognition: 75,
      optimization: 70,
      pressurePerformance: 70,
      solutionDepth: 65,
    };
    const faangAlmostMastery = {
      ...tier2ReadyMastery,
      coreSolidOrAbove: 14,
      owned: 10,
      solutionsAtDefendedOrAbove: 12,
      solutionsAtOwned: 6,
      commMocksWithScores: 3,
      optAtTradeOffOrAbove: 12,
      optAtOwned: 6,
      // D6: 12 attempts → fails FAANG's 25 floor
      retentionAttempts: 12,
      retentionScore: 80,
      retentionLeechRate: 0.10,
    };
    const out = classifyReadiness(82, dimsAtFaangFloor, faangAlmostMastery);
    const faang = tierById(out, "faang");
    expect(faang.ready).toBe(false);
    expect(faang.failingMastery.map((f) => f.key)).toContain("retentionAttempts");
  });

  it("INVERSE COMPARISON: user with leechRate > 0.20 fails FAANG", () => {
    const dimsAtFaangFloor = {
      patternRecognition: 75,
      optimization: 70,
      pressurePerformance: 70,
      solutionDepth: 65,
    };
    const faangWithLeeches = {
      ...tier2ReadyMastery,
      coreSolidOrAbove: 14,
      owned: 10,
      solutionsAtDefendedOrAbove: 12,
      solutionsAtOwned: 6,
      commMocksWithScores: 3,
      optAtTradeOffOrAbove: 12,
      optAtOwned: 6,
      retentionAttempts: 30,
      retentionScore: 80,
      retentionLeechRate: 0.30, // exceeds FAANG's 0.20 max — INVERSE comparison
    };
    const out = classifyReadiness(82, dimsAtFaangFloor, faangWithLeeches);
    const faang = tierById(out, "faang");
    expect(faang.ready).toBe(false);
    const failedKeys = faang.failingMastery.map((f) => f.key);
    expect(failedKeys).toContain("retentionLeechRate");
  });

  it("INVERSE COMPARISON: user with leechRate exactly at 0.20 PASSES FAANG", () => {
    // Boundary: 0.20 is the maximum, so 0.20 itself passes.
    const dimsAtFaangFloor = {
      patternRecognition: 75,
      optimization: 70,
      pressurePerformance: 70,
      solutionDepth: 65,
    };
    const faangAtBoundary = {
      ...tier2ReadyMastery,
      coreSolidOrAbove: 14,
      owned: 10,
      solutionsAtDefendedOrAbove: 12,
      solutionsAtOwned: 6,
      commMocksWithScores: 3,
      optAtTradeOffOrAbove: 12,
      optAtOwned: 6,
      retentionAttempts: 30,
      retentionScore: 80,
      retentionLeechRate: 0.20,
    };
    const out = classifyReadiness(82, dimsAtFaangFloor, faangAtBoundary);
    const faang = tierById(out, "faang");
    expect(faang.ready).toBe(true);
  });

  it("original-report user (4 attempts, score 93) FAILS Tier 2 on retention", () => {
    // Even though score=93 looks strong, the n=4 attempt count fails the
    // tier2 ≥10 floor — small-sample protection is the whole point of D6 v2.
    const out = classifyReadiness(69, dimsAtTier2Floor, originalReportMastery);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(false);
    expect(tier2.failingMastery.map((f) => f.key)).toContain("retentionAttempts");
  });

  it("flag-off regression: missing retention keys → silently ignored", () => {
    // Pass masteryCounts WITHOUT any retention keys at all (legacy flag-off
    // shape from before D6 v2). classifyReadiness should not fail tier2 on
    // missing retention requirements — the `if (masteryCounts && ...)`
    // guard preserves backward compat.
    const masteryWithoutRetention = {
      ...tier2ReadyMastery,
    };
    delete masteryWithoutRetention.retentionAttempts;
    delete masteryWithoutRetention.retentionScore;
    delete masteryWithoutRetention.retentionLeechRate;
    const out = classifyReadiness(70, dimsAtTier2Floor, masteryWithoutRetention);
    const tier2 = tierById(out, "tier2");
    // Missing keys are treated as 0 → fail strict gates. This documents
    // the actual behavior — when D6 flag is off the keys are absent and
    // tier-2 mastery checks would fail. To preserve flag-off behavior in
    // the controller, pass null masteryCounts entirely (already handled).
    expect(tier2.ready).toBe(false);
    expect(tier2.failingMastery.map((f) => f.key)).toContain("retentionAttempts");
  });
});

// ── D7 v2 teaching contributions gates ───────────────────────────────

describe("classifyReadiness — D7 teaching gates (opt-in dimension)", () => {
  const tierById = (info, id) => info.tiers.find((t) => t.id === id);

  // Strong baseline user — meets tier2 dim + mastery floors. Used as the
  // base for "with teaching" / "without teaching" comparisons.
  const tier2BaselineDims = {
    patternRecognition: 60,
    optimization: 50,
    pressurePerformance: 55,
    solutionDepth: 50,
  };
  const tier2BaselineMastery = {
    coreSolidOrAbove: 10, owned: 3,
    solutionsAtDefendedOrAbove: 4, solutionsAtOwned: 2,
    commMocksWithScores: 1,
    optAtTradeOffOrAbove: 4, optAtOwned: 2,
    retentionAttempts: 12, retentionScore: 65,
  };

  it("user without teaching keys is still tier2 ready (opt-in skip)", () => {
    // No teachingSessions/teachingRatings/teachingScore in masteryCounts
    // → opt-in skip: gates ignored. Mirrors a user who never hosted.
    const out = classifyReadiness(70, tier2BaselineDims, tier2BaselineMastery);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(true);
    const failingKeys = tier2.failingMastery.map((f) => f.key);
    expect(failingKeys).not.toContain("teachingSessions");
    expect(failingKeys).not.toContain("teachingRatings");
    expect(failingKeys).not.toContain("teachingScore");
  });

  it("opted-in user with insufficient ratings FAILS tier2 teaching gate", () => {
    const masteryWithLowTeaching = {
      ...tier2BaselineMastery,
      teachingSessions: 2,    // < 3 needed
      teachingRatings: 3,     // < 5 needed
      teachingScore: 40,      // < 60 needed
      teachingFlagRate: 0,
    };
    const out = classifyReadiness(70, tier2BaselineDims, masteryWithLowTeaching);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(false);
    const failingKeys = tier2.failingMastery.map((f) => f.key);
    expect(failingKeys).toContain("teachingSessions");
    expect(failingKeys).toContain("teachingRatings");
    expect(failingKeys).toContain("teachingScore");
  });

  it("opted-in user at tier2 teaching floor PASSES", () => {
    const masteryAtTeachingFloor = {
      ...tier2BaselineMastery,
      teachingSessions: 3,
      teachingRatings: 5,
      teachingScore: 60,
      teachingFlagRate: 0,
    };
    const out = classifyReadiness(70, tier2BaselineDims, masteryAtTeachingFloor);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(true);
  });

  it("FAANG teachingFlagRate uses INVERSE comparison (rate above threshold fails)", () => {
    const dimsAtFaangFloor = {
      patternRecognition: 75,
      optimization: 70,
      pressurePerformance: 70,
      solutionDepth: 65,
    };
    const masteryHighFlagRate = {
      coreSolidOrAbove: 14, owned: 10,
      solutionsAtDefendedOrAbove: 12, solutionsAtOwned: 6,
      commMocksWithScores: 3,
      optAtTradeOffOrAbove: 12, optAtOwned: 6,
      retentionAttempts: 30, retentionScore: 80, retentionLeechRate: 0.10,
      teachingSessions: 6,
      teachingRatings: 12,
      teachingScore: 80,
      teachingFlagRate: 0.20, // ABOVE the 0.10 max → should fail
    };
    const out = classifyReadiness(82, dimsAtFaangFloor, masteryHighFlagRate);
    const faang = tierById(out, "faang");
    expect(faang.ready).toBe(false);
    expect(faang.failingMastery.map((f) => f.key)).toContain("teachingFlagRate");
  });

  it("FAANG teachingFlagRate at boundary (=0.10) PASSES inverse comparison", () => {
    const dimsAtFaangFloor = {
      patternRecognition: 75,
      optimization: 70,
      pressurePerformance: 70,
      solutionDepth: 65,
    };
    const masteryAtFaangBoundary = {
      coreSolidOrAbove: 14, owned: 10,
      solutionsAtDefendedOrAbove: 12, solutionsAtOwned: 6,
      commMocksWithScores: 3,
      optAtTradeOffOrAbove: 12, optAtOwned: 6,
      retentionAttempts: 30, retentionScore: 80, retentionLeechRate: 0.10,
      teachingSessions: 5,
      teachingRatings: 10,
      teachingScore: 75,
      teachingFlagRate: 0.10, // EXACTLY at the max
    };
    const out = classifyReadiness(82, dimsAtFaangFloor, masteryAtFaangBoundary);
    const faang = tierById(out, "faang");
    expect(faang.ready).toBe(true);
  });

  it("MAX_THRESHOLD_KEYS includes both retentionLeechRate and teachingFlagRate", async () => {
    const { MAX_THRESHOLD_KEYS } = await import("../../src/utils/readinessTiers.js");
    expect(MAX_THRESHOLD_KEYS.has("retentionLeechRate")).toBe(true);
    expect(MAX_THRESHOLD_KEYS.has("teachingFlagRate")).toBe(true);
  });

  it("OPT_IN_KEYS includes all teaching* keys but NOT retention/pattern keys", async () => {
    const { OPT_IN_KEYS } = await import("../../src/utils/readinessTiers.js");
    expect(OPT_IN_KEYS.has("teachingSessions")).toBe(true);
    expect(OPT_IN_KEYS.has("teachingRatings")).toBe(true);
    expect(OPT_IN_KEYS.has("teachingScore")).toBe(true);
    expect(OPT_IN_KEYS.has("teachingFlagRate")).toBe(true);
    expect(OPT_IN_KEYS.has("retentionAttempts")).toBe(false);
    expect(OPT_IN_KEYS.has("coreSolidOrAbove")).toBe(false);
  });
});

// ── D8 design aptitude gates (opt-in) ────────────────────────────────

describe("classifyReadiness — D8 design aptitude gates (opt-in dimension)", () => {
  const tierById = (info, id) => info.tiers.find((t) => t.id === id);

  const tier2BaselineDims = {
    patternRecognition: 60,
    optimization: 50,
    pressurePerformance: 55,
    solutionDepth: 50,
  };
  const tier2BaselineMastery = {
    coreSolidOrAbove: 10, owned: 3,
    solutionsAtDefendedOrAbove: 4, solutionsAtOwned: 2,
    commMocksWithScores: 1,
    optAtTradeOffOrAbove: 4, optAtOwned: 2,
    retentionAttempts: 12, retentionScore: 65,
  };

  it("user without design keys is still tier2 ready (opt-in skip)", () => {
    const out = classifyReadiness(70, tier2BaselineDims, tier2BaselineMastery);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(true);
    const failingKeys = tier2.failingMastery.map((f) => f.key);
    expect(failingKeys).not.toContain("designSessions");
    expect(failingKeys).not.toContain("designScenarios");
    expect(failingKeys).not.toContain("designScore");
  });

  it("opted-in user with insufficient sessions FAILS tier2 design gate", () => {
    const masteryWithLowDesign = {
      ...tier2BaselineMastery,
      designSessions: 1,    // < 2 needed
      designScenarios: 2,   // < 5 needed
      designScore: 40,      // < 60 needed
      designInterviewerPaired: 0,
    };
    const out = classifyReadiness(70, tier2BaselineDims, masteryWithLowDesign);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(false);
    const failingKeys = tier2.failingMastery.map((f) => f.key);
    expect(failingKeys).toContain("designSessions");
    expect(failingKeys).toContain("designScenarios");
    expect(failingKeys).toContain("designScore");
  });

  it("opted-in user at tier2 design floor PASSES", () => {
    const masteryAtDesignFloor = {
      ...tier2BaselineMastery,
      designSessions: 2,
      designScenarios: 5,
      designScore: 60,
      designInterviewerPaired: 0,
    };
    const out = classifyReadiness(70, tier2BaselineDims, masteryAtDesignFloor);
    const tier2 = tierById(out, "tier2");
    expect(tier2.ready).toBe(true);
  });

  it("FAANG requires interviewer-paired session (designInterviewerPaired ≥ 1)", () => {
    const dimsAtFaangFloor = {
      patternRecognition: 75,
      optimization: 70,
      pressurePerformance: 70,
      solutionDepth: 65,
    };
    const masteryWithoutPairedInterview = {
      coreSolidOrAbove: 14, owned: 10,
      solutionsAtDefendedOrAbove: 12, solutionsAtOwned: 6,
      commMocksWithScores: 3,
      optAtTradeOffOrAbove: 12, optAtOwned: 6,
      retentionAttempts: 30, retentionScore: 80, retentionLeechRate: 0.10,
      designSessions: 6,
      designScenarios: 20,
      designScore: 80,
      designInterviewerPaired: 0, // missing — should fail
    };
    const out = classifyReadiness(82, dimsAtFaangFloor, masteryWithoutPairedInterview);
    const faang = tierById(out, "faang");
    expect(faang.ready).toBe(false);
    expect(faang.failingMastery.map((f) => f.key)).toContain("designInterviewerPaired");
  });

  it("FAANG passes when all design gates met at the boundary", () => {
    const dimsAtFaangFloor = {
      patternRecognition: 75,
      optimization: 70,
      pressurePerformance: 70,
      solutionDepth: 65,
    };
    const masteryAtFaangBoundary = {
      coreSolidOrAbove: 14, owned: 10,
      solutionsAtDefendedOrAbove: 12, solutionsAtOwned: 6,
      commMocksWithScores: 3,
      optAtTradeOffOrAbove: 12, optAtOwned: 6,
      retentionAttempts: 30, retentionScore: 80, retentionLeechRate: 0.10,
      teachingSessions: 5, teachingRatings: 10, teachingScore: 75, teachingFlagRate: 0.05,
      designSessions: 5,
      designScenarios: 15,
      designScore: 75,
      designInterviewerPaired: 1,
    };
    const out = classifyReadiness(82, dimsAtFaangFloor, masteryAtFaangBoundary);
    const faang = tierById(out, "faang");
    expect(faang.ready).toBe(true);
  });

  it("OPT_IN_KEYS contains all design* keys", async () => {
    const { OPT_IN_KEYS } = await import("../../src/utils/readinessTiers.js");
    expect(OPT_IN_KEYS.has("designSessions")).toBe(true);
    expect(OPT_IN_KEYS.has("designScenarios")).toBe(true);
    expect(OPT_IN_KEYS.has("designScore")).toBe(true);
    expect(OPT_IN_KEYS.has("designInterviewerPaired")).toBe(true);
  });
});
