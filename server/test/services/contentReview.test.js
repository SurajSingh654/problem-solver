import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/lib/prisma.js", () => ({
    default: {
        contentReviewLog: {
            create: vi.fn(),
            findFirst: vi.fn(),
        },
        topic: { findUnique: vi.fn() },
        concept: { findUnique: vi.fn() },
        lab: { findUnique: vi.fn() },
    },
}));

import prisma from "../../src/lib/prisma.js";
import {
    runValidator,
    latestVerdictFor,
    registerValidator,
    _resetValidatorsForTest,
} from "../../src/services/curriculum/contentReview.service.js";

describe("contentReview.service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        _resetValidatorsForTest();
    });

    describe("runValidator", () => {
        it("throws on unknown validator type", async () => {
            await expect(runValidator("UNKNOWN_TYPE", {})).rejects.toThrow(/Unknown validator type/);
        });

        it("dispatches to a registered validator, writes ContentReviewLog, returns verdict", async () => {
            const mockBuildPrompt = vi.fn().mockReturnValue({
                prompt: "Say WORTH_LEARNING",
                systemPrompt: "You are a reviewer",
                sanitizedInputs: { name: "clean" },
            });
            const mockAiComplete = vi.fn().mockResolvedValue('{"verdict":"WORTH_LEARNING","note":"ok"}');
            const mockSchema = { safeParse: vi.fn().mockReturnValue({ success: true, data: { verdict: "WORTH_LEARNING", note: "ok" } }) };
            const mockValidate = vi.fn((data) => data);
            const mockFallback = vi.fn().mockReturnValue({ verdict: "NOT_WORTH_TIME", note: "fallback" });

            registerValidator("TEST_TYPE", {
                model: "test-model",
                buildPrompt: mockBuildPrompt,
                schema: mockSchema,
                validate: mockValidate,
                fallback: mockFallback,
                targetType: "TOPIC",
                aiComplete: mockAiComplete,
            });

            prisma.contentReviewLog.create.mockResolvedValue({ id: "log_1" });

            const result = await runValidator("TEST_TYPE", { targetId: "topic_abc" });

            expect(result.verdict).toBe("WORTH_LEARNING");
            expect(result.usedFallback).toBe(false);
            expect(mockAiComplete).toHaveBeenCalledOnce();
            expect(mockValidate).toHaveBeenCalledOnce();
            expect(mockFallback).not.toHaveBeenCalled();
            expect(prisma.contentReviewLog.create).toHaveBeenCalledOnce();
            const logData = prisma.contentReviewLog.create.mock.calls[0][0].data;
            expect(logData.targetType).toBe("TOPIC");
            expect(logData.targetId).toBe("topic_abc");
            expect(logData.verdict).toBe("WORTH_LEARNING");
            expect(logData.reviewerModel).toBe("test-model");
        });

        it("falls back on Zod parse failure", async () => {
            const mockAiComplete = vi.fn().mockResolvedValue('{"invalid":"shape"}');
            const mockSchema = {
                safeParse: vi.fn().mockReturnValue({ success: false, error: { message: "bad shape" } }),
            };
            const mockValidate = vi.fn();
            const mockFallback = vi.fn().mockReturnValue({ verdict: "NOT_WORTH_TIME", note: "fallback" });

            registerValidator("BAD_ZOD_TYPE", {
                model: "test-model",
                buildPrompt: vi.fn().mockReturnValue({ prompt: "p", systemPrompt: "s", sanitizedInputs: {} }),
                schema: mockSchema,
                validate: mockValidate,
                fallback: mockFallback,
                targetType: "TOPIC",
                aiComplete: mockAiComplete,
            });

            prisma.contentReviewLog.create.mockResolvedValue({ id: "log_2" });

            const result = await runValidator("BAD_ZOD_TYPE", { targetId: "topic_x" });

            expect(result.usedFallback).toBe(true);
            expect(result.verdict).toBe("NOT_WORTH_TIME");
            expect(mockValidate).not.toHaveBeenCalled();
            expect(mockFallback).toHaveBeenCalledOnce();
            const logData = prisma.contentReviewLog.create.mock.calls[0][0].data;
            expect(logData.reviewerModel).toContain("FALLBACK");
        });

        it("falls back on Rule violation (validate throws)", async () => {
            const mockAiComplete = vi.fn().mockResolvedValue('{"verdict":"WORTH_LEARNING"}');
            const mockSchema = { safeParse: vi.fn().mockReturnValue({ success: true, data: { verdict: "WORTH_LEARNING" } }) };
            const mockValidate = vi.fn().mockImplementation(() => { throw new Error("Rule 22 violation"); });
            const mockFallback = vi.fn().mockReturnValue({ verdict: "NOT_WORTH_TIME" });

            registerValidator("BAD_RULE_TYPE", {
                model: "test-model",
                buildPrompt: vi.fn().mockReturnValue({ prompt: "p", systemPrompt: "s", sanitizedInputs: {} }),
                schema: mockSchema,
                validate: mockValidate,
                fallback: mockFallback,
                targetType: "TOPIC",
                aiComplete: mockAiComplete,
            });

            prisma.contentReviewLog.create.mockResolvedValue({ id: "log_3" });

            const result = await runValidator("BAD_RULE_TYPE", { targetId: "topic_y" });
            expect(result.usedFallback).toBe(true);
        });

        it("hashes rawPrompt when >8KB", async () => {
            const bigPrompt = "x".repeat(10000);
            const mockAiComplete = vi.fn().mockResolvedValue('{"verdict":"WORTH_LEARNING"}');
            const mockSchema = { safeParse: vi.fn().mockReturnValue({ success: true, data: { verdict: "WORTH_LEARNING" } }) };
            const mockValidate = vi.fn((d) => d);

            registerValidator("BIG_PROMPT_TYPE", {
                model: "test-model",
                buildPrompt: vi.fn().mockReturnValue({ prompt: bigPrompt, systemPrompt: "s", sanitizedInputs: {} }),
                schema: mockSchema,
                validate: mockValidate,
                fallback: vi.fn(),
                targetType: "TOPIC",
                aiComplete: mockAiComplete,
            });

            prisma.contentReviewLog.create.mockResolvedValue({ id: "log_4" });
            await runValidator("BIG_PROMPT_TYPE", { targetId: "topic_z" });

            const logData = prisma.contentReviewLog.create.mock.calls[0][0].data;
            expect(logData.rawPrompt).toMatch(/^HASH:/);
            expect(logData.rawPrompt.length).toBeLessThan(50);  // hash marker is short
        });

        it("skips ContentReviewLog write when targetType is null (e.g. CHECK_IN)", async () => {
            registerValidator("NO_LOG_TYPE", {
                model: "test-model",
                buildPrompt: vi.fn().mockReturnValue({ prompt: "p", systemPrompt: "s", sanitizedInputs: {} }),
                schema: { safeParse: vi.fn().mockReturnValue({ success: true, data: { overallVerdict: "PASS" } }) },
                validate: vi.fn((d) => d),
                fallback: vi.fn(),
                targetType: null,
                aiComplete: vi.fn().mockResolvedValue('{"overallVerdict":"PASS"}'),
            });

            const result = await runValidator("NO_LOG_TYPE", { targetId: "concept_x" });
            expect(result.logId).toBeUndefined();
            expect(prisma.contentReviewLog.create).not.toHaveBeenCalled();
        });
    });

    describe("latestVerdictFor", () => {
        it("returns latest log row when target exists", async () => {
            prisma.topic.findUnique.mockResolvedValue({ id: "topic_a" });
            prisma.contentReviewLog.findFirst.mockResolvedValue({
                id: "log_5",
                verdict: "WORTH_LEARNING",
                body: {},
                createdAt: new Date(),
            });
            const result = await latestVerdictFor("TOPIC", "topic_a");
            expect(result.verdict).toBe("WORTH_LEARNING");
        });

        it("returns null for orphan target (target deleted, log rows remain)", async () => {
            prisma.topic.findUnique.mockResolvedValue(null);
            const result = await latestVerdictFor("TOPIC", "topic_deleted");
            expect(result).toBeNull();
            expect(prisma.contentReviewLog.findFirst).not.toHaveBeenCalled();
        });

        it("returns null when target exists but no reviews yet", async () => {
            prisma.concept.findUnique.mockResolvedValue({ id: "concept_a" });
            prisma.contentReviewLog.findFirst.mockResolvedValue(null);
            const result = await latestVerdictFor("CONCEPT", "concept_a");
            expect(result).toBeNull();
        });

        it("dispatches to lab table for LAB targetType", async () => {
            prisma.lab.findUnique.mockResolvedValue({ id: "lab_a" });
            prisma.contentReviewLog.findFirst.mockResolvedValue({ id: "log_6", verdict: "STRONG", body: {}, createdAt: new Date() });
            const result = await latestVerdictFor("LAB", "lab_a");
            expect(result.verdict).toBe("STRONG");
            expect(prisma.lab.findUnique).toHaveBeenCalledOnce();
            expect(prisma.topic.findUnique).not.toHaveBeenCalled();
            expect(prisma.concept.findUnique).not.toHaveBeenCalled();
        });
    });
});
