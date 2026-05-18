// ============================================================================
// Validation metric — for surfaces that use validate-or-fallback
// ============================================================================
//
// Each result is expected to carry .raw (the parsed AI output) and
// .validation = { valid: boolean, violations: string[] } produced by
// the surface adapter. We aggregate across runs:
//
//   valid_rate           : fraction of runs whose schema validated
//   top_violations       : the most common violation strings
//   sample_violations    : up to 5 (id, violations) pairs
// ============================================================================

export async function validationMetrics(results, _items) {
  let valid = 0;
  const counts = new Map();
  const samples = [];

  for (const r of results) {
    const v = r?.raw && r?.output != null ? null : (r?.validation || null);
    // The surface adapter sets `output` to the parsed JSON only when
    // validation passed; null otherwise. Anything else means failure.
    const passed = !r.error && r.output != null;
    if (passed) {
      valid++;
    } else {
      const violations = r?.validation?.violations || [r?.error || "unknown"];
      for (const code of violations) {
        counts.set(code, (counts.get(code) || 0) + 1);
      }
      if (samples.length < 5) {
        samples.push({ id: r.id, violations });
      }
      // suppress unused
      void v;
    }
  }

  const total = results.length;
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, count]) => ({ code, count }));

  return {
    valid_rate: total === 0 ? null : valid / total,
    invalid_count: total - valid,
    top_violations: top,
    samples,
  };
}
