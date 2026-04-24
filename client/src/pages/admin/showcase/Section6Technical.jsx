import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@utils/cn'
import {
    Section, SectionBadge, SectionTitle, SectionDesc,
    TechItem, DiagramBlock, FlowStep
} from './components'

function CollapsibleSection({ title, icon, defaultOpen = false, children }) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden mb-4">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between p-5 text-left
                   hover:bg-surface-2/50 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <span className="text-lg">{icon}</span>
                    <h3 className="text-sm font-bold text-text-primary">{title}</h3>
                </div>
                <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round"
                        className="text-text-disabled">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </motion.div>
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                    >
                        <div className="px-5 pb-5 border-t border-border-default pt-4">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

export default function Section6Technical({ stats }) {
    return (
        <Section id="technical" className="py-20 px-8">
            <div className="max-w-[1000px] mx-auto">
                <SectionBadge label="Under The Hood" color="info" />
                <SectionTitle
                    line1="For the technically curious."
                    line2="Here's how it all works."
                    gradient="from-info to-brand-300"
                />
                <SectionDesc>
                    Modern full-stack architecture with clean separation of concerns,
                    versioned APIs, real-time WebSocket communication, and a 4-layer AI pipeline.
                    Click any section below to dive deeper.
                </SectionDesc>

                {/* Architecture Overview — always visible */}
                <DiagramBlock border="border-border-default">
                    {`┌──────────────────────┐     ┌─────────────────────────┐     ┌─────────────────┐
│      FRONTEND        │REST │        BACKEND          │     │    DATABASE      │
│                      │────►│                         │────►│                 │
│  React 18 + Vite     │◄────│  Express + WebSocket    │     │  PostgreSQL     │
│  TanStack Query      │JSON │  JWT + Zod Validation   │     │  + pgvector     │
│  Zustand + Framer    │     │                         │     │                 │
│  Monaco + Tiptap     │ WS  │  AI Service Layer       │     │  11 models      │
│  Excalidraw          │◄───►│  ├─ GPT-4o (interviews) │     │  Vector indexes │
│                      │     │  ├─ GPT-4o-mini (rest)  │     │  1536-dim       │
│  Tailwind (dark/     │     │  └─ pgvector (RAG)      │     │                 │
│   light mode)        │     │                         │SMTP │                 │
│                      │     │  Resend Email ──────────┼────►│  Email delivery │
└──────────────────────┘     └─────────────────────────┘     └─────────────────┘
         │                            │                              │
         └──── Deployed on Railway ───┴── Docker + Auto-deploy ──────┘`}
                </DiagramBlock>

                {/* Collapsible deep-dive sections */}
                <CollapsibleSection title="Tech Stack" icon="⚛️" defaultOpen>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                            <p className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-3">Frontend</p>
                            <div className="space-y-2">
                                <TechItem name="React 18" desc="Hooks + Suspense" badge="Core" badgeColor="brand" direction="left" />
                                <TechItem name="Vite 5" desc="Instant HMR, code-splitting" badge="Build" badgeColor="brand" direction="left" delay={0.03} />
                                <TechItem name="TailwindCSS" desc="Dark/light with CSS vars" badge="Style" badgeColor="brand" direction="left" delay={0.06} />
                                <TechItem name="TanStack Query v5" desc="Server state + caching" badge="Data" badgeColor="info" direction="left" delay={0.09} />
                                <TechItem name="Zustand" desc="Lightweight UI state" badge="State" badgeColor="info" direction="left" delay={0.12} />
                                <TechItem name="Monaco Editor" desc="VS Code engine" badge="Editor" badgeColor="warning" direction="left" delay={0.15} />
                                <TechItem name="Framer Motion" desc="Spring animations" badge="Motion" badgeColor="brand" direction="left" delay={0.18} />
                                <TechItem name="Excalidraw" desc="Whiteboard canvas" badge="Drawing" badgeColor="info" direction="left" delay={0.21} />
                            </div>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-text-disabled uppercase tracking-widest mb-3">Backend</p>
                            <div className="space-y-2">
                                <TechItem name="Node.js 20" desc="ES modules" badge="Runtime" badgeColor="success" direction="right" />
                                <TechItem name="Express" desc="REST + middleware" badge="API" badgeColor="success" direction="right" delay={0.03} />
                                <TechItem name="WebSocket (ws)" desc="Real-time interviews" badge="Real-time" badgeColor="warning" direction="right" delay={0.06} />
                                <TechItem name="Prisma 5" desc="Type-safe ORM" badge="ORM" badgeColor="success" direction="right" delay={0.09} />
                                <TechItem name="PostgreSQL" desc="+ pgvector extension" badge="Database" badgeColor="info" direction="right" delay={0.12} />
                                <TechItem name="OpenAI GPT-4o" desc="Interviews + analysis" badge="AI" badgeColor="brand" direction="right" delay={0.15} />
                                <TechItem name="JWT + bcrypt" desc="Auth + hashing" badge="Security" badgeColor="danger" direction="right" delay={0.18} />
                                <TechItem name="Resend" desc="Transactional emails" badge="Email" badgeColor="success" direction="right" delay={0.21} />
                            </div>
                        </div>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="AI Pipeline — Solution Review Flow" icon="🤖">
                    <div className="space-y-3">
                        <FlowStep step="1" label="Vector Search" desc="pgvector cosine similarity finds 3 most similar teammate solutions." color="bg-brand-400" delay={0} />
                        <FlowStep step="2" label="Context Assembly" desc="Teammate solutions + admin teaching notes + problem metadata + user history." color="bg-info" delay={0.04} />
                        <FlowStep step="3" label="Prompt Construction" desc="System prompt (role + rules) + user context (solution) + RAG context (assembled above)." color="bg-success" delay={0.08} />
                        <FlowStep step="4" label="GPT-4o-mini Call" desc="JSON mode, ~1500 tokens, category-specific evaluation criteria." color="bg-warning" delay={0.12} />
                        <FlowStep step="5" label="Validation" desc="Response validated against Zod schema. Score, strengths, gaps, improvement tip, interview tip." color="bg-danger" delay={0.16} />
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="AI Pipeline — Mock Interview Flow" icon="💬">
                    <div className="space-y-3">
                        <FlowStep step="1" label="Session Created" desc="REST POST creates session with phases, persona, problem reference." color="bg-brand-400" delay={0} />
                        <FlowStep step="2" label="WebSocket Opens" desc="JWT authenticated. Bidirectional channel for real-time streaming." color="bg-info" delay={0.04} />
                        <FlowStep step="3" label="Conversation Stages" desc="OPENING → EARLY → MIDDLE → LATE → WRAPPING_UP. AI adapts behavior per stage." color="bg-success" delay={0.08} />
                        <FlowStep step="4" label="Tool Execution" desc="6 tools called autonomously: problem lookup, candidate profile, teammate search, notes, time, phase." color="bg-warning" delay={0.12} />
                        <FlowStep step="5" label="Streaming Response" desc="GPT-4o streams tokens via WebSocket. Natural, real-time conversation feel." color="bg-brand-400" delay={0.16} />
                        <FlowStep step="6" label="Debrief Generation" desc="Full transcript analyzed → structured verdict with 5 dimension scores." color="bg-danger" delay={0.20} />
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="Database Schema — 11 Models" icon="🗄️">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[
                            { model: 'User', desc: 'Auth, profile, streak, goals, roles (SuperAdmin / TeamAdmin / Member)' },
                            { model: 'Team', desc: 'Multi-tenant boundary, join codes, approval workflow' },
                            { model: 'Problem', desc: '6 categories, tags, vector embeddings (1536-dim)' },
                            { model: 'Solution', desc: 'Multi-step, code, AI feedback, vector embeddings' },
                            { model: 'FollowUpQuestion', desc: 'Progressive difficulty with hints' },
                            { model: 'ClarityRating', desc: 'Peer 1-5 ratings on explanations' },
                            { model: 'SimSession', desc: 'Timer-based practice with scoring' },
                            { model: 'QuizAttempt', desc: 'AI-generated with grading + analysis' },
                            { model: 'InterviewSession', desc: 'Phases, workspace, debrief, scores' },
                            { model: 'InterviewMessage', desc: 'Transcript with tool calls' },
                            { model: 'PlatformAnalysis', desc: 'Persistent AI health reports' },
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
                                <span className="text-[10px] text-text-tertiary">{m.desc}</span>
                            </motion.div>
                        ))}
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="API Surface — Versioned REST + WebSocket" icon="🔌">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[
                            { route: '/api/v1/auth', desc: 'Register, login, verify, reset, onboarding' },
                            { route: '/api/v1/problems', desc: '6-category CRUD with filtering' },
                            { route: '/api/v1/solutions', desc: 'Submit, review, rate, spaced repetition' },
                            { route: '/api/v1/quizzes', desc: 'AI generation, grading, analysis' },
                            { route: '/api/v1/interview-v2', desc: 'Mock interview: start, end, history' },
                            { route: '/api/v1/ai', desc: 'Review (RAG), content gen, hints, coaching' },
                            { route: '/api/v1/stats', desc: 'Personal 6D, leaderboard, platform' },
                            { route: '/api/v1/platform', desc: 'SuperAdmin health + AI analysis' },
                            { route: '/api/v1/teams', desc: 'Create, join, manage, approve' },
                            { route: '/api/v1/users', desc: 'Profiles, role management' },
                            { route: '/ws/interview', desc: 'Real-time AI interviewer streaming', ws: true },
                        ].map((api, i) => (
                            <motion.div
                                key={api.route}
                                initial={{ opacity: 0, y: 4 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.03 }}
                                className={cn(
                                    'flex items-center gap-3 px-3 py-2 rounded-xl border',
                                    api.ws ? 'bg-brand-400/5 border-brand-400/20' : 'bg-surface-2 border-border-subtle'
                                )}
                            >
                                <code className={cn(
                                    'text-[10px] font-mono font-bold w-40 flex-shrink-0',
                                    api.ws ? 'text-brand-300' : 'text-success'
                                )}>{api.route}</code>
                                <span className="text-[10px] text-text-tertiary">{api.desc}</span>
                            </motion.div>
                        ))}
                    </div>
                </CollapsibleSection>
            </div>
        </Section>
    )
}