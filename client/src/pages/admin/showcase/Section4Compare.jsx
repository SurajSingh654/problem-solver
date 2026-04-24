import { motion } from 'framer-motion'
import { cn } from '@utils/cn'
import { Section, SectionBadge, SectionTitle, SectionDesc, Check, Cross } from './components'

const COMPARISON_ROWS = [
    ['6 interview categories (Coding + SD + Behavioral + HR + SQL + CS)', true, false, false, false],
    ['AI Mock Interviewer (GPT-4o, real-time, 8 styles)', true, false, false, false],
    ['RAG-enhanced AI reviews (compares with teammates)', true, false, false, false],
    ['AI quiz on ANY subject (not pre-built)', true, false, false, false],
    ['6D intelligence report with radar chart', true, false, false, false],
    ['Spaced repetition review queue', true, false, false, false],
    ['Team collaboration — see teammate solutions', true, false, false, false],
    ['Vector embeddings for semantic search', true, false, false, false],
    ['AI weekly coaching plans', true, false, false, false],
    ['Interview history with transcript replay', true, false, false, true],
    ['Self-hosted / your data stays private', true, false, false, false],
]

const DIFFERENTIATORS = [
    {
        icon: '💬',
        title: 'Real AI Interviewer, Not a Chatbot',
        desc: 'GPT-4o with WebSocket streaming, 8 company culture styles, 6 autonomous tools, phase management, and structured hire/no-hire debrief. It evaluates — never teaches.',
    },
    {
        icon: '🔍',
        title: 'AI That Knows Your Team',
        desc: 'Every review searches pgvector for similar teammate solutions, fetches admin teaching notes, and gives specific comparative feedback — not generic "consider optimizing."',
    },
    {
        icon: '📊',
        title: 'Measure Real Readiness',
        desc: '6 dimensions computed from actual solving behavior. No arbitrary points, no gaming. Pattern Recognition, Solution Depth, Communication, Optimization, Pressure, Retention.',
    },
    {
        icon: '🎯',
        title: 'Every Round, One Platform',
        desc: 'Coding + System Design + Behavioral + HR + SQL + CS Fundamentals. Each with tailored forms, category-specific AI prompts, and dedicated follow-ups. No other tool covers all 6.',
    },
]

export default function Section4Compare() {
    return (
        <Section id="compare" className="py-20 px-8">
            <div className="max-w-[1000px] mx-auto">
                <SectionBadge label="Why ProbSolver" color="danger" />
                <SectionTitle
                    line1="Not another LeetCode clone."
                    line2="A completely different approach."
                    gradient="from-danger to-warning"
                />
                <SectionDesc>
                    We're not competing on problem count. We're building the intelligence
                    layer that makes practice actually effective — with AI that coaches,
                    teammates that collaborate, and data that measures readiness.
                </SectionDesc>

                {/* Key differentiators — big cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
                    {DIFFERENTIATORS.map((diff, i) => (
                        <motion.div
                            key={diff.title}
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.08 }}
                            className="bg-surface-1 border border-border-default rounded-2xl p-6
                             hover:border-brand-400/20 transition-colors"
                        >
                            <span className="text-3xl">{diff.icon}</span>
                            <h4 className="text-base font-extrabold text-text-primary mt-3 mb-2">
                                {diff.title}
                            </h4>
                            <p className="text-sm text-text-tertiary leading-relaxed">{diff.desc}</p>
                        </motion.div>
                    ))}
                </div>

                {/* Comparison table — compact */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden"
                >
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[600px]">
                            <thead>
                                <tr className="border-b border-border-default">
                                    {['Feature', 'ProbSolver', 'LeetCode', 'NeetCode', 'Pramp'].map(h => (
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
            </div>
        </Section>
    )
}