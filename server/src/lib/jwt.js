// ============================================================================
// ProbSolver v3.0 — JWT Utilities
// ============================================================================
//
// DESIGN DECISIONS:
//
// 1. Token payload: Contains the minimum needed for auth middleware
//    to make access control decisions WITHOUT a database query:
//    { id, globalRole, currentTeamId, teamRole }
//    This means every protected endpoint knows the user's platform role
//    and team context from the token alone. [2]
//
// 2. Token size: We keep the payload small (~200 bytes) because
//    the JWT travels on every HTTP request in the Authorization header.
//    Large payloads (e.g., embedding full user profile) waste bandwidth
//    on every API call. Detailed user data is fetched as needed.
//
// 3. Two token types: Access token (short-lived, 7d default) for API
//    calls. We're NOT implementing refresh tokens in v3.0 to keep
//    complexity manageable — the 7d expiry is a reasonable tradeoff
//    for an internal/team tool. Refresh tokens can be added later
//    when we scale to public SaaS. [2]
//
// 4. Team context in token: When a user switches teams, we issue
//    a NEW token with the updated currentTeamId and teamRole.
//    This avoids stale team context in long-lived tokens.
//
// 5. Version field: Token includes a `v` field (schema version).
//    If we change the token structure in the future, middleware can
//    reject old-format tokens and force re-login gracefully.
//
// ============================================================================

import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_EXPIRY } from "../config/env.js";

const TOKEN_VERSION = 3; // v3.0 schema

/**
 * Generate an access token for a user.
 *
 * @param {Object} user - User record from database
 * @param {string} user.id
 * @param {string} user.globalRole - SUPER_ADMIN | USER
 * @param {string|null} user.currentTeamId - Active team (null = individual/no team)
 * @param {string|null} user.teamRole - TEAM_ADMIN | MEMBER | null
 * @returns {string} Signed JWT
 */
export function generateToken(user) {
  const payload = {
    id: user.id,
    globalRole: user.globalRole,
    currentTeamId: user.currentTeamId || null,
    teamRole: user.teamRole || null,
    v: TOKEN_VERSION,
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/**
 * Verify and decode a token.
 *
 * @param {string} token - JWT string
 * @returns {Object} Decoded payload
 * @throws {jwt.JsonWebTokenError} If invalid or expired
 */
export function verifyToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET);

  // Reject tokens from older schema versions — force re-login
  if (!decoded.v || decoded.v < TOKEN_VERSION) {
    const err = new Error("Token version outdated. Please log in again.");
    err.name = "TokenVersionError";
    throw err;
  }

  return decoded;
}

/**
 * Decode a token WITHOUT verification (for debugging/logging only).
 * Never use this for auth decisions.
 *
 * @param {string} token
 * @returns {Object|null} Decoded payload or null
 */
export function decodeToken(token) {
  try {
    return jwt.decode(token);
  } catch {
    return null;
  }
}
