const MAX_ALTERNATIVES = 3;

function tupleKey(item) {
  return `${item.pattern} ${item.timeComplexity} ${item.spaceComplexity}`;
}

/**
 * Dedupe + cap alternatives.
 *
 * Returns { kept, dropped } where dropped is an array of
 * { item, reason }, reason ∈ "equals-primary" | "dup-name" |
 * "dup-tuple" | "over-cap".
 *
 * Items that fail the `typeof item === "object"` shape check are
 * silently skipped (not counted as drops) — those are handled at the
 * upstream Zod-validation layer in processAlternatives.
 *
 * Caps the kept result at 3 items. Returns { kept: [], dropped: [] }
 * for non-array input.
 */
export function dedupAndCapAlternatives(input, primary) {
  if (!Array.isArray(input)) return { kept: [], dropped: [] };

  const primaryTuple = primary ? tupleKey(primary) : null;
  const seenNames = new Set();
  const seenTuples = new Set();
  const kept = [];
  const dropped = [];

  for (const item of input) {
    if (!item || typeof item !== "object") continue;

    if (kept.length >= MAX_ALTERNATIVES) {
      dropped.push({ item, reason: "over-cap" });
      continue;
    }

    const itemTuple = tupleKey(item);

    if (primaryTuple && itemTuple === primaryTuple) {
      dropped.push({ item, reason: "equals-primary" });
      continue;
    }
    if (seenNames.has(item.name)) {
      dropped.push({ item, reason: "dup-name" });
      continue;
    }
    if (seenTuples.has(itemTuple)) {
      dropped.push({ item, reason: "dup-tuple" });
      continue;
    }

    seenNames.add(item.name);
    seenTuples.add(itemTuple);
    kept.push(item);
  }

  return { kept, dropped };
}
