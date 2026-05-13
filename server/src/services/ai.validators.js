// ============================================================================
// AI VALIDATORS — Rule-based output checks for grounded AI prompts
// ============================================================================
//
// Every JSON-returning AI surface should pair its prompt with a validator
// here and a fallback in ./ai.fallbacks.js. Pattern established by the
// readiness-verdict feature (see validateVerdict below):
//
//   1. The prompt declares hard rules in its system message.
//   2. The validator enforces those rules server-side. Trusting the model
//      to follow rules is not enough — anti-hallucination is defense in
//      depth, prompt + validator + fallback.
//   3. On any violation the caller discards the LLM output and uses the
//      deterministic fallback. The fallback is the safe state — no retry,
//      no second guess.
//
// New validators added here as we apply the pattern to other surfaces
// (solution review, design final eval, problem generation, etc.).
// ============================================================================
import crypto from "node:crypto";

// ── Vocabulary used by claim-hedging rules ──────────────────────────
export const TENTATIVE_VOCAB = [
  "early",
  "emerging",
  "tentative",
  "small sample",
  "preliminary",
  "partial",
];
export const PARTIAL_VOCAB = ["building", "partial", "still", "starting", "early"];

// ── Generic helpers ─────────────────────────────────────────────────

// SHA-256 hash of any JSON-serializable input, truncated to 32 hex chars.
// Used as the cache key for prompts whose output depends only on the
// evidence shape (verdict). Stable across processes.
export function hashInputPayload(obj) {
  const json = JSON.stringify(obj);
  return crypto.createHash("sha256").update(json).digest("hex").slice(0, 32);
}

// Backward-compatible alias for the verdict-specific name.
export const hashEvidence = hashInputPayload;

// Pull the outermost balanced `{...}` JSON object out of a model response.
// Useful when the prompt asks the model to think aloud before emitting JSON
// (e.g. <thinking> blocks invalidate response_format=json_object). Returns
// the parsed object on success, null on any failure (no throw).
export function extractJSON(text) {
  if (!text) return null;
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// ── Readiness verdict validator (gold-standard pattern) ─────────────
//
// Enforces the seven hard rules declared in readinessVerdictPrompt:
//   1. No claims about inactive dimensions.
//   2. Active dims with n<5 must use tentative language for "high" confidence.
//   3. reportCoverage.pct < 50 → headline must hedge ("partial", "building"…).
//   4. strengths/gaps capped at 2 items each.
//   5. Every claim's evidence field must cite a number.
//   6. (Output-format only — enforced by schema shape.)
//   7. readinessNote must use a server-provided tier name when claiming a tier.
//
// Returns { valid: boolean, violations: string[] }. On any violation
// the caller MUST discard the LLM output and use buildFallbackVerdict.
//
// Map from dimension key → human-readable label aliases. The validator
// uses these to detect when a claim mentions a particular dimension by
// name (e.g. "pattern recognition" or just "pattern").
const KEY_LABELS = {
  patternrecognition: ["pattern recognition", "pattern", "patterns"],
  solutiondepth: ["solution depth", "depth"],
  communication: ["communication"],
  optimization: ["optimization", "optimize"],
  pressureperformance: ["pressure performance", "pressure"],
  retention: ["retention"],
};

export function validateVerdict(verdict, evidence) {
  const violations = [];
  if (!verdict || typeof verdict !== "object") {
    return { valid: false, violations: ["not-an-object"] };
  }

  const { headline, strengths, gaps, readinessNote, dataQualityNote } = verdict;
  if (typeof headline !== "string" || headline.length === 0 || headline.length > 200) {
    violations.push("headline-shape");
  }
  if (!Array.isArray(strengths) || strengths.length > 2) {
    violations.push("strengths-cap");
  }
  if (!Array.isArray(gaps) || gaps.length > 2) {
    violations.push("gaps-cap");
  }
  if (typeof readinessNote !== "string" || typeof dataQualityNote !== "string") {
    violations.push("notes-shape");
  }
  if (violations.length) return { valid: false, violations };

  const inactiveKeys = new Set(
    (evidence.dimensions || [])
      .filter((d) => d.status === "inactive")
      .map((d) => d.key.toLowerCase()),
  );

  const checkClaim = (item, label) => {
    if (!item || typeof item !== "object") {
      violations.push(`${label}-not-object`);
      return;
    }
    if (typeof item.claim !== "string" || typeof item.evidence !== "string") {
      violations.push(`${label}-missing-fields`);
      return;
    }
    if (!/\d/.test(item.evidence)) {
      violations.push(`${label}-evidence-no-number`);
    }
    const haystack = `${item.claim} ${item.evidence}`.toLowerCase();
    for (const key of inactiveKeys) {
      const terms = KEY_LABELS[key] || [key];
      if (terms.some((t) => haystack.includes(t))) {
        violations.push(`${label}-cites-inactive:${key}`);
      }
    }
  };
  strengths.forEach((s, i) => checkClaim(s, `strengths[${i}]`));
  gaps.forEach((g, i) => {
    checkClaim(g, `gaps[${i}]`);
    if (g && typeof g.action !== "string") violations.push(`gaps[${i}]-no-action`);
  });

  // Rule 2 — small-sample dims with high-confidence claims must hedge in text.
  strengths.forEach((s, i) => {
    if (!s || typeof s !== "object") return;
    for (const d of evidence.dimensions || []) {
      if (d.status !== "active" || d.n >= 5) continue;
      const terms = KEY_LABELS[d.key.toLowerCase()] || [d.key];
      const mentioned = terms.some((t) =>
        `${s.claim} ${s.evidence}`.toLowerCase().includes(t),
      );
      if (mentioned && s.confidence === "high") {
        const hedged = TENTATIVE_VOCAB.some((v) =>
          `${s.claim} ${s.evidence}`.toLowerCase().includes(v),
        );
        if (!hedged) violations.push(`strengths[${i}]-small-sample-overclaim`);
      }
    }
  });

  // Rule 3 — partial-profile headline must hedge.
  const coveragePct = evidence.reportCoverage?.pct ?? 0;
  if (coveragePct < 50) {
    const hLower = headline.toLowerCase();
    if (!PARTIAL_VOCAB.some((v) => hLower.includes(v))) {
      violations.push("partial-headline-missing-hedge");
    }
  }

  // Rule 7 — readinessNote uses a server-provided tier name.
  const allowedTierNames = [
    evidence.nearestTier?.name,
    evidence.nextTier?.name,
  ]
    .filter(Boolean)
    .map((x) => x.toLowerCase());
  if (allowedTierNames.length > 0) {
    const rnLower = readinessNote.toLowerCase();
    const hasKnownTier = allowedTierNames.some((n) => rnLower.includes(n));
    const claimsTier = /tier|ready|faang|junior|mid-tier/.test(rnLower);
    if (claimsTier && !hasKnownTier) {
      violations.push("readiness-note-unknown-tier");
    }
  }

  return { valid: violations.length === 0, violations };
}
