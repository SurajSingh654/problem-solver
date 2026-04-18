import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@components/ui/Button'
import { Badge } from '@components/ui/Badge'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import { PROBLEM_CATEGORIES } from '@utils/constants'
import api from '@services/api'

// ── Animated counter ───────────────────────────────────
function AnimatedNumber({ value, duration = 1500 }) {
    const [display, setDisplay] = useState(0)

    useEffect(() => {
        if (!value) return
        let start = 0
        const increment = value / (duration / 16)
        const timer = setInterval(() => {
            start += increment
            if (start >= value) {
                setDisplay(value)
                clearInterval(timer)
            } else {
                setDisplay(Math.round(start))
            }
        }, 16)
        return () => clearInterval(timer)
    }, [value, duration])

    return <span>{display.toLocaleString()}</span>
}

// ── Section wrapper ────────────────────────────────────
function Section({ id, children, className }) {
    return (
        <section id={id} className={cn('scroll-mt-20', className)}>
            {children}
        </section>
    )
}

// ── Stat card for hero ─────────────────────────────────
function HeroStat({ value, label, icon, delay = 0 }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.5 }}
            className="flex flex-col items-center gap-1 px-6 py-4
                 bg-white/5 border border-white/10 rounded-2xl
                 backdrop-blur-sm"
        >
            <span className="text-2xl">{icon}</span>
            <span className="text-3xl font-extrabold font-mono text-white">
                <AnimatedNumber value={value} />
            </span>
            <span className="text-xs text-white/50 uppercase tracking-wider">
                {label}
            </span>
        </motion.div>
    )
}

// ── Feature card ───────────────────────────────────────
function FeatureCard({ icon, title, desc, tag, color, delay = 0, onClick }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay, duration: 0.4 }}
            onClick={onClick}
            className={cn(
                'group relative bg-surface-1 border border-border-default rounded-2xl p-6',
                'transition-all duration-300',
                'hover:-translate-y-1 hover:shadow-lg hover:border-brand-400/30',
                onClick && 'cursor-pointer'
            )}
        >
            <div className="flex items-start gap-4">
                <div className={cn(
                    'w-12 h-12 rounded-xl flex items-center justify-center text-2xl',
                    'flex-shrink-0 border transition-colors',
                    color || 'bg-brand-400/10 border-brand-400/25'
                )}>
                    {icon}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                        <h3 className="text-sm font-bold text-text-primary">
                            {title}
                        </h3>
                        {tag && (
                            <span className="text-[9px] font-bold px-1.5 py-px rounded-full
                               bg-brand-400/15 text-brand-300 border border-brand-400/25">
                                {tag}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-text-tertiary leading-relaxed">
                        {desc}
                    </p>
                </div>
                {onClick && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round"
                        className="text-text-disabled group-hover:text-brand-300
                          transition-colors flex-shrink-0 mt-1">
                        <polyline points="9 18 15 12 9 6" />
                    </svg>
                )}
            </div>
        </motion.div>
    )
}

// ── Pain point card ────────────────────────────────────
function PainPoint({ icon, title, desc, delay = 0 }) {
    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay, duration: 0.4 }}
            className="flex items-start gap-4 p-4 rounded-xl
                 bg-danger/5 border border-danger/15"
        >
            <span className="text-xl flex-shrink-0 mt-0.5">{icon}</span>
            <div>
                <h4 className="text-sm font-bold text-text-primary mb-0.5">{title}</h4>
                <p className="text-xs text-text-tertiary leading-relaxed">{desc}</p>
            </div>
        </motion.div>
    )
}

// ── Category pill ──────────────────────────────────────
function CategoryPill({ cat, count, delay = 0 }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay, duration: 0.3 }}
            className={cn(
                'flex items-center gap-2.5 px-4 py-3 rounded-xl border',
                cat.bg
            )}
        >
            <span className="text-xl">{cat.icon}</span>
            <div>
                <span className={cn('text-xs font-bold block', cat.color)}>{cat.label}</span>
                <span className="text-[10px] text-text-disabled">
                    {count > 0 ? `${count} problems` : 'Ready'}
                </span>
            </div>
        </motion.div>
    )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function ShowcasePage() {
    const navigate = useNavigate()
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function fetchStats() {
            try {
                const res = await api.get('/stats/showcase')
                setStats(res.data.data)
            } catch (err) {
                console.error('Failed to load showcase stats:', err)
            } finally {
                setLoading(false)
            }
        }
        fetchStats()
    }, [])

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <Spinner size="lg" />
                    <p className="text-xs text-text-tertiary">Loading showcase...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen">

            {/* ═══════════════════════════════════════════════
          SECTION 1 — THE PROBLEM
          ═══════════════════════════════════════════════ */}
            <Section id="problem">
                <div className="relative overflow-hidden"
                    style={{
                        background: 'linear-gradient(160deg, #0e0a1e 0%, #111118 40%, #16162a 100%)',
                    }}>
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

                        {/* Pain points */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-12">
                            <PainPoint
                                icon="🔄"
                                title="Solving without understanding"
                                desc="100 LeetCode problems solved, but can't recognize the pattern in a new one. Memorization ≠ understanding."
                                delay={0.3}
                            />
                            <PainPoint
                                icon="🏝️"
                                title="Practicing in isolation"
                                desc="No idea how teammates approach the same problem. No peer feedback. No accountability."
                                delay={0.35}
                            />
                            <PainPoint
                                icon="🎯"
                                title="Ignoring the full interview loop"
                                desc="80% of prep time on coding, 0% on system design, behavioral, and HR — where 60% of rejections happen."
                                delay={0.4}
                            />
                            <PainPoint
                                icon="📉"
                                title="No way to measure readiness"
                                desc="'Am I ready for my Google interview next week?' Nobody can answer this with data."
                                delay={0.45}
                            />
                        </div>

                        {/* Stats bar */}
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 }}
                            className="flex flex-wrap gap-6 text-center"
                        >
                            {[
                                { stat: '67%', label: 'fail behavioral rounds', color: 'text-danger' },
                                { stat: '73%', label: 'can\'t design systems under pressure', color: 'text-warning' },
                                { stat: '89%', label: 'forget solutions within 2 weeks', color: 'text-danger' },
                            ].map((s, i) => (
                                <div key={i}>
                                    <span className={cn('text-2xl font-extrabold font-mono', s.color)}>
                                        {s.stat}
                                    </span>
                                    <p className="text-xs text-white/40 mt-0.5">{s.label}</p>
                                </div>
                            ))}
                        </motion.div>
                    </div>
                </div>
            </Section>

            {/* ═══════════════════════════════════════════════
          SECTION 2 — THE VISION
          ═══════════════════════════════════════════════ */}
            <Section id="vision" className="py-20 px-8">
                <div className="max-w-[1000px] mx-auto">
                    {/* Eyebrow */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        className="inline-flex items-center gap-2 bg-brand-400/10 border border-brand-400/25
                       rounded-full px-4 py-1.5 mb-6"
                    >
                        <span className="text-xs font-semibold text-brand-300">Our Vision</span>
                    </motion.div>

                    <motion.h2
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-3xl sm:text-4xl font-extrabold text-text-primary
                       tracking-tight mb-4"
                    >
                        The complete interview<br />
                        <span className="bg-gradient-to-r from-brand-300 to-blue-400
                             bg-clip-text text-transparent">
                            operating system for teams.
                        </span>
                    </motion.h2>

                    <motion.p
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-base text-text-secondary max-w-2xl mb-10 leading-relaxed"
                    >
                        ProbSolver isn't another LeetCode clone. It's a full learning intelligence
                        platform that covers every interview round — from coding to system design
                        to behavioral to HR — with AI-powered coaching, team collaboration,
                        and data-driven readiness tracking.
                    </motion.p>

                    {/* Categories */}
                    <motion.h3
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2"
                    >
                        <span>📋</span> Covers the full interview loop
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

                    {/* Platform live stats */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-6"
                    >
                        <h3 className="text-xs font-bold text-text-disabled uppercase
                           tracking-widest mb-5">
                            Platform Stats — Live
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {[
                                { icon: '👥', value: stats?.totalUsers || 0, label: 'Team Members' },
                                { icon: '📋', value: stats?.totalProblems || 0, label: 'Problems' },
                                { icon: '✅', value: stats?.totalSolutions || 0, label: 'Solutions' },
                                { icon: '🧠', value: stats?.totalQuizzes || 0, label: 'Quizzes Taken' },
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
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </Section>

            {/* ═══════════════════════════════════════════════
          SECTION 3 — WHAT WE BUILT
          ═══════════════════════════════════════════════ */}
            <Section id="features" className="py-20 px-8 bg-surface-0">
                <div className="max-w-[1000px] mx-auto">
                    <motion.div
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        className="inline-flex items-center gap-2 bg-success/10 border border-success/25
                       rounded-full px-4 py-1.5 mb-6"
                    >
                        <span className="text-xs font-semibold text-success">What We Built</span>
                    </motion.div>

                    <motion.h2
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-3xl sm:text-4xl font-extrabold text-text-primary
                       tracking-tight mb-4"
                    >
                        Every feature designed to<br />
                        <span className="bg-gradient-to-r from-success to-blue-400
                             bg-clip-text text-transparent">
                            maximize interview readiness.
                        </span>
                    </motion.h2>

                    <motion.p
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-base text-text-secondary max-w-2xl mb-10 leading-relaxed"
                    >
                        Click any feature to try it live in the app.
                    </motion.p>

                    {/* Core features */}
                    <h3 className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-4">
                        Core Platform
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                        <FeatureCard
                            icon="📋" title="Multi-Category Problems"
                            desc="Coding, System Design, Behavioral, CS Fundamentals, HR, SQL — each with tailored submission forms."
                            tag="6 Categories"
                            color="bg-brand-400/10 border-brand-400/25"
                            delay={0}
                            onClick={() => navigate('/problems')}
                        />
                        <FeatureCard
                            icon="💻" title="Rich Solution Submission"
                            desc="Monaco code editor, Tiptap rich text, multiple solution tabs, complexity analysis, and confidence tracking."
                            tag="Monaco + Tiptap"
                            color="bg-info/10 border-info/25"
                            delay={0.05}
                        />
                        <FeatureCard
                            icon="⏱" title="Interview Simulation"
                            desc="Timed mock interviews with AI progressive hints, post-sim debrief, and performance tracking."
                            color="bg-warning/10 border-warning/25"
                            delay={0.1}
                            onClick={() => navigate('/interview')}
                        />
                        <FeatureCard
                            icon="🧠" title="Spaced Repetition Reviews"
                            desc="Scientifically-timed review queue. Rate confidence → adaptive scheduling. Never forget a solution."
                            color="bg-success/10 border-success/25"
                            delay={0.15}
                            onClick={() => navigate('/review')}
                        />
                    </div>

                    {/* AI features */}
                    <h3 className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-4">
                        AI-Powered Intelligence
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                        <FeatureCard
                            icon="🤖" title="AI Solution Review"
                            desc="GPT-4o reviews your solution with RAG context — compares with teammate approaches, checks against admin notes."
                            tag="RAG Enhanced"
                            color="bg-brand-400/10 border-brand-400/25"
                            delay={0}
                        />
                        <FeatureCard
                            icon="🧩" title="AI Quiz Generation"
                            desc="Type any subject → AI generates MCQ questions instantly. With timer, scratchpad, and post-quiz analysis."
                            tag="Any Subject"
                            color="bg-brand-400/10 border-brand-400/25"
                            delay={0.05}
                            onClick={() => navigate('/quizzes')}
                        />
                        <FeatureCard
                            icon="🎯" title="Smart Recommendations"
                            desc="Vector embeddings find semantically similar problems. Gap analysis targets your weak patterns and categories."
                            tag="pgvector"
                            color="bg-brand-400/10 border-brand-400/25"
                            delay={0.1}
                        />
                        <FeatureCard
                            icon="📅" title="AI Weekly Coach"
                            desc="Personalized 7-day study plan generated from your 6D scores, quiz history, and target company."
                            color="bg-brand-400/10 border-brand-400/25"
                            delay={0.15}
                            onClick={() => navigate('/report')}
                        />
                    </div>

                    {/* Team & Analytics */}
                    <h3 className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-4">
                        Team & Analytics
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                        <FeatureCard
                            icon="📊" title="6D Intelligence Report"
                            desc="Radar chart across 6 dimensions — Pattern Recognition, Solution Depth, Communication, Optimization, Pressure, Retention."
                            color="bg-info/10 border-info/25"
                            delay={0}
                            onClick={() => navigate('/report')}
                        />
                        <FeatureCard
                            icon="🏆" title="Leaderboard & Profiles"
                            desc="Ranked by readiness score with podium. Member profiles show solving history, difficulty breakdown, and streaks."
                            color="bg-warning/10 border-warning/25"
                            delay={0.05}
                            onClick={() => navigate('/leaderboard')}
                        />
                        <FeatureCard
                            icon="👑" title="Admin Panel"
                            desc="Full problem CRUD with AI content generation. Member management with role changes and password resets."
                            color="bg-danger/10 border-danger/25"
                            delay={0.1}
                            onClick={() => navigate('/admin')}
                        />
                        <FeatureCard
                            icon="🔍" title="Command Palette"
                            desc="⌘K to instantly search problems, navigate pages, and find anything in the platform."
                            color="bg-success/10 border-success/25"
                            delay={0.15}
                        />
                    </div>

                    {/* AI Stats */}
                    {stats?.aiEnabled && (
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="bg-brand-400/5 border border-brand-400/20 rounded-2xl p-6 mt-8"
                        >
                            <h3 className="text-xs font-bold text-brand-300 uppercase tracking-widest mb-4">
                                AI Intelligence — Live Metrics
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                {[
                                    { icon: '🤖', value: stats.aiReviewCount, label: 'AI Reviews' },
                                    { icon: '📐', value: stats.embeddingCount, label: 'Solution Embeddings' },
                                    { icon: '📋', value: stats.problemEmbeddings, label: 'Problem Embeddings' },
                                    { icon: '🧠', value: stats.totalQuizzes, label: 'AI Quizzes' },
                                ].map((s, i) => (
                                    <div key={s.label} className="text-center">
                                        <span className="text-xl">{s.icon}</span>
                                        <div className="text-xl font-extrabold font-mono text-brand-300 mt-1">
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
                </div>
            </Section>

            {/* Navigation hint */}
            <div className="text-center py-8">
                <p className="text-xs text-text-disabled">
                    Sections 4-10 coming soon — Technical Architecture, AI Pipeline,
                    Metrics, Roadmap, Competitive Analysis, Specs, CTA
                </p>
            </div>
        </div>
    )
}