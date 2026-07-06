// ============================================================================
// logger.js — minimal JSON-stdout structured logger
// ============================================================================
//
// A tiny structured-logging primitive used for post-ship telemetry events
// (e.g. `signal_shift_delta`, `reveal_reference_verdict`,
// `teachingReady_flipped`, `checkin_gate_blocked`).
//
// Why not pino / winston?
//   - Zero new deps (per convention). Prod log aggregation captures stdout.
//   - The morgan-based request logger in `middleware/logger.middleware.js`
//     handles HTTP access logs; this is a separate primitive for
//     application-domain events.
//
// Shape: every line is a single-line JSON object:
//   { level, ts, msg, ...obj }
//
// Callers pass `{ event, ...fields }` as the first arg and a short human
// tag as the second (mirrors pino ergonomics for future migration).
// ============================================================================

function emit(level, obj, msg) {
  const line = JSON.stringify({
    level,
    ts: new Date().toISOString(),
    msg,
    ...obj,
  });
  if (level === "error") console.error(line);
  else console.log(line);
}

const logger = {
  info: (obj, msg) => emit("info", obj, msg),
  warn: (obj, msg) => emit("warn", obj, msg),
  error: (obj, msg) => emit("error", obj, msg),
};

export default logger;
