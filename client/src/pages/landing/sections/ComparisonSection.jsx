import { motion, useReducedMotion } from 'framer-motion'

// Three subtle column comparison. Don't name competitors — readers know who
// "single-score platforms" and "static video courses" are. Three rows that
// hit the actual differentiators of ProbSolver: readiness measurement,
// calibration, and probing depth.
const ROWS = [
    {
        question: 'Tells you if you\'re ready for a real interview?',
        cells: [false, false, true],
    },
    {
        question: 'Calibrates your self-assessment against ground truth?',
        cells: [false, false, true],
    },
    {
        question: 'Probes your trade-off thinking, not just your code?',
        cells: [false, false, true],
    },
    {
        question: 'Tracks progression across multiple curriculum sheets?',
        cells: [false, false, true],
    },
]

const HEADERS = [
    'Single-score platforms',
    'Static video courses',
    'ProbSolver',
]

export default function ComparisonSection() {
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
        <motion.section className="py-20 lg:py-28 border-t border-border-subtle" {...sectionMotion}>
            <div className="max-w-4xl mx-auto px-4 sm:px-6">
                <div className="text-center mb-12">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-brand-fg-soft mb-3">
                        How it compares
                    </p>
                    <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-text-primary mb-3">
                        What other tools won't tell you.
                    </h2>
                </div>

                <div className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden">
                    {/* Header row */}
                    <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] sm:grid-cols-[2fr_1fr_1fr_1fr] gap-2 sm:gap-4 px-4 sm:px-6 py-4 border-b border-border-subtle bg-surface-2/50">
                        <div />
                        {HEADERS.map((h, i) => (
                            <div
                                key={h}
                                className={`text-[10px] sm:text-xs uppercase tracking-wider font-bold text-center ${i === 2 ? 'text-brand-fg-soft' : 'text-text-disabled'
                                    }`}
                            >
                                {h}
                            </div>
                        ))}
                    </div>

                    {/* Body rows */}
                    {ROWS.map((row, idx) => (
                        <div
                            key={row.question}
                            className={`grid grid-cols-[1.5fr_1fr_1fr_1fr] sm:grid-cols-[2fr_1fr_1fr_1fr] gap-2 sm:gap-4 px-4 sm:px-6 py-4 items-center ${idx !== ROWS.length - 1 ? 'border-b border-border-subtle' : ''
                                }`}
                        >
                            <p className="text-sm text-text-primary font-medium">
                                {row.question}
                            </p>
                            {row.cells.map((on, i) => (
                                <div key={i} className="flex justify-center">
                                    <CellMark on={on} highlight={i === 2} />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </motion.section>
    )
}

function CellMark({ on, highlight }) {
    if (on) {
        return (
            <span
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${highlight ? 'bg-brand-soft text-brand-fg' : 'bg-success-soft text-success-fg'
                    }`}
                aria-label="Yes"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </span>
        )
    }
    return (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-text-disabled" aria-label="No">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
        </span>
    )
}
