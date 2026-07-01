// ============================================================================
// AI SERVICE — single entry point for every OpenAI call on the platform
// ============================================================================
//
// Responsibilities:
//   1. Client lifecycle (lazy singleton).
//   2. Per-user-per-day rate limiting (in-memory).
//   3. Retry on transient OpenAI errors (429 / 5xx / Retry-After).
//   4. Model fallback chain (primary → fast on model_not_found).
//   5. Structured-output + tool-call passthrough for callers that need them.
//   6. Error normalization into AIError so controllers don't reinvent it.
//   7. Usage emission via EventEmitter so Phase 5 of the AI Prompts Overhaul
//      can subscribe and persist to the UsageTracking table without changes
//      here.
//
// Caller-visible API surface (BACKWARD COMPATIBLE):
//   • aiComplete({ systemPrompt, userPrompt, userId, ... })
//       Returns parsed JSON when jsonMode=true (default), raw string when
//       jsonMode=false. Existing callers see no behavior change.
//   • aiStream({ systemPrompt, messages, userId, ... })
//       Returns the OpenAI streaming response unchanged.
//   • New optional fields:
//       - tools, toolChoice          → enable tool/function calling.
//       - responseFormat             → pass an explicit json_schema or other
//                                      response_format payload to the API.
//       - returnFullMessage=true     → return the full message object
//                                      (including tool_calls). Implied when
//                                      tools is provided.
//       - surface                    → free-form label used in usage events.
//
// ============================================================================
import OpenAI from "openai";
import { EventEmitter } from "node:events";
import {
    OPENAI_API_KEY,
    AI_MODEL_FAST,
    AI_DAILY_LIMIT,
    AI_MAX_TOKENS_HARD_CAP,
    AI_REQUEST_TIMEOUT_MS,
    FEATURE_PERSIST_RATE_LIMITER,
} from "../config/env.js";
import * as inMemLimiter from "./ai.rateLimiter.inMemory.js";
import * as pgLimiter from "./ai.rateLimiter.postgres.js";

// ── Initialize OpenAI client (lazy singleton) ───────────────────────
let openai = null;

function getClient() {
    if (!openai) {
        if (!OPENAI_API_KEY) {
            throw new Error("OPENAI_API_KEY is not set");
        }
        // timeout: bound a single OpenAI call so a stuck request can't hold a
        // Node worker. maxRetries: 0 because callWithRetry below does retries
        // itself with backoff + Retry-After awareness.
        openai = new OpenAI({
            apiKey: OPENAI_API_KEY,
            timeout: AI_REQUEST_TIMEOUT_MS,
            maxRetries: 0,
        });
    }
    return openai;
}

// Test hook — allows test code to inject a mock client without env vars.
// Not exported on the public surface; callers in src/ MUST go through
// aiComplete / aiStream so retry, rate-limit, and usage emission apply.
export function _setClientForTests(mock) {
    openai = mock;
}

// ── Rate limiter dispatch (per-user per-day, backend selected by flag) ──
//
// FEATURE_PERSIST_RATE_LIMITER="true" (case-insensitive) → Postgres backend
// (persists across replicas; source of truth). Otherwise → in-memory backend
// (per-process Map; current default, works only at single-replica).
//
// Both backends expose async {check, increment} with identical semantics
// and return shapes so callers don't care which one is active.
//
// AI_DAILY_LIMIT is still consumed inside each backend module directly.
// The RATE_LIMIT alias below is preserved for the RATE_LIMITED error message.
const RATE_LIMIT = AI_DAILY_LIMIT;

function activeLimiter() {
    const flag = String(FEATURE_PERSIST_RATE_LIMITER ?? "").trim().toLowerCase();
    return flag === "true" ? pgLimiter : inMemLimiter;
}

export async function checkRateLimit(userId) {
    return activeLimiter().check(userId);
}

async function incrementRateLimit(userId) {
    return activeLimiter().increment(userId);
}

// ── Retry on transient errors ───────────────────────────────────────
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_CAP_MS = 30_000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attemptIdx, retryAfterHeader) {
    if (retryAfterHeader != null) {
        const seconds = parseInt(retryAfterHeader, 10);
        if (Number.isFinite(seconds) && seconds > 0) {
            return Math.min(seconds * 1000, BACKOFF_CAP_MS);
        }
    }
    return Math.min(BACKOFF_BASE_MS * Math.pow(2, attemptIdx), BACKOFF_CAP_MS);
}

function getRetryAfter(err) {
    return (
        err?.response?.headers?.["retry-after"] ??
        err?.headers?.["retry-after"] ??
        err?.responseHeaders?.["retry-after"] ??
        null
    );
}

async function callWithRetry(operation, label = "ai") {
    let lastErr;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
            return await operation();
        } catch (err) {
            lastErr = err;
            const status = err?.status ?? err?.response?.status;
            if (!RETRYABLE_STATUSES.has(status)) throw err;
            if (attempt === MAX_ATTEMPTS - 1) throw err;
            const delay = backoffDelay(attempt, getRetryAfter(err));
            console.warn(
                `[AI] ${label} retryable error status=${status} attempt=${attempt + 1}/${MAX_ATTEMPTS} sleep=${delay}ms`,
            );
            await sleep(delay);
        }
    }
    throw lastErr;
}

// ── Model fallback ──────────────────────────────────────────────────
// If the requested model is unavailable (404 / model_not_found) and it
// isn't already AI_MODEL_FAST, retry once with AI_MODEL_FAST. Returns
// { response, modelUsed } so the caller can record which model actually
// served the request (important for usage attribution).
async function callWithModelFallback(buildRequest, primaryModel, label = "ai") {
    const client = getClient();
    try {
        const response = await callWithRetry(
            () => client.chat.completions.create(buildRequest(primaryModel)),
            `${label}:${primaryModel}`,
        );
        return { response, modelUsed: primaryModel };
    } catch (err) {
        const code = err?.code ?? err?.error?.code ?? "";
        const status = err?.status ?? err?.response?.status;
        const isModelMissing =
            status === 404 || code === "model_not_found" || code === "model_not_available";
        if (isModelMissing && primaryModel !== AI_MODEL_FAST) {
            console.warn(
                `[AI] ${label} primary model "${primaryModel}" unavailable (${code || status}); falling back to "${AI_MODEL_FAST}"`,
            );
            try {
                const response = await callWithRetry(
                    () => client.chat.completions.create(buildRequest(AI_MODEL_FAST)),
                    `${label}:${AI_MODEL_FAST}-fallback`,
                );
                return { response, modelUsed: AI_MODEL_FAST };
            } catch (fallbackErr) {
                const fbCode = fallbackErr?.code ?? fallbackErr?.error?.code ?? fallbackErr?.status ?? "unknown";
                console.warn(
                    `[AI] ${label} fast-fallback "${AI_MODEL_FAST}" also failed (${fbCode}); rethrowing`,
                );
                // Annotate so aiComplete's outer catch can attribute the
                // failure to the secondary (AI_MODEL_FAST), not the primary.
                // Standard JS pattern — mirrors Node core's err.code / errno.
                fallbackErr.modelUsed = AI_MODEL_FAST;
                throw fallbackErr;
            }
        }
        // Primary failed with a non-model-missing error — fast fallback was
        // never attempted. Annotate symmetrically so telemetry is consistent.
        err.modelUsed = primaryModel;
        throw err;
    }
}

// In tests the AI service runs through hundreds of mocked calls; the
// per-call `[AI] request` and `[AI] usage` console.log lines drown the
// real test output. Keep them in dev/prod, suppress in test (vitest
// sets `VITEST=true` automatically).
const IS_TEST_ENV =
    process.env.NODE_ENV === "test" || !!process.env.VITEST;
const aiLog = IS_TEST_ENV ? () => {} : (...args) => console.log(...args);

// ── Usage event emitter ─────────────────────────────────────────────
// Phase 5 of the overhaul subscribes here and writes rows into the
// UsageTracking table. Today the only built-in subscriber is the
// console-log tap below. Failures inside subscribers MUST NOT break
// the API call — they're caught and logged.
const usageEmitter = new EventEmitter();
usageEmitter.setMaxListeners(50);

export function onUsageEvent(handler) {
    usageEmitter.on("usage", handler);
    return () => usageEmitter.off("usage", handler);
}

// Built-in tap — keeps the existing `[AI] Usage: N tokens` log line that
// callers and ops eyeballed before this overhaul.
usageEmitter.on("usage", (e) => {
    if (e.errorCode) {
        // Errors stay visible even in tests — they signal real issues.
        if (!IS_TEST_ENV) {
            console.warn(
                `[AI] usage surface=${e.surface || "?"} model=${e.modelUsed} latency=${e.latencyMs}ms error=${e.errorCode}`,
            );
        }
        return;
    }
    aiLog(
        `[AI] usage surface=${e.surface || "?"} model=${e.modelUsed} tokens=${e.totalTokens} (p=${e.promptTokens}/c=${e.completionTokens}) latency=${e.latencyMs}ms`,
    );
});

function emitUsage(payload) {
    try {
        usageEmitter.emit("usage", payload);
    } catch (err) {
        console.error("[AI] usage emitter handler threw:", err?.message);
    }
}

// ── Core completion ─────────────────────────────────────────────────
export async function aiComplete({
    systemPrompt,
    userPrompt,
    userId,
    teamId,
    model = AI_MODEL_FAST,
    temperature = 0.7,
    maxTokens = 2000,
    jsonMode = true,
    fewShotMessages = [],
    // New (P1) — all opt-in:
    tools,
    toolChoice,
    responseFormat,
    returnFullMessage = false,
    surface,
}) {
    const rateCheck = await checkRateLimit(userId);
    if (!rateCheck.allowed) {
        throw new AIError(
            "RATE_LIMITED",
            `Daily AI limit reached (${RATE_LIMIT}/day).`,
        );
    }

    // When tools are passed the caller almost certainly needs the full
    // message (tool_calls live there), so flip returnFullMessage on
    // unless explicitly disabled.
    const wantFullMessage = returnFullMessage || !!tools;

    // response_format: explicit override > json_object (when jsonMode + no
    // tools) > none. Tool calling and json_object don't combine — when
    // tools are present we drop json_object so the API doesn't reject it.
    const finalResponseFormat = (() => {
        if (responseFormat) return responseFormat;
        if (jsonMode && !tools) return { type: "json_object" };
        return undefined;
    })();

    // Hard ceiling to prevent runaway cost from a misconfigured caller.
    // Logs a warning so the call site can be fixed if the clamp is reached.
    const cappedMaxTokens = Math.min(maxTokens, AI_MAX_TOKENS_HARD_CAP);
    if (cappedMaxTokens < maxTokens) {
        console.warn(
            `[AI] surface=${surface || "?"} requested maxTokens=${maxTokens}, clamped to ${cappedMaxTokens} (cap=${AI_MAX_TOKENS_HARD_CAP})`,
        );
    }

    aiLog(
        `[AI] request surface=${surface || "?"} model=${model} maxTokens=${cappedMaxTokens} jsonMode=${jsonMode} fewShot=${fewShotMessages.length} tools=${tools ? tools.length : 0}`,
    );

    const buildRequest = (m) => ({
        model: m,
        temperature,
        max_tokens: cappedMaxTokens,
        response_format: finalResponseFormat,
        messages: [
            { role: "system", content: systemPrompt },
            ...fewShotMessages,
            { role: "user", content: userPrompt },
        ],
        ...(tools ? { tools, ...(toolChoice ? { tool_choice: toolChoice } : {}) } : {}),
    });

    const t0 = Date.now();
    try {
        const { response, modelUsed } = await callWithModelFallback(
            buildRequest,
            model,
            surface || "complete",
        );
        await incrementRateLimit(userId);

        const message = response.choices?.[0]?.message;
        const content = message?.content;
        const latencyMs = Date.now() - t0;

        emitUsage({
            surface,
            userId,
            teamId,
            modelRequested: model,
            modelUsed,
            promptTokens: response.usage?.prompt_tokens ?? 0,
            completionTokens: response.usage?.completion_tokens ?? 0,
            totalTokens: response.usage?.total_tokens ?? 0,
            latencyMs,
            usedFallback: modelUsed !== model,
            errorCode: null,
        });

        if (wantFullMessage) {
            // Caller will inspect tool_calls / content themselves.
            return message;
        }

        if (!content) {
            throw new AIError("EMPTY_RESPONSE", "AI returned an empty response");
        }

        if (jsonMode) {
            try {
                return JSON.parse(content);
            } catch {
                console.error(
                    `[AI] JSON parse failed. Raw content:`,
                    content.slice(0, 300),
                );
                throw new AIError("PARSE_ERROR", "AI response was not valid JSON");
            }
        }

        return content;
    } catch (err) {
        const latencyMs = Date.now() - t0;
        const code = mapErrorToCode(err);
        // callWithModelFallback annotates err.modelUsed with the model that
        // was actually last-attempted (primary on direct failure, AI_MODEL_FAST
        // on fast-fallback failure). Defensive ?? model fallback handles paths
        // that don't go through the helper (e.g. checkRateLimit throwing
        // RATE_LIMITED before any HTTP call).
        const modelUsed = err?.modelUsed ?? model;
        emitUsage({
            surface,
            userId,
            teamId,
            modelRequested: model,
            modelUsed,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            latencyMs,
            usedFallback: modelUsed !== model,
            errorCode: code,
        });
        if (err instanceof AIError) throw err;
        throw new AIError(code, err.message || "AI request failed");
    }
}

// ── Streaming completion ────────────────────────────────────────────
export async function aiStream({
    systemPrompt,
    messages,
    userId,
    teamId,
    model = AI_MODEL_FAST,
    temperature = 0.7,
    maxTokens = 1500,
    // New (P1):
    tools,
    toolChoice,
    surface,
}) {
    const rateCheck = await checkRateLimit(userId);
    if (!rateCheck.allowed) {
        throw new AIError(
            "RATE_LIMITED",
            `Daily AI limit reached (${RATE_LIMIT}/day). Try again tomorrow.`,
        );
    }

    const cappedMaxTokens = Math.min(maxTokens, AI_MAX_TOKENS_HARD_CAP);
    if (cappedMaxTokens < maxTokens) {
        console.warn(
            `[AI] surface=${surface || "?"} requested maxTokens=${maxTokens}, clamped to ${cappedMaxTokens} (cap=${AI_MAX_TOKENS_HARD_CAP})`,
        );
    }

    const client = getClient();
    const t0 = Date.now();
    try {
        const stream = await callWithRetry(
            () =>
                client.chat.completions.create({
                    model,
                    temperature,
                    max_tokens: cappedMaxTokens,
                    stream: true,
                    messages: [{ role: "system", content: systemPrompt }, ...messages],
                    ...(tools ? { tools, ...(toolChoice ? { tool_choice: toolChoice } : {}) } : {}),
                }),
            `${surface || "stream"}:${model}`,
        );
        await incrementRateLimit(userId);
        // Token counts aren't known at stream-open time; emit a lightweight
        // event recording the open. Subscribers that care about totals can
        // listen for downstream chunks themselves.
        emitUsage({
            surface,
            userId,
            teamId,
            modelRequested: model,
            modelUsed: model,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            latencyMs: Date.now() - t0,
            usedFallback: false,
            errorCode: null,
            stream: true,
        });
        return stream;
    } catch (err) {
        const code = mapErrorToCode(err);
        emitUsage({
            surface,
            userId,
            teamId,
            modelRequested: model,
            modelUsed: model,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            latencyMs: Date.now() - t0,
            usedFallback: false,
            errorCode: code,
            stream: true,
        });
        if (err instanceof AIError) throw err;
        throw new AIError(code, err.message || "AI stream request failed");
    }
}

// ── Error normalization ─────────────────────────────────────────────
function mapErrorToCode(err) {
    const status = err?.status ?? err?.response?.status;
    if (err instanceof AIError) return err.code;
    if (status === 429) return "OPENAI_RATE_LIMITED";
    if (status === 401) return "INVALID_API_KEY";
    if (status === 500 || status === 502 || status === 503 || status === 504)
        return "OPENAI_DOWN";
    if (status === 408) return "OPENAI_TIMEOUT";
    return "AI_ERROR";
}

// ── Custom error class ──────────────────────────────────────────────
export class AIError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "AIError";
        this.code = code;
    }
}

// ── Feature gate ────────────────────────────────────────────────────
export function isAIEnabled() {
    return process.env.AI_ENABLED === "true" && !!process.env.OPENAI_API_KEY;
}
