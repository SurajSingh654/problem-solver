import { motion } from 'framer-motion'
import { cn } from '@utils/cn'
import {
    Section, SectionBadge, SectionTitle, SectionDesc,
    TechItem, DiagramBlock, FlowStep
} from './components'

export default function Section4Architecture() {
    return (
        <Section id="architecture" className="py-20 px-8">
            <div className="max-w-[1000px] mx-auto">
                <SectionBadge label="Technical Architecture" color="info" />

                <SectionTitle
                    line1="Built for scale,"
                    line2="designed for extensibility."
                    gradient="from-info to-brand-300"
                />

                <SectionDesc>
                    Modern full-stack architecture with clear separation of concerns.
                    Every layer is independently scalable and replaceable. Real-time
                    communication via WebSocket. AI pipeline with RAG and vector search.
                    Deployed as Docker containers on Railway with auto-deploy on git push.
                </SectionDesc>

                {/* ── System Architecture Diagram ─────────────── */}
                <DiagramBlock border="border-border-default">
                    {`┌───────────────────────────┐      ┌────────────────────────────┐      ┌──────────────────┐
│       FRONTEND            │      │        BACKEND             │      │    DATABASE       │
│                           │ REST │                            │      │                  │
│  React 18 + Vite          │─────►│  Express REST API          │─────►│  PostgreSQL      │
│  TanStack Query (cache)   │◄─────│  JWT + Zod Validation      │      │  + pgvector      │
│  Zustand (UI state)       │ JSON │                            │      │                  │
│  Framer Motion            │      │  AI Service Layer          │      │  10 models       │
│  Monaco Editor (code)     │  WS  │  ├─ GPT-4o (interviews)   │      │  Vector indexes  │
│  Tiptap (rich text)       │◄────►│  ├─ GPT-4o-mini (reviews) │      │  Embeddings      │
│  React Hook Form          │      │  └─ pgvector (RAG search)  │      │                  │
│                           │      │                            │      │                  │
│  Tailwind + CSS vars      │      │  WebSocket Server          │      │                  │
│  (dark + light mode)      │      │  (real-time interviews)    │      │                  │
│                           │      │                            │ SMTP │                  │
│  :3000 (serve)            │      │  Resend Email Service ─────┼─────►│  Email delivery  │
└───────────────────────────┘      └────────────────────────────┘      └──────────────────┘
          │                                 │            │                      │
          │ Docker: node:alpine + serve     │ Docker:    │ Resend API           │ Railway
          │ Static build (Vite)             │ node:slim  │ (verification,       │ Plugin
          │                                 │ + OpenSSL  │  password reset,     │
          │                                 │            │  welcome emails)     │
          └──────────── Deployed on Railway ┴────────────┴──────────────────────┘
                         Auto-deploy on git push to GitHub`}
                </DiagramBlock>

                {/* ── Tech Stack — Side by Side ──────────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
                    {/* Frontend Stack */}
                    <motion.div
                        initial={{ opacity: 0, x: -12 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-5"
                    >
                        <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                            <span className="text-lg">⚛️</span> Frontend Stack
                        </h3>
                        <div className="space-y-2">
                            <TechItem name="React 18" desc="Component UI with hooks + Suspense" badge="Core" badgeColor="brand" delay={0} direction="left" />
                            <TechItem name="Vite 5" desc="Instant HMR, code-split production builds" badge="Build" badgeColor="brand" delay={0.03} direction="left" />
                            <TechItem name="TailwindCSS v3" desc="Utility-first with CSS variables (dark/light)" badge="Style" badgeColor="brand" delay={0.06} direction="left" />
                            <TechItem name="TanStack Query v5" desc="Server state, caching, background refetch" badge="Data" badgeColor="info" delay={0.09} direction="left" />
                            <TechItem name="Zustand" desc="Lightweight UI state (theme, sidebar, toast)" badge="State" badgeColor="info" delay={0.12} direction="left" />
                            <TechItem name="Framer Motion" desc="Spring physics animations + scroll triggers" badge="Animation" badgeColor="brand" delay={0.15} direction="left" />
                            <TechItem name="Monaco Editor" desc="VS Code editor engine for code input" badge="Editor" badgeColor="warning" delay={0.18} direction="left" />
                            <TechItem name="Tiptap" desc="Rich text with B/I/U, lists, quotes, code" badge="Editor" badgeColor="warning" delay={0.21} direction="left" />
                            <TechItem name="React Hook Form" desc="Forms with Zod schema validation" badge="Forms" badgeColor="success" delay={0.24} direction="left" />
                            <TechItem name="Excalidraw" desc="Whiteboard canvas for diagrams (installed)" badge="Drawing" badgeColor="info" delay={0.27} direction="left" />
                        </div>
                    </motion.div>

                    {/* Backend Stack */}
                    <motion.div
                        initial={{ opacity: 0, x: 12 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-5"
                    >
                        <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                            <span className="text-lg">🟢</span> Backend Stack
                        </h3>
                        <div className="space-y-2">
                            <TechItem name="Node.js 20" desc="ES modules, async/await, native fetch" badge="Runtime" badgeColor="success" delay={0} direction="right" />
                            <TechItem name="Express" desc="REST API with layered middleware chain" badge="API" badgeColor="success" delay={0.03} direction="right" />
                            <TechItem name="WebSocket (ws)" desc="Real-time bidirectional for AI interviews" badge="Real-time" badgeColor="warning" delay={0.06} direction="right" />
                            <TechItem name="Prisma 5" desc="Type-safe ORM with auto migrations" badge="ORM" badgeColor="success" delay={0.09} direction="right" />
                            <TechItem name="PostgreSQL" desc="Production database on Railway" badge="Database" badgeColor="info" delay={0.12} direction="right" />
                            <TechItem name="pgvector" desc="1536-dim embeddings + IVFFlat cosine search" badge="Vectors" badgeColor="brand" delay={0.15} direction="right" />
                            <TechItem name="OpenAI GPT-4o" desc="Mock interviewer conversations" badge="AI" badgeColor="brand" delay={0.18} direction="right" />
                            <TechItem name="OpenAI GPT-4o-mini" desc="Reviews, quizzes, coaching, content gen" badge="AI" badgeColor="brand" delay={0.21} direction="right" />
                            <TechItem name="JWT + bcrypt" desc="Stateless auth + password hashing" badge="Security" badgeColor="danger" delay={0.24} direction="right" />
                            <TechItem name="Resend" desc="Transactional emails (verify, reset, welcome)" badge="Email" badgeColor="success" delay={0.27} direction="right" />
                            <TechItem name="Zod" desc="Shared validation schemas (client + server)" badge="Validation" badgeColor="warning" delay={0.30} direction="right" />
                        </div>
                    </motion.div>
                </div>

                {/* ── Data Flow — Two Critical Paths ─────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
                    {/* Flow 1: Submit a Solution */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-5"
                    >
                        <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                            <span>🔄</span> Data Flow — Submit Solution
                        </h3>
                        <div className="space-y-3">
                            <FlowStep step="1" label="Form validates" desc="React Hook Form + Zod schema. Monaco captures code, Tiptap captures rich text." color="bg-brand-400" delay={0} />
                            <FlowStep step="2" label="API request" desc="Axios POST /api/solutions. JWT auto-attached by interceptor." color="bg-info" delay={0.04} />
                            <FlowStep step="3" label="Server validates" desc="Express middleware: auth → Zod → controller." color="bg-success" delay={0.08} />
                            <FlowStep step="4" label="Database write" desc="Prisma creates record. Spaced repetition dates calculated." color="bg-warning" delay={0.12} />
                            <FlowStep step="5" label="Embedding" desc="OpenAI generates vector in background. Stored in pgvector." color="bg-brand-400" delay={0.16} />
                            <FlowStep step="6" label="Cache refresh" desc="TanStack Query invalidates. Components re-render." color="bg-danger" delay={0.20} />
                            <FlowStep step="7" label="AI ready" desc="RAG fetches teammates + admin notes → comparative review." color="bg-brand-400" delay={0.24} />
                        </div>
                    </motion.div>

                    {/* Flow 2: AI Mock Interview */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="bg-surface-1 border border-brand-400/20 rounded-2xl p-5"
                    >
                        <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                            <span>💬</span> Data Flow — AI Mock Interview
                        </h3>
                        <div className="space-y-3">
                            <FlowStep step="1" label="Session created" desc="REST POST creates session with phases, persona, problem." color="bg-brand-400" delay={0} />
                            <FlowStep step="2" label="WebSocket opens" desc="JWT authenticated. Bidirectional channel established." color="bg-info" delay={0.04} />
                            <FlowStep step="3" label="AI calibrates" desc="GPT-4o calls getCandidateProfile tool. Checks skill level." color="bg-success" delay={0.08} />
                            <FlowStep step="4" label="Conversation" desc="Each message: history loaded → system prompt built → GPT-4o streams response token-by-token." color="bg-warning" delay={0.12} />
                            <FlowStep step="5" label="Tools execute" desc="AI autonomously calls 6 tools mid-conversation. Results feed back to GPT." color="bg-brand-400" delay={0.16} />
                            <FlowStep step="6" label="Notes saved" desc="AI saves performance observations via saveInterviewNote tool throughout." color="bg-danger" delay={0.20} />
                            <FlowStep step="7" label="Debrief generated" desc="GPT-4o analyzes full transcript + notes → structured verdict with scores." color="bg-brand-400" delay={0.24} />
                        </div>
                    </motion.div>
                </div>

                {/* ── Database Schema ────────────────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-8"
                >
                    <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                        <span>🗄️</span> Database Schema — 10 Models + Vector Columns
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[
                            { model: 'User', fields: 'Auth, profile, streak, goals, email verification, role (Admin/Member)' },
                            { model: 'Problem', fields: '6 categories, description, categoryData, tags, embeddings (vector)' },
                            { model: 'Solution', fields: 'Multi-step submission, code, complexity, AI feedback, embeddings (vector)' },
                            { model: 'FollowUpQuestion', fields: 'Per-problem with difficulty, hints, ordering' },
                            { model: 'ClarityRating', fields: 'Peer 1-5 ratings on solution explanation quality' },
                            { model: 'SimSession', fields: 'Timer-based practice with scoring and debrief' },
                            { model: 'QuizAttempt', fields: 'AI-generated quizzes with graded answers and AI analysis' },
                            { model: 'InterviewSession', fields: 'AI mock interview: phases, workspace, debrief, 5 dimension scores' },
                            { model: 'InterviewMessage', fields: 'Conversation transcript with tool calls, workspace snapshots, phase tags' },
                            { model: 'pgvector columns', fields: '1536-dim embeddings on problems + solutions with IVFFlat indexes' },
                        ].map((m, i) => (
                            <motion.div
                                key={m.model}
                                initial={{ opacity: 0, y: 4 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.03 }}
                                className="flex items-center gap-3 px-3 py-2 rounded-xl bg-surface-2 border border-border-subtle"
                            >
                                <code className="text-[10px] font-mono font-bold text-brand-300 w-36 flex-shrink-0">
                                    {m.model}
                                </code>
                                <span className="text-[10px] text-text-tertiary">{m.fields}</span>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>

                {/* ── API Surface ────────────────────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-5"
                >
                    <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                        <span>🔌</span> API Surface — 11 Route Groups + WebSocket
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[
                            { route: '/api/auth', desc: 'Register, login, verify email, reset password, change email, profile' },
                            { route: '/api/problems', desc: '6-category CRUD with filtering, search, category-specific fields' },
                            { route: '/api/solutions', desc: 'Submit, update, review, clarity rating, spaced repetition review' },
                            { route: '/api/quizzes', desc: 'AI generation, submission, scoring, AI analysis, history' },
                            { route: '/api/sim', desc: 'Timer-based simulation: start, hint, complete, abandon' },
                            { route: '/api/interview-v2', desc: 'AI mock interview: start session, get details, end, debrief, history' },
                            { route: '/api/ai', desc: 'Solution review (RAG), content gen, hints, weekly plan, embeddings, similar search' },
                            { route: '/api/stats', desc: 'Personal 6D scores, team stats, leaderboard, showcase metrics' },
                            { route: '/api/recommendations', desc: 'Smart suggestions: company-targeted, pattern gaps, vector similarity' },
                            { route: '/api/users', desc: 'List, profile, delete, role management (admin)' },
                            { route: '/api/admin', desc: 'Product health metrics + AI analysis (admin only)' },
                            {
                                route: '/ws/interview', desc: 'WebSocket: real-time AI interviewer with streaming + tool calls',
                                highlight: true
                            },
                        ].map((api, i) => (
                            <motion.div
                                key={api.route}
                                initial={{ opacity: 0, y: 4 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.03 }}
                                className={cn(
                                    'flex items-center gap-3 px-3 py-2 rounded-xl border',
                                    api.highlight
                                        ? 'bg-brand-400/5 border-brand-400/20'
                                        : 'bg-surface-2 border-border-subtle'
                                )}
                            >
                                <code className={cn(
                                    'text-[10px] font-mono font-bold w-40 flex-shrink-0',
                                    api.highlight ? 'text-brand-300' : 'text-success'
                                )}>
                                    {api.route}
                                </code>
                                <span className="text-[10px] text-text-tertiary">{api.desc}</span>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </Section>
    )
}