import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '@utils/cn'
import { Section, SectionBadge, SectionTitle, SectionDesc } from './components'

const CAPABILITIES = [
    {
        icon: '📋',
        title: 'Practice Every Round',
        // UPDATED: 6 → 7, correct category names
        subtitle: '7 Interview Categories',
        desc: 'Coding, System Design, Low-Level Design, Behavioral, Technical Knowledge, Databases, HR — each with a dedicated workspace, category-specific AI review, and progressive follow-up questions.',
        color: 'from-brand-400/20 to-brand-400/5',
        border: 'border-brand-400/20 hover:border-brand-400/40',
        to: '/problems',
        highlights: ['Dedicated workspaces', 'AI-generated content', 'Follow-up questions'],
    },
    {
        icon: '💬',
        title: 'AI Mock Interviews',
        subtitle: 'GPT-4o + WebSocket Streaming',
        desc: 'Real-time conversation with a GPT-4o powered interviewer. 8 interview culture styles (Google, Amazon, Startup, Trading firm...). Split-screen workspace with code editor and diagram canvas. Structured debrief with hire/no-hire verdict.',
        color: 'from-info/20 to-info/5',
        border: 'border-info/20 hover:border-info/40',
        to: '/mock-interview',
        highlights: ['8 interview styles', 'Real-time streaming', 'Hire/No-Hire debrief'],
    },
    {
        icon: '🧩',
        title: 'AI Quizzes on Anything',
        subtitle: 'Any Subject, Any Difficulty',
        desc: 'Type "TCP/IP", "React Hooks", "Physics", or literally anything — AI generates MCQ questions instantly. Timer, scratchpad, question flagging, and post-quiz AI analysis that identifies your weak areas.',
        color: 'from-warning/20 to-warning/5',
        border: 'border-warning/20 hover:border-warning/40',
        to: '/quizzes',
        highlights: ['Any subject imaginable', 'Post-quiz AI analysis', 'Weak area identification'],
    },
    {
        icon: '🧠',
        title: 'Spaced Repetition',
        subtitle: 'Science-Backed Review Queue',
        desc: 'Forget once, forget forever. Our spaced repetition system schedules reviews at 1, 3, 7, 14, and 30 days. Your confidence rating adapts the schedule — low confidence means you review sooner.',
        color: 'from-success/20 to-success/5',
        border: 'border-success/20 hover:border-success/40',
        to: '/review',
        highlights: ['Adaptive scheduling', 'Confidence-based', 'Progress tracking'],
    },
    {
        icon: '📊',
        title: '6D Intelligence Report',
        subtitle: 'Measure Real Readiness',
        desc: 'Not "problems solved" — real readiness. 6 dimensions computed from your actual behavior: Pattern Recognition, Solution Depth, Communication, Optimization, Pressure Performance, Knowledge Retention.',
        color: 'from-brand-400/20 to-purple-400/5',
        border: 'border-brand-400/20 hover:border-brand-400/40',
        to: '/report',
        highlights: ['6 computed dimensions', 'No gaming possible', 'AI weekly coaching plan'],
    },
    {
        icon: '👥',
        title: 'Team Collaboration',
        subtitle: 'Learn Together, Grow Together',
        desc: 'See how teammates solve the same problem. Rate each other\'s explanations. Compete on the leaderboard. Your AI reviews compare your work with teammates — "Your colleague Alex used O(n), compare with your O(n²)."',
        color: 'from-danger/20 to-danger/5',
        border: 'border-danger/20 hover:border-danger/40',
        to: '/leaderboard',
        highlights: ['Peer solution viewing', 'Clarity ratings', 'Team leaderboard'],
    },
]

// NEW: Dedicated workspace callout — highlights the purpose-built workspaces
// added across this session for Behavioral, Technical Knowledge, and Databases.
const WORKSPACE_HIGHLIGHTS = [
    {
        icon: '🗣️',
        category: 'Behavioral',
        headline: 'STAR Workspace',
        desc: 'Forces the metacognitive step first — name the competency being tested before writing your story. Five structured STAR sections with per-section depth indicators.',
        color: 'text-success',
        bg: 'bg-success/5 border-success/20',
    },
    {
        icon: '🧠',
        category: 'Technical Knowledge',
        headline: 'Mechanism-First Workspace',
        desc: '7 subject domains (OS, Networking, DB Internals, DSA Theory, Distributed Systems, AI/ML, Data Engineering). Forces mechanism-level explanation, not textbook definitions.',
        color: 'text-warning',
        bg: 'bg-warning/5 border-warning/20',
    },
    {
        icon: '🗄️',
        category: 'Databases',
        headline: 'In-House SQL Editor',
        desc: 'Write and submit SQL queries directly in ProbSolver — no external redirects. Two modes: Query Problems (schema reference + Monaco SQL editor) and Schema Design (structured table modeling).',
        color: 'text-brand-300',
        bg: 'bg-brand-400/5 border-brand-400/20',
    },
]

export default function Section2Features() {
    const navigate = useNavigate()

    return (
        <Section id="features" className="py-20 px-8">
            <div className="max-w-[1100px] mx-auto">
                <SectionBadge label="What You Can Do" color="brand" />
                <SectionTitle
                    line1="Everything you need to"
                    line2="ace every interview round."
                    gradient="from-brand-300 to-blue-400"
                />
                <SectionDesc>
                    Every interview round. Every skill dimension. AI-powered coaching, team collaboration,
                    spaced repetition, and data-driven readiness tracking — all in one platform.
                </SectionDesc>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
                    {CAPABILITIES.map((cap, i) => (
                        <motion.div
                            key={cap.title}
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.06, duration: 0.4 }}
                            onClick={() => navigate(cap.to)}
                            className={cn(
                                'group relative rounded-2xl border p-6 cursor-pointer',
                                'transition-all duration-300',
                                'hover:-translate-y-1 hover:shadow-xl',
                                'bg-gradient-to-b',
                                cap.color,
                                cap.border,
                            )}
                        >
                            <div className="text-3xl mb-4">{cap.icon}</div>
                            <h3 className="text-base font-extrabold text-text-primary mb-0.5">
                                {cap.title}
                            </h3>
                            <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-3">
                                {cap.subtitle}
                            </p>
                            <p className="text-xs text-text-tertiary leading-relaxed mb-4">
                                {cap.desc}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {cap.highlights.map(h => (
                                    <span key={h}
                                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full
                                   bg-surface-0/50 border border-border-subtle text-text-secondary">
                                        {h}
                                    </span>
                                ))}
                            </div>
                            <div className="absolute top-6 right-6 text-text-disabled
                              group-hover:text-brand-300 transition-colors">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="7" y1="17" x2="17" y2="7" />
                                    <polyline points="7 7 17 7 17 17" />
                                </svg>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* NEW: Dedicated workspace callout */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-6"
                >
                    <h3 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-1">
                        <span>🏗️</span> Purpose-Built Workspaces — Not Generic Forms
                    </h3>
                    <p className="text-xs text-text-tertiary mb-5 leading-relaxed">
                        Every non-coding category has a dedicated workspace engineered around how that
                        interview type is actually evaluated. Not a text box with a different label —
                        a structured, coached submission experience built around the psychology of each round.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {WORKSPACE_HIGHLIGHTS.map((w, i) => (
                            <motion.div
                                key={w.category}
                                initial={{ opacity: 0, y: 8 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.08 }}
                                className={cn('rounded-xl border p-4', w.bg)}
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xl">{w.icon}</span>
                                    <div>
                                        <p className={cn('text-[10px] font-bold uppercase tracking-widest', w.color)}>
                                            {w.category}
                                        </p>
                                        <p className="text-xs font-bold text-text-primary">{w.headline}</p>
                                    </div>
                                </div>
                                <p className="text-[11px] text-text-tertiary leading-relaxed">{w.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </Section>
    )
}