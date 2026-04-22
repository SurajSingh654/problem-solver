/**
 * AI SERVICE — OpenAI client, rate limiter, error handler
 * Single source of truth for all AI interactions.
 */
import OpenAI from "openai";

// ── Initialize OpenAI client ───────────────────────────
let openai = null;

function getClient() {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

// ── Rate limiter (per user per day) ────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT = parseInt(process.env.AI_RATE_LIMIT_PER_DAY || "30");

function getRateLimitKey(userId) {
  const today = new Date().toISOString().split("T")[0];
  return `${userId}:${today}`;
}

export function checkRateLimit(userId) {
  const key = getRateLimitKey(userId);
  const count = rateLimitMap.get(key) || 0;

  if (count >= RATE_LIMIT) {
    return {
      allowed: false,
      remaining: 0,
      limit: RATE_LIMIT,
    };
  }

  return {
    allowed: true,
    remaining: RATE_LIMIT - count,
    limit: RATE_LIMIT,
  };
}

function incrementRateLimit(userId) {
  const key = getRateLimitKey(userId);
  const count = rateLimitMap.get(key) || 0;
  rateLimitMap.set(key, count + 1);

  // Clean old keys every hour
  if (Math.random() < 0.01) {
    const today = new Date().toISOString().split("T")[0];
    for (const [k] of rateLimitMap) {
      if (!k.endsWith(today)) rateLimitMap.delete(k);
    }
  }
}

// ── Core completion function ───────────────────────────
export async function aiComplete({
  systemPrompt,
  userPrompt,
  userId,
  model = process.env.OPENAI_MODEL || "gpt-4o-mini",
  temperature = 0.7,
  maxTokens = 2000,
  jsonMode = true,
}) {
  const rateCheck = checkRateLimit(userId);
  if (!rateCheck.allowed) {
    throw new AIError(
      "RATE_LIMITED",
      `Daily AI limit reached (${RATE_LIMIT}/day).`,
    );
  }

  console.log(
    `[AI] Request: model=${model}, maxTokens=${maxTokens}, jsonMode=${jsonMode}`,
  );
  console.log(`[AI] System prompt length: ${systemPrompt.length} chars`);
  console.log(`[AI] User prompt length: ${userPrompt.length} chars`);

  try {
    const client = getClient();

    const response = await client.chat.completions.create({
      model,
      temperature,
      max_tokens: maxTokens,
      response_format: jsonMode ? { type: "json_object" } : undefined,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    incrementRateLimit(userId);

    const content = response.choices[0]?.message?.content;
    console.log(`[AI] Response received: ${content?.length || 0} chars`);
    console.log(`[AI] Usage: ${response.usage?.total_tokens || "?"} tokens`);

    if (!content) {
      throw new AIError("EMPTY_RESPONSE", "AI returned an empty response");
    }

    if (jsonMode) {
      try {
        const parsed = JSON.parse(content);
        console.log(`[AI] Parsed JSON keys: ${Object.keys(parsed).join(", ")}`);
        return parsed;
      } catch (e) {
        console.error(
          `[AI] JSON parse failed. Raw content:`,
          content.slice(0, 300),
        );
        throw new AIError("PARSE_ERROR", "AI response was not valid JSON");
      }
    }

    return content;
  } catch (error) {
    if (error instanceof AIError) throw error;

    console.error(
      `[AI] OpenAI error: status=${error?.status}, message=${error?.message}`,
    );

    if (error?.status === 429) {
      throw new AIError(
        "OPENAI_RATE_LIMITED",
        "OpenAI rate limit hit. Wait and retry.",
      );
    }
    if (error?.status === 401) {
      throw new AIError("INVALID_API_KEY", "OpenAI API key is invalid.");
    }
    if (error?.status === 500 || error?.status === 503) {
      throw new AIError("OPENAI_DOWN", "OpenAI is temporarily unavailable.");
    }

    throw new AIError("AI_ERROR", `AI request failed: ${error.message}`);
  }
}

// ── Streaming completion (for chat/interviewer) ────────
export async function aiStream({
  systemPrompt,
  messages,
  userId,
  model = process.env.OPENAI_MODEL || "gpt-4o-mini",
  temperature = 0.7,
  maxTokens = 1500,
}) {
  const rateCheck = checkRateLimit(userId);
  if (!rateCheck.allowed) {
    throw new AIError(
      "RATE_LIMITED",
      `Daily AI limit reached (${RATE_LIMIT}/day). Try again tomorrow.`,
    );
  }

  const client = getClient();

  const stream = await client.chat.completions.create({
    model,
    temperature,
    max_tokens: maxTokens,
    stream: true,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
  });

  incrementRateLimit(userId);
  return stream;
}

// ── Custom AI error class ──────────────────────────────
export class AIError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AIError";
    this.code = code;
  }
}

// ── Check if AI is enabled ─────────────────────────────
export function isAIEnabled() {
  return process.env.AI_ENABLED === "true" && !!process.env.OPENAI_API_KEY;
}
