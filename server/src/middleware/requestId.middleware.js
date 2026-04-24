// ============================================================================
// ProbSolver v3.0 — Request ID Middleware
// ============================================================================
//
// Generates a unique request ID for every incoming request.
// The ID is:
// 1. Attached to req.requestId (available to all downstream handlers)
// 2. Set as X-Request-Id response header (visible in browser DevTools)
// 3. Included in all log lines for this request
// 4. Included in error responses (for user support)
//
// Format: "req_" + timestamp(base36) + random(6 chars)
// Example: "req_m2k8f9_a7x3p1"
// Short enough to share in a support message, unique enough to never collide.
//
// ============================================================================
import crypto from "crypto";

export function requestIdMiddleware(req, res, next) {
  // Accept client-provided ID (for tracing across services) or generate one
  const clientId = req.headers["x-request-id"];
  const requestId = clientId || generateRequestId();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  next();
}

function generateRequestId() {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(3).toString("hex");
  return `req_${timestamp}_${random}`;
}
