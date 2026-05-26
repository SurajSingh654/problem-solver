// ============================================================================
// MCP capture-res — call existing HTTP controllers without HTTP
// ============================================================================
//
// Many of our existing controllers are HTTP-shaped: `(req, res) => ...`.
// They call `res.status(200).json({...})` to return data. To reuse them
// from MCP tool handlers (which don't have an HTTP res), we need a stub
// `res` that captures whatever the controller would have sent.
//
// This pattern is already used internally by `generateReadinessVerdict`
// in stats.controller.js. Externalized here so any MCP tool can use it
// without copy-pasting the same shim.
//
// USAGE:
//   import { makeCaptureRes, callController } from "./captureRes.js";
//
//   const result = await callController(get6DReport, {
//     user: { id: userId, ... },
//     teamId,
//   });
//   // result is the body the controller would have sent via res.json(...)
//
// WHY NOT just refactor controllers to (userId, teamId) → data?
//   That's the right long-term refactor — but it's a rewrite of every
//   controller. The capture-res pattern lets us reuse them today without
//   touching their signatures. If MCP usage grows, we can refactor case
//   by case.
//
// TRAP:
//   Some controllers call `res.status(N)` for non-200 errors. The capture
//   res records that, but tool handlers should check for it and translate
//   to MCP errors. See `callController()` for the convention.
// ============================================================================

/**
 * Build a stub Express response that captures status + body.
 */
export function makeCaptureRes() {
  const res = {
    _statusCode: 200,
    _body: null,
    _headers: {},
    status(code) {
      this._statusCode = code;
      return this;
    },
    json(body) {
      this._body = body;
      return this;
    },
    set(name, value) {
      this._headers[String(name).toLowerCase()] = value;
      return this;
    },
    setHeader(name, value) {
      return this.set(name, value);
    },
    sendStatus(code) {
      this._statusCode = code;
      return this;
    },
  };
  return res;
}

/**
 * Build a stub Express request shape that controllers expect.
 *
 * @param {object} opts
 * @param {{ id: string, globalRole?: string|null, currentTeamId?: string|null, teamRole?: string|null }} opts.user
 * @param {string|null} opts.teamId
 * @param {object} [opts.query]
 * @param {object} [opts.params]
 * @param {object} [opts.body]
 */
export function makeCaptureReq({ user, teamId, query = {}, params = {}, body = {} }) {
  return {
    user: {
      id: user.id,
      globalRole: user.globalRole ?? null,
      currentTeamId: user.currentTeamId ?? teamId ?? null,
      teamRole: user.teamRole ?? null,
    },
    teamId,
    query,
    params,
    body,
    headers: {},
    get(_name) {
      return undefined;
    },
  };
}

/**
 * Convenience — call a controller with a synthetic req/res, return the
 * captured body. Throws if the controller responded with a non-2xx
 * status (caller should translate to a tool-level error).
 *
 * @param {(req: object, res: object) => Promise<void>} controller
 * @param {Parameters<typeof makeCaptureReq>[0]} reqOpts
 * @returns {Promise<unknown>} the body the controller would have sent
 */
export async function callController(controller, reqOpts) {
  const req = makeCaptureReq(reqOpts);
  const res = makeCaptureRes();
  await controller(req, res);
  if (res._statusCode >= 400) {
    const message =
      (res._body && (res._body.error?.message || res._body.error || res._body.message))
      || `Controller returned ${res._statusCode}`;
    const err = new Error(message);
    err.status = res._statusCode;
    err.body = res._body;
    throw err;
  }
  return res._body;
}
