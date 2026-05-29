import { motion, useReducedMotion } from 'framer-motion'

// Three load-bearing studies the product is actually built on. Each citation
// matches a real schema.prisma comment or a readinessTiers.js rule basis.
// If we ever invalidate one of these (unlikely — they're foundational), the
// corresponding scoring formula has to change too.
const STUDIES = [
    {
        finding: 'Spaced retrieval beats re-reading',
        citation: 'Karpicke & Roediger 2008',
        why: 'Why ProbSolver uses an FSRS-based review queue for solutions and follow-ups — not flashcards. You forget less and re-learn faster.',
    },
    {
        finding: 'Calibrated confidence > raw confidence',
        citation: 'Kruger & Dunning 1999',
        why: 'Why we ask you to rate your confidence before you solve, and why D10 (Verification) measures the gap between what you predicted and what AI graded.',
    },
    {
        finding: 'Single mock interviews are poor predictors',
        citation: 'Lievens & De Soete 2012',
        why: 'Why FAANG-tier readiness requires ≥3 mocks across diverse styles. Rater stability builds with replication; one good interview is not signal.',
    },
]

export default function ResearchSection() {
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
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
                <div className="text-center mb-14">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-brand-fg-soft mb-3">
                        Why this works
                    </p>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-text-primary mb-4">
                        Built on cognitive-science research, not heuristics.
                    </h2>
                    <p className="text-lg text-text-secondary max-w-2xl mx-auto">
                        Every scoring formula in the readiness report cites a peer-reviewed study.
                        Three of the load-bearing ones:
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-5">
                    {STUDIES.map((s, i) => (
                        <StudyCard key={s.citation} study={s} index={i} reduce={reduce} />
                    ))}
                </div>
            </div>
        </motion.section>
    )
}

function StudyCard({ study, index, reduce }) {
    const cardMotion = reduce
        ? {}
        : {
            initial: { opacity: 0, y: 16 },
            whileInView: { opacity: 1, y: 0 },
            viewport: { once: true, margin: '-50px' },
            transition: { duration: 0.45, delay: index * 0.08, ease: 'easeOut' },
        }

    return (
        <motion.article
            className="bg-surface-1 border border-border-default rounded-2xl p-6"
            {...cardMotion}
        >
            <p className="text-[10px] uppercase tracking-widest font-bold text-brand-fg-soft mb-2">
                {study.citation}
            </p>
            <h3 className="text-lg font-extrabold text-text-primary mb-3 leading-tight">
                {study.finding}
            </h3>
            <p className="text-sm text-text-secondary leading-relaxed">
                {study.why}
            </p>
        </motion.article>
    )
}
