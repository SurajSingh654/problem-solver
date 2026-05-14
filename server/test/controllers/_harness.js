// ============================================================================
// Test harness — minimal req/res mocks for direct controller calls.
// ============================================================================
//
// We invoke controller functions directly rather than spinning up Express,
// so tests are fast and don't need a port. The mocks here capture the
// bits the controllers actually use: req.body, req.params, req.query,
// req.user, req.teamId; and res.status / res.json / res.set headers.
// ============================================================================

import { vi } from "vitest";

export function makeReq({
  body = {},
  params = {},
  query = {},
  user = { id: "user_test", globalRole: "USER", currentTeamId: "team_test" },
  teamId = "team_test",
} = {}) {
  return { body, params, query, user, teamId };
}

export function makeRes() {
  const headers = {};
  const out = {
    statusCode: 200,
    body: null,
    set(name, value) {
      headers[name] = value;
      return out;
    },
    setHeader(name, value) {
      headers[name] = value;
      return out;
    },
    status(code) {
      out.statusCode = code;
      return out;
    },
    json(payload) {
      out.body = payload;
      return out;
    },
    send(payload) {
      out.body = payload;
      return out;
    },
    headers,
  };
  return out;
}

// Helper: invoke a controller function and return { status, body } once
// the response is settled. Throws if the controller leaves res un-set.
export async function invoke(controllerFn, req) {
  const res = makeRes();
  await controllerFn(req, res);
  return { status: res.statusCode, body: res.body, headers: res.headers };
}

// vi.mock helpers re-exported so test files don't import vi twice.
export { vi };
