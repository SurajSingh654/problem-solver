// ============================================================================
// Basic eval metrics — surface-agnostic
// ============================================================================
//
// Five metrics every surface should track:
//   - error_rate         : fraction of runs that threw or returned error
//   - latency_ms         : p50 / p95 / max
//   - token_usage        : avg total tokens per call
//   - output_length      : char-length distribution (proxy for verbosity drift)
//   - assertions_passed  : if items declare assertions, how many passed
//
// Why these five and no others (yet):
//   - Cheap to compute, no LLM judge needed
//   - Catch the easy regressions before paying for harder metrics
//   - Decompose well — error_rate spike vs latency spike vs assertion fail
//     each point at a different root cause
// ============================================================================

export async function basicMetrics(results, _items) {
  const total = results.length;
  if (total === 0) return { note: "no results" };

  const errors = results.filter((r) => !!r.error);
  const ok = results.filter((r) => !r.error);

  const latencies = results.map((r) => r.latencyMs).filter(Number.isFinite);
  const lat = percentiles(latencies);

  const totals = ok
    .map((r) => r.tokens?.total)
    .filter((n) => Number.isFinite(n));
  const avgTokens = totals.length > 0 ? mean(totals) : null;

  const outputLengths = ok
    .map((r) => stringifySafe(r.output).length)
    .filter(Number.isFinite);
  const lenStats = percentiles(outputLengths);

  const assertionResults = scoreAssertions(results);

  return {
    error_rate: errors.length / total,
    latency_ms: lat,
    avg_total_tokens: avgTokens,
    output_length_chars: lenStats,
    assertions: assertionResults,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function percentiles(arr) {
  if (arr.length === 0) return { p50: null, p95: null, max: null };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    p50: pctile(sorted, 0.5),
    p95: pctile(sorted, 0.95),
    max: sorted[sorted.length - 1],
  };
}

function pctile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function mean(arr) {
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function stringifySafe(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return "";
  }
}

// Assertions are simple structural / textual checks declared per golden-set
// item. Supported shapes (extend as needed):
//   minLength, maxLength       → output's serialized form length
//   mustMention: [string, …]   → case-insensitive substring presence
//   mustNotMention: [string, …]
//   shape: ["key", "key.nested"] → output is an object containing these paths
function scoreAssertions(results) {
  let total = 0;
  let passed = 0;
  const failures = [];

  for (const r of results) {
    const a = r.assertions;
    if (!a) continue;
    const checks = enumerateChecks(a, r.output);
    for (const c of checks) {
      total++;
      if (c.pass) passed++;
      else failures.push({ id: r.id, check: c.name, detail: c.detail });
    }
  }

  return {
    total,
    passed,
    pass_rate: total === 0 ? null : passed / total,
    failures: failures.slice(0, 20),
  };
}

function enumerateChecks(assertions, output) {
  const checks = [];
  const text = stringifySafe(output);

  if (Number.isFinite(assertions.minLength)) {
    checks.push({
      name: "minLength",
      pass: text.length >= assertions.minLength,
      detail: `len=${text.length} expected≥${assertions.minLength}`,
    });
  }
  if (Number.isFinite(assertions.maxLength)) {
    checks.push({
      name: "maxLength",
      pass: text.length <= assertions.maxLength,
      detail: `len=${text.length} expected≤${assertions.maxLength}`,
    });
  }
  if (Array.isArray(assertions.mustMention)) {
    for (const phrase of assertions.mustMention) {
      checks.push({
        name: `mustMention:${phrase}`,
        pass: text.toLowerCase().includes(String(phrase).toLowerCase()),
        detail: `phrase="${phrase}"`,
      });
    }
  }
  if (Array.isArray(assertions.mustNotMention)) {
    for (const phrase of assertions.mustNotMention) {
      checks.push({
        name: `mustNotMention:${phrase}`,
        pass: !text.toLowerCase().includes(String(phrase).toLowerCase()),
        detail: `phrase="${phrase}"`,
      });
    }
  }
  if (Array.isArray(assertions.shape) && output && typeof output === "object") {
    for (const dottedKey of assertions.shape) {
      checks.push({
        name: `shape:${dottedKey}`,
        pass: hasPath(output, String(dottedKey)),
        detail: `path="${dottedKey}"`,
      });
    }
  }
  return checks;
}

function hasPath(obj, dotted) {
  const parts = dotted.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return false;
    if (!(p in cur)) return false;
    cur = cur[p];
  }
  return true;
}
