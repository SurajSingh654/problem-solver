// ============================================================================
// ProbSolver v3.0 — Problem Detail Page
// ============================================================================
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useProblem } from '@hooks/useProblems'
import { useProblemSolutions } from '@hooks/useSolutions'
import useAuthStore from '@store/useAuthStore'
import { SolutionCard } from '@components/features/solutions/SolutionCard'
import { Badge } from '@components/ui/Badge'
import { Button } from '@components/ui/Button'
import { PageSpinner } from '@components/ui/Spinner'
import { EmptyState } from '@components/ui/EmptyState'
import { AIReviewCard } from '@components/features/ai/AIReviewCard'
import { MarkdownRenderer } from '@components/ui/MarkdownRenderer'
import { useAIStatus } from '@hooks/useAI'
import { cn } from '@utils/cn'
import { formatShortDate } from '@utils/formatters'
import { PROBLEM_CATEGORIES, HR_STAKES, HR_QUESTION_CATEGORIES, HR_QUESTION_CATEGORY_MAP } from '@utils/constants'

const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }

// ── Category icon helper ───────────────────────────────
function getCategoryIcon(category) {
    const icons = {
        SYSTEM_DESIGN: '🏗️',
        LOW_LEVEL_DESIGN: '🔧',
        BEHAVIORAL: '🗣️',
        CS_FUNDAMENTALS: '🧠',
        HR: '🤝',
        SQL: '🗃️',
        CODING: '💻',
    }
    return icons[category] || '📋'
}

// ── Category-specific submit button label ──────────────
function getSubmitLabel(category) {
    const labels = {
        SYSTEM_DESIGN: 'Submit My Design',
        LOW_LEVEL_DESIGN: 'Submit My Design',
        BEHAVIORAL: 'Submit My Response',
        CS_FUNDAMENTALS: 'Submit My Explanation',
        HR: 'Submit My Answer',
        SQL: 'Submit My Query',
    }
    return labels[category] || 'Submit Solution'
}

function InfoChip({ label, value, color }) {
    return (
        <div className="flex flex-col items-center justify-center
                        bg-surface-2 border border-border-default
                        rounded-xl px-4 py-3 min-w-[80px]">
            <span className={cn('text-lg font-extrabold', color)}>{value}</span>
            <span className="text-[10px] text-text-disabled uppercase tracking-wider mt-0.5">
                {label}
            </span>
        </div>
    )
}

function getPlatformSearchUrl(source, title) {
    if (!title) return null
    const encoded = encodeURIComponent(title)
    const searchUrls = {
        LEETCODE: `https://leetcode.com/problemset/?search=${encoded}`,
        GFG: `https://www.geeksforgeeks.org/explore?searchQuery=${encoded}`,
        HACKERRANK: `https://www.hackerrank.com/domains/algorithms?filters%5Bsubdomains%5D%5B%5D=arrays&searchQuery=${encoded}`,
        INTERVIEWBIT: `https://www.interviewbit.com/search/?query=${encoded}`,
        CODECHEF: `https://www.codechef.com/problems/school?search=${encoded}`,
    }
    return searchUrls[source] || null
}

// ── HR Question Category Badge ─────────────────────────
// Displays which category of HR question this is.
// Reads from categoryData.hrQuestionCategory stored by admin.
function HRCategoryBadge({ categoryId }) {
    const cat = HR_QUESTION_CATEGORY_MAP[categoryId]
    if (!cat) return null
    return (
        <span className={cn(
            'text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1',
            cat.bg
        )}>
            <span>{cat.icon}</span>
            <span className={cat.color}>{cat.label}</span>
        </span>
    )
}

// ── HR Stakes Badge ────────────────────────────────────
// Replaces the Easy/Medium/Hard difficulty badge for HR questions.
// Common / Tricky / Sensitive based on HR_STAKES map.
function HRStakesBadge({ difficulty }) {
    const stakes = HR_STAKES[difficulty]
    if (!stakes) return null
    return (
        <span className={cn(
            'text-xs font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1',
            stakes.bg
        )}>
            <span>{stakes.icon}</span>
            <span className={stakes.color}>{stakes.label}</span>
        </span>
    )
}

// ── HR Real Concern Panel ──────────────────────────────
// Shows what the interviewer is really assessing for this question.
// Unlike SD/LLD where we lock hints, for HR this is visible upfront —
// knowing the real concern is prerequisite to answering well.
// Research: you cannot write a strong HR answer without understanding
// the underlying interviewer concern.
function HRRealConcernPanel({ categoryId, description }) {
    const cat = HR_QUESTION_CATEGORY_MAP[categoryId]

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 }}
            className="bg-danger/5 border border-danger/15 rounded-2xl p-5 mb-6"
        >
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-3">
                <span>🔍</span> What the Interviewer Is Really Checking
            </h2>

            {/* The real concern from the category config */}
            {cat && (
                <div className="bg-surface-1 border border-border-default rounded-xl p-3.5 mb-3">
                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                        Underlying Concern
                    </p>
                    <p className="text-sm text-text-primary font-semibold leading-relaxed">
                        "{cat.realConcern}"
                    </p>
                </div>
            )}

            {/* The question itself (description from admin) */}
            {description && (
                <div className="mb-3">
                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-2">
                        Context & Guidance
                    </p>
                    <MarkdownRenderer content={description} />
                </div>
            )}

            {/* Example questions from this category */}
            {cat && cat.examples?.length > 0 && (
                <div>
                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-2">
                        Other Questions in This Category
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {cat.examples.slice(0, 4).map((ex, i) => (
                            <span key={i}
                                className="text-[11px] text-text-tertiary bg-surface-2
                                           border border-border-default rounded-lg px-2.5 py-1">
                                {ex}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </motion.div>
    )
}


// ── Behavioral Competency Panel ────────────────────────
// Visible to members BEFORE submission — upfront coaching panel.
//
// Research basis: identical reasoning to HRRealConcernPanel.
// You cannot structure a strong STAR answer without knowing which
// competency is being probed. This is not a hint about the answer —
// it is the prerequisite frame for the answer. Locking it would be
// pedagogically wrong and would actively harm preparation quality.
//
// What this shows:
//   1. The competency being tested (if admin tagged it in categoryData)
//   2. The real interviewer concern behind the question
//   3. What a strong vs weak STAR answer looks like for this competency
//   4. The failure mode most candidates fall into for this question type
//
// What this does NOT show:
//   - The answer itself
//   - Admin teaching notes (those unlock after submission)
//   - Model STAR stories (those are in admin notes, locked)
function BehavioralCompetencyPanel({ competencyTag, description }) {
    // Competency metadata — maps admin-tagged competencies to coaching context.
    // Covers all major STAR competency categories used across FAANG/tier-1 interviews.
    const COMPETENCY_COACHING = {
        'Leadership': {
            realConcern: 'Can this person influence direction, align people, and drive outcomes without formal authority? Do they lead or follow when things get hard?',
            strongSignals: 'Specific decision they made, who they influenced and how, measurable team outcome, honest acknowledgment of what they traded away',
            weakSignals: '"We worked together as a team", vague outcomes, no personal decision point named',
            watchOut: 'Candidates confuse participation with leadership. The interviewer wants to see a moment where YOU decided something difficult.',
        },
        'Conflict Resolution': {
            realConcern: 'Do they escalate, avoid, or genuinely resolve? Can they hold a professional relationship through disagreement? Do they take any accountability?',
            strongSignals: 'Named the specific disagreement, described their own de-escalation steps, showed empathy and persistence, reached a real resolution',
            weakSignals: 'Blamed the other person, vague "we talked it out", no resolution reached, or "I just agreed to end the conflict"',
            watchOut: 'A conflict story where you were 100% right and the other person was 100% wrong is a red flag. Interviewers hear it as low self-awareness.',
        },
        'Failure & Learning': {
            realConcern: 'Are they honest about real failures? Do they have genuine self-awareness? Is their growth real or performed? Will they repeat the same mistake?',
            strongSignals: 'Named a real failure (not a disguised success), owned their specific contribution to it, articulated concrete behavioral change since',
            weakSignals: '"My team failed but I tried hard", "I worked on a difficult project that had some challenges", changing the subject to a success story',
            watchOut: 'The most common failure here is the non-failure failure. "I worked too hard" or "I cared too much" immediately signals low self-awareness to experienced interviewers.',
        },
        'Initiative & Ownership': {
            realConcern: 'Do they wait to be told or do they act? When something falls through the cracks, does this person pick it up or step over it?',
            strongSignals: 'Named the gap they identified without being asked, described the action they took before getting permission, showed the outcome',
            weakSignals: '"My manager asked me to take on more responsibility", "I volunteered when asked", no indication they identified the problem themselves',
            watchOut: 'True ownership stories have one key element: the candidate saw a problem that was not their assigned responsibility and acted anyway. If they were assigned the task, it\'s not an ownership story.',
        },
        'Teamwork': {
            realConcern: 'Can they actually work in a team without drama? Do they make the people around them better, or do they just do their own work?',
            strongSignals: 'Named what they specifically contributed (not "we"), described how they helped a teammate or unblocked someone, showed outcome for the whole team',
            weakSignals: '"We all worked hard together", no individual contribution named, or the story is actually about their personal achievement',
            watchOut: 'Teamwork answers frequently drift into "and I did great work" stories. The interviewer wants to see how you elevated others, not just yourself.',
        },
        'Handling Ambiguity': {
            realConcern: 'Can this person make progress without a complete picture? Do they ask the right clarifying questions or do they wait for certainty that never comes?',
            strongSignals: 'Named specific ambiguities, showed their process for deciding what to clarify vs what to assume, demonstrated they shipped something despite incomplete information',
            weakSignals: 'Either "I just started working" (no process) or "I asked for all the requirements before starting" (no tolerance for ambiguity)',
            watchOut: 'Strong answers show judgment: which ambiguities matter enough to resolve, and which can be assumed away. Candidates who resolved everything or assumed everything both fail this.',
        },
        'Technical Disagreement': {
            realConcern: 'Can they push back on technical decisions they disagree with, maintain relationships while doing it, and know when to commit even if overruled?',
            strongSignals: 'Named the specific technical disagreement, showed their reasoning process, described how they communicated it, showed the outcome (agreement or principled commit)',
            weakSignals: '"I just went along with it", "I was right and convinced everyone", no description of how they handled being overruled',
            watchOut: 'This question tests disagree-and-commit specifically. An answer where you always won or always gave in both score poorly. Interviewers want to see you push back firmly AND commit professionally.',
        },
        'Customer Focus': {
            realConcern: 'Do they start from customer/user needs or from technical solutions? Can they hold user impact in mind while making technical trade-offs?',
            strongSignals: 'Named a specific user or user segment, showed how user feedback or data influenced a technical decision, quantified user impact',
            weakSignals: '"We built a great product", no specific user interaction named, outcome described only in technical terms',
            watchOut: 'Engineers frequently describe this from a builder perspective ("we shipped this feature") rather than a user perspective ("here\'s how this changed what users could do"). Interviewers at product-centric companies weight the distinction heavily.',
        },
    }

    const coaching = competencyTag ? COMPETENCY_COACHING[competencyTag] : null

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 }}
            className="bg-success/5 border border-success/15 rounded-2xl p-5 mb-6"
        >
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-3">
                <span>🎯</span> Competency Being Tested
            </h2>

            {/* The tagged competency */}
            {competencyTag && (
                <div className="bg-surface-1 border border-border-default rounded-xl p-3.5 mb-3">
                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                        Competency
                    </p>
                    <p className="text-base font-extrabold text-success">{competencyTag}</p>
                </div>
            )}

            {/* Real concern */}
            {coaching && (
                <>
                    <div className="bg-surface-1 border border-border-default rounded-xl p-3.5 mb-3">
                        <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                            What the interviewer is really asking
                        </p>
                        <p className="text-sm text-text-primary font-semibold leading-relaxed">
                            "{coaching.realConcern}"
                        </p>
                    </div>

                    {/* Strong vs weak signals — compact two-column */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div className="bg-success/5 border border-success/15 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-success uppercase tracking-widest mb-1.5">
                                ✓ Strong answer signals
                            </p>
                            <p className="text-[11px] text-text-tertiary leading-relaxed">
                                {coaching.strongSignals}
                            </p>
                        </div>
                        <div className="bg-danger/5 border border-danger/15 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-danger uppercase tracking-widest mb-1.5">
                                ✗ Weak answer signals
                            </p>
                            <p className="text-[11px] text-text-tertiary leading-relaxed">
                                {coaching.weakSignals}
                            </p>
                        </div>
                    </div>

                    {/* The specific failure mode */}
                    <div className="bg-warning/5 border border-warning/15 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-warning uppercase tracking-widest mb-1">
                            ⚠️ Most common failure mode
                        </p>
                        <p className="text-[11px] text-text-tertiary leading-relaxed">
                            {coaching.watchOut}
                        </p>
                    </div>
                </>
            )}

            {/* Description from admin — shown if present */}
            {description && (
                <div className="mt-3 pt-3 border-t border-border-subtle">
                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-2">
                        Context & Guidance
                    </p>
                    <MarkdownRenderer content={description} />
                </div>
            )}

            {/* If no competency tagged — show generic STAR framework reminder */}
            {!competencyTag && !coaching && (
                <div className="space-y-2">
                    {[
                        { label: 'S — Situation', desc: 'Set specific context. Name the project, team size, stakes, and timeline.', color: 'text-brand-300' },
                        { label: 'T — Task', desc: 'What were YOU specifically responsible for? Not the team — you.', color: 'text-info' },
                        { label: 'A — Action', desc: 'What did YOU do, step by step? Use "I" not "we". This is the core.', color: 'text-warning' },
                        { label: 'R — Result', desc: 'What was the quantified outcome? Even rough numbers beat no numbers.', color: 'text-success' },
                    ].map(item => (
                        <div key={item.label}
                            className="flex items-start gap-3 bg-surface-1 border border-border-default
                                       rounded-xl p-3">
                            <span className={cn('text-xs font-extrabold w-24 flex-shrink-0 mt-0.5', item.color)}>
                                {item.label}
                            </span>
                            <p className="text-[11px] text-text-tertiary leading-relaxed">{item.desc}</p>
                        </div>
                    ))}
                </div>
            )}
        </motion.div>
    )
}


// ── Technical Knowledge Subject Panel ────────────────────
// Visible to members BEFORE submission — upfront framing panel.
//
// Research basis: identical to BehavioralCompetencyPanel and HRRealConcernPanel.
// Candidates who know HOW an interviewer evaluates TK questions answer at
// a fundamentally different depth than those who don't.
// The three evaluation dimensions (Mechanism / Trade-offs / Real-world) are
// not hints — they are the evaluation criteria. Hiding them would make
// candidates study the wrong thing.
//
// What this shows:
//   1. The subject domain with relevant sub-topics to study
//   2. The three evaluation dimensions with what "strong" looks like for each
//   3. The most common failure mode for this domain
//   4. Depth calibration — what level of depth is expected for this concept
//
// What this does NOT show:
//   - The answer itself
//   - Admin teaching notes (locked until submission)
//   - Model explanations (locked)
function TechnicalKnowledgeSubjectPanel({ subjectTag, description }) {
    // Domain metadata — maps tagged domains to interview coaching context.
    // Each entry covers: what interviewers actually test, strong vs weak signals,
    // the specific failure mode most candidates exhibit, and depth calibration.
    const DOMAIN_COACHING = {
        'Operating Systems': {
            icon: '🖥️',
            probeTopics: 'Process vs thread lifecycle, virtual memory + page table mechanics, deadlock conditions (Coffman), CPU scheduling trade-offs, concurrency primitives and when each is correct',
            strongSignal: 'Explains the mechanism (how the OS actually implements it), connects to production impact (e.g., page fault latency killing Redis p99), knows when to use which primitive and why',
            weakSignal: '"A process is a program in execution" — definition without mechanism. "Mutex is used for mutual exclusion" — definition without trade-off or comparison to semaphore.',
            failureMode: 'Most candidates know OS concepts as definitions. The interviewer probes for mechanism: "How does the OS actually perform a context switch?" If you can\'t answer that, the definition was memorization, not understanding.',
            depthCalibration: 'Junior: know what it is and basic use case. Mid-level: know the mechanism and one key trade-off. Senior: know the mechanism, all relevant trade-offs, production failure modes, and when the abstraction breaks.',
        },
        'Computer Networking': {
            icon: '🌐',
            probeTopics: 'TCP handshake + connection lifecycle, HTTP version differences and why each change was made, DNS full resolution chain, TLS handshake mechanism, load balancing algorithms and their trade-offs',
            strongSignal: 'Can walk through the TCP 3-way handshake with sequence numbers, explain why TIME_WAIT exists and what happens without it, explain what changes between HTTP/1.1 and HTTP/2 and why (head-of-line blocking)',
            weakSignal: '"TCP is reliable and UDP is not." — stopping at the marketing description. "HTTPS is secure" — without explaining TLS negotiation.',
            failureMode: 'Candidates learn the conceptual model but not the protocol state machine. "What is in the TCP header and why?" trips up 80% of candidates who can describe TCP in words.',
            depthCalibration: 'Junior: know the protocols and their primary use cases. Mid-level: know the mechanisms and failure modes. Senior: know why the protocols were designed this way, what trade-offs they encode, and when to break the rules (e.g., building your own reliability layer on UDP for gaming).',
        },
        'Database Internals': {
            icon: '🗄️',
            probeTopics: 'ACID properties (what each means in practice, not just the acronym), transaction isolation levels and what anomalies each prevents, B-Tree index mechanics and write overhead, CAP theorem (with correct definition of C), sharding challenges',
            strongSignal: 'Can explain the difference between ACID Consistency and CAP Consistency (different things, commonly confused), explain what a B-Tree split is and why it causes write amplification, explain phantom reads and which isolation level prevents them',
            weakSignal: '"ACID means the database is reliable" — the acronym without the mechanism. "CAP says you can only have two of three" — without being able to define what C, A, and P actually mean precisely.',
            failureMode: 'The ACID/CAP Consistency confusion. In CAP, Consistency means linearizability (all nodes see the same data simultaneously). In ACID, Consistency means the database satisfies defined constraints. These are completely different. Conflating them produces wrong architecture decisions.',
            depthCalibration: 'Junior: know ACID and when to use SQL vs NoSQL. Mid-level: know isolation levels, indexing trade-offs, basic sharding concepts. Senior: know when CAP applies, understand MVCC, can design a schema for a given access pattern and justify index choices.',
        },
        'DSA Concepts': {
            icon: '🧩',
            probeTopics: 'Why HashMap is O(1) amortized not O(1) worst case, consistent hashing and why it solves rebalancing, bloom filter use cases despite false positives, LRU cache data structure internals, why B-Tree beats BST for disk storage',
            strongSignal: 'Can explain that HashMap O(1) amortized comes from occasional O(n) rehashing, why the amortized analysis still holds, what load factor is and how it affects performance. Can explain why B-Tree nodes are sized to fit a disk page.',
            weakSignal: '"HashMap is O(1)" — without the amortized qualifier or understanding of when it breaks. "Consistent hashing distributes load evenly" — without explaining the problem with regular hashing it solves (full reshuffling on node add/remove).',
            failureMode: 'Treating these as implementation problems. "How would you implement an LRU cache?" gets solved in code. The TK question is "what data structures does an LRU cache require and why?" — HashMap + doubly linked list, and WHY each is needed.',
            depthCalibration: 'The conceptual depth question is always one level deeper than the implementation. If you can implement it, the interviewer will ask why the data structure works that way.',
        },
        'Distributed Systems': {
            icon: '🔄',
            probeTopics: 'Consistency models (strong, eventual, causal — with examples), consensus problem and why it\'s hard, idempotency and how to achieve it, rate limiting algorithm trade-offs (token bucket vs leaky bucket), message queue delivery guarantees',
            strongSignal: 'Can explain why you\'d choose eventual consistency over strong consistency for a shopping cart but not for a bank transfer. Can explain what makes exactly-once delivery hard (2PC problem). Can design an idempotent API endpoint.',
            weakSignal: '"Distributed systems are eventually consistent" — without knowing when that\'s acceptable and when it\'s not. "Use a message queue for async processing" — without understanding at-least-once vs exactly-once implications.',
            failureMode: 'Candidates understand the happy path but not the failure path. "What happens when a node goes down during a 2PC commit?" is where most distributed systems knowledge breaks. Study failure modes as much as normal operation.',
            depthCalibration: 'Junior: understand why distributed systems are different from single-machine systems. Mid-level: know the trade-offs and when to apply each pattern. Senior: can reason about partial failures, understand the FLP impossibility result conceptually, can design systems that degrade gracefully.',
        },
        'AI/ML': {
            icon: '🤖',
            probeTopics: 'Gradient descent and why learning rate matters, overfitting vs underfitting and how to detect/fix each, bias-variance trade-off, what a transformer does differently from an RNN, vector embeddings and why similarity search works',
            strongSignal: 'Can explain gradient descent as optimization on the loss surface, why a learning rate that is too large oscillates and never converges, what dropout does to prevent overfitting (random deactivation forces redundant representations)',
            weakSignal: '"Machine learning learns from data" — too abstract. "Overfitting means the model memorizes training data" — correct but stops before explaining how to detect or prevent it.',
            failureMode: 'Non-ML engineers often treat AI/ML questions as "not my domain." But any engineer at a company building AI-powered features will be asked these questions. The expected depth is conceptual, not mathematical. You don\'t need to derive backpropagation — you need to explain what it achieves and why it works.',
            depthCalibration: 'For non-ML roles: understand the core concepts well enough to have a conversation about ML system design decisions. For ML-adjacent roles: deeper understanding of model training, evaluation metrics, and deployment considerations.',
        },
        'Data Engineering': {
            icon: '⚡',
            probeTopics: 'Batch vs stream processing trade-offs (latency, complexity, cost), ETL vs ELT (why ELT won with cloud data warehouses), columnar storage mechanics (why Parquet is faster for analytics), Kafka architecture (topics, partitions, consumer groups)',
            strongSignal: 'Can explain why stream processing has lower latency but higher operational complexity. Can explain why a column store is faster for "SELECT AVG(revenue) FROM orders" than a row store (only reads one column vs full rows). Can explain consumer group semantics in Kafka.',
            weakSignal: '"Kafka is a message queue" — undersells it. Kafka is a distributed commit log with replay semantics. "Batch processing processes data in batches" — circular definition.',
            failureMode: 'Candidates conflate data engineering with data science. Data engineering is infrastructure — pipelines, storage, reliability, scale. The questions are engineering trade-off questions, not statistical questions.',
            depthCalibration: 'Backend engineers should understand stream vs batch trade-offs and basic pipeline design. Data engineers need deep understanding of distributed processing, storage formats, and pipeline reliability patterns.',
        },
    }

    // Try to match the subject tag to a domain
    const domainKey = subjectTag
        ? Object.keys(DOMAIN_COACHING).find(key =>
            subjectTag.toLowerCase().includes(key.toLowerCase()) ||
            key.toLowerCase().includes(subjectTag.toLowerCase())
        )
        : null

    const coaching = domainKey ? DOMAIN_COACHING[domainKey] : null

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03 }}
            className="bg-warning/5 border border-warning/15 rounded-2xl p-5 mb-6"
        >
            <h2 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-3">
                <span>🧠</span> Technical Knowledge — Evaluation Framework
            </h2>

            {/* Three evaluation dimensions — always shown */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                {[
                    {
                        icon: '⚙️',
                        label: 'Mechanism Depth',
                        desc: 'Do you know HOW it works, not just WHAT it is? Interviewers probe until you hit your ceiling.',
                        color: 'text-brand-300',
                        bg: 'bg-brand-400/5 border-brand-400/20',
                    },
                    {
                        icon: '⚖️',
                        label: 'Trade-off Awareness',
                        desc: 'Do you know what was sacrificed to get the benefit? Senior candidates explain what they gave up.',
                        color: 'text-danger',
                        bg: 'bg-danger/5 border-danger/20',
                    },
                    {
                        icon: '🌍',
                        label: 'Real-world Anchoring',
                        desc: 'Can you connect it to a specific production system? Generic examples fail, named systems pass.',
                        color: 'text-success',
                        bg: 'bg-success/5 border-success/20',
                    },
                ].map(dim => (
                    <div key={dim.label}
                        className={cn('rounded-xl border p-3', dim.bg)}
                    >
                        <p className={cn(
                            'text-[10px] font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1',
                            dim.color
                        )}>
                            <span>{dim.icon}</span>{dim.label}
                        </p>
                        <p className="text-[11px] text-text-tertiary leading-relaxed">
                            {dim.desc}
                        </p>
                    </div>
                ))}
            </div>

            {/* Domain-specific coaching — shown when admin tagged a subject */}
            {coaching && (
                <>
                    <div className="bg-surface-1 border border-border-default rounded-xl p-3.5 mb-3">
                        <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                            {coaching.icon} Domain: {domainKey}
                        </p>
                        <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1 mt-2">
                            Key topics interviewers probe
                        </p>
                        <p className="text-[11px] text-text-tertiary leading-relaxed">
                            {coaching.probeTopics}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div className="bg-success/5 border border-success/15 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-success uppercase tracking-widest mb-1.5">
                                ✓ Strong answer signals
                            </p>
                            <p className="text-[11px] text-text-tertiary leading-relaxed">
                                {coaching.strongSignal}
                            </p>
                        </div>
                        <div className="bg-danger/5 border border-danger/15 rounded-xl p-3">
                            <p className="text-[10px] font-bold text-danger uppercase tracking-widest mb-1.5">
                                ✗ Weak answer signals
                            </p>
                            <p className="text-[11px] text-text-tertiary leading-relaxed">
                                {coaching.weakSignal}
                            </p>
                        </div>
                    </div>

                    <div className="bg-warning/5 border border-warning/15 rounded-xl p-3 mb-3">
                        <p className="text-[10px] font-bold text-warning uppercase tracking-widest mb-1">
                            ⚠️ Most common failure mode
                        </p>
                        <p className="text-[11px] text-text-tertiary leading-relaxed">
                            {coaching.failureMode}
                        </p>
                    </div>

                    <div className="bg-surface-1 border border-border-default rounded-xl p-3">
                        <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                            📊 Depth calibration by level
                        </p>
                        <p className="text-[11px] text-text-tertiary leading-relaxed">
                            {coaching.depthCalibration}
                        </p>
                    </div>
                </>
            )}

            {/* Description from admin */}
            {description && (
                <div className="mt-3 pt-3 border-t border-border-subtle">
                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-2">
                        Context & Guidance
                    </p>
                    <MarkdownRenderer content={description} />
                </div>
            )}
        </motion.div>
    )
}

export default function ProblemDetailPage() {
    const { problemId } = useParams()
    const navigate = useNavigate()
    const { user } = useAuthStore()
    const isAdmin = user?.globalRole === 'SUPER_ADMIN' || user?.teamRole === 'TEAM_ADMIN'
    const { data: aiStatus } = useAIStatus()
    const aiEnabled = aiStatus?.enabled

    const { data: problem, isLoading, isError } = useProblem(problemId)
    const { data: solutionsData } = useProblemSolutions(problemId)

    if (isLoading) return <PageSpinner />
    if (isError || !problem) {
        return (
            <EmptyState
                icon="😕"
                title="Problem not found"
                description="This problem may have been removed or the link is invalid."
                actionLabel="Back to Problems"
                onAction={() => navigate('/problems')}
            />
        )
    }

    const {
        title, difficulty, category, description, tags, isPinned,
        realWorldContext, useCases, adminNotes, followUpQuestions,
        isSolved, teamSolutionCount, createdBy, createdAt,
    } = problem

    const isSystemDesign = category === 'SYSTEM_DESIGN'
    const isLLD = category === 'LOW_LEVEL_DESIGN'
    const isHR = category === 'HR'
    const isBehavioral = category === 'BEHAVIORAL'
    const isCSFundamentals = category === 'CS_FUNDAMENTALS'
    const isTechnicalKnowledge = category === 'CS_FUNDAMENTALS'



    // HR question category stored by admin in categoryData
    const hrQuestionCategory = problem.categoryData?.hrQuestionCategory || null

    const solutions = solutionsData?.solutions || []
    const mySolution = solutions.find(s => s.userId === user?.id || s.isOwn)
    const otherSolutions = solutions.filter(s => s.userId !== user?.id && !s.isOwn)

    const useCasesList = useCases
        ? (typeof useCases === 'string' ? useCases.split('\n').filter(Boolean) : useCases)
        : []

    // ── Content visibility rules by category ──────────────
    //
    // SYSTEM_DESIGN, LOW_LEVEL_DESIGN:
    //   Real world context locked until submission (gives away the answer).
    //   Admin notes (teaching guide) locked until submission.
    //
    // HR, BEHAVIORAL, CS_FUNDAMENTALS:
    //   Admin notes (model answer, strong/weak examples) locked until submission.
    //   Real world context (if any) visible upfront — it is contextual, not the answer.
    //
    // HR special case:
    //   "What they're really checking" is visible UPFRONT for HR —
    //   this is not giving away the answer, it is giving the question behind the question.
    //   You cannot answer well without knowing the real concern.
    //
    // CODING, SQL:
    //   Everything visible upfront. The problem is a known puzzle — no spoilers.
    //
    const showRealWorldContext = (!isSystemDesign && !isLLD) || isSolved
    const showAdminNotes = isAdmin || (
        (isSystemDesign || isLLD || isHR || isBehavioral || isCSFundamentals) && isSolved
    )

    // For HR: show the real concern panel upfront (always visible to members)
    // For HR teaching notes: only after submission
    const showHRConcernPanel = isHR && !isAdmin

    // For BEHAVIORAL: show the competency coaching panel upfront — same reasoning
    // as HR's HRRealConcernPanel. Knowing the competency is prerequisite to answering.
    const showBehavioralPanel = isBehavioral && !isAdmin

    // For CS_FUNDAMENTALS: show the evaluation framework panel upfront.
    // The three dimensions (Mechanism / Trade-offs / Real-world) are not hints —
    // they are what the interviewer is scoring. Making them visible improves
    // preparation quality and does not give away the answer.
    const showTKPanel = isTechnicalKnowledge && !isAdmin

    return (
        <div className="p-6 max-w-[900px] mx-auto">
            {/* Back button */}
            <button
                onClick={() => navigate('/problems')}
                className="flex items-center gap-1.5 text-sm text-text-tertiary
                           hover:text-text-primary transition-colors mb-6"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                </svg>
                Back to Problems
            </button>

            {/* ── Header card ──────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface-1 border border-border-default rounded-2xl p-6 mb-6"
            >
                {/* Badges row */}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                    {/* HR: show stakes badge instead of difficulty */}
                    {isHR ? (
                        <HRStakesBadge difficulty={difficulty} />
                    ) : (
                        <Badge variant={DIFF_VARIANT[difficulty] || 'brand'} size="sm">
                            {difficulty?.charAt(0) + difficulty?.slice(1).toLowerCase()}
                        </Badge>
                    )}

                    {/* Category badge */}
                    {category && (() => {
                        const cat = PROBLEM_CATEGORIES.find(c => c.id === category)
                        return cat ? (
                            <span className={cn('text-xs font-bold px-2.5 py-0.5 rounded-full border', cat.bg)}>
                                {cat.icon} {cat.label}
                            </span>
                        ) : null
                    })()}

                    {/* HR question category badge */}
                    {isHR && hrQuestionCategory && (
                        <HRCategoryBadge categoryId={hrQuestionCategory} />
                    )}

                    {/* Platform badge — CODING/SQL only */}
                    {problem.categoryData?.platform &&
                        problem.categoryData.platform !== 'OTHER' &&
                        !isSystemDesign && !isLLD && !isHR && !isBehavioral && !isCSFundamentals && (
                            <span className="text-[10px] font-bold text-text-disabled bg-surface-3
                                             border border-border-subtle rounded-full px-2 py-px">
                                {problem.categoryData.platform}
                            </span>
                        )}

                    {isPinned && (
                        <span className="text-xs font-bold text-warning bg-warning/10
                                         border border-warning/25 rounded-full px-2 py-0.5">
                            📌 Pinned
                        </span>
                    )}
                    {isSolved && (
                        <span className="text-xs font-bold text-success bg-success/10
                                         border border-success/25 rounded-full px-2 py-0.5
                                         flex items-center gap-1">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="3"
                                strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Answered
                        </span>
                    )}
                </div>

                {/* Title */}
                <h1 className="text-2xl font-extrabold text-text-primary mb-4 leading-tight">
                    {title}
                </h1>

                {/* External link — CODING/SQL only */}
                {problem.categoryData?.sourceUrl &&
                    !isSystemDesign && !isLLD && !isHR && !isBehavioral && !isCSFundamentals && (
                        <div className="flex items-center gap-2 mb-4 flex-wrap">
                            <a
                                href={problem.categoryData.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl
                                           bg-brand-400/10 border border-brand-400/25
                                           text-sm font-semibold text-brand-300 hover:text-brand-200
                                           hover:bg-brand-400/15 transition-all"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                    <polyline points="15 3 21 3 21 9" />
                                    <line x1="10" y1="14" x2="21" y2="3" />
                                </svg>
                                Solve on {problem.categoryData?.platform && problem.categoryData.platform !== 'OTHER'
                                    ? problem.categoryData.platform.replace('_', ' ')
                                    : 'External Site'}
                            </a>
                            {getPlatformSearchUrl(problem.categoryData?.platform, problem.title) && (
                                <a
                                    href={getPlatformSearchUrl(problem.categoryData?.platform, problem.title)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl
                                               bg-surface-2 border border-border-default
                                               text-xs font-medium text-text-tertiary hover:text-text-primary
                                               hover:border-border-strong transition-all"
                                    title="If the direct link doesn't work, search here"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" strokeWidth="2"
                                        strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="11" cy="11" r="8" />
                                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                    </svg>
                                    Search if link broken
                                </a>
                            )}
                        </div>
                    )}

                {/* Company tags — not shown for HR (irrelevant) */}
                {problem.categoryData?.companyTags?.length > 0 && !isHR && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                        {problem.categoryData.companyTags.map(c => (
                            <span key={c}
                                className="text-[10px] font-semibold text-warning
                                           bg-warning/10 border border-warning/20
                                           rounded-full px-2.5 py-0.5">
                                🏢 {c}
                            </span>
                        ))}
                    </div>
                )}

                {/* Quick stats */}
                <div className="flex items-center gap-3 flex-wrap mb-5">
                    <InfoChip
                        label={isHR ? 'Answers' : 'Solutions'}
                        value={teamSolutionCount || 0}
                        color="text-brand-300"
                    />
                    {followUpQuestions?.length > 0 && (
                        <InfoChip
                            label={isHR ? 'Follow-ups' : 'Follow-ups'}
                            value={followUpQuestions.length}
                            color="text-info"
                        />
                    )}
                    {createdBy && (
                        <div className="flex flex-col justify-center bg-surface-2
                                        border border-border-default rounded-xl px-4 py-3">
                            <span className="text-[10px] text-text-disabled uppercase tracking-wider mb-0.5">
                                Added by
                            </span>
                            <span className="text-sm font-bold text-text-primary">{createdBy.name}</span>
                        </div>
                    )}
                    <div className="flex flex-col justify-center bg-surface-2
                                    border border-border-default rounded-xl px-4 py-3">
                        <span className="text-[10px] text-text-disabled uppercase tracking-wider mb-0.5">
                            Added
                        </span>
                        <span className="text-sm font-bold text-text-primary">
                            {formatShortDate(createdAt)}
                        </span>
                    </div>
                </div>

                {/* Tags — hide for HR (not applicable) */}
                {tags?.length > 0 && !isHR && (
                    <div className="flex flex-wrap gap-2 mb-3">
                        {tags.map(t => (
                            <span key={t}
                                className="text-xs text-text-secondary bg-surface-3
                                           border border-border-subtle rounded-lg px-2.5 py-1">
                                {t}
                            </span>
                        ))}
                    </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-3 mt-5 flex-wrap">
                    {!isSolved ? (
                        <Button
                            variant="primary"
                            size="md"
                            onClick={() => navigate(`/problems/${problemId}/submit`)}
                        >
                            {getSubmitLabel(category)}
                        </Button>
                    ) : (
                        <Button
                            variant="secondary"
                            size="md"
                            onClick={() => navigate(`/problems/${problemId}/edit-solution/${problem.userSolutionId}`)}
                        >
                            {isHR ? 'Edit My Answer' : 'Edit My Solution'}
                        </Button>
                    )}
                    {isAdmin && (
                        <Button
                            variant="ghost"
                            size="md"
                            onClick={() => navigate(`/admin/edit-problem/${problemId}`)}
                        >
                            Edit Problem
                        </Button>
                    )}
                </div>
            </motion.div>

            {/* ── HR: Real Concern Panel (always visible) ───────
                For HR questions, knowing what the interviewer is really
                checking is prerequisite to answering well — not a spoiler.
                This is unique to HR: SD/LLD/BEHAVIORAL lock hints but HR
                coaching requires revealing the underlying concern upfront.
            ─────────────────────────────────────────────────── */}
            {showHRConcernPanel && (
                <HRRealConcernPanel
                    categoryId={hrQuestionCategory}
                    description={description}
                />
            )}

            {showBehavioralPanel && (
                <BehavioralCompetencyPanel
                    competencyTag={problem.categoryData?.competencyTag || null}
                    description={description}
                />
            )}

            {showTKPanel && (
                <TechnicalKnowledgeSubjectPanel
                    subjectTag={problem.categoryData?.subjectTag || problem.categoryData?.competencyTag || null}
                    description={description}
                />
            )}

            {/* ── Problem Description (non-HR categories) ──────
                For SYSTEM_DESIGN and LOW_LEVEL_DESIGN: prominently styled as
                the design brief. For CODING and others: supplementary context.
                For HR: description is shown inside HRRealConcernPanel above.
            ─────────────────────────────────────────────────── */}
            {description && !isHR && !isBehavioral && !isTechnicalKnowledge && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.03 }}
                    className={cn(
                        'border rounded-2xl p-5 mb-6',
                        isSystemDesign
                            ? 'bg-brand-400/5 border-brand-400/25'
                            : isLLD
                                ? 'bg-purple-400/5 border-purple-400/25'
                                : category && category !== 'CODING'
                                    ? 'bg-brand-400/3 border-brand-400/20'
                                    : 'bg-surface-1 border-border-default'
                    )}
                >
                    <h2 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-3">
                        <span>{getCategoryIcon(category)}</span>
                        {isSystemDesign ? 'Design Brief'
                            : isLLD ? 'Design Challenge'
                                : 'Description'}
                    </h2>
                    {(isSystemDesign || isLLD) && (
                        <p className="text-[11px] text-text-tertiary mb-3 flex items-center gap-1.5">
                            <span>💡</span>
                            {isSystemDesign
                                ? 'This is the complete problem. Start by clarifying requirements before designing anything.'
                                : 'Identify the entities and their responsibilities before writing any code.'
                            }
                        </p>
                    )}
                    <MarkdownRenderer content={description} />
                </motion.div>
            )}

            {/* ── Real World Context ─────────────────────────── */}
            {showRealWorldContext && !isHR && (realWorldContext || useCasesList.length > 0) && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6"
                >
                    <h2 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-3">
                        <span>🌍</span>
                        {isSystemDesign ? 'Real World Context — How Others Solved This' : 'Real World Context'}
                    </h2>
                    {isSystemDesign && isSolved && (
                        <p className="text-[11px] text-text-tertiary mb-3 bg-success/5
                                       border border-success/20 rounded-lg px-3 py-2">
                            ✓ You submitted your design. Compare your thinking with how real systems approach this.
                        </p>
                    )}
                    {realWorldContext && (
                        <MarkdownRenderer content={realWorldContext} className="mb-3" />
                    )}
                    {useCasesList.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {useCasesList.map((u, i) => (
                                <span key={i}
                                    className="text-xs bg-surface-3 border border-border-default
                                               rounded-lg px-2.5 py-1 text-text-secondary">
                                    {u}
                                </span>
                            ))}
                        </div>
                    )}
                </motion.div>
            )}

            {/* ── Hints locked notice (SD, LLD) ──────────────── */}
            {(isSystemDesign || isLLD) && !isSolved &&
                (realWorldContext || useCasesList.length > 0 || adminNotes) && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6"
                    >
                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-xl bg-surface-3 border border-border-default
                                            flex items-center justify-center text-lg flex-shrink-0">
                                🔒
                            </div>
                            <div>
                                <p className="text-sm font-bold text-text-primary mb-1">
                                    Real World Context & Teaching Notes
                                </p>
                                <p className="text-xs text-text-tertiary leading-relaxed">
                                    {isSystemDesign
                                        ? 'These unlock after you submit your design. Attempt the design before looking at hints.'
                                        : 'These unlock after you submit your design. The expected class hierarchy, patterns, and SOLID analysis unlock so you can compare your thinking to the model answer.'
                                    }
                                </p>
                                <button
                                    onClick={() => navigate(`/problems/${problemId}/submit`)}
                                    className="mt-3 text-xs font-bold text-brand-300 hover:text-brand-200
                                               transition-colors flex items-center gap-1"
                                >
                                    Submit your design to unlock
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" strokeWidth="2.5"
                                        strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}

            {/* ── Follow-up questions ──────────────────────────── */}
            {followUpQuestions?.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6"
                >
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-bold text-text-primary flex items-center gap-2">
                            <span>{isHR ? '💬' : '🧠'}</span>
                            {isHR
                                ? 'Probing Follow-up Questions'
                                : isSystemDesign
                                    ? 'Design Deep-Dive Questions'
                                    : 'Follow-up Questions'}
                            <Badge variant="brand" size="xs">{followUpQuestions.length}</Badge>
                        </h2>
                        {isSolved && problem.userSolutionId && (
                            <button
                                onClick={() => navigate(`/problems/${problemId}/edit-solution/${problem.userSolutionId}`)}
                                className="text-xs font-semibold text-brand-300 hover:text-brand-200
                                           transition-colors flex items-center gap-1"
                            >
                                Answer these
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="9 18 15 12 9 6" />
                                </svg>
                            </button>
                        )}
                    </div>

                    {/* Category-specific context */}
                    {isHR && (
                        <p className="text-[11px] text-text-tertiary mb-3 leading-relaxed bg-surface-2
                                       border border-border-default rounded-lg px-3 py-2">
                            💡 These are the follow-up questions a real HR interviewer would ask to probe
                            your answer deeper. Preparing specific responses to these is what separates
                            good candidates from great ones.
                        </p>
                    )}
                    {isSystemDesign && (
                        <p className="text-[11px] text-text-tertiary mb-3 leading-relaxed">
                            These are the probing questions a real interviewer would ask after your initial design.
                            Answering them demonstrates depth and earns bonus points on your AI review.
                        </p>
                    )}

                    <div className="space-y-3">
                        {followUpQuestions.map((fq, i) => (
                            <div key={fq.id || i}
                                className="flex gap-3 bg-surface-2 border border-border-subtle
                                           rounded-xl p-3.5">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-surface-3
                                                 border border-border-default flex items-center
                                                 justify-center text-xs font-bold text-text-tertiary">
                                    {i + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-sm font-medium text-text-primary leading-relaxed">
                                            {fq.question}
                                        </p>
                                        {/* HR: don't show Easy/Medium/Hard for follow-ups — show stakes */}
                                        {isHR ? (
                                            <span className={cn(
                                                'text-[9px] font-bold px-1.5 py-px rounded-full border flex-shrink-0',
                                                HR_STAKES[fq.difficulty]?.bg
                                            )}>
                                                <span className={HR_STAKES[fq.difficulty]?.color}>
                                                    {HR_STAKES[fq.difficulty]?.label || fq.difficulty}
                                                </span>
                                            </span>
                                        ) : (
                                            <Badge
                                                variant={DIFF_VARIANT[fq.difficulty] || 'brand'}
                                                size="xs"
                                                className="flex-shrink-0"
                                            >
                                                {fq.difficulty?.charAt(0) + fq.difficulty?.slice(1).toLowerCase()}
                                            </Badge>
                                        )}
                                    </div>
                                    {fq.hint && (
                                        <details className="mt-2">
                                            <summary className="text-xs text-brand-300 cursor-pointer
                                                                hover:text-brand-200 transition-colors w-fit">
                                                💡 Show hint
                                            </summary>
                                            <p className="text-xs text-text-secondary mt-1.5 bg-surface-3
                                                           border border-border-subtle rounded-lg p-2.5">
                                                {fq.hint}
                                            </p>
                                        </details>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {!isSolved && (
                        <p className="text-[11px] text-text-disabled mt-4 pt-3 border-t border-border-subtle">
                            Submit your {isHR ? 'answer' : isSystemDesign ? 'design' : 'solution'} first —
                            you can answer these follow-ups to earn bonus points on your AI review.
                        </p>
                    )}
                </motion.div>
            )}

            {/* ── Admin notes / Teaching notes ──────────────────
                Always visible to admins.
                For SD, LLD, HR, BEHAVIORAL, CS_FUNDAMENTALS:
                  visible to the submitting member after they submit.
                  These are the "model answer" / "what makes a strong answer"
                  notes — most valuable as post-submission comparison.
                For CODING, SQL: admin-only.
            ─────────────────────────────────────────────────── */}
            {showAdminNotes && adminNotes && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className={cn(
                        'border rounded-2xl p-5 mb-6',
                        isAdmin
                            ? 'bg-warning/5 border-warning/20'
                            : isHR
                                ? 'bg-danger/5 border-danger/20'
                                : 'bg-brand-400/5 border-brand-400/20'
                    )}
                >
                    <h2 className={cn(
                        'text-sm font-bold flex items-center gap-2 mb-3',
                        isAdmin ? 'text-warning' : isHR ? 'text-danger' : 'text-brand-300'
                    )}>
                        <span>{isAdmin ? '⚡' : isHR ? '📖' : '📖'}</span>
                        {isAdmin
                            ? 'Admin Notes'
                            : isHR
                                ? 'What Makes a Strong Answer — Compare Yours'
                                : 'Teaching Notes — Compare Your Answer'}
                    </h2>

                    {/* Context for members seeing post-submission notes */}
                    {!isAdmin && isSolved && (
                        <p className="text-xs text-text-tertiary mb-3 leading-relaxed">
                            {isHR
                                ? 'This shows what a strong answer to this question looks like — specific examples, company research, self-awareness signals. Compare it to your submitted answer honestly.'
                                : isLLD
                                    ? 'This shows the expected class hierarchy, design patterns, and SOLID analysis. Compare each section to your submission.'
                                    : isSystemDesign
                                        ? 'This is what an experienced interviewer would expect from a strong answer. Compare each section to your submission.'
                                        : isBehavioral
                                            ? 'This shows what a strong STAR answer looks like for this question. Compare your specificity, impact quantification, and ownership language.'
                                            : isCSFundamentals
                                                ? 'This shows the expected depth of explanation for this concept. Compare your coverage of sub-topics and real-world connections.'
                                                : 'Compare your answer to this teaching guide.'
                            }
                        </p>
                    )}

                    <MarkdownRenderer content={adminNotes} size="sm" />
                </motion.div>
            )}

            {/* ── Locked teaching notes notice (HR/BEHAVIORAL/CS_FUNDAMENTALS) ──
                For these categories, the member does not see admin notes until
                they submit. This notice appears while they are unsolved.
                SD/LLD already have their own locked notice above.
            ─────────────────────────────────────────────────────────────────── */}
            {!isAdmin && !isSolved &&
                (isHR || isBehavioral || isCSFundamentals) &&
                adminNotes && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-surface-1 border border-border-default rounded-2xl p-5 mb-6"
                    >
                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-xl bg-surface-3 border border-border-default
                                            flex items-center justify-center text-lg flex-shrink-0">
                                🔒
                            </div>
                            <div>
                                <p className="text-sm font-bold text-text-primary mb-1">
                                    {isHR
                                        ? 'Unlocks after you submit your answer.'
                                        : isBehavioral
                                            ? 'Unlocks after you submit.'
                                            : isCSFundamentals
                                                ? 'Unlocks after you submit. Compare your mechanism depth, trade-off awareness, and real-world connections to what interviewers expect at each level.'
                                                : 'Unlocks after you submit.'
                                    }
                                </p>
                                <p className="text-xs text-text-tertiary leading-relaxed">
                                    {isHR
                                        ? 'Unlocks after you submit your answer. Compare what you wrote to what makes a genuinely strong response — specificity, company research, self-awareness.'
                                        : isBehavioral
                                            ? 'Unlocks after you submit. Compare your STAR structure, ownership language, and impact quantification to the model answer.'
                                            : 'Unlocks after you submit. Compare your explanation depth and real-world connections to what interviewers expect.'
                                    }
                                </p>
                                <button
                                    onClick={() => navigate(`/problems/${problemId}/submit`)}
                                    className="mt-3 text-xs font-bold text-brand-300 hover:text-brand-200
                                               transition-colors flex items-center gap-1"
                                >
                                    Submit your {isHR ? 'answer' : 'response'} to unlock
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                        stroke="currentColor" strokeWidth="2.5"
                                        strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}

            {/* ── Solutions / Answers section ─────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                        <span>👥</span>
                        {isHR
                            ? 'Team Answers'
                            : isSystemDesign
                                ? 'Team Designs'
                                : isLLD
                                    ? 'Team Designs'
                                    : 'Team Solutions'}
                        <Badge variant="brand" size="xs">{teamSolutionCount || 0}</Badge>
                    </h2>
                </div>

                {solutions.length === 0 ? (
                    <div className="bg-surface-1 border border-border-default
                                    rounded-2xl p-10 text-center">
                        <div className="text-3xl mb-3">🌱</div>
                        <p className="text-sm font-semibold text-text-primary mb-1">
                            {isHR ? 'No answers yet' : isSystemDesign || isLLD ? 'No designs yet' : 'No solutions yet'}
                        </p>
                        <p className="text-xs text-text-tertiary mb-4">
                            {isHR
                                ? 'Be the first to submit an answer — see how teammates approach this question!'
                                : isSystemDesign
                                    ? 'Be the first to submit a design!'
                                    : 'Be the first to submit a solution!'}
                        </p>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => navigate(`/problems/${problemId}/submit`)}
                        >
                            {getSubmitLabel(category)}
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {mySolution && (
                            <div>
                                <p className="text-xs font-bold text-text-disabled uppercase
                                               tracking-widest mb-2">
                                    {isHR ? 'Your Answer' : isSystemDesign ? 'Your Design' : 'Your Solution'}
                                </p>
                                <SolutionCard
                                    solution={mySolution}
                                    isOwn
                                    problemFollowUps={followUpQuestions}
                                />
                                {aiEnabled && (
                                    <div className="mt-3">
                                        <AIReviewCard
                                            solutionId={mySolution.id}
                                            existingReview={mySolution.aiFeedback}
                                            problemFollowUps={followUpQuestions}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {otherSolutions.length > 0 && (
                            <div>
                                {mySolution && (
                                    <p className="text-xs font-bold text-text-disabled uppercase
                                                   tracking-widest mb-2 mt-4">
                                        {isHR ? 'Teammates\' Answers' : isSystemDesign ? 'Teammates\' Designs' : 'Teammates'}
                                    </p>
                                )}
                                <div className="space-y-3">
                                    {otherSolutions.map(s => (
                                        <SolutionCard
                                            key={s.id}
                                            solution={s}
                                            problemFollowUps={followUpQuestions}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </motion.div>
        </div>
    )
}