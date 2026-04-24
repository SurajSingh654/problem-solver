// ============================================================================
// ProbSolver v3.0 — Request Logger
// ============================================================================
//
// Structured logging with request IDs.
//
// Development: Human-readable colored output
// Production: JSON format for log aggregation and search
//
// Every log line includes the request ID so you can trace a single
// request through the entire lifecycle: received → processed → responded.
//
// ============================================================================
import morgan from "morgan";

// ── Custom tokens ────────────────────────────────────────

// Status with color (dev only)
morgan.token("status-color", (req, res) => {
  const status = res.statusCode;
  if (status >= 500) return `\x1b[31m${status}\x1b[0m`;
  if (status >= 400) return `\x1b[33m${status}\x1b[0m`;
  if (status >= 300) return `\x1b[36m${status}\x1b[0m`;
  return `\x1b[32m${status}\x1b[0m`;
});

// User ID from JWT (truncated for readability)
morgan.token("user-id", (req) => {
  return req.user?.id ? req.user.id.substring(0, 8) + "..." : "anon";
});

// Team ID
morgan.token("team-id", (req) => {
  return req.teamId ? req.teamId.substring(0, 8) + "..." : "none";
});

// Request ID (from requestId middleware)
morgan.token("request-id", (req) => {
  return req.requestId || "no-id";
});

// ── Development format: colored, human-readable ──────────
export const devLogger = morgan(
  ":request-id :method :url :status-color :response-time ms - user::user-id team::team-id",
  {
    skip: (req) => req.url === "/health",
  },
);

// ── Production format: JSON for log search ───────────────
export const prodLogger = morgan(
  (tokens, req, res) => {
    return JSON.stringify({
      requestId: tokens["request-id"](req, res),
      method: tokens.method(req, res),
      url: tokens.url(req, res),
      status: parseInt(tokens.status(req, res), 10),
      responseTime: parseFloat(tokens["response-time"](req, res)),
      user: tokens["user-id"](req, res),
      team: tokens["team-id"](req, res),
      timestamp: new Date().toISOString(),
    });
  },
  {
    skip: (req) => req.url === "/health",
  },
);
