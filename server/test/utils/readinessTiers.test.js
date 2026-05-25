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
const tier2ReadyMastery = {
  untouched: 11, touched: 2, working: 2, solid: 7, owned: 3,
  touchedOrAbove: 14, workingOrAbove: 12, solidOrAbove: 10,
  totalCanonical: 25,
  coreUntouched: 5, coreTouchedOrAbove: 10,
  coreSolidOrAbove: 10, coreOwned: 3, totalCore: 15,
};

// The original-report user — high score from gameable formula but tiny breadth.
const originalReportMastery = {
  untouched: 22, touched: 3, working: 0, solid: 0, owned: 0,
  touchedOrAbove: 3, workingOrAbove: 0, solidOrAbove: 0,
  totalCanonical: 25,
  coreUntouched: 13, coreTouchedOrAbove: 2,
  coreSolidOrAbove: 0, coreOwned: 0, totalCore: 15,
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
  it("4 patterns at WORKING+ unlocks junior even with low overall scores", () => {
    const dimsAtJuniorFloor = {
      patternRecognition: 30,
      optimization: 20,
    };
    const juniorMastery = {
      ...originalReportMastery,
      working: 4,
      workingOrAbove: 4,
    };
    const out = classifyReadiness(35, dimsAtJuniorFloor, juniorMastery);
    expect(tierById(out, "junior").ready).toBe(true);
  });
});
