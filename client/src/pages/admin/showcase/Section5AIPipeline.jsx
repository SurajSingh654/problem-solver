import { motion } from 'framer-motion'
import { cn } from '@utils/cn'
import {
    Section, SectionBadge, SectionTitle, SectionDesc,
    DiagramBlock, AIFeatureItem, AnimatedNumber
} from './components'

export default function Section5AIPipeline({ stats }) {
    return (
        <Section id="ai-pipeline" className="py-20 px-8 bg-surface-0">
            <div className="max-w-[1000px] mx-auto">
                <SectionBadge label="AI Intelligence Pipeline" color="brand" />

                <SectionTitle
                    line1="AI that understands context,"
                    line2="not just generates text."
                    gradient="from-brand-300 to-warning"
                />

                <SectionDesc>
                    ProbSolver's AI isn't a GPT wrapper. It's a multi-layer intelligence
                    pipeline: vector embeddings capture meaning, RAG retrieves relevant
                    context from your team's knowledge, function calling accesses live
                    platform data, and structured validation ensures consistent outputs.
                    Every AI response is specific to YOU, your team, and your problem.
                </SectionDesc>

                {/* ── The 4 AI Layers ────────────────────────── */}
                <motion.h3
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2"
                >
                    <span>🏗️</span> Four Layers of Intelligence
                </motion.h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
                    {[
                        {
                            layer: 'Layer 1',
                            title: 'Vector Embeddings',
                            icon: '📐',
                            color: 'border-brand-400/25 bg-brand-400/5',
                            desc: 'Every solution and problem is converted into a 1536-dimension vector using OpenAI\'s text-embedding-3-small model. These vectors capture the MEANING of the content — not just keywords.',
                            detail: 'Stored in PostgreSQL pgvector columns with IVFFlat indexing for sub-millisecond cosine similarity search across thousands of items.',
                            tech: 'OpenAI Embeddings API → pgvector → IVFFlat Index',
                        },
                        {
                            layer: 'Layer 2',
                            title: 'RAG — Retrieval Augmented Generation',
                            icon: '🔍',
                            color: 'border-success/25 bg-success/5',
                            desc: 'Before any AI call, we search the database for relevant context: teammate solutions, admin notes, problem metadata, quiz history. This context is injected into the prompt.',
                            detail: 'Result: AI feedback references specific teammates by name, checks your work against the admin\'s expected approach, and identifies patterns across your team.',
                            tech: 'Vector Search → Context Assembly → Prompt Injection',
                        },
                        {
                            layer: 'Layer 3',
                            title: 'Function Calling & Tool Use',
                            icon: '🔧',
                            color: 'border-warning/25 bg-warning/5',
                            desc: 'The AI can autonomously call platform functions during conversations — look up problems, check user profiles, search teammate solutions, save notes, and manage time.',
                            detail: 'In mock interviews, the AI uses 6 tools: getProblemDetails, getCandidateProfile, searchTeammateSolutions, saveInterviewNote, getTimeRemaining, transitionPhase.',
                            tech: 'OpenAI Function Calling → Tool Router → Prisma Queries → Result Injection',
                        },
                        {
                            layer: 'Layer 4',
                            title: 'Structured Output Validation',
                            icon: '✅',
                            color: 'border-info/25 bg-info/5',
                            desc: 'Every AI response is validated against a Zod schema to ensure consistent JSON structure. If the AI returns invalid format, the system retries or returns a structured error.',
                            detail: 'This guarantees the frontend always receives parseable data — no raw text parsing, no broken UIs from unexpected AI outputs.',
                            tech: 'OpenAI JSON Mode → Zod Schema Validation → Typed Response',
                        },
                    ].map((layer, i) => (
                        <motion.div
                            key={layer.layer}
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.08 }}
                            className={cn('rounded-2xl border p-5', layer.color)}
                        >
                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-2xl">{layer.icon}</span>
                                <div>
                                    <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                                        {layer.layer}
                                    </span>
                                    <h4 className="text-sm font-bold text-text-primary">{layer.title}</h4>
                                </div>
                            </div>
                            <p className="text-xs text-text-secondary leading-relaxed mb-2">{layer.desc}</p>
                            <p className="text-xs text-text-tertiary leading-relaxed mb-3">{layer.detail}</p>
                            <div className="bg-surface-0/50 rounded-lg px-3 py-1.5">
                                <code className="text-[10px] font-mono text-brand-300">{layer.tech}</code>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* ── RAG: Before vs After ───────────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-8"
                >
                    <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                        <span>🔍</span> RAG in Action — Before vs After
                    </h3>
                    <p className="text-xs text-text-tertiary leading-relaxed mb-4">
                        The same solution reviewed without RAG context vs with RAG context.
                        The difference is dramatic — generic advice becomes specific, comparative coaching.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-danger/5 border border-danger/15 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm">❌</span>
                                <span className="text-xs font-bold text-danger">Without RAG</span>
                            </div>
                            <p className="text-xs text-text-tertiary leading-relaxed italic">
                                "Your approach is reasonable. Consider optimizing the time complexity.
                                The code is clean but could be improved. Think about edge cases."
                            </p>
                            <p className="text-[10px] text-text-disabled mt-2">
                                Generic. Could apply to any solution. Doesn't reference your team or the problem specifics.
                            </p>
                        </div>
                        <div className="bg-success/5 border border-success/15 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm">✅</span>
                                <span className="text-xs font-bold text-success">With RAG</span>
                            </div>
                            <p className="text-xs text-text-tertiary leading-relaxed italic">
                                "Your O(n²) nested loop works but your teammate Alex solved this in O(n) using
                                a HashMap approach. The admin notes say the key insight is 'trading space for time.'
                                Your Feynman explanation is strong but missing the real-world connection to database indexing
                                that 2 other teammates mentioned."
                            </p>
                            <p className="text-[10px] text-text-disabled mt-2">
                                Specific. Comparative. References teammates by name. Checks against admin expectations.
                            </p>
                        </div>
                    </div>
                </motion.div>

                {/* ── Vector Embeddings Explained ─────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-8"
                >
                    <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                        <span>📐</span> How Vector Embeddings Work
                    </h3>
                    <p className="text-xs text-text-tertiary leading-relaxed mb-4">
                        Text is converted into numbers that capture meaning. Similar concepts get
                        similar numbers — enabling search by meaning, not just keywords.
                    </p>
                    <div className="space-y-2.5 mb-4">
                        {[
                            { text: '"Two Sum using hash map"', vector: '[0.23, -0.45, 0.78, 0.12, ...]', note: 'Hash map pattern' },
                            { text: '"Find pair with target sum via dictionary"', vector: '[0.21, -0.43, 0.76, 0.14, ...]', note: 'Same concept, different words → similar vector' },
                            { text: '"Design Twitter architecture"', vector: '[-0.56, 0.34, -0.12, 0.89, ...]', note: 'Completely different topic → distant vector' },
                        ].map((item, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -8 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.06 }}
                                className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-border-subtle"
                            >
                                <span className="text-xs text-text-secondary flex-1">{item.text}</span>
                                <code className="text-[10px] font-mono text-brand-300 bg-brand-400/10 px-2 py-0.5 rounded flex-shrink-0">
                                    {item.vector}
                                </code>
                            </motion.div>
                        ))}
                    </div>
                    <div className="bg-surface-2 rounded-xl p-3">
                        <p className="text-[10px] text-text-disabled leading-relaxed">
                            <strong className="text-text-tertiary">How we use this:</strong> When reviewing your
                            solution, we search for solutions with similar embeddings — finding approaches that
                            are semantically related even if the words are completely different. This powers
                            smart recommendations, RAG context retrieval, and cross-problem pattern detection.
                        </p>
                    </div>
                </motion.div>

                {/* ── AI Pipeline Diagrams ───────────────────── */}
                <motion.h3
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2"
                >
                    <span>⚙️</span> AI Pipeline — Request Flow
                </motion.h3>

                <DiagramBlock border="border-brand-400/20">
                    {`AI Solution Review Pipeline (RAG-Enhanced)
────────────────────────────────────────────────────────────────────────────

User clicks "AI Review"
  │
  ▼
┌─ Step 1: Vector Search ──────────────────────────────────────────────────┐
│  SELECT * FROM solutions                                                │
│  WHERE embedding <=> target_embedding                                   │
│  ORDER BY distance ASC LIMIT 3                                         │
│  → Returns 3 most similar teammate solutions (cosine similarity)        │
└─────────────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─ Step 2: Context Assembly ───────────────────────────────────────────────┐
│  + Teammate solutions (pattern, approach, complexity, confidence)        │
│  + Admin teaching notes (expected approach, edge cases, key insight)     │
│  + Problem metadata (tags, difficulty, real-world context)               │
│  + User's skill level and solving history                               │
└─────────────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─ Step 3: Prompt Construction ────────────────────────────────────────────┐
│  System Prompt:  Role + category-specific rules + evaluation criteria    │
│  User Context:   Solution approach + code + complexity + explanation     │
│  RAG Context:    Assembled in Step 2 (teammate + admin + metadata)       │
└─────────────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─ Step 4: GPT-4o-mini Call ───────────────────────────────────────────────┐
│  Model: gpt-4o-mini (cost-effective for structured review)              │
│  Mode:  JSON output with response_format: { type: "json_object" }       │
│  Tokens: ~1500 max output                                               │
└─────────────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─ Step 5: Zod Validation ────────────────────────────────────────────────┐
│  Validates: overallScore (1-10), strengths[], gaps[],                    │
│             improvement, interviewTip, complexityCheck                    │
│  If invalid → retry or structured error                                  │
└─────────────────────────────────────────────────────────────────────────┘
  │
  ▼
  Result: Specific, comparative feedback stored on solution`}
                </DiagramBlock>

                <DiagramBlock border="border-warning/20">
                    {`AI Mock Interview Pipeline (WebSocket + Function Calling)
────────────────────────────────────────────────────────────────────────────

Candidate sends message via WebSocket
  │
  ▼
┌─ Step 1: Message Processing ────────────────────────────────────────────┐
│  Store user message in InterviewMessage table                           │
│  Load last 20 messages from conversation history                        │
│  Count total messages → determine conversation stage                    │
│    Messages 1-2: OPENING (introduce, calibrate)                         │
│    Messages 3-6: EARLY (discuss approach)                               │
│    Messages 7-15: MIDDLE (implementation, deep dive)                    │
│    Messages 16-25: LATE (testing, trade-offs)                          │
│    Messages 25+: WRAPPING_UP (summary, final questions)                │
└─────────────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─ Step 2: System Prompt Assembly ────────────────────────────────────────┐
│  Persona: style, focus, behavior rules (from 8 interview styles)        │
│  Problem: title, description, follow-up questions, admin notes          │
│  Phase: current phase instructions + time allocation                    │
│  Stage: conversation-stage-specific behavior guidelines                  │
│  Workspace: candidate's current code/diagram/notes snapshot             │
│  Rules: NEVER teach, NEVER give answers, evaluate + probe + challenge   │
└─────────────────────────────────────────────────────────────────────────┘
  │
  ▼
┌─ Step 3: GPT-4o Streaming Call ─────────────────────────────────────────┐
│  Model: gpt-4o (highest quality for natural conversation)               │
│  Stream: true (token-by-token delivery via WebSocket)                   │
│  Tools: 6 functions available for autonomous calling                     │
│  Temperature: 0.85 (natural variation in responses)                     │
│  Max tokens: 600 (forces concise, interviewer-appropriate responses)    │
└─────────────────────────────────────────────────────────────────────────┘
  │
  ├── If text response → stream tokens via WebSocket → display in chat
  │
  └── If tool call detected:
        │
        ▼
      ┌─ Step 4: Tool Execution ──────────────────────────────────────────┐
      │  getProblemDetails   → Prisma query → problem data               │
      │  getCandidateProfile → Prisma query → user stats + 6D scores     │
      │  searchTeammates     → Prisma query → similar solutions          │
      │  saveInterviewNote   → Create InterviewMessage with observation  │
      │  getTimeRemaining    → Calculate elapsed/remaining/phase         │
      │  transitionPhase     → Record phase change in database           │
      └──────────────────────────────────────────────────────────────────┘
        │
        ▼
      ┌─ Step 5: Follow-up Call ──────────────────────────────────────────┐
      │  Tool results injected → GPT-4o generates response using         │
      │  the tool data → streams final answer via WebSocket              │
      └──────────────────────────────────────────────────────────────────┘`}
                </DiagramBlock>

                {/* ── 6D Intelligence Engine ─────────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-8"
                >
                    <h3 className="text-sm font-bold text-text-primary mb-2 flex items-center gap-2">
                        <span>🕸</span> 6D Intelligence Engine — How Scores Are Computed
                    </h3>
                    <p className="text-xs text-text-tertiary leading-relaxed mb-5">
                        Every dimension is computed from real signals in your solving behavior — not arbitrary
                        points. No gaming possible. The more thoroughly you engage with the platform, the more
                        accurate your scores become.
                    </p>

                    <div className="space-y-4">
                        {[
                            {
                                num: 'D1', name: 'Pattern Recognition', color: '#7c6ff7', score: '(identified/total)×60 + (unique_patterns/16)×40',
                                signals: 'Pattern tagged on solutions, diversity of patterns across problems, speed of identification (timeToPatternSecs)',
                                computation: 'identifiedRate × 60% + patternDiversityRate × 40%',
                            },
                            {
                                num: 'D2', name: 'Solution Depth', color: '#22c55e', score: 'insight×30 + feynman×30 + realWorld×20 + confidence×20',
                                signals: 'Key insight filled, Feynman explanation written, real-world connection made, average confidence level',
                                computation: 'insightRate × 30% + feynmanRate × 30% + realWorldRate × 20% + (avgConfidence/5) × 20%',
                            },
                            {
                                num: 'D3', name: 'Communication', color: '#3b82f6', score: '(avgClarityRating / 5) × 100',
                                signals: 'Peer clarity ratings received from teammates (1-5 stars per solution)',
                                computation: 'Average peer rating normalized to 0-100. Requires at least 1 rating to score.',
                            },
                            {
                                num: 'D4', name: 'Optimization', color: '#eab308', score: 'brute×25 + optimal×40 + complexity×35',
                                signals: 'Brute force approach documented, optimized approach with improvement, both time and space complexity analyzed',
                                computation: 'bruteForceRate × 25% + optimizedRate × 40% + bothComplexityRate × 35%',
                            },
                            {
                                num: 'D5', name: 'Pressure Performance', color: '#ef4444', score: 'simRate×40 + scoreRate×40 + noHint×20',
                                signals: 'Interview simulation sessions completed, average sim score, percentage without hints',
                                computation: 'min(completedSims/5, 1) × 40% + (avgScore/5) × 40% + noHintRate × 20%',
                            },
                            {
                                num: 'D6', name: 'Knowledge Retention', color: '#a855f7', score: 'reviewedRate×50 + confidenceRate×50',
                                signals: 'Spaced repetition reviews completed on time, average confidence during reviews',
                                computation: 'reviewedSolutions/total × 50% + (avgConfidence/5) × 50%',
                            },
                        ].map((dim, i) => (
                            <motion.div
                                key={dim.num}
                                initial={{ opacity: 0, x: -8 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.06 }}
                                className="bg-surface-2 border border-border-subtle rounded-xl p-4"
                            >
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="font-mono font-extrabold text-base" style={{ color: dim.color }}>
                                        {dim.num}
                                    </span>
                                    <h4 className="text-xs font-bold text-text-primary">{dim.name}</h4>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                                            Signals
                                        </p>
                                        <p className="text-[11px] text-text-tertiary leading-relaxed">{dim.signals}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                                            Computation
                                        </p>
                                        <code className="text-[10px] font-mono text-brand-300 leading-relaxed block">
                                            {dim.computation}
                                        </code>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    <div className="mt-4 bg-brand-400/5 border border-brand-400/15 rounded-xl p-3">
                        <p className="text-[10px] text-text-disabled">
                            <strong className="text-text-tertiary">Overall Readiness Score</strong> = average of all 6 dimensions (0-100).
                            Each dimension is independently computed from database signals — no manual scoring, no point systems, no gaming.
                            The more you use the platform, the more accurate your profile becomes.
                        </p>
                    </div>
                </motion.div>

                {/* ── Prompt Engineering ──────────────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-8"
                >
                    <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                        <span>🧪</span> Prompt Engineering — Three-Layer Architecture
                    </h3>
                    <p className="text-xs text-text-tertiary leading-relaxed mb-4">
                        Every AI call uses a structured prompt with three layers.
                        All responses are validated against Zod schemas before reaching the frontend.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                            {
                                layer: 'System Prompt',
                                icon: '🤖',
                                color: 'border-brand-400/25 bg-brand-400/5',
                                desc: 'Defines role, response format, rules, and constraints. Category-aware — coding reviews get different instructions than behavioral reviews. Interview style personas inject company-specific behavior rules.',
                            },
                            {
                                layer: 'User Context',
                                icon: '👤',
                                color: 'border-info/25 bg-info/5',
                                desc: 'The actual content being processed: solution approach, code, complexity analysis, key insight, explanation. For interviews: the candidate\'s message + workspace snapshot + conversation stage.',
                            },
                            {
                                layer: 'RAG Context',
                                icon: '🔍',
                                color: 'border-success/25 bg-success/5',
                                desc: 'Retrieved via pgvector similarity search: teammate solutions, admin teaching notes, problem metadata. For interviews: candidate profile, time remaining, phase instructions. Injected automatically.',
                            },
                        ].map((layer, i) => (
                            <motion.div
                                key={layer.layer}
                                initial={{ opacity: 0, y: 8 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.08 }}
                                className={cn('rounded-xl border p-4', layer.color)}
                            >
                                <div className="text-lg mb-2">{layer.icon}</div>
                                <h4 className="text-xs font-bold text-text-primary mb-1">{layer.layer}</h4>
                                <p className="text-[11px] text-text-tertiary leading-relaxed">{layer.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>

                {/* ── All AI Features Status ─────────────────── */}
                <motion.h3
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2"
                >
                    <span>🤖</span> AI Feature Status — All Live
                </motion.h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <AIFeatureItem icon="💬" name="AI Mock Interviewer" desc="GPT-4o real-time conversation with 8 interview styles, function calling, WebSocket streaming" status="Live" delay={0} />
                    <AIFeatureItem icon="🤖" name="RAG Solution Review" desc="Vector search finds teammate solutions → GPT gives comparative, specific feedback" status="Live" delay={0.04} />
                    <AIFeatureItem icon="🧩" name="AI Quiz Generation" desc="Type any subject → instant MCQ generation with explanations and post-quiz analysis" status="Live" delay={0.08} />
                    <AIFeatureItem icon="📅" name="AI Weekly Coach" desc="Personalized 7-day plan from 6D scores, quiz history, and target company" status="Live" delay={0.12} />
                    <AIFeatureItem icon="📋" name="AI Content Generator" desc="Admin enters problem title → AI fills context, use cases, notes, and follow-ups" status="Live" delay={0.16} />
                    <AIFeatureItem icon="💡" name="Progressive AI Hints" desc="3-level adaptive hints during simulations based on time and problem pattern" status="Live" delay={0.20} />
                    <AIFeatureItem icon="🎯" name="Smart Recommendations" desc="5 strategies: company-targeted, pattern gaps, low confidence, vector similarity, category balance" status="Live" delay={0.24} />
                    <AIFeatureItem icon="🩺" name="Product Health AI" desc="Analyzes platform metrics → generates insights, trends, risks, and recommendations for admin" status="Live" delay={0.28} />
                </div>

                {/* ── AI Metrics (if available) ──────────────── */}
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