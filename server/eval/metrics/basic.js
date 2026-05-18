// ============================================================================
// Basic eval metrics — surface-agnostic
// ============================================================================
//
// Surface-agnostic aggregates over the runner's results array.
//
//   error_rate         : fraction of runs that threw or returned error
//   latency_ms         : p50 / p95 / max, overall + sliced by tag
//   tokens             : avg prompt / completion / total
//   cost_usd           : avg / total cost across the run
//   output_length_chars: char-length distribution (proxy for verbosity drift)
//   assertions         : declarative-check pass rate + failure samples
//
// Why these and no others (yet):
//   - Cheap to compute, no LLM judge needed
//   - Catch the easy regressions before paying for harder metrics
//   - Decompose well — error_rate spike vs latency spike vs assertion fail
//     each point at a different root cause
//   - Tag slicing lets you see if adversarial cases regress while typical
//     cases stay flat (a frequent failure mode of prompt edits)
// ============================================================================

export async function basicMetrics(results, _items) {
  const total = results.length;
  if (total === 0) return { note: "no results" };

  const errors = results.filter((r) => !!r.error);
  const ok = results.filter((r) => !r.error);

  const latencies = results.map((r) => r.latencyMs).filter(Number.isFinite);
  const lat = percentiles(latencies);

  // Token / cost aggregates from the usage emitter (when surface adapter
  // captured it). Some surfaces won't have these yet — null gracefully.
  const tokenSamples = ok
    .map((r) => r.tokens)
    .filter((t) => t && Number.isFinite(t.totalTokens));
  const tokens = tokenSamples.length === 0
    ? null
    : {
      avg_prompt: mean(tokenSamples.map((t) => t.promptTokens)),
      avg_completion: mean(tokenSamples.map((t) => t.completionTokens)),
      avg_total: mean(tokenSamples.map((t) => t.totalTokens)),
      models: distinct(tokenSamples.map((t) => t.modelUsed).filter(Boolean)),
    };

  const costSamples = tokenSamples
    .map((t) => t.costUsd)
    .filter(Number.isFinite);
  const cost = costSamples.length === 0
    ? null
    : {
      avg_usd: mean(costSamples),
      total_usd: sum(costSamples),
      // Project to 1k calls — easier to reason about than 5-call totals.
      projected_per_1k_usd: mean(costSamples) * 1000,
    };

  const outputLengths = ok
    .map((r) => stringifySafe(r.output).length)
    .filter(Number.isFinite);
  const lenStats = percentiles(outputLengths);

  const assertionResults = scoreAssertions(results);

  // Tag slicing. For each unique tag, compute the same key metrics over
  // just the items carrying that tag. Reveals regressions concentrated
  // in (e.g.) "adversarial" or "long" cases.
  const byTag = sliceByTag(results);

  return {
    error_rate: errors.length / total,
    latency_ms: lat,
    tokens,
    cost_usd: cost,
    output_length_chars: lenStats,
    assertions: assertionResults,
    by_tag: byTag,
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
  const xs = arr.filter(Number.isFinite);
  if (xs.length === 0) return null;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function sum(arr) {
  return arr.filter(Number.isFinite).reduce((s, x) => s + x, 0);
}

function distinct(arr) {
  return [...new Set(arr)];
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

// Per-tag summary of the metrics that move most under prompt changes.
// Less verbose than the top-level (no assertion details, no token
// breakdown) — meant to be scanned, not analyzed line-by-line.
function sliceByTag(results) {
  const tagToResults = new Map();
  for (const r of results) {
    for (const tag of r.tags || []) {
      if (!tagToResults.has(tag)) tagToResults.set(tag, []);
      tagToResults.get(tag).push(r);
    }
  }
  const out = {};
  for (const [tag, rs] of tagToResults.entries()) {
    const ok = rs.filter((r) => !r.error);
    const lats = rs.map((r) => r.latencyMs).filter(Number.isFinite);
    const validRate = rs.length === 0
      ? null
      : rs.filter((r) => !r.error && r.output != null).length / rs.length;
    out[tag] = {
      n: rs.length,
      error_rate: rs.length === 0 ? null : (rs.length - ok.length) / rs.length,
      valid_rate: validRate,
      latency_ms_p50: lats.length === 0 ? null : pctile([...lats].sort((a, b) => a - b), 0.5),
    };
  }
  return out;
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
