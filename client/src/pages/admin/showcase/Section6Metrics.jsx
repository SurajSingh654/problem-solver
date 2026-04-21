import { motion } from 'framer-motion'
import { cn } from '@utils/cn'
import {
    Section, SectionBadge, SectionTitle, SectionDesc,
    DimensionCard, AnimatedNumber
} from './components'

export default function Section6Metrics({ stats }) {
    return (
        <Section id="metrics" className="py-20 px-8">
            <div className="max-w-[1000px] mx-auto">
                <SectionBadge label="Metrics & Impact" color="warning" />

                <SectionTitle
                    line1="Data-driven readiness,"
                    line2="not guesswork."
                    gradient="from-warning to-danger"
                />

                <SectionDesc>
                    Traditional interview prep has no way to measure progress. You solve 100
                    problems and hope for the best. ProbSolver measures readiness across 6 dimensions
                    using signals from your actual solving behavior — giving you and your manager
                    a clear, objective picture of where you stand.
                </SectionDesc>

                {/* ── The 6D Intelligence Dimensions ─────────── */}
                <motion.h3
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2"
                >
                    <span>🕸</span> The 6D Intelligence Dimensions
                </motion.h3>
                <motion.p
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="text-xs text-text-tertiary leading-relaxed mb-5 max-w-2xl"
                >
                    Each dimension is scored 0-100 based on real signals in your solving behavior.
                    No arbitrary points. No gaming. The more thoroughly you engage, the more
                    accurate your profile becomes.
                </motion.p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-10">
                    <DimensionCard
                        num="D1" name="Pattern Recognition" color="#7c6ff7"
                        desc="Speed and accuracy at identifying the right algorithm pattern before writing any code."
                        signals="Pattern tagged, diversity across 16 patterns, identification speed"
                        delay={0}
                    />
                    <DimensionCard
                        num="D2" name="Solution Depth" color="#22c55e"
                        desc="Quality of explanations, key insights, Feynman explanations, and real-world connections."
                        signals="Key insight written, Feynman explanation, real-world connection, confidence"
                        delay={0.05}
                    />
                    <DimensionCard
                        num="D3" name="Communication" color="#3b82f6"
                        desc="Clarity of your written explanations as rated by teammates through peer reviews."
                        signals="Peer clarity ratings (1-5 stars), explanation quality, STAR structure"
                        delay={0.10}
                    />
                    <DimensionCard
                        num="D4" name="Optimization" color="#eab308"
                        desc="Ability to improve from brute force to optimal. Documenting the progression matters."
                        signals="Brute force → optimal documented, both time and space complexity analyzed"
                        delay={0.15}
                    />
                    <DimensionCard
                        num="D5" name="Pressure Performance" color="#ef4444"
                        desc="How well you perform under timed conditions in interview simulations and AI mock interviews."
                        signals="Sim completion rate, average scores, hint-free completion rate"
                        delay={0.20}
                    />
                    <DimensionCard
                        num="D6" name="Knowledge Retention" color="#a855f7"
                        desc="How well you recall solutions during spaced repetition reviews over days and weeks."
                        signals="Review confidence over time, on-time review completion, retention trend"
                        delay={0.25}
                    />
                </div>

                {/* ── What Gets Measured ──────────────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-6 mb-8"
                >
                    <h3 className="text-sm font-bold text-text-primary mb-5 flex items-center gap-2">
                        <span>📊</span> What Gets Measured — For Engineers and Managers
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {[
                            { icon: '📋', label: 'Problems Solved', desc: 'By difficulty, category, and pattern' },
                            { icon: '⏱', label: 'Interview Performance', desc: 'AI mock interview scores and debriefs' },
                            { icon: '🧠', label: 'Review Accuracy', desc: 'Spaced repetition confidence over time' },
                            { icon: '🧩', label: 'Quiz Scores', desc: 'By subject, difficulty, and weak topics' },
                            { icon: '🔥', label: 'Streak & Consistency', desc: 'Daily solving activity and active days' },
                            { icon: '👥', label: 'Team Comparison', desc: 'Rank, percentile, and peer ratings' },
                            { icon: '🎯', label: 'Goal Tracking', desc: 'Target company and interview date countdown' },
                            { icon: '📈', label: 'Weekly Trends', desc: 'Solved per week, dimension score changes' },
                        ].map((metric, i) => (
                            <motion.div
                                key={metric.label}
                                initial={{ opacity: 0, scale: 0.95 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.04 }}
                                className="text-center p-3 rounded-xl bg-surface-2 border border-border-subtle"
                            >
                                <span className="text-xl">{metric.icon}</span>
                                <p className="text-xs font-bold text-text-primary mt-1.5">{metric.label}</p>
                                <p className="text-[10px] text-text-disabled mt-0.5">{metric.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>

                {/* ── For Engineering Managers ────────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-6 mb-8"
                >
                    <h3 className="text-sm font-bold text-text-primary mb-2 flex items-center gap-2">
                        <span>👔</span> For Engineering Managers
                    </h3>
                    <p className="text-xs text-text-tertiary leading-relaxed mb-5">
                        You don't just need individual scores — you need team-wide visibility
                        to identify who's ready, who needs help, and where your content gaps are.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                            {
                                title: 'Team Readiness Dashboard',
                                desc: 'See which members are active, who has overdue reviews, who hasn\'t logged in recently. Identify at-risk members before they disengage.',
                                icon: '📊',
                            },
                            {
                                title: 'Content Coverage Analysis',
                                desc: 'Visualize which categories and patterns are well-covered vs sparse. The AI identifies gaps and recommends what problems to add next.',
                                icon: '📋',
                            },
                            {
                                title: 'AI Product Health Report',
                                desc: 'One-click AI analysis of your entire platform: engagement funnel, feature adoption, growth trends, risks — with specific actionable recommendations.',
                                icon: '🤖',
                            },
                        ].map((item, i) => (
                            <motion.div
                                key={item.title}
                                initial={{ opacity: 0, y: 8 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.08 }}
                                className="bg-surface-2 border border-border-subtle rounded-xl p-4"
                            >
                                <span className="text-xl">{item.icon}</span>
                                <h4 className="text-xs font-bold text-text-primary mt-2 mb-1">{item.title}</h4>
                                <p className="text-[11px] text-text-tertiary leading-relaxed">{item.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>

                {/* ── ROI for Teams ──────────────────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-warning/5 border border-warning/20 rounded-2xl p-6 mb-8"
                >
                    <h3 className="text-sm font-bold text-text-primary mb-5 flex items-center gap-2">
                        <span>💰</span> ROI — Why This Matters Financially
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        {[
                            {
                                metric: '3x',
                                label: 'Faster Pattern Recognition',
                                desc: 'Structured practice with AI feedback builds pattern recognition 3x faster than random LeetCode grinding.',
                                color: 'text-warning',
                            },
                            {
                                metric: '60%',
                                label: 'Better Retention',
                                desc: 'Spaced repetition reviews reduce knowledge decay by 60% vs one-time solving and forgetting.',
                                color: 'text-success',
                            },
                            {
                                metric: '100%',
                                label: 'Interview Loop Coverage',
                                desc: 'The only platform covering coding + system design + behavioral + HR + SQL + CS in one place.',
                                color: 'text-brand-300',
                            },
                            {
                                metric: '$0',
                                label: 'Per-Seat Cost',
                                desc: 'Self-hosted. Your data stays on your infrastructure. No per-user SaaS fees. Only OpenAI API costs (~$1-5/month for a team).',
                                color: 'text-info',
                            },
                        ].map((roi, i) => (
                            <motion.div
                                key={roi.label}
                                initial={{ opacity: 0, y: 8 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.08 }}
                                className="text-center"
                            >
                                <div className={cn('text-3xl font-extrabold font-mono mb-1', roi.color)}>
                                    {roi.metric}
                                </div>
                                <p className="text-xs font-bold text-text-primary mb-1">{roi.label}</p>
                                <p className="text-[10px] text-text-tertiary leading-relaxed">{roi.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>

                {/* ── The Hidden Cost of Bad Prep ─────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-danger/5 border border-danger/20 rounded-2xl p-6 mb-8"
                >
                    <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                        <span>⚠️</span> The Hidden Cost of Unstructured Prep
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[
                            {
                                stat: '4.2',
                                unit: 'interviews',
                                desc: 'Average number of full interview loops before landing an offer. Each loop costs the candidate weeks of prep time and the company thousands in interviewer hours.',
                            },
                            {
                                stat: '~80',
                                unit: 'hours',
                                desc: 'Average time spent preparing for a single FAANG-tier interview loop. Most of this time is unstructured LeetCode grinding with no feedback on weak areas.',
                            },
                            {
                                stat: '40%',
                                unit: 'rejection rate',
                                desc: 'Of candidates who fail, 40% cite system design or behavioral rounds — rounds that most prep tools don\'t cover at all.',
                            },
                        ].map((item, i) => (
                            <motion.div
                                key={item.stat}
                                initial={{ opacity: 0, y: 8 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.08 }}
                                className="text-center"
                            >
                                <div className="flex items-end justify-center gap-1 mb-1">
                                    <span className="text-3xl font-extrabold font-mono text-danger">{item.stat}</span>
                                    <span className="text-xs text-danger font-semibold mb-1">{item.unit}</span>
                                </div>
                                <p className="text-[10px] text-text-tertiary leading-relaxed">{item.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>

                {/* ── Live Platform Health (if stats available) ── */}
                {stats && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-6"
                    >
                        <h3 className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-5">
                            Live Platform Health
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {[
                                {
                                    icon: '📋',
                                    value: stats.totalProblems || 0,
                                    label: 'Active Problems',
                                    sub: `${Object.keys(stats.problemsByCategory || {}).length} categories`,
                                },
                                {
                                    icon: '✅',
                                    value: stats.totalSolutions || 0,
                                    label: 'Solutions Submitted',
                                    sub: `${stats.avgConfidence || 0}/5 avg confidence`,
                                },
                                {
                                    icon: '🧠',
                                    value: stats.totalQuizzes || 0,
                                    label: 'Quizzes Completed',
                                    sub: 'AI-generated on any subject',
                                },
                                {
                                    icon: '🤖',
                                    value: (stats.aiReviewCount || 0) + (stats.totalQuizzes || 0) + (stats.totalSims || 0),
                                    label: 'AI Interactions',
                                    sub: 'Reviews + quizzes + interviews',
                                },
                            ].map((s, i) => (
                                <motion.div
                                    key={s.label}
                                    initial={{ opacity: 0, y: 10 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.08 }}
                                    className="text-center"
                                >
                                    <span className="text-2xl">{s.icon}</span>
                                    <div className="text-2xl font-extrabold font-mono text-text-primary mt-1">
                                        <AnimatedNumber value={s.value} />
                                    </div>
                                    <div className="text-[10px] text-text-disabled uppercase tracking-wider mt-0.5">
                                        {s.label}
                                    </div>
                                    <div className="text-[9px] text-text-tertiary mt-0.5">{s.sub}</div>
                                </motion.div>
                            ))}
                        </div>

                        {/* Difficulty split */}
                        {stats.problemsByDifficulty && (
                            <div className="mt-5 pt-4 border-t border-border-default">
                                <div className="flex items-center justify-center gap-6">
                                    {[
                                        { label: 'Easy', count: stats.problemsByDifficulty.EASY || 0, color: 'text-success' },
                                        { label: 'Medium', count: stats.problemsByDifficulty.MEDIUM || 0, color: 'text-warning' },
                                        { label: 'Hard', count: stats.problemsByDifficulty.HARD || 0, color: 'text-danger' },
                                    ].map(d => (
                                        <div key={d.label} className="text-center">
                                            <span className={cn('text-xl font-extrabold font-mono', d.color)}>
                                                {d.count}
                                            </span>
                                            <p className="text-[9px] text-text-disabled uppercase tracking-wider">{d.label}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </div>
        </Section>
    )
}