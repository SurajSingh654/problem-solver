/**
 * GLOBAL ERROR HANDLER
 * Catches all unhandled errors and returns consistent JSON.
 * Must be registered LAST in Express middleware chain.
 */
import { env } from "../config/env.js";

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // ── Detailed logging ─────────────────────────────
  console.error("─── Error Handler ───");
  console.error(`  Route:   ${req.method} ${req.originalUrl}`);
  console.error(`  Name:    ${err.name}`);
  console.error(`  Code:    ${err.code || "none"}`);
  console.error(`  Message: ${err.message}`);
  if (env.IS_DEV) {
    console.error(
      `  Stack:   ${err.stack?.split("\n").slice(0, 5).join("\n")}`,
    );
  }
  console.error("─────────────────────");

  // ── AI errors ────────────────────────────────────
  if (err.name === "AIError") {
    const statusMap = {
      RATE_LIMITED: 429,
      OPENAI_RATE_LIMITED: 429,
      INVALID_API_KEY: 500,
      OPENAI_DOWN: 503,
      EMPTY_RESPONSE: 500,
      PARSE_ERROR: 500,
      AI_ERROR: 500,
    };
    const status = statusMap[err.code] || 500;
    return res.status(status).json({
      success: false,
      error: err.message,
      code: err.code || "AI_ERROR",
    });
  }

  // ── Prisma errors ────────────────────────────────
  if (err.code === "P2002") {
    return res.status(409).json({
      success: false,
      error: "A record with this value already exists",
      code: "DUPLICATE",
    });
  }

  if (err.code === "P2025") {
    return res.status(404).json({
      success: false,
      error: "Record not found",
      code: "NOT_FOUND",
    });
  }

  // ── JWT errors ───────────────────────────────────
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      error: "Invalid token",
      code: "INVALID_TOKEN",
    });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      error: "Token expired — please log in again",
      code: "TOKEN_EXPIRED",
    });
  }

  // ── Zod validation errors ────────────────────────
  if (err.name === "ZodError") {
    return res.status(422).json({
      success: false,
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      errors: err.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
  }

  // ── Timeout / network errors ─────────────────────
  if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
    return res.status(503).json({
      success: false,
      error: "External service unavailable",
      code: "SERVICE_UNAVAILABLE",
    });
  }

  if (err.code === "ETIMEDOUT" || err.name === "AbortError") {
    return res.status(504).json({
      success: false,
      error: "Request timed out — try again",
      code: "TIMEOUT",
    });
  }

  // ── Default ──────────────────────────────────────
  const status = err.statusCode || err.status || 500;
  const message =
    env.IS_PROD && status === 500 ? "Internal server error" : err.message;

  return res.status(status).json({
    success: false,
    error: message,
    code: err.code || "SERVER_ERROR",
  });
}
