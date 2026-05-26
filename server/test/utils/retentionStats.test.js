// ============================================================================
// retentionStats — unit tests
// ============================================================================
import { describe, it, expect } from "vitest";
import {
  computeRetentionStats,
  MIN_ATTEMPTS,
  MIN_DISTINCT_SOLUTIONS,
  LEECH_THRESHOLD,
  HIGH_CONFIDENCE_MIN_N,
} from "../../src/utils/retentionStats.js";

// ── Fixture helpers ──────────────────────────────────────────────────

const DAY = 1000 * 60 * 60 * 24;
const recentDate = (daysAgo) => new Date(Date.now() - daysAgo * DAY);

const attempt = ({
  solutionId,
  daysAgo = 1,
  reps = 2,
  ef = 2.5,
  lapseCount = 0,
} = {}) => ({
  solutionId,
  createdAt: recentDate(daysAgo),
  solution: {
    sm2EasinessFactor: ef,
    sm2Repetitions: reps,
    lapseCount,
  },
});

// ── Activation ────────────────────────────────────────────────────────

describe("computeRetentionStats — activation", () => {
  it("empty input → inactive", () => {
    const out = computeRetentionStats({ successfulReviewAttempts: [] });
    expect(out.active).toBe(false);
    expect(out.score).toBe(null);
    expect(out.attemptCount).toBe(0);
    expect(out.inactiveMessage).toMatch(/Review .* to unlock/);
  });

  it("2 attempts (below MIN_ATTEMPTS=3) → inactive", () => {
    const out = computeRetentionStats({
      successfulReviewAttempts: [
        attempt({ solutionId: "s1" }),
        attempt({ solutionId: "s2" }),
      ],
    });
    expect(out.active).toBe(false);
    expect(out.attemptCount).toBe(2);
  });

  it("3 attempts across 1 solution (below MIN_DISTINCT_SOLUTIONS) → inactive after dedupe", () => {
    // Three attempts on the same solution → dedupes to 1.
    const out = computeRetentionStats({
      successfulReviewAttempts: [
        attempt({ solutionId: "s1", daysAgo: 5 }),
        attempt({ solutionId: "s1", daysAgo: 3 }),
        attempt({ solutionId: "s1", daysAgo: 1 }),
      ],
    });
    expect(out.active).toBe(false);
    expect(out.distinctSolutionCount).toBe(1);
    expect(out.attemptCount).toBe(1); // post-dedupe
  });

  it("3 attempts across 2 solutions activates dim", () => {
    const out = computeRetentionStats({
      successfulReviewAttempts: [
        attempt({ solutionId: "s1" }),
        attempt({ solutionId: "s2" }),
        attempt({ solutionId: "s3" }),
      ],
    });
    expect(out.active).toBe(true);
    expect(out.score).toBeGreaterThan(0);
    expect(out.distinctSolutionCount).toBe(3);
  });
});

// ── Dedupe to most-recent ─────────────────────────────────────────────

describe("computeRetentionStats — dedupe", () => {
  it("keeps most-recent attempt per solution", () => {
    const out = computeRetentionStats({
      successfulReviewAttempts: [
        attempt({ solutionId: "s1", daysAgo: 30 }), // older
        attempt({ solutionId: "s1", daysAgo: 1 }),  // newer — should win
        attempt({ solutionId: "s2", daysAgo: 5 }),
        attempt({ solutionId: "s3", daysAgo: 10 }),
      ],
    });
    expect(out.attemptCount).toBe(3);
    expect(out.distinctSolutionCount).toBe(3);
    // The newer attempt's daysSince=1 has high retrievability — overall
    // score should be reasonably high (pushes mean up vs the daysAgo=30
    // version of s1).
    expect(out.score).toBeGreaterThan(50);
  });
});

// ── Score formula preservation ───────────────────────────────────────

describe("computeRetentionStats — score formula preservation", () => {
  it("score is in [0, 100] range and CI brackets it", () => {
    const out = computeRetentionStats({
      successfulReviewAttempts: [
        attempt({ solutionId: "s1", daysAgo: 1, reps: 3, ef: 2.5 }),
        attempt({ solutionId: "s2", daysAgo: 1, reps: 3, ef: 2.5 }),
        attempt({ solutionId: "s3", daysAgo: 1, reps: 3, ef: 2.5 }),
      ],
    });
    expect(out.score).toBeGreaterThanOrEqual(0);
    expect(out.score).toBeLessThanOrEqual(100);
    expect(out.ci[0]).toBeLessThanOrEqual(out.score);
    expect(out.ci[1]).toBeGreaterThanOrEqual(out.score);
  });

  it("recent reviews of strong cards (high reps + EF) have high retention", () => {
    const out = computeRetentionStats({
      successfulReviewAttempts: [
        attempt({ solutionId: "s1", daysAgo: 1, reps: 5, ef: 2.6 }),
        attempt({ solutionId: "s2", daysAgo: 1, reps: 5, ef: 2.6 }),
        attempt({ solutionId: "s3", daysAgo: 1, reps: 5, ef: 2.6 }),
      ],
    });
    expect(out.score).toBeGreaterThan(80);
  });

  it("old reviews of weak cards (low reps) have low retention", () => {
    const out = computeRetentionStats({
      successfulReviewAttempts: [
        attempt({ solutionId: "s1", daysAgo: 60, reps: 1, ef: 1.4 }),
        attempt({ solutionId: "s2", daysAgo: 60, reps: 1, ef: 1.4 }),
        attempt({ solutionId: "s3", daysAgo: 60, reps: 1, ef: 1.4 }),
      ],
    });
    // Spirit of the test: noticeably below the strong-card high-retention
    // case (>80). The exact value depends on the FSRS retrievability
    // formula's specific FACTOR/DECAY constants.
    expect(out.score).toBeLessThan(60);
  });
});

// ── Leech detection ──────────────────────────────────────────────────

describe("computeRetentionStats — leech detection", () => {
  it("solutions with lapseCount ≥ 8 increment leechCount", () => {
    const out = computeRetentionStats({
      successfulReviewAttempts: [
        attempt({ solutionId: "s1", lapseCount: 9 }),  // leech
        attempt({ solutionId: "s2", lapseCount: 12 }), // leech
        attempt({ solutionId: "s3", lapseCount: 0 }),  // not
        attempt({ solutionId: "s4", lapseCount: 7 }),  // not (below threshold)
      ],
    });
    expect(out.leechCount).toBe(2);
    expect(out.leechRate).toBe(0.5); // 2 / 4
  });

  it("lapseCount exactly 8 IS a leech (boundary)", () => {
    const out = computeRetentionStats({
      successfulReviewAttempts: [
        attempt({ solutionId: "s1", lapseCount: 8 }),
        attempt({ solutionId: "s2", lapseCount: 0 }),
        attempt({ solutionId: "s3", lapseCount: 0 }),
      ],
    });
    expect(out.leechCount).toBe(1);
  });

  it("lapseCount = 7 is NOT a leech (just below threshold)", () => {
    const out = computeRetentionStats({
      successfulReviewAttempts: [
        attempt({ solutionId: "s1", lapseCount: 7 }),
        attempt({ solutionId: "s2", lapseCount: 0 }),
        attempt({ solutionId: "s3", lapseCount: 0 }),
      ],
    });
    expect(out.leechCount).toBe(0);
  });

  it("missing/null lapseCount is treated as 0", () => {
    const out = computeRetentionStats({
      successfulReviewAttempts: [
        { solutionId: "s1", createdAt: recentDate(1), solution: {} },
        attempt({ solutionId: "s2" }),
        attempt({ solutionId: "s3" }),
      ],
    });
    expect(out.leechCount).toBe(0);
  });

  it("leechRate computation: 2 leeches over 8 solutions = 0.25", () => {
    const attempts = [];
    for (let i = 0; i < 8; i++) {
      attempts.push(
        attempt({
          solutionId: `s${i}`,
          lapseCount: i < 2 ? 9 : 0,
        }),
      );
    }
    const out = computeRetentionStats({ successfulReviewAttempts: attempts });
    expect(out.leechCount).toBe(2);
    expect(out.leechRate).toBe(0.25);
  });

  it("leech indicators surface in basis when leechCount > 0", () => {
    const out = computeRetentionStats({
      successfulReviewAttempts: [
        attempt({ solutionId: "s1", lapseCount: 9 }),
        attempt({ solutionId: "s2" }),
        attempt({ solutionId: "s3" }),
      ],
    });
    expect(out.basis).toContain("leeches: 1");
    const hasLeechRate = out.basis.some((line) => line.startsWith("leech_rate:"));
    expect(hasLeechRate).toBe(true);
  });
});

// ── Original-report user fixture ─────────────────────────────────────

describe("computeRetentionStats — original-report user fixture", () => {
  // 4 successful reviews, retention=93. Score preserved; the tier-2
  // mastery gate (≥10 attempts) is what catches the small-sample
  // overclaim — enforced in readinessTiers.test.js, not here.
  it("4 attempts → active, attemptCount=4 (below tier2 floor of 10)", () => {
    const out = computeRetentionStats({
      successfulReviewAttempts: [
        attempt({ solutionId: "s1", daysAgo: 1, reps: 2, ef: 2.5 }),
        attempt({ solutionId: "s2", daysAgo: 1, reps: 2, ef: 2.5 }),
        attempt({ solutionId: "s3", daysAgo: 1, reps: 2, ef: 2.5 }),
        attempt({ solutionId: "s4", daysAgo: 1, reps: 2, ef: 2.5 }),
      ],
    });
    expect(out.active).toBe(true);
    expect(out.attemptCount).toBe(4);
    expect(out.attemptCount).toBeLessThan(10); // tier2 mastery gate fails
    expect(out.leechCount).toBe(0); // no leeches in this fixture
  });
});

// ── Constants ────────────────────────────────────────────────────────

describe("computeRetentionStats — exposed constants", () => {
  it("constants are sane", () => {
    expect(MIN_ATTEMPTS).toBe(3);
    expect(MIN_DISTINCT_SOLUTIONS).toBe(2);
    expect(LEECH_THRESHOLD).toBe(8); // Anki convention from schema.prisma:817
    expect(HIGH_CONFIDENCE_MIN_N).toBe(10);
    expect(HIGH_CONFIDENCE_MIN_N).toBeGreaterThan(MIN_ATTEMPTS);
  });
});
