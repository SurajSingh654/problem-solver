import { motion } from 'framer-motion'
import { cn } from '@utils/cn'
import { Section, SectionBadge, SectionTitle, SectionDesc, Check, Cross } from './components'

const COMPARISON_ROWS = [
    ['Team collaboration — see teammates\' solutions', true, false, false, false, false],
    ['6 interview categories (Coding + SD + Behavioral + HR + SQL + CS)', true, false, false, false, false],
    ['AI Mock Interviewer (GPT-4o, real-time, WebSocket)', true, false, false, false, true],
    ['8 interview culture styles (Algorithm, Startup, Values...)', true, false, false, false, false],
    ['RAG-enhanced AI solution review', true, false, false, false, false],
    ['AI quiz on ANY subject (not pre-built)', true, false, false, false, false],
    ['6D intelligence report with radar chart', true, false, false, false, false],
    ['Spaced repetition review queue', true, false, false, false, false],
    ['Vector embeddings for semantic search (pgvector)', true, false, false, false, false],
    ['Interview simulation with AI hints', true, 'Paid', false, false, true],
    ['AI weekly coaching plans', true, false, false, false, false],
    ['Smart recommendations (5 strategies)', true, false, false, false, false],
    ['Email verification + self-service password reset', true, true, false, true, false],
    ['AI product health analytics for admin', true, false, false, false, false],
    ['Interview history with transcript replay', true, false, false, false, true],
    ['Self-hosted / your data stays on your infra', true, false, false, false, false],
    ['Free for teams (self-hosted, open)', true, false, true, false, false],
]

const DIFFERENTIATORS = [
    {
        icon: '💬',
        title: 'AI Mock Interviewer',
        desc: 'The only platform with a real-time GPT-4o conversational interviewer that adapts to 8 different interview cultures, uses function calling to access your profile and team data, streams responses via WebSocket, and generates structured hire/no-hire debriefs with dimension scores.',
    },
    {
        icon: '🔍',
        title: 'RAG Intelligence Pipeline',
        desc: 'Not GPT wrapper calls. Every AI review searches pgvector for semantically similar teammate solutions, fetches admin teaching notes, and injects this context into the prompt. Result: specific, comparative feedback referencing your team — not generic advice.',
    },
    {
        icon: '🕸',
        title: '6D Readiness Measurement',
        desc: 'The only platform that measures interview readiness across 6 computed dimensions using real signals from solving behavior. No arbitrary points. No gaming. Each dimension has a specific computation formula verified against actual usage data.',
    },
    {
        icon: '🏢',
        title: 'Full Interview Loop Coverage',
        desc: 'Coding + System Design + Behavioral + HR + SQL + CS Fundamentals — each with tailored submission forms, category-specific AI review prompts, and dedicated follow-up questions. No other platform covers all 6 interview types.',
    },
]

export default function Section8Competitive() {
    return (
        <Section id="competitive" className="py-20 px-8 bg-surface-0">
            <div className="max-w-[1000px] mx-auto">
                <SectionBadge label="Competitive Analysis" color="danger" />

                <SectionTitle
                    line1="What makes ProbSolver"
                    line2="different from everything else."
                    gradient="from-danger to-warning"
                />

                <SectionDesc>
                    We're not competing with LeetCode on problem count. We're building the
                    intelligence layer that makes interview practice actually effective —
                    with AI that coaches, a team that collaborates, and data that measures readiness.
                </SectionDesc>

                {/* Comparison table */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden mb-8"
                >
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[750px]">
                            <thead>
                                <tr className="border-b border-border-default">
                                    {['Feature', 'ProbSolver', 'LeetCode', 'NeetCode', 'AlgoExpert', 'Pramp'].map(h => (
                                        <th key={h} className={cn(
                                            'py-3 px-4 text-left text-[10px] font-bold uppercase tracking-widest',
                                            h === 'ProbSolver'
                                                ? 'text-brand-300 bg-brand-400/5'
                                                : 'text-text-disabled'
                                        )}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle">
                                {COMPARISON_ROWS.map((row, i) => (
                                    <tr key={i} className="hover:bg-surface-2/50 transition-colors">
                                        <td className="py-2.5 px-4 text-xs font-medium text-text-secondary">
                                            {row[0]}
                                        </td>
                                        {row.slice(1).map((cell, j) => (
                                            <td key={j} className={cn(
                                                'py-2.5 px-4 text-center',
                                                j === 0 && 'bg-brand-400/3'
                                            )}>
                                                {cell === true ? <Check /> :
                                                    cell === false ? <Cross /> :
                                                        <span className="text-xs text-text-tertiary">{cell}</span>}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </motion.div>

                {/* Key differentiators */}
                <motion.h3
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2"
                >
                    <span>⚡</span> Key Differentiators
                </motion.h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {DIFFERENTIATORS.map((diff, i) => (
                        <motion.div
                            key={diff.title}
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.08 }}
                            className="bg-surface-1 border border-border-default rounded-2xl p-5"
                        >
                            <span className="text-2xl">{diff.icon}</span>
                            <h4 className="text-sm font-bold text-text-primary mt-3 mb-1.5">{diff.title}</h4>
                            <p className="text-xs text-text-tertiary leading-relaxed">{diff.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </Section>
    )
}