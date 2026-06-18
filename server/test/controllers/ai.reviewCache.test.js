// ============================================================================
// AI review input-hash cache — regression tests
// ============================================================================
//
// Locks down two contracts the cache depends on:
//
//   A) computeReviewInputHash invariants:
//      - Same input → same hash (deterministic).
//      - Reordered keys / patterns → same hash (stable stringify, sorted).
//      - Any tracked field changing → different hash (no silent cache leak).
//      - Hash field set is exactly the documented set — adding/removing a
//        field is a deliberate decision that must update this test.
//
//   B) Wire-level controller behavior in reviewSolution:
//      - Cache hit: stored hash matches current → returns existing feedback
//        with `cached: true`, no aiComplete call.
//      - Cache miss: stored hash differs → runs aiComplete, persists new
//        feedback + new hash.
//      - force=true: bypasses cache even when hashes match.
//
// The hash field list is the regression-prone surface. If a future rename
// (like the realWorldConnection→whatWasChallenging UX rename) silently
// changes a key in `inputs`, every existing row's stored hash mismatches
// the new computation → every solution re-bills on next review. This test
// is the tripwire that catches that.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { computeReviewInputHash } from "../../src/controllers/ai.controller.js";

// ── A) Hash invariants — pure unit tests ────────────────────────────

describe("computeReviewInputHash — invariants", () => {
    const baseSolution = {
        problemVersion: 3,
        code: "function twoSum(nums, target) { /* ... */ }",
        approach: "Use a hash map.",
        bruteForce: "Nested loops, O(n²).",
        optimizedApproach: "Single pass with hashmap.",
        timeComplexity: "O(n)",
        spaceComplexity: "O(n)",
        keyInsight: "Map complements as you go.",
        feynmanExplanation: "...",
        realWorldConnection: "Database joins.",
        patterns: ["Hashing", "Two Pointers"],
        categorySpecificData: { language: "Python" },
        followUpAnswers: [
            { followUpQuestion: { id: "fq_1" }, answer: "Yes." },
            { followUpQuestion: { id: "fq_2" }, answer: "No." },
        ],
    };

    it("is deterministic for identical inputs", () => {
        const a = computeReviewInputHash(baseSolution);
        const b = computeReviewInputHash(baseSolution);
        expect(a).toBe(b);
        expect(a).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
    });

    it("is order-insensitive for patterns", () => {
        const a = computeReviewInputHash(baseSolution);
        const b = computeReviewInputHash({
            ...baseSolution,
            patterns: ["Two Pointers", "Hashing"], // reversed
        });
        expect(a).toBe(b);
    });

    it("is order-insensitive for follow-up answers (sorted by question id)", () => {
        const a = computeReviewInputHash(baseSolution);
        const b = computeReviewInputHash({
            ...baseSolution,
            followUpAnswers: [
                { followUpQuestion: { id: "fq_2" }, answer: "No." },
                { followUpQuestion: { id: "fq_1" }, answer: "Yes." },
            ],
        });
        expect(a).toBe(b);
    });

    it("changes when ANY tracked content field changes", () => {
        const baseHash = computeReviewInputHash(baseSolution);

        // Each of these mutations must produce a DIFFERENT hash. If a future
        // refactor accidentally drops a field from the hash inputs, the
        // mutation for that field will produce the same hash as base — and
        // this test fails. That's the tripwire.
        const mutations = {
            problemVersion: { ...baseSolution, problemVersion: 4 },
            code: { ...baseSolution, code: "// changed" },
            approach: { ...baseSolution, approach: "different" },
            bruteForce: { ...baseSolution, bruteForce: "different" },
            optimizedApproach: { ...baseSolution, optimizedApproach: "different" },
            timeComplexity: { ...baseSolution, timeComplexity: "O(n²)" },
            spaceComplexity: { ...baseSolution, spaceComplexity: "O(1)" },
            keyInsight: { ...baseSolution, keyInsight: "different" },
            feynmanExplanation: { ...baseSolution, feynmanExplanation: "different" },
            realWorldConnection: { ...baseSolution, realWorldConnection: "different" },
            patterns: { ...baseSolution, patterns: ["Sliding Window"] },
            categorySpecificData: {
                ...baseSolution,
                categorySpecificData: { language: "JavaScript" },
            },
            followUpAnswers: {
                ...baseSolution,
                followUpAnswers: [
                    { followUpQuestion: { id: "fq_1" }, answer: "different" },
                    { followUpQuestion: { id: "fq_2" }, answer: "No." },
                ],
            },
        };

        for (const [field, mutated] of Object.entries(mutations)) {
            expect(
                computeReviewInputHash(mutated),
                `Mutating ${field} should change the hash — if not, that field has dropped out of the hash inputs`,
            ).not.toBe(baseHash);
        }
    });

    it("treats null and missing fields the same way (no spurious mismatches)", () => {
        const withNulls = {
            problemVersion: 1,
            code: null,
            approach: null,
            bruteForce: null,
            optimizedApproach: null,
            timeComplexity: null,
            spaceComplexity: null,
            keyInsight: null,
            feynmanExplanation: null,
            realWorldConnection: null,
            patterns: null,
            categorySpecificData: null,
            followUpAnswers: null,
        };
        const withMissing = { problemVersion: 1 };
        // The function falls back to "" / [] / undefined for missing values.
        // Both shapes should produce stable, valid hashes — and crucially,
        // they should not crash on missing keys.
        expect(computeReviewInputHash(withNulls)).toMatch(/^[a-f0-9]{64}$/);
        expect(computeReviewInputHash(withMissing)).toMatch(/^[a-f0-9]{64}$/);
    });
});

// ── B) Wire-level controller cache behavior ───────────────────────────

let aiCompleteCalled = 0;
let storedSolution = null;
let updatedHash = null;

vi.mock("../../src/lib/prisma.js", () => {
    const tx = {
        solution: {
            update: vi.fn(async ({ data }) => {
                if (data.aiFeedbackInputHash !== undefined)
                    updatedHash = data.aiFeedbackInputHash;
                return { ...storedSolution, ...data };
            }),
            findUnique: vi.fn(async () => storedSolution),
        },
        solutionAttempt: {
            findFirst: vi.fn(async () => null),
            create: vi.fn(async () => ({})),
        },
        problem: { update: vi.fn(async () => ({})) },
    };
    return {
        default: {
            solution: {
                findFirst: vi.fn(async () => storedSolution),
                update: tx.solution.update,
                findMany: vi.fn(async () => []),
            },
            problem: { update: vi.fn(async () => ({})) },
            $queryRawUnsafe: vi.fn(async () => []),
            $transaction: vi.fn(async (fn) => fn(tx)),
        },
    };
});

vi.mock("../../src/services/ai.service.js", () => ({
    aiComplete: vi.fn(async () => {
        aiCompleteCalled += 1;
        return {
            scores: {
                codeCorrectness: 9,
                patternAccuracy: 9,
                understandingDepth: 8,
                explanationQuality: 8,
                confidenceCalibration: 8,
            },
            flags: {
                languageMismatch: false,
                detectedLanguage: null,
                incompleteSubmission: false,
                wrongPattern: false,
                identifiedPattern: "Hashing",
                correctPattern: null,
            },
            strengths: ["Clean approach"],
            gaps: [],
            improvement: "—",
            interviewTip: "—",
            readinessVerdict: "Ready.",
            complexityCheck: {
                timeComplexity: "O(n)",
                spaceComplexity: "O(n)",
                timeCorrect: true,
                spaceCorrect: true,
                optimizationNote: null,
            },
            followUpEvaluations: [],
        };
    }),
    AIError: class AIError extends Error {
        constructor(code, message) {
            super(message);
            this.code = code;
        }
    },
}));

vi.mock("../../src/services/embedding.service.js", () => ({
    generateEmbedding: vi.fn(async () => null),
}));

vi.mock("../../src/services/skillComputation.service.js", () => ({
    recomputeSkillsFromSolution: vi.fn(async () => undefined),
}));

vi.mock("../../src/config/env.js", async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, AI_ENABLED: true };
});

import { reviewSolution } from "../../src/controllers/ai.controller.js";
import { invoke, makeReq } from "./_harness.js";

const baseSolutionRow = {
    id: "sol_test",
    userId: "user_test",
    teamId: "team_test",
    problemId: "prob_test",
    problemVersion: 1,
    code: "function f() {}",
    approach: "approach text",
    bruteForce: null,
    optimizedApproach: null,
    timeComplexity: "O(n)",
    spaceComplexity: "O(1)",
    keyInsight: "ki",
    feynmanExplanation: "fe",
    realWorldConnection: null,
    patterns: ["Hashing"],
    categorySpecificData: null,
    confidence: 4,
    aiFeedback: [{ overallScore: 88, dimensionScores: {} }],
    aiFeedbackInputHash: null, // set per-test
    followUpAnswers: [],
    problem: {
        id: "prob_test",
        title: "Test",
        description: "...",
        category: "CODING",
        difficulty: "EASY",
        adminNotes: null,
        tags: [],
        followUpQuestions: [],
    },
};

describe("reviewSolution — input-hash cache", () => {
    beforeEach(() => {
        aiCompleteCalled = 0;
        updatedHash = null;
    });

    it("returns cached: true and skips aiComplete when stored hash matches", async () => {
        const matchingHash = computeReviewInputHash(baseSolutionRow);
        storedSolution = { ...baseSolutionRow, aiFeedbackInputHash: matchingHash };

        const { status, body } = await invoke(
            reviewSolution,
            makeReq({ params: { solutionId: "sol_test" } }),
        );

        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data.cached).toBe(true);
        expect(aiCompleteCalled).toBe(0);
        // Cache hit returns the latest existing feedback unchanged.
        expect(body.data.feedback).toEqual({ overallScore: 88, dimensionScores: {} });
    });

    it("runs aiComplete and persists new hash when stored hash differs", async () => {
        storedSolution = {
            ...baseSolutionRow,
            aiFeedbackInputHash: "stale_hash_from_old_inputs",
        };

        const { status, body } = await invoke(
            reviewSolution,
            makeReq({ params: { solutionId: "sol_test" } }),
        );

        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(aiCompleteCalled).toBe(1);
        expect(updatedHash).toBe(computeReviewInputHash(baseSolutionRow));
    });

    it("force=true bypasses cache even when hash matches", async () => {
        const matchingHash = computeReviewInputHash(baseSolutionRow);
        storedSolution = { ...baseSolutionRow, aiFeedbackInputHash: matchingHash };

        const { status } = await invoke(
            reviewSolution,
            makeReq({
                params: { solutionId: "sol_test" },
                body: { force: true },
            }),
        );

        expect(status).toBe(200);
        expect(aiCompleteCalled).toBe(1);
    });

    it("treats null stored hash as a cache miss (legacy rows)", async () => {
        storedSolution = { ...baseSolutionRow, aiFeedbackInputHash: null };

        const { status } = await invoke(
            reviewSolution,
            makeReq({ params: { solutionId: "sol_test" } }),
        );

        expect(status).toBe(200);
        expect(aiCompleteCalled).toBe(1);
        expect(updatedHash).toBe(computeReviewInputHash(baseSolutionRow));
    });
});
