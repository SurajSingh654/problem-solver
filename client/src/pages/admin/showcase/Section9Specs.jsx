import { motion } from 'framer-motion'
import { cn } from '@utils/cn'
import { Section, SectionBadge, SectionTitle, SpecItem, AnimatedNumber } from './components'

export default function Section9Specs({ stats }) {
    return (
        <Section id="specs" className="py-20 px-8">
            <div className="max-w-[1000px] mx-auto">
                <SectionBadge label="Technical Specifications" color="info" />

                <SectionTitle
                    line1="Built to"
                    line2="enterprise standards."
                    gradient="from-info to-brand-300"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
                    {/* Non-functional requirements */}
                    <motion.div
                        initial={{ opacity: 0, x: -12 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-5"
                    >
                        <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                            <span>📋</span> Security & Authentication
                        </h3>
                        <div className="space-y-3">
                            <SpecItem label="JWT Authentication" desc="Stateless tokens with bcrypt password hashing (12 rounds), role-based access control (Admin/Member)" dotColor="bg-info" />
                            <SpecItem label="Email Verification" desc="6-digit codes via Resend with 15-minute expiry, forced verification before platform access" dotColor="bg-info" />
                            <SpecItem label="Password Security" desc="Self-service reset via email, admin temporary password with forced change, secure email change with verification" dotColor="bg-info" />
                            <SpecItem label="API Security" desc="Helmet.js headers, CORS policy, Zod input validation on every endpoint, structured error responses" dotColor="bg-info" />
                            <SpecItem label="Data Privacy" desc="Self-hosted — data never leaves your infrastructure. No third-party analytics. OpenAI calls are the only external dependency." dotColor="bg-info" />
                            <SpecItem label="Rate Limiting" desc="Per-user daily AI rate limit configurable via environment variable. Prevents abuse and controls costs." dotColor="bg-info" />
                        </div>
                    </motion.div>

                    {/* Performance */}
                    <motion.div
                        initial={{ opacity: 0, x: 12 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-5"
                    >
                        <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                            <span>⚡</span> Performance & Scalability
                        </h3>
                        <div className="space-y-3">
                            <SpecItem label="Database" desc="PostgreSQL with pgvector — scales to millions of embeddings via IVFFlat indexing. Prisma connection pooling." dotColor="bg-success" />
                            <SpecItem label="Real-time" desc="WebSocket server (ws library) with heartbeat, auto-reconnect, JWT authentication on connection" dotColor="bg-success" />
                            <SpecItem label="Frontend Build" desc="Vite 5 code-split: vendor, query, UI, charts, forms, Monaco as separate chunks. Tree-shaking. Asset hashing." dotColor="bg-success" />
                            <SpecItem label="State Management" desc="Server state via TanStack Query (dedup, background refetch, stale-while-revalidate). UI state via Zustand (2KB)." dotColor="bg-success" />
                            <SpecItem label="AI Pipeline" desc="Async embedding generation (non-blocking). Streaming responses. Graceful degradation when AI disabled." dotColor="bg-success" />
                            <SpecItem label="Deployment" desc="Docker containers on Railway. Auto-deploy on git push. node:20-slim with OpenSSL for Prisma compatibility." dotColor="bg-success" />
                        </div>
                    </motion.div>

                    {/* Database */}
                    <motion.div
                        initial={{ opacity: 0, x: -12 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-5"
                    >
                        <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                            <span>🗄️</span> Database — 10 Models
                        </h3>
                        <div className="space-y-2">
                            {[
                                { model: 'User', desc: 'Auth, profile, streak, goals, email verification, roles' },
                                { model: 'Problem', desc: '6 categories, description, categoryData, vector embeddings' },
                                { model: 'Solution', desc: 'Multi-step submission, code, AI feedback, vector embeddings' },
                                { model: 'FollowUpQuestion', desc: 'Per-problem questions with difficulty and hints' },
                                { model: 'ClarityRating', desc: 'Peer 1-5 ratings on explanation quality' },
                                { model: 'SimSession', desc: 'Timer-based practice with scoring' },
                                { model: 'QuizAttempt', desc: 'AI-generated quizzes with graded answers' },
                                { model: 'InterviewSession', desc: 'AI mock interview: phases, workspace, debrief, scores' },
                                { model: 'InterviewMessage', desc: 'Transcript with tool calls, workspace snapshots' },
                                { model: 'pgvector columns', desc: '1536-dim embeddings with IVFFlat cosine indexes' },
                            ].map((m, i) => (
                                <motion.div key={m.model}
                                    initial={{ opacity: 0, y: 4 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.03 }}
                                    className="flex items-center gap-3 px-3 py-2 rounded-xl bg-surface-2 border border-border-subtle"
                                >
                                    <code className="text-[10px] font-mono font-bold text-brand-300 w-36 flex-shrink-0">{m.model}</code>
                                    <span className="text-[10px] text-text-tertiary">{m.desc}</span>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>

                    {/* API Surface */}
                    <motion.div
                        initial={{ opacity: 0, x: 12 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-5"
                    >
                        <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                            <span>🔌</span> API — 12 Route Groups
                        </h3>
                        <div className="space-y-2">
                            {[
                                { route: '/api/auth', desc: 'Register, login, verify, reset, email change, profile' },
                                { route: '/api/problems', desc: '6-category CRUD with filtering and search' },
                                { route: '/api/solutions', desc: 'Submit, update, review, rate, spaced repetition' },
                                { route: '/api/quizzes', desc: 'AI generation, submission, analysis, history' },
                                { route: '/api/sim', desc: 'Timer simulation: start, hint, complete, abandon' },
                                { route: '/api/interview-v2', desc: 'AI mock: start, details, end, debrief, history' },
                                { route: '/api/ai', desc: 'Review (RAG), content gen, hints, weekly plan, embed' },
                                { route: '/api/stats', desc: 'Personal 6D, team, leaderboard, showcase' },
                                { route: '/api/recommendations', desc: 'Smart suggestions with 5 strategies' },
                                { route: '/api/users', desc: 'List, profile, delete, role management' },
                                { route: '/api/admin', desc: 'Product health metrics + AI analysis' },
                                { route: '/ws/interview', desc: 'WebSocket: real-time AI interviewer streaming', ws: true },
                            ].map((api, i) => (
                                <motion.div key={api.route}
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
                    </motion.div>
                </div>

                {/* Live system info */}
                {stats && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-5"
                    >
                        <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                            <span>🖥️</span> Live System Info
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {[
                                { label: 'Node.js', value: stats.nodeVersion || 'v20.x' },
                                { label: 'Uptime', value: stats.uptime ? `${Math.round(stats.uptime / 3600)}h` : '—' },
                                { label: 'AI Models', value: 'GPT-4o + 4o-mini' },
                                { label: 'Embeddings', value: '1536-dim vectors' },
                                { label: 'Database', value: 'PostgreSQL + pgvector' },
                                { label: 'Deployment', value: 'Railway (Docker)' },
                                { label: 'Email Service', value: 'Resend' },
                                { label: 'Real-time', value: 'WebSocket (ws)' },
                            ].map(info => (
                                <div key={info.label} className="bg-surface-2 border border-border-subtle rounded-xl p-3 text-center">
                                    <div className="text-xs font-bold font-mono text-text-primary">{info.value}</div>
                                    <div className="text-[9px] text-text-disabled uppercase tracking-wider mt-0.5">{info.label}</div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </div>
        </Section>
    )
}