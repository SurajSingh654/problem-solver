import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { cn } from '@utils/cn'
import { Section, SectionBadge, SectionTitle, SectionDesc } from './components'

export default function Section5Teams() {
    const navigate = useNavigate()

    return (
        <Section id="teams" className="py-20 px-8 bg-surface-0">
            <div className="max-w-[1000px] mx-auto">
                <SectionBadge label="Better Together" color="success" />
                <SectionTitle
                    line1="Stop practicing alone."
                    line2="Your team learns faster together."
                    gradient="from-success to-blue-400"
                />
                <SectionDesc>
                    Interview preparation is more effective when you learn with others. ProbSolver
                    is built for study groups, college cohorts, and company interview squads.
                    See different perspectives, learn from each other, build communication skills,
                    and hold each other accountable.
                </SectionDesc>

                {/* Two modes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
                    <motion.div
                        initial={{ opacity: 0, x: -12 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-6"
                    >
                        <span className="text-3xl">👥</span>
                        <h3 className="text-base font-extrabold text-text-primary mt-3 mb-2">
                            Team Mode
                        </h3>
                        <p className="text-sm text-text-tertiary leading-relaxed mb-4">
                            Create a team, invite members via join code, and practice together.
                            Team Admin manages problems and members. Everyone sees each other's
                            solutions, competes on the leaderboard, and rates each other's explanations.
                        </p>
                        <div className="space-y-2">
                            {[
                                'Share problems across the team',
                                'See how teammates solve the same problem',
                                'Peer clarity ratings (1-5 stars)',
                                'Team leaderboard with podium',
                                'Admin dashboard with member analytics',
                            ].map((item, i) => (
                                <div key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                                    <span className="text-success flex-shrink-0 mt-0.5">✓</span>
                                    <span>{item}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 12 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-6"
                    >
                        <span className="text-3xl">🧠</span>
                        <h3 className="text-base font-extrabold text-text-primary mt-3 mb-2">
                            Individual Mode
                        </h3>
                        <p className="text-sm text-text-tertiary leading-relaxed mb-4">
                            Prefer to practice solo? Individual mode gives you a personal space
                            with all the same features — AI quizzes, mock interviews, spaced
                            repetition, intelligence report. Join a team later when you're ready.
                        </p>
                        <div className="space-y-2">
                            {[
                                'Personal practice space',
                                'All AI features available',
                                'AI-generated problems on demand',
                                'Full 6D intelligence report',
                                'Switch to team mode anytime',
                            ].map((item, i) => (
                                <div key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                                    <span className="text-brand-300 flex-shrink-0 mt-0.5">✓</span>
                                    <span>{item}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>

                {/* How teams work — flow */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-6 mb-10"
                >
                    <h3 className="text-sm font-bold text-text-primary mb-5 flex items-center gap-2">
                        <span>🚀</span> Get Your Team Started in 60 Seconds
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        {[
                            {
                                step: '01',
                                title: 'Create Team',
                                desc: 'Sign up, name your team, and get a unique join code.',
                                icon: '🏢',
                            },
                            {
                                step: '02',
                                title: 'Share Code',
                                desc: 'Send the join code to your team — they sign up and join instantly.',
                                icon: '🔗',
                            },
                            {
                                step: '03',
                                title: 'Add Problems',
                                desc: 'Team Admin adds problems manually or uses AI to generate complete sets.',
                                icon: '📋',
                            },
                            {
                                step: '04',
                                title: 'Practice Together',
                                desc: 'Solve, review, quiz, compete. AI compares your work with teammates.',
                                icon: '⚡',
                            },
                        ].map((item, i) => (
                            <motion.div
                                key={item.step}
                                initial={{ opacity: 0, y: 8 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.08 }}
                                className="text-center"
                            >
                                <div className="w-12 h-12 rounded-2xl bg-brand-400/10 border border-brand-400/20
                              flex items-center justify-center text-xl mx-auto mb-3">
                                    {item.icon}
                                </div>
                                <span className="text-[10px] font-extrabold font-mono text-text-disabled">
                                    {item.step}
                                </span>
                                <h4 className="text-xs font-bold text-text-primary mt-1 mb-1">
                                    {item.title}
                                </h4>
                                <p className="text-[11px] text-text-tertiary leading-relaxed">
                                    {item.desc}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>

                {/* Role-based access */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-6"
                >
                    <h3 className="text-sm font-bold text-text-primary mb-5 flex items-center gap-2">
                        <span>🛡️</span> Three Roles, Clear Boundaries
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[
                            {
                                role: 'Platform Admin',
                                badge: '🛡️ Super Admin',
                                badgeColor: 'bg-danger/10 text-danger border-danger/20',
                                items: [
                                    'Approve / reject team creation',
                                    'Monitor all teams and users',
                                    'Platform-wide AI analytics',
                                    'Manage platform health',
                                ],
                            },
                            {
                                role: 'Team Admin',
                                badge: '👑 Team Admin',
                                badgeColor: 'bg-warning/10 text-warning border-warning/20',
                                items: [
                                    'Create and manage problems',
                                    'AI content generation',
                                    'Member management (invite, roles)',
                                    'Team analytics and health',
                                ],
                            },
                            // In the roles array, update the Member items array:
                            {
                                role: 'Member',
                                badge: '👤 Member',
                                badgeColor: 'bg-brand-400/10 text-brand-300 border-brand-400/20',
                                items: [
                                    // UPDATED: 6 → 7
                                    'Solve problems across 7 categories',
                                    'AI mock interviews and quizzes',
                                    'Spaced repetition reviews',
                                    '6D report + recommendations',
                                ],
                            },
                        ].map((r, i) => (
                            <motion.div
                                key={r.role}
                                initial={{ opacity: 0, y: 8 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.08 }}
                                className="bg-surface-2 border border-border-subtle rounded-xl p-4"
                            >
                                <span className={cn(
                                    'text-[10px] font-bold px-2 py-0.5 rounded-full border inline-block mb-3',
                                    r.badgeColor
                                )}>
                                    {r.badge}
                                </span>
                                <h4 className="text-sm font-bold text-text-primary mb-3">{r.role}</h4>
                                <div className="space-y-1.5">
                                    {r.items.map((item, j) => (
                                        <div key={j} className="flex items-start gap-2 text-xs text-text-tertiary">
                                            <span className="text-text-disabled flex-shrink-0 mt-0.5">→</span>
                                            <span>{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </Section>
    )
}