const O_NOTATION_RE = /^O\(.+\)$/;

export function normalizeOComplexity(input) {
  if (input == null) return "";
  const trimmed = String(input).trim();
  if (trimmed === "") return "";
  if (O_NOTATION_RE.test(trimmed)) return trimmed;
  return `O(${trimmed})`;
}

export function isValidOComplexity(input) {
  if (typeof input !== "string" || input === "") return false;
  return O_NOTATION_RE.test(input.trim());
}
