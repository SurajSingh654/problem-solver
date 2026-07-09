// ============================================================================
// asyncHandler — forward Promise rejections to Express's errorHandler
// ============================================================================
//
// Express 4 does NOT auto-catch rejections from async route handlers. Without
// a wrapper, a `throw` or `Promise.reject` inside an async controller:
//   - Never calls `next(err)`, so `errorHandler` never fires.
//   - Emits an `unhandledRejection` event on the Node process. Depending on
//     Node's flag, that can terminate the worker.
//   - Leaves the response un-sent — the client eventually times out with no
//     helpful body.
//
// This wrapper turns an async controller into a middleware that always calls
// `next(err)` on rejection. Apply at the route layer:
//
//   router.get("/topics", authenticate, requireTeamContext, asyncHandler(listTopics))
//
// Alternative: wrap every controller in try/catch. That's the pattern used
// in `curriculumAdmin.controller.js`. Both are valid — controllers can pick
// whichever is more readable for their surface. The learner-facing
// `curriculum.controller.js` uses this wrapper because its handlers are
// shorter and the extra try/catch noise-to-signal ratio was high.
// ============================================================================

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
