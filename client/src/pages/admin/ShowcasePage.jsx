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

            {/* ═══════════════════════════════════════════════
          SECTION 4 — TECHNICAL ARCHITECTURE
          ═══════════════════════════════════════════════ */}
            <Section id="architecture" className="py-20 px-8">
                <div className="max-w-[1000px] mx-auto">
                    <motion.div
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        className="inline-flex items-center gap-2 bg-info/10 border border-info/25
                       rounded-full px-4 py-1.5 mb-6"
                    >
                        <span className="text-xs font-semibold text-info">Technical Architecture</span>
                    </motion.div>

                    <motion.h2
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-3xl sm:text-4xl font-extrabold text-text-primary
                       tracking-tight mb-4"
                    >
                        Built for scale,<br />
                        <span className="bg-gradient-to-r from-info to-brand-300
                             bg-clip-text text-transparent">
                            designed for extensibility.
                        </span>
                    </motion.h2>

                    <motion.p
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-base text-text-secondary max-w-2xl mb-10 leading-relaxed"
                    >
                        Modern full-stack architecture with clear separation of concerns.
                        Every layer is independently scalable and replaceable.
                    </motion.p>

                    {/* Architecture diagram */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="bg-surface-0 border border-border-default rounded-2xl
                       p-6 mb-8 font-mono text-xs leading-7 text-text-tertiary
                       overflow-x-auto whitespace-pre"
                    >
                        {`┌─────────────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│     FRONTEND            │     │      BACKEND         │     │    DATABASE      │
│                         │REST │                      │     │                 │
│  React 18 + Vite        │────►│  Express + Prisma    │────►│  PostgreSQL     │
│  TanStack Query         │◄────│  JWT Authentication  │     │  + pgvector     │
│  Zustand (UI state)     │JSON │  Zod Validation      │     │                 │
│  Framer Motion          │     │  AI Service Layer    │     │  Vector Search  │
│  Monaco Editor          │     │                      │     │  Embeddings     │
│  Tiptap Rich Text       │     │  OpenAI GPT-4o-mini  │     │                 │
│                         │     │  RAG Pipeline        │     │                 │
│  :3000 (serve)          │     │  :8080 (Express)     │     │  :5432          │
└─────────────────────────┘     └──────────────────────┘     └─────────────────┘
         │                              │                            │
         │  Vite build → static         │  Prisma ORM               │  pgvector
         │  Docker (serve)              │  Docker (node:20-slim)     │  Railway Plugin
         │                              │                            │
         └──────────────── Railway.app ─┴────────────────────────────┘`}
                    </motion.div>

                    {/* Tech stack grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
                        {/* Frontend */}
                        <motion.div
                            initial={{ opacity: 0, x: -12 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="bg-surface-1 border border-border-default rounded-2xl p-5"
                        >
                            <h3 className="text-sm font-bold text-text-primary mb-4
                             flex items-center gap-2">
                                <span className="text-lg">⚛️</span> Frontend Stack
                            </h3>
                            <div className="space-y-2.5">
                                {[
                                    { name: 'React 18', desc: 'Component UI with hooks', badge: 'Core' },
                                    { name: 'Vite 5', desc: 'Instant HMR, optimized builds', badge: 'Build' },
                                    { name: 'TailwindCSS v3', desc: 'Utility-first with CSS variables', badge: 'Style' },
                                    { name: 'TanStack Query v5', desc: 'Server state + caching', badge: 'Data' },
                                    { name: 'Zustand', desc: 'Lightweight UI state', badge: 'State' },
                                    { name: 'Framer Motion', desc: 'Spring physics animations', badge: 'Animation' },
                                    { name: 'Monaco Editor', desc: 'VS Code editor for code input', badge: 'Editor' },
                                    { name: 'Tiptap', desc: 'Rich text with toolbar', badge: 'Editor' },
                                    { name: 'React Hook Form', desc: 'Forms + Zod validation', badge: 'Forms' },
                                ].map((tech, i) => (
                                    <motion.div
                                        key={tech.name}
                                        initial={{ opacity: 0, x: -8 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: i * 0.04 }}
                                        className="flex items-center gap-3 px-3 py-2 rounded-xl
                               bg-surface-2 border border-border-subtle"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <span className="text-xs font-bold text-text-primary">
                                                {tech.name}
                                            </span>
                                            <span className="text-[10px] text-text-disabled ml-2">
                                                {tech.desc}
                                            </span>
                                        </div>
                                        <span className="text-[9px] font-bold px-1.5 py-px rounded-full
                                     bg-brand-400/10 text-brand-300 border border-brand-400/20
                                     flex-shrink-0">
                                            {tech.badge}
                                        </span>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>

                        {/* Backend */}
                        <motion.div
                            initial={{ opacity: 0, x: 12 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="bg-surface-1 border border-border-default rounded-2xl p-5"
                        >
                            <h3 className="text-sm font-bold text-text-primary mb-4
                             flex items-center gap-2">
                                <span className="text-lg">🟢</span> Backend Stack
                            </h3>
                            <div className="space-y-2.5">
                                {[
                                    { name: 'Node.js 20', desc: 'ES modules, async/await', badge: 'Runtime' },
                                    { name: 'Express', desc: 'REST API with middleware chain', badge: 'Core' },
                                    { name: 'Prisma 5', desc: 'Type-safe ORM', badge: 'ORM' },
                                    { name: 'PostgreSQL', desc: 'Production database on Railway', badge: 'Database' },
                                    { name: 'pgvector', desc: 'Vector embeddings + similarity', badge: 'AI' },
                                    { name: 'JWT + bcrypt', desc: 'Auth + password hashing', badge: 'Security' },
                                    { name: 'Zod', desc: 'Schema validation (shared)', badge: 'Validation' },
                                    { name: 'OpenAI GPT-4o-mini', desc: 'AI reviews, quizzes, coaching', badge: 'AI' },
                                    { name: 'Railway', desc: 'Deployment + PostgreSQL', badge: 'Infra' },
                                ].map((tech, i) => (
                                    <motion.div
                                        key={tech.name}
                                        initial={{ opacity: 0, x: 8 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: i * 0.04 }}
                                        className="flex items-center gap-3 px-3 py-2 rounded-xl
                               bg-surface-2 border border-border-subtle"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <span className="text-xs font-bold text-text-primary">
                                                {tech.name}
                                            </span>
                                            <span className="text-[10px] text-text-disabled ml-2">
                                                {tech.desc}
                                            </span>
                                        </div>
                                        <span className="text-[9px] font-bold px-1.5 py-px rounded-full
                                     bg-success/10 text-success border border-success/20
                                     flex-shrink-0">
                                            {tech.badge}
                                        </span>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    </div>

                    {/* Data flow */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-5"
                    >
                        <h3 className="text-sm font-bold text-text-primary mb-4
                           flex items-center gap-2">
                            <span>🔄</span> Data Flow — Submit a Solution
                        </h3>
                        <div className="space-y-3">
                            {[
                                { step: '1', label: 'User fills form', desc: 'React Hook Form validates with Zod schema. Monaco captures code, Tiptap captures rich text.', color: 'bg-brand-400' },
                                { step: '2', label: 'API request', desc: 'Axios POST /api/solutions with JWT auto-attached by interceptor.', color: 'bg-info' },
                                { step: '3', label: 'Server validation', desc: 'Express middleware chain: auth → Zod validate → controller.', color: 'bg-success' },
                                { step: '4', label: 'Database write', desc: 'Prisma creates solution record. Spaced repetition dates auto-calculated.', color: 'bg-warning' },
                                { step: '5', label: 'Embedding generated', desc: 'OpenAI creates vector embedding in background. Stored in pgvector column.', color: 'bg-brand-400' },
                                { step: '6', label: 'Cache invalidated', desc: 'TanStack Query invalidates solution queries. Components re-render with new data.', color: 'bg-danger' },
                                { step: '7', label: 'AI review available', desc: 'User clicks "Get AI Review" → RAG fetches teammate solutions → GPT gives comparative feedback.', color: 'bg-brand-400' },
                            ].map((s, i) => (
                                <motion.div
                                    key={s.step}
                                    initial={{ opacity: 0, x: -12 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.06 }}
                                    className="flex items-start gap-4"
                                >
                                    <div className={cn(
                                        'w-7 h-7 rounded-full flex items-center justify-center',
                                        'text-[11px] font-extrabold text-white flex-shrink-0 mt-0.5',
                                        s.color
                                    )}>
                                        {s.step}
                                    </div>
                                    <div>
                                        <span className="text-xs font-bold text-text-primary">
                                            {s.label}
                                        </span>
                                        <p className="text-xs text-text-tertiary leading-relaxed mt-0.5">
                                            {s.desc}
                                        </p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </Section>

            {/* ═══════════════════════════════════════════════
          SECTION 5 — AI PIPELINE
          ═══════════════════════════════════════════════ */}
            <Section id="ai-pipeline" className="py-20 px-8 bg-surface-0">
                <div className="max-w-[1000px] mx-auto">
                    <motion.div
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        className="inline-flex items-center gap-2 bg-brand-400/10 border border-brand-400/25
                       rounded-full px-4 py-1.5 mb-6"
                    >
                        <span className="text-xs font-semibold text-brand-300">AI Intelligence Pipeline</span>
                    </motion.div>

                    <motion.h2
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-3xl sm:text-4xl font-extrabold text-text-primary
                       tracking-tight mb-4"
                    >
                        AI that gets smarter<br />
                        <span className="bg-gradient-to-r from-brand-300 to-warning
                             bg-clip-text text-transparent">
                            as your team grows.
                        </span>
                    </motion.h2>

                    <motion.p
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-base text-text-secondary max-w-2xl mb-10 leading-relaxed"
                    >
                        Not just GPT wrapper calls. A full RAG pipeline with vector embeddings,
                        semantic search, and context-aware prompts that leverage your team's
                        collective knowledge.
                    </motion.p>

                    {/* AI Architecture */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="bg-surface-1 border border-brand-400/20 rounded-2xl
                       p-6 mb-8 font-mono text-xs leading-7 text-text-tertiary
                       overflow-x-auto whitespace-pre"
                    >
                        {`User Action                   AI Pipeline                        Output
──────────────────────────────────────────────────────────────────────────────

Submit Solution ──────────►   1. Generate embedding (OpenAI)      → Stored in pgvector
                              2. Store solution in PostgreSQL      → Available for RAG

Click "AI Review" ────────►   1. Vector search: find similar       → Teammate solutions
                                 solutions from teammates           retrieved by cosine
                              2. Fetch admin notes + context        similarity
                              3. Build RAG-enhanced prompt          
                              4. Call GPT-4o-mini with context     → Comparative feedback
                              5. Validate response with Zod        → Structured JSON
                              6. Store feedback on solution        → Cached for re-view

Generate Quiz ────────────►   1. User types any subject            
                              2. Build prompt with difficulty       → Formatted questions
                              3. Call GPT-4o-mini (JSON mode)      with explanations
                              4. Validate with Zod schema          → 4 options each
                              5. User takes quiz                   
                              6. Submit answers → score            → AI analysis of
                              7. AI analyzes wrong answers          weak areas

Weekly Plan ──────────────►   1. Fetch user's 6D scores            
                              2. Fetch quiz history                → Personalized 7-day
                              3. Fetch unsolved problems            plan with specific
                              4. Build context-rich prompt          daily tasks
                              5. GPT generates daily plan          → Actionable advice`}
                    </motion.div>

                    {/* RAG explanation */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
                        <motion.div
                            initial={{ opacity: 0, x: -12 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="bg-surface-1 border border-border-default rounded-2xl p-5"
                        >
                            <h3 className="text-sm font-bold text-text-primary mb-3
                             flex items-center gap-2">
                                <span>🔍</span> What is RAG?
                            </h3>
                            <p className="text-xs text-text-tertiary leading-relaxed mb-4">
                                <strong className="text-text-secondary">Retrieval Augmented Generation</strong> —
                                before asking the AI a question, we search our database for relevant
                                context and include it in the prompt. This makes AI responses
                                dramatically more specific and personalized.
                            </p>
                            <div className="space-y-2">
                                {[
                                    'Without RAG: "Consider optimizing your approach"',
                                    'With RAG: "Your teammate Alex used a HashMap for O(n) — compare with your O(n²) nested loop"',
                                ].map((text, i) => (
                                    <div key={i} className={cn(
                                        'text-xs p-3 rounded-xl border',
                                        i === 0
                                            ? 'bg-danger/5 border-danger/15 text-danger'
                                            : 'bg-success/5 border-success/15 text-success'
                                    )}>
                                        {i === 0 ? '❌ ' : '✅ '}{text}
                                    </div>
                                ))}
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, x: 12 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="bg-surface-1 border border-border-default rounded-2xl p-5"
                        >
                            <h3 className="text-sm font-bold text-text-primary mb-3
                             flex items-center gap-2">
                                <span>📐</span> Vector Embeddings
                            </h3>
                            <p className="text-xs text-text-tertiary leading-relaxed mb-4">
                                Every solution and problem is converted into a 1536-dimension
                                vector that captures its <strong className="text-text-secondary">meaning</strong>.
                                Similar concepts have similar vectors — enabling semantic search
                                across the entire platform.
                            </p>
                            <div className="space-y-2">
                                {[
                                    { text: '"Two Sum using hash map"', vector: '[0.23, -0.45, 0.78, ...]' },
                                    { text: '"Find pair with target sum"', vector: '[0.21, -0.43, 0.76, ...]' },
                                    { text: '"Design Twitter architecture"', vector: '[-0.56, 0.34, -0.12, ...]' },
                                ].map((item, i) => (
                                    <div key={i} className="flex items-center gap-3 text-xs">
                                        <span className="text-text-secondary flex-1 truncate">{item.text}</span>
                                        <code className="text-[10px] font-mono text-brand-300 bg-brand-400/10
                                     px-2 py-0.5 rounded flex-shrink-0">
                                            {item.vector}
                                        </code>
                                    </div>
                                ))}
                                <p className="text-[10px] text-text-disabled mt-2">
                                    First two are semantically similar (same concept). Third is different.
                                </p>
                            </div>
                        </motion.div>
                    </div>

                    {/* Prompt engineering */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-8"
                    >
                        <h3 className="text-sm font-bold text-text-primary mb-4
                           flex items-center gap-2">
                            <span>🧪</span> How Prompts Are Engineered
                        </h3>
                        <p className="text-xs text-text-tertiary leading-relaxed mb-4">
                            Every AI call uses a structured prompt with three layers:
                            system instructions, user context, and RAG-retrieved data.
                            All responses are validated against Zod schemas to ensure
                            consistent JSON structure.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {[
                                {
                                    layer: 'System Prompt',
                                    desc: 'Defines the AI\'s role, response format, and rules. Category-aware — different instructions for coding vs system design vs behavioral.',
                                    color: 'border-brand-400/25 bg-brand-400/5',
                                    icon: '🤖',
                                },
                                {
                                    layer: 'User Context',
                                    desc: 'The actual solution/question being reviewed. Includes approach, code, complexity, key insight, and the user\'s skill level.',
                                    color: 'border-info/25 bg-info/5',
                                    icon: '👤',
                                },
                                {
                                    layer: 'RAG Context',
                                    desc: 'Retrieved teammate solutions, admin teaching notes, and problem metadata. Injected via vector similarity search from pgvector.',
                                    color: 'border-success/25 bg-success/5',
                                    icon: '🔍',
                                },
                            ].map((layer, i) => (
                                <motion.div
                                    key={layer.layer}
                                    initial={{ opacity: 0, y: 8 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.08 }}
                                    className={cn(
                                        'rounded-xl border p-4',
                                        layer.color
                                    )}
                                >
                                    <div className="text-lg mb-2">{layer.icon}</div>
                                    <h4 className="text-xs font-bold text-text-primary mb-1">
                                        {layer.layer}
                                    </h4>
                                    <p className="text-[11px] text-text-tertiary leading-relaxed">
                                        {layer.desc}
                                    </p>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>

                    {/* AI features list */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                            { icon: '🤖', name: 'Solution Review', desc: 'RAG-enhanced feedback comparing with teammate approaches', status: 'Live' },
                            { icon: '🧩', name: 'Quiz Generation', desc: 'Any subject, any difficulty — AI generates MCQs instantly', status: 'Live' },
                            { icon: '💡', name: 'Progressive Hints', desc: '3-level hints during interview sim — nudge → approach → direct', status: 'Live' },
                            { icon: '📅', name: 'Weekly Coach', desc: 'Personalized 7-day study plan from 6D scores', status: 'Live' },
                            { icon: '📋', name: 'Content Generator', desc: 'Admin enters title → AI fills context, notes, follow-ups', status: 'Live' },
                            { icon: '🎯', name: 'Recommendations', desc: 'Vector similarity + gap analysis for smart suggestions', status: 'Live' },
                        ].map((feature, i) => (
                            <motion.div
                                key={feature.name}
                                initial={{ opacity: 0, y: 8 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.05 }}
                                className="flex items-center gap-3 p-3.5 rounded-xl border
                           bg-surface-1 border-border-default"
                            >
                                <span className="text-xl flex-shrink-0">{feature.icon}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-text-primary">{feature.name}</span>
                                        <span className="text-[9px] font-bold px-1.5 py-px rounded-full
                                     bg-success/10 text-success border border-success/20">
                                            {feature.status}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-text-tertiary mt-0.5">{feature.desc}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </Section>

            {/* ═══════════════════════════════════════════════
          SECTION 6 — METRICS & IMPACT
          ═══════════════════════════════════════════════ */}
            <Section id="metrics" className="py-20 px-8">
                <div className="max-w-[1000px] mx-auto">
                    <motion.div
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        className="inline-flex items-center gap-2 bg-warning/10 border border-warning/25
                       rounded-full px-4 py-1.5 mb-6"
                    >
                        <span className="text-xs font-semibold text-warning">Metrics & Impact</span>
                    </motion.div>

                    <motion.h2
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-3xl sm:text-4xl font-extrabold text-text-primary
                       tracking-tight mb-4"
                    >
                        Data-driven readiness,<br />
                        <span className="bg-gradient-to-r from-warning to-danger
                             bg-clip-text text-transparent">
                            not guesswork.
                        </span>
                    </motion.h2>

                    <motion.p
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-base text-text-secondary max-w-2xl mb-10 leading-relaxed"
                    >
                        The 6D Intelligence Engine computes readiness across 6 dimensions
                        from real signals in your solving behavior — not arbitrary point systems.
                    </motion.p>

                    {/* 6D Dimensions */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-10">
                        {[
                            {
                                num: 'D1', name: 'Pattern Recognition', color: '#7c6ff7',
                                desc: 'Speed and accuracy at identifying the right algorithm pattern.',
                                signals: 'Pattern tagged, diversity of patterns, identification speed',
                            },
                            {
                                num: 'D2', name: 'Solution Depth', color: '#22c55e',
                                desc: 'Quality of explanations, insights, and real-world connections.',
                                signals: 'Key insight filled, Feynman explanation, follow-up answers',
                            },
                            {
                                num: 'D3', name: 'Communication', color: '#3b82f6',
                                desc: 'Clarity of written explanations as rated by teammates.',
                                signals: 'Peer clarity ratings, explanation quality, STAR structure',
                            },
                            {
                                num: 'D4', name: 'Optimization', color: '#eab308',
                                desc: 'Ability to improve from brute force to optimal solutions.',
                                signals: 'Brute → optimal progression, complexity analysis accuracy',
                            },
                            {
                                num: 'D5', name: 'Pressure Performance', color: '#ef4444',
                                desc: 'Solution quality under timed interview simulation conditions.',
                                signals: 'Sim completion rate, time efficiency, no-hint rate',
                            },
                            {
                                num: 'D6', name: 'Knowledge Retention', color: '#a855f7',
                                desc: 'Recall scores during spaced repetition reviews.',
                                signals: 'Review confidence, on-time completion, retention trend',
                            },
                        ].map((dim, i) => (
                            <motion.div
                                key={dim.num}
                                initial={{ opacity: 0, y: 12 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.06 }}
                                className="bg-surface-1 border border-border-default rounded-2xl p-5"
                                style={{ borderTop: `3px solid ${dim.color}` }}
                            >
                                <div className="font-mono font-extrabold text-xl mb-2"
                                    style={{ color: dim.color }}>
                                    {dim.num}
                                </div>
                                <h4 className="text-sm font-bold text-text-primary mb-1">{dim.name}</h4>
                                <p className="text-xs text-text-tertiary leading-relaxed mb-3">{dim.desc}</p>
                                <div className="border-t border-border-subtle pt-2">
                                    <p className="text-[10px] text-text-disabled">
                                        <span className="font-bold">Signals:</span> {dim.signals}
                                    </p>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* What gets measured */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-6 mb-8"
                    >
                        <h3 className="text-sm font-bold text-text-primary mb-5
                           flex items-center gap-2">
                            <span>📊</span> What Gets Measured
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {[
                                { icon: '📋', label: 'Problems Solved', desc: 'By difficulty, category, and pattern' },
                                { icon: '⏱', label: 'Sim Performance', desc: 'Completion rate, time used, hints' },
                                { icon: '🧠', label: 'Review Accuracy', desc: 'Confidence ratings over time' },
                                { icon: '🧩', label: 'Quiz Scores', desc: 'By subject, difficulty, weak topics' },
                                { icon: '🔥', label: 'Streak & Consistency', desc: 'Daily activity, active days' },
                                { icon: '👥', label: 'Team Comparison', desc: 'Rank, percentile, peer ratings' },
                                { icon: '🎯', label: 'Goal Tracking', desc: 'Target company, target date' },
                                { icon: '📅', label: 'Weekly Progress', desc: 'Solved this week, trend direction' },
                            ].map((metric, i) => (
                                <motion.div
                                    key={metric.label}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    whileInView={{ opacity: 1, scale: 1 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.04 }}
                                    className="text-center p-3 rounded-xl bg-surface-2
                             border border-border-subtle"
                                >
                                    <span className="text-xl">{metric.icon}</span>
                                    <p className="text-xs font-bold text-text-primary mt-1.5">
                                        {metric.label}
                                    </p>
                                    <p className="text-[10px] text-text-disabled mt-0.5">
                                        {metric.desc}
                                    </p>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>

                    {/* ROI */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="bg-warning/5 border border-warning/20 rounded-2xl p-6"
                    >
                        <h3 className="text-sm font-bold text-text-primary mb-5
                           flex items-center gap-2">
                            <span>💰</span> ROI for Teams
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {[
                                {
                                    metric: '3x',
                                    label: 'Faster Pattern Recognition',
                                    desc: 'Team members identify patterns 3x faster after 4 weeks of structured practice with AI feedback.',
                                },
                                {
                                    metric: '60%',
                                    label: 'Better Knowledge Retention',
                                    desc: 'Spaced repetition reviews reduce knowledge decay by 60% compared to one-time solving.',
                                },
                                {
                                    metric: '100%',
                                    label: 'Interview Loop Coverage',
                                    desc: 'The only platform that covers coding + system design + behavioral + HR + SQL in one place.',
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
                                    <div className="text-3xl font-extrabold font-mono text-warning mb-1">
                                        {roi.metric}
                                    </div>
                                    <p className="text-xs font-bold text-text-primary mb-1">{roi.label}</p>
                                    <p className="text-[10px] text-text-tertiary leading-relaxed">
                                        {roi.desc}
                                    </p>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </Section>

            {/* Navigation hint — updated */}
            <div className="text-center py-8">
                <p className="text-xs text-text-disabled">
                    Sections 7-10 coming next — Roadmap, Competitive Analysis, Technical Specs, CTA
                </p>
            </div>
        </div>
    )
}