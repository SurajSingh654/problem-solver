const MAX_ALTERNATIVES = 3;

function tupleKey(item) {
  return `${item.pattern} ${item.timeComplexity} ${item.spaceComplexity}`;
}

/**
 * Dedupe + cap alternatives.
 *
 * Drops:
 * - Items identical to primary in (pattern, timeComplexity, spaceComplexity)
 * - Items that duplicate another alternative's name (keeps first)
 * - Items that duplicate another alternative's (pattern, time, space) tuple (keeps first)
 *
 * Caps the result at 3 items. Returns [] for non-array input.
 *
 * Lenient by design: input that doesn't conform to expected shape is ignored,
 * not rejected. Caller validates each item separately via Zod.
 */
export function dedupAndCapAlternatives(input, primary) {
  if (!Array.isArray(input)) return [];

  const primaryTuple = primary ? tupleKey(primary) : null;
  const seenNames = new Set();
  const seenTuples = new Set();
  const out = [];

  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    if (out.length >= MAX_ALTERNATIVES) break;

    const itemTuple = tupleKey(item);

    if (primaryTuple && itemTuple === primaryTuple) continue;
    if (seenNames.has(item.name)) continue;
    if (seenTuples.has(itemTuple)) continue;

    seenNames.add(item.name);
    seenTuples.add(itemTuple);
    out.push(item);
  }

  return out;
}
