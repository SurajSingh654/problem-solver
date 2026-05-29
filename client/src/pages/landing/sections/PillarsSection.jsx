import { motion, useReducedMotion } from 'framer-motion'

// Three live-product spotlights. Content is anchored to what's currently
// shipped + flag-ON in production. Pillar 3 mentions SM-2 spaced repetition
// as a feature footnote (don't over-promise: Notes is flag-off).
const PILLARS = [
    {
        emoji: '🎤',
        title: 'AI Mock Interview',
        tagline: 'A real interviewer probes you. The verdict scores your delivery, not just your code.',
        bullets: [
            'Eight interview styles — algorithm-focused, values-driven, high-pressure, and more',
            'Live transcript over WebSocket; voice + text supported',
            'Post-session debrief with calibration delta vs your pre-interview confidence',
        ],
        accent: '#7c6ff7',
    },
    {
        emoji: '🏗️',
        title: 'Design Studio',
        tagline: 'System design + LLD with live AI scenario probing on a real Excalidraw canvas.',
        bullets: [
            'Three coaching modes — Validate, Guide, Teach — adapt to your skill level',
            'AI generates 3-5 resilience scenarios per session and grades your answers',
            'Interview mode pairs the canvas with a live mock so the interviewer sees what you draw',
        ],
        accent: '#06b6d4',
    },
    {
        emoji: '📚',
        title: 'Curriculum-aware Library',
        tagline: 'Track progress across Striver A2Z, Neetcode 150, Blind 75, and LC Top 100 simultaneously.',
        bullets: [
            'Cross-curriculum tagging — one problem can belong to multiple sheets',
            'AI-generated problems matching your team\'s gaps, with optional URL recall',
            'SM-2 spaced repetition queue — you forget less, you re-learn faster',
        ],
        accent: '#22c55e',
    },
]

export default function PillarsSection() {
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
                        Three pillars
                    </p>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-text-primary mb-4">
                        Built around the three things FAANG actually tests.
                    </h2>
                    <p className="text-lg text-text-secondary max-w-2xl mx-auto">
                        Coding fluency is table stakes. Design depth and interview delivery are what separate
                        offers from rejections.
                    </p>
                </div>

                <div className="grid lg:grid-cols-3 gap-5">
                    {PILLARS.map((p, i) => (
                        <PillarCard key={p.title} pillar={p} index={i} reduce={reduce} />
                    ))}
                </div>
            </div>
        </motion.section>
    )
}

function PillarCard({ pillar, index, reduce }) {
    const cardMotion = reduce
        ? {}
        : {
            initial: { opacity: 0, y: 16 },
            whileInView: { opacity: 1, y: 0 },
            viewport: { once: true, margin: '-50px' },
            transition: { duration: 0.5, delay: index * 0.08, ease: 'easeOut' },
        }

    return (
        <motion.div
            className="relative bg-surface-1 border border-border-default rounded-2xl p-7
                       hover:border-brand-line transition-colors duration-200 overflow-hidden"
            {...cardMotion}
        >
            {/* Top accent bar in pillar's brand color */}
            <div
                className="absolute top-0 left-0 right-0 h-0.5"
                style={{ backgroundColor: pillar.accent }}
                aria-hidden="true"
            />

            <div className="text-3xl mb-4" aria-hidden="true">{pillar.emoji}</div>

            <h3 className="text-xl font-extrabold text-text-primary mb-2">{pillar.title}</h3>

            <p className="text-sm text-text-secondary leading-relaxed mb-5">
                <em>{pillar.tagline}</em>
            </p>

            <ul className="space-y-2.5">
                {pillar.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-text-secondary">
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke={pillar.accent}
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="flex-shrink-0 mt-0.5"
                            aria-hidden="true"
                        >
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>{b}</span>
                    </li>
                ))}
            </ul>
        </motion.div>
    )
}
