// ============================================================================
// ProbSolver v3.0 — Request Logger
// ============================================================================
import morgan from "morgan";

// Custom token: response time with color
morgan.token("status-color", (req, res) => {
  const status = res.statusCode;
  if (status >= 500) return `\x1b[31m${status}\x1b[0m`;
  if (status >= 400) return `\x1b[33m${status}\x1b[0m`;
  if (status >= 300) return `\x1b[36m${status}\x1b[0m`;
  return `\x1b[32m${status}\x1b[0m`;
});

// Custom token: user ID from JWT (if available)
morgan.token("user-id", (req) => {
  return req.user?.id ? req.user.id.substring(0, 8) + "..." : "anon";
});

// Custom token: team ID
morgan.token("team-id", (req) => {
  return req.teamId ? req.teamId.substring(0, 8) + "..." : "none";
});

// Development format: colored, detailed
export const devLogger = morgan(
  ":method :url :status-color :response-time ms - user::user-id team::team-id",
  {
    skip: (req) => req.url === "/health",
  },
);

// Production format: JSON for log aggregation
export const prodLogger = morgan(
  '{"method":":method","url":":url","status"::status,"responseTime"::response-time,"user":":user-id","team":":team-id"}',
  {
    skip: (req) => req.url === "/health",
  },
);
