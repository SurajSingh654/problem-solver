import { motion, useReducedMotion } from 'framer-motion'

const STEPS = [
    {
        n: '01',
        title: 'Practice',
        body: 'Pick from your sheet — Striver A2Z, Neetcode 150, Blind 75, LC Top 100. Tag pattern + solve method as you go.',
    },
    {
        n: '02',
        title: 'Defend',
        body: 'Answer AI-generated follow-ups for every solution. Rate your confidence first — calibration delta is part of your score.',
    },
    {
        n: '03',
        title: 'Mock',
        body: 'Run a timed mock interview. The AI verdict scores your delivery (clarifying, narration, edge-case discovery), not just your code.',
    },
    {
        n: '04',
        title: 'Iterate',
        body: 'Read your 10D report. Fix the lowest dimension. Repeat. The verdict prose tells you exactly what to do next.',
    },
]

export default function HowItWorksSection() {
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
                        The loop
                    </p>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-text-primary mb-4">
                        Four steps. Repeat until you're ready.
                    </h2>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
                    {STEPS.map((step, i) => (
                        <StepCard key={step.n} step={step} index={i} reduce={reduce} isLast={i === STEPS.length - 1} />
                    ))}
                </div>
            </div>
        </motion.section>
    )
}

function StepCard({ step, index, reduce, isLast }) {
    const cardMotion = reduce
        ? {}
        : {
            initial: { opacity: 0, y: 16 },
            whileInView: { opacity: 1, y: 0 },
            viewport: { once: true, margin: '-50px' },
            transition: { duration: 0.4, delay: index * 0.1, ease: 'easeOut' },
        }

    return (
        <motion.div className="relative" {...cardMotion}>
            {/* Connector line (between cards on desktop) — fades into the next card. */}
            {!isLast && (
                <div
                    className="hidden lg:block absolute top-8 -right-3 w-6 h-px bg-border-default"
                    aria-hidden="true"
                />
            )}

            <div className="bg-surface-1 border border-border-default rounded-2xl p-6 h-full">
                <div className="flex items-baseline gap-3 mb-3">
                    <span className="font-mono font-extrabold text-2xl text-brand-fg">
                        {step.n}
                    </span>
                    <h3 className="text-lg font-bold text-text-primary">{step.title}</h3>
                </div>
                <p className="text-sm text-text-secondary leading-relaxed">
                    {step.body}
                </p>
            </div>
        </motion.div>
    )
}
