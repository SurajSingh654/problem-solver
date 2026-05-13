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

export function validateProblemSelection(result, { count, category } = {}) {
  const violations = [];
  if (!result || typeof result !== "object") {
    return { valid: false, violations: ["not-an-object"] };
  }

  if (!Array.isArray(result.selections)) {
    return { valid: false, violations: ["selections-not-array"] };
  }
  if (typeof count === "number" && result.selections.length !== count) {
    violations.push(
      `selections-count-mismatch:expected=${count}-got=${result.selections.length}`,
    );
  }
  if (typeof result.learningPath !== "string" || result.learningPath.length === 0) {
    violations.push("learningPath-empty");
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
  const refusalProbe = `${review.improvement || ""} ${review.interviewTip || ""}`.toLowerCase();
  if (/^i (cannot|can't|am unable to)/.test(refusalProbe.trim()) ||
      refusalProbe.includes("i cannot review") ||
      refusalProbe.includes("i'm unable to review")) {
    violations.push("refusal-detected");
  }

  return { valid: violations.length === 0, violations };
}
