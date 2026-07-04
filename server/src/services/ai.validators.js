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
import { z } from "zod";
import { CANONICAL_PATTERN_LABELS } from "../utils/patternTaxonomy.js";
import { dedupAndCapAlternatives } from "../utils/canonicalAltDedup.js";

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
  teachingcontributions: [
    "teaching contributions",
    "teaching",
    "knowledge sharing",
    "peer teaching",
  ],
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

  // Rule 8 — Pattern Mastery distribution awareness.
  //
  // When evidence.patternMastery is present (Coding Pattern Mastery v2
  // flag is on), any claim referencing Pattern Recognition MUST cite the
  // mastery distribution, not just the score. The score can be inflated
  // by tagging a few patterns repeatedly; only the distribution
  // (owned / solid / coreSolidOrAbove) shows real breadth.
  //
  // Distribution detection uses word-boundary regexes so "core" doesn't
  // false-match inside "score" — that bug would let "score=78" pass.
  // Rule 9 below replicates this pattern for Solution Depth.
  if (evidence.patternMastery) {
    const PATTERN_TERMS = KEY_LABELS.patternrecognition;
    const DISTRIBUTION_PATTERNS = [
      /\bowned\b/i,
      /\bsolid\b/i,
      /\bcore\b/i,                 // word-boundary: matches "FAANG-core", not "score"
      /\buntouched\b/i,
      /\btouched\b/i,
      /\bworking\b/i,
      /\bmastery\b/i,
      /\d+\s*\/\s*15\b/,           // "12/15"
      /\bof\s+15\b/i,              // "12 of 15"
      /\d+\s*\/\s*25\b/,           // "3/25"
      /\bof\s+25\b/i,              // "3 of 25"
    ];
    const checkDistribution = (item, label) => {
      if (!item || typeof item !== "object") return;
      const haystack = `${item.claim ?? ""} ${item.evidence ?? ""}`.toLowerCase();
      const mentionsPattern = PATTERN_TERMS.some((t) => haystack.includes(t));
      if (!mentionsPattern) return;
      const citesDistribution = DISTRIBUTION_PATTERNS.some((rx) =>
        rx.test(haystack),
      );
      if (!citesDistribution) {
        violations.push(`${label}-pattern-claim-no-mastery-distribution`);
      }
    };
    strengths.forEach((s, i) => checkDistribution(s, `strengths[${i}]`));
    gaps.forEach((g, i) => checkDistribution(g, `gaps[${i}]`));
  }

  // Rule 9 — Solution Depth distribution awareness.
  //
  // When evidence.solutionDepth is present (Solution Depth v2 flag is on),
  // any claim referencing Solution Depth / depth / understanding MUST cite
  // a depth-distribution number — not just the score. A high D2 score can
  // come from polished Feynman writing without any probe-passing or
  // retrieval; only the distribution shows real depth.
  //
  // Same word-boundary regex discipline as Rule 8 — "owned" inside "owner"
  // would false-match without \b anchors.
  if (evidence.solutionDepth) {
    // "understanding" is intentionally a substring match (not word-bounded)
    // so "understandingDepth" / "understanding depth" both match.
    const DEPTH_TERMS = ["solution depth", "depth", "understanding"];
    const DEPTH_DISTRIBUTION_PATTERNS = [
      /\bowned\b/i,
      /\bdefended\b/i,
      /\bexplained\b/i,
      /\bdocumented\b/i,
      /\d+\s+(of|at)\s+\d+\s+(solutions?|defended|owned)/i,
      /\d+\s+(owned|defended|explained|documented)\b/i,
    ];
    const checkDepthDistribution = (item, label) => {
      if (!item || typeof item !== "object") return;
      const haystack = `${item.claim ?? ""} ${item.evidence ?? ""}`.toLowerCase();
      const mentionsDepth = DEPTH_TERMS.some((t) => haystack.includes(t));
      if (!mentionsDepth) return;
      const citesDistribution = DEPTH_DISTRIBUTION_PATTERNS.some((rx) =>
        rx.test(haystack),
      );
      if (!citesDistribution) {
        violations.push(`${label}-depth-claim-no-distribution`);
      }
    };
    strengths.forEach((s, i) => checkDepthDistribution(s, `strengths[${i}]`));
    gaps.forEach((g, i) => checkDepthDistribution(g, `gaps[${i}]`));
  }

  // Rule 10 — Communication source-quality awareness.
  //
  // When evidence.communication is present (D3 v2 flag is on), any claim
  // that is *about* communication MUST cite the source. A high D3 score
  // from written-only signal is not "strong communication" — Levashina
  // 2014 puts written-only validity at r ≈ 0.20 vs structured live at
  // r ≈ 0.51. The dim's source quality must be transparent.
  //
  // Phrase anchoring (Plan agent push): word-boundary alone matches
  // incidental phrases like "communication style was clear" which are
  // NOT subject claims. We require the term to appear at the start of
  // the claim sentence OR after a copula ("is the strongest", "is your
  // weakest"). False-positive guard test pinned in validators.test.js.
  if (evidence.communication) {
    // SUBJECT_PATTERNS — the claim is *about* communication, not a
    // passing reference. "X is/was [adjective] communication" or
    // "Communication is/shows [...]" both qualify; "communication style"
    // mid-sentence does not.
    const COMM_SUBJECT_PATTERNS = [
      /\bcommunication\b\s+(is|was|are|shows|remains|stands|leads)/i,
      /^communication\b/i,
      /\bcommunication\b\s+(skill|skills|ability|performance)\b/i,
      /\bexplanation\s+quality\b/i,
      /\bweakest.{0,30}\bcommunication\b/i,
      /\bstrongest.{0,30}\bcommunication\b/i,
      /\bstrong.{0,12}\bcommunication\b/i,
      /\bweak.{0,12}\bcommunication\b/i,
    ];
    const COMM_SOURCE_PATTERNS = [
      /\bpeer ratings?\b/i,
      /\bmock interview/i,
      /\blive\b/i,
      /\b(verbal|verbally)\b/i,
      /\bwritten[- ]only\b/i,
      /\bsource[- ]quality\b/i,
      /\bceiling\b/i,
      /\bAI[- ]rated\b/i,
    ];
    const checkCommSource = (item, label) => {
      if (!item || typeof item !== "object") return;
      const text = `${item.claim ?? ""} ${item.evidence ?? ""}`;
      const isCommSubject = COMM_SUBJECT_PATTERNS.some((rx) => rx.test(text));
      if (!isCommSubject) return;
      const citesSource = COMM_SOURCE_PATTERNS.some((rx) => rx.test(text));
      if (!citesSource) {
        violations.push(`${label}-comm-claim-no-source`);
      }
    };
    strengths.forEach((s, i) => checkCommSource(s, `strengths[${i}]`));
    gaps.forEach((g, i) => checkCommSource(g, `gaps[${i}]`));
  }

  // Rule 11 — Optimization trade-off distribution awareness.
  //
  // When evidence.optimization is present (D4 v2 flag is on), any claim
  // *about* Optimization or Trade-off thinking MUST cite the distribution.
  // A high D4 score from documented-but-not-articulated trade-offs isn't
  // optimization mastery — Schoenfeld 1985 / Voss 1983 establish that
  // explicit comparison is the expert/novice differentiator.
  //
  // Phrase anchoring (Plan agent push): `\bowned\b` alone false-matches
  // D2's "5 solutions Owned" prose. Subject must be "optimization" or
  // "trade-off"; distribution patterns include "owned" but only after the
  // subject gate has triggered.
  if (evidence.optimization) {
    const OPT_SUBJECT_PATTERNS = [
      /\boptimization\b\s+(is|was|are|shows|remains|stands|leads)/i,
      /^optimization\b/i,
      /\btrade[- ]off\b\s+(reasoning|articulation|thinking|skill|skills)/i,
      /\bweakest.{0,30}\boptimization\b/i,
      /\bstrongest.{0,30}\boptimization\b/i,
      /\bstrong.{0,12}\boptimization\b/i,
      /\bweak.{0,12}\boptimization\b/i,
      /\boptimization\b\s+(skill|skills|ability|performance|mastery)\b/i,
    ];
    // Distribution patterns must require digits + state words. A bare
    // \btrade[- ]off\b would self-match the subject term ("Trade-off
    // reasoning is sparse" mentions trade-off but cites no count) and
    // pass Rule 11 invalidly. Same for `\boptimized\b` — too permissive.
    const OPT_DISTRIBUTION_PATTERNS = [
      // "5 of 12 solutions at Trade-off+" / "8 of 12 trade-off" / "0 of 4 owned"
      /\d+\s+of\s+\d+\s+(solutions?|trade[- ]off|owned)/i,
      // "2 Owned" / "3 Trade-off" / "4 Optimized" / "0 Documented" — count + state
      /\b\d+\s+(owned|trade[- ]off|optimized|documented)\b/i,
      // "at Trade-off+" / "at Owned+" — explicit at-state phrase
      /\bat\s+(trade[- ]off|owned)/i,
      // Internal counter names that AI might cite verbatim
      /\btradeoffOrAbove\b/i,
      /\bownedOrAbove\b/i,
    ];
    const checkOptDistribution = (item, label) => {
      if (!item || typeof item !== "object") return;
      const text = `${item.claim ?? ""} ${item.evidence ?? ""}`;
      const isOptSubject = OPT_SUBJECT_PATTERNS.some((rx) => rx.test(text));
      if (!isOptSubject) return;
      const citesDistribution = OPT_DISTRIBUTION_PATTERNS.some((rx) =>
        rx.test(text),
      );
      if (!citesDistribution) {
        violations.push(`${label}-opt-claim-no-distribution`);
      }
    };
    strengths.forEach((s, i) => checkOptDistribution(s, `strengths[${i}]`));
    gaps.forEach((g, i) => checkOptDistribution(g, `gaps[${i}]`));
  }

  // Rule 12 — Pressure Performance source-quality awareness.
  //
  // When evidence.pressurePerformance is present (D5 v2 flag is on), any
  // claim *about* Pressure Performance MUST cite the source. A high D5
  // score from quiz-proxy alone is not "strong pressure performance" —
  // Schmidt-Hunter 1998 puts proxy validity at r ≤ 0.20 vs work-sample
  // r=0.54.
  //
  // Phrase-anchored subject patterns: "Pressure Performance" or
  // "Pressure" as the subject of the claim. Incidental "performed well
  // under pressure" mid-sentence is NOT a subject claim. Same dual-layer
  // protection as Rule 10 / Rule 11.
  if (evidence.pressurePerformance) {
    const PRESSURE_SUBJECT_PATTERNS = [
      /\bpressure\s+performance\b/i,
      /^pressure\b/i,
      /\bpressure\b\s+(is|was|are|shows|remains)/i,
      /\bweakest.{0,30}\bpressure\b/i,
      /\bstrongest.{0,30}\bpressure\b/i,
      /\bstrong.{0,12}\bpressure\b/i,
      /\bweak.{0,12}\bpressure\b/i,
    ];
    const PRESSURE_SOURCE_PATTERNS = [
      /\bmock interview/i,
      /\bquiz[- ]proxy\b/i,
      /\blive\s+signal\b/i,
      /\bstable\s+mocks?\b/i,
      /\bceiling\b/i,
      /\bsource[- ]quality\b/i,
      /\d+\s+mock interview/i,
      /\binterview[- ]relevant\b/i,
    ];
    const checkPressureSource = (item, label) => {
      if (!item || typeof item !== "object") return;
      const text = `${item.claim ?? ""} ${item.evidence ?? ""}`;
      const isPressureSubject = PRESSURE_SUBJECT_PATTERNS.some((rx) => rx.test(text));
      if (!isPressureSubject) return;
      const citesSource = PRESSURE_SOURCE_PATTERNS.some((rx) => rx.test(text));
      if (!citesSource) {
        violations.push(`${label}-pressure-claim-no-source`);
      }
    };
    strengths.forEach((s, i) => checkPressureSource(s, `strengths[${i}]`));
    gaps.forEach((g, i) => checkPressureSource(g, `gaps[${i}]`));
  }

  // Rule 13 — Retention sample-size honesty.
  //
  // When evidence.retention is present (D6 v2 flag is on), strength
  // claims about Knowledge Retention must respect sample-size floors:
  //   - n < 5  → retention can't be claimed strength at all
  //   - n < 10 + confidence='high' → must hedge ("tentative", "early")
  //   - n ≥ 10 → no special hedging required
  // Lange, Wang & Dunlosky (2013): small-sample retention scores are
  // statistically unreliable. Same hedging vocab as Rule 2.
  if (evidence.retention) {
    const RETENTION_TERMS = [/\bretention\b/i, /\bknowledge retention\b/i];
    const HEDGE_VOCAB = ["early", "tentative", "small sample", "preliminary", "emerging"];
    const checkRetentionSampleSize = (item, label) => {
      if (!item || typeof item !== "object") return;
      const text = `${item.claim ?? ""} ${item.evidence ?? ""}`;
      const isRetentionSubject = RETENTION_TERMS.some((rx) => rx.test(text));
      if (!isRetentionSubject) return;
      const n = evidence.retention.attemptCount ?? 0;
      if (n < 5) {
        violations.push(`${label}-retention-claim-too-few-attempts`);
        return;
      }
      if (n < 10 && item.confidence === "high") {
        const lowerText = text.toLowerCase();
        const hasHedge = HEDGE_VOCAB.some((v) => lowerText.includes(v));
        if (!hasHedge) {
          violations.push(`${label}-retention-high-confidence-low-n`);
        }
      }
    };
    // Apply to strengths only — Rule 13 is about over-claiming retention
    // as a strength. Gap claims about retention being WEAK don't need
    // the same protection (under-claiming a low score is honest).
    strengths.forEach((s, i) => checkRetentionSampleSize(s, `strengths[${i}]`));
  }

  // Rule 14 — Teaching peer-rating sample-size honesty.
  //
  // When evidence.teaching is present (D7 v2 flag is on AND user has hosted
  // at least one session), strength claims about Teaching Contributions
  // must respect peer-rating sample-size floors:
  //   - ratingCount < 3 → teaching can't be claimed strength at all
  //   - ratingCount < 5 + confidence='high' → must hedge
  //   - ratingCount ≥ 5 → no special hedging required
  // Topping (1996) / Anderson & Shackleton (1990): peer-rating reliability
  // stabilizes around 5+ raters. Mirror of Rule 13's structure.
  if (evidence.teaching) {
    const TEACHING_TERMS = [
      /\bteaching\b/i,
      /\bteaching contributions\b/i,
      /\bteach-back\b/i,
      /\bpeer teaching\b/i,
    ];
    const HEDGE_VOCAB_T = ["early", "tentative", "small sample", "preliminary", "emerging"];
    const checkTeachingSampleSize = (item, label) => {
      if (!item || typeof item !== "object") return;
      const text = `${item.claim ?? ""} ${item.evidence ?? ""}`;
      const isTeachingSubject = TEACHING_TERMS.some((rx) => rx.test(text));
      if (!isTeachingSubject) return;
      const n = evidence.teaching.ratingCount ?? 0;
      if (n < 3) {
        violations.push(`${label}-teaching-claim-too-few-ratings`);
        return;
      }
      if (n < 5 && item.confidence === "high") {
        const lowerText = text.toLowerCase();
        const hasHedge = HEDGE_VOCAB_T.some((v) => lowerText.includes(v));
        if (!hasHedge) {
          violations.push(`${label}-teaching-high-confidence-low-n`);
        }
      }
    };
    // Strengths only — gap claims about teaching being WEAK are honest
    // (under-claiming low signal is fine). Mirror of Rule 13.
    strengths.forEach((s, i) => checkTeachingSampleSize(s, `strengths[${i}]`));
  }

  // Rule 15 — Design Aptitude sample-size honesty.
  //
  // When evidence.designAptitude is present (D8 flag is on AND user has
  // ≥1 completed design session with evaluation), strength claims about
  // Design Aptitude / System Design / LLD must respect sample-size floors:
  //   - sessionCount < 2 → design can't be claimed strength at all
  //   - sessionCount < 3 + confidence='high' → must hedge
  //   - sessionCount ≥ 3 → no special hedging required
  // Schoenfeld 1985 + Newell-Simon 1972: design competency is established
  // through repeated practice across problem types. Mirror of Rules 13/14.
  if (evidence.designAptitude) {
    const DESIGN_TERMS = [
      /\bdesign aptitude\b/i,
      /\bsystem design\b/i,
      /\blow.level design\b/i,
      /\bLLD\b/,
    ];
    const HEDGE_VOCAB_D = ["early", "tentative", "small sample", "preliminary", "emerging"];
    const checkDesignSampleSize = (item, label) => {
      if (!item || typeof item !== "object") return;
      const text = `${item.claim ?? ""} ${item.evidence ?? ""}`;
      const isDesignSubject = DESIGN_TERMS.some((rx) => rx.test(text));
      if (!isDesignSubject) return;
      const n = evidence.designAptitude.sessionCount ?? 0;
      if (n < 2) {
        violations.push(`${label}-design-claim-too-few-sessions`);
        return;
      }
      if (n < 3 && item.confidence === "high") {
        const lowerText = text.toLowerCase();
        const hasHedge = HEDGE_VOCAB_D.some((v) => lowerText.includes(v));
        if (!hasHedge) {
          violations.push(`${label}-design-high-confidence-low-n`);
        }
      }
    };
    strengths.forEach((s, i) => checkDesignSampleSize(s, `strengths[${i}]`));
  }

  // Rule 16 — Behavioral Performance sample-size honesty.
  //
  // When evidence.behavioral is present (D9 flag is on AND user has
  // activated), strength claims about Behavioral Performance / behavioral
  // interview must respect mock-sample-size floors:
  //   - mockCount < 2 → behavioral can't be claimed strength at all
  //   - mockCount < 3 + confidence='high' → must hedge
  //   - mockCount ≥ 3 → no special hedging required
  // Lievens & De Soete (2012) + Schmidt-Hunter (1998): single behavioral
  // interview is a poor predictor; replication is what builds validity.
  if (evidence.behavioral) {
    // Phrase-anchored — "behavioral performance" or "behavioral interview"
    // as the subject. Avoid false positives on words like "behavior" used
    // in coding-context ("the program's behavior").
    const BEHAVIORAL_TERMS = [
      /\bbehavioral performance\b/i,
      /\bbehavioral interview\b/i,
      /\bbehavioral round\b/i,
      /\bculture[- ]fit\b/i,
    ];
    const HEDGE_VOCAB_B = ["early", "tentative", "small sample", "preliminary", "emerging"];
    const checkBehavioralSampleSize = (item, label) => {
      if (!item || typeof item !== "object") return;
      const text = `${item.claim ?? ""} ${item.evidence ?? ""}`;
      const isBehavioralSubject = BEHAVIORAL_TERMS.some((rx) => rx.test(text));
      if (!isBehavioralSubject) return;
      const n = evidence.behavioral.mockCount ?? 0;
      if (n < 2) {
        violations.push(`${label}-behavioral-claim-too-few-mocks`);
        return;
      }
      if (n < 3 && item.confidence === "high") {
        const lowerText = text.toLowerCase();
        const hasHedge = HEDGE_VOCAB_B.some((v) => lowerText.includes(v));
        if (!hasHedge) {
          violations.push(`${label}-behavioral-high-confidence-low-n`);
        }
      }
    };
    strengths.forEach((s, i) => checkBehavioralSampleSize(s, `strengths[${i}]`));
  }

  // Rule 17 — Verification & Meta-cognition sample-size honesty.
  //
  // When evidence.verification is present (D10 flag is on AND user has
  // ≥5 AI-reviewed coding solutions), strength claims about Verification
  // / Meta-cognition / calibration must respect calibration sample-size:
  //   - calibrationN < 5 → can't be claimed strength at all
  //   - calibrationN < 10 + confidence='high' → must hedge
  //   - calibrationN ≥ 10 → no special hedging required
  // Lange-Wang-Dunlosky 2013. Self-refuting failure mode: an
  // overconfident claim about being well-calibrated.
  if (evidence.verification) {
    // Phrase-anchored — "verification" / "meta-cognition" / "calibration"
    // / "self-assessment" must be the subject. Avoid false positives on
    // generic "verify" prose.
    const VERIFICATION_TERMS = [
      /\bverification\b/i,
      /\bmeta[- ]?cognition\b/i,
      /\bself[- ]assessment\b/i,
      /\bwell[- ]calibrated\b/i,
      /\bcalibration accuracy\b/i,
    ];
    const HEDGE_VOCAB_V = ["early", "tentative", "small sample", "preliminary", "emerging"];
    const checkVerificationSampleSize = (item, label) => {
      if (!item || typeof item !== "object") return;
      const text = `${item.claim ?? ""} ${item.evidence ?? ""}`;
      const isVerificationSubject = VERIFICATION_TERMS.some((rx) => rx.test(text));
      if (!isVerificationSubject) return;
      const n = evidence.verification.calibrationN ?? 0;
      if (n < 5) {
        violations.push(`${label}-verification-claim-too-few-datapoints`);
        return;
      }
      if (n < 10 && item.confidence === "high") {
        const lowerText = text.toLowerCase();
        const hasHedge = HEDGE_VOCAB_V.some((v) => lowerText.includes(v));
        if (!hasHedge) {
          violations.push(`${label}-verification-high-confidence-low-n`);
        }
      }
    };
    strengths.forEach((s, i) => checkVerificationSampleSize(s, `strengths[${i}]`));
  }

  return { valid: violations.length === 0, violations };
}

// ── Design Studio final-evaluation validator ────────────────────────
//
// Validates designStudioFinalEvalPrompt output. The prompt declares 10
// dimensions per designType with overlapping + designType-specific keys —
// the validator enforces exact key membership so the model can't invent
// new dimensions or drop one.
//
// SD ⨯ LLD share: requirementsCompleteness, scenarioResilience, communicationClarity.
// SD-only:  estimationSoundness, apiDesignQuality, dataModelCorrectness,
//           architectureCoherence, deepDiveDepth, tradeoffAwareness, scaleReadiness.
// LLD-only: entityIdentification, hierarchyCorrectness, patternApplication,
//           solidCompliance, implementationQuality, extensibilityScore, edgeCaseAwareness.
const SD_DIM_KEYS = [
  "requirementsCompleteness",
  "estimationSoundness",
  "apiDesignQuality",
  "dataModelCorrectness",
  "architectureCoherence",
  "deepDiveDepth",
  "tradeoffAwareness",
  "scenarioResilience",
  "scaleReadiness",
  "communicationClarity",
];
const LLD_DIM_KEYS = [
  "requirementsCompleteness",
  "entityIdentification",
  "hierarchyCorrectness",
  "patternApplication",
  "solidCompliance",
  "implementationQuality",
  "extensibilityScore",
  "scenarioResilience",
  "edgeCaseAwareness",
  "communicationClarity",
];

function isFiniteScore0to10(n) {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 10;
}

export function validateFinalEval(evalOut, { designType } = {}) {
  const violations = [];
  if (!evalOut || typeof evalOut !== "object") {
    return { valid: false, violations: ["not-an-object"] };
  }
  if (designType !== "SYSTEM_DESIGN" && designType !== "LOW_LEVEL_DESIGN") {
    return { valid: false, violations: ["unknown-designType"] };
  }
  const expectedKeys = designType === "SYSTEM_DESIGN" ? SD_DIM_KEYS : LLD_DIM_KEYS;

  // ── dimensions: object with exactly the expected keys, each 0-10 ──
  const dims = evalOut.dimensions;
  if (!dims || typeof dims !== "object" || Array.isArray(dims)) {
    violations.push("dimensions-shape");
  } else {
    const seenKeys = new Set(Object.keys(dims));
    for (const k of expectedKeys) {
      if (!seenKeys.has(k)) violations.push(`dimensions-missing:${k}`);
      else if (!isFiniteScore0to10(dims[k]))
        violations.push(`dimensions.${k}-out-of-range`);
    }
    // Detect fabricated keys not in the expected set.
    const expectedSet = new Set(expectedKeys);
    for (const k of seenKeys) {
      if (!expectedSet.has(k)) violations.push(`dimensions-extra:${k}`);
    }
  }

  // ── overallScore 0-10 ──
  if (!isFiniteScore0to10(evalOut.overallScore)) violations.push("overallScore-out-of-range");

  // ── arrays of non-empty strings, max 5 each ──
  for (const arrKey of ["criticalGaps", "strengths", "improvements"]) {
    const arr = evalOut[arrKey];
    if (!Array.isArray(arr)) {
      violations.push(`${arrKey}-not-array`);
      continue;
    }
    if (arr.length > 5) violations.push(`${arrKey}-cap-exceeded`);
    if (arr.some((s) => !isNonEmptyString(s))) violations.push(`${arrKey}-empty-item`);
  }

  // ── prose fields non-empty ──
  for (const k of ["industryComparison", "readinessVerdict", "timeAnalysis"]) {
    if (!isNonEmptyString(evalOut[k])) violations.push(`${k}-empty`);
  }

  // ── suggestedNextSteps array of non-empty strings, max 3 ──
  if (!Array.isArray(evalOut.suggestedNextSteps)) {
    violations.push("suggestedNextSteps-not-array");
  } else {
    if (evalOut.suggestedNextSteps.length > 3)
      violations.push("suggestedNextSteps-cap-exceeded");
    if (evalOut.suggestedNextSteps.some((s) => !isNonEmptyString(s)))
      violations.push("suggestedNextSteps-empty-item");
  }

  // ── refusal detection ──
  const refusalProbe = `${evalOut.industryComparison || ""} ${evalOut.readinessVerdict || ""}`.toLowerCase();
  if (
    /^i (cannot|can't|am unable to)/.test(refusalProbe.trim()) ||
    refusalProbe.includes("i cannot evaluate") ||
    refusalProbe.includes("i'm unable to evaluate")
  ) {
    violations.push("refusal-detected");
  }

  return { valid: violations.length === 0, violations };
}

// ── Teaching session validators (P3) ────────────────────────────────
//
// Three surfaces, all operating on host-typed markdown notes:
//   • validateTeachingSummary    — tldr + bullets + definitions + open Qs
//   • validateTeachingQuiz       — 3-5 review questions for attendees
//   • validateTeachingTopicCoverage — verdict + score + covered/missing
//
// All three follow the verdict pattern: hard rule checks → on any
// violation the caller must use buildFallbackTeaching*. Refusal
// detection is shared with the existing helpers.
const TEACHING_COVERAGE_VERDICTS = new Set(["FULL", "PARTIAL", "OFF_TOPIC"]);
const TEACHING_QUIZ_TYPES = new Set(["MCQ", "SHORT"]);

function detectTeachingRefusal(text) {
  if (!isNonEmptyString(text)) return false;
  const t = text.toLowerCase().trim();
  return (
    /^i (cannot|can't|am unable to)/.test(t) ||
    t.includes("i cannot summarize") ||
    t.includes("i cannot generate") ||
    t.includes("i'm unable to evaluate") ||
    t.includes("i cannot help")
  );
}

export function validateTeachingSummary(out, { hasNotes = true } = {}) {
  const violations = [];
  if (!out || typeof out !== "object") {
    return { valid: false, violations: ["not-an-object"] };
  }

  // tldr — single string, ≤ 280 chars, non-empty
  if (!isNonEmptyString(out.tldr)) violations.push("tldr-empty");
  else if (out.tldr.length > 280) violations.push("tldr-too-long");

  // keyTakeaways — 3-5 non-empty strings, each ≤ 240 chars
  if (!Array.isArray(out.keyTakeaways)) {
    violations.push("keyTakeaways-not-array");
  } else {
    if (out.keyTakeaways.length < 3 || out.keyTakeaways.length > 5) {
      violations.push(
        `keyTakeaways-count:expected=3-5-got=${out.keyTakeaways.length}`,
      );
    }
    out.keyTakeaways.forEach((b, i) => {
      if (!isNonEmptyString(b)) violations.push(`keyTakeaways[${i}]-empty`);
      else if (b.length > 240) violations.push(`keyTakeaways[${i}]-too-long`);
    });
  }

  // definitions — 0-5 entries, each {term, definition} both non-empty
  if (!Array.isArray(out.definitions)) {
    violations.push("definitions-not-array");
  } else {
    if (out.definitions.length > 5) violations.push("definitions-cap-exceeded");
    out.definitions.forEach((d, i) => {
      if (!d || typeof d !== "object") {
        violations.push(`definitions[${i}]-not-object`);
        return;
      }
      if (!isNonEmptyString(d.term)) violations.push(`definitions[${i}].term-empty`);
      if (!isNonEmptyString(d.definition))
        violations.push(`definitions[${i}].definition-empty`);
    });
  }

  // openQuestions — 0-3 non-empty strings
  if (!Array.isArray(out.openQuestions)) {
    violations.push("openQuestions-not-array");
  } else {
    if (out.openQuestions.length > 3) violations.push("openQuestions-cap-exceeded");
    out.openQuestions.forEach((q, i) => {
      if (!isNonEmptyString(q)) violations.push(`openQuestions[${i}]-empty`);
    });
  }

  // Refusal detection on the public-facing fields
  if (detectTeachingRefusal(out.tldr)) violations.push("refusal-detected");

  // Sanity: don't accept "the notes are empty" claims when notes are non-empty
  if (hasNotes) {
    const probe = `${out.tldr || ""} ${(out.keyTakeaways || []).join(" ")}`.toLowerCase();
    if (
      probe.includes("notes are empty") ||
      probe.includes("no notes provided") ||
      probe.includes("notes were empty")
    ) {
      violations.push("notes-emptiness-claim-when-notes-present");
    }
  }

  return { valid: violations.length === 0, violations };
}

export function validateTeachingQuiz(out) {
  const violations = [];
  if (!out || typeof out !== "object") {
    return { valid: false, violations: ["not-an-object"] };
  }
  if (!Array.isArray(out.questions)) {
    return { valid: false, violations: ["questions-not-array"] };
  }
  if (out.questions.length < 3 || out.questions.length > 5) {
    violations.push(
      `questions-count:expected=3-5-got=${out.questions.length}`,
    );
  }

  let allMcqAnswerLetters = [];
  out.questions.forEach((q, i) => {
    const tag = `questions[${i}]`;
    if (!q || typeof q !== "object") {
      violations.push(`${tag}-not-object`);
      return;
    }
    if (!isNonEmptyString(q.question)) violations.push(`${tag}.question-empty`);
    else if (q.question.length < 10 || q.question.length > 300) {
      violations.push(`${tag}.question-length-out-of-range`);
    }
    if (!TEACHING_QUIZ_TYPES.has(q.type)) {
      violations.push(`${tag}.type-unknown`);
    }
    if (!isNonEmptyString(q.explanation))
      violations.push(`${tag}.explanation-empty`);

    if (q.type === "MCQ") {
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        violations.push(`${tag}.options-must-be-4`);
      } else if (q.options.some((o) => !isNonEmptyString(o))) {
        violations.push(`${tag}.options-empty-item`);
      } else {
        // No duplicate options
        const norm = q.options.map((o) => o.trim().toLowerCase());
        if (new Set(norm).size !== norm.length) {
          violations.push(`${tag}.options-duplicate`);
        }
        // answer must be one of the options (case-sensitive comparison)
        if (!q.options.includes(q.answer)) {
          violations.push(`${tag}.answer-not-in-options`);
        } else {
          // Track the option index for "all same letter" laziness check
          const idx = q.options.indexOf(q.answer);
          allMcqAnswerLetters.push(idx);
        }
      }
    } else if (q.type === "SHORT") {
      if (!isNonEmptyString(q.answer)) violations.push(`${tag}.answer-empty`);
      else if (q.answer.length < 5 || q.answer.length > 200)
        violations.push(`${tag}.answer-length-out-of-range`);
      // SHORT shouldn't carry options
      if (q.options !== undefined && Array.isArray(q.options) && q.options.length > 0) {
        violations.push(`${tag}.short-with-options`);
      }
    }
  });

  // Laziness: if there are 3+ MCQs and ALL share the same answer index, reject.
  if (allMcqAnswerLetters.length >= 3) {
    const set = new Set(allMcqAnswerLetters);
    if (set.size === 1) {
      violations.push("mcq-answers-all-same-position");
    }
  }

  return { valid: violations.length === 0, violations };
}

export function validateTeachingTopicCoverage(out) {
  const violations = [];
  if (!out || typeof out !== "object") {
    return { valid: false, violations: ["not-an-object"] };
  }

  // coverageScore — integer 0-100
  const score = out.coverageScore;
  if (
    typeof score !== "number" ||
    !Number.isFinite(score) ||
    !Number.isInteger(score) ||
    score < 0 ||
    score > 100
  ) {
    violations.push("coverageScore-out-of-range");
  }

  // verdict — enum
  if (!TEACHING_COVERAGE_VERDICTS.has(out.verdict)) {
    violations.push("verdict-unknown");
  }

  // verdict ↔ score consistency (matches the prompt's calibration)
  if (typeof score === "number" && TEACHING_COVERAGE_VERDICTS.has(out.verdict)) {
    if (out.verdict === "FULL" && score < 75) violations.push("verdict-score-mismatch:FULL<75");
    if (out.verdict === "PARTIAL" && (score < 35 || score > 74))
      violations.push("verdict-score-mismatch:PARTIAL-out-of-band");
    if (out.verdict === "OFF_TOPIC" && score >= 35)
      violations.push("verdict-score-mismatch:OFF_TOPIC>=35");
  }

  // coveredAspects + missingAspects — arrays of non-empty strings, ≤ 5
  for (const arrKey of ["coveredAspects", "missingAspects"]) {
    const arr = out[arrKey];
    if (!Array.isArray(arr)) {
      violations.push(`${arrKey}-not-array`);
      continue;
    }
    if (arr.length > 5) violations.push(`${arrKey}-cap-exceeded`);
    if (arr.some((s) => !isNonEmptyString(s))) violations.push(`${arrKey}-empty-item`);
  }

  // rationale — non-empty, ≤ 280 chars, must cite at least one number
  if (!isNonEmptyString(out.rationale)) violations.push("rationale-empty");
  else {
    if (out.rationale.length > 280) violations.push("rationale-too-long");
    if (!/\d/.test(out.rationale)) violations.push("rationale-no-number");
  }

  // Refusal detection
  if (detectTeachingRefusal(out.rationale)) violations.push("refusal-detected");

  return { valid: violations.length === 0, violations };
}

// ── Quiz validators (generation + analysis) ─────────────────────────
//
// Quiz is the only P4 surface without a deterministic fallback object —
// fake questions would mislead the user worse than an error toast. The
// controller uses these validators to gate the success path; if the AI
// output is malformed, the request returns 503 with a "please retry"
// message instead of writing useless rows to the database.
const QUIZ_OPTION_KEYS = ["A", "B", "C", "D"];

export function validateQuizQuestions(result, { count } = {}) {
  const violations = [];
  if (!result || typeof result !== "object") {
    return { valid: false, violations: ["not-an-object"] };
  }
  if (!Array.isArray(result.questions)) {
    return { valid: false, violations: ["questions-not-array"] };
  }
  if (typeof count === "number" && result.questions.length !== count) {
    violations.push(
      `questions-count-mismatch:expected=${count}-got=${result.questions.length}`,
    );
  }
  if (result.questions.length === 0) {
    violations.push("questions-empty");
  }

  result.questions.forEach((q, i) => {
    const tag = `questions[${i}]`;
    if (!q || typeof q !== "object") {
      violations.push(`${tag}-not-object`);
      return;
    }
    if (!isNonEmptyString(q.question)) violations.push(`${tag}.question-empty`);
    if (!isNonEmptyString(q.explanation)) violations.push(`${tag}.explanation-empty`);
    if (!DIFFICULTY_VALUES.has(q.difficulty)) violations.push(`${tag}.difficulty-unknown`);

    // ── options: object with exactly A/B/C/D, all non-empty + distinct ──
    if (!q.options || typeof q.options !== "object" || Array.isArray(q.options)) {
      violations.push(`${tag}.options-shape`);
    } else {
      for (const k of QUIZ_OPTION_KEYS) {
        if (!isNonEmptyString(q.options[k])) {
          violations.push(`${tag}.options.${k}-empty`);
        }
      }
      // No fabricated keys
      const extraKeys = Object.keys(q.options).filter(
        (k) => !QUIZ_OPTION_KEYS.includes(k),
      );
      if (extraKeys.length > 0) {
        violations.push(`${tag}.options-extra-keys:${extraKeys.join(",")}`);
      }
      // Options must be distinct (case-insensitive trim) — duplicate
      // distractors are the most common AI failure mode here.
      const normalized = QUIZ_OPTION_KEYS
        .map((k) => (typeof q.options[k] === "string" ? q.options[k].trim().toLowerCase() : null))
        .filter((v) => v != null && v.length > 0);
      if (new Set(normalized).size !== normalized.length) {
        violations.push(`${tag}.options-duplicate`);
      }
    }

    // ── correctAnswer in {A,B,C,D} ──
    if (!QUIZ_OPTION_KEYS.includes(q.correctAnswer)) {
      violations.push(`${tag}.correctAnswer-unknown`);
    }
  });

  return { valid: violations.length === 0, violations };
}

export function validateQuizAnalysis(analysis) {
  const violations = [];
  if (!analysis || typeof analysis !== "object") {
    return { valid: false, violations: ["not-an-object"] };
  }
  if (!isNonEmptyString(analysis.summary)) violations.push("summary-empty");
  if (!isNonEmptyString(analysis.encouragement)) violations.push("encouragement-empty");

  if (!Array.isArray(analysis.weakTopics)) violations.push("weakTopics-not-array");
  else if (analysis.weakTopics.some((t) => !isNonEmptyString(t)))
    violations.push("weakTopics-empty-item");

  if (!Array.isArray(analysis.studyAdvice)) violations.push("studyAdvice-not-array");
  else if (analysis.studyAdvice.some((a) => !isNonEmptyString(a)))
    violations.push("studyAdvice-empty-item");

  return { valid: violations.length === 0, violations };
}

// ── Design Studio coaching / scenario validators ────────────────────
//
// Three surfaces, three validators:
//   • validateCoaching        — validate / guide / teach modes (different schemas)
//   • validateScenarioGen     — scenario generation (challenge bank)
//   • validateScenarioEval    — per-scenario response evaluation
//
// Lower stakes than verdict / final-eval, but the same defense applies:
// reject "I cannot help" deflections, malformed enums, empty critical
// fields. Fallback responses live in ai.fallbacks.js.
const COACHING_VERDICT_VALUES = new Set(["on_track", "needs_work", "strong"]);
const SCENARIO_CATEGORIES = new Set([
  "scale",
  "failure",
  "edge_case",
  "consistency",
  "cost",
  "extensibility",
  "concurrency",
]);
const SCENARIO_DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const SCENARIO_EVAL_VERDICTS = new Set(["PASS", "PARTIAL", "FAIL"]);

function detectCoachingRefusal(text) {
  if (!isNonEmptyString(text)) return false;
  const t = text.toLowerCase().trim();
  return (
    /^i (cannot|can't|am unable to)/.test(t) ||
    t.includes("i cannot help with") ||
    t.includes("i'm unable to help") ||
    t.includes("i cannot assist")
  );
}

export function validateCoaching(coaching, { mode } = {}) {
  const violations = [];
  if (!coaching || typeof coaching !== "object") {
    return { valid: false, violations: ["not-an-object"] };
  }
  if (!isNonEmptyString(coaching.response)) violations.push("response-empty");
  if (detectCoachingRefusal(coaching.response)) violations.push("refusal-detected");

  if (mode === "validate") {
    if (!COACHING_VERDICT_VALUES.has(coaching.verdict)) violations.push("verdict-unknown");
    if (!isNonEmptyString(coaching.specificStrength))
      violations.push("specificStrength-empty");
    // specificGap: allow null but reject other falsy types
    if (coaching.specificGap != null && !isNonEmptyString(coaching.specificGap)) {
      violations.push("specificGap-shape");
    }
  } else if (mode === "guide") {
    if (!Array.isArray(coaching.guidingQuestions)) {
      violations.push("guidingQuestions-not-array");
    } else {
      if (coaching.guidingQuestions.length < 3 || coaching.guidingQuestions.length > 5) {
        violations.push(
          `guidingQuestions-count:expected=3-5-got=${coaching.guidingQuestions.length}`,
        );
      }
      if (coaching.guidingQuestions.some((q) => !isNonEmptyString(q))) {
        violations.push("guidingQuestions-empty-item");
      }
    }
    if (!isNonEmptyString(coaching.thinkAbout)) violations.push("thinkAbout-empty");
  } else if (mode === "teach") {
    if (!isNonEmptyString(coaching.conceptExplanation))
      violations.push("conceptExplanation-empty");
    if (!isNonEmptyString(coaching.exampleInContext))
      violations.push("exampleInContext-empty");
    if (!isNonEmptyString(coaching.relatedDecision))
      violations.push("relatedDecision-empty");
  } else {
    violations.push("mode-unknown");
  }

  return { valid: violations.length === 0, violations };
}

export function validateScenarioGen(result, { minCount = 1 } = {}) {
  const violations = [];
  if (!result || typeof result !== "object") {
    return { valid: false, violations: ["not-an-object"] };
  }
  if (!Array.isArray(result.scenarios)) {
    return { valid: false, violations: ["scenarios-not-array"] };
  }
  if (result.scenarios.length < minCount) {
    violations.push(`scenarios-too-few:min=${minCount}-got=${result.scenarios.length}`);
  }
  result.scenarios.forEach((s, i) => {
    const tag = `scenarios[${i}]`;
    if (!s || typeof s !== "object") {
      violations.push(`${tag}-not-object`);
      return;
    }
    if (!isNonEmptyString(s.scenario)) violations.push(`${tag}.scenario-empty`);
    if (!SCENARIO_CATEGORIES.has(s.category)) violations.push(`${tag}.category-unknown`);
    if (!SCENARIO_DIFFICULTIES.has(s.difficulty))
      violations.push(`${tag}.difficulty-unknown`);
    if (!Array.isArray(s.expectedComponents)) {
      violations.push(`${tag}.expectedComponents-not-array`);
    } else if (s.expectedComponents.some((c) => !isNonEmptyString(c))) {
      violations.push(`${tag}.expectedComponents-empty-item`);
    }
  });
  return { valid: violations.length === 0, violations };
}

export function validateScenarioEval(evalOut) {
  const violations = [];
  if (!evalOut || typeof evalOut !== "object") {
    return { valid: false, violations: ["not-an-object"] };
  }
  if (!SCENARIO_EVAL_VERDICTS.has(evalOut.verdict)) violations.push("verdict-unknown");
  if (!isNonEmptyString(evalOut.explanation)) violations.push("explanation-empty");

  if (!Array.isArray(evalOut.missedPoints)) {
    violations.push("missedPoints-not-array");
  } else if (evalOut.missedPoints.some((p) => !isNonEmptyString(p))) {
    violations.push("missedPoints-empty-item");
  }
  if (!Array.isArray(evalOut.suggestions)) {
    violations.push("suggestions-not-array");
  } else if (evalOut.suggestions.some((s) => !isNonEmptyString(s))) {
    violations.push("suggestions-empty-item");
  }

  // Refusal detection on explanation.
  if (detectCoachingRefusal(evalOut.explanation)) violations.push("refusal-detected");

  return { valid: violations.length === 0, violations };
}

// ── Problem generation validators (selection + content) ─────────────
//
// Stage 2 of generateProblemsAI returns { selections: [...], learningPath }.
// Stage 3 (per-problem, parallel) returns the per-problem content object.
// Both prompts emit category-specific fields, so the validator takes a
// `category` hint and switches its rules accordingly.
//
// On any violation the controller MUST replace that slot/content with the
// matching buildFallback*. Crucially, fallback output is *clearly marked*
// (titled "[AI Unavailable]") so admins never silently approve a stub —
// see ai.fallbacks.js for the placeholder strings.
const DIFFICULTY_VALUES = new Set(["EASY", "MEDIUM", "HARD"]);
const PLATFORM_VALUES = new Set(["LEETCODE", "OTHER"]);
const URL_CONFIDENCE_VALUES = new Set(["high", "medium", "low"]);
const HR_CATEGORY_VALUES = new Set([
  "CAREER_NARRATIVE",
  "MOTIVATION_AND_FIT",
  "SELF_ASSESSMENT",
  "WORK_STYLE",
  "LOGISTICS",
  "QUESTIONS_FOR_THEM",
]);

// Lenient URL well-formedness — empty string allowed (non-CODING),
// otherwise must parse via URL constructor and use http(s).
function isWellFormedUrlOrEmpty(url) {
  if (typeof url !== "string") return false;
  if (url.trim() === "") return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateProblemSelection(
  result,
  { count, category, urlMode = false } = {},
) {
  const violations = [];
  if (!result || typeof result !== "object") {
    return { valid: false, violations: ["not-an-object"] };
  }

  if (!Array.isArray(result.selections)) {
    return { valid: false, violations: ["selections-not-array"] };
  }

  // URL mode: admin pasted N URLs. AI may not recognize all of them, so
  // `selections` (high-confidence) + `unrecognizedUrls` (low/unknown) must
  // together cover the requested count. learningPath is optional in URL
  // mode — admin picked the order, no AI-curated progression to describe.
  if (urlMode) {
    const unrecognized = result.unrecognizedUrls;
    if (unrecognized != null && !Array.isArray(unrecognized)) {
      violations.push("unrecognizedUrls-not-array");
    } else if (Array.isArray(unrecognized)) {
      unrecognized.forEach((u, i) => {
        if (typeof u !== "string" || u.trim() === "") {
          violations.push(`unrecognizedUrls[${i}]-not-string`);
        }
      });
    }
    if (typeof count === "number") {
      const total =
        result.selections.length +
        (Array.isArray(unrecognized) ? unrecognized.length : 0);
      if (total !== count) {
        violations.push(
          `urls-count-mismatch:expected=${count}-got=${total}`,
        );
      }
    }
  } else {
    if (typeof count === "number" && result.selections.length !== count) {
      violations.push(
        `selections-count-mismatch:expected=${count}-got=${result.selections.length}`,
      );
    }
    if (
      typeof result.learningPath !== "string" ||
      result.learningPath.length === 0
    ) {
      violations.push("learningPath-empty");
    }
  }

  result.selections.forEach((sel, i) => {
    const tag = `selections[${i}]`;
    if (!sel || typeof sel !== "object") {
      violations.push(`${tag}-not-object`);
      return;
    }
    if (!isNonEmptyString(sel.title)) violations.push(`${tag}.title-empty`);
    if (!DIFFICULTY_VALUES.has(sel.difficulty))
      violations.push(`${tag}.difficulty-unknown`);
    if (!PLATFORM_VALUES.has(sel.platform))
      violations.push(`${tag}.platform-unknown`);
    if (!URL_CONFIDENCE_VALUES.has(sel.urlConfidence))
      violations.push(`${tag}.urlConfidence-unknown`);
    if (!isWellFormedUrlOrEmpty(sel.url)) violations.push(`${tag}.url-malformed`);
    if (!isNonEmptyString(sel.whySelected)) violations.push(`${tag}.whySelected-empty`);
    // pattern allowed to be loose ("Not specified" is fine), just must be a string.
    if (typeof sel.pattern !== "string") violations.push(`${tag}.pattern-not-string`);
    // HR category: required-non-null for HR, must be null/missing for others.
    if (category === "HR") {
      if (!HR_CATEGORY_VALUES.has(sel.hrQuestionCategory)) {
        violations.push(`${tag}.hrQuestionCategory-required-for-HR`);
      }
    } else if (
      sel.hrQuestionCategory != null &&
      !HR_CATEGORY_VALUES.has(sel.hrQuestionCategory)
    ) {
      // Allow null/missing; only fail on a present-but-invalid value.
      violations.push(`${tag}.hrQuestionCategory-unknown`);
    }
  });

  return { valid: violations.length === 0, violations };
}

const FOLLOWUP_DIFFICULTIES_REQUIRED = ["EASY", "MEDIUM", "HARD"];

export function validateProblemContent(content, { category } = {}) {
  const violations = [];
  if (!content || typeof content !== "object") {
    return { valid: false, violations: ["not-an-object"] };
  }

  if (!isNonEmptyString(content.description)) violations.push("description-empty");
  if (!isNonEmptyString(content.adminNotes)) violations.push("adminNotes-empty");

  // For non-HR, realWorldContext + useCases must be non-empty strings.
  // For HR, both are intentionally allowed empty.
  if (category !== "HR") {
    if (typeof content.realWorldContext !== "string")
      violations.push("realWorldContext-not-string");
    if (typeof content.useCases !== "string") violations.push("useCases-not-string");
  }

  if (!Array.isArray(content.tags)) violations.push("tags-not-array");
  else if (content.tags.some((t) => !isNonEmptyString(t)))
    violations.push("tags-empty-item");

  // companyTags optional — but when present must be array of strings.
  if (content.companyTags !== undefined) {
    if (!Array.isArray(content.companyTags)) violations.push("companyTags-not-array");
    else if (content.companyTags.some((t) => !isNonEmptyString(t)))
      violations.push("companyTags-empty-item");
  }

  // HR category: required for HR, must be null/absent otherwise.
  if (category === "HR") {
    if (!HR_CATEGORY_VALUES.has(content.hrQuestionCategory)) {
      violations.push("hrQuestionCategory-required-for-HR");
    }
  } else if (
    content.hrQuestionCategory != null &&
    !HR_CATEGORY_VALUES.has(content.hrQuestionCategory)
  ) {
    violations.push("hrQuestionCategory-unknown");
  }

  // followUpQuestions: exactly 3, in EASY/MEDIUM/HARD order, each well-formed.
  if (!Array.isArray(content.followUpQuestions)) {
    violations.push("followUpQuestions-not-array");
  } else {
    if (content.followUpQuestions.length !== 3)
      violations.push(
        `followUpQuestions-count:expected=3-got=${content.followUpQuestions.length}`,
      );
    content.followUpQuestions.forEach((fu, i) => {
      const tag = `followUpQuestions[${i}]`;
      if (!fu || typeof fu !== "object") {
        violations.push(`${tag}-not-object`);
        return;
      }
      if (!isNonEmptyString(fu.question)) violations.push(`${tag}.question-empty`);
      if (!isNonEmptyString(fu.hint)) violations.push(`${tag}.hint-empty`);
      if (!DIFFICULTY_VALUES.has(fu.difficulty))
        violations.push(`${tag}.difficulty-unknown`);
      const expectedDifficulty = FOLLOWUP_DIFFICULTIES_REQUIRED[i];
      if (expectedDifficulty && fu.difficulty !== expectedDifficulty)
        violations.push(`${tag}.difficulty-out-of-order:expected=${expectedDifficulty}`);
    });
  }

  return { valid: violations.length === 0, violations };
}

// ── Mock Interview debrief validator ────────────────────────────────
//
// Validates generateDebrief output. The prompt declares a category-specific
// scores object (CODING / SD / LLD / BEHAVIORAL / HR / etc.) so we don't
// pin exact score keys — only that `scores` exists with at least one
// numeric value. The verdict-anchor rule is the load-bearing one: the
// model is told "MUST equal preComputedVerdict, ±1 step max"; we enforce
// that here so a hallucinated jump (NO_HIRE → STRONG_HIRE) gets caught.
const VERDICT_TIERS = ["NO_HIRE", "LEAN_NO_HIRE", "LEAN_HIRE", "HIRE", "STRONG_HIRE"];

export function validateInterviewDebrief(debrief, { preComputedVerdict } = {}) {
  const violations = [];
  if (!debrief || typeof debrief !== "object") {
    return { valid: false, violations: ["not-an-object"] };
  }

  // ── verdict in enum ──
  const tierIdx = VERDICT_TIERS.indexOf(debrief.verdict);
  if (tierIdx < 0) violations.push("verdict-unknown-tier");

  // ── verdict within 1 step of preComputedVerdict (anchor rule) ──
  if (preComputedVerdict !== undefined) {
    const preIdx = VERDICT_TIERS.indexOf(preComputedVerdict);
    if (preIdx >= 0 && tierIdx >= 0 && Math.abs(tierIdx - preIdx) > 1) {
      violations.push(
        `verdict-too-far-from-precomputed:${preComputedVerdict}->${debrief.verdict}`,
      );
    }
  }

  // ── overallScore 1-10 ──
  if (!isFiniteScore(debrief.overallScore)) violations.push("overallScore-out-of-range");

  // ── scores object ──
  const scores = debrief.scores;
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) {
    violations.push("scores-shape");
  } else {
    const numericValues = Object.values(scores).filter((v) =>
      typeof v === "number" && Number.isFinite(v),
    );
    if (numericValues.length === 0) violations.push("scores-no-numeric-values");
    // Each numeric value should be in a sensible 1-10 range (some rubric
    // fields are 1-4 but those still fall within 1-10).
    for (const [k, v] of Object.entries(scores)) {
      if (typeof v === "number" && Number.isFinite(v) && (v < 1 || v > 10)) {
        violations.push(`scores.${k}-out-of-range`);
      }
    }
  }

  // ── behavioralSignals shape (best-effort) ──
  if (!debrief.behavioralSignals || typeof debrief.behavioralSignals !== "object") {
    violations.push("behavioralSignals-shape");
  }

  // ── arrays of non-empty strings ──
  for (const arrKey of ["strengths", "improvements", "keyMoments"]) {
    const arr = debrief[arrKey];
    if (!Array.isArray(arr)) {
      violations.push(`${arrKey}-not-array`);
      continue;
    }
    if (arr.some((s) => !isNonEmptyString(s))) violations.push(`${arrKey}-empty-item`);
  }

  // ── summary ──
  if (!isNonEmptyString(debrief.summary)) violations.push("summary-empty");

  // ── refusal detection ──
  const refusalProbe = `${debrief.summary || ""}`.toLowerCase().trim();
  if (
    /^i (cannot|can't|am unable to)/.test(refusalProbe) ||
    refusalProbe.includes("i cannot evaluate this interview") ||
    refusalProbe.includes("i'm unable to evaluate")
  ) {
    violations.push("refusal-detected");
  }

  return { valid: violations.length === 0, violations };
}

// ── Canonical answer validator ──────────────────────────────────────
//
// Validates the structured canonical answer that admins store per problem
// (pattern, key insight, complexity). Used to gate the generateCanonicalAnswer
// helper output before persisting — same defend-in-depth pattern as review.
const O_NOTATION_RE = /^O\(.+\)$/;

const canonicalAnswerSchema = z
  .object({
    pattern: z.string().refine(
      (v) => CANONICAL_PATTERN_LABELS.includes(v),
      { message: "pattern must be in CANONICAL_PATTERN_LABELS" },
    ),
    keyInsight: z.string().refine((v) => v.trim().length > 0, {
      message: "keyInsight must be non-empty after trimming",
    }),
    timeComplexity: z.string().regex(O_NOTATION_RE),
    spaceComplexity: z.string().regex(O_NOTATION_RE),
  })
  .strict();

const canonicalAlternativeSchema = z
  .object({
    name: z
      .string()
      .refine((v) => v.trim().length > 0, { message: "name must be non-empty after trimming" })
      .refine((v) => v.length <= 60, { message: "name must be ≤ 60 chars" }),
    pattern: z.string().refine(
      (v) => CANONICAL_PATTERN_LABELS.includes(v),
      { message: "pattern must be in CANONICAL_PATTERN_LABELS" },
    ),
    keyInsight: z
      .string()
      .refine((v) => v.trim().length > 0, { message: "keyInsight must be non-empty after trimming" })
      .refine((v) => v.length <= 600, { message: "keyInsight must be ≤ 600 chars" }),
    timeComplexity: z.string().regex(O_NOTATION_RE),
    spaceComplexity: z.string().regex(O_NOTATION_RE),
  })
  .strict();

/**
 * Validate one canonical alternative item.
 *
 * Note: this validates against CANONICAL_PATTERN_LABELS only — the
 * "alternative.pattern may equal primary.pattern" relaxation is applied
 * at the validateCanonicalAnswer level (where primary is in scope).
 */
export function validateCanonicalAlternative(parsed) {
  if (parsed == null || typeof parsed !== "object") return null;
  const result = canonicalAlternativeSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

// Used internally when an alternative's pattern equals the primary's pattern;
// skips the taxonomy-membership refinement on `pattern` and validates the rest.
// Module-scoped to avoid rebuilding the Zod schema on every call (the
// augmenter in aiCanonical.controller.js calls this in a hot path).
const canonicalAlternativeRelaxedSchema = z
  .object({
    name: z
      .string()
      .refine((v) => v.trim().length > 0)
      .refine((v) => v.length <= 60),
    pattern: z.string().min(1),
    keyInsight: z
      .string()
      .refine((v) => v.trim().length > 0)
      .refine((v) => v.length <= 600),
    timeComplexity: z.string().regex(O_NOTATION_RE),
    spaceComplexity: z.string().regex(O_NOTATION_RE),
  })
  .strict();

// Exported so the augmenter helper in ai.controller.js can also use this path.
export function validateAlternativeAllowingPrimaryPattern(parsed) {
  if (parsed == null || typeof parsed !== "object") return null;
  const result = canonicalAlternativeRelaxedSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

/**
 * Validate, dedup, and cap canonical alternatives, emitting a structured
 * `[canonical:alt-dropped]` console.warn per drop so admin/debug tooling
 * can trace why an alternative was rejected.
 *
 * Drops collected and logged:
 *   zod-invalid     — per-item Zod validation failed
 *   equals-primary  — same (pattern, time, space) tuple as primary
 *   dup-name        — duplicate of an earlier alt's name
 *   dup-tuple       — duplicate of an earlier alt's tuple
 *   over-cap        — beyond MAX_ALTERNATIVES (3)
 *
 * @param {Array} rawAlts  — raw alternatives array from AI output
 * @param {Object} primary — canonical primary (validated upstream)
 * @param {Object} ctx
 * @param {string|null} [ctx.problemId] — for log correlation
 * @param {string} ctx.surface — "canonical-generate" | "canonical-augment"
 * @returns {Array} survivor alternatives (validated, deduped, capped at 3)
 */
export function processAlternatives(rawAlts, primary, { problemId = null, surface }) {
  const drops = [];
  const validated = [];

  const arr = Array.isArray(rawAlts) ? rawAlts : [];
  for (const alt of arr) {
    const v = alt && typeof alt === "object" && alt.pattern === primary.pattern
      ? validateAlternativeAllowingPrimaryPattern(alt)
      : validateCanonicalAlternative(alt);
    if (v) {
      validated.push(v);
    } else {
      drops.push({ item: alt, reason: "zod-invalid" });
    }
  }

  const { kept, dropped } = dedupAndCapAlternatives(validated, primary);
  drops.push(...dropped);

  // Escape backslash first, then double-quote, so AI-hallucinated values
  // containing those characters produce grep-uniform log lines. Order
  // matters: a "-first pass would double-escape backslashes the second
  // pass introduces.
  const escapeLogValue = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  for (const drop of drops) {
    const name = drop.item && typeof drop.item === "object" && typeof drop.item.name === "string"
      ? drop.item.name
      : "?";
    const pattern = drop.item && typeof drop.item === "object" && typeof drop.item.pattern === "string"
      ? drop.item.pattern
      : "?";
    const parts = [
      `surface=${surface}`,
      ...(problemId ? [`problemId=${problemId}`] : []),
      `reason=${drop.reason}`,
      `name="${escapeLogValue(name)}"`,
      `pattern="${escapeLogValue(pattern)}"`,
    ];
    console.warn(`[canonical:alt-dropped] ${parts.join(" ")}`);
  }

  return kept;
}

// surface defaults to "canonical-generate" for backward-compatibility with
// existing test fixtures that call validateCanonicalAnswer(parsed) without
// ctx. New production callers MUST pass ctx explicitly so logs label drops
// with the correct surface (canonical-generate vs canonical-augment).
export function validateCanonicalAnswer(parsed, { problemId = null, surface = "canonical-generate" } = {}) {
  if (parsed == null || typeof parsed !== "object") return null;
  // Strip `alternatives` before strict-schema parse — canonicalAnswerSchema is
  // .strict() and would reject unknown keys. Alternatives are processed separately.
  const { alternatives: rawAltsInput, ...primaryFields } = parsed;
  const result = canonicalAnswerSchema.safeParse(primaryFields);
  if (!result.success) return null;
  const primary = result.data;

  // Validate + dedup + cap alternatives, emitting a structured log per drop.
  const alternatives = processAlternatives(rawAltsInput, primary, { problemId, surface });

  return { ...primary, alternatives };
}

// ── Solution review validator ───────────────────────────────────────
//
// Validates the AI output of solutionReviewPrompt against the exact schema
// the prompt declares (system message, "RESPOND WITH EXACT JSON" block).
// Caller passes the expected followUpQuestionIds so we can enforce the
// echo-back rule (model must use the questionId from the input verbatim).
//
// On any violation the caller MUST discard the LLM output and use
// buildFallbackReview from ./ai.fallbacks.js — same pattern as verdict.
const REVIEW_DIMENSION_KEYS = [
  "codeCorrectness",
  "patternAccuracy",
  "understandingDepth",
  "explanationQuality",
  "confidenceCalibration",
];

function isFiniteScore(n) {
  return typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= 10;
}

function isNonEmptyString(s) {
  return typeof s === "string" && s.trim().length > 0;
}

export function validateReview(review, { followUpQuestionIds = [] } = {}) {
  const violations = [];
  if (!review || typeof review !== "object") {
    return { valid: false, violations: ["not-an-object"] };
  }

  // ── scores: 5 numeric dimensions, each 1-10 ──
  const scores = review.scores;
  if (!scores || typeof scores !== "object") {
    violations.push("scores-shape");
  } else {
    for (const key of REVIEW_DIMENSION_KEYS) {
      if (!isFiniteScore(scores[key])) violations.push(`scores.${key}-out-of-range`);
    }
  }

  // ── flags: shape + cross-field consistency ──
  const flags = review.flags;
  if (!flags || typeof flags !== "object") {
    violations.push("flags-shape");
  } else {
    if (typeof flags.languageMismatch !== "boolean") violations.push("flags.languageMismatch-not-bool");
    if (typeof flags.incompleteSubmission !== "boolean") violations.push("flags.incompleteSubmission-not-bool");
    if (typeof flags.wrongPattern !== "boolean") violations.push("flags.wrongPattern-not-bool");
    // Cross-field: when flagging, the explainer field must be set.
    if (flags.languageMismatch === true && !isNonEmptyString(flags.detectedLanguage)) {
      violations.push("flags.languageMismatch-without-detectedLanguage");
    }
    if (flags.wrongPattern === true && !isNonEmptyString(flags.correctPattern)) {
      violations.push("flags.wrongPattern-without-correctPattern");
    }
  }

  // ── strengths / gaps: arrays of non-empty strings ──
  if (!Array.isArray(review.strengths)) violations.push("strengths-not-array");
  else if (review.strengths.some((s) => !isNonEmptyString(s))) violations.push("strengths-empty-item");
  if (!Array.isArray(review.gaps)) violations.push("gaps-not-array");
  else if (review.gaps.some((g) => !isNonEmptyString(g))) violations.push("gaps-empty-item");

  // ── prose fields ──
  if (!isNonEmptyString(review.improvement)) violations.push("improvement-empty");
  if (!isNonEmptyString(review.interviewTip)) violations.push("interviewTip-empty");
  if (!isNonEmptyString(review.readinessVerdict)) violations.push("readinessVerdict-empty");

  // ── complexityCheck shape ──
  const cc = review.complexityCheck;
  if (!cc || typeof cc !== "object") {
    violations.push("complexityCheck-shape");
  } else {
    if (typeof cc.timeCorrect !== "boolean") violations.push("complexityCheck.timeCorrect-not-bool");
    if (typeof cc.spaceCorrect !== "boolean") violations.push("complexityCheck.spaceCorrect-not-bool");
  }

  // ── followUpEvaluations: every input questionId must be echoed once ──
  if (!Array.isArray(review.followUpEvaluations)) {
    violations.push("followUpEvaluations-not-array");
  } else if (followUpQuestionIds.length > 0) {
    const echoed = new Set(
      review.followUpEvaluations
        .map((e) => (e && typeof e.questionId === "string" ? e.questionId : null))
        .filter(Boolean),
    );
    for (const qid of followUpQuestionIds) {
      if (!echoed.has(qid)) violations.push(`followUp-missing-questionId:${qid}`);
    }
    // Forbid IDs the model invented — prevents silent mismatched scoring.
    const expected = new Set(followUpQuestionIds);
    for (const qid of echoed) {
      if (!expected.has(qid)) violations.push(`followUp-unknown-questionId:${qid}`);
    }
  }

  // ── refusal-detection: AI shouldn't flat-out refuse to review ──
  // Catches cases where the model returns a nominally-valid JSON shape but the
  // prose is "I cannot help with this request" — would otherwise pass schema.
  const refusalProbe = `${review.improvement || ""} ${review.interviewTip || ""} ${review.readinessVerdict || ""}`.toLowerCase();
  if (/^i (cannot|can't|am unable to)/.test(refusalProbe.trim()) ||
      refusalProbe.includes("i cannot review") ||
      refusalProbe.includes("i'm unable to review")) {
    violations.push("refusal-detected");
  }

  return { valid: violations.length === 0, violations };
}

// ════════════════════════════════════════════════════════════════════════════
// NOTES — validators (P4)
// ════════════════════════════════════════════════════════════════════════════

const NOTE_TAG_REGEX = /^[a-z0-9][a-z0-9-]*$/;

export function validateNoteSummary(out, { hasContent = true } = {}) {
  const violations = [];
  if (!out || typeof out !== "object") {
    return { valid: false, violations: ["not-an-object"] };
  }

  if (!isNonEmptyString(out.tldr)) violations.push("tldr-empty");
  else if (out.tldr.length > 280) violations.push("tldr-too-long");

  if (!Array.isArray(out.keyTakeaways)) {
    violations.push("keyTakeaways-not-array");
  } else {
    if (out.keyTakeaways.length < 3 || out.keyTakeaways.length > 5) {
      violations.push(`keyTakeaways-count:got=${out.keyTakeaways.length}`);
    }
    out.keyTakeaways.forEach((b, i) => {
      if (!isNonEmptyString(b)) violations.push(`keyTakeaways[${i}]-empty`);
      else if (b.length > 240) violations.push(`keyTakeaways[${i}]-too-long`);
    });
  }

  if (!Array.isArray(out.openQuestions)) {
    violations.push("openQuestions-not-array");
  } else {
    if (out.openQuestions.length > 3) violations.push("openQuestions-cap-exceeded");
    out.openQuestions.forEach((q, i) => {
      if (!isNonEmptyString(q)) violations.push(`openQuestions[${i}]-empty`);
    });
  }

  if (!isNonEmptyString(out.suggestedReviewFocus)) {
    violations.push("suggestedReviewFocus-empty");
  } else if (out.suggestedReviewFocus.length > 200) {
    violations.push("suggestedReviewFocus-too-long");
  }

  // Sanity: don\047t accept "the note is empty" claims when content is non-empty
  if (hasContent) {
    const probe = `${out.tldr || ""} ${(out.keyTakeaways || []).join(" ")}`.toLowerCase();
    if (
      probe.includes("note is empty") ||
      probe.includes("no content provided") ||
      probe.includes("notes are empty")
    ) {
      violations.push("emptiness-claim-when-content-present");
    }
  }

  return { valid: violations.length === 0, violations };
}

export function validateNoteAutoTag(out, { existingTags = [] } = {}) {
  const violations = [];
  if (!out || typeof out !== "object") {
    return { valid: false, violations: ["not-an-object"] };
  }
  if (!Array.isArray(out.tags)) {
    return { valid: false, violations: ["tags-not-array"] };
  }
  if (out.tags.length < 3 || out.tags.length > 7) {
    violations.push(`tags-count:got=${out.tags.length}`);
  }
  const existing = new Set((existingTags || []).map((t) => String(t).toLowerCase()));
  const seen = new Set();
  out.tags.forEach((t, i) => {
    if (typeof t !== "string") {
      violations.push(`tags[${i}]-not-string`);
      return;
    }
    if (t.length < 2 || t.length > 30) violations.push(`tags[${i}]-len`);
    if (!NOTE_TAG_REGEX.test(t)) violations.push(`tags[${i}]-not-kebab`);
    if (seen.has(t)) violations.push(`tags[${i}]-duplicate`);
    seen.add(t);
    if (existing.has(t.toLowerCase())) violations.push(`tags[${i}]-collides-existing`);
  });
  return { valid: violations.length === 0, violations };
}

const NOTE_FLASHCARD_TYPES = new Set(["CONCEPT", "DEFINITION", "CONTRAST"]);

export function validateNoteFlashcards(out) {
  const violations = [];
  if (!out || typeof out !== "object") {
    return { valid: false, violations: ["not-an-object"] };
  }
  if (!Array.isArray(out.drafts)) {
    return { valid: false, violations: ["drafts-not-array"] };
  }
  if (out.drafts.length < 3 || out.drafts.length > 7) {
    violations.push(`drafts-count:got=${out.drafts.length}`);
  }

  let definitionRatio = 0;
  out.drafts.forEach((d, i) => {
    const tag = `drafts[${i}]`;
    if (!d || typeof d !== "object") {
      violations.push(`${tag}-not-object`);
      return;
    }
    if (!isNonEmptyString(d.front)) violations.push(`${tag}.front-empty`);
    else if (d.front.length > 200) violations.push(`${tag}.front-too-long`);
    if (!isNonEmptyString(d.back)) violations.push(`${tag}.back-empty`);
    else if (d.back.length > 500) violations.push(`${tag}.back-too-long`);
    if (!NOTE_FLASHCARD_TYPES.has(d.type)) violations.push(`${tag}.type-invalid`);
    if (d.type === "DEFINITION") definitionRatio++;
    if (Array.isArray(d.tagSuggestions)) {
      if (d.tagSuggestions.length > 3) {
        violations.push(`${tag}.tagSuggestions-too-many`);
      }
      d.tagSuggestions.forEach((t, j) => {
        if (typeof t !== "string" || !NOTE_TAG_REGEX.test(t)) {
          violations.push(`${tag}.tagSuggestions[${j}]-not-kebab`);
        }
      });
    } else if (d.tagSuggestions !== undefined) {
      violations.push(`${tag}.tagSuggestions-not-array`);
    }
  });

  // Anti-laziness: 5+ drafts can't all be DEFINITION (the model is being lazy
  // and just splitting the note into term/definition pairs).
  if (out.drafts.length >= 5 && definitionRatio === out.drafts.length) {
    violations.push("all-definitions-laziness-signal");
  }

  return { valid: violations.length === 0, violations };
}

export function validateNoteRelated(out, { candidateNoteIds = [], candidateProblemIds = [] } = {}) {
  const violations = [];
  if (!out || typeof out !== "object") {
    return { valid: false, violations: ["not-an-object"] };
  }
  const noteIds = new Set(candidateNoteIds);
  const problemIds = new Set(candidateProblemIds);

  function checkSection(arr, key, idSet) {
    if (!Array.isArray(arr)) {
      violations.push(`${key}-not-array`);
      return;
    }
    if (arr.length > 5) violations.push(`${key}-cap-exceeded`);
    const seen = new Set();
    arr.forEach((item, i) => {
      if (!item || typeof item !== "object") {
        violations.push(`${key}[${i}]-not-object`);
        return;
      }
      if (typeof item.id !== "string" || !item.id) {
        violations.push(`${key}[${i}].id-empty`);
      } else if (!idSet.has(item.id)) {
        violations.push(`${key}[${i}].id-not-in-candidates`);
      } else if (seen.has(item.id)) {
        violations.push(`${key}[${i}].id-duplicate`);
      }
      if (item.id) seen.add(item.id);
      if (!isNonEmptyString(item.rationale)) {
        violations.push(`${key}[${i}].rationale-empty`);
      } else if (item.rationale.length > 120) {
        violations.push(`${key}[${i}].rationale-too-long`);
      }
    });
  }

  checkSection(out.relatedNotes, "relatedNotes", noteIds);
  checkSection(out.relatedProblems, "relatedProblems", problemIds);
  return { valid: violations.length === 0, violations };
}

// ── Note from Solution Review ─────────────────────────────────────────
// Validates the structured study-note output. Lenient on optional sections
// (empty arrays are fine), strict on required ones (title, topicsExplained
// must be present and meaningful — that's the whole point of the note).
const NOTE_FROM_SOLUTION_SEVERITIES = new Set(["HIGH", "MED", "LOW"]);
export function validateNoteFromSolution(out) {
  const violations = [];
  if (!out || typeof out !== "object") {
    return { valid: false, violations: ["not-an-object"] };
  }

  if (!isNonEmptyString(out.title)) violations.push("title-empty");
  else if (out.title.length > 200) violations.push("title-too-long");

  if (!Array.isArray(out.tags)) violations.push("tags-not-array");
  else {
    if (out.tags.length > 12) violations.push("tags-too-many");
    out.tags.forEach((t, i) => {
      if (typeof t !== "string" || !NOTE_TAG_REGEX.test(t)) {
        violations.push(`tags[${i}]-not-kebab`);
      }
    });
  }

  // Optional bullet sections — must be arrays of non-empty strings if present.
  for (const key of [
    "whatYouGotRight",
    "mistakes",
    "howToOvercome",
    "betterApproachNextTime",
  ]) {
    if (!Array.isArray(out[key])) {
      violations.push(`${key}-not-array`);
      continue;
    }
    out[key].forEach((s, i) => {
      if (!isNonEmptyString(s)) violations.push(`${key}[${i}]-empty`);
    });
  }

  // weakAreas: array of { severity, point }
  if (!Array.isArray(out.weakAreas)) {
    violations.push("weakAreas-not-array");
  } else {
    out.weakAreas.forEach((w, i) => {
      const tag = `weakAreas[${i}]`;
      if (!w || typeof w !== "object") {
        violations.push(`${tag}-not-object`);
        return;
      }
      if (!NOTE_FROM_SOLUTION_SEVERITIES.has(w.severity)) {
        violations.push(`${tag}.severity-invalid`);
      }
      if (!isNonEmptyString(w.point)) violations.push(`${tag}.point-empty`);
    });
  }

  // topicsExplained — required, must have at least one topic with at
  // least 2 explanation points. The whole point of this note is the
  // structured topic explanations; if those are missing or trivial,
  // the AI didn't earn its keep — fall back to the deterministic version.
  if (!Array.isArray(out.topicsExplained)) {
    violations.push("topicsExplained-not-array");
  } else if (out.topicsExplained.length === 0) {
    violations.push("topicsExplained-empty");
  } else {
    out.topicsExplained.forEach((t, i) => {
      const tag = `topicsExplained[${i}]`;
      if (!t || typeof t !== "object") {
        violations.push(`${tag}-not-object`);
        return;
      }
      if (!isNonEmptyString(t.topic)) violations.push(`${tag}.topic-empty`);
      if (!Array.isArray(t.points)) {
        violations.push(`${tag}.points-not-array`);
      } else if (t.points.length < 2) {
        violations.push(`${tag}.points-too-few`);
      } else if (t.points.some((p) => !isNonEmptyString(p))) {
        violations.push(`${tag}.points-empty-item`);
      }
    });
  }

  return { valid: violations.length === 0, violations };
}

// ============================================================================
// Curriculum · content-review validators (Rules 18 + 22-curriculum).
// ============================================================================
// The curriculum-review AI emits a WORTH_LEARNING / WORTH_WITH_ADJUSTMENTS /
// NOT_WORTH_TIME verdict on a Topic outline. Two deterministic rules gate
// the WORTH_LEARNING verdict against AI hedging:
//
//   Rule 18 — WORTH_LEARNING must cite ≥1 outcome from `outcomes[]` inside
//   `finalRecommendation` (substring match on the first 40 chars of the
//   outcome). Mirrors Rules 8/9 (Pattern Mastery + Solution Depth) — a
//   permissive verdict without a concrete grounded citation is unreliable.
//
//   Rule 22 (curriculum part) — WORTH_LEARNING requires `outcomes.length ≥ 4`.
//   A permissive verdict with <4 outcomes indicates the AI didn't do the
//   outcome-mapping work.
//
// Fallback (NOT_WORTH_TIME) fires on any rule throw — never a false-positive
// WORTH_LEARNING.

// Rule 18 — WORTH_LEARNING must cite ≥1 outcome in finalRecommendation.
function checkRule18Curriculum(data) {
  if (data.verdict !== "WORTH_LEARNING") return;
  const rec = data.finalRecommendation.toLowerCase();
  const hit = data.outcomes.some((outcome) => {
    // Full outcome strings are too long to appear verbatim in a natural-
    // language recommendation. Match on the first 40 chars as a keyword;
    // skip too-short outcomes (would false-positive on generic words).
    const keyword = outcome.toLowerCase().slice(0, 40);
    if (keyword.length < 5) return false;
    return rec.includes(keyword);
  });
  if (!hit) {
    throw new Error(
      "Rule 18 violation: WORTH_LEARNING verdict must cite at least one outcome in finalRecommendation.",
    );
  }
}

// Rule 22 (curriculum part) — structural sanity for WORTH_LEARNING.
function checkRule22Curriculum(data) {
  if (data.verdict === "WORTH_LEARNING" && data.outcomes.length < 4) {
    throw new Error(
      `Rule 22 violation: WORTH_LEARNING requires ≥4 outcomes, got ${data.outcomes.length}.`,
    );
  }
}

/**
 * Validate a curriculum-review verdict against Rules 18 + 22-curriculum.
 * Throws on rule violation. Returns validated data on success.
 *
 * Called by contentReview.service.js after Zod safeParse. On throw, the
 * orchestrator falls back to buildFallbackCurriculumReview (NOT_WORTH_TIME).
 */
export function validateCurriculumReview(data, _sanitizedInputs) {
  // Structural check first — cheaper than the substring scan.
  checkRule22Curriculum(data);
  checkRule18Curriculum(data);
  return data;
}
