import { motion } from 'framer-motion'
import { cn } from '@utils/cn'
import { Section, SectionBadge, SectionTitle, SectionDesc, Check, Cross } from './components'

const COMPARISON_ROWS = [
    ['Covers all 6 interview rounds (Coding + SD + Behavioral + HR + SQL + CS)', true, false, false, false, false],
    ['AI Mock Interviewer with real-time conversation', true, false, false, false, 'Basic'],
    ['8 interview culture styles (Google, Amazon, Startup, Trading...)', true, false, false, false, false],
    ['AI that compares your work with teammates (RAG)', true, false, false, false, false],
    ['6-dimension readiness measurement', true, false, false, false, false],
    ['Spaced repetition review queue', true, false, false, false, false],
    ['AI quiz on ANY subject instantly', true, false, false, false, false],
    ['Team collaboration + peer ratings', true, false, false, false, false],
    ['AI weekly coaching plan personalized to your gaps', true, false, false, false, false],
    ['Behavioral + HR round preparation', true, false, false, 'Partial', false],
    ['Self-hosted — your data stays private', true, false, false, false, false],
]

const DIFFERENTIATORS = [
    {
        icon: '🎯',
        title: 'Complete Interview Preparation',
        desc: 'Coding, System Design, Behavioral, HR, SQL, CS Fundamentals — each with tailored submission forms, category-specific AI coaching, and progressive follow-ups. One platform for every round you\'ll face.',
    },
    {
        icon: '💬',
        title: 'AI That Interviews You Like a Real Person',
        desc: 'GPT-4o powered mock interviews with 8 company culture styles, real-time WebSocket streaming, autonomous tool use, and structured hire/no-hire debriefs. Practice the conversation, not just the code.',
    },
    {
        icon: '🧠',
        title: 'Intelligence, Not Just Practice',
        desc: '6 dimensions of readiness computed from your actual behavior — Pattern Recognition, Solution Depth, Communication, Optimization, Pressure Performance, Knowledge Retention. Know exactly where you stand.',
    },
    {
        icon: '👥',
        title: 'Team Learning Multiplier',
        desc: 'See how teammates approach the same problem. AI reviews compare your work with theirs. Rate each other\'s explanations. The team gets smarter together — something you can\'t get practicing alone.',
    },
]

export default function Section4Compare() {
    return (
        <Section id="compare" className="py-20 px-8">
            <div className="max-w-[1000px] mx-auto">
                <SectionBadge label="Why ProbSolver" color="danger" />
                <SectionTitle
                    line1="Everything else is incomplete."
                    line2="ProbSolver covers it all."
                    gradient="from-danger to-warning"
                />
                <SectionDesc>
                    Most tools focus on one piece — coding problems OR mock interviews OR
                    study materials. ProbSolver is the only platform that covers every
                    interview round, measures readiness across 6 dimensions, and uses AI
                    that actually knows your strengths and gaps.
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
            </div>
        </Section>
    )
}