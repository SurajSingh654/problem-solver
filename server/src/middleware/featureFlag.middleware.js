// ============================================================================
// Feature-flag route guards
// ============================================================================
//
// Curriculum routes are mounted unconditionally in src/index.js so that the
// route surface is stable across restarts, but the guard here short-circuits
// requests with a 404 (the same shape an unmounted route produces) whenever
// FEATURE_CURRICULUM is off.
//
// Why 404 and not 403:
//   - The learner routes on `GET /curriculum/topics` return empty in prod
//     today because there's no PUBLISHED content — no signal to an
//     attacker that the surface exists.
//   - The AI-facing writes (`POST /labs/:id/attempts`,
//     `POST /concepts/:slug/checkin`) can burn per-user-per-day AI budget
//     even when the caller doesn't own the content. Returning 404
//     matches the "route is not mounted" contract and closes that vector.
//
// Why read `process.env` on every request instead of the imported
// FEATURE_CURRICULUM constant from `config/env.js`:
//   - The constant is bound once at module load. Integration tests need to
//     flip the flag between cases without re-importing the middleware.
//     Reading `process.env` on each request keeps the guard testable and
//     costs ~ns per request. Production sets the env var once at boot, so
//     there's no material difference vs. reading the cached constant.
// ============================================================================

/**
 * Guards curriculum routes behind FEATURE_CURRICULUM. When the flag is off,
 * every request under the mounted prefix returns 404 (same shape as an
 * unmounted route) — this closes the AI-quota abuse vector where an
 * authenticated team member could POST to /labs/:id/attempts before the
 * feature is flipped in production.
 */
export function requireFeatureCurriculum(req, res, next) {
  if (process.env.FEATURE_CURRICULUM !== "true") {
    return res.status(404).json({
      success: false,
      error: { message: "Not found." },
    });
  }
  next();
}
