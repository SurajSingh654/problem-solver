// ============================================================================
// Per-phase teaching rubric — used by the proactive stuck-detector
// ============================================================================
//
// For each phase, two pieces of static teaching content:
//
//   1. `stuckThresholdSec` — minimum dwell time before a stuck nudge is
//      eligible. Picked roughly per-phase based on Sweller's element-
//      interactivity threshold (~4 min for the simplest phases) and the
//      observation that SD interviewers expect pacing per phase. Gives
//      thoughtful users plenty of room before the nudge fires.
//
//   2. `bullets` — 3–5 questions a strong answer to this phase
//      addresses. Shown in the `StuckNudgeCard` so the user has a
//      concrete next-step list, AND sent to the LLM via `stuckContext`
//      so the `guide` mode can prioritise rubric items the candidate
//      hasn't addressed yet.
//
// Trusted teaching material — same role as the `<admin_reference>` block
// in the prompt. Kept client-side because the rubric drives a UI nudge
// before any server call.
// ============================================================================

const SD_RUBRIC = {
    requirements: {
        stuckThresholdSec: 4 * 60,
        bullets: [
            'Have you split functional vs non-functional requirements?',
            'Quantified throughput, latency, and storage targets?',
            'Named what is explicitly out of scope?',
            'Identified the read:write ratio and access patterns?',
        ],
    },
    capacityEstimation: {
        stuckThresholdSec: 6 * 60,
        bullets: [
            'Estimated peak QPS using a 3× factor over average?',
            'Computed storage 3-5 years out, including indexes?',
            'Sized bandwidth for both reads and writes?',
            'Noted which numbers are bottleneck candidates?',
        ],
    },
    apiDesign: {
        stuckThresholdSec: 6 * 60,
        bullets: [
            'Defined request/response shapes for the top 3 operations?',
            'Specified auth + idempotency where it matters?',
            'Made resource-oriented vs RPC-style choice explicit?',
            'Noted which endpoints are public vs internal?',
        ],
    },
    dataModel: {
        stuckThresholdSec: 8 * 60,
        bullets: [
            'Picked a primary key + sharding strategy?',
            'Identified which fields go in which storage layer?',
            'Listed access patterns and the indexes they need?',
            'Decided where you need transactions vs eventual consistency?',
        ],
    },
    architecture: {
        stuckThresholdSec: 10 * 60,
        bullets: [
            'Named every component on the canvas in the data flow text?',
            'Drawn both the read path and the write path?',
            'Identified caching layer + invalidation strategy?',
            'Marked async vs sync edges (queues, workers)?',
            'Called out the single points of failure?',
        ],
    },
    deepDive: {
        stuckThresholdSec: 10 * 60,
        bullets: [
            'Picked 2-3 critical components to drill into?',
            'For each, named the algorithm or protocol and why?',
            'Identified the failure modes of each chosen component?',
            'Said how the design recovers from each failure?',
        ],
    },
    tradeoffs: {
        stuckThresholdSec: 5 * 60,
        bullets: [
            'Listed 3+ decisions you made and the alternatives you rejected?',
            'For each, given the cost as well as the benefit?',
            'Identified at least one decision you would revisit at 10× scale?',
        ],
    },
}

const LLD_RUBRIC = {
    requirements: {
        stuckThresholdSec: 4 * 60,
        bullets: [
            'Listed 3-5 user-level use cases?',
            'Specified concurrency expectations (single-threaded vs multi)?',
            'Named what is explicitly out of scope?',
            'Identified extension points likely to change later?',
        ],
    },
    entities: {
        stuckThresholdSec: 5 * 60,
        bullets: [
            'Picked entities with a single, clear responsibility each?',
            'Named the relationships (has-a / is-a / uses-a)?',
            'Avoided god-objects that own too many concerns?',
        ],
    },
    classHierarchy: {
        stuckThresholdSec: 8 * 60,
        bullets: [
            'Used composition where shared behaviour does NOT imply is-a?',
            'Used inheritance only where Liskov substitution holds?',
            'Defined small interfaces (ISP) instead of god-interfaces?',
            'Identified the abstractions clients should depend on (DIP)?',
        ],
    },
    designPatterns: {
        stuckThresholdSec: 7 * 60,
        bullets: [
            'Justified each pattern with a concrete force it resolves?',
            'Avoided pattern-for-pattern-sake (named over-engineered options)?',
            'Considered Strategy / Factory / Observer for points of variation?',
        ],
    },
    methodSignatures: {
        stuckThresholdSec: 10 * 60,
        bullets: [
            'Defined the 3-5 most-called methods with full signatures?',
            'Specified concurrency contract (thread-safe? blocking?)?',
            'Noted error contracts (exception vs result type)?',
            'Identified which methods are public vs package-private?',
        ],
    },
    solidAnalysis: {
        stuckThresholdSec: 5 * 60,
        bullets: [
            'Walked through each principle (S-O-L-I-D) explicitly?',
            'Named one principle you intentionally violated and why?',
            'Identified which principle is most load-bearing for this design?',
        ],
    },
}

const RUBRICS = {
    SYSTEM_DESIGN: SD_RUBRIC,
    LOW_LEVEL_DESIGN: LLD_RUBRIC,
}

export function getRubricForPhase(designType, phaseId) {
    return RUBRICS[designType]?.[phaseId] ?? null
}

export function getStuckThresholdSec(designType, phaseId) {
    const r = getRubricForPhase(designType, phaseId)
    // Conservative default: 8 minutes if a phaseId has no entry.
    return r?.stuckThresholdSec ?? 8 * 60
}

export function getRubricBullets(designType, phaseId) {
    return getRubricForPhase(designType, phaseId)?.bullets ?? []
}
