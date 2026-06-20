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
    validateTeachingSummary,
    validateTeachingQuiz,
    validateTeachingTopicCoverage,
    validateNoteSummary,
    validateNoteAutoTag,
    validateNoteRelated,
    validateNoteFlashcards,
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

// ── validateVerdict — Rule 8 (Pattern Mastery distribution awareness) ──
//
// Active only when evidence.patternMastery is non-null (Coding Pattern
// Mastery v2 flag on). Forces any Pattern Recognition claim to cite a
// distribution number (owned/solid/coreSolidOrAbove) — not just the score.
//
// The score-only path is exactly the "85 from 3 patterns" failure mode
// the v2 redesign addresses; if the verdict prose can hide that, the
// improvement is invisible to users.
describe('validateVerdict — Rule 8 (Pattern Mastery distribution)', () => {
    const FULL_EVIDENCE_WITH_MASTERY = {
        ...FULL_EVIDENCE,
        patternMastery: {
            owned: 5, solid: 4, working: 3, touched: 2, untouched: 11,
            coreSolidOrAbove: 12, coreOwned: 5, totalCore: 15,
        },
    }

    it('accepts a Pattern Recognition strength claim that cites mastery distribution', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                {
                    claim: 'Pattern recognition shows real breadth',
                    evidence: 'score=78 with 12 of 15 FAANG-core patterns at Solid+ and 5 Owned',
                    confidence: 'high',
                },
            ],
            gaps: [
                { claim: 'Pressure performance trails the rest', evidence: 'score=66 over n=5 sessions', action: 'Run more timed mock sessions' },
            ],
            readinessNote: 'Ready for Tier 2 readiness; FAANG is 9 points away.',
            dataQualityNote: '6 of 6 dimensions active at 100% coverage.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE_WITH_MASTERY)
        expect(r.valid).toBe(true)
    })

    it('rejects a Pattern Recognition strength claim that only cites the score', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                {
                    claim: 'Pattern recognition is the strongest signal',
                    // Score + n only — no distribution. The exact failure
                    // mode the legacy formula could hide.
                    evidence: 'score=78 over n=12 data points',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE_WITH_MASTERY)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('strengths[0]-pattern-claim-no-mastery-distribution')
    })

    it('rejects a Pattern Recognition gap claim that only cites the score', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [],
            gaps: [
                {
                    claim: 'Pattern recognition is your weakest dimension',
                    evidence: 'score=42 over n=4 solutions',
                    action: 'Practice more patterns',
                },
            ],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE_WITH_MASTERY)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('gaps[0]-pattern-claim-no-mastery-distribution')
    })

    it('does NOT trigger Rule 8 when patternMastery is absent (legacy flag-off mode)', () => {
        // The exact same verdict as the rejection test above passes when
        // mastery is not in evidence — preserves backward compatibility
        // for users on flag-off Railway services.
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                {
                    claim: 'Pattern recognition is the strongest signal',
                    evidence: 'score=78 over n=12 data points',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE)
        expect(r.valid).toBe(true)
    })

    it('does NOT trigger Rule 8 when claim is about a different dimension', () => {
        // Communication claim, no mention of patterns — Rule 8 should not
        // fire even when patternMastery is in evidence.
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                { claim: 'Communication is well-rounded', evidence: 'score=70 over n=8 ratings', confidence: 'high' },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE_WITH_MASTERY)
        expect(r.valid).toBe(true)
    })
})

// ── validateVerdict — Rule 9 (Solution Depth distribution awareness) ──
//
// Active only when evidence.solutionDepth is non-null (D2 v2 flag on).
// Forces any Solution Depth claim to cite a distribution number — not just
// the score. The score can come from polished Feynman writing without
// probe-passing or retrieval; only the distribution shows real depth.
//
// Mirrors Rule 8's structure (with the same word-boundary regex discipline
// — Rule 8 had a "core" / "score" false-positive that was fixed via \b
// anchors; Rule 9 must not reintroduce that bug).
describe('validateVerdict — Rule 9 (Solution Depth distribution)', () => {
    const FULL_EVIDENCE_WITH_DEPTH = {
        ...FULL_EVIDENCE,
        solutionDepth: {
            owned: 3, defended: 5, explained: 2, documented: 2, none: 0,
            defendedOrAbove: 8, ownedOrAbove: 3, totalCoding: 12,
        },
    }

    it('accepts a Solution Depth strength claim that cites distribution', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                {
                    claim: 'Solution depth shows real probe-passing strength',
                    evidence: 'score=72 with 8 of 12 solutions at Defended+ and 3 Owned',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE_WITH_DEPTH)
        expect(r.valid).toBe(true)
    })

    it('rejects a Solution Depth strength claim that only cites the score', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                {
                    claim: 'Solution depth is your strongest dimension',
                    evidence: 'score=72 over n=10 solutions',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE_WITH_DEPTH)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('strengths[0]-depth-claim-no-distribution')
    })

    it('rejects a Solution Depth gap claim that only cites the score', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [],
            gaps: [
                {
                    claim: 'Solution depth is your weakest dimension',
                    evidence: 'score=42 over n=4 solutions',
                    action: 'Write more reflective text',
                },
            ],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE_WITH_DEPTH)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('gaps[0]-depth-claim-no-distribution')
    })

    it('matches "understanding" as a depth term (catches probe-the-LLM phrasing)', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                {
                    // No literal "depth" — only "understanding". Should still trigger Rule 9.
                    claim: 'Understanding is your strongest dimension',
                    evidence: 'score=78 over n=12 reviews',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE_WITH_DEPTH)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('strengths[0]-depth-claim-no-distribution')
    })

    it('does NOT trigger Rule 9 when solutionDepth is absent (legacy flag-off mode)', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                {
                    claim: 'Solution depth is your strongest dimension',
                    evidence: 'score=72 over n=10 solutions',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE)
        expect(r.valid).toBe(true)
    })

    it('does NOT trigger Rule 9 when claim is about a non-depth dimension', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                { claim: 'Communication is well-rounded', evidence: 'score=70 over n=8 ratings', confidence: 'high' },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE_WITH_DEPTH)
        expect(r.valid).toBe(true)
    })
})

// ── validateVerdict — Rule 10 (Communication source-quality awareness) ──
//
// Active only when evidence.communication is non-null (D3 v2 flag on).
// Forces any Communication subject claim to cite the source — written-only
// signal is research-capped at r ≈ 0.20 (Levashina 2014); calling it
// "strong communication" without acknowledging the source quality is
// exactly the kind of overclaim the verdict layer is engineered to block.
//
// Phrase-anchored regex (lessons from Rule 8's "core/score" + Rule 9):
// word-boundary alone matches incidental phrases like "communication
// style was clear" — those are NOT subject claims. We require the term
// to be the SUBJECT of the claim sentence (start of claim, after
// "is/was/are", or qualified by strong/weak).
describe('validateVerdict — Rule 10 (Communication source quality)', () => {
    const FULL_EVIDENCE_WITH_COMM = {
        ...FULL_EVIDENCE,
        communication: {
            ceiling: 80,
            sourceQuality: 'live-and-ai',
            peerCount: 0,
            mockCount: 2,
            writtenCount: 6,
        },
    }
    const WRITTEN_ONLY_COMM = {
        ...FULL_EVIDENCE,
        communication: {
            ceiling: 55,
            sourceQuality: 'written-only',
            peerCount: 0,
            mockCount: 0,
            writtenCount: 4,
        },
    }

    it('accepts a Communication strength claim that cites source', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                {
                    claim: 'Communication is your strongest dimension',
                    evidence: 'score=72 with 2 mock interviews (ceiling 80) and AI-rated explanations',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE_WITH_COMM)
        expect(r.valid).toBe(true)
    })

    it('rejects a Communication strength claim that only cites the score', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                {
                    claim: 'Communication is your strongest dimension',
                    evidence: 'score=72 over n=10 reviews',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE_WITH_COMM)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('strengths[0]-comm-claim-no-source')
    })

    it('rejects a Communication gap claim that only cites the score', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [],
            gaps: [
                {
                    claim: 'Communication is your weakest dimension',
                    evidence: 'score=42 over n=4 reviews',
                    action: 'Practice more',
                },
            ],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, WRITTEN_ONLY_COMM)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('gaps[0]-comm-claim-no-source')
    })

    it('FALSE-POSITIVE GUARD: incidental "communication style" mid-sentence does NOT trigger', () => {
        // "Their communication style was clear" is not a subject claim
        // about the dim — the subject is "their style". Plan agent push:
        // word-boundary alone admits this kind of noise. Phrase-anchored
        // patterns require subject framing.
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                {
                    claim: 'Pattern recognition is the strongest signal',
                    evidence: 'score=78 with 12 of 15 FAANG-core patterns at Solid+ — communication style across submissions is consistent',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE_WITH_COMM)
        expect(r.valid).toBe(true)
    })

    it('does NOT trigger Rule 10 when communication is absent (legacy flag-off mode)', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                {
                    claim: 'Communication is your strongest dimension',
                    evidence: 'score=72 over n=10 reviews',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE)
        expect(r.valid).toBe(true)
    })

    it('does NOT trigger Rule 10 for non-Communication claims', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                { claim: 'Pattern recognition shows real breadth', evidence: 'score=78 with 12 of 15 FAANG-core patterns at Solid+ and 5 Owned', confidence: 'high' },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE_WITH_COMM)
        expect(r.valid).toBe(true)
    })

    it('matches "weakest dimension" + "communication" pattern even mid-sentence', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [],
            gaps: [
                {
                    claim: 'Your weakest active dimension is Communication',
                    evidence: 'score=42 over n=4',
                    action: 'Practice more',
                },
            ],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, WRITTEN_ONLY_COMM)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('gaps[0]-comm-claim-no-source')
    })
})

// ── validateVerdict — Rule 11 (Optimization trade-off distribution) ──
//
// Active only when evidence.optimization is non-null (D4 v2 flag on).
// Forces any Optimization subject claim to cite the trade-off
// distribution. Schoenfeld 1985 / Voss 1983 establish that explicit
// comparison is what differentiates expert from novice — the dim's
// distribution must be transparent in the prose.
//
// Phrase-anchored regex (Plan agent push): `\bowned\b` alone false-
// matches D2's "5 solutions Owned" prose. The subject pattern requires
// "optimization" or "trade-off" to be the subject of the claim, after
// which distribution patterns can include "owned" without ambiguity.
describe('validateVerdict — Rule 11 (Optimization trade-off distribution)', () => {
    const FULL_EVIDENCE_WITH_OPT = {
        ...FULL_EVIDENCE,
        optimization: {
            owned: 3, tradeOff: 5, optimized: 2, documented: 2, none: 0,
            tradeOffOrAbove: 8, ownedOrAbove: 3, totalCoding: 12,
        },
    }

    it('accepts an Optimization strength claim that cites trade-off distribution', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                {
                    claim: 'Optimization is your strongest dimension',
                    evidence: 'score=78 with 8 of 12 solutions at Trade-off+ and 3 Owned',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE_WITH_OPT)
        expect(r.valid).toBe(true)
    })

    it('rejects an Optimization strength claim that only cites the score', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                {
                    claim: 'Optimization is your strongest dimension',
                    evidence: 'score=78 over n=12 reviews',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE_WITH_OPT)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('strengths[0]-opt-claim-no-distribution')
    })

    it('rejects an Optimization gap claim that only cites the score', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [],
            gaps: [
                {
                    claim: 'Optimization is your weakest dimension',
                    evidence: 'score=42 over n=4 reviews',
                    action: 'Practice more',
                },
            ],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE_WITH_OPT)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('gaps[0]-opt-claim-no-distribution')
    })

    it('FALSE-POSITIVE GUARD: a D2 Solution-Depth claim mentioning "owned" does NOT trigger Rule 11', () => {
        // Plan agent's specific concern: D2 prose like "5 solutions Owned"
        // contains the token `\bowned\b` but is NOT about optimization.
        // The subject must be "optimization" or "trade-off"; this claim
        // is about Solution Depth.
        const FULL_WITH_BOTH = {
            ...FULL_EVIDENCE_WITH_OPT,
            solutionDepth: {
                owned: 3, defended: 5, explained: 2, documented: 2, none: 0,
                defendedOrAbove: 8, ownedOrAbove: 3, totalCoding: 12,
            },
        }
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                {
                    claim: 'Solution depth shows real probe-passing strength',
                    evidence: 'score=72 with 8 of 12 solutions at Defended+ and 3 Owned',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_WITH_BOTH)
        // Rule 9 (depth) accepts because distribution is cited.
        // Rule 11 (opt) does NOT trigger because "optimization"/"trade-off"
        // is not the subject of the claim.
        expect(r.valid).toBe(true)
    })

    it('does NOT trigger Rule 11 when optimization evidence is absent (legacy flag-off mode)', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                {
                    claim: 'Optimization is your strongest dimension',
                    evidence: 'score=78 over n=12 reviews',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE)
        expect(r.valid).toBe(true)
    })

    it('does NOT trigger Rule 11 for non-Optimization claims', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                { claim: 'Communication is well-rounded', evidence: 'score=70 with 3 mock interviews (ceiling 80)', confidence: 'high' },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, {
            ...FULL_EVIDENCE_WITH_OPT,
            communication: {
                ceiling: 80, sourceQuality: 'live-and-ai',
                peerCount: 0, mockCount: 3, writtenCount: 6,
            },
        })
        expect(r.valid).toBe(true)
    })

    it('matches "trade-off reasoning" subject framing', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [],
            gaps: [
                {
                    claim: 'Trade-off reasoning is sparse across recent solutions',
                    evidence: 'score=42 over n=4',
                    action: 'Document complexity comparisons',
                },
            ],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE_WITH_OPT)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('gaps[0]-opt-claim-no-distribution')
    })
})

// ── validateVerdict — Rule 12 (Pressure Performance source quality) ──
//
// Active only when evidence.pressurePerformance is non-null (D5 v2 flag
// on). Forces any Pressure Performance subject claim to cite the source.
// Schmidt-Hunter 1998: work samples r=0.54 vs proxy r ≤ 0.20. Calling
// quiz-only signal "strong pressure performance" is exactly the kind of
// overclaim the verdict layer is engineered to block.
//
// Phrase-anchored regex (lessons from Rule 10/11): "pressure" must be
// the subject of the claim, not just incidental "performed well under
// pressure" prose.
describe('validateVerdict — Rule 12 (Pressure Performance source quality)', () => {
    const FULL_EVIDENCE_WITH_PRESSURE = {
        ...FULL_EVIDENCE,
        pressurePerformance: {
            ceiling: 80,
            sourceQuality: 'live-and-quiz',
            mockCount: 2,
            relevantQuizCount: 5,
            totalQuizzesSeen: 7,
        },
    }
    const QUIZ_ONLY_PRESSURE = {
        ...FULL_EVIDENCE,
        pressurePerformance: {
            ceiling: 40,
            sourceQuality: 'quiz-proxy',
            mockCount: 0,
            relevantQuizCount: 4,
            totalQuizzesSeen: 4,
        },
    }

    it('accepts a Pressure Performance strength claim that cites source', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                {
                    claim: 'Pressure performance is your strongest dimension',
                    evidence: 'score=72 with 2 mock interviews (ceiling 80) and 5 interview-relevant quizzes',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE_WITH_PRESSURE)
        expect(r.valid).toBe(true)
    })

    it('rejects a Pressure Performance strength claim that only cites the score', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                {
                    claim: 'Pressure performance is your strongest dimension',
                    evidence: 'score=72 over n=10 data points',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE_WITH_PRESSURE)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('strengths[0]-pressure-claim-no-source')
    })

    it('rejects a Pressure Performance gap claim that only cites the score', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [],
            gaps: [
                {
                    claim: 'Pressure performance is your weakest dimension',
                    evidence: 'score=40 over n=4',
                    action: 'Practice mocks',
                },
            ],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, QUIZ_ONLY_PRESSURE)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('gaps[0]-pressure-claim-no-source')
    })

    it('FALSE-POSITIVE GUARD: incidental "performed well under pressure" prose does NOT trigger Rule 12', () => {
        // This is a Pattern Recognition claim that mentions "pressure"
        // incidentally — not a subject claim. Plan agent's recurring
        // concern: the SUBJECT must be Pressure Performance.
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                {
                    claim: 'Pattern recognition is the strongest signal',
                    evidence: 'score=78 with 12 of 15 FAANG-core patterns at Solid+ — performed well under pressure on the optimization round',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE_WITH_PRESSURE)
        expect(r.valid).toBe(true)
    })

    it('does NOT trigger Rule 12 when pressurePerformance evidence is absent', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                {
                    claim: 'Pressure performance is your strongest dimension',
                    evidence: 'score=72 over n=10',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE)
        expect(r.valid).toBe(true)
    })

    it('does NOT trigger Rule 12 for non-Pressure claims', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations across 6 of 6 dimensions.',
            strengths: [
                { claim: 'Communication is well-rounded', evidence: 'score=70 with 3 mock interviews (ceiling 80)', confidence: 'high' },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, {
            ...FULL_EVIDENCE_WITH_PRESSURE,
            communication: {
                ceiling: 80, sourceQuality: 'live-and-ai',
                peerCount: 0, mockCount: 3, writtenCount: 6,
            },
        })
        expect(r.valid).toBe(true)
    })
})

// ── validateVerdict — Rule 13 (Retention sample-size honesty) ─────────
//
// Active only when evidence.retention is non-null (D6 v2 flag on).
// Lange, Wang & Dunlosky (2013): small-sample retention scores are
// statistically unreliable. Below n=10 attempts, "high" confidence
// strength claims must hedge with "tentative", "early", "small sample",
// "preliminary", or "emerging". Below n=5, retention can't be claimed
// a strength at all (even with hedging). Gap claims are not policed —
// under-claiming a low retention score is honest.
describe('validateVerdict — Rule 13 (Retention sample-size honesty)', () => {
    // n=7: above the n<5 floor (claim allowed) but below n=10 (must hedge
    // when confidence='high'). Sweet spot for testing the middle band.
    const RETENTION_LOW_N = {
        ...FULL_EVIDENCE,
        retention: { attemptCount: 7, score: 93, leechCount: 0, leechRate: 0 },
    }
    const RETENTION_TOO_FEW = {
        ...FULL_EVIDENCE,
        retention: { attemptCount: 2, score: 95, leechCount: 0, leechRate: 0 },
    }
    const RETENTION_GOOD_N = {
        ...FULL_EVIDENCE,
        retention: { attemptCount: 20, score: 88, leechCount: 1, leechRate: 0.05 },
    }

    it('accepts a Retention strength claim with hedge vocab when n<10', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Knowledge Retention is your leading dimension',
                    evidence: 'score=93 over 7 successful reviews (tentative — small sample; reliability requires ≥10 attempts)',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, RETENTION_LOW_N)
        expect(r.valid).toBe(true)
    })

    it('accepts a Retention strength claim with confidence=tentative when n<10 (no hedge needed)', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Knowledge Retention is leading',
                    evidence: 'score=93 over 7 successful reviews',
                    confidence: 'tentative',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, RETENTION_LOW_N)
        expect(r.valid).toBe(true)
    })

    it('rejects a Retention strength claim with confidence=high + n<10 + no hedge', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Knowledge Retention is your strongest dimension',
                    evidence: 'score=93 across recent successful reviews',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, RETENTION_LOW_N)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('strengths[0]-retention-high-confidence-low-n')
    })

    it('rejects a Retention strength claim outright when n<5 (even with hedge)', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Knowledge Retention is leading (tentative)',
                    evidence: 'score=95 over 2 reviews — early signal',
                    confidence: 'tentative',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, RETENTION_TOO_FEW)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('strengths[0]-retention-claim-too-few-attempts')
    })

    it('accepts a Retention strength claim with confidence=high + no hedge when n>=10', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Knowledge Retention is your leading dimension',
                    evidence: 'score=88 over 20 successful reviews, 1 leech',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, RETENTION_GOOD_N)
        expect(r.valid).toBe(true)
    })

    it('does NOT trigger Rule 13 when evidence.retention is absent (legacy flag-off)', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Knowledge Retention is your strongest dimension',
                    evidence: 'score=93 over n=4 data points',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE)
        expect(r.valid).toBe(true)
    })

    it('does NOT trigger Rule 13 for non-Retention claims', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Pattern recognition is your strongest dimension',
                    evidence: 'score=78 with 12 of 15 FAANG-core patterns at Solid+',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, RETENTION_LOW_N)
        expect(r.valid).toBe(true)
    })

    it('does NOT police gap claims about retention being weak', () => {
        // Under-claiming a low retention score is honest — Rule 13
        // applies only to over-claiming retention as a strength.
        const v = {
            headline: 'Tier 2 progress.',
            strengths: [],
            gaps: [
                {
                    claim: 'Knowledge Retention is the weakest active dimension',
                    evidence: 'score=20 over 4 successful reviews',
                    action: 'Review more solutions to lift retention',
                },
            ],
            readinessNote: 'Below Tier 2 threshold.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, RETENTION_LOW_N)
        expect(r.valid).toBe(true)
    })

    it('fallback output for v2-retention evidence with n<10 passes Rule 13', () => {
        // n=7 — above the n<5 floor (so retention can be a strength) but
        // below n=10 (so the fallback must hedge or use 'tentative').
        const FULL_WITH_RETENTION_LOW_N = {
            dimensions: [
                { key: 'patternRecognition', status: 'active', n: 8, score: 60 },
                { key: 'solutionDepth', status: 'active', n: 8, score: 60 },
                { key: 'communication', status: 'active', n: 8, score: 60 },
                { key: 'optimization', status: 'active', n: 8, score: 60 },
                { key: 'pressurePerformance', status: 'active', n: 8, score: 60 },
                { key: 'retention', status: 'active', n: 7, score: 93 },
            ],
            overall: { score: 65 },
            reportCoverage: { active: 6, total: 6, pct: 100 },
            nearestTier: null,
            nextTier: null,
            retention: { attemptCount: 7, score: 93, leechCount: 0, leechRate: 0 },
        }
        const v = buildFallbackVerdict(FULL_WITH_RETENTION_LOW_N)
        const r = validateVerdict(v, FULL_WITH_RETENTION_LOW_N)
        expect(r.valid).toBe(true)
    })

    it('fallback drops the retention strength entirely when n<5', () => {
        // Even with a top score, n<5 means retention CANNOT be a strength.
        const FULL_WITH_RETENTION_TOO_FEW = {
            dimensions: [
                { key: 'patternRecognition', status: 'active', n: 8, score: 50 },
                { key: 'solutionDepth', status: 'active', n: 8, score: 50 },
                { key: 'communication', status: 'active', n: 8, score: 50 },
                { key: 'optimization', status: 'active', n: 8, score: 50 },
                { key: 'pressurePerformance', status: 'active', n: 8, score: 50 },
                { key: 'retention', status: 'active', n: 2, score: 95 },
            ],
            overall: { score: 55 },
            reportCoverage: { active: 6, total: 6, pct: 100 },
            nearestTier: null,
            nextTier: null,
            retention: { attemptCount: 2, score: 95, leechCount: 0, leechRate: 0 },
        }
        const v = buildFallbackVerdict(FULL_WITH_RETENTION_TOO_FEW)
        const hasRetentionStrength = v.strengths.some((s) =>
            /\bretention\b/i.test(`${s.claim} ${s.evidence}`),
        )
        expect(hasRetentionStrength).toBe(false)
        const r = validateVerdict(v, FULL_WITH_RETENTION_TOO_FEW)
        expect(r.valid).toBe(true)
    })

    it('fallback surfaces a "Persistent leeches detected" gap when leechCount > 0', () => {
        const FULL_WITH_LEECHES = {
            dimensions: [
                { key: 'patternRecognition', status: 'active', n: 8, score: 60 },
                { key: 'solutionDepth', status: 'active', n: 8, score: 60 },
                { key: 'communication', status: 'active', n: 8, score: 60 },
                { key: 'optimization', status: 'active', n: 8, score: 60 },
                { key: 'pressurePerformance', status: 'active', n: 8, score: 60 },
                { key: 'retention', status: 'active', n: 15, score: 70 },
            ],
            overall: { score: 62 },
            reportCoverage: { active: 6, total: 6, pct: 100 },
            nearestTier: null,
            nextTier: null,
            retention: { attemptCount: 15, score: 70, leechCount: 3, leechRate: 0.30 },
        }
        const v = buildFallbackVerdict(FULL_WITH_LEECHES)
        const hasLeechGap = v.gaps.some((g) =>
            /leech|lapseCount/i.test(`${g.claim} ${g.evidence}`),
        )
        expect(hasLeechGap).toBe(true)
        const r = validateVerdict(v, FULL_WITH_LEECHES)
        expect(r.valid).toBe(true)
    })
})

// ── validateVerdict — Rule 14 (Teaching peer-rating sample-size honesty) ──
//
// Active only when evidence.teaching is non-null (D7 v2 flag on AND user
// has hosted ≥1 session). Topping (1996) / Anderson-Shackleton (1990):
// peer-rating reliability stabilizes around 5+ raters. Below ratingCount=5,
// "high" confidence strength claims must hedge. Below ratingCount=3,
// teaching can't be claimed a strength at all. Mirror of Rule 13's structure.
describe('validateVerdict — Rule 14 (Teaching peer-rating sample-size honesty)', () => {
    // n=4: above the n<3 floor (claim allowed) but below n=5 (must hedge
    // when confidence='high'). Sweet spot for testing the middle band.
    const TEACHING_LOW_N = {
        ...FULL_EVIDENCE,
        teaching: {
            score: 60,
            sessionCount: 2,
            ratingCount: 4,
            sourceQuality: 'peer-validated',
            ceiling: 70,
            flaggedSessionCount: 0,
            flagRate: 0,
        },
    }
    const TEACHING_TOO_FEW = {
        ...FULL_EVIDENCE,
        teaching: {
            score: 50,
            sessionCount: 1,
            ratingCount: 2,
            sourceQuality: 'draft-only',
            ceiling: 30,
            flaggedSessionCount: 0,
            flagRate: 0,
        },
    }
    const TEACHING_GOOD_N = {
        ...FULL_EVIDENCE,
        teaching: {
            score: 80,
            sessionCount: 5,
            ratingCount: 12,
            sourceQuality: 'stable-peer-cohort',
            ceiling: 100,
            flaggedSessionCount: 0,
            flagRate: 0,
        },
    }

    it('accepts a Teaching strength claim with hedge vocab when n<5', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Teaching Contributions is your leading dimension',
                    evidence: 'score=60 over 4 peer ratings (tentative — small sample; reliability requires ≥5 ratings)',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '7 of 7 dimensions active.',
        }
        const r = validateVerdict(v, TEACHING_LOW_N)
        expect(r.valid).toBe(true)
    })

    it('accepts a Teaching strength claim with confidence=tentative when n<5 (no hedge needed)', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Teaching Contributions is leading',
                    evidence: 'score=60 over 4 peer ratings',
                    confidence: 'tentative',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '7 of 7 dimensions active.',
        }
        const r = validateVerdict(v, TEACHING_LOW_N)
        expect(r.valid).toBe(true)
    })

    it('rejects a Teaching strength claim with confidence=high + n<5 + no hedge', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Teaching Contributions is your strongest dimension',
                    evidence: 'score=60 across recent peer ratings',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '7 of 7 dimensions active.',
        }
        const r = validateVerdict(v, TEACHING_LOW_N)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('strengths[0]-teaching-high-confidence-low-n')
    })

    it('rejects a Teaching strength claim outright when n<3 (even with hedge)', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Teaching Contributions is leading (tentative)',
                    evidence: 'score=50 over 2 peer ratings — early signal',
                    confidence: 'tentative',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '7 of 7 dimensions active.',
        }
        const r = validateVerdict(v, TEACHING_TOO_FEW)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('strengths[0]-teaching-claim-too-few-ratings')
    })

    it('accepts a Teaching strength claim with confidence=high + no hedge when n>=5', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Teaching Contributions is your leading dimension',
                    evidence: 'score=80 with 12 peer ratings across 5 sessions (stable-peer-cohort)',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '7 of 7 dimensions active.',
        }
        const r = validateVerdict(v, TEACHING_GOOD_N)
        expect(r.valid).toBe(true)
    })

    it('does NOT trigger Rule 14 when evidence.teaching is absent (legacy or non-host)', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Teaching is your strongest dimension',
                    evidence: 'score=60 over n=4 data points',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE)
        expect(r.valid).toBe(true)
    })

    it('does NOT trigger Rule 14 for non-Teaching claims', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Pattern recognition is your strongest dimension',
                    evidence: 'score=78 with 12 of 15 FAANG-core patterns at Solid+',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '7 of 7 dimensions active.',
        }
        const r = validateVerdict(v, TEACHING_LOW_N)
        expect(r.valid).toBe(true)
    })

    it('does NOT police gap claims about teaching being weak', () => {
        // Under-claiming a low teaching score is honest — Rule 14 applies
        // only to over-claiming teaching as a strength.
        const v = {
            headline: 'Tier 2 progress.',
            strengths: [],
            gaps: [
                {
                    claim: 'Teaching Contributions is the weakest active dimension',
                    evidence: 'score=20 over 3 peer ratings',
                    action: 'Host more sessions and request peer feedback',
                },
            ],
            readinessNote: 'Below Tier 2 threshold.',
            dataQualityNote: '7 of 7 dimensions active.',
        }
        const r = validateVerdict(v, TEACHING_LOW_N)
        expect(r.valid).toBe(true)
    })

    it('fallback drops the teaching strength entirely when n<3', () => {
        const FULL_WITH_TEACHING_TOO_FEW = {
            dimensions: [
                { key: 'patternRecognition', status: 'active', n: 8, score: 50 },
                { key: 'solutionDepth', status: 'active', n: 8, score: 50 },
                { key: 'communication', status: 'active', n: 8, score: 50 },
                { key: 'optimization', status: 'active', n: 8, score: 50 },
                { key: 'pressurePerformance', status: 'active', n: 8, score: 50 },
                { key: 'retention', status: 'active', n: 10, score: 50 },
                { key: 'teachingContributions', status: 'active', n: 2, score: 75 },
            ],
            overall: { score: 53 },
            reportCoverage: { active: 7, total: 7, pct: 100 },
            nearestTier: null,
            nextTier: null,
            teaching: {
                score: 75, sessionCount: 1, ratingCount: 2,
                sourceQuality: 'draft-only', ceiling: 30,
                flaggedSessionCount: 0, flagRate: 0,
            },
        }
        const v = buildFallbackVerdict(FULL_WITH_TEACHING_TOO_FEW)
        const hasTeachingStrength = v.strengths.some((s) =>
            /\bteaching\b/i.test(`${s.claim} ${s.evidence}`),
        )
        expect(hasTeachingStrength).toBe(false)
        const r = validateVerdict(v, FULL_WITH_TEACHING_TOO_FEW)
        expect(r.valid).toBe(true)
    })

    it('fallback surfaces a "Teaching sessions have peer flags" gap when flaggedSessionCount > 0', () => {
        const FULL_WITH_FLAGS = {
            dimensions: [
                { key: 'patternRecognition', status: 'active', n: 8, score: 60 },
                { key: 'solutionDepth', status: 'active', n: 8, score: 60 },
                { key: 'communication', status: 'active', n: 8, score: 60 },
                { key: 'optimization', status: 'active', n: 8, score: 60 },
                { key: 'pressurePerformance', status: 'active', n: 8, score: 60 },
                { key: 'retention', status: 'active', n: 12, score: 65 },
                { key: 'teachingContributions', status: 'active', n: 8, score: 55 },
            ],
            overall: { score: 60 },
            reportCoverage: { active: 7, total: 7, pct: 100 },
            nearestTier: null,
            nextTier: null,
            teaching: {
                score: 55, sessionCount: 4, ratingCount: 8,
                sourceQuality: 'peer-validated', ceiling: 70,
                flaggedSessionCount: 2, flagRate: 0.50,
            },
        }
        const v = buildFallbackVerdict(FULL_WITH_FLAGS)
        const hasFlagGap = v.gaps.some((g) =>
            /flag|peer flags/i.test(`${g.claim} ${g.evidence}`),
        )
        expect(hasFlagGap).toBe(true)
        const r = validateVerdict(v, FULL_WITH_FLAGS)
        expect(r.valid).toBe(true)
    })

    it('fallback output for v2-teaching evidence with n<5 passes Rule 14', () => {
        const FULL_WITH_TEACHING_LOW_N = {
            dimensions: [
                { key: 'patternRecognition', status: 'active', n: 8, score: 60 },
                { key: 'solutionDepth', status: 'active', n: 8, score: 60 },
                { key: 'communication', status: 'active', n: 8, score: 60 },
                { key: 'optimization', status: 'active', n: 8, score: 60 },
                { key: 'pressurePerformance', status: 'active', n: 8, score: 60 },
                { key: 'retention', status: 'active', n: 12, score: 70 },
                { key: 'teachingContributions', status: 'active', n: 4, score: 65 },
            ],
            overall: { score: 64 },
            reportCoverage: { active: 7, total: 7, pct: 100 },
            nearestTier: null,
            nextTier: null,
            teaching: {
                score: 65, sessionCount: 2, ratingCount: 4,
                sourceQuality: 'peer-validated', ceiling: 70,
                flaggedSessionCount: 0, flagRate: 0,
            },
        }
        const v = buildFallbackVerdict(FULL_WITH_TEACHING_LOW_N)
        const r = validateVerdict(v, FULL_WITH_TEACHING_LOW_N)
        expect(r.valid).toBe(true)
    })
})

// ── validateVerdict — Rule 15 (Design Aptitude sample-size honesty) ──
//
// Active only when evidence.designAptitude is non-null (D8 flag on AND
// user has ≥1 completed design session). Schoenfeld (1985) + Newell-
// Simon (1972): design competency requires repeated practice across
// problem types. Below sessionCount=3, "high" confidence claims must
// hedge. Below sessionCount=2, design can't be claimed strength at all.
describe('validateVerdict — Rule 15 (Design Aptitude sample-size honesty)', () => {
    const DESIGN_LOW_N = {
        ...FULL_EVIDENCE,
        designAptitude: {
            score: 50,
            sessionCount: 2,
            sdSessionCount: 2, lldSessionCount: 0,
            evaluatedScenarioCount: 4,
            scenarioPassRate: 0.5,
            interviewerPairedCount: 0,
            sourceQuality: 'scenario-tested',
            ceiling: 70,
        },
    }
    const DESIGN_TOO_FEW = {
        ...FULL_EVIDENCE,
        designAptitude: {
            score: 50,
            sessionCount: 1,
            sdSessionCount: 1, lldSessionCount: 0,
            evaluatedScenarioCount: 0,
            scenarioPassRate: 0,
            interviewerPairedCount: 0,
            sourceQuality: 'draft-only',
            ceiling: 30,
        },
    }
    const DESIGN_GOOD_N = {
        ...FULL_EVIDENCE,
        designAptitude: {
            score: 80,
            sessionCount: 6,
            sdSessionCount: 4, lldSessionCount: 2,
            evaluatedScenarioCount: 18,
            scenarioPassRate: 0.7,
            interviewerPairedCount: 2,
            sourceQuality: 'interviewer-paired',
            ceiling: 100,
        },
    }

    it('accepts a Design strength claim with hedge vocab when n<3', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'System Design is your leading dimension',
                    evidence: 'score=50 across 2 sessions (tentative — small sample; design competency requires ≥3 sessions)',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '8 of 8 dimensions active.',
        }
        const r = validateVerdict(v, DESIGN_LOW_N)
        expect(r.valid).toBe(true)
    })

    it('rejects a Design strength claim with confidence=high + n<3 + no hedge', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'System Design is your strongest dimension',
                    evidence: 'score=50 across recent design sessions',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '8 of 8 dimensions active.',
        }
        const r = validateVerdict(v, DESIGN_LOW_N)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('strengths[0]-design-high-confidence-low-n')
    })

    it('rejects a Design strength claim outright when n<2', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'System Design is leading (tentative)',
                    evidence: 'score=50 over 1 session — early signal',
                    confidence: 'tentative',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '8 of 8 dimensions active.',
        }
        const r = validateVerdict(v, DESIGN_TOO_FEW)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('strengths[0]-design-claim-too-few-sessions')
    })

    it('accepts a Design strength claim with confidence=high + no hedge when n>=3', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'System Design is your leading dimension',
                    evidence: 'score=80 across 6 sessions, 18 scenarios validated, 2 interviewer-paired',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '8 of 8 dimensions active.',
        }
        const r = validateVerdict(v, DESIGN_GOOD_N)
        expect(r.valid).toBe(true)
    })

    it('does NOT trigger Rule 15 when evidence.designAptitude is absent', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'System Design is your strongest',
                    evidence: 'score=50 over n=2 data points',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE)
        expect(r.valid).toBe(true)
    })

    it('LLD claims also trigger Rule 15 (regex matches "Low-Level Design" + "LLD")', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Low-Level Design is leading',
                    evidence: 'score=55 over 2 sessions',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '8 of 8 dimensions active.',
        }
        const r = validateVerdict(v, DESIGN_LOW_N)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('strengths[0]-design-high-confidence-low-n')
    })

    it('fallback drops the design strength entirely when n<2', () => {
        const FULL_WITH_DESIGN_TOO_FEW = {
            dimensions: [
                { key: 'patternRecognition', status: 'active', n: 8, score: 50 },
                { key: 'solutionDepth', status: 'active', n: 8, score: 50 },
                { key: 'communication', status: 'active', n: 8, score: 50 },
                { key: 'optimization', status: 'active', n: 8, score: 50 },
                { key: 'pressurePerformance', status: 'active', n: 8, score: 50 },
                { key: 'retention', status: 'active', n: 12, score: 60 },
                { key: 'designAptitude', status: 'active', n: 1, score: 75 },
            ],
            overall: { score: 55 },
            reportCoverage: { active: 7, total: 7, pct: 100 },
            nearestTier: null,
            nextTier: null,
            designAptitude: {
                score: 75, sessionCount: 1, sdSessionCount: 1, lldSessionCount: 0,
                evaluatedScenarioCount: 0, scenarioPassRate: 0,
                interviewerPairedCount: 0, sourceQuality: 'draft-only', ceiling: 30,
            },
        }
        const v = buildFallbackVerdict(FULL_WITH_DESIGN_TOO_FEW)
        const hasDesignStrength = v.strengths.some((s) =>
            /\b(?:design aptitude|system design|low.level design|LLD)\b/i.test(`${s.claim} ${s.evidence}`),
        )
        expect(hasDesignStrength).toBe(false)
        const r = validateVerdict(v, FULL_WITH_DESIGN_TOO_FEW)
        expect(r.valid).toBe(true)
    })

    it('fallback surfaces "Design sessions have no scenario validation" gap when scenarios=0', () => {
        const FULL_WITH_DESIGN_NO_SCENARIOS = {
            dimensions: [
                { key: 'patternRecognition', status: 'active', n: 8, score: 60 },
                { key: 'solutionDepth', status: 'active', n: 8, score: 60 },
                { key: 'communication', status: 'active', n: 8, score: 60 },
                { key: 'optimization', status: 'active', n: 8, score: 60 },
                { key: 'pressurePerformance', status: 'active', n: 8, score: 60 },
                { key: 'retention', status: 'active', n: 12, score: 65 },
                { key: 'designAptitude', status: 'active', n: 4, score: 28 },
            ],
            overall: { score: 58 },
            reportCoverage: { active: 7, total: 7, pct: 100 },
            nearestTier: null,
            nextTier: null,
            designAptitude: {
                score: 28, sessionCount: 4, sdSessionCount: 3, lldSessionCount: 1,
                evaluatedScenarioCount: 0, scenarioPassRate: 0,
                interviewerPairedCount: 0, sourceQuality: 'draft-only', ceiling: 30,
            },
        }
        const v = buildFallbackVerdict(FULL_WITH_DESIGN_NO_SCENARIOS)
        const hasScenarioGap = v.gaps.some((g) =>
            /scenario validation|0 AI-validated scenarios/i.test(`${g.claim} ${g.evidence}`),
        )
        expect(hasScenarioGap).toBe(true)
        const r = validateVerdict(v, FULL_WITH_DESIGN_NO_SCENARIOS)
        expect(r.valid).toBe(true)
    })
})

// ── validateVerdict — Rule 16 (Behavioral Performance sample-size honesty) ──
//
// Active only when evidence.behavioral is non-null (D9 flag on AND user
// has activated). Lievens & De Soete (2012) + Schmidt-Hunter (1998):
// behavioral interview reliability requires replication across rater
// contexts. Below mockCount=3, "high" confidence claims must hedge.
// Below mockCount=2, behavioral can't be claimed strength at all.
describe('validateVerdict — Rule 16 (Behavioral Performance sample-size honesty)', () => {
    const BEHAVIORAL_LOW_N = {
        ...FULL_EVIDENCE,
        behavioral: {
            score: 55,
            mockCount: 2,
            hrSolutionCount: 0,
            distinctStyleCount: 1,
            calibrationDelta: 1.0,
            sourceQuality: 'draft-only',
            ceiling: 30,
        },
    }
    const BEHAVIORAL_TOO_FEW = {
        ...FULL_EVIDENCE,
        behavioral: {
            score: 50,
            mockCount: 1,
            hrSolutionCount: 0,
            distinctStyleCount: 1,
            calibrationDelta: null,
            sourceQuality: 'draft-only',
            ceiling: 30,
        },
    }
    const BEHAVIORAL_GOOD_N = {
        ...FULL_EVIDENCE,
        behavioral: {
            score: 80,
            mockCount: 6,
            hrSolutionCount: 5,
            distinctStyleCount: 4,
            calibrationDelta: 0.5,
            sourceQuality: 'diversified',
            ceiling: 100,
        },
    }

    it('accepts a Behavioral strength claim with hedge vocab when n<3', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Behavioral Performance is your leading dimension',
                    evidence: 'score=55 over 2 mocks (tentative — small sample; behavioral interview reliability requires ≥3 mocks)',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '9 of 9 dimensions active.',
        }
        const r = validateVerdict(v, BEHAVIORAL_LOW_N)
        expect(r.valid).toBe(true)
    })

    it('rejects a Behavioral strength claim with confidence=high + n<3 + no hedge', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Behavioral Performance is your strongest dimension',
                    evidence: 'score=55 across recent mock interviews',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '9 of 9 dimensions active.',
        }
        const r = validateVerdict(v, BEHAVIORAL_LOW_N)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('strengths[0]-behavioral-high-confidence-low-n')
    })

    it('rejects a Behavioral strength claim outright when n<2', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Behavioral interview is leading (tentative)',
                    evidence: 'score=50 over 1 mock — early signal',
                    confidence: 'tentative',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '9 of 9 dimensions active.',
        }
        const r = validateVerdict(v, BEHAVIORAL_TOO_FEW)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('strengths[0]-behavioral-claim-too-few-mocks')
    })

    it('accepts a Behavioral strength claim with confidence=high + no hedge when n>=3', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Behavioral Performance is your leading dimension',
                    evidence: 'score=80 with 6 mock interviews across 4 distinct culture styles',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '9 of 9 dimensions active.',
        }
        const r = validateVerdict(v, BEHAVIORAL_GOOD_N)
        expect(r.valid).toBe(true)
    })

    it('does NOT trigger Rule 16 when evidence.behavioral is absent', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Behavioral Performance is your strongest',
                    evidence: 'score=55 over n=2 data points',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE)
        expect(r.valid).toBe(true)
    })

    it('FALSE-POSITIVE GUARD: incidental "behavior" prose does NOT trigger Rule 16', () => {
        // The validator's regex requires "behavioral performance" / "behavioral
        // interview" / "behavioral round" / "culture-fit" — NOT plain
        // "behavior" which appears in coding contexts ("the program's behavior").
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Pattern recognition is your strongest dimension',
                    evidence: 'score=78 with 12 of 15 FAANG-core patterns at Solid+ — predicted system behavior accurately under load',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '9 of 9 dimensions active.',
        }
        const r = validateVerdict(v, BEHAVIORAL_LOW_N)
        expect(r.valid).toBe(true)
    })

    it('fallback drops the behavioral strength entirely when n<2', () => {
        const FULL_WITH_BEHAVIORAL_TOO_FEW = {
            dimensions: [
                { key: 'patternRecognition', status: 'active', n: 8, score: 50 },
                { key: 'solutionDepth', status: 'active', n: 8, score: 50 },
                { key: 'communication', status: 'active', n: 8, score: 50 },
                { key: 'optimization', status: 'active', n: 8, score: 50 },
                { key: 'pressurePerformance', status: 'active', n: 8, score: 50 },
                { key: 'retention', status: 'active', n: 12, score: 60 },
                { key: 'behavioralPerformance', status: 'active', n: 1, score: 75 },
            ],
            overall: { score: 55 },
            reportCoverage: { active: 7, total: 7, pct: 100 },
            nearestTier: null,
            nextTier: null,
            behavioral: {
                score: 75, mockCount: 1, hrSolutionCount: 0,
                distinctStyleCount: 1, calibrationDelta: null,
                sourceQuality: 'draft-only', ceiling: 30,
            },
        }
        const v = buildFallbackVerdict(FULL_WITH_BEHAVIORAL_TOO_FEW)
        const hasBehavioralStrength = v.strengths.some((s) =>
            /\bbehavioral (?:performance|interview|round)\b|culture[- ]fit/i.test(`${s.claim} ${s.evidence}`),
        )
        expect(hasBehavioralStrength).toBe(false)
        const r = validateVerdict(v, FULL_WITH_BEHAVIORAL_TOO_FEW)
        expect(r.valid).toBe(true)
    })

    it('fallback surfaces calibration-gap priority when delta > 1.5', () => {
        const FULL_WITH_HIGH_DELTA = {
            dimensions: [
                { key: 'patternRecognition', status: 'active', n: 8, score: 60 },
                { key: 'solutionDepth', status: 'active', n: 8, score: 60 },
                { key: 'communication', status: 'active', n: 8, score: 60 },
                { key: 'optimization', status: 'active', n: 8, score: 60 },
                { key: 'pressurePerformance', status: 'active', n: 8, score: 60 },
                { key: 'retention', status: 'active', n: 12, score: 65 },
                { key: 'behavioralPerformance', status: 'active', n: 4, score: 50 },
            ],
            overall: { score: 60 },
            reportCoverage: { active: 7, total: 7, pct: 100 },
            nearestTier: null,
            nextTier: null,
            behavioral: {
                score: 50, mockCount: 4, hrSolutionCount: 0,
                distinctStyleCount: 2, calibrationDelta: 2.5,
                sourceQuality: 'mock-validated', ceiling: 70,
            },
        }
        const v = buildFallbackVerdict(FULL_WITH_HIGH_DELTA)
        const hasCalibrationGap = v.gaps.some((g) =>
            /miscalibrated|kruger.dunning|calibration/i.test(`${g.claim} ${g.evidence}`),
        )
        expect(hasCalibrationGap).toBe(true)
        const r = validateVerdict(v, FULL_WITH_HIGH_DELTA)
        expect(r.valid).toBe(true)
    })
})

// ── validateVerdict — Rule 17 (Verification & Meta-cognition sample-size) ──
//
// Active only when evidence.verification is non-null (D10 flag on AND
// user has ≥5 AI-reviewed coding solutions). Lange-Wang-Dunlosky 2013:
// small-sample self-assessment is statistically unreliable. Below
// calibrationN=10, "high" confidence claims must hedge. Below
// calibrationN=5, verification can't be claimed strength at all —
// the self-refuting failure mode (overconfidently claiming calibration
// off too few data points).
describe('validateVerdict — Rule 17 (Verification & Meta-cognition sample-size)', () => {
    const VERIFICATION_LOW_N = {
        ...FULL_EVIDENCE,
        verification: {
            score: 60,
            reviewCount: 8,
            calibrationN: 7,
            calibrationDelta: 0.20,
            followUpCount: 0,
            wrongPatternCount: 0,
            sourceQuality: 'proxy-only',
            ceiling: 40,
        },
    }
    const VERIFICATION_TOO_FEW = {
        ...FULL_EVIDENCE,
        verification: {
            score: 50,
            reviewCount: 5,
            calibrationN: 4,
            calibrationDelta: 0.30,
            followUpCount: 0,
            wrongPatternCount: 0,
            sourceQuality: 'proxy-only',
            ceiling: 40,
        },
    }
    const VERIFICATION_GOOD_N = {
        ...FULL_EVIDENCE,
        verification: {
            score: 78,
            reviewCount: 25,
            calibrationN: 25,
            calibrationDelta: 0.10,
            followUpCount: 5,
            wrongPatternCount: 0,
            sourceQuality: 'strong-signal',
            ceiling: 100,
        },
    }

    it('accepts a Verification strength claim with hedge vocab when n<10', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Verification & Meta-cognition is your leading dimension',
                    evidence: 'score=60 over 7 calibration data points (tentative — small sample; calibration reliability requires ≥10 data points)',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '10 of 10 dimensions active.',
        }
        const r = validateVerdict(v, VERIFICATION_LOW_N)
        expect(r.valid).toBe(true)
    })

    it('rejects a Verification strength claim with confidence=high + n<10 + no hedge', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Self-assessment is well-calibrated',
                    evidence: 'score=60 across recent solutions',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '10 of 10 dimensions active.',
        }
        const r = validateVerdict(v, VERIFICATION_LOW_N)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('strengths[0]-verification-high-confidence-low-n')
    })

    it('rejects a Verification strength claim outright when n<5', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Calibration accuracy is leading (tentative)',
                    evidence: 'score=50 over 4 data points — early signal',
                    confidence: 'tentative',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '10 of 10 dimensions active.',
        }
        const r = validateVerdict(v, VERIFICATION_TOO_FEW)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('strengths[0]-verification-claim-too-few-datapoints')
    })

    it('accepts a Verification strength claim with confidence=high + no hedge when n>=10', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Verification & Meta-cognition is your leading dimension',
                    evidence: 'score=78 from 25 calibration data points + 5 probe-defense follow-ups, calibration gap 10% (strong-signal)',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '10 of 10 dimensions active.',
        }
        const r = validateVerdict(v, VERIFICATION_GOOD_N)
        expect(r.valid).toBe(true)
    })

    it('does NOT trigger Rule 17 when evidence.verification is absent', () => {
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Self-assessment is well-calibrated',
                    evidence: 'score=60 over n=7',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '6 of 6 dimensions active.',
        }
        const r = validateVerdict(v, FULL_EVIDENCE)
        expect(r.valid).toBe(true)
    })

    it('FALSE-POSITIVE GUARD: generic "verify" prose does NOT trigger Rule 17', () => {
        // The validator's regex requires "verification" / "meta-cognition" /
        // "self-assessment" / "well-calibrated" / "calibration accuracy" —
        // NOT plain "verify" which appears in coding contexts ("verify the
        // input is non-null").
        const v = {
            headline: 'Meeting Tier 2 expectations.',
            strengths: [
                {
                    claim: 'Pattern recognition is your strongest dimension',
                    evidence: 'score=78 with 12 of 15 FAANG-core patterns at Solid+ — verifies edge cases reliably',
                    confidence: 'high',
                },
            ],
            gaps: [],
            readinessNote: 'Ready for Tier 2 readiness.',
            dataQualityNote: '10 of 10 dimensions active.',
        }
        const r = validateVerdict(v, VERIFICATION_LOW_N)
        expect(r.valid).toBe(true)
    })

    it('fallback drops the verification strength entirely when calibrationN<5', () => {
        const FULL_WITH_VERIFICATION_TOO_FEW = {
            dimensions: [
                { key: 'patternRecognition', status: 'active', n: 8, score: 50 },
                { key: 'solutionDepth', status: 'active', n: 8, score: 50 },
                { key: 'communication', status: 'active', n: 8, score: 50 },
                { key: 'optimization', status: 'active', n: 8, score: 50 },
                { key: 'pressurePerformance', status: 'active', n: 8, score: 50 },
                { key: 'retention', status: 'active', n: 12, score: 60 },
                { key: 'verificationMetacognition', status: 'active', n: 4, score: 70 },
            ],
            overall: { score: 55 },
            reportCoverage: { active: 7, total: 7, pct: 100 },
            nearestTier: null,
            nextTier: null,
            verification: {
                score: 70, reviewCount: 5, calibrationN: 4,
                calibrationDelta: 0.15, followUpCount: 0,
                wrongPatternCount: 0,
                sourceQuality: 'proxy-only', ceiling: 40,
            },
        }
        const v = buildFallbackVerdict(FULL_WITH_VERIFICATION_TOO_FEW)
        const hasVerificationStrength = v.strengths.some((s) =>
            /\b(?:verification|meta[- ]?cognition|self[- ]assessment|well[- ]calibrated|calibration accuracy)\b/i.test(`${s.claim} ${s.evidence}`),
        )
        expect(hasVerificationStrength).toBe(false)
        const r = validateVerdict(v, FULL_WITH_VERIFICATION_TOO_FEW)
        expect(r.valid).toBe(true)
    })

    it('fallback surfaces "Confidence diverges from AI-graded correctness" gap when calibrationDelta > 0.30', () => {
        const FULL_WITH_HIGH_DELTA = {
            dimensions: [
                { key: 'patternRecognition', status: 'active', n: 8, score: 60 },
                { key: 'solutionDepth', status: 'active', n: 8, score: 60 },
                { key: 'communication', status: 'active', n: 8, score: 60 },
                { key: 'optimization', status: 'active', n: 8, score: 60 },
                { key: 'pressurePerformance', status: 'active', n: 8, score: 60 },
                { key: 'retention', status: 'active', n: 12, score: 65 },
                { key: 'verificationMetacognition', status: 'active', n: 15, score: 35 },
            ],
            overall: { score: 55 },
            reportCoverage: { active: 7, total: 7, pct: 100 },
            nearestTier: null,
            nextTier: null,
            verification: {
                score: 35, reviewCount: 15, calibrationN: 15,
                calibrationDelta: 0.45, followUpCount: 0,
                wrongPatternCount: 0,
                sourceQuality: 'multi-signal', ceiling: 75,
            },
        }
        const v = buildFallbackVerdict(FULL_WITH_HIGH_DELTA)
        const hasCalibrationGap = v.gaps.some((g) =>
            /diverges|calibration gap|kruger.dunning/i.test(`${g.claim} ${g.evidence}`),
        )
        expect(hasCalibrationGap).toBe(true)
        const r = validateVerdict(v, FULL_WITH_HIGH_DELTA)
        expect(r.valid).toBe(true)
    })

    it('fallback surfaces "Pattern claims diverge from AI assessment" gap when wrongPatternCount > 0', () => {
        const FULL_WITH_WRONG_PATTERNS = {
            dimensions: [
                { key: 'patternRecognition', status: 'active', n: 8, score: 60 },
                { key: 'solutionDepth', status: 'active', n: 8, score: 60 },
                { key: 'communication', status: 'active', n: 8, score: 60 },
                { key: 'optimization', status: 'active', n: 8, score: 60 },
                { key: 'pressurePerformance', status: 'active', n: 8, score: 60 },
                { key: 'retention', status: 'active', n: 12, score: 65 },
                { key: 'verificationMetacognition', status: 'active', n: 15, score: 60 },
            ],
            overall: { score: 60 },
            reportCoverage: { active: 7, total: 7, pct: 100 },
            nearestTier: null,
            nextTier: null,
            verification: {
                score: 60, reviewCount: 15, calibrationN: 15,
                calibrationDelta: 0.15, followUpCount: 0,
                wrongPatternCount: 3,
                sourceQuality: 'multi-signal', ceiling: 75,
            },
        }
        const v = buildFallbackVerdict(FULL_WITH_WRONG_PATTERNS)
        const hasWrongPatternGap = v.gaps.some((g) =>
            /wrong.pattern|diverge from AI/i.test(`${g.claim} ${g.evidence}`),
        )
        expect(hasWrongPatternGap).toBe(true)
        const r = validateVerdict(v, FULL_WITH_WRONG_PATTERNS)
        expect(r.valid).toBe(true)
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

    it('fallback output for v2-mastery evidence passes Rule 8 (no self-contradiction)', () => {
        // Regression guard: the fallback MUST produce evidence strings that
        // its own validator accepts. If we ever add a Pattern Recognition
        // strength path that cites only the score, validateVerdict would
        // reject the fallback — and there's no further fallback.
        const FULL_WITH_MASTERY = {
            ...FULL_EVIDENCE,
            patternMastery: {
                owned: 5, solid: 4, working: 3, touched: 2, untouched: 11,
                coreSolidOrAbove: 12, coreOwned: 5, totalCore: 15,
            },
        }
        const v = buildFallbackVerdict(FULL_WITH_MASTERY)
        const r = validateVerdict(v, FULL_WITH_MASTERY)
        expect(r.valid).toBe(true)
    })

    it('fallback output for v2-depth evidence passes Rule 9 (no self-contradiction)', () => {
        const FULL_WITH_DEPTH = {
            ...FULL_EVIDENCE,
            solutionDepth: {
                owned: 3, defended: 5, explained: 2, documented: 2, none: 0,
                defendedOrAbove: 8, ownedOrAbove: 3, totalCoding: 12,
            },
        }
        const v = buildFallbackVerdict(FULL_WITH_DEPTH)
        const r = validateVerdict(v, FULL_WITH_DEPTH)
        expect(r.valid).toBe(true)
    })

    it('fallback surfaces a "limited probe-passing depth" gap when defendedOrAbove < 3', () => {
        // The original-report user under D2 v2: 4 solutions, all DOCUMENTED
        // at most, no follow-ups. defendedOrAbove=0 → distribution gap fires.
        const ORIGINAL_REPORT_WITH_DEPTH = {
            dimensions: [
                { key: 'patternRecognition', status: 'active', n: 4, score: 26 },
                { key: 'solutionDepth', status: 'active', n: 4, score: 32 },
                { key: 'communication', status: 'active', n: 4, score: 53 },
                { key: 'optimization', status: 'active', n: 4, score: 56 },
                { key: 'pressurePerformance', status: 'active', n: 4, score: 60 },
                { key: 'retention', status: 'active', n: 4, score: 93 },
            ],
            overall: { score: 50 },
            reportCoverage: { active: 6, total: 6, pct: 100 },
            nearestTier: null,
            nextTier: { name: 'Tier 2 Tech', threshold: 65, gap: 15 },
            solutionDepth: {
                owned: 0, defended: 0, explained: 0, documented: 4, none: 0,
                defendedOrAbove: 0, ownedOrAbove: 0, totalCoding: 4,
            },
        }
        const v = buildFallbackVerdict(ORIGINAL_REPORT_WITH_DEPTH)
        const hasProbeDepthGap = v.gaps.some((g) =>
            /probe-passing depth|defended\+/i.test(`${g.claim} ${g.evidence}`),
        )
        expect(hasProbeDepthGap).toBe(true)
        const r = validateVerdict(v, ORIGINAL_REPORT_WITH_DEPTH)
        expect(r.valid).toBe(true)
    })

    it('fallback output for v2-comm evidence passes Rule 10 (no self-contradiction)', () => {
        const FULL_WITH_COMM = {
            ...FULL_EVIDENCE,
            communication: {
                ceiling: 80,
                sourceQuality: 'live-and-ai',
                peerCount: 0,
                mockCount: 2,
                writtenCount: 6,
            },
        }
        const v = buildFallbackVerdict(FULL_WITH_COMM)
        const r = validateVerdict(v, FULL_WITH_COMM)
        expect(r.valid).toBe(true)
    })

    it('fallback surfaces a "no live signal" gap when commMocksWithScores < 1 and no peer ratings', () => {
        // Original-report user under D3 v2: 4 AI explanation scores, 0
        // mocks, 0 peer → ceiling=55 (written-only). Fallback should
        // prepend "Communication has no live signal" as a priority gap.
        const ORIGINAL_REPORT_WITH_COMM = {
            dimensions: [
                { key: 'patternRecognition', status: 'active', n: 4, score: 26 },
                { key: 'solutionDepth', status: 'active', n: 4, score: 32 },
                { key: 'communication', status: 'active', n: 4, score: 55 },
                { key: 'optimization', status: 'active', n: 4, score: 56 },
                { key: 'pressurePerformance', status: 'active', n: 4, score: 60 },
                { key: 'retention', status: 'active', n: 4, score: 93 },
            ],
            overall: { score: 50 },
            reportCoverage: { active: 6, total: 6, pct: 100 },
            nearestTier: null,
            nextTier: { name: 'Tier 2 Tech', threshold: 65, gap: 15 },
            communication: {
                ceiling: 55,
                sourceQuality: 'written-only',
                peerCount: 0,
                mockCount: 0,
                writtenCount: 4,
            },
        }
        const v = buildFallbackVerdict(ORIGINAL_REPORT_WITH_COMM)
        const hasLiveSignalGap = v.gaps.some((g) =>
            /no live signal|written-only|mock interview/i.test(`${g.claim} ${g.evidence}`),
        )
        expect(hasLiveSignalGap).toBe(true)
        const r = validateVerdict(v, ORIGINAL_REPORT_WITH_COMM)
        expect(r.valid).toBe(true)
    })

    it('fallback output for v2-opt evidence passes Rule 11 (no self-contradiction)', () => {
        const FULL_WITH_OPT = {
            ...FULL_EVIDENCE,
            optimization: {
                owned: 3, tradeOff: 5, optimized: 2, documented: 2, none: 0,
                tradeOffOrAbove: 8, ownedOrAbove: 3, totalCoding: 12,
            },
        }
        const v = buildFallbackVerdict(FULL_WITH_OPT)
        const r = validateVerdict(v, FULL_WITH_OPT)
        expect(r.valid).toBe(true)
    })

    it('fallback surfaces a "Limited trade-off articulation" gap when tradeOffOrAbove < 3', () => {
        // Original-report user under D4 v2: 4 mostly-OPTIMIZED solutions,
        // 0 trade-off (no AI complexityCheck data, no bruteForceMeta).
        // Fallback should prepend the priority gap.
        const ORIGINAL_REPORT_WITH_OPT = {
            dimensions: [
                { key: 'patternRecognition', status: 'active', n: 4, score: 26 },
                { key: 'solutionDepth', status: 'active', n: 4, score: 32 },
                { key: 'communication', status: 'active', n: 4, score: 55 },
                { key: 'optimization', status: 'active', n: 4, score: 37 },
                { key: 'pressurePerformance', status: 'active', n: 4, score: 60 },
                { key: 'retention', status: 'active', n: 4, score: 93 },
            ],
            overall: { score: 50 },
            reportCoverage: { active: 6, total: 6, pct: 100 },
            nearestTier: null,
            nextTier: { name: 'Tier 2 Tech', threshold: 65, gap: 15 },
            optimization: {
                owned: 0, tradeOff: 0, optimized: 3, documented: 1, none: 0,
                tradeOffOrAbove: 0, ownedOrAbove: 0, totalCoding: 4,
            },
        }
        const v = buildFallbackVerdict(ORIGINAL_REPORT_WITH_OPT)
        const hasTradeOffGap = v.gaps.some((g) =>
            /trade-off|trade off articulation/i.test(`${g.claim} ${g.evidence}`),
        )
        expect(hasTradeOffGap).toBe(true)
        const r = validateVerdict(v, ORIGINAL_REPORT_WITH_OPT)
        expect(r.valid).toBe(true)
    })

    it('fallback output for v2-pressure evidence passes Rule 12 (no self-contradiction)', () => {
        const FULL_WITH_PRESSURE = {
            ...FULL_EVIDENCE,
            pressurePerformance: {
                ceiling: 80,
                sourceQuality: 'live-and-quiz',
                mockCount: 2,
                relevantQuizCount: 5,
                totalQuizzesSeen: 7,
            },
        }
        const v = buildFallbackVerdict(FULL_WITH_PRESSURE)
        const r = validateVerdict(v, FULL_WITH_PRESSURE)
        expect(r.valid).toBe(true)
    })

    it('fallback surfaces a "Pressure Performance has no live signal" gap when mockCount < 1', () => {
        // Original-report user under D5 v2: 4 quizzes (some Photography),
        // 0 mocks → quiz-proxy ceiling 40. Fallback should prepend the
        // priority gap mirroring D3's "no live signal" pattern.
        const ORIGINAL_REPORT_WITH_PRESSURE = {
            dimensions: [
                { key: 'patternRecognition', status: 'active', n: 4, score: 26 },
                { key: 'solutionDepth', status: 'active', n: 4, score: 32 },
                { key: 'communication', status: 'active', n: 4, score: 55 },
                { key: 'optimization', status: 'active', n: 4, score: 37 },
                { key: 'pressurePerformance', status: 'active', n: 3, score: 40 },
                { key: 'retention', status: 'active', n: 4, score: 93 },
            ],
            overall: { score: 47 },
            reportCoverage: { active: 6, total: 6, pct: 100 },
            nearestTier: null,
            nextTier: { name: 'Tier 2 Tech', threshold: 65, gap: 18 },
            pressurePerformance: {
                ceiling: 40,
                sourceQuality: 'quiz-proxy',
                mockCount: 0,
                relevantQuizCount: 3,
                totalQuizzesSeen: 4,
            },
        }
        const v = buildFallbackVerdict(ORIGINAL_REPORT_WITH_PRESSURE)
        const hasNoLiveSignalGap = v.gaps.some((g) =>
            /no live signal|quiz-proxy|mock interview/i.test(`${g.claim} ${g.evidence}`),
        )
        expect(hasNoLiveSignalGap).toBe(true)
        const r = validateVerdict(v, ORIGINAL_REPORT_WITH_PRESSURE)
        expect(r.valid).toBe(true)
    })

    it('fallback surfaces a "limited core-pattern coverage" gap when coreSolidOrAbove < 5', () => {
        // The original-report user fixture: dims at-or-above thresholds,
        // but mastery distribution is empty. Score-only weakDim path
        // would miss this — the v2 fallback adds it as the priority gap.
        const ORIGINAL_REPORT_WITH_MASTERY = {
            dimensions: [
                { key: 'patternRecognition', status: 'active', n: 4, score: 26 }, // post-v2 score
                { key: 'solutionDepth', status: 'active', n: 4, score: 71 },
                { key: 'communication', status: 'active', n: 4, score: 53 },
                { key: 'optimization', status: 'active', n: 4, score: 56 },
                { key: 'pressurePerformance', status: 'active', n: 4, score: 60 },
                { key: 'retention', status: 'active', n: 4, score: 93 },
            ],
            overall: { score: 50 },
            reportCoverage: { active: 6, total: 6, pct: 100 },
            nearestTier: null,
            nextTier: { name: 'Tier 2 Tech', threshold: 65, gap: 15 },
            patternMastery: {
                owned: 0, solid: 0, working: 0, touched: 3, untouched: 22,
                coreSolidOrAbove: 0, coreOwned: 0, totalCore: 15,
            },
        }
        const v = buildFallbackVerdict(ORIGINAL_REPORT_WITH_MASTERY)
        const hasCoverageGap = v.gaps.some((g) =>
            /core-pattern coverage|FAANG-core/i.test(`${g.claim} ${g.evidence}`),
        )
        expect(hasCoverageGap).toBe(true)
        // And the whole verdict still validates against Rule 8.
        const r = validateVerdict(v, ORIGINAL_REPORT_WITH_MASTERY)
        expect(r.valid).toBe(true)
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

    it('rejects refusal-style readinessVerdict (symmetric with improvement/interviewTip)', () => {
        // Symmetry guard: all three prose fields must be in the refusal probe.
        // If a future refactor removes readinessVerdict from the probe, this fails.
        const v = {
            ...VALID_REVIEW,
            readinessVerdict: "I cannot review this submission.",
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

describe('validateReview — followUpEvaluations empty (H7 audit-verified regression)', () => {
    // The Sprint 1 backend correctness audit (lines 97-101 of
    // 2026-06-20-backend-correctness-audit.md) flagged this case as a HIGH bug,
    // claiming validateReview does not fail when followUpEvaluations is empty
    // despite followUpQuestionIds being non-empty. Close reading of the
    // validator (ai.validators.js:1652-1669) shows the per-qid missing-id
    // loop already catches this case — every input qid produces a missing
    // violation. The audit finding was a false positive.
    //
    // This test locks in the existing correct behavior so a future refactor
    // of the followUpEvaluations validation block (e.g. extracting it into a
    // helper) can't silently regress this guarantee.
    it('rejects empty followUpEvaluations when followUpQuestionIds is non-empty', () => {
        const r = validateReview(
            { ...VALID_REVIEW, followUpEvaluations: [] },
            { followUpQuestionIds: ['fu-1', 'fu-2'] },
        )
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('followUp-missing-questionId:fu-1')
        expect(r.violations).toContain('followUp-missing-questionId:fu-2')
    })
})

describe('validateReview — readinessVerdict (H9)', () => {
    // The system prompt (ai.prompts.js:553) declares output must include
    // `readinessVerdict: <string>` but validateReview never enforced it.
    // AI could omit; validation passed; downstream UI ("Ready for X" line)
    // and the 6D verdict log feed silently received undefined / empty.
    // Sprint 2.6 closes this gap by adding a non-empty-string check
    // alongside the existing improvement / interviewTip checks.

    it('passes when readinessVerdict is a non-empty string', () => {
        const r = validateReview({
            ...VALID_REVIEW,
            readinessVerdict: 'Junior-ready on hashing problems.',
        })
        expect(r.valid).toBe(true)
    })

    it('fails when readinessVerdict is missing', () => {
        const { readinessVerdict, ...withoutVerdict } = VALID_REVIEW
        const r = validateReview(withoutVerdict)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('readinessVerdict-empty')
    })

    it('fails when readinessVerdict is an empty string', () => {
        const r = validateReview({ ...VALID_REVIEW, readinessVerdict: '' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('readinessVerdict-empty')
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

// ── validateTeachingSummary ─────────────────────────────────────────
const VALID_SUMMARY = {
    tldr: 'B-tree is the default Postgres index — pick the right type per query and verify with EXPLAIN ANALYZE.',
    keyTakeaways: [
        'B-tree handles equality and range queries well.',
        'GIN suits arrays / JSONB / full-text but slows writes.',
        'Every index adds write overhead — cull the unused ones.',
    ],
    definitions: [
        { term: 'B-tree index', definition: 'Default Postgres index supporting equality + range queries.' },
    ],
    openQuestions: ['When does BRIN beat B-tree?'],
}

describe('validateTeachingSummary', () => {
    it('accepts a well-formed summary', () => {
        expect(validateTeachingSummary(VALID_SUMMARY).valid).toBe(true)
    })

    it('rejects empty tldr', () => {
        const r = validateTeachingSummary({ ...VALID_SUMMARY, tldr: '' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('tldr-empty')
    })

    it('rejects tldr > 280 chars', () => {
        const long = 'a'.repeat(281)
        const r = validateTeachingSummary({ ...VALID_SUMMARY, tldr: long })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('tldr-too-long')
    })

    it('rejects fewer than 3 key takeaways', () => {
        const r = validateTeachingSummary({
            ...VALID_SUMMARY,
            keyTakeaways: ['only one'],
        })
        expect(r.valid).toBe(false)
        expect(r.violations.some(v => v.startsWith('keyTakeaways-count'))).toBe(true)
    })

    it('rejects > 5 definitions', () => {
        const r = validateTeachingSummary({
            ...VALID_SUMMARY,
            definitions: Array.from({ length: 6 }, (_, i) => ({
                term: `t${i}`,
                definition: `d${i}`,
            })),
        })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('definitions-cap-exceeded')
    })

    it('rejects refusal-style tldr', () => {
        const r = validateTeachingSummary({
            ...VALID_SUMMARY,
            tldr: "I cannot summarize this content.",
        })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('refusal-detected')
    })

    it('rejects "notes are empty" claim when notes were present', () => {
        const r = validateTeachingSummary(
            {
                ...VALID_SUMMARY,
                tldr: 'The notes are empty so I cannot summarize.',
            },
            { hasNotes: true },
        )
        expect(r.valid).toBe(false)
        // The refusal regex doesn't match this exact phrasing, but the
        // emptiness-claim guard does.
        expect(
            r.violations.includes('notes-emptiness-claim-when-notes-present') ||
                r.violations.includes('refusal-detected'),
        ).toBe(true)
    })

    it('allows definitions = []', () => {
        const r = validateTeachingSummary({
            ...VALID_SUMMARY,
            definitions: [],
            openQuestions: [],
        })
        expect(r.valid).toBe(true)
    })
})

// ── validateTeachingQuiz ────────────────────────────────────────────
const VALID_QUIZ_OUT = {
    questions: [
        {
            question: 'Which index type best fits JSONB columns?',
            type: 'MCQ',
            options: ['B-tree', 'GIN', 'Hash', 'BRIN'],
            answer: 'GIN',
            explanation: 'The notes call out GIN for arrays and JSONB.',
        },
        {
            question: 'Why does each new index slow down writes?',
            type: 'SHORT',
            answer: 'Every insert/update has to also update the new index, costing one extra B-tree update.',
            explanation: 'The notes spell out write-amplification per index.',
        },
        {
            question: 'Which command confirms the planner used your index?',
            type: 'MCQ',
            options: ['VACUUM ANALYZE', 'EXPLAIN ANALYZE', 'REINDEX VERBOSE', 'PG_STAT_INDEXES'],
            answer: 'EXPLAIN ANALYZE',
            explanation: 'Notes call out EXPLAIN ANALYZE specifically.',
        },
    ],
}

describe('validateTeachingQuiz', () => {
    it('accepts a well-formed mixed quiz', () => {
        expect(validateTeachingQuiz(VALID_QUIZ_OUT).valid).toBe(true)
    })

    it('rejects fewer than 3 questions', () => {
        const r = validateTeachingQuiz({
            questions: VALID_QUIZ_OUT.questions.slice(0, 2),
        })
        expect(r.valid).toBe(false)
        expect(r.violations.some(v => v.startsWith('questions-count'))).toBe(true)
    })

    it('rejects MCQ with answer not in options', () => {
        const v = {
            questions: [
                {
                    ...VALID_QUIZ_OUT.questions[0],
                    answer: 'Not in the list',
                },
                ...VALID_QUIZ_OUT.questions.slice(1),
            ],
        }
        const r = validateTeachingQuiz(v)
        expect(r.valid).toBe(false)
        expect(r.violations.some(v => v.endsWith('.answer-not-in-options'))).toBe(true)
    })

    it('rejects MCQ with !=4 options', () => {
        const v = {
            questions: [
                {
                    ...VALID_QUIZ_OUT.questions[0],
                    options: ['A', 'B', 'C'],
                },
                ...VALID_QUIZ_OUT.questions.slice(1),
            ],
        }
        const r = validateTeachingQuiz(v)
        expect(r.valid).toBe(false)
        expect(r.violations.some(v => v.endsWith('.options-must-be-4'))).toBe(true)
    })

    it('rejects all 3+ MCQs sharing the same answer position', () => {
        const v = {
            questions: [
                { ...VALID_QUIZ_OUT.questions[0], options: ['A', 'B', 'C', 'D'], answer: 'A' },
                { ...VALID_QUIZ_OUT.questions[2], options: ['A', 'B', 'C', 'D'], answer: 'A' },
                { ...VALID_QUIZ_OUT.questions[2], options: ['A', 'B', 'C', 'D'], answer: 'A', question: 'Different question text here?' },
            ],
        }
        const r = validateTeachingQuiz(v)
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('mcq-answers-all-same-position')
    })

    it('rejects SHORT with answer too short', () => {
        const v = {
            questions: [
                { ...VALID_QUIZ_OUT.questions[1], answer: 'a' },
                ...VALID_QUIZ_OUT.questions.slice(0, 2),
            ],
        }
        const r = validateTeachingQuiz(v)
        expect(r.valid).toBe(false)
        expect(r.violations.some(v => v.endsWith('.answer-length-out-of-range'))).toBe(true)
    })
})

// ── validateTeachingTopicCoverage ───────────────────────────────────
const VALID_COVERAGE_FULL = {
    coverageScore: 80,
    coveredAspects: ['B-tree default', 'GIN for JSONB', 'Write overhead'],
    missingAspects: ['BRIN', 'Multi-column indexes'],
    verdict: 'FULL',
    rationale: 'Scores 80/100 — covers 3 core aspects but misses 2 sub-topics.',
}

describe('validateTeachingTopicCoverage', () => {
    it('accepts a well-formed FULL output', () => {
        expect(validateTeachingTopicCoverage(VALID_COVERAGE_FULL).valid).toBe(true)
    })

    it('accepts PARTIAL with score in band', () => {
        const r = validateTeachingTopicCoverage({
            ...VALID_COVERAGE_FULL,
            coverageScore: 50,
            verdict: 'PARTIAL',
            rationale: 'Scores 50/100 across 3 aspects — partial coverage of the topic.',
        })
        expect(r.valid).toBe(true)
    })

    it('accepts OFF_TOPIC with score < 35', () => {
        const r = validateTeachingTopicCoverage({
            coverageScore: 10,
            coveredAspects: [],
            missingAspects: ['Topic'],
            verdict: 'OFF_TOPIC',
            rationale: 'Scores 10/100 — 0 covered aspects of the advertised topic.',
        })
        expect(r.valid).toBe(true)
    })

    it('rejects FULL verdict with score < 75', () => {
        const r = validateTeachingTopicCoverage({
            ...VALID_COVERAGE_FULL,
            coverageScore: 60,
            verdict: 'FULL',
        })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('verdict-score-mismatch:FULL<75')
    })

    it('rejects PARTIAL verdict with score >= 75', () => {
        const r = validateTeachingTopicCoverage({
            ...VALID_COVERAGE_FULL,
            coverageScore: 80,
            verdict: 'PARTIAL',
            rationale: 'Scores 80/100',
        })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('verdict-score-mismatch:PARTIAL-out-of-band')
    })

    it('rejects rationale without any digit', () => {
        const r = validateTeachingTopicCoverage({
            ...VALID_COVERAGE_FULL,
            rationale: 'Mostly good — covers the main areas with some gaps.',
        })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('rationale-no-number')
    })

    it('rejects unknown verdict', () => {
        const r = validateTeachingTopicCoverage({
            ...VALID_COVERAGE_FULL,
            verdict: 'NEUTRAL',
        })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('verdict-unknown')
    })

    it('rejects > 5 missing aspects', () => {
        const r = validateTeachingTopicCoverage({
            ...VALID_COVERAGE_FULL,
            missingAspects: ['a', 'b', 'c', 'd', 'e', 'f'],
        })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('missingAspects-cap-exceeded')
    })

    it('rejects out-of-range coverageScore', () => {
        const r = validateTeachingTopicCoverage({
            ...VALID_COVERAGE_FULL,
            coverageScore: 150,
        })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('coverageScore-out-of-range')
    })

    it('rejects refusal-style rationale', () => {
        const r = validateTeachingTopicCoverage({
            ...VALID_COVERAGE_FULL,
            rationale: "I cannot help with this evaluation. Score 0.",
        })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('refusal-detected')
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

// ════════════════════════════════════════════════════════════════════════════
// NOTES validators
// ════════════════════════════════════════════════════════════════════════════

const VALID_NOTE_SUMMARY = {
    tldr: 'A short and clear takeaway sentence.',
    keyTakeaways: ['One', 'Two', 'Three'],
    openQuestions: ['What now?'],
    suggestedReviewFocus: 'Re-read tomorrow morning.',
}

describe('validateNoteSummary', () => {
    it('accepts a well-formed summary', () => {
        expect(validateNoteSummary(VALID_NOTE_SUMMARY).valid).toBe(true)
    })

    it('rejects empty tldr', () => {
        const r = validateNoteSummary({ ...VALID_NOTE_SUMMARY, tldr: '' })
        expect(r.valid).toBe(false)
        expect(r.violations).toContain('tldr-empty')
    })

    it('rejects tldr > 280 chars', () => {
        const r = validateNoteSummary({
            ...VALID_NOTE_SUMMARY,
            tldr: 'a'.repeat(281),
        })
        expect(r.violations).toContain('tldr-too-long')
    })

    it('rejects fewer than 3 takeaways', () => {
        const r = validateNoteSummary({
            ...VALID_NOTE_SUMMARY,
            keyTakeaways: ['just one'],
        })
        expect(r.violations.some(v => v.startsWith('keyTakeaways-count'))).toBe(true)
    })

    it('rejects more than 3 open questions', () => {
        const r = validateNoteSummary({
            ...VALID_NOTE_SUMMARY,
            openQuestions: ['a', 'b', 'c', 'd'],
        })
        expect(r.violations).toContain('openQuestions-cap-exceeded')
    })

    it('rejects empty suggestedReviewFocus', () => {
        const r = validateNoteSummary({
            ...VALID_NOTE_SUMMARY,
            suggestedReviewFocus: '',
        })
        expect(r.violations).toContain('suggestedReviewFocus-empty')
    })

    it('rejects "note is empty" claim when content is present', () => {
        const r = validateNoteSummary(
            { ...VALID_NOTE_SUMMARY, tldr: 'The note is empty so nothing to summarize.' },
            { hasContent: true },
        )
        expect(r.violations).toContain('emptiness-claim-when-content-present')
    })
})

describe('validateNoteAutoTag', () => {
    it('accepts 3-7 valid kebab tags', () => {
        const r = validateNoteAutoTag({ tags: ['stripe', 'webhooks', 'idempotency'] })
        expect(r.valid).toBe(true)
    })

    it('rejects fewer than 3 tags', () => {
        const r = validateNoteAutoTag({ tags: ['only-one'] })
        expect(r.violations.some(v => v.startsWith('tags-count'))).toBe(true)
    })

    it('rejects more than 7 tags', () => {
        const r = validateNoteAutoTag({
            tags: ['a-b', 'c-d', 'e-f', 'g-h', 'i-j', 'k-l', 'm-n', 'o-p'],
        })
        expect(r.violations.some(v => v.startsWith('tags-count'))).toBe(true)
    })

    it('rejects non-kebab tags', () => {
        const r = validateNoteAutoTag({ tags: ['Foo', 'bar', 'baz'] })
        expect(r.violations.some(v => v.endsWith('-not-kebab'))).toBe(true)
    })

    it('rejects duplicates', () => {
        const r = validateNoteAutoTag({ tags: ['foo', 'foo', 'bar'] })
        expect(r.violations.some(v => v.endsWith('-duplicate'))).toBe(true)
    })

    it('rejects tags that collide with existing user tags', () => {
        const r = validateNoteAutoTag(
            { tags: ['react', 'redux', 'jest'] },
            { existingTags: ['react'] },
        )
        expect(r.violations.some(v => v.endsWith('-collides-existing'))).toBe(true)
    })

    it('rejects tags too short or too long', () => {
        const r = validateNoteAutoTag({ tags: ['a', 'b'.repeat(31), 'c'] })
        expect(r.violations.some(v => v.endsWith('-len'))).toBe(true)
    })
})

describe('validateNoteRelated', () => {
    const candidateNoteIds = ['n1', 'n2']
    const candidateProblemIds = ['p1', 'p2']

    it('accepts a valid response', () => {
        const r = validateNoteRelated(
            {
                relatedNotes: [{ id: 'n1', rationale: 'Same topic.' }],
                relatedProblems: [{ id: 'p1', rationale: 'Direct extension.' }],
            },
            { candidateNoteIds, candidateProblemIds },
        )
        expect(r.valid).toBe(true)
    })

    it('rejects ids not in the candidate set', () => {
        const r = validateNoteRelated(
            {
                relatedNotes: [{ id: 'fake', rationale: 'x' }],
                relatedProblems: [],
            },
            { candidateNoteIds, candidateProblemIds },
        )
        expect(r.violations.some(v => v.endsWith('id-not-in-candidates'))).toBe(true)
    })

    it('rejects > 5 entries per section', () => {
        const r = validateNoteRelated(
            {
                relatedNotes: Array(6).fill({ id: 'n1', rationale: 'x' }),
                relatedProblems: [],
            },
            { candidateNoteIds, candidateProblemIds },
        )
        expect(r.violations).toContain('relatedNotes-cap-exceeded')
    })

    it('rejects empty rationale', () => {
        const r = validateNoteRelated(
            {
                relatedNotes: [{ id: 'n1', rationale: '' }],
                relatedProblems: [],
            },
            { candidateNoteIds, candidateProblemIds },
        )
        expect(r.violations.some(v => v.endsWith('rationale-empty'))).toBe(true)
    })

    it('rejects rationale > 120 chars', () => {
        const r = validateNoteRelated(
            {
                relatedNotes: [{ id: 'n1', rationale: 'x'.repeat(121) }],
                relatedProblems: [],
            },
            { candidateNoteIds, candidateProblemIds },
        )
        expect(r.violations.some(v => v.endsWith('rationale-too-long'))).toBe(true)
    })

    it('rejects duplicate ids', () => {
        const r = validateNoteRelated(
            {
                relatedNotes: [
                    { id: 'n1', rationale: 'one' },
                    { id: 'n1', rationale: 'two' },
                ],
                relatedProblems: [],
            },
            { candidateNoteIds, candidateProblemIds },
        )
        expect(r.violations.some(v => v.endsWith('id-duplicate'))).toBe(true)
    })

    it('accepts empty arrays', () => {
        const r = validateNoteRelated(
            { relatedNotes: [], relatedProblems: [] },
            { candidateNoteIds, candidateProblemIds },
        )
        expect(r.valid).toBe(true)
    })
})

describe('validateNoteFlashcards', () => {
    const VALID_DRAFT = {
        front: 'What is a B-tree index?',
        back: 'A balanced tree structure used as the default Postgres index, supporting equality and range queries.',
        type: 'DEFINITION',
        tagSuggestions: ['postgres', 'indexes'],
    }
    const VALID = {
        drafts: [
            VALID_DRAFT,
            { ...VALID_DRAFT, front: 'How does GIN differ from B-tree?', type: 'CONTRAST' },
            { ...VALID_DRAFT, front: 'Why pick a partial index?', type: 'CONCEPT' },
        ],
    }

    it('accepts a well-formed draft set', () => {
        expect(validateNoteFlashcards(VALID).valid).toBe(true)
    })

    it('rejects fewer than 3 drafts', () => {
        const r = validateNoteFlashcards({ drafts: [VALID_DRAFT] })
        expect(r.violations.some(v => v.startsWith('drafts-count'))).toBe(true)
    })

    it('rejects more than 7 drafts', () => {
        const r = validateNoteFlashcards({
            drafts: Array(8).fill(VALID_DRAFT),
        })
        expect(r.violations.some(v => v.startsWith('drafts-count'))).toBe(true)
    })

    it('rejects empty front', () => {
        const r = validateNoteFlashcards({
            drafts: [{ ...VALID_DRAFT, front: '' }, VALID_DRAFT, VALID_DRAFT],
        })
        expect(r.violations.some(v => v.endsWith('.front-empty'))).toBe(true)
    })

    it('rejects front > 200 chars', () => {
        const r = validateNoteFlashcards({
            drafts: [{ ...VALID_DRAFT, front: 'a'.repeat(201) }, VALID_DRAFT, VALID_DRAFT],
        })
        expect(r.violations.some(v => v.endsWith('.front-too-long'))).toBe(true)
    })

    it('rejects back > 500 chars', () => {
        const r = validateNoteFlashcards({
            drafts: [{ ...VALID_DRAFT, back: 'a'.repeat(501) }, VALID_DRAFT, VALID_DRAFT],
        })
        expect(r.violations.some(v => v.endsWith('.back-too-long'))).toBe(true)
    })

    it('rejects invalid type enum', () => {
        const r = validateNoteFlashcards({
            drafts: [{ ...VALID_DRAFT, type: 'TRIVIA' }, VALID_DRAFT, VALID_DRAFT],
        })
        expect(r.violations.some(v => v.endsWith('.type-invalid'))).toBe(true)
    })

    it('rejects 5+ drafts that are all DEFINITION (laziness)', () => {
        const r = validateNoteFlashcards({
            drafts: Array(5).fill({ ...VALID_DRAFT, type: 'DEFINITION' }),
        })
        expect(r.violations).toContain('all-definitions-laziness-signal')
    })

    it('rejects non-kebab tagSuggestions', () => {
        const r = validateNoteFlashcards({
            drafts: [
                { ...VALID_DRAFT, tagSuggestions: ['Foo Bar'] },
                VALID_DRAFT,
                VALID_DRAFT,
            ],
        })
        expect(r.violations.some(v => v.endsWith('-not-kebab'))).toBe(true)
    })
})
