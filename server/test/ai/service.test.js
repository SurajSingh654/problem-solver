// Tests for ai.service.js — retry, model fallback, structured outputs,
// tool-call passthrough, usage emission. All offline; no real OpenAI calls.
//
// We use _setClientForTests() to inject a mock OpenAI client whose
// chat.completions.create returns whatever the test wants.
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
    aiComplete,
    aiStream,
    AIError,
    onUsageEvent,
    _setClientForTests,
    checkRateLimit,
} from '../../src/services/ai.service.js'

// ── Helpers to build a mock OpenAI client ───────────────────────────
function mockClient(handler) {
    return {
        chat: {
            completions: {
                create: vi.fn(handler),
            },
        },
    }
}

function okResponse({ content = '{"ok":true}', toolCalls, usage } = {}) {
    return {
        choices: [
            {
                message: {
                    role: 'assistant',
                    content,
                    ...(toolCalls ? { tool_calls: toolCalls } : {}),
                },
            },
        ],
        usage: usage || { prompt_tokens: 100, completion_tokens: 25, total_tokens: 125 },
    }
}

class FakeApiError extends Error {
    constructor(status, code) {
        super(`status ${status}`)
        this.status = status
        if (code) this.code = code
    }
}

// ── Reset rate-limit isolation per user ─────────────────────────────
let userCounter = 0
function nextUserId() {
    return `user-test-${++userCounter}`
}

afterEach(() => {
    _setClientForTests(null)
    vi.useRealTimers()
})

// ── Happy path ──────────────────────────────────────────────────────
describe('aiComplete — happy path', () => {
    it('returns parsed JSON in jsonMode (default)', async () => {
        _setClientForTests(mockClient(() => okResponse({ content: '{"a":1,"b":[2,3]}' })))
        const result = await aiComplete({
            systemPrompt: 'sys',
            userPrompt: 'usr',
            userId: nextUserId(),
        })
        expect(result).toEqual({ a: 1, b: [2, 3] })
    })

    it('returns raw string when jsonMode=false', async () => {
        _setClientForTests(mockClient(() => okResponse({ content: 'raw text' })))
        const result = await aiComplete({
            systemPrompt: 'sys',
            userPrompt: 'usr',
            userId: nextUserId(),
            jsonMode: false,
        })
        expect(result).toBe('raw text')
    })

    it('does NOT pass response_format when tools are provided', async () => {
        const create = vi.fn(() => okResponse({ toolCalls: [{ id: 't1', type: 'function', function: { name: 'foo', arguments: '{}' } }] }))
        _setClientForTests(mockClient(create))
        await aiComplete({
            systemPrompt: 'sys',
            userPrompt: 'usr',
            userId: nextUserId(),
            tools: [{ type: 'function', function: { name: 'foo', parameters: {} } }],
        })
        const call = create.mock.calls[0][0]
        expect(call.response_format).toBeUndefined()
        expect(call.tools).toBeDefined()
    })

    it('returns full message object when tools are provided', async () => {
        const toolCalls = [{ id: 't1', type: 'function', function: { name: 'foo', arguments: '{"x":1}' } }]
        _setClientForTests(mockClient(() => okResponse({ content: null, toolCalls })))
        const out = await aiComplete({
            systemPrompt: 'sys',
            userPrompt: 'usr',
            userId: nextUserId(),
            tools: [{ type: 'function', function: { name: 'foo', parameters: {} } }],
        })
        expect(out.tool_calls).toEqual(toolCalls)
    })

    it('passes through an explicit responseFormat (json_schema)', async () => {
        const create = vi.fn(() => okResponse())
        _setClientForTests(mockClient(create))
        const schema = { type: 'json_schema', json_schema: { name: 'X', schema: { type: 'object' } } }
        await aiComplete({
            systemPrompt: 'sys',
            userPrompt: 'usr',
            userId: nextUserId(),
            responseFormat: schema,
        })
        expect(create.mock.calls[0][0].response_format).toEqual(schema)
    })
})

// ── Retry behavior ──────────────────────────────────────────────────
describe('aiComplete — retry on transient errors', () => {
    it('retries once on a 429 then succeeds', async () => {
        vi.useFakeTimers()
        let callCount = 0
        const create = vi.fn(() => {
            callCount++
            if (callCount === 1) {
                throw new FakeApiError(429)
            }
            return okResponse()
        })
        _setClientForTests(mockClient(create))
        const promise = aiComplete({
            systemPrompt: 'sys',
            userPrompt: 'usr',
            userId: nextUserId(),
        })
        // Drive backoff timers forward.
        await vi.runAllTimersAsync()
        const result = await promise
        expect(result).toEqual({ ok: true })
        expect(create).toHaveBeenCalledTimes(2)
    })

    it('retries on 503 then succeeds', async () => {
        vi.useFakeTimers()
        let callCount = 0
        _setClientForTests(mockClient(() => {
            callCount++
            if (callCount === 1) throw new FakeApiError(503)
            return okResponse()
        }))
        const p = aiComplete({ systemPrompt: 's', userPrompt: 'u', userId: nextUserId() })
        await vi.runAllTimersAsync()
        await expect(p).resolves.toEqual({ ok: true })
    })

    it('throws after MAX_ATTEMPTS retries', async () => {
        vi.useFakeTimers()
        const create = vi.fn(() => { throw new FakeApiError(429) })
        _setClientForTests(mockClient(create))
        // Attach the rejection handler before driving timers so the
        // promise's rejection has a listener the moment it fires.
        const p = aiComplete({ systemPrompt: 's', userPrompt: 'u', userId: nextUserId() })
        const assertion = expect(p).rejects.toBeInstanceOf(AIError)
        await vi.runAllTimersAsync()
        await assertion
        expect(create).toHaveBeenCalledTimes(3)
    })

    it('does NOT retry on a non-retryable status (401)', async () => {
        const create = vi.fn(() => { throw new FakeApiError(401) })
        _setClientForTests(mockClient(create))
        const p = aiComplete({ systemPrompt: 's', userPrompt: 'u', userId: nextUserId() })
        await expect(p).rejects.toBeInstanceOf(AIError)
        expect(create).toHaveBeenCalledTimes(1)
    })

    it('does NOT retry on 400 (bad request)', async () => {
        const create = vi.fn(() => { throw new FakeApiError(400) })
        _setClientForTests(mockClient(create))
        await expect(
            aiComplete({ systemPrompt: 's', userPrompt: 'u', userId: nextUserId() }),
        ).rejects.toBeInstanceOf(AIError)
        expect(create).toHaveBeenCalledTimes(1)
    })
})

// ── Model fallback ──────────────────────────────────────────────────
describe('aiComplete — model fallback chain', () => {
    it('falls back to AI_MODEL_FAST when primary returns model_not_found', async () => {
        const create = vi.fn((args) => {
            if (args.model === 'gpt-5-imaginary') {
                throw new FakeApiError(404, 'model_not_found')
            }
            return okResponse()
        })
        _setClientForTests(mockClient(create))
        const result = await aiComplete({
            systemPrompt: 's',
            userPrompt: 'u',
            userId: nextUserId(),
            model: 'gpt-5-imaginary',
        })
        expect(result).toEqual({ ok: true })
        expect(create).toHaveBeenCalledTimes(2)
        expect(create.mock.calls[0][0].model).toBe('gpt-5-imaginary')
        expect(create.mock.calls[1][0].model).toBe('gpt-4o-mini') // AI_MODEL_FAST
    })

    it('does NOT fall back when the failing model is already AI_MODEL_FAST', async () => {
        const create = vi.fn(() => { throw new FakeApiError(404, 'model_not_found') })
        _setClientForTests(mockClient(create))
        const p = aiComplete({
            systemPrompt: 's',
            userPrompt: 'u',
            userId: nextUserId(),
            model: 'gpt-4o-mini',
        })
        await expect(p).rejects.toBeInstanceOf(AIError)
        expect(create).toHaveBeenCalledTimes(1)
    })
})

// ── Usage emission ──────────────────────────────────────────────────
describe('aiComplete — usage emission', () => {
    it('emits usage with surface, model, tokens, latency on success', async () => {
        _setClientForTests(mockClient(() => okResponse({
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        })))
        const seen = []
        const off = onUsageEvent((e) => seen.push(e))
        try {
            await aiComplete({
                systemPrompt: 's',
                userPrompt: 'u',
                userId: 'usage-user-1',
                surface: 'unit-test',
            })
        } finally {
            off()
        }
        expect(seen).toHaveLength(1)
        expect(seen[0]).toMatchObject({
            surface: 'unit-test',
            userId: 'usage-user-1',
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            usedFallback: false,
            errorCode: null,
        })
        expect(seen[0].latencyMs).toBeGreaterThanOrEqual(0)
    })

    it('emits usage with usedFallback=true when model fallback fired', async () => {
        const create = vi.fn((args) => {
            if (args.model === 'gpt-imaginary') throw new FakeApiError(404, 'model_not_found')
            return okResponse()
        })
        _setClientForTests(mockClient(create))
        const seen = []
        const off = onUsageEvent((e) => seen.push(e))
        try {
            await aiComplete({
                systemPrompt: 's',
                userPrompt: 'u',
                userId: nextUserId(),
                model: 'gpt-imaginary',
                surface: 'fallback-test',
            })
        } finally {
            off()
        }
        expect(seen).toHaveLength(1)
        expect(seen[0].usedFallback).toBe(true)
        expect(seen[0].modelRequested).toBe('gpt-imaginary')
        expect(seen[0].modelUsed).toBe('gpt-4o-mini')
    })

    it('emits usage with errorCode on failure', async () => {
        _setClientForTests(mockClient(() => { throw new FakeApiError(401) }))
        const seen = []
        const off = onUsageEvent((e) => seen.push(e))
        try {
            await aiComplete({
                systemPrompt: 's',
                userPrompt: 'u',
                userId: nextUserId(),
                surface: 'auth-fail',
            }).catch(() => {})
        } finally {
            off()
        }
        expect(seen).toHaveLength(1)
        expect(seen[0].errorCode).toBe('INVALID_API_KEY')
    })
})

// ── Rate limit ──────────────────────────────────────────────────────
describe('aiComplete — rate limit', () => {
    it('throws RATE_LIMITED before calling the client when the user is over the cap', async () => {
        // Burn through the limit for a synthetic user.
        const userId = `rl-${Date.now()}`
        const create = vi.fn(() => okResponse())
        _setClientForTests(mockClient(create))
        // Hammer until checkRateLimit reports not-allowed (50 per env default).
        for (let i = 0; i < 60; i++) {
            const r = checkRateLimit(userId)
            if (!r.allowed) break
            await aiComplete({
                systemPrompt: 's',
                userPrompt: 'u',
                userId,
            })
        }
        const r = checkRateLimit(userId)
        expect(r.allowed).toBe(false)
        // Next call must throw without invoking the client.
        const callsBefore = create.mock.calls.length
        await expect(
            aiComplete({ systemPrompt: 's', userPrompt: 'u', userId }),
        ).rejects.toMatchObject({ code: 'RATE_LIMITED' })
        expect(create.mock.calls.length).toBe(callsBefore)
    })
})

// ── aiStream — passthrough ──────────────────────────────────────────
describe('aiStream', () => {
    it('returns the stream object and forwards tools when provided', async () => {
        const fakeStream = { __isStream: true }
        const create = vi.fn(() => fakeStream)
        _setClientForTests(mockClient(create))
        const out = await aiStream({
            systemPrompt: 's',
            messages: [{ role: 'user', content: 'hi' }],
            userId: nextUserId(),
            tools: [{ type: 'function', function: { name: 'foo', parameters: {} } }],
            toolChoice: 'auto',
        })
        expect(out).toBe(fakeStream)
        const args = create.mock.calls[0][0]
        expect(args.stream).toBe(true)
        expect(args.tools).toBeDefined()
        expect(args.tool_choice).toBe('auto')
    })
})
