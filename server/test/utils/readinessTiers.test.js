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
  it("when masteryCounts is null, mastery + depth requirements both ignored", () => {
    // Under flag-off (both D1 and D2 v2 disabled), passing only the score
    // gates should yield ready=true. Locks in: legacy users see no behavior
    // change from the v2 changes to readinessTiers.js.
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
