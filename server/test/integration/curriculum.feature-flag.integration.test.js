// ============================================================================
// curriculum FEATURE_CURRICULUM route guard — integration test (W6.T8)
// ============================================================================
//
// Regression coverage for the mount-level guard in
// `server/src/middleware/featureFlag.middleware.js`. When
// FEATURE_CURRICULUM=false, every request under `/curriculum` and
// `/curriculum/admin` must 404 — same shape as an unmounted route — so
// authenticated team members cannot burn AI budget by POSTing to
// `/labs/:id/attempts` or `/concepts/:slug/checkin` before the feature is
// flipped in production.
//
// Why we mount a MINI app here instead of importing `src/index.js`:
//   - `src/index.js` also boots WebSockets, MCP, and starts listening on
//     PORT via top-level side-effects. Importing it in a test is heavy and
//     racy across parallel tests.
//   - This test targets the mount-level guard, not the full route stack.
//     A mini app that mounts the guard + real router at the same prefix
//     exercises the exact contract that `src/index.js` sets up.
//
// The guard reads `process.env.FEATURE_CURRICULUM` on every request (not
// the cached export from `config/env.js`), so flipping the env var between
// tests is sufficient to swap behavior without module re-imports.
//
// No fixtures needed: the guard runs BEFORE `authenticate` inside each
// router (`router.use(authenticate, requireTeamContext)`), so we never
// touch the DB. The token below is a real JWT only so the "flag on" case
// can distinguish 404-from-guard vs. 401-from-auth (auth still fires when
// the guard passes).
//
// Prefix `test_w6t8_` — no persistent fixtures written, but kept for
// consistency with the other curriculum integration tests.
//
// Run:
//   cd server && npx vitest run test/integration/curriculum.feature-flag.integration.test.js
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { createServer } from "node:http";

import { requireFeatureCurriculum } from "../../src/middleware/featureFlag.middleware.js";
import curriculumRouter from "../../src/routes/curriculum.routes.js";
import curriculumAdminRouter from "../../src/routes/curriculumAdmin.routes.js";
import { errorHandler } from "../../src/middleware/error.middleware.js";

const TEST_TIMEOUT_MS = 30000;

let server;
let baseUrl;
let originalFlag;

beforeAll(async () => {
  // Preserve whatever env we inherit so afterAll can restore it — matters
  // for a developer workstation where FEATURE_CURRICULUM=true is set.
  originalFlag = process.env.FEATURE_CURRICULUM;

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // Mirror the mount order from src/index.js:
  //   requireFeatureCurriculum → (apiLimiter in prod) → router
  // We deliberately skip apiLimiter here — the guard behavior is
  // limiter-agnostic and adding it would leak inter-test rate state.
  //
  // NOTE: admin is registered FIRST, matching src/index.js.
  app.use(
    "/api/v1/curriculum/admin",
    requireFeatureCurriculum,
    curriculumAdminRouter,
  );
  app.use(
    "/api/v1/curriculum",
    requireFeatureCurriculum,
    curriculumRouter,
  );
  app.use(errorHandler);

  const httpServer = createServer(app);
  await new Promise((resolve) =>
    httpServer.listen(0, "127.0.0.1", resolve),
  );
  const { port } = httpServer.address();
  baseUrl = `http://127.0.0.1:${port}`;
  server = httpServer;
}, TEST_TIMEOUT_MS);

afterAll(async () => {
  // Restore the flag so a re-run of the whole suite doesn't inherit our
  // last-case value.
  if (originalFlag === undefined) {
    delete process.env.FEATURE_CURRICULUM;
  } else {
    process.env.FEATURE_CURRICULUM = originalFlag;
  }
  await new Promise((resolve) => server.close(resolve));
}, TEST_TIMEOUT_MS);

beforeEach(() => {
  // Default each test to "flag off" — the "flag on" case flips it back.
  process.env.FEATURE_CURRICULUM = "false";
});

async function get(path) {
  const res = await fetch(baseUrl + path, {
    method: "GET",
    headers: {
      // A bogus token — the guard runs BEFORE authenticate, so this token
      // is only consumed on the "flag on" case (where auth kicks in and
      // 401s). It is never validated when the guard 404s.
      Authorization: "Bearer bogus-token-value",
    },
  });
  return { status: res.status };
}

describe("curriculum FEATURE_CURRICULUM route guard", () => {
  it(
    "returns 404 on GET /api/v1/curriculum/topics when flag is off",
    async () => {
      const { status } = await get("/api/v1/curriculum/topics");
      expect(status).toBe(404);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "returns 404 on GET /api/v1/curriculum/admin/topics when flag is off",
    async () => {
      const { status } = await get("/api/v1/curriculum/admin/topics");
      expect(status).toBe(404);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "does NOT return 404 when flag is on (auth kicks in, so 401)",
    async () => {
      // With the guard open, the bogus JWT trips `authenticate` and
      // produces 401 — anything but 404 proves the guard let the request
      // through to the real router.
      process.env.FEATURE_CURRICULUM = "true";
      const { status } = await get("/api/v1/curriculum/topics");
      expect(status).not.toBe(404);
      expect(status).toBe(401);
    },
    TEST_TIMEOUT_MS,
  );
});
