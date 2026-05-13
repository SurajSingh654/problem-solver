// Validator unit tests — golden cases pulled from the prompt's seven hard
// rules. Each rule has at least one passing fixture and one failing fixture
// so a future prompt edit can't silently weaken a check.
import { describe, it, expect } from 'vitest'
import {
    validateVerdict,
    validateReview,
    extractJSON,
    hashInputPayload,
} from '../../src/services/ai.validators.js'
import {
    buildFallbackVerdict,
    buildFallbackReview,
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
