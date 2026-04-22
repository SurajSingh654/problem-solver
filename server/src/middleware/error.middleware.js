// ============================================================================
// ProbSolver v3.0 — Global Error Handler
// ============================================================================

import { IS_PRODUCTION } from "../config/env.js";

/**
 * Express global error handler.
 * Must have 4 parameters (err, req, res, next) for Express to recognize it.
 */
export function errorHandler(err, req, res, next) {
  console.error("Unhandled error:", err);

  // ── Prisma known errors ────────────────────────────
  if (err.code === "P2002") {
    return res.status(409).json({
      success: false,
      error: "A record with this data already exists.",
    });
  }

  if (err.code === "P2025") {
    return res.status(404).json({
      success: false,
      error: "Record not found.",
    });
  }

  // ── JSON parse errors ──────────────────────────────
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      error: "Invalid JSON in request body.",
    });
  }

  // ── Body too large ─────────────────────────────────
  if (err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      error: "Request body too large. Maximum size is 10MB.",
    });
  }

  // ── Default server error ───────────────────────────
  return res.status(err.status || 500).json({
    success: false,
    error: IS_PRODUCTION
      ? "An unexpected error occurred."
      : err.message || "An unexpected error occurred.",
  });
}
