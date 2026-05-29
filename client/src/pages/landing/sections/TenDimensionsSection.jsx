import { motion, useReducedMotion } from 'framer-motion'

// Source-of-truth content for the 10D grid. Match server-side stats utils:
//   patternMastery.js, solutionDepth.js, communicationStats.js,
//   optimizationStats.js, pressurePerformanceStats.js, retentionStats.js,
//   teachingStats.js, designAptitudeStats.js, behavioralPerformanceStats.js,
//   verificationStats.js
// Citations are real — they appear in the schema.prisma comments and
// readinessTiers.js as the basis for the actual scoring formulas.
const DIMS = [
    {
        n: 'D1',
        title: 'Pattern Mastery',
        desc: '5-state per-pattern progression across 15 FAANG-core algorithms — UNTOUCHED → TOUCHED → WORKING → SOLID → OWNED.',
        cite: 'Bloom 1956 · Chi 1981',
        accent: '#7c6ff7',
        showPills: true,
    },
    {
        n: 'D2',
        title: 'Solution Depth',
        desc: 'NONE → DOCUMENTED → EXPLAINED → DEFENDED → OWNED, gated by AI follow-up scores and retrieval-practice recall.',
        cite: 'Karpicke-Roediger 2008',
        accent: '#22c55e',
    },
    {
        n: 'D3',
        title: 'Communication',
        desc: 'Source-tier ceiling — written-only caps at 55, live-mock signal lifts to 80, peer-validated reaches 100.',
        cite: 'Anderson-Shackleton 1990',
        accent: '#3b82f6',
    },
    {
        n: 'D4',
        title: 'Optimization',
        desc: 'Trade-off articulation graded by AI complexity-check verification. Brute-force → optimized → trade-off → owned.',
        cite: 'Sweller 1988',
        accent: '#eab308',
    },
    {
        n: 'D5',
        title: 'Pressure Performance',
        desc: 'Mock-weighted live signal vs quiz-proxy, ceiling-clamped. Quiz-only caps at 40 — proxies are noisy.',
        cite: 'Schmidt-Hunter 1998',
        accent: '#ef4444',
    },
    {
        n: 'D6',
        title: 'Knowledge Retention',
        desc: 'FSRS-based forgetting curves with leech detection at ≥8 lapses. Small-sample claims auto-hedged.',
        cite: 'Karpicke-Roediger 2008 · Lange-Wang-Dunlosky 2013',
        accent: '#a855f7',
    },
    {
        n: 'D7',
        title: 'Teaching Contributions',
        desc: 'Peer-rating cohort stability after ≥3 sessions. Pure volume capped at 10% — outcome variable is what peers learned.',
        cite: 'Topping 1996 · Fiorella-Mayer 2013',
        accent: '#f97316',
    },
    {
        n: 'D8',
        title: 'Design Aptitude',
        desc: 'System Design + LLD via AI scenario probing. 10-dim breakdown + scenario resilience + interviewer-paired sessions.',
        cite: 'Schoenfeld 1985 · Newell-Simon 1972',
        accent: '#06b6d4',
    },
    {
        n: 'D9',
        title: 'Behavioral',
        desc: 'Calibration delta + STAR coverage + culture-style diversity across ≥3 distinct interview styles.',
        cite: 'Lievens-De Soete 2012',
        accent: '#ec4899',
    },
    {
        n: 'D10',
        title: 'Verification & Meta-cognition',
        desc: 'Calibrated confidence + complexity-check accuracy + edge-case independence — the durable LLM-era skill.',
        cite: 'Kruger-Dunning 1999',
        accent: '#10b981',
    },
]

// 5-state pill row demo — visually echoes the real PatternMasteryCard summary.
// Mock distribution chosen to feel realistic for a mid-prep candidate.
const D1_PILLS = [
    { state: 'OWNED', count: 2, color: '#22c55e' },
    { state: 'SOLID', count: 4, color: '#7c6ff7' },
    { state: 'WORKING', count: 5, color: '#3b82f6' },
    { state: 'TOUCHED', count: 3, color: '#eab308' },
    { state: 'UNTOUCHED', count: 1, color: '#50506a' },
]

export default function TenDimensionsSection() {
    const reduce = useReducedMotion()

    const sectionMotion = reduce
        ? {}
        : {
            initial: { opacity: 0, y: 24 },
            whileInView: { opacity: 1, y: 0 },
            viewport: { once: true, margin: '-80px' },
            transition: { duration: 0.6, ease: 'easeOut' },
        }

    return (
        <motion.section
            id="ten-dimensions"
            className="py-20 lg:py-28 border-t border-border-subtle scroll-mt-20"
            {...sectionMotion}
        >
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
                <div className="text-center mb-14">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-brand-fg-soft mb-3">
                        The Readiness System
                    </p>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-text-primary mb-4">
                        One score per skill. Ten skills that matter.
                    </h2>
                    <p className="text-lg text-text-secondary max-w-2xl mx-auto">
                        Every dimension has a research-backed scoring formula and a tier gate.
                        You can't game your way to a FAANG-tier verdict on a single strength.
                    </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {DIMS.map((dim, i) => (
                        <DimCard key={dim.n} dim={dim} index={i} reduce={reduce} />
                    ))}
                </div>
            </div>
        </motion.section>
    )
}

function DimCard({ dim, index, reduce }) {
    const cardMotion = reduce
        ? {}
        : {
            initial: { opacity: 0, y: 12 },
            whileInView: { opacity: 1, y: 0 },
            viewport: { once: true, margin: '-50px' },
            transition: { duration: 0.4, delay: index * 0.04, ease: 'easeOut' },
        }

    return (
        <motion.article
            className="group relative bg-surface-1 border border-border-default rounded-2xl p-5
                       hover:border-brand-line transition-colors duration-200"
            {...cardMotion}
        >
            <div className="flex items-baseline gap-2 mb-3">
                <span
                    className="font-mono font-extrabold text-lg"
                    style={{ color: dim.accent }}
                >
                    {dim.n}
                </span>
                <h3 className="text-base font-bold text-text-primary">{dim.title}</h3>
            </div>

            <p className="text-sm text-text-secondary leading-relaxed mb-3">
                {dim.desc}
            </p>

            {dim.showPills && (
                <div className="flex gap-1 mb-3" aria-label="Sample pattern distribution">
                    {D1_PILLS.map(p => (
                        <div
                            key={p.state}
                            className="h-1.5 rounded-full"
                            style={{
                                backgroundColor: p.color,
                                flex: p.count,
                                opacity: 0.85,
                            }}
                            title={`${p.state}: ${p.count}`}
                        />
                    ))}
                </div>
            )}

            <p className="text-[10px] uppercase tracking-wider text-text-disabled font-bold mt-auto">
                {dim.cite}
            </p>
        </motion.article>
    )
}
