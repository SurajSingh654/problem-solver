// Smoke test — verifies the AI module surface loads correctly and key
// functions exist. If this fails, the rest of the test suite won't run.
//
// Stub OPENAI_API_KEY before importing ai.service.js so getClient() doesn't
// fault when a downstream test exercises the rate-limit path.
import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(() => {
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-test-not-used'
})

describe('ai.service.js', () => {
    it('exports the public surface', async () => {
        const m = await import('../../src/services/ai.service.js')
        expect(typeof m.aiComplete).toBe('function')
        expect(typeof m.aiStream).toBe('function')
        expect(typeof m.checkRateLimit).toBe('function')
        expect(typeof m.isAIEnabled).toBe('function')
        expect(typeof m.AIError).toBe('function')
    })

    it('checkRateLimit returns the standard shape', async () => {
        const { checkRateLimit } = await import('../../src/services/ai.service.js')
        const r = await checkRateLimit('user-smoke-1')
        expect(r).toHaveProperty('allowed')
        expect(r).toHaveProperty('remaining')
        expect(r).toHaveProperty('limit')
        expect(typeof r.allowed).toBe('boolean')
    })
})

describe('ai.validators.js', () => {
    it('exports validateVerdict, extractJSON, hash helpers', async () => {
        const m = await import('../../src/services/ai.validators.js')
        expect(typeof m.validateVerdict).toBe('function')
        expect(typeof m.extractJSON).toBe('function')
        expect(typeof m.hashInputPayload).toBe('function')
        expect(typeof m.hashEvidence).toBe('function')
        expect(Array.isArray(m.TENTATIVE_VOCAB)).toBe(true)
        expect(Array.isArray(m.PARTIAL_VOCAB)).toBe(true)
    })
})

describe('ai.fallbacks.js', () => {
    it('exports buildFallbackVerdict + scaffold builders', async () => {
        const m = await import('../../src/services/ai.fallbacks.js')
        expect(typeof m.buildFallbackVerdict).toBe('function')
        expect(typeof m.prettyDimName).toBe('function')
        // Stubs that future phases will implement; today they return null.
        expect(typeof m.buildFallbackReview).toBe('function')
        expect(typeof m.buildFallbackFinalEval).toBe('function')
        expect(typeof m.buildFallbackInterviewDebrief).toBe('function')
        expect(typeof m.buildFallbackProblem).toBe('function')
        expect(typeof m.buildFallbackCoaching).toBe('function')
        expect(typeof m.buildFallbackQuiz).toBe('function')
    })
})
