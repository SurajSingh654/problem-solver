import { motion } from 'framer-motion'
import { cn } from '@utils/cn'
import { Section, PainPoint } from './components'

export default function Section1Problem() {
    return (
        <Section id="problem">
            <div className="relative overflow-hidden hero-gradient">
                {/* Background orbs */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-[-150px] right-[-100px] w-[500px] h-[500px]
                          rounded-full bg-danger/5 blur-[120px]" />
                    <div className="absolute bottom-[-100px] left-[-50px] w-[400px] h-[400px]
                          rounded-full bg-brand-400/5 blur-[100px]" />
                </div>

                <div className="relative z-10 max-w-[1000px] mx-auto px-8 py-20">
                    {/* Eyebrow */}
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="inline-flex items-center gap-2 bg-danger/10 border border-danger/25
                       rounded-full px-4 py-1.5 mb-8"
                    >
                        <div className="w-2 h-2 rounded-full bg-danger animate-pulse-dot" />
                        <span className="text-xs font-semibold text-danger">The Problem</span>
                    </motion.div>

                    {/* Headline */}
                    <motion.h1
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-4xl sm:text-5xl font-extrabold text-white
                       tracking-tight leading-tight mb-6"
                    >
                        Most engineers fail top interviews<br />
                        <span className="bg-gradient-to-r from-danger to-warning
                             bg-clip-text text-transparent">
                            not because they can't code.
                        </span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="text-lg text-white/60 max-w-2xl mb-10 leading-relaxed"
                    >
                        They memorize solutions instead of building pattern recognition.
                        They practice alone instead of learning from peers. They prepare
                        for coding rounds but ignore system design, behavioral, and HR —
                        the rounds where most rejections actually happen.
                    </motion.p>

                    {/* Pain points — 4 cards in 2x2 grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-12">
                        <PainPoint
                            icon="🔄"
                            title="Solving without understanding"
                            desc="100 LeetCode problems solved, but can't recognize the pattern in a new one. Memorization ≠ understanding. Without pattern recognition, every new problem feels like starting from scratch."
                            delay={0.3}
                        />
                        <PainPoint
                            icon="🏝️"
                            title="Practicing in isolation"
                            desc="No idea how teammates approach the same problem. No peer feedback on your explanations. No accountability to stay consistent. Solo prep leads to blind spots you never discover."
                            delay={0.35}
                        />
                        <PainPoint
                            icon="🎯"
                            title="Ignoring the full interview loop"
                            desc="80% of prep time goes to coding, 0% to system design, behavioral, and HR — yet those rounds cause 60% of rejections. A balanced prep strategy is non-negotiable for top companies."
                            delay={0.4}
                        />
                        <PainPoint
                            icon="📉"
                            title="No way to measure readiness"
                            desc="'Am I ready for my interview next week?' Nobody can answer this with data. Without measurable readiness dimensions, you're guessing — and guessing costs offers."
                            delay={0.45}
                        />
                    </div>

                    {/* Industry statistics */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="flex flex-wrap gap-8 text-center"
                    >
                        {[
                            { stat: '67%', label: 'of candidates fail behavioral rounds', color: 'text-danger' },
                            { stat: '73%', label: "can't design systems under time pressure", color: 'text-warning' },
                            { stat: '89%', label: 'forget solutions within 2 weeks without review', color: 'text-danger' },
                            { stat: '4.2', label: 'average interviews before first offer', color: 'text-warning' },
                        ].map((s, i) => (
                            <div key={i}>
                                <span className={cn('text-2xl font-extrabold font-mono', s.color)}>
                                    {s.stat}
                                </span>
                                <p className="text-xs text-white/40 mt-0.5 max-w-[160px]">{s.label}</p>
                            </div>
                        ))}
                    </motion.div>
                </div>
            </div>
        </Section>
    )
}