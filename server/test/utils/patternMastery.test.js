// ============================================================================
// patternMastery — unit tests
// ============================================================================
import { describe, it, expect } from "vitest";
import {
  computePatternMastery,
  masteryScore,
  MASTERY_STATES,
  SOLVE_METHOD_REQUIRED_AFTER,
} from "../../src/utils/patternMastery.js";
import {
  CANONICAL_PATTERN_LABELS,
  FAANG_CORE_PATTERNS,
} from "../../src/utils/patternTaxonomy.js";

// ── Test fixture builders ────────────────────────────────────────────
// Tiny helpers that build Solution-shaped objects so the assertions below
// stay focused on transitions rather than wiring.

function sol({
  id,
  pattern,
  difficulty = "MEDIUM",
  solveMethod = "COLD",
  patternAccuracy = null,
  wrongPattern = false,
  correctPattern = null,
  sm2Repetitions = 0,
  category = "CODING",
  createdAt = new Date("2026-06-01T00:00:00Z"), // post-deploy default
} = {}) {
  return {
    id,
    patterns: pattern ? [pattern] : [],
    solveMethod,
    sm2Repetitions,
    createdAt,
    aiFeedback:
      patternAccuracy != null || wrongPattern
        ? [
            {
              dimensionScores: { patternAccuracy },
              flags: { wrongPattern, correctPattern },
            },
          ]
        : null,
    problem: { category, difficulty },
  };
}

const reviewAttempt = (solutionId) => ({ solutionId });

// ── State transitions ────────────────────────────────────────────────

describe("computePatternMastery — state machine", () => {
  it("zero solutions → all UNTOUCHED, breadth=0, depth=0", () => {
    const out = computePatternMastery({ solutions: [], reviewAttempts: [] });
    expect(out.matrix).toHaveLength(CANONICAL_PATTERN_LABELS.length);
    expect(out.matrix.every((m) => m.state === "UNTOUCHED")).toBe(true);
    expect(out.counts.untouched).toBe(CANONICAL_PATTERN_LABELS.length);
    expect(out.counts.touchedOrAbove).toBe(0);
    expect(out.breadth).toBe(0);
    expect(out.depth).toBe(0);
  });

  it("1 solve → state=TOUCHED for that pattern", () => {
    const solutions = [sol({ id: "s1", pattern: "Two Pointers" })];
    const out = computePatternMastery({ solutions, reviewAttempts: [] });
    const tp = out.matrix.find((m) => m.pattern === "Two Pointers");
    expect(tp.state).toBe("TOUCHED");
    expect(tp.solves).toBe(1);
    expect(out.counts.touched).toBe(1);
    expect(out.counts.touchedOrAbove).toBe(1);
  });

  it("2 COLD solves with patternAccuracy ≥ 7 → WORKING", () => {
    const solutions = [
      sol({ id: "s1", pattern: "Stack", patternAccuracy: 8 }),
      sol({ id: "s2", pattern: "Stack", patternAccuracy: 7 }),
    ];
    const out = computePatternMastery({ solutions, reviewAttempts: [] });
    const stack = out.matrix.find((m) => m.pattern === "Stack");
    expect(stack.state).toBe("WORKING");
    expect(stack.coldSolves).toBe(2);
  });

  it("2 SAW_APPROACH solves do NOT promote past TOUCHED", () => {
    const solutions = [
      sol({ id: "s1", pattern: "Stack", solveMethod: "SAW_APPROACH", patternAccuracy: 9 }),
      sol({ id: "s2", pattern: "Stack", solveMethod: "SAW_APPROACH", patternAccuracy: 9 }),
    ];
    const out = computePatternMastery({ solutions, reviewAttempts: [] });
    const stack = out.matrix.find((m) => m.pattern === "Stack");
    expect(stack.state).toBe("TOUCHED");
    expect(stack.coldSolves).toBe(0);
  });

  it("2 COLD solves with low patternAccuracy (avg < 7) stay TOUCHED", () => {
    const solutions = [
      sol({ id: "s1", pattern: "Trees", patternAccuracy: 5 }),
      sol({ id: "s2", pattern: "Trees", patternAccuracy: 6 }),
    ];
    const out = computePatternMastery({ solutions, reviewAttempts: [] });
    const trees = out.matrix.find((m) => m.pattern === "Trees");
    expect(trees.state).toBe("TOUCHED");
  });

  it("wrongPattern flag (with different correctPattern) blocks WORKING", () => {
    const solutions = [
      sol({ id: "s1", pattern: "Trees", patternAccuracy: 9 }),
      sol({
        id: "s2",
        pattern: "Trees",
        patternAccuracy: 9,
        wrongPattern: true,
        correctPattern: "Graphs", // AI says it was actually Graphs
      }),
    ];
    const out = computePatternMastery({ solutions, reviewAttempts: [] });
    const trees = out.matrix.find((m) => m.pattern === "Trees");
    expect(trees.hasWrongFlag).toBe(true);
    expect(trees.state).toBe("TOUCHED");
  });

  it("WORKING + ≥2 difficulty levels → SOLID", () => {
    const solutions = [
      sol({ id: "s1", pattern: "Heap / Priority Queue", difficulty: "EASY",   patternAccuracy: 8 }),
      sol({ id: "s2", pattern: "Heap / Priority Queue", difficulty: "MEDIUM", patternAccuracy: 8 }),
    ];
    const out = computePatternMastery({ solutions, reviewAttempts: [] });
    const heap = out.matrix.find((m) => m.pattern === "Heap / Priority Queue");
    expect(heap.state).toBe("SOLID");
    expect(heap.difficulties.sort()).toEqual(["EASY", "MEDIUM"]);
  });

  it("WORKING but only 1 difficulty level → stays WORKING", () => {
    const solutions = [
      sol({ id: "s1", pattern: "Greedy", difficulty: "MEDIUM", patternAccuracy: 8 }),
      sol({ id: "s2", pattern: "Greedy", difficulty: "MEDIUM", patternAccuracy: 8 }),
    ];
    const out = computePatternMastery({ solutions, reviewAttempts: [] });
    const greedy = out.matrix.find((m) => m.pattern === "Greedy");
    expect(greedy.state).toBe("WORKING");
  });

  it("SOLID + retained (review attempt + sm2Reps≥2) → OWNED", () => {
    const solutions = [
      sol({
        id: "s1",
        pattern: "Binary Search",
        difficulty: "EASY",
        patternAccuracy: 9,
        sm2Repetitions: 3,
      }),
      sol({
        id: "s2",
        pattern: "Binary Search",
        difficulty: "MEDIUM",
        patternAccuracy: 9,
      }),
    ];
    const out = computePatternMastery({
      solutions,
      reviewAttempts: [reviewAttempt("s1")],
    });
    const bs = out.matrix.find((m) => m.pattern === "Binary Search");
    expect(bs.state).toBe("OWNED");
    expect(bs.retained).toBe(true);
  });

  it("SOLID + reviewAttempt but sm2Repetitions=1 stays SOLID (not retained)", () => {
    const solutions = [
      sol({
        id: "s1",
        pattern: "Backtracking",
        difficulty: "EASY",
        patternAccuracy: 9,
        sm2Repetitions: 1, // only 1 successful rep
      }),
      sol({
        id: "s2",
        pattern: "Backtracking",
        difficulty: "MEDIUM",
        patternAccuracy: 9,
      }),
    ];
    const out = computePatternMastery({
      solutions,
      reviewAttempts: [reviewAttempt("s1")],
    });
    const bt = out.matrix.find((m) => m.pattern === "Backtracking");
    expect(bt.state).toBe("SOLID");
    expect(bt.retained).toBe(false);
  });
});

// ── Legacy NULL solveMethod policy ───────────────────────────────────

describe("computePatternMastery — solveMethod NULL policy", () => {
  it("NULL solveMethod on legacy row (pre-deploy) is treated as COLD", () => {
    const before = new Date(SOLVE_METHOD_REQUIRED_AFTER.getTime() - 86400000);
    const solutions = [
      sol({ id: "s1", pattern: "DFS", solveMethod: null, patternAccuracy: 8, createdAt: before }),
      sol({ id: "s2", pattern: "DFS", solveMethod: null, patternAccuracy: 8, createdAt: before }),
    ];
    const out = computePatternMastery({ solutions, reviewAttempts: [] });
    const dfs = out.matrix.find((m) => m.pattern === "DFS");
    expect(dfs.state).toBe("WORKING");
    expect(dfs.coldSolves).toBe(2);
  });

  it("NULL solveMethod on POST-deploy row is NOT counted as COLD", () => {
    const after = new Date(SOLVE_METHOD_REQUIRED_AFTER.getTime() + 86400000);
    const solutions = [
      sol({ id: "s1", pattern: "BFS", solveMethod: null, patternAccuracy: 9, createdAt: after }),
      sol({ id: "s2", pattern: "BFS", solveMethod: null, patternAccuracy: 9, createdAt: after }),
    ];
    const out = computePatternMastery({ solutions, reviewAttempts: [] });
    const bfs = out.matrix.find((m) => m.pattern === "BFS");
    expect(bfs.coldSolves).toBe(0);
    expect(bfs.state).toBe("TOUCHED");
  });
});

// ── Coding-only filter ───────────────────────────────────────────────

describe("computePatternMastery — coding-only by design", () => {
  it("non-CODING solutions are ignored even when they tag a canonical pattern", () => {
    const solutions = [
      sol({ id: "s1", pattern: "Trees", category: "BEHAVIORAL", patternAccuracy: 9 }),
      sol({ id: "s2", pattern: "Trees", category: "HR", patternAccuracy: 9 }),
    ];
    const out = computePatternMastery({ solutions, reviewAttempts: [] });
    const trees = out.matrix.find((m) => m.pattern === "Trees");
    expect(trees.state).toBe("UNTOUCHED");
    expect(trees.solves).toBe(0);
  });
});

// ── Counts and breadth/depth ─────────────────────────────────────────

describe("computePatternMastery — counts + breadth/depth", () => {
  it("counts.coreSolidOrAbove tracks only the FAANG_CORE subset", () => {
    // Push one core pattern (Trees) to SOLID, one non-core (Tries) to SOLID.
    // coreSolidOrAbove must count only Trees.
    const solutions = [
      sol({ id: "s1", pattern: "Trees", difficulty: "EASY",  patternAccuracy: 8 }),
      sol({ id: "s2", pattern: "Trees", difficulty: "MEDIUM",patternAccuracy: 8 }),
      sol({ id: "s3", pattern: "Tries", difficulty: "EASY",  patternAccuracy: 8 }),
      sol({ id: "s4", pattern: "Tries", difficulty: "HARD",  patternAccuracy: 8 }),
    ];
    const out = computePatternMastery({ solutions, reviewAttempts: [] });
    expect(out.matrix.find((m) => m.pattern === "Trees").state).toBe("SOLID");
    expect(out.matrix.find((m) => m.pattern === "Tries").state).toBe("SOLID");
    expect(out.counts.solidOrAbove).toBe(2);
    expect(out.counts.coreSolidOrAbove).toBe(1); // Tries is NOT core
  });

  it("breadth saturates near 100 only with full FAANG-core coverage at OWNED", () => {
    // 3 SOLID core patterns out of 15 → breadth should be modest, not 85.
    const solutions = [];
    let i = 0;
    for (const p of ["Two Pointers", "Trees", "Graphs"]) {
      solutions.push(sol({ id: `s${i++}`, pattern: p, difficulty: "EASY",  patternAccuracy: 8 }));
      solutions.push(sol({ id: `s${i++}`, pattern: p, difficulty: "MEDIUM", patternAccuracy: 8 }));
    }
    const out = computePatternMastery({ solutions, reviewAttempts: [] });
    // 3 of 15 core at SOLID (75 pts each), 12 untouched (0):
    //   coreMean = (3*75) / 15 = 15
    //   nonCoreMean = 0
    //   breadth = 15
    expect(Math.round(out.breadth)).toBe(15);
    // depth = mean of touched-or-above = 75 (the 3 SOLID patterns)
    expect(Math.round(out.depth)).toBe(75);
  });

  it("masteryScore = 0.6 * breadth + 0.4 * depth", () => {
    expect(masteryScore({ breadth: 100, depth: 100 })).toBe(100);
    expect(masteryScore({ breadth: 0, depth: 0 })).toBe(0);
    expect(masteryScore({ breadth: 50, depth: 0 })).toBe(30);
    expect(masteryScore({ breadth: 0, depth: 50 })).toBe(20);
    // 0.6 * 60 + 0.4 * 80 = 36 + 32 = 68
    expect(masteryScore({ breadth: 60, depth: 80 })).toBe(68);
  });
});

// ── Original-report user regression ──────────────────────────────────

describe("computePatternMastery — original-report user fixture", () => {
  // Mirror the user from the very first conversation: 4 solutions, 3 unique
  // patterns, all coding. Under the legacy formula they got D1=85. Under v2
  // they should be far lower.
  const before = new Date(SOLVE_METHOD_REQUIRED_AFTER.getTime() - 86400000);
  const solutions = [
    sol({ id: "s1", pattern: "Array / Hashing", difficulty: "EASY",  patternAccuracy: 7, createdAt: before }),
    sol({ id: "s2", pattern: "Array / Hashing", difficulty: "EASY",  patternAccuracy: 7, createdAt: before }),
    sol({ id: "s3", pattern: "Two Pointers",    difficulty: "EASY",  patternAccuracy: 7, createdAt: before }),
    sol({ id: "s4", pattern: "Sliding Window",  difficulty: "EASY",  patternAccuracy: 7, createdAt: before }),
  ];

  it("produces a small D1 score (not the legacy 85+)", () => {
    const out = computePatternMastery({ solutions, reviewAttempts: [] });
    const score = masteryScore({ breadth: out.breadth, depth: out.depth });
    expect(score).toBeLessThan(40); // legacy formula gave 85 here
    expect(score).toBeGreaterThan(0);
  });

  it("does not satisfy Tier 2's mastery gate (coreSolidOrAbove ≥ 10)", () => {
    const out = computePatternMastery({ solutions, reviewAttempts: [] });
    expect(out.counts.coreSolidOrAbove).toBeLessThan(10);
    expect(out.counts.owned).toBe(0);
  });
});

// ── Smoke checks on the constants ────────────────────────────────────

describe("MASTERY_STATES constant", () => {
  it("exposes all 5 states with monotonic points", () => {
    expect(MASTERY_STATES.UNTOUCHED.points).toBe(0);
    expect(MASTERY_STATES.TOUCHED.points).toBe(25);
    expect(MASTERY_STATES.WORKING.points).toBe(50);
    expect(MASTERY_STATES.SOLID.points).toBe(75);
    expect(MASTERY_STATES.OWNED.points).toBe(100);
  });
});

describe("SOLVE_METHOD_REQUIRED_AFTER constant", () => {
  it("is a Date in 2026-05", () => {
    expect(SOLVE_METHOD_REQUIRED_AFTER instanceof Date).toBe(true);
    expect(SOLVE_METHOD_REQUIRED_AFTER.getUTCFullYear()).toBe(2026);
    expect(SOLVE_METHOD_REQUIRED_AFTER.getUTCMonth()).toBe(4); // 0-indexed → May
  });
});

describe("FAANG_CORE_PATTERNS sanity (re-asserted here for cross-module drift)", () => {
  it("all entries are canonical", () => {
    const canonicalSet = new Set(CANONICAL_PATTERN_LABELS);
    for (const p of FAANG_CORE_PATTERNS) {
      expect(canonicalSet.has(p)).toBe(true);
    }
  });
});
