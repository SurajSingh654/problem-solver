// ============================================================================
// Wire-level integration test factory
// ============================================================================
//
// Why this exists
// ───────────────
// The unit harness in test/controllers/_harness.js calls controllers directly
// with mocked req/res. That misses everything *between* Express body-parse
// and the controller — most importantly the `validate()` middleware. The
// bruteForceMeta-strip bug we shipped (Zod silently dropping unknown keys)
// passed every controller-level test because the test bypassed validate().
//
// This factory builds a minimal Express app that exercises the *real*
// middleware chain (json body-parser + validate() + the actual controller),
// so wire-level shape mismatches produce loud failures.
//
// What it stubs
// ─────────────
// - `authenticate` + `requireTeamContext` are replaced with no-op middlewares
//   that inject `req.user` + `req.teamId` from a test header. The real
//   versions touch the DB; we don't want to spin Postgres up for a unit run.
// - Everything else (rate limits, error handler, route mounting) is left
//   real, because that's what produces real-world behavior.
//
// The factory is intentionally test-scoped (no production code imports it).
// ============================================================================

import express from "express";
import { createServer } from "node:http";
import { errorHandler } from "../../src/middleware/error.middleware.js";

/**
 * Build an Express app with the given route module mounted at the given
 * prefix. The auth + team middleware are stubbed so tests can inject the
 * principal via the X-Test-User and X-Test-Team headers.
 *
 * @param {object} opts
 * @param {string} opts.prefix - e.g. "/api/solutions"
 * @param {import('express').Router} opts.router - the actual route module
 */
export function buildTestApp({ prefix, router }) {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  // Stub principal injection — mirrors authenticate + requireTeamContext.
  app.use((req, _res, next) => {
    const userHeader = req.headers["x-test-user"];
    const teamHeader = req.headers["x-test-team"];
    if (userHeader) {
      req.user = JSON.parse(String(userHeader));
    }
    if (teamHeader) {
      req.teamId = String(teamHeader);
    }
    next();
  });

  app.use(prefix, router);
  app.use(errorHandler);
  return app;
}

/**
 * Boot the app on an ephemeral port. Returns { url, close } where `url`
 * is the base origin (e.g. "http://127.0.0.1:54321") and `close()` shuts
 * the server down. Tests always call close in afterAll.
 *
 * Using a real socket (vs. invoking handlers in-process) means the test
 * exercises the full HTTP stack — JSON content-type negotiation, header
 * parsing, body chunking — so we catch contract bugs that pure handler
 * mocking would miss.
 */
export async function bootApp(app) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}`;
  return {
    url,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * Convenience wrapper around fetch that JSON-encodes the body and
 * decodes the JSON response, attaching the test principal headers.
 */
export async function call(url, method, path, body, principal) {
  const res = await fetch(url + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Test-User": JSON.stringify(principal.user),
      "X-Test-Team": principal.teamId,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, body: data };
}
