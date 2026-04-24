import { motion } from 'framer-motion'
import { cn } from '@utils/cn'
import {
    Section, SectionBadge, SectionTitle, SectionDesc,
    AnimatedNumber, DimensionCard, TimelinePhase
} from './components'

const ROADMAP = [
    {
        phase: 'Live Now',
        title: 'Complete Interview Intelligence Platform',
        color: 'border-success',
        dotColor: 'bg-success',
        badge: { text: 'LIVE', color: 'bg-success/12 text-success border-success/25' },
        items: [
            '6-category problem system with category-specific submission forms',
            'AI Mock Interviewer — GPT-4o, 8 culture styles, WebSocket streaming, debrief',
            'RAG-enhanced AI Solution Review with pgvector teammate comparison',
            'AI Quiz Generation on any subject with post-quiz analysis',
            'Spaced repetition review queue with adaptive scheduling',
            '6D Intelligence Report with AI weekly coaching plans',
            'Multi-tenant team system with join codes, roles, and admin tools',
            'Platform Admin dashboard with AI-powered health analytics',
            'API versioning (/api/v1/), structured error handling with request IDs',
        ],
    },
    {
        phase: 'Coming Next',
        title: 'Enhanced Experience',
        color: 'border-brand-400',
        dotColor: 'bg-brand-400',
        badge: { text: 'NEXT', color: 'bg-brand-400/12 text-brand-300 border-brand-400/25' },
        items: [
            'AI Problem Library — seed teams with 50+ problems in 30 seconds',
            'Voice-based mock interviews (Whisper STT + TTS)',
            'Email notifications — review reminders, weekly digest',
            'Google + GitHub OAuth for frictionless onboarding',
            'Competition system with timed events and live leaderboard',
        ],
    },
    {
        phase: 'Future',
        title: 'Advanced Intelligence',
        color: 'border-warning',
        dotColor: 'bg-warning',
        badge: { text: 'PLANNED', color: 'bg-warning/12 text-warning border-warning/25' },
        items: [
            'Fine-tuned scoring model — instant quality assessment without API calls',
            'Cross-category pattern connections',
            'Interview pipeline tracker (company, stage, outcome)',
            'Mobile app for reviews and quizzes',
            'Adaptive quiz difficulty based on real-time performance',
        ],
    },
]

export default function Section7Stats({ stats }) {
    return (
        <Section id="stats" className="py-20 px-8 bg-surface-0">
            <div className="max-w-[1000px] mx-auto">
                {/* 6D Intelligence Dimensions */}
                <SectionBadge label="Readiness Intelligence" color="warning" />
                <SectionTitle
                    line1="6 dimensions of readiness."
                    line2="Computed, not guessed."
                    gradient="from-warning to-danger"
                />
                <SectionDesc>
                    Each dimension is scored 0-100 from real signals in your solving behavior.
                    No arbitrary points. No gaming. The more you engage, the more accurate it becomes.
                </SectionDesc>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-16">
                    <DimensionCard num="D1" name="Pattern Recognition" color="#7c6ff7"
                        desc="Speed and accuracy at identifying the right algorithm pattern."
                        signals="Pattern diversity, identification speed, cross-problem recognition" delay={0} />
                    <DimensionCard num="D2" name="Solution Depth" color="#22c55e"
                        desc="Quality of key insights, Feynman explanations, and real-world connections."
                        signals="Insight written, explanation quality, confidence level" delay={0.05} />
                    <DimensionCard num="D3" name="Communication" color="#3b82f6"
                        desc="Clarity of your explanations as rated by teammates."
                        signals="Peer clarity ratings (1-5 stars), STAR structure" delay={0.10} />
                    <DimensionCard num="D4" name="Optimization" color="#eab308"
                        desc="Ability to progress from brute force to optimal solutions."
                        signals="Both approaches documented, complexity analyzed" delay={0.15} />
                    <DimensionCard num="D5" name="Pressure Performance" color="#ef4444"
                        desc="How well you perform under timed conditions."
                        signals="Sim completion rate, scores, hint-free rate" delay={0.20} />
                    <DimensionCard num="D6" name="Knowledge Retention" color="#a855f7"
                        desc="How well you recall solutions during spaced repetition."
                        signals="Review completion, confidence over time" delay={0.25} />
                </div>

                {/* Live Platform Stats */}
                {stats && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-6 mb-16"
                    >
                        <h3 className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-5">
                            Platform Activity — Live
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                            {[
                                { icon: '👥', value: stats.totalUsers || 0, label: 'Users' },
                                { icon: '📋', value: stats.totalProblems || 0, label: 'Problems' },
                                { icon: '✅', value: stats.totalSolutions || 0, label: 'Solutions' },
                                { icon: '🧩', value: stats.totalQuizzes || 0, label: 'Quizzes' },
                                { icon: '💬', value: stats.totalSims || 0, label: 'Interviews' },
                            ].map((s, i) => (
                                <div key={s.label} className="text-center">
                                    <span className="text-2xl">{s.icon}</span>
                                    <div className="text-2xl font-extrabold font-mono text-text-primary mt-1">
                                        <AnimatedNumber value={s.value} />
                                    </div>
                                    <div className="text-[10px] text-text-disabled uppercase tracking-wider mt-0.5">
                                        {s.label}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* Roadmap */}
                <motion.h3
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="text-sm font-bold text-text-primary mb-6 flex items-center gap-2"
                >
                    <span>🗺️</span> Product Roadmap
                </motion.h3>
                <div className="space-y-4">
                    {ROADMAP.map((phase, i) => (
                        <TimelinePhase key={phase.phase} phase={phase} index={i} />
                    ))}
                </div>
            </div>
        </Section>
    )
}