// Validator unit tests — golden cases pulled from the prompt's seven hard
// rules. Each rule has at least one passing fixture and one failing fixture
// so a future prompt edit can't silently weaken a check.
import { describe, it, expect } from 'vitest'
import {
    validateVerdict,
    validateReview,
    validateFinalEval,
    validateInterviewDebrief,
    validateProblemSelection,
    validateProblemContent,
    validateCoaching,
    validateScenarioGen,
    validateScenarioEval,
    validateQuizQuestions,
    validateQuizAnalysis,
    extractJSON,
    hashInputPayload,
} from '../../src/services/ai.validators.js'
import {
    buildFallbackVerdict,
    buildFallbackReview,
    buildFallbackFinalEval,
    buildFallbackInterviewDebrief,
    buildFallbackProblemSelection,
    buildFallbackProblemContent,
    buildFallbackCoaching,
    buildFallbackScenarioGen,
    buildFallbackScenarioEval,
    prettyDimName,
} from '../../src/services/ai.fallbacks.js'

// ── Sample evidence shapes ──────────────────────────────────────────
const SPARSE_EVIDENCE = {
    dimensions: [
        { key: 'patternRecognition', status: 'inactive', n: 0 },
        { key: 'solutionDepth', status: 'inactive', n: 0 },
        { key: 'communication', status: 'inactive', n: 0 },
        { key: 'optimization', status: 'inactive', n: 0 },
        { key: 'pressurePerformance', status: 'inactive', n: 0 },
        { key: 'retention', status: 'inactive', n: 0 },
    ],
    overall: { score: null },
    reportCoverage: { active: 0, total: 6, pct: 0 },
    nearestTier: null,
    nextTier: null,
}

const PARTIAL_EVIDENCE = {
    dimensions: [
        { key: 'patternRecognition', status: 'active', n: 4, score: 62 },
        { key: 'solutionDepth', status: 'active', n: 3, score: 58 },
        { key: 'communication', status: 'inactive', n: 0 },
        { key: 'optimization', status: 'inactive', n: 0 },
        { key: 'pressurePerformance', status: 'inactive', n: 0 },
        { key: 'retention', status: 'inactive', n: 0 },
    ],
    overall: { score: 60 },
    reportCoverage: { active: 2, total: 6, pct: 33 },
    nearestTier: null,
    nextTier: { name: 'Tier 3', threshold: 65, gap: 5 },
}

const FULL_EVIDENCE = {
    dimensions: [
        { key: 'patternRecognition', status: 'active', n: 12, score: 78 },
        { key: 'solutionDepth', status: 'active', n: 10, score: 72 },
        { key: 'communication', status: 'active', n: 8, score: 70 },
        { key: 'optimization', status: 'active', n: 7, score: 68 },
        { key: 'pressurePerformance', status: 'active', n: 5, score: 66 },
        { key: 'retention', status: 'active', n: 6, score: 71 },
    ],
    overall: { score: 71 },
    reportCoverage: { active: 6, total: 6, pct: 100 },
    nearestTier: { name: 'Tier 2', threshold: 70, ready: true },
    nextTier: { name: 'FAANG', threshold: 80, gap: 9 },
}

// ── extractJSON ─────────────────────────────────────────────────────
describe('extractJSON', () => {
    it('parses the outermost {...} JSON object', () => {
        const out = extractJSON('preamble blah <thinking>steps</thinking> {"a":1,"b":2} trailing')
        expect(out).toEqual({ a: 1, b: 2 })
    })

    it('handles nested braces correctly', () => {
        const out = extractJSON('foo {"a":{"b":{"c":3}}, "d":4} bar')
        expect(out).toEqual({ a: { b: { c: 3 } }, d: 4 })
    })

    it('returns null on no JSON', () => {
        expect(extractJSON('no braces here')).toBeNull()
    })

    it('returns null on malformed JSON', () => {
        expect(extractJSON('foo {a:1} bar')).toBeNull()
    })

    it('returns null on null input', () => {
        expect(extractJSON(null)).toBeNull()
        expect(extractJSON('')).toBeNull()
    })
})

// ── hashInputPayload ────────────────────────────────────────────────
describe('hashInputPayload', () => {
    it('produces stable 32-char hex hashes', () => {
        const h = hashInputPayload({ a: 1, b: 'two' })
        expect(h).toMatch(/^[0-9a-f]{32}$/)
    })

    it('changes when payload changes', () => {
        const a = hashInputPayload({ x: 1 })
        const b = hashInputPayload({ x: 2 })
        expect(a).not.toBe(b)
    })
})

// ── validateVerdict — happy paths ───────────────────────────────────
describe('validateVerdict — happy paths', () => {
    it('accepts a sparse-profile verdict with correct hedging', () => {
        const v = {
            headline: 'Profile is still being built — too early to assess tier readiness.',
            strengths: [],
            gaps: [],
            readinessNote: 'Profile too sparse to assess tier readiness yet.',
            dataQualityNote: '0 of 6 dimensions active.',
        }
        const r = validateVerdict(v, SPARSE_EVIDENCE)
        expect(r.valid).toBe(true)
        expect(r.violations).toEqual([])
    })

    it('accepts a full-profile verdict with tier name from server', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                { claim: 'Pattern recognition is the strongest signal', evidence: 'score=78 over n=12 solutions', confidence: 'high' },
            ],
            gaps: [
                { claim: 'Pressure performance trails the rest', evidence: 'score=66 over n=5 sessions', action: 'Run more timed mock sessions' },
            ],
            readinessNote: 'Ready for Tier 2 readiness; FAANG is 9 points away.',
            dataQualityNote: '6 of 6 dimensions active at 100% coverage.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE)
        expect(r.valid).toBe(true)
    })
})

// ── validateVerdict — rule-by-rule failure cases ────────────────────
describe('validateVerdict — rule-by-rule rejections', () => {
    it('rejects when a strength cites an inactive dimension (rule 1)', () => {
        const v = {
            headline: 'Building profile — partial signal so far.',
            strengths: [
                { claim: 'Communication is strong', evidence: 'score=70 over n=8', confidence: 'high' },
            ],
            gaps: [],
            readinessNote: 'Too few active dimensions to assess tier readiness.',
            dataQualityNote: '2 of 6 dimensions active.',
        }
        const r = validateVerdict(v, PARTIAL_EVIDENCE)
        expect(r.valid).toBe(false)
        expect(r.violations.some(x => x.startsWith('strengths[0]-cites-inactive'))).toBe(true)
    })

    it('rejects small-sample claim with high confidence and no hedging (rule 2)', () => {
        const v = {
            headline: 'Building profile — 33% coverage so far.',
            strengths: [
                { claim: 'Pattern recognition is your leading dimension', evidence: 'score=62 over n=4 solutions', confidence: 'high' },
            ],
            gaps: [],
            readinessNote: 'Not enough data for tier readiness.',
            dataQualityNote: '2 of 6 dimensions active.',
        }
        const r = validateVerdict(v, PARTIAL_EVIDENCE)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('strengths[0]-small-sample-overclaim')
    })

    it('accepts small-sample claim with high confidence + tentative wording', () => {
        const v = {
            headline: 'Building profile — 33% coverage so far.',
            strengths: [
                { claim: 'Pattern recognition is an early signal', evidence: 'score=62 over n=4 solutions; treat as tentative', confidence: 'high' },
            ],
            gaps: [],
            // Avoid "tier" / "ready" vocabulary so rule 7 doesn't activate.
            readinessNote: 'Not enough data yet — keep practicing to broaden the profile.',
            dataQualityNote: '2 of 6 dimensions active.',
        }
        const r = validateVerdict(v, PARTIAL_EVIDENCE)
        expect(r.valid).toBe(true)
    })

    it('rejects partial-coverage headline missing the partial-vocab hedge (rule 3)', () => {
        const v = {
            headline: 'Strong all-around performance, ready for promotion.',
            strengths: [],
            gaps: [],
            readinessNote: 'Some progress.',
            dataQualityNote: 'partial',
        }
        const r = validateVerdict(v, PARTIAL_EVIDENCE)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('partial-headline-missing-hedge')
    })

    it('rejects when strengths array exceeds cap of 2 (rule 4)', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                { claim: 'a', evidence: '1', confidence: 'high' },
                { claim: 'b', evidence: '2', confidence: 'high' },
                { claim: 'c', evidence: '3', confidence: 'high' },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('strengths-cap')
    })

    it('rejects an evidence field with no number (rule 5)', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                { claim: 'Pattern is strong', evidence: 'they did well overall', confidence: 'high' },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('strengths[0]-evidence-no-number')
    })

    it('rejects readinessNote claiming an unknown tier (rule 7)', () => {
        const v = {
            headline: 'Meeting expectations across 6 of 6 dimensions.',
            strengths: [],
            gaps: [],
            // "Principal" tier is not in the evidence's nearestTier/nextTier.
            // Mentioning "ready" triggers the rule; the named tier must match.
            readinessNote: 'Ready for Principal-level engineering roles at top firms.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('readiness-note-unknown-tier')
    })

    it('rejects malformed strengths/gaps shape', () => {
        const v = {
            headline: 'Building profile — partial signal.',
            strengths: 'not-an-array',
            gaps: [],
            readinessNote: 'x',
            dataQualityNote: 'y',
        }
        const r = validateVerdict(v, PARTIAL_EVIDENCE)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('strengths-cap')
    })

    it('rejects null/undefined input', () => {
        expect(validateVerdict(null, FULL_EVIDENCE).valid).toBe(false)
        expect(validateVerdict(undefined, FULL_EVIDENCE).valid).toBe(false)
        expect(validateVerdict('text', FULL_EVIDENCE).valid).toBe(false)
    })
})

// ── buildFallbackVerdict — must always be valid in shape ─────────────
describe('buildFallbackVerdict', () => {
    it('produces a verdict for sparse evidence', () => {
        const v = buildFallbackVerdict(SPARSE_EVIDENCE)
        expect(typeof v.headline).toBe('string')
        expect(v.headline.length).toBeGreaterThan(0)
        expect(Array.isArray(v.strengths)).toBe(true)
        expect(Array.isArray(v.gaps)).toBe(true)
        expect(typeof v.readinessNote).toBe('string')
        expect(typeof v.dataQualityNote).toBe('string')
    })

    it('produces a partial-coverage verdict that hedges', () => {
        const v = buildFallbackVerdict(PARTIAL_EVIDENCE)
        const headline = v.headline.toLowerCase()
        const PARTIAL_VOCAB = ['building', 'partial', 'still', 'starting', 'early']
        expect(PARTIAL_VOCAB.some(w => headline.includes(w))).toBe(true)
    })

    it('produces a tier-claim verdict only when nearestTier is ready', () => {
        const v = buildFallbackVerdict(FULL_EVIDENCE)
        expect(v.headline).toMatch(/Tier 2/i)
        expect(v.readinessNote).toMatch(/FAANG|Tier 2/i)
    })
})

// ── validateReview ──────────────────────────────────────────────────
const VALID_REVIEW = {
    scores: {
        codeCorrectness: 7,
        patternAccuracy: 8,
        understandingDepth: 6,
        explanationQuality: 7,
        confidenceCalibration: 8,
    },
    flags: {
        languageMismatch: false,
        detectedLanguage: null,
        incompleteSubmission: false,
        wrongPattern: false,
        identifiedPattern: 'Two Pointers',
        correctPattern: null,
    },
    strengths: ['Clear two-pointer setup', 'Correct edge cases for empty input'],
    gaps: ['Could explain time complexity more concisely'],
    improvement: 'Tighten the Feynman explanation to 2 sentences max.',
    interviewTip: 'State the invariant explicitly before coding.',
    readinessVerdict: 'Ready for an early-round technical screen on this pattern.',
    complexityCheck: {
        timeComplexity: 'O(n)',
        spaceComplexity: 'O(1)',
        timeCorrect: true,
        spaceCorrect: true,
        optimizationNote: null,
    },
    followUpEvaluations: [
        { questionId: 'fu-1', score: 7, feedback: 'Solid answer.' },
        { questionId: 'fu-2', score: null, feedback: 'Skipped' },
    ],
}

describe('validateReview — happy paths', () => {
    it('accepts a well-formed review with no follow-ups', () => {
        const r = validateReview({ ...VALID_REVIEW, followUpEvaluations: [] })
        expect(r.valid).toBe(true)
    })

    it('accepts a review whose follow-ups echo expected questionIds', () => {
        const r = validateReview(VALID_REVIEW, {
            followUpQuestionIds: ['fu-1', 'fu-2'],
        })
        expect(r.valid).toBe(true)
    })
})

describe('validateReview — rejections', () => {
    it('rejects null/undefined input', () => {
        expect(validateReview(null).valid).toBe(false)
        expect(validateReview(undefined).valid).toBe(false)
    })

    it('rejects out-of-range dimension scores', () => {
        const v = {
            ...VALID_REVIEW,
            scores: { ...VALID_REVIEW.scores, codeCorrectness: 11 },
        }
        const r = validateReview(v)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('scores.codeCorrectness-out-of-range')
    })

    it('rejects missing dimension', () => {
        const { codeCorrectness, ...rest } = VALID_REVIEW.scores
        const v = { ...VALID_REVIEW, scores: rest }
        const r = validateReview(v)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('scores.codeCorrectness-out-of-range')
    })

    it('rejects wrongPattern=true without correctPattern', () => {
        const v = {
            ...VALID_REVIEW,
            flags: { ...VALID_REVIEW.flags, wrongPattern: true, correctPattern: null },
        }
        const r = validateReview(v)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('flags.wrongPattern-without-correctPattern')
    })

    it('rejects languageMismatch=true without detectedLanguage', () => {
        const v = {
            ...VALID_REVIEW,
            flags: { ...VALID_REVIEW.flags, languageMismatch: true, detectedLanguage: null },
        }
        const r = validateReview(v)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('flags.languageMismatch-without-detectedLanguage')
    })

    it('rejects empty improvement / interviewTip', () => {
        const r = validateReview({ ...VALID_REVIEW, improvement: '' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('improvement-empty')
    })

    it('rejects when follow-ups omit an expected questionId', () => {
        const v = {
            ...VALID_REVIEW,
            followUpEvaluations: [
                { questionId: 'fu-1', score: 7, feedback: 'ok' },
                // fu-2 missing
            ],
        }
        const r = validateReview(v, { followUpQuestionIds: ['fu-1', 'fu-2'] })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('followUp-missing-questionId:fu-2')
    })

    it('rejects when follow-ups include an invented questionId', () => {
        const v = {
            ...VALID_REVIEW,
            followUpEvaluations: [
                { questionId: 'fu-1', score: 7, feedback: 'ok' },
                { questionId: 'fu-INVENTED', score: 5, feedback: 'whatever' },
            ],
        }
        const r = validateReview(v, { followUpQuestionIds: ['fu-1'] })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('followUp-unknown-questionId:fu-INVENTED')
    })

    it('rejects refusal-style improvement text', () => {
        const v = {
            ...VALID_REVIEW,
            improvement: "I cannot review this submission as it appears incomplete.",
        }
        const r = validateReview(v)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('refusal-detected')
    })

    it('rejects malformed scores object', () => {
        const r = validateReview({ ...VALID_REVIEW, scores: 'oops' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('scores-shape')
    })
})

// ── buildFallbackReview ─────────────────────────────────────────────
describe('buildFallbackReview', () => {
    it('produces an output that satisfies its own validator', () => {
        const fallback = buildFallbackReview()
        const r = validateReview(fallback)
        // The fallback's gaps[0] is a non-empty string so gaps-empty-item
        // doesn't fire; flags are all false; scores are all 5; complexityCheck
        // has both bools. Should pass.
        expect(r.valid).toBe(true)
    })

    it('echoes follow-up question IDs back with score=null', () => {
        const fallback = buildFallbackReview({ followUpQuestionIds: ['fu-1', 'fu-2'] })
        expect(fallback.followUpEvaluations).toHaveLength(2)
        expect(fallback.followUpEvaluations.every(e => e.score === null)).toBe(true)
        const r = validateReview(fallback, {
            followUpQuestionIds: ['fu-1', 'fu-2'],
        })
        expect(r.valid).toBe(true)
    })

    it('marks itself with _fallback=true so callers can detect it', () => {
        const fallback = buildFallbackReview()
        expect(fallback._fallback).toBe(true)
    })

    it('weighted score lands at exactly 5.0', () => {
        const fallback = buildFallbackReview()
        const s = fallback.scores
        const weighted =
            s.codeCorrectness * 0.35 +
            s.patternAccuracy * 0.20 +
            s.understandingDepth * 0.20 +
            s.explanationQuality * 0.15 +
            s.confidenceCalibration * 0.10
        expect(weighted).toBeCloseTo(5.0, 5)
    })
})

// ── validateFinalEval ───────────────────────────────────────────────
const VALID_SD_EVAL = {
    dimensions: {
        requirementsCompleteness: 7,
        estimationSoundness: 6,
        apiDesignQuality: 7,
        dataModelCorrectness: 6,
        architectureCoherence: 7,
        deepDiveDepth: 5,
        tradeoffAwareness: 6,
        scenarioResilience: 7,
        scaleReadiness: 6,
        communicationClarity: 7,
    },
    overallScore: 6.5,
    criticalGaps: ['Estimation step missing concurrent-write math'],
    strengths: ['Clear separation between read and write paths'],
    improvements: ['Add a Redis layer between API and DB for the 10K read/sec target'],
    industryComparison: 'Most consumer-scale URL shorteners follow a similar Redis-fronted Postgres pattern (e.g. Bitly historical writeups).',
    readinessVerdict: 'Would pass a Senior-level system design screen at most companies.',
    timeAnalysis: 'Spent appropriate time on requirements; under-allocated to deep-dive.',
    suggestedNextSteps: ['Practice deep-dive on Redis cluster failure modes'],
}

const VALID_LLD_EVAL = {
    dimensions: {
        requirementsCompleteness: 7,
        entityIdentification: 8,
        hierarchyCorrectness: 7,
        patternApplication: 7,
        solidCompliance: 6,
        implementationQuality: 7,
        extensibilityScore: 6,
        scenarioResilience: 7,
        edgeCaseAwareness: 6,
        communicationClarity: 7,
    },
    overallScore: 6.8,
    criticalGaps: [],
    strengths: ['Strategy pattern applied cleanly to fee calculation'],
    improvements: ['Add a UNIQUE constraint on custom alias as a backstop'],
    industryComparison: 'Standard parking-lot LLD pattern, similar to InterviewBit reference implementations.',
    readinessVerdict: 'Would pass a Senior LLD round at most companies.',
    timeAnalysis: 'Time allocation was balanced.',
    suggestedNextSteps: ['Practice concurrent-access edge cases'],
}

describe('validateFinalEval — happy paths', () => {
    it('accepts a well-formed SD evaluation', () => {
        const r = validateFinalEval(VALID_SD_EVAL, { designType: 'SYSTEM_DESIGN' })
        expect(r.valid).toBe(true)
    })

    it('accepts a well-formed LLD evaluation', () => {
        const r = validateFinalEval(VALID_LLD_EVAL, { designType: 'LOW_LEVEL_DESIGN' })
        expect(r.valid).toBe(true)
    })
})

describe('validateFinalEval — rejections', () => {
    it('rejects unknown designType', () => {
        const r = validateFinalEval(VALID_SD_EVAL, { designType: 'BEHAVIORAL' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('unknown-designType')
    })

    it('rejects an SD eval that uses LLD-only dim keys', () => {
        const r = validateFinalEval(VALID_LLD_EVAL, { designType: 'SYSTEM_DESIGN' })
        expect(r.valid).toBe(false)
        // SD requires keys LLD doesn't have, and rejects keys SD doesn't have.
        expect(r.violations.some(v => v.startsWith('dimensions-missing:apiDesignQuality'))).toBe(true)
        expect(r.violations.some(v => v.startsWith('dimensions-extra:entityIdentification'))).toBe(true)
    })

    it('rejects out-of-range dimension score', () => {
        const v = {
            ...VALID_SD_EVAL,
            dimensions: { ...VALID_SD_EVAL.dimensions, deepDiveDepth: 15 },
        }
        const r = validateFinalEval(v, { designType: 'SYSTEM_DESIGN' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('dimensions.deepDiveDepth-out-of-range')
    })

    it('rejects out-of-range overallScore', () => {
        const r = validateFinalEval(
            { ...VALID_SD_EVAL, overallScore: 11 },
            { designType: 'SYSTEM_DESIGN' },
        )
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('overallScore-out-of-range')
    })

    it('rejects criticalGaps cap > 5', () => {
        const v = {
            ...VALID_SD_EVAL,
            criticalGaps: ['a', 'b', 'c', 'd', 'e', 'f'],
        }
        const r = validateFinalEval(v, { designType: 'SYSTEM_DESIGN' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('criticalGaps-cap-exceeded')
    })

    it('rejects suggestedNextSteps cap > 3', () => {
        const v = { ...VALID_SD_EVAL, suggestedNextSteps: ['a', 'b', 'c', 'd'] }
        const r = validateFinalEval(v, { designType: 'SYSTEM_DESIGN' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('suggestedNextSteps-cap-exceeded')
    })

    it('rejects empty industryComparison', () => {
        const r = validateFinalEval(
            { ...VALID_SD_EVAL, industryComparison: '' },
            { designType: 'SYSTEM_DESIGN' },
        )
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('industryComparison-empty')
    })

    it('rejects refusal-style readinessVerdict', () => {
        const r = validateFinalEval(
            { ...VALID_SD_EVAL, readinessVerdict: "I cannot evaluate this design." },
            { designType: 'SYSTEM_DESIGN' },
        )
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('refusal-detected')
    })

    it('rejects missing dimensions object', () => {
        const { dimensions, ...rest } = VALID_SD_EVAL
        const r = validateFinalEval(rest, { designType: 'SYSTEM_DESIGN' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('dimensions-shape')
    })
})

// ── buildFallbackFinalEval ──────────────────────────────────────────
describe('buildFallbackFinalEval', () => {
    it('produces a valid SD fallback', () => {
        const fallback = buildFallbackFinalEval({
            designType: 'SYSTEM_DESIGN',
            phases: { requirements: 'a'.repeat(60), apiDesign: 'b'.repeat(80) },
            scenarios: [],
        })
        const r = validateFinalEval(fallback, { designType: 'SYSTEM_DESIGN' })
        expect(r.valid).toBe(true)
        expect(fallback._fallback).toBe(true)
    })

    it('produces a valid LLD fallback', () => {
        const fallback = buildFallbackFinalEval({
            designType: 'LOW_LEVEL_DESIGN',
            phases: {},
            scenarios: [],
        })
        const r = validateFinalEval(fallback, { designType: 'LOW_LEVEL_DESIGN' })
        expect(r.valid).toBe(true)
    })

    it('caps fallback score at 6 even with full phase completion', () => {
        const phases = Object.fromEntries(
            Array.from({ length: 7 }, (_, i) => [`phase${i}`, 'x'.repeat(200)]),
        )
        const fallback = buildFallbackFinalEval({
            designType: 'SYSTEM_DESIGN',
            phases,
            scenarios: [],
        })
        for (const [k, v] of Object.entries(fallback.dimensions)) {
            if (k === 'scenarioResilience') continue
            expect(v).toBeLessThanOrEqual(6)
        }
    })

    it('uses scenario tally for scenarioResilience', () => {
        const scenarios = [
            { status: 'evaluated', aiVerdict: { verdict: 'PASS' } },
            { status: 'evaluated', aiVerdict: { verdict: 'PASS' } },
            { status: 'evaluated', aiVerdict: { verdict: 'PARTIAL' } },
            { status: 'evaluated', aiVerdict: { verdict: 'FAIL' } },
        ]
        const fallback = buildFallbackFinalEval({
            designType: 'SYSTEM_DESIGN',
            phases: {},
            scenarios,
        })
        // (2 + 0.5*1) / 4 * 10 = 6.25 → round 6
        expect(fallback.dimensions.scenarioResilience).toBe(6)
    })
})

// ── validateInterviewDebrief ────────────────────────────────────────
const VALID_DEBRIEF = {
    verdict: 'LEAN_HIRE',
    overallScore: 6,
    scores: {
        clarifyingQuestions: 3,
        problemDecomposition: 7,
        codeCorrectness: 6,
        communicationWhileCoding: 7,
    },
    behavioralSignals: {
        clarifyingQuestions: 'asked some independently',
        hintsRequired: '1 hint',
        thoughtOutLoud: true,
        identifiedComplexityIndependently: true,
        foundEdgeCasesIndependently: false,
    },
    strengths: [
        'Asked clarifying questions about input constraints before coding',
        'Stated O(n log n) target complexity at minute 8',
    ],
    improvements: [
        'Did not test the empty-array edge case until prompted at minute 22',
    ],
    keyMoments: [
        'Pivoted from O(n^2) brute force to O(n log n) sorted approach after hint',
    ],
    summary: 'Solid mid-tier signal. Clarifying-question instincts are good; edge-case discipline needs work.',
}

describe('validateInterviewDebrief — happy paths', () => {
    it('accepts a well-formed debrief', () => {
        const r = validateInterviewDebrief(VALID_DEBRIEF, {
            preComputedVerdict: 'LEAN_HIRE',
        })
        expect(r.valid).toBe(true)
    })

    it('accepts debrief 1 step away from preComputedVerdict', () => {
        const r = validateInterviewDebrief(
            { ...VALID_DEBRIEF, verdict: 'HIRE' },
            { preComputedVerdict: 'LEAN_HIRE' },
        )
        expect(r.valid).toBe(true)
    })

    it('accepts debrief without preComputedVerdict context', () => {
        const r = validateInterviewDebrief(VALID_DEBRIEF)
        expect(r.valid).toBe(true)
    })
})

describe('validateInterviewDebrief — rejections', () => {
    it('rejects unknown verdict tier', () => {
        const r = validateInterviewDebrief(
            { ...VALID_DEBRIEF, verdict: 'MAYBE_HIRE' },
        )
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('verdict-unknown-tier')
    })

    it('rejects verdict more than 1 step from preComputed', () => {
        const r = validateInterviewDebrief(
            { ...VALID_DEBRIEF, verdict: 'STRONG_HIRE' },
            { preComputedVerdict: 'NO_HIRE' },
        )
        expect(r.valid).toBe(false)
        expect(r.violations.some(v => v.startsWith('verdict-too-far-from-precomputed'))).toBe(true)
    })

    it('rejects out-of-range overallScore', () => {
        const r = validateInterviewDebrief(
            { ...VALID_DEBRIEF, overallScore: 11 },
        )
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('overallScore-out-of-range')
    })

    it('rejects scores object without numeric values', () => {
        const r = validateInterviewDebrief(
            { ...VALID_DEBRIEF, scores: { foo: 'bar' } },
        )
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('scores-no-numeric-values')
    })

    it('rejects out-of-range score in scores object', () => {
        const r = validateInterviewDebrief(
            { ...VALID_DEBRIEF, scores: { ...VALID_DEBRIEF.scores, codeCorrectness: 15 } },
        )
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('scores.codeCorrectness-out-of-range')
    })

    it('rejects empty summary', () => {
        const r = validateInterviewDebrief({ ...VALID_DEBRIEF, summary: '' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('summary-empty')
    })

    it('rejects refusal-style summary', () => {
        const r = validateInterviewDebrief({
            ...VALID_DEBRIEF,
            summary: "I cannot evaluate this interview as no real questions were asked.",
        })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('refusal-detected')
    })

    it('rejects missing behavioralSignals', () => {
        const { behavioralSignals, ...rest } = VALID_DEBRIEF
        const r = validateInterviewDebrief(rest)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('behavioralSignals-shape')
    })

    it('rejects empty-string strength bullet', () => {
        const r = validateInterviewDebrief(
            { ...VALID_DEBRIEF, strengths: ['valid', ''] },
        )
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('strengths-empty-item')
    })
})

// ── buildFallbackInterviewDebrief ───────────────────────────────────
describe('buildFallbackInterviewDebrief', () => {
    it('uses preComputedVerdict directly', () => {
        const fb = buildFallbackInterviewDebrief({
            preComputedVerdict: 'NO_HIRE',
            hintsGiven: 5,
            clarifyingQuestionCount: 0,
        })
        expect(fb.verdict).toBe('NO_HIRE')
        expect(fb.overallScore).toBe(2)
    })

    it('produces a valid output that satisfies its own validator', () => {
        const fb = buildFallbackInterviewDebrief({
            preComputedVerdict: 'LEAN_HIRE',
            hintsGiven: 1,
            clarifyingQuestionCount: 2,
            thoughtOutLoud: true,
            identifiedComplexityIndependently: true,
        })
        const r = validateInterviewDebrief(fb, { preComputedVerdict: 'LEAN_HIRE' })
        expect(r.valid).toBe(true)
    })

    it('falls back to LEAN_NO_HIRE when preComputedVerdict missing', () => {
        const fb = buildFallbackInterviewDebrief()
        expect(fb.verdict).toBe('LEAN_NO_HIRE')
    })

    it('builds deterministic improvement bullets from bad signals', () => {
        const fb = buildFallbackInterviewDebrief({
            preComputedVerdict: 'NO_HIRE',
            hintsGiven: 5,
            clarifyingQuestionCount: 0,
            thoughtOutLoud: false,
            identifiedComplexityIndependently: false,
            foundEdgeCasesIndependently: false,
        })
        expect(fb.improvements.some(s => s.includes('clarifying'))).toBe(true)
        expect(fb.improvements.some(s => s.includes('hint'))).toBe(true)
        expect(fb.improvements.some(s => s.toLowerCase().includes('complexity'))).toBe(true)
    })

    it('echoes provided behavioralSignals back unchanged', () => {
        const computed = {
            clarifyingQuestions: 'asked 3 questions',
            hintsRequired: '0 hints',
            thoughtOutLoud: true,
            identifiedComplexityIndependently: true,
            foundEdgeCasesIndependently: true,
        }
        const fb = buildFallbackInterviewDebrief({
            preComputedVerdict: 'HIRE',
            behavioralSignals: computed,
        })
        expect(fb.behavioralSignals).toMatchObject(computed)
    })

    it('marks itself with _fallback=true', () => {
        const fb = buildFallbackInterviewDebrief()
        expect(fb._fallback).toBe(true)
    })
})

// ── validateProblemSelection ────────────────────────────────────────
const VALID_CODING_SELECTION = {
    selections: [
        {
            title: 'Two Sum',
            difficulty: 'EASY',
            platform: 'LEETCODE',
            url: 'https://leetcode.com/problems/two-sum/',
            urlConfidence: 'high',
            pattern: 'Hash Map',
            whySelected: 'Foundational hashmap pattern for new team members.',
            hrQuestionCategory: null,
        },
        {
            title: 'Valid Parentheses',
            difficulty: 'EASY',
            platform: 'LEETCODE',
            url: 'https://leetcode.com/problems/valid-parentheses/',
            urlConfidence: 'high',
            pattern: 'Stack',
            whySelected: 'Builds on the previous pattern with stack mechanics.',
            hrQuestionCategory: null,
        },
    ],
    learningPath: 'Two foundational patterns: hashing then stacks.',
}

const VALID_HR_SELECTION = {
    selections: [
        {
            title: 'Walk me through your resume',
            difficulty: 'EASY',
            platform: 'OTHER',
            url: '',
            urlConfidence: 'low',
            pattern: 'Career Narrative',
            whySelected: 'Standard opener for any HR round.',
            hrQuestionCategory: 'CAREER_NARRATIVE',
        },
    ],
    learningPath: 'Foundational HR opener.',
}

describe('validateProblemSelection — happy paths', () => {
    it('accepts a valid CODING selection list', () => {
        const r = validateProblemSelection(VALID_CODING_SELECTION, {
            count: 2,
            category: 'CODING',
        })
        expect(r.valid).toBe(true)
    })

    it('accepts a valid HR selection list', () => {
        const r = validateProblemSelection(VALID_HR_SELECTION, {
            count: 1,
            category: 'HR',
        })
        expect(r.valid).toBe(true)
    })
})

describe('validateProblemSelection — rejections', () => {
    it('rejects count mismatch', () => {
        const r = validateProblemSelection(VALID_CODING_SELECTION, {
            count: 5,
            category: 'CODING',
        })
        expect(r.valid).toBe(false)
        expect(r.violations.some(v => v.startsWith('selections-count-mismatch'))).toBe(true)
    })

    it('rejects unknown urlConfidence value', () => {
        const v = {
            ...VALID_CODING_SELECTION,
            selections: [
                { ...VALID_CODING_SELECTION.selections[0], urlConfidence: 'unsure' },
                VALID_CODING_SELECTION.selections[1],
            ],
        }
        const r = validateProblemSelection(v, { count: 2, category: 'CODING' })
        expect(r.valid).toBe(false)
        expect(r.violations.some(s => s.endsWith('.urlConfidence-unknown'))).toBe(true)
    })

    it('rejects malformed URL', () => {
        const v = {
            ...VALID_CODING_SELECTION,
            selections: [
                { ...VALID_CODING_SELECTION.selections[0], url: 'not a url' },
                VALID_CODING_SELECTION.selections[1],
            ],
        }
        const r = validateProblemSelection(v, { count: 2, category: 'CODING' })
        expect(r.valid).toBe(false)
        expect(r.violations.some(s => s.endsWith('.url-malformed'))).toBe(true)
    })

    it('rejects HR selection missing hrQuestionCategory', () => {
        const v = {
            ...VALID_HR_SELECTION,
            selections: [{ ...VALID_HR_SELECTION.selections[0], hrQuestionCategory: null }],
        }
        const r = validateProblemSelection(v, { count: 1, category: 'HR' })
        expect(r.valid).toBe(false)
        expect(r.violations.some(s => s.endsWith('.hrQuestionCategory-required-for-HR'))).toBe(true)
    })

    it('rejects unknown difficulty', () => {
        const v = {
            ...VALID_CODING_SELECTION,
            selections: [
                { ...VALID_CODING_SELECTION.selections[0], difficulty: 'TRIVIAL' },
                VALID_CODING_SELECTION.selections[1],
            ],
        }
        const r = validateProblemSelection(v, { count: 2, category: 'CODING' })
        expect(r.valid).toBe(false)
        expect(r.violations.some(s => s.endsWith('.difficulty-unknown'))).toBe(true)
    })

    it('rejects empty learningPath', () => {
        const r = validateProblemSelection(
            { ...VALID_CODING_SELECTION, learningPath: '' },
            { count: 2, category: 'CODING' },
        )
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('learningPath-empty')
    })

    it('rejects when selections is not an array', () => {
        const r = validateProblemSelection({ selections: 'oops', learningPath: 'x' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('selections-not-array')
    })
})

// ── validateProblemContent ──────────────────────────────────────────
const VALID_CODING_CONTENT = {
    description: 'Given an array of integers, return indices of two numbers that add up to a target.',
    realWorldContext: 'This pattern shows up in financial reconciliation and pair-matching scenarios.',
    useCases: 'Stripe — duplicate detection in transaction streams\nGoogle Drive — file deduplication',
    adminNotes: 'Brute force: O(n^2) nested loop. Optimal: O(n) hashmap. Key insight: trade space for time. Top mistakes: forgetting duplicate values, off-by-one indices.',
    tags: ['array', 'hashmap'],
    companyTags: ['Google', 'Amazon'],
    hrQuestionCategory: null,
    followUpQuestions: [
        { question: 'What is the time complexity?', difficulty: 'EASY', hint: 'Count operations per element.' },
        { question: 'How would you parallelize across N workers?', difficulty: 'MEDIUM', hint: 'Think partitioning.' },
        { question: 'What if input fits 10^18?', difficulty: 'HARD', hint: 'Standard ints overflow.' },
    ],
}

const VALID_HR_CONTENT = {
    description: 'Walk me through your resume.',
    realWorldContext: '',
    useCases: '',
    adminNotes: 'Look for narrative coherence. Red flag: gaps without explanation. Strong signal: each role led intentionally to the next.',
    tags: ['career-narrative'],
    companyTags: [],
    hrQuestionCategory: 'CAREER_NARRATIVE',
    followUpQuestions: [
        { question: 'What was the hardest decision in that period?', difficulty: 'EASY', hint: 'Probe authenticity.' },
        { question: 'Why did you make that move specifically?', difficulty: 'MEDIUM', hint: 'Probe motivation.' },
        { question: 'Knowing what you know now, would you change anything?', difficulty: 'HARD', hint: 'Probe self-awareness.' },
    ],
}

describe('validateProblemContent — happy paths', () => {
    it('accepts valid CODING content', () => {
        const r = validateProblemContent(VALID_CODING_CONTENT, { category: 'CODING' })
        expect(r.valid).toBe(true)
    })

    it('accepts valid HR content with empty real-world fields', () => {
        const r = validateProblemContent(VALID_HR_CONTENT, { category: 'HR' })
        expect(r.valid).toBe(true)
    })
})

describe('validateProblemContent — rejections', () => {
    it('rejects missing description', () => {
        const r = validateProblemContent(
            { ...VALID_CODING_CONTENT, description: '' },
            { category: 'CODING' },
        )
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('description-empty')
    })

    it('rejects fewer than 3 follow-ups', () => {
        const v = {
            ...VALID_CODING_CONTENT,
            followUpQuestions: VALID_CODING_CONTENT.followUpQuestions.slice(0, 2),
        }
        const r = validateProblemContent(v, { category: 'CODING' })
        expect(r.valid).toBe(false)
        expect(r.violations.some(s => s.startsWith('followUpQuestions-count'))).toBe(true)
    })

    it('rejects out-of-order follow-up difficulties', () => {
        const v = {
            ...VALID_CODING_CONTENT,
            followUpQuestions: [
                { question: 'q', difficulty: 'HARD', hint: 'h' },
                { question: 'q', difficulty: 'MEDIUM', hint: 'h' },
                { question: 'q', difficulty: 'EASY', hint: 'h' },
            ],
        }
        const r = validateProblemContent(v, { category: 'CODING' })
        expect(r.valid).toBe(false)
        expect(r.violations.some(s => s.includes('difficulty-out-of-order'))).toBe(true)
    })

    it('rejects HR content missing hrQuestionCategory', () => {
        const r = validateProblemContent(
            { ...VALID_HR_CONTENT, hrQuestionCategory: null },
            { category: 'HR' },
        )
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('hrQuestionCategory-required-for-HR')
    })

    it('rejects empty hint in follow-up', () => {
        const v = {
            ...VALID_CODING_CONTENT,
            followUpQuestions: [
                { question: 'q1', difficulty: 'EASY', hint: '' },
                ...VALID_CODING_CONTENT.followUpQuestions.slice(1),
            ],
        }
        const r = validateProblemContent(v, { category: 'CODING' })
        expect(r.valid).toBe(false)
        expect(r.violations.some(s => s.endsWith('.hint-empty'))).toBe(true)
    })
})

// ── buildFallbackProblemSelection / buildFallbackProblemContent ─────
describe('buildFallbackProblemSelection', () => {
    it('produces a CODING fallback that satisfies its own validator', () => {
        const fb = buildFallbackProblemSelection({
            count: 3,
            category: 'CODING',
            platformAssignments: [
                { platform: 'LEETCODE', difficulty: 'EASY' },
                { platform: 'LEETCODE', difficulty: 'MEDIUM' },
                { platform: 'LEETCODE', difficulty: 'HARD' },
            ],
        })
        const r = validateProblemSelection(fb, { count: 3, category: 'CODING' })
        expect(r.valid).toBe(true)
        expect(fb._fallback).toBe(true)
    })

    it('produces an HR fallback with rotating hrQuestionCategory', () => {
        const fb = buildFallbackProblemSelection({ count: 3, category: 'HR' })
        const r = validateProblemSelection(fb, { count: 3, category: 'HR' })
        expect(r.valid).toBe(true)
        const hrCats = fb.selections.map(s => s.hrQuestionCategory)
        expect(new Set(hrCats).size).toBe(3) // all different
    })

    it('marks every title with the [AI Unavailable] prefix', () => {
        const fb = buildFallbackProblemSelection({ count: 2 })
        for (const sel of fb.selections) {
            expect(sel.title).toContain('[AI Unavailable')
        }
    })
})

describe('buildFallbackProblemContent', () => {
    it('produces valid CODING content stub', () => {
        const fb = buildFallbackProblemContent({ title: 'Two Sum', category: 'CODING' })
        const r = validateProblemContent(fb, { category: 'CODING' })
        expect(r.valid).toBe(true)
        expect(fb._fallback).toBe(true)
    })

    it('produces valid HR content stub with hrQuestionCategory', () => {
        const fb = buildFallbackProblemContent({ title: 'Resume walk', category: 'HR' })
        const r = validateProblemContent(fb, { category: 'HR' })
        expect(r.valid).toBe(true)
    })

    it('always uses an admin warning prefix in description', () => {
        const fb = buildFallbackProblemContent({ title: 'X', category: 'CODING' })
        expect(fb.description).toContain('AI generation unavailable')
    })

    it('produces 3 follow-ups in EASY/MEDIUM/HARD order', () => {
        const fb = buildFallbackProblemContent({ category: 'CODING' })
        expect(fb.followUpQuestions.map(f => f.difficulty)).toEqual(['EASY', 'MEDIUM', 'HARD'])
    })
})

// ── validateCoaching ────────────────────────────────────────────────
describe('validateCoaching — validate mode', () => {
    const VALIDATE_OK = {
        response: 'You listed 5 functional requirements but missed non-functional — what is your latency target?',
        verdict: 'needs_work',
        specificStrength: 'Strong functional requirements list with concrete numbers.',
        specificGap: 'Missing non-functional requirements (latency, availability).',
    }

    it('accepts a well-formed validate response', () => {
        expect(validateCoaching(VALIDATE_OK, { mode: 'validate' }).valid).toBe(true)
    })

    it('accepts null specificGap', () => {
        const r = validateCoaching({ ...VALIDATE_OK, specificGap: null }, { mode: 'validate' })
        expect(r.valid).toBe(true)
    })

    it('rejects unknown verdict', () => {
        const r = validateCoaching({ ...VALIDATE_OK, verdict: 'mid' }, { mode: 'validate' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('verdict-unknown')
    })

    it('rejects empty response', () => {
        const r = validateCoaching({ ...VALIDATE_OK, response: '' }, { mode: 'validate' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('response-empty')
    })

    it('rejects refusal-style response', () => {
        const r = validateCoaching(
            { ...VALIDATE_OK, response: "I cannot help with this." },
            { mode: 'validate' },
        )
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('refusal-detected')
    })
})

describe('validateCoaching — guide mode', () => {
    const GUIDE_OK = {
        response: 'You seem stuck on the data flow — let me ask a few questions.',
        guidingQuestions: [
            'What is the primary purpose of this component?',
            'Which database access pattern matters most here?',
            'What happens when this component is unavailable?',
        ],
        thinkAbout: 'Trace one read request end-to-end before adding more components.',
    }

    it('accepts a well-formed guide response', () => {
        expect(validateCoaching(GUIDE_OK, { mode: 'guide' }).valid).toBe(true)
    })

    it('rejects fewer than 3 guiding questions', () => {
        const r = validateCoaching(
            { ...GUIDE_OK, guidingQuestions: GUIDE_OK.guidingQuestions.slice(0, 2) },
            { mode: 'guide' },
        )
        expect(r.valid).toBe(false)
        expect(r.violations.some(v => v.startsWith('guidingQuestions-count'))).toBe(true)
    })

    it('rejects more than 5 guiding questions', () => {
        const r = validateCoaching(
            { ...GUIDE_OK, guidingQuestions: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] },
            { mode: 'guide' },
        )
        expect(r.valid).toBe(false)
        expect(r.violations.some(v => v.startsWith('guidingQuestions-count'))).toBe(true)
    })

    it('rejects empty thinkAbout', () => {
        const r = validateCoaching({ ...GUIDE_OK, thinkAbout: '' }, { mode: 'guide' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('thinkAbout-empty')
    })
})

describe('validateCoaching — teach mode', () => {
    const TEACH_OK = {
        response: 'CAP theorem in your messaging system means: during a network split, do users see stale messages or get errors? AP is usually correct.',
        conceptExplanation: 'CAP says you cannot have all three of consistency, availability, and partition tolerance.',
        exampleInContext: 'Your chat system would prefer AP — slightly delayed messages beat no service.',
        relatedDecision: 'Use this to decide whether to allow stale reads from replicas during a network split.',
    }

    it('accepts a well-formed teach response', () => {
        expect(validateCoaching(TEACH_OK, { mode: 'teach' }).valid).toBe(true)
    })

    it('rejects empty conceptExplanation', () => {
        const r = validateCoaching(
            { ...TEACH_OK, conceptExplanation: '' },
            { mode: 'teach' },
        )
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('conceptExplanation-empty')
    })

    it('rejects unknown mode', () => {
        const r = validateCoaching(TEACH_OK, { mode: 'evaluate' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('mode-unknown')
    })
})

// ── validateScenarioGen ─────────────────────────────────────────────
const VALID_SCENARIO_GEN = {
    scenarios: [
        {
            scenario: 'Your Redis cluster loses one primary at peak traffic. Walk through how the system degrades.',
            category: 'failure',
            difficulty: 'medium',
            expectedComponents: ['Redis', 'API Server'],
        },
        {
            scenario: 'Two requests modify the same URL mapping at the exact same instant. What happens?',
            category: 'consistency',
            difficulty: 'hard',
            expectedComponents: ['Postgres'],
        },
    ],
}

describe('validateScenarioGen', () => {
    it('accepts a well-formed scenario list', () => {
        expect(validateScenarioGen(VALID_SCENARIO_GEN).valid).toBe(true)
    })

    it('rejects unknown category', () => {
        const v = {
            scenarios: [{ ...VALID_SCENARIO_GEN.scenarios[0], category: 'novel' }],
        }
        const r = validateScenarioGen(v)
        expect(r.valid).toBe(false)
        expect(r.violations.some(s => s.endsWith('.category-unknown'))).toBe(true)
    })

    it('rejects unknown difficulty', () => {
        const v = {
            scenarios: [{ ...VALID_SCENARIO_GEN.scenarios[0], difficulty: 'EASY' }], // wrong case
        }
        const r = validateScenarioGen(v)
        expect(r.valid).toBe(false)
        expect(r.violations.some(s => s.endsWith('.difficulty-unknown'))).toBe(true)
    })

    it('rejects empty expectedComponents item', () => {
        const v = {
            scenarios: [{ ...VALID_SCENARIO_GEN.scenarios[0], expectedComponents: ['Redis', ''] }],
        }
        const r = validateScenarioGen(v)
        expect(r.valid).toBe(false)
        expect(r.violations.some(s => s.endsWith('.expectedComponents-empty-item'))).toBe(true)
    })

    it('rejects too few scenarios when minCount > received', () => {
        const r = validateScenarioGen({ scenarios: [] }, { minCount: 1 })
        expect(r.valid).toBe(false)
        expect(r.violations.some(s => s.startsWith('scenarios-too-few'))).toBe(true)
    })

    it('rejects when scenarios is not an array', () => {
        const r = validateScenarioGen({ scenarios: 'oops' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('scenarios-not-array')
    })
})

// ── validateScenarioEval ────────────────────────────────────────────
const VALID_SCENARIO_EVAL = {
    verdict: 'PARTIAL',
    explanation: 'They identified the cache miss path but did not address the thundering-herd problem.',
    missedPoints: ['Thundering herd on cache miss'],
    suggestions: ['Add request coalescing at the API layer'],
}

describe('validateScenarioEval', () => {
    it('accepts a well-formed evaluation', () => {
        expect(validateScenarioEval(VALID_SCENARIO_EVAL).valid).toBe(true)
    })

    it('accepts PASS verdict with empty arrays', () => {
        const r = validateScenarioEval({
            verdict: 'PASS',
            explanation: 'Correctly traced read path through their architecture.',
            missedPoints: [],
            suggestions: [],
        })
        expect(r.valid).toBe(true)
    })

    it('rejects unknown verdict', () => {
        const r = validateScenarioEval({ ...VALID_SCENARIO_EVAL, verdict: 'OK' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('verdict-unknown')
    })

    it('rejects empty explanation', () => {
        const r = validateScenarioEval({ ...VALID_SCENARIO_EVAL, explanation: '' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('explanation-empty')
    })

    it('rejects refusal-style explanation', () => {
        const r = validateScenarioEval({
            ...VALID_SCENARIO_EVAL,
            explanation: "I cannot help with this evaluation.",
        })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('refusal-detected')
    })
})

// ── buildFallbackCoaching / buildFallbackScenario* ──────────────────
describe('buildFallbackCoaching', () => {
    it('produces validate-mode output that passes its own validator', () => {
        const fb = buildFallbackCoaching({ mode: 'validate' })
        expect(validateCoaching(fb, { mode: 'validate' }).valid).toBe(true)
        expect(fb._fallback).toBe(true)
    })

    it('produces guide-mode output with 3-5 questions', () => {
        const fb = buildFallbackCoaching({ mode: 'guide' })
        expect(validateCoaching(fb, { mode: 'guide' }).valid).toBe(true)
        expect(fb.guidingQuestions.length).toBeGreaterThanOrEqual(3)
        expect(fb.guidingQuestions.length).toBeLessThanOrEqual(5)
    })

    it('produces teach-mode output with all required fields', () => {
        const fb = buildFallbackCoaching({ mode: 'teach' })
        expect(validateCoaching(fb, { mode: 'teach' }).valid).toBe(true)
        expect(fb.conceptExplanation).toBeTruthy()
        expect(fb.exampleInContext).toBeTruthy()
        expect(fb.relatedDecision).toBeTruthy()
    })
})

describe('buildFallbackScenarioGen', () => {
    it('produces output that passes the validator', () => {
        const fb = buildFallbackScenarioGen({ count: 3 })
        expect(validateScenarioGen(fb).valid).toBe(true)
        expect(fb._fallback).toBe(true)
    })

    it('marks every scenario with the [AI Unavailable] prefix', () => {
        const fb = buildFallbackScenarioGen()
        for (const s of fb.scenarios) {
            expect(s.scenario).toContain('[AI Unavailable')
        }
    })
})

describe('buildFallbackScenarioEval', () => {
    it('produces PARTIAL verdict that passes its validator', () => {
        const fb = buildFallbackScenarioEval()
        expect(validateScenarioEval(fb).valid).toBe(true)
        expect(fb.verdict).toBe('PARTIAL')
        expect(fb._fallback).toBe(true)
    })
})

// ── validateQuizQuestions ───────────────────────────────────────────
const VALID_QUIZ = {
    questions: [
        {
            id: 1,
            question: 'What is the time complexity of binary search?',
            options: {
                A: 'O(n)',
                B: 'O(log n)',
                C: 'O(n log n)',
                D: 'O(1)',
            },
            correctAnswer: 'B',
            explanation: 'Binary search halves the search space each step, giving O(log n).',
            difficulty: 'EASY',
        },
        {
            id: 2,
            question: 'Which data structure has O(1) average insertion?',
            options: {
                A: 'Sorted array',
                B: 'Linked list at tail without tail pointer',
                C: 'Hash map',
                D: 'Balanced BST',
            },
            correctAnswer: 'C',
            explanation: 'Hash maps offer O(1) average insertion via hashing.',
            difficulty: 'MEDIUM',
        },
    ],
}

describe('validateQuizQuestions — happy paths', () => {
    it('accepts a well-formed quiz', () => {
        expect(validateQuizQuestions(VALID_QUIZ, { count: 2 }).valid).toBe(true)
    })

    it('accepts without count check when count not provided', () => {
        expect(validateQuizQuestions(VALID_QUIZ).valid).toBe(true)
    })
})

describe('validateQuizQuestions — rejections', () => {
    it('rejects count mismatch', () => {
        const r = validateQuizQuestions(VALID_QUIZ, { count: 5 })
        expect(r.valid).toBe(false)
        expect(r.violations.some(v => v.startsWith('questions-count-mismatch'))).toBe(true)
    })

    it('rejects empty questions array', () => {
        const r = validateQuizQuestions({ questions: [] })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('questions-empty')
    })

    it('rejects non-array questions', () => {
        const r = validateQuizQuestions({ questions: 'oops' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('questions-not-array')
    })

    it('rejects unknown correctAnswer', () => {
        const v = {
            questions: [
                { ...VALID_QUIZ.questions[0], correctAnswer: 'E' },
                VALID_QUIZ.questions[1],
            ],
        }
        const r = validateQuizQuestions(v, { count: 2 })
        expect(r.valid).toBe(false)
        expect(r.violations.some(s => s.endsWith('.correctAnswer-unknown'))).toBe(true)
    })

    it('rejects missing option key', () => {
        const v = {
            questions: [
                {
                    ...VALID_QUIZ.questions[0],
                    options: { A: 'O(n)', B: 'O(log n)', C: 'O(n log n)' /* D missing */ },
                },
            ],
        }
        const r = validateQuizQuestions(v, { count: 1 })
        expect(r.valid).toBe(false)
        expect(r.violations.some(s => s.endsWith('.options.D-empty'))).toBe(true)
    })

    it('rejects extra option keys', () => {
        const v = {
            questions: [
                {
                    ...VALID_QUIZ.questions[0],
                    options: { ...VALID_QUIZ.questions[0].options, E: 'fifth' },
                },
            ],
        }
        const r = validateQuizQuestions(v, { count: 1 })
        expect(r.valid).toBe(false)
        expect(r.violations.some(s => s.includes('options-extra-keys'))).toBe(true)
    })

    it('rejects duplicate distractors', () => {
        const v = {
            questions: [
                {
                    ...VALID_QUIZ.questions[0],
                    options: { A: 'O(n)', B: 'O(log n)', C: 'O(n)', D: 'O(1)' },
                },
            ],
        }
        const r = validateQuizQuestions(v, { count: 1 })
        expect(r.valid).toBe(false)
        expect(r.violations.some(s => s.endsWith('.options-duplicate'))).toBe(true)
    })

    it('rejects unknown difficulty', () => {
        const v = {
            questions: [{ ...VALID_QUIZ.questions[0], difficulty: 'TRIVIAL' }],
        }
        const r = validateQuizQuestions(v, { count: 1 })
        expect(r.valid).toBe(false)
        expect(r.violations.some(s => s.endsWith('.difficulty-unknown'))).toBe(true)
    })

    it('rejects empty question text', () => {
        const v = {
            questions: [{ ...VALID_QUIZ.questions[0], question: '' }],
        }
        const r = validateQuizQuestions(v, { count: 1 })
        expect(r.valid).toBe(false)
        expect(r.violations.some(s => s.endsWith('.question-empty'))).toBe(true)
    })

    it('rejects empty explanation', () => {
        const v = {
            questions: [{ ...VALID_QUIZ.questions[0], explanation: '' }],
        }
        const r = validateQuizQuestions(v, { count: 1 })
        expect(r.valid).toBe(false)
        expect(r.violations.some(s => s.endsWith('.explanation-empty'))).toBe(true)
    })
})

// ── validateQuizAnalysis ────────────────────────────────────────────
const VALID_QUIZ_ANALYSIS = {
    summary: 'You scored 60% with consistent gaps in time complexity reasoning.',
    weakTopics: ['Time complexity', 'Hash map collisions'],
    studyAdvice: [
        'Practice deriving O(log n) from halving recurrences.',
        'Read about chaining vs open addressing.',
        'Drill 5 binary search variations.',
    ],
    encouragement: 'Solid foundation — focus on the analysis side and you will close the gap quickly.',
}

describe('validateQuizAnalysis', () => {
    it('accepts a well-formed analysis', () => {
        expect(validateQuizAnalysis(VALID_QUIZ_ANALYSIS).valid).toBe(true)
    })

    it('accepts empty arrays for weakTopics/studyAdvice', () => {
        const r = validateQuizAnalysis({
            summary: 'Perfect score.',
            weakTopics: [],
            studyAdvice: [],
            encouragement: 'Outstanding.',
        })
        expect(r.valid).toBe(true)
    })

    it('rejects empty summary', () => {
        const r = validateQuizAnalysis({ ...VALID_QUIZ_ANALYSIS, summary: '' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('summary-empty')
    })

    it('rejects non-array weakTopics', () => {
        const r = validateQuizAnalysis({ ...VALID_QUIZ_ANALYSIS, weakTopics: 'topics' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('weakTopics-not-array')
    })

    it('rejects empty-string studyAdvice item', () => {
        const r = validateQuizAnalysis({
            ...VALID_QUIZ_ANALYSIS,
            studyAdvice: ['Real advice', ''],
        })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('studyAdvice-empty-item')
    })

    it('rejects empty encouragement', () => {
        const r = validateQuizAnalysis({ ...VALID_QUIZ_ANALYSIS, encouragement: '' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('encouragement-empty')
    })
})

// ── prettyDimName ───────────────────────────────────────────────────
describe('prettyDimName', () => {
    it('returns human-readable labels', () => {
        expect(prettyDimName('patternRecognition')).toBe('Pattern Recognition')
        expect(prettyDimName('solutionDepth')).toBe('Solution Depth')
        expect(prettyDimName('retention')).toBe('Retention')
    })

    it('falls through to the input on unknown keys', () => {
        expect(prettyDimName('unknownKey')).toBe('unknownKey')
    })
})
