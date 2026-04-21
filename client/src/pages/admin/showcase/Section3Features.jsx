import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
    Section, SectionBadge, SectionTitle, SectionDesc,
    FeatureCard, FeatureGroupHeader, AnimatedNumber
} from './components'
import { cn } from '@utils/cn'

export default function Section3Features({ stats }) {
    const navigate = useNavigate()

    return (
        <Section id="features" className="py-20 px-8 bg-surface-0">
            <div className="max-w-[1000px] mx-auto">
                <SectionBadge label="What We Built" color="success" />

                <SectionTitle
                    line1="Every feature designed to"
                    line2="maximize interview readiness."
                    gradient="from-success to-blue-400"
                />

                <SectionDesc>
                    Not a prototype. Not an MVP. A complete, production-deployed platform
                    with 30+ features across 6 interview categories, powered by GPT-4o,
                    pgvector embeddings, and real-time WebSocket communication.
                    Click any feature to try it live.
                </SectionDesc>

                {/* ── Core Platform ─────────────────────────── */}
                <FeatureGroupHeader label="Core Platform — What Every User Interacts With" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
                    <FeatureCard
                        icon="📋" title="Multi-Category Problem System"
                        desc="6 interview categories: Coding, System Design, Behavioral, CS Fundamentals, HR, SQL. Each category has its own tailored submission form with different fields, labels, and workflows."
                        tag="6 Categories"
                        color="bg-brand-400/10 border-brand-400/25"
                        delay={0}
                        onClick={() => navigate('/problems')}
                    />
                    <FeatureCard
                        icon="💻" title="Rich Solution Submission"
                        desc="Monaco code editor (VS Code engine) for code, Tiptap rich text for explanations, multiple solution tabs (Brute Force → Optimized → Alternative), complexity analysis chips, and confidence tracking."
                        tag="Monaco + Tiptap"
                        color="bg-info/10 border-info/25"
                        delay={0.04}
                    />
                    <FeatureCard
                        icon="🧠" title="Spaced Repetition Review Queue"
                        desc="Scientifically-timed review schedule generated at submission (1, 3, 7, 14, 30 days). Confidence-based adaptive rescheduling — low confidence reviews come back sooner. Progress bar and session tracking."
                        tag="Adaptive"
                        color="bg-success/10 border-success/25"
                        delay={0.08}
                        onClick={() => navigate('/review')}
                    />
                    <FeatureCard
                        icon="🧩" title="AI-Generated Quizzes"
                        desc="Type ANY subject — 'TCP/IP', 'React Hooks', 'Physics', 'SQL Joins' — and AI generates MCQ questions instantly. Timer, scratchpad for rough work, question flagging, and post-quiz AI analysis of weak areas."
                        tag="Any Subject"
                        color="bg-warning/10 border-warning/25"
                        delay={0.12}
                        onClick={() => navigate('/quizzes')}
                    />
                    <FeatureCard
                        icon="📊" title="6D Intelligence Report"
                        desc="Hexagonal radar chart measuring readiness across 6 dimensions: Pattern Recognition, Solution Depth, Communication, Optimization, Pressure Performance, Knowledge Retention. All computed from real solving behavior."
                        tag="6 Dimensions"
                        color="bg-brand-400/10 border-brand-400/25"
                        delay={0.16}
                        onClick={() => navigate('/report')}
                    />
                    <FeatureCard
                        icon="🎯" title="Smart Problem Recommendations"
                        desc="5 recommendation strategies: company-targeted problems, pattern gap filling, low-confidence re-solving, vector similarity search (pgvector), and category balance. Each recommendation explains WHY it was suggested."
                        tag="pgvector"
                        color="bg-success/10 border-success/25"
                        delay={0.2}
                    />
                </div>

                {/* ── AI Mock Interview ─────────────────────── */}
                <FeatureGroupHeader label="AI Mock Interview — The Flagship Feature" />
                <motion.p
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="text-xs text-text-tertiary leading-relaxed mb-4 max-w-2xl"
                >
                    A complete AI-powered interview simulation that replicates how real companies
                    actually interview. Not a chatbot — a trained interviewer that evaluates,
                    probes, challenges, and generates a structured debrief.
                </motion.p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <FeatureCard
                        icon="💬" title="GPT-4o Conversational Interviewer"
                        desc="Real-time conversation powered by GPT-4o with WebSocket streaming. Token-by-token response delivery creates a natural chat experience. The AI evaluates — it never teaches or gives answers."
                        tag="GPT-4o + WebSocket"
                        color="bg-brand-400/10 border-brand-400/25"
                        delay={0}
                        onClick={() => navigate('/mock-interview')}
                    />
                    <FeatureCard
                        icon="🎭" title="8 Interview Culture Styles"
                        desc="Algorithm-Focused (Google/Meta style), System-Focused (AWS/Cloudflare), Values-Driven (Amazon LP), Pragmatic/Startup, Collaborative (Microsoft), Domain-Specific (Finance/Healthcare), Product-Oriented (Spotify/Notion), High-Pressure (Trading firms)."
                        tag="Culture-Based"
                        color="bg-warning/10 border-warning/25"
                        delay={0.04}
                    />
                    <FeatureCard
                        icon="🔧" title="Function Calling & Tool Use"
                        desc="The AI interviewer has 6 tools: look up problem details, check candidate profile, search teammate solutions, save performance notes, check time remaining, and transition phases. All used autonomously during the conversation."
                        tag="6 Tools"
                        color="bg-info/10 border-info/25"
                        delay={0.08}
                    />
                    <FeatureCard
                        icon="⏱" title="Phase-Aware Time Management"
                        desc="Each interview category has structured phases (e.g. Coding: Requirements → Approach → Implementation → Testing). The AI tracks time per phase, nudges transitions, and adapts pacing to the candidate's speed."
                        tag="Phase Tracking"
                        color="bg-success/10 border-success/25"
                        delay={0.12}
                    />
                    <FeatureCard
                        icon="📝" title="Workspace Panel"
                        desc="Split-screen interface: conversation on the left, workspace on the right. Category-specific tabs — Thinking, Code, Diagram, Notes, Scratchpad. Workspace content is visible to the AI and auto-saved every 30 seconds."
                        tag="Split Screen"
                        color="bg-brand-400/10 border-brand-400/25"
                        delay={0.16}
                    />
                    <FeatureCard
                        icon="📊" title="Style-Aware Structured Debrief"
                        desc="AI generates a detailed debrief with Hire/No-Hire verdict, scores across 5 dimensions (approach, communication, code quality, time management, knowledge depth), specific strengths, improvements, and key moments from the conversation."
                        tag="Hire/No-Hire"
                        color="bg-danger/10 border-danger/25"
                        delay={0.2}
                    />
                </div>
                <FeatureCard
                    icon="📜" title="Interview Session History & Replay"
                    desc="Every interview is fully stored — complete conversation transcript, workspace artifacts, AI notes, and debrief. Review past sessions, compare scores across interviews, re-read conversations, and track improvement over time."
                    color="bg-surface-3 border-border-default"
                    delay={0.24}
                    onClick={() => navigate('/interview-history')}
                />

                <div className="h-8" />

                {/* ── AI Intelligence Layer ─────────────────── */}
                <FeatureGroupHeader label="AI Intelligence — Not Just GPT Wrappers" />
                <motion.p
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="text-xs text-text-tertiary leading-relaxed mb-4 max-w-2xl"
                >
                    A full RAG (Retrieval Augmented Generation) pipeline with vector embeddings,
                    semantic search, and context-aware prompts. Every AI feature uses your team's
                    collective knowledge to give specific, comparative feedback — not generic advice.
                </motion.p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
                    <FeatureCard
                        icon="🤖" title="RAG-Enhanced Solution Review"
                        desc="Before reviewing your solution, the AI searches for similar teammate solutions via pgvector cosine similarity, fetches admin teaching notes, and injects everything as context. Result: 'Your teammate Alex used O(n) — compare with your O(n²)' instead of generic 'consider optimizing.'"
                        tag="RAG + pgvector"
                        color="bg-brand-400/10 border-brand-400/25"
                        delay={0}
                    />
                    <FeatureCard
                        icon="📅" title="AI Weekly Coaching Plans"
                        desc="GPT analyzes your 6D scores, quiz history, solving patterns, review queue status, and target company to generate a specific 7-day study plan with daily tasks. Not generic — 'Solve Design WhatsApp on Tuesday because your system design score is 23/100.'"
                        tag="Personalized"
                        color="bg-brand-400/10 border-brand-400/25"
                        delay={0.04}
                    />
                    <FeatureCard
                        icon="📋" title="AI Problem Content Generator"
                        desc="Admin enters a problem title and clicks 'Generate with AI.' GPT generates real-world context, 5-6 use cases, detailed admin teaching notes with approaches and edge cases, and 3 progressive follow-up questions (Easy → Medium → Hard) with hints."
                        tag="Admin Tool"
                        color="bg-warning/10 border-warning/25"
                        delay={0.08}
                    />
                    <FeatureCard
                        icon="💡" title="AI Progressive Hints"
                        desc="During interview simulations, 3-level AI hints adapt to time elapsed and problem pattern. Level 1: vague directional nudge. Level 2: approach category hint. Level 3: specific technique name. Each level is recorded for the debrief."
                        tag="3 Levels"
                        color="bg-info/10 border-info/25"
                        delay={0.12}
                    />
                    <FeatureCard
                        icon="📐" title="Vector Embeddings (pgvector)"
                        desc="Every solution and problem is converted to a 1536-dimension embedding via OpenAI's text-embedding-3-small model. Stored in PostgreSQL pgvector columns with IVFFlat indexing. Powers: semantic search, similar problem recommendations, RAG context retrieval."
                        tag="1536 dimensions"
                        color="bg-success/10 border-success/25"
                        delay={0.16}
                    />
                    <FeatureCard
                        icon="🧩" title="AI Quiz Analysis"
                        desc="After completing a quiz, AI analyzes your wrong answers to find patterns: 'You got 3 networking questions wrong, all related to TCP handshake. Review the 3-way handshake process.' Generates specific study advice and encouragement."
                        tag="Post-Quiz"
                        color="bg-danger/10 border-danger/25"
                        delay={0.2}
                    />
                </div>

                {/* ── Security & Auth ───────────────────────── */}
                <FeatureGroupHeader label="Security & Authentication — Enterprise Grade" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
                    <FeatureCard
                        icon="📧" title="Email Verification"
                        desc="6-digit verification code sent via Resend on registration. Styled HTML email matching ProbSolver's brand. 15-minute expiry, auto-redirect flow, resend with 60-second cooldown. Unverified accounts cannot access the platform."
                        tag="Resend"
                        color="bg-success/10 border-success/25"
                        delay={0}
                    />
                    <FeatureCard
                        icon="🔑" title="Self-Service Password Reset"
                        desc="Forgot password → enter email → receive styled HTML email with 6-digit code → enter code + new password → redirected to login. Completely self-service — no admin involvement needed. Codes expire in 15 minutes."
                        color="bg-warning/10 border-warning/25"
                        delay={0.04}
                    />
                    <FeatureCard
                        icon="🛡️" title="Admin Password Management"
                        desc="Admin can set temporary passwords for any member from the Admin Panel. The member is forced to change their password on next login before they can access any other page. Complete flow with UI feedback."
                        color="bg-danger/10 border-danger/25"
                        delay={0.08}
                    />
                    <FeatureCard
                        icon="📱" title="Secure Email Change"
                        desc="Members can change their email address through Settings. A 6-digit verification code is sent to the NEW email. Only after verification does the email update. The old email receives a security notification."
                        color="bg-info/10 border-info/25"
                        delay={0.12}
                    />
                </div>

                {/* ── Admin & Analytics ─────────────────────── */}
                <FeatureGroupHeader label="Admin Intelligence — Platform Growth Tools" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
                    <FeatureCard
                        icon="🩺" title="AI Product Health Analytics"
                        desc="Comprehensive platform metrics: user engagement funnel, feature adoption rates, content gaps, solution quality trends, growth indicators — all analyzed by AI with specific actionable recommendations, risk identification, and trend analysis."
                        tag="AI-Powered"
                        color="bg-brand-400/10 border-brand-400/25"
                        delay={0}
                        onClick={() => navigate('/admin/analytics')}
                    />
                    <FeatureCard
                        icon="👥" title="Separate Admin/Member Experiences"
                        desc="Admins see team health dashboard, content coverage, member monitoring, inactive user alerts. Members see personal stats, recommendations, practice tools. Completely different sidebar navigation, dashboard, and feature access."
                        tag="Role-Based"
                        color="bg-warning/10 border-warning/25"
                        delay={0.04}
                    />
                    <FeatureCard
                        icon="👑" title="Full Admin Panel"
                        desc="Problem CRUD with AI content generation. Member management with promote, demote, delete, and password reset. Problems table with pin, hide, edit, delete. Category column shows at a glance."
                        color="bg-danger/10 border-danger/25"
                        delay={0.08}
                        onClick={() => navigate('/admin')}
                    />
                    <FeatureCard
                        icon="🎪" title="Showcase Presentation Page"
                        desc="This page — a 10-section live sales presentation with animated counters, architecture diagrams, competitive analysis, and real-time platform metrics. Designed for client demos with every audience in mind."
                        tag="You're here"
                        color="bg-brand-400/10 border-brand-400/25"
                        delay={0.12}
                    />
                </div>

                {/* ── Team & Collaboration ──────────────────── */}
                <FeatureGroupHeader label="Team & Collaboration" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                    <FeatureCard
                        icon="🏆" title="Leaderboard with Podium"
                        desc="Members ranked by total solved, hard count, and streak. Top 3 get a visual podium. Each row shows Easy/Medium/Hard split, streak, confidence, and coverage percentage. Admins excluded from rankings."
                        color="bg-warning/10 border-warning/25"
                        delay={0}
                        onClick={() => navigate('/leaderboard')}
                    />
                    <FeatureCard
                        icon="👤" title="Member Profiles"
                        desc="Public profiles showing solving history, difficulty breakdown, language preferences, target companies, streak, and sim count. Click any leaderboard row to view their profile."
                        color="bg-info/10 border-info/25"
                        delay={0.04}
                        onClick={() => navigate('/profile')}
                    />
                    <FeatureCard
                        icon="⭐" title="Peer Clarity Ratings"
                        desc="Members rate each other's solution explanations 1-5 stars. Average clarity score feeds into the Communication dimension of the 6D Intelligence Report. Incentivizes clear, well-written explanations."
                        color="bg-success/10 border-success/25"
                        delay={0.08}
                    />
                    <FeatureCard
                        icon="🔍" title="Command Palette (⌘K)"
                        desc="Instant search across problems (with solved indicators and difficulty badges), navigation pages, and admin actions. Keyboard-navigable with arrow keys + Enter. Searches semantically, not just by title."
                        color="bg-brand-400/10 border-brand-400/25"
                        delay={0.12}
                    />
                </div>

                {/* ── AI Live Metrics ───────────────────────── */}
                {stats?.aiEnabled && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="bg-brand-400/5 border border-brand-400/20 rounded-2xl p-6 mt-4"
                    >
                        <h3 className="text-xs font-bold text-brand-300 uppercase tracking-widest mb-5">
                            AI Intelligence — Live Platform Metrics
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                            {[
                                { icon: '🤖', value: stats.aiReviewCount || 0, label: 'AI Reviews' },
                                { icon: '📐', value: stats.embeddingCount || 0, label: 'Embeddings' },
                                { icon: '🧩', value: stats.totalQuizzes || 0, label: 'AI Quizzes' },
                                { icon: '💬', value: stats.totalSims || 0, label: 'Mock Interviews' },
                                { icon: '📋', value: stats.problemEmbeddings || 0, label: 'Problem Vectors' },
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
    )
}