import { motion } from 'framer-motion'
import {
    Section, SectionBadge, SectionTitle, SectionDesc,
    CategoryPill, StatCard, AnimatedNumber
} from './components'
import { PROBLEM_CATEGORIES } from '@utils/constants'

export default function Section2Vision({ stats }) {
    return (
        <Section id="vision" className="py-20 px-8">
            <div className="max-w-[1000px] mx-auto">
                <SectionBadge label="Our Vision" color="brand" />

                <SectionTitle
                    line1="The complete interview"
                    line2="operating system for teams."
                    gradient="from-brand-300 to-blue-400"
                />

                <SectionDesc>
                    ProbSolver isn't another LeetCode clone. It's a full learning intelligence
                    platform that covers every interview round — from coding to system design
                    to behavioral to HR — with AI-powered coaching, team collaboration,
                    and data-driven readiness tracking. One platform. Every round. Every dimension.
                </SectionDesc>

                {/* What makes it different — 3 pillars */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
                    {[
                        {
                            icon: '🧠',
                            title: 'Intelligence, not just practice',
                            desc: 'Every solution, quiz, and simulation feeds a 6-dimension intelligence engine that measures actual interview readiness — not just problems solved.',
                        },
                        {
                            icon: '👥',
                            title: 'Team learning, not solo grinding',
                            desc: 'See how teammates solve the same problem. Rate each other\'s explanations. Compare approaches. The team gets smarter together.',
                        },
                        {
                            icon: '🤖',
                            title: 'AI that coaches, not just checks',
                            desc: 'RAG-enhanced reviews compare your work with teammates. AI mock interviews simulate real company cultures. Weekly coaching plans adapt to your gaps.',
                        },
                    ].map((pillar, i) => (
                        <motion.div
                            key={pillar.title}
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.08 }}
                            className="bg-surface-1 border border-border-default rounded-2xl p-5"
                        >
                            <span className="text-2xl">{pillar.icon}</span>
                            <h3 className="text-sm font-bold text-text-primary mt-3 mb-1.5">
                                {pillar.title}
                            </h3>
                            <p className="text-xs text-text-tertiary leading-relaxed">
                                {pillar.desc}
                            </p>
                        </motion.div>
                    ))}
                </div>

                {/* Covers the full interview loop */}
                <motion.h3
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2"
                >
                    <span>📋</span> Covers the full interview loop — 6 categories
                </motion.h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-12">
                    {PROBLEM_CATEGORIES.map((cat, i) => (
                        <CategoryPill
                            key={cat.id}
                            cat={cat}
                            count={stats?.problemsByCategory?.[cat.id] || 0}
                            delay={i * 0.06}
                        />
                    ))}
                </div>

                {/* Live platform stats */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-6"
                >
                    <h3 className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-5">
                        Platform Stats — Live
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                        <StatCard icon="👥" value={stats?.totalUsers || 0} label="Team Members" delay={0} />
                        <StatCard icon="📋" value={stats?.totalProblems || 0} label="Problems" delay={0.04} />
                        <StatCard icon="✅" value={stats?.totalSolutions || 0} label="Solutions" delay={0.08} />
                        <StatCard icon="🧠" value={stats?.totalQuizzes || 0} label="Quizzes Taken" delay={0.12} />
                        <StatCard icon="💬" value={stats?.totalSims || 0} label="Mock Interviews" delay={0.16} />
                    </div>
                </motion.div>
            </div>
        </Section>
    )
}