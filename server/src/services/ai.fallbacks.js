// ============================================================================
// AI FALLBACKS — Deterministic safe outputs when AI fails
// ============================================================================
//
// Pair each validator in ./ai.validators.js with a fallback here. The
// fallback runs when:
//   • The LLM call throws (network, 429, 5xx, timeout).
//   • The LLM output fails its validator.
//   • AI is rate-limited per-user-per-day.
//
// Fallbacks are the safe state — no retry, no second guess, no AI call
// inside. They produce a working, conservative output the caller can
// return to the user without surfacing infrastructure errors.
//
// Today only buildFallbackVerdict is wired into a controller. The other
// builders are scaffolded for the upcoming phases (Phase 4 of the
// AI Prompts Overhaul) — they currently return null so callers can do
// `fallback ?? throw` while the migration is in flight.
// ============================================================================

// ── Pretty dimension labels (shared with verdict + future review fallback) ──
export function prettyDimName(key) {
  return (
    {
      patternRecognition: "Pattern Recognition",
      solutionDepth: "Solution Depth",
      communication: "Communication",
      optimization: "Optimization",
      pressurePerformance: "Pressure Performance",
      retention: "Retention",
      teachingContributions: "Teaching Contributions",
    }[key] || key
  );
}

// ── Readiness verdict fallback (gold-standard, in production) ───────────────
//
// Always returns a verdict that matches the schema and never overclaims.
// Three branches:
//   1. Too sparse  (active < 3 OR overall == null): generic "still building"
//      headline + inactive dims surfaced as gaps.
//   2. Partial cov (active >= 3, coverage < 50%): partial headline + nearest-tier
//      hint without a tier-readiness claim.
//   3. Data-ready  (active >= 3, overall present): top dim as strength, weakest
//      active < 65 as gap, tier claim only when nearestTier.ready=true.
//
// Conservative by design — over-claiming readiness is the failure mode we
// engineered against; under-claiming is safe.
export function buildFallbackVerdict(evidence) {
  const coverage = evidence.reportCoverage || { active: 0, total: 6, pct: 0 };
  const activeCount = coverage.active ?? 0;
  const coveragePct = coverage.pct ?? 0;
  const overall = evidence.overall?.score ?? null;
  const nearestTier = evidence.nearestTier;
  const nextTier = evidence.nextTier;

  if (activeCount < 3 || overall == null) {
    const inactive = (evidence.dimensions || []).filter((d) => d.status === "inactive");
    const gaps = inactive.slice(0, 2).map((d) => ({
      claim: `${prettyDimName(d.key)} has no measurement yet`,
      evidence: `n=${d.n ?? 0} so far`,
      action: d.activationMessage || "Submit more solutions to unlock this dimension",
    }));
    return {
      headline:
        "Your readiness profile is still being built — not enough data yet to score most dimensions.",
      strengths: [],
      gaps,
      readinessNote:
        "Profile too sparse to assess tier readiness. Keep submitting solutions and requesting AI reviews — dimensions unlock as evidence accumulates.",
      dataQualityNote: `${activeCount} of 6 dimensions currently active.`,
    };
  }

  const activeDims = (evidence.dimensions || []).filter((d) => d.status === "active");
  const topDim = [...activeDims].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const weakDim = [...activeDims]
    .filter((d) => d.score != null && d.score < 65)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];

  const strengths = [];
  if (topDim && topDim.score >= 50) {
    strengths.push({
      claim: `${prettyDimName(topDim.key)} is your leading dimension`,
      evidence: `score=${topDim.score} over n=${topDim.n} data points`,
      confidence: topDim.n >= 5 ? "high" : "tentative",
    });
  }
  const gapsOut = [];
  if (weakDim) {
    gapsOut.push({
      claim: `${prettyDimName(weakDim.key)} is the weakest active dimension`,
      evidence: `score=${weakDim.score} over n=${weakDim.n} data points`,
      action: `Focus practice sessions on ${prettyDimName(
        weakDim.key,
      ).toLowerCase()} over the next week`,
    });
  }

  let headline;
  let readinessNote;
  if (coveragePct < 50) {
    headline = `Partial profile — ${activeCount} of 6 dimensions measured so far. Treat these as early signals.`;
    readinessNote = nearestTier?.name
      ? `Current data suggests you're near the ${nearestTier.name} range, but coverage is still below 50% — not enough evidence to confirm tier readiness.`
      : "Too few active dimensions to assess tier readiness.";
  } else if (nearestTier?.ready) {
    headline = `Meeting ${nearestTier.name} expectations across ${activeCount} of 6 dimensions.`;
    readinessNote = nextTier
      ? `Ready for ${nearestTier.name}. Next tier (${nextTier.name}) is ${nextTier.gap} overall points away.`
      : `Meets the highest tier on record.`;
  } else if (nextTier) {
    headline = `${nextTier.gap} overall points from ${nextTier.name} readiness.`;
    readinessNote = `Currently below the ${nextTier.name} threshold (${nextTier.threshold}); working on gaps would close the distance.`;
  } else {
    headline = `Profile under construction — keep building.`;
    readinessNote = "Continue practicing to reach a tier threshold.";
  }

  return {
    headline,
    strengths,
    gaps: gapsOut,
    readinessNote,
    dataQualityNote: `${activeCount} of 6 dimensions active at ${coveragePct}% coverage.`,
  };
}

// ── Stub builders — wired in Phase 4 of the AI Prompts Overhaul ─────────────
// These return null today. Each will be implemented when its surface migrates
// to the validator + fallback pattern. Keeping them here as the registry so
// future authors know where new fallbacks belong.

// Solution review fallback. Used when the AI call throws, when the LLM
// output fails validateReview, or when AI is rate-limited mid-review.
//
// Conservative by design — every dimension scores 5/10 so the weighted
// overall lands at 5 (mid-tier). No claims, no over-promise. The
// "AI review unavailable" prose tells the user this isn't a real review.
//
// followUpQuestionIds (optional): when provided, we echo each id back with
// score=null so the controller's followUpEvaluations.map alignment doesn't
// break and the existing UI renders cleanly.
export function buildFallbackReview({ followUpQuestionIds = [] } = {}) {
  return {
    scores: {
      codeCorrectness: 5,
      patternAccuracy: 5,
      understandingDepth: 5,
      explanationQuality: 5,
      confidenceCalibration: 5,
    },
    flags: {
      languageMismatch: false,
      detectedLanguage: null,
      incompleteSubmission: false,
      wrongPattern: false,
      identifiedPattern: null,
      correctPattern: null,
    },
    strengths: [],
    gaps: ["AI review unavailable — please retry to get fresh feedback."],
    improvement:
      "AI review couldn't complete this time. Please re-submit for fresh feedback.",
    interviewTip:
      "Try again in a few minutes — the AI service had a transient issue.",
    readinessVerdict: "Cannot assess — AI review failed.",
    complexityCheck: {
      timeComplexity: "",
      spaceComplexity: "",
      timeCorrect: false,
      spaceCorrect: false,
      optimizationNote: null,
    },
    followUpEvaluations: followUpQuestionIds.map((questionId) => ({
      questionId,
      score: null,
      feedback: "Skipped — AI review failed",
    })),
    _fallback: true,
  };
}

// Design Studio final evaluation fallback. Used when the AI call fails
// or its output is rejected by validateFinalEval.
//
// The dimension key set is designType-dependent — the validator rejects
// any key not in the expected list, so we mirror the same lists here.
// Conservative scores (5/10) plus optional "completeness boost" derived
// from how many phases the candidate actually filled in. The boost is
// capped at +2 so we never claim the candidate is at Senior level on a
// fallback path.
const FALLBACK_SD_DIM_KEYS = [
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
const FALLBACK_LLD_DIM_KEYS = [
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

export function buildFallbackFinalEval({
  designType = "SYSTEM_DESIGN",
  phases = {},
  scenarios = [],
} = {}) {
  const keys =
    designType === "LOW_LEVEL_DESIGN" ? FALLBACK_LLD_DIM_KEYS : FALLBACK_SD_DIM_KEYS;

  // Completion ratio: how many phases have meaningful content.
  const phaseValues = Object.values(phases || {});
  const filled = phaseValues.filter(
    (v) => typeof v === "string" && v.trim().length >= 50,
  ).length;
  const totalPhases = Math.max(phaseValues.length, 1);
  const completion = filled / totalPhases; // 0..1

  // Conservative base + small completion boost. Caps at 6/10 so a fallback
  // can never read as Senior-level.
  const baseScore = Math.round(4 + 2 * completion); // 4..6

  // Scenario resilience computed deterministically from the scenarios
  // tally — not delegated to the model.
  const evaluated = (scenarios || []).filter((s) => s?.status === "evaluated");
  const passes = evaluated.filter(
    (s) => s?.aiVerdict?.verdict === "PASS",
  ).length;
  const partials = evaluated.filter(
    (s) => s?.aiVerdict?.verdict === "PARTIAL",
  ).length;
  const totalScenarios = Math.max(evaluated.length, 1);
  const scenarioScore = Math.round(
    Math.min(10, ((passes + 0.5 * partials) / totalScenarios) * 10),
  );

  const dimensions = {};
  for (const k of keys) {
    dimensions[k] = k === "scenarioResilience" ? scenarioScore : baseScore;
  }

  // Weighted-style overall — but we keep it simple and conservative.
  const dimVals = Object.values(dimensions);
  const overallScore = Math.round(
    dimVals.reduce((a, b) => a + b, 0) / dimVals.length,
  );

  return {
    dimensions,
    overallScore,
    criticalGaps: [
      "AI evaluation unavailable — please retry to receive a full review.",
    ],
    strengths: [],
    improvements: [
      "Re-run final evaluation when AI is back online for actionable feedback.",
    ],
    industryComparison:
      "Industry comparison unavailable — fallback evaluation in use.",
    readinessVerdict:
      "Cannot assess readiness — AI evaluation failed. Please retry.",
    timeAnalysis:
      "Time analysis unavailable — fallback evaluation in use.",
    suggestedNextSteps: ["Retry final evaluation when AI is available."],
    _fallback: true,
  };
}

// Mock interview debrief fallback. Used when the AI call fails or the
// output is rejected by validateInterviewDebrief.
//
// The deterministic verdict (preComputedVerdict) is computed from
// behavioral signals upstream — we use it directly here. overallScore is
// derived from the verdict tier so the two stay consistent. behavioralSignals
// echo back the actual computed values so the user still sees real data
// (unlike the AI's prose, which is replaced).
const VERDICT_TO_SCORE = {
  NO_HIRE: 2,
  LEAN_NO_HIRE: 4,
  LEAN_HIRE: 6,
  HIRE: 7,
  STRONG_HIRE: 9,
};

export function buildFallbackInterviewDebrief({
  preComputedVerdict = "LEAN_NO_HIRE",
  behavioralSignals = {},
  hintsGiven = 0,
  clarifyingQuestionCount = 0,
  thoughtOutLoud = false,
  identifiedComplexityIndependently = false,
  foundEdgeCasesIndependently = false,
} = {}) {
  const verdict = VERDICT_TO_SCORE[preComputedVerdict]
    ? preComputedVerdict
    : "LEAN_NO_HIRE";
  const overallScore = VERDICT_TO_SCORE[verdict];

  // Echo signals — the controller computed these deterministically before
  // calling AI; we surface them unchanged so the UI's "behavioral signals"
  // panel still shows real data even on fallback.
  const finalBehavioralSignals = {
    clarifyingQuestions: behavioralSignals.clarifyingQuestions
      ?? `${clarifyingQuestionCount} question${clarifyingQuestionCount !== 1 ? "s" : ""} asked`,
    hintsRequired: behavioralSignals.hintsRequired
      ?? `${hintsGiven} hint${hintsGiven !== 1 ? "s" : ""}`,
    thoughtOutLoud:
      typeof behavioralSignals.thoughtOutLoud === "boolean"
        ? behavioralSignals.thoughtOutLoud
        : thoughtOutLoud,
    identifiedComplexityIndependently:
      typeof behavioralSignals.identifiedComplexityIndependently === "boolean"
        ? behavioralSignals.identifiedComplexityIndependently
        : identifiedComplexityIndependently,
    foundEdgeCasesIndependently:
      typeof behavioralSignals.foundEdgeCasesIndependently === "boolean"
        ? behavioralSignals.foundEdgeCasesIndependently
        : foundEdgeCasesIndependently,
  };

  // Build deterministic strength/improvement bullets from the signals.
  const strengths = [];
  if (clarifyingQuestionCount >= 2) {
    strengths.push(
      `Asked ${clarifyingQuestionCount} clarifying questions before jumping in`,
    );
  }
  if (identifiedComplexityIndependently) {
    strengths.push("Identified time/space complexity without prompting");
  }
  if (foundEdgeCasesIndependently) {
    strengths.push("Surfaced edge cases independently");
  }
  if (thoughtOutLoud) {
    strengths.push("Thought out loud throughout the interview");
  }
  if (strengths.length === 0) {
    strengths.push("Completed the interview session");
  }

  const improvements = [];
  if (clarifyingQuestionCount === 0) {
    improvements.push(
      "Open with clarifying questions — confirm constraints, scale, edge cases before coding",
    );
  }
  if (hintsGiven >= 3) {
    improvements.push(
      `Reduce hint reliance — ${hintsGiven} hints were needed; aim for ≤ 1 in real interviews`,
    );
  }
  if (!identifiedComplexityIndependently) {
    improvements.push(
      "State time and space complexity proactively, not only when asked",
    );
  }
  if (!foundEdgeCasesIndependently) {
    improvements.push(
      "Walk through edge cases (empty, boundary, large) before declaring done",
    );
  }
  if (improvements.length === 0) {
    improvements.push(
      "Continue practicing this interview type to consolidate the skills demonstrated",
    );
  }

  return {
    verdict,
    overallScore,
    scores: {
      // Single placeholder — the rubric varies per category and the AI
      // would normally fill these. Keeping it generic + non-empty so
      // the validator's "scores-no-numeric-values" rule passes.
      overall: overallScore,
    },
    behavioralSignals: finalBehavioralSignals,
    strengths,
    improvements,
    keyMoments: [
      "AI debrief unavailable for this session — review the transcript directly for specific moments",
    ],
    summary:
      "AI debrief couldn't complete this time. Behavioral signals above are computed deterministically from the transcript and remain accurate. Re-run the debrief to get the AI's narrative analysis.",
    _fallback: true,
  };
}

// Problem generation fallbacks. Two pieces, composing:
//   buildFallbackProblemSelection  — replaces a Stage 2 (selection) result
//   buildFallbackProblemContent    — replaces a Stage 3 (per-problem) result
//
// Each stub is *clearly marked* so an admin scanning the preview cards
// cannot miss that the AI output failed and manual editing is required.
// The "[AI Unavailable]" prefix on titles + the warning banner in
// description/adminNotes is the failsafe — silent approval would put a
// useless problem in front of team members.

const PLACEHOLDER_TITLE_PREFIX = "[AI Unavailable — Replace Title]";
const PLACEHOLDER_DESCRIPTION =
  "⚠️ AI generation unavailable. Replace this with a real problem description before approving.";
const PLACEHOLDER_ADMIN_NOTES =
  "⚠️ AI teaching notes unavailable. Replace with real teaching content before approving.";

function placeholderHrCategoryFor(category, slotIdx = 0) {
  if (category !== "HR") return null;
  // Rotate through valid categories so a multi-slot fallback doesn't
  // produce six identical HR slots.
  const rotation = [
    "CAREER_NARRATIVE",
    "MOTIVATION_AND_FIT",
    "SELF_ASSESSMENT",
    "WORK_STYLE",
    "LOGISTICS",
    "QUESTIONS_FOR_THEM",
  ];
  return rotation[slotIdx % rotation.length];
}

export function buildFallbackProblemSelection({
  count = 1,
  category = "CODING",
  platformAssignments = [],
} = {}) {
  const selections = [];
  for (let i = 0; i < count; i++) {
    const slot = platformAssignments[i] || {};
    const platform =
      slot.platform || (category === "CODING" || category === "SQL" ? "LEETCODE" : "OTHER");
    const difficulty =
      slot.difficulty && slot.difficulty !== "auto" ? slot.difficulty : "MEDIUM";
    selections.push({
      title: `${PLACEHOLDER_TITLE_PREFIX} #${i + 1}`,
      difficulty,
      platform,
      url: "",
      urlConfidence: "low",
      pattern: "Not specified",
      whySelected:
        "AI selection failed — replace with a real problem before approving.",
      hrQuestionCategory: placeholderHrCategoryFor(category, i),
    });
  }
  return {
    selections,
    learningPath:
      "AI selection unavailable — replace each slot with a real problem before approving.",
    _fallback: true,
  };
}

export function buildFallbackProblemContent({
  title = "[AI Unavailable]",
  category = "CODING",
} = {}) {
  const isHR = category === "HR";
  return {
    description: `${PLACEHOLDER_DESCRIPTION}\n\nIntended title: "${title}"`,
    realWorldContext: isHR
      ? ""
      : "AI-generated context unavailable. Add real context before approving.",
    useCases: isHR
      ? ""
      : "AI-generated use cases unavailable. Add 3-5 real use cases before approving.",
    adminNotes: PLACEHOLDER_ADMIN_NOTES,
    tags: [],
    companyTags: [],
    hrQuestionCategory: placeholderHrCategoryFor(category, 0),
    followUpQuestions: [
      {
        question: "[Replace with real EASY follow-up before approving]",
        difficulty: "EASY",
        hint: "AI hint unavailable — write a real hint here.",
      },
      {
        question: "[Replace with real MEDIUM follow-up before approving]",
        difficulty: "MEDIUM",
        hint: "AI hint unavailable — write a real hint here.",
      },
      {
        question: "[Replace with real HARD follow-up before approving]",
        difficulty: "HARD",
        hint: "AI hint unavailable — write a real hint here.",
      },
    ],
    _fallback: true,
  };
}

// Backward-compatible alias — the original stub in this file was named
// buildFallbackProblem singular. Some future caller might still expect it.
export const buildFallbackProblem = buildFallbackProblemContent;

// Design Studio coaching fallback. Mode-shaped — the AI Coach UI expects
// different fields per mode (validate / guide / teach), so the fallback
// returns the matching shape for each.
//
// All variants pass their own validator (validateCoaching) so the caller
// can use `usedFallback: true` without further checks.
export function buildFallbackCoaching({ mode = "validate" } = {}) {
  const baseResponse =
    "AI coach unavailable right now — please retry. In the meantime, re-read your phase content and check it against the rubric.";

  if (mode === "guide") {
    return {
      response: baseResponse,
      guidingQuestions: [
        "What is the primary purpose of this phase in your design?",
        "Which constraints from the problem statement most directly shape your decisions here?",
        "What's the most important trade-off you've made — and what did you give up?",
      ],
      thinkAbout:
        "Walk through what your design does on the most common request path, then on the worst-case path.",
      _fallback: true,
    };
  }

  if (mode === "teach") {
    return {
      response: baseResponse,
      conceptExplanation:
        "AI explanation unavailable — please retry. Consult the admin reference notes if available.",
      exampleInContext:
        "AI example unavailable — please retry to get an example tailored to your design.",
      relatedDecision:
        "AI guidance unavailable — please retry to learn what decision this concept unlocks.",
      _fallback: true,
    };
  }

  // default: validate
  return {
    response: baseResponse,
    verdict: "needs_work",
    specificStrength: "AI coach unavailable — please retry to get specific feedback.",
    specificGap: null,
    _fallback: true,
  };
}

// Scenario generation fallback. The AI produces design-specific scenarios
// tied to the candidate's components, which we cannot replicate without
// the model. We return generic but valid stub scenarios per category so
// the UI has something to render — clearly marked as fallbacks.
export function buildFallbackScenarioGen({ count = 3 } = {}) {
  const STUB_SCENARIOS = [
    {
      scenario:
        "[AI Unavailable — Retry For Specific Scenarios] Generic scale challenge: traffic to your system grows 10× overnight. Walk through which component breaks first and how you'd mitigate it.",
      category: "scale",
      difficulty: "medium",
      expectedComponents: ["Replace with components from your design"],
    },
    {
      scenario:
        "[AI Unavailable — Retry For Specific Scenarios] Generic failure challenge: your primary database becomes unreachable for 60 seconds. Trace the request path and explain what users experience.",
      category: "failure",
      difficulty: "medium",
      expectedComponents: ["Replace with components from your design"],
    },
    {
      scenario:
        "[AI Unavailable — Retry For Specific Scenarios] Generic consistency challenge: two requests modify the same record at the exact same instant. What does your design guarantee, and what does it give up?",
      category: "consistency",
      difficulty: "hard",
      expectedComponents: ["Replace with components from your design"],
    },
  ];
  return {
    scenarios: STUB_SCENARIOS.slice(0, Math.max(1, Math.min(count, STUB_SCENARIOS.length))),
    _fallback: true,
  };
}

// Scenario evaluation fallback. We can't judge correctness without the
// model, so we return PARTIAL with a retry hint — neither rewarding the
// candidate (which would inflate scenarioResilience in the final eval)
// nor failing them (which would unfairly drop their score).
export function buildFallbackScenarioEval() {
  return {
    verdict: "PARTIAL",
    explanation:
      "AI scenario evaluation unavailable — please retry. Your response was recorded but not scored.",
    missedPoints: [
      "AI evaluation pending — re-run evaluation when AI is back online for specific feedback.",
    ],
    suggestions: [
      "Retry scenario evaluation. If the issue persists, move to the next scenario and revisit.",
    ],
    _fallback: true,
  };
}

// Quiz has no deterministic fallback by design — fake questions would
// mislead the user worse than a clear "AI is busy, please retry"
// message. The quiz controller validates AI output and returns a 503
// retry response when the output is malformed instead of writing
// useless rows. Kept as a stub returning null so callers that import
// this name still resolve cleanly.
export function buildFallbackQuiz() {
  return null;
}

// ============================================================================
// TEACHING SESSIONS — three deterministic fallbacks (P3)
// ============================================================================
//
// Used when the LLM call fails OR the output is rejected by the
// matching validateTeaching* function. Each is shaped so the caller
// can persist it on TeachingSession.{summary,quiz,topicCoverage} and
// the existing detail-page renderer keeps working — with a
// `_fallback: true` tag the UI surfaces as "AI unavailable, retry".
// ============================================================================

// Tiny utilities — duplicate-free with caller by design (the fallback
// must work even when the AI substrate is broken).
function _firstSentence(text, max = 280) {
  if (!text) return "";
  const trimmed = String(text).trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  // Prefer first period within range.
  const candidate = trimmed.slice(0, max);
  const dot = candidate.lastIndexOf(". ");
  if (dot > 80) return candidate.slice(0, dot + 1);
  return candidate.slice(0, max - 1) + "…";
}

function _markdownHeadings(text, limit = 5) {
  if (!text) return [];
  const lines = String(text).split("\n");
  const heads = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("#")) {
      const stripped = line.replace(/^#+\s*/, "").trim();
      if (stripped.length > 0 && stripped.length <= 240) heads.push(stripped);
      if (heads.length >= limit) break;
    }
  }
  return heads;
}

export function buildFallbackTeachingSummary({
  topic = "(unknown topic)",
  notesMarkdown = "",
} = {}) {
  const tldr = _firstSentence(
    notesMarkdown ||
      `AI summary unavailable for "${topic}" — retry to generate one.`,
    280,
  );
  // 3 minimum required by validator. Pull markdown headings; if too few,
  // pad with safe generic prompts so the artifact still renders.
  const heads = _markdownHeadings(notesMarkdown, 5);
  const filler = [
    "AI-generated takeaways unavailable — read the host's full notes above.",
    "Re-run the AI summary once the service is back online.",
    "Discuss the session with attendees to surface what stuck.",
  ];
  const keyTakeaways = [...heads];
  while (keyTakeaways.length < 3) keyTakeaways.push(filler[keyTakeaways.length]);
  return {
    tldr,
    keyTakeaways: keyTakeaways.slice(0, 5),
    definitions: [],
    openQuestions: [],
    _fallback: true,
  };
}

export function buildFallbackTeachingQuiz({ topic = "" } = {}) {
  // Validator requires 3-5 questions. We return three SHORT questions
  // that work regardless of subject. They're tagged via _fallback so
  // the UI can show "AI unavailable" on this artifact.
  const t = topic && topic.length > 0 ? topic : "this teaching session";
  return {
    questions: [
      {
        question: `Summarize the single most important takeaway from ${t} in your own words.`,
        type: "SHORT",
        answer:
          "Open question — the host's own framing should anchor a 1-2 sentence answer.",
        explanation:
          "AI quiz unavailable. Use this open question to test your own recall instead.",
      },
      {
        question: `Name one decision in your own work where the ideas from ${t} would change what you do next.`,
        type: "SHORT",
        answer:
          "Open question — answer is necessarily personal; reasoning matters more than a specific answer.",
        explanation:
          "AI quiz unavailable. This prompts active recall by tying the topic to your work.",
      },
      {
        question: `What's one thing you're still unsure about after this session, and how would you find out more?`,
        type: "SHORT",
        answer:
          "Open question — surfacing uncertainty + a follow-up action is the goal.",
        explanation:
          "AI quiz unavailable. The metacognitive prompt helps consolidate the session.",
      },
    ],
    _fallback: true,
  };
}

export function buildFallbackTeachingTopicCoverage({
  topic = "",
  notesMarkdown = "",
} = {}) {
  // Naive substring keyword check: tokenize the topic, count how many
  // tokens appear in the notes (case-insensitive). Maps to a coarse
  // score band and PARTIAL verdict. Validator accepts PARTIAL with
  // score 35-74; we hardcode 50 and let the rationale cite that.
  const topicTokens = (topic || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4);
  const notesLower = String(notesMarkdown || "").toLowerCase();
  const hits = topicTokens.filter((t) => notesLower.includes(t)).length;
  const totalTokens = topicTokens.length || 1;
  const naiveCoverage = Math.round((hits / totalTokens) * 100);

  // Force the verdict-band invariant — never below 35 (we'd need real AI
  // to confidently call OFF_TOPIC), never above 74 (we can't claim FULL
  // without real evaluation).
  const score = Math.max(35, Math.min(74, naiveCoverage || 50));

  return {
    coverageScore: score,
    coveredAspects: [],
    missingAspects: [
      "AI evaluation unavailable — re-run topic coverage check when AI is back online.",
    ],
    verdict: "PARTIAL",
    rationale: `Automated check fallback — coverage held at ${score}/100 across ${totalTokens} topic keywords. AI evaluation pending.`,
    _fallback: true,
  };
}

// Backward-compatible alias for any caller that imported the singular
// stub name from the original scaffolding.
export const buildFallbackTeachingNotesArtifacts = (input) => ({
  summary: buildFallbackTeachingSummary(input),
  quiz: buildFallbackTeachingQuiz(input),
  topicCoverage: buildFallbackTeachingTopicCoverage(input),
});
