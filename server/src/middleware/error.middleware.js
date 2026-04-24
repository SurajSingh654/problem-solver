// ============================================================================
// ProbSolver v3.0 — Global Error Handler
// ============================================================================
//
// Every unhandled error includes the request ID in the response
// so users can report it and we can trace it in logs.
//
// ============================================================================
import { IS_PRODUCTION } from "../config/env.js";

export function errorHandler(err, req, res, next) {
  const requestId = req.requestId || "unknown";

  // Log with request ID for traceability
  console.error(`[${requestId}] Unhandled error:`, {
    message: err.message,
    code: err.code,
    stack: IS_PRODUCTION ? undefined : err.stack,
    url: req.originalUrl,
    method: req.method,
    userId: req.user?.id,
  });

  // ── Prisma known errors ────────────────────────────
  if (err.code === "P2002") {
    return res.status(409).json({
      success: false,
      error: {
        message: "A record with this data already exists.",
        code: "DUPLICATE_RECORD",
        requestId,
      },
    });
  }

  if (err.code === "P2025") {
    return res.status(404).json({
      success: false,
      error: {
        message: "Record not found.",
        code: "NOT_FOUND",
        requestId,
      },
    });
  }

  // ── JSON parse errors ──────────────────────────────
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      error: {
        message: "Invalid JSON in request body.",
        code: "INVALID_JSON",
        requestId,
      },
    });
  }

  // ── Body too large ─────────────────────────────────
  if (err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      error: {
        message: "Request body too large. Maximum size is 10MB.",
        code: "PAYLOAD_TOO_LARGE",
        requestId,
      },
    });
  }

  // ── Default server error ───────────────────────────
  return res.status(err.status || 500).json({
    success: false,
    error: {
      message: IS_PRODUCTION
        ? "An unexpected error occurred."
        : err.message || "An unexpected error occurred.",
      code: "INTERNAL_ERROR",
      requestId,
    },
  });
}
