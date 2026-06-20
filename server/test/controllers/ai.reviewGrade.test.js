// ============================================================================
// AI review-grade controller — wire-level integration tests
// ============================================================================
//
// Targets the bug Sooraj reported (feedback ID cmpl5lefk0006bvxu3gppm9ph,
// 2026-05-25): the legacy word-diff returned harshly false negatives when
// the user used synonymous concepts. The new endpoint runs an LLM grader
// with validate→fallback so synonyms are honoured AND the UI never crashes
// on malformed AI output.
//
// Regression guards in this file:
//   1. Empty recall → 400 (don't waste an LLM call on nothing).
//   2. AI returns valid JSON → controller returns it un-mutated, fallback: false.
//   3. AI returns malformed shape → fallback used, fallback: true.
//   4. aiComplete throws → fallback used, fallback: true (UI never sees a 500).
//   5. Solution doesn't belong to user → 404 (multi-tenant boundary).
// ============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke, makeReq } from "./_harness.js";

let aiBehavior = { kind: "valid", payload: {} };

vi.mock("../../src/lib/prisma.js", () => ({
    default: {
        solution: {
            findFirst: vi.fn(async ({ where }) => {
                if (where.id === "sol_owned" && where.userId === "user_test") {
                    return {
                        id: "sol_owned",
                        patterns: ["Hashing"],
                        keyInsight: "Use a HashMap to look up complements in O(1).",
                        optimizedApproach: null,
                        feynmanExplanation: null,
                        timeComplexity: "O(n)",
                        spaceComplexity: "O(n)",
                        problem: { title: "Two Sum", difficulty: "EASY", category: "CODING" },
                    };
                }
                return null;
            }),
        },
    },
}));

vi.mock("../../src/services/ai.service.js", () => ({
    aiComplete: vi.fn(async () => {
        if (aiBehavior.kind === "throws") throw new Error(aiBehavior.message || "boom");
        return aiBehavior.payload;
    }),
    AIError: class AIError extends Error {
        constructor(code, message) {
            super(message);
            this.code = code;
        }
    },
}));

vi.mock("../../src/config/env.js", async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, AI_ENABLED: true };
});

import { gradeReviewRecall } from "../../src/controllers/aiRecallGrade.controller.js";

const VALID_AI_GRADE = {
    pattern: { match: "YES", feedback: "HashMap is the same family as Hashing — solid recall." },
    keyInsight: { match: "PARTIAL", feedback: "You named the data structure but not the complement-lookup move." },
    complexity: { match: "YES", feedback: "Time and space both O(n) — correct." },
    overall: "pass",
    suggestedConfidence: 4,
};

beforeEach(() => {
    aiBehavior = { kind: "valid", payload: VALID_AI_GRADE };
});

describe("gradeReviewRecall", () => {
    it("rejects empty recall with 400", async () => {
        const res = await invoke(
            gradeReviewRecall,
            makeReq({
                params: { solutionId: "sol_owned" },
                body: { recall: { pattern: "", keyInsight: "", complexity: "" } },
            }),
        );
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it("returns the validated grade when AI emits a well-formed payload", async () => {
        const res = await invoke(
            gradeReviewRecall,
            makeReq({
                params: { solutionId: "sol_owned" },
                body: { recall: { pattern: "HashMap", keyInsight: "store value as key", complexity: "O(n) / O(n)" } },
            }),
        );
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.fallback).toBe(false);
        expect(res.body.data.pattern.match).toBe("YES");
        expect(res.body.data.keyInsight.match).toBe("PARTIAL");
        expect(res.body.data.overall).toBe("pass");
        expect(res.body.data.suggestedConfidence).toBe(4);
    });

    it("falls back to a deterministic grade when AI returns malformed shape", async () => {
        aiBehavior = {
            kind: "valid",
            payload: { pattern: "wrong shape", overall: "pass" }, // missing keyInsight, complexity, etc.
        };
        const res = await invoke(
            gradeReviewRecall,
            makeReq({
                params: { solutionId: "sol_owned" },
                body: { recall: { pattern: "HashMap", keyInsight: "yes", complexity: "" } },
            }),
        );
        expect(res.status).toBe(200);
        expect(res.body.data.fallback).toBe(true);
        // Empty complexity field → fallback marks it NO; non-empty → PARTIAL.
        expect(res.body.data.pattern.match).toBe("PARTIAL");
        expect(res.body.data.complexity.match).toBe("NO");
        expect(res.body.data.suggestedConfidence).toBe(3);
    });

    it("falls back when aiComplete throws (UI never sees a 500)", async () => {
        aiBehavior = { kind: "throws", message: "openai 503" };
        const res = await invoke(
            gradeReviewRecall,
            makeReq({
                params: { solutionId: "sol_owned" },
                body: { recall: { pattern: "HashMap", keyInsight: "yes", complexity: "O(n)" } },
            }),
        );
        expect(res.status).toBe(200);
        expect(res.body.data.fallback).toBe(true);
        expect(res.body.data.overall).toBe("partial");
    });

    it("returns 404 when the solution does not belong to the user (multi-tenant boundary)", async () => {
        const res = await invoke(
            gradeReviewRecall,
            makeReq({
                params: { solutionId: "sol_other" },
                body: { recall: { pattern: "HashMap", keyInsight: "x", complexity: "O(n)" } },
            }),
        );
        expect(res.status).toBe(404);
    });

    it("clamps suggestedConfidence to 1..5 when the LLM returns out-of-range", async () => {
        aiBehavior = {
            kind: "valid",
            payload: { ...VALID_AI_GRADE, suggestedConfidence: 17 },
        };
        const res = await invoke(
            gradeReviewRecall,
            makeReq({
                params: { solutionId: "sol_owned" },
                body: { recall: { pattern: "HashMap", keyInsight: "yes", complexity: "O(n)" } },
            }),
        );
        expect(res.status).toBe(200);
        expect(res.body.data.suggestedConfidence).toBe(5);
    });
});
