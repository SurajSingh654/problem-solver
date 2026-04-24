import { motion } from 'framer-motion'
import { cn } from '@utils/cn'
import { Section, SectionBadge, SectionTitle, SectionDesc, AIFeatureItem } from './components'

export default function Section3AI({ stats }) {
    return (
        <Section id="ai" className="py-20 px-8 bg-surface-0">
            <div className="max-w-[1000px] mx-auto">
                <SectionBadge label="AI Intelligence" color="brand" />
                <SectionTitle
                    line1="AI that knows your team,"
                    line2="not just generates text."
                    gradient="from-brand-300 to-warning"
                />
                <SectionDesc>
                    Every AI feature uses a 4-layer intelligence pipeline: vector embeddings
                    capture meaning, RAG retrieves context from your team's knowledge, function
                    calling accesses live platform data, and structured validation ensures
                    consistent outputs. The result: AI feedback that's specific to YOU.
                </SectionDesc>

                {/* The 4 layers — visual */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-12">
                    {[
                        {
                            num: '01',
                            title: 'Embeddings',
                            desc: 'Every solution converted to 1536-dimension vectors. Meaning is captured, not just keywords.',
                            icon: '📐',
                            color: 'border-brand-400/25 bg-brand-400/5',
                        },
                        {
                            num: '02',
                            title: 'RAG Retrieval',
                            desc: 'Before any AI call, we search for teammate solutions, admin notes, and problem context.',
                            icon: '🔍',
                            color: 'border-success/25 bg-success/5',
                        },
                        {
                            num: '03',
                            title: 'Function Calling',
                            desc: 'AI autonomously looks up your profile, searches teammates, saves notes, and manages time.',
                            icon: '🔧',
                            color: 'border-warning/25 bg-warning/5',
                        },
                        {
                            num: '04',
                            title: 'Validation',
                            desc: 'Every response validated against schemas. No broken outputs, no parsing errors. Consistent every time.',
                            icon: '✅',
                            color: 'border-info/25 bg-info/5',
                        },
                    ].map((layer, i) => (
                        <motion.div
                            key={layer.num}
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.08 }}
                            className={cn('rounded-2xl border p-5', layer.color)}
                        >
                            <span className="text-2xl">{layer.icon}</span>
                            <div className="flex items-center gap-2 mt-3 mb-2">
                                <span className="text-[10px] font-extrabold font-mono text-text-disabled">
                                    {layer.num}
                                </span>
                                <h4 className="text-sm font-bold text-text-primary">{layer.title}</h4>
                            </div>
                            <p className="text-xs text-text-tertiary leading-relaxed">{layer.desc}</p>
                        </motion.div>
                    ))}
                </div>

                {/* RAG Before vs After — the killer demo */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-surface-1 border border-border-default rounded-2xl p-6 mb-10"
                >
                    <h3 className="text-sm font-bold text-text-primary mb-2 flex items-center gap-2">
                        <span>🔍</span> See the Difference — Generic AI vs ProbSolver AI
                    </h3>
                    <p className="text-xs text-text-tertiary mb-5">
                        The same solution reviewed by a generic AI vs our RAG-enhanced pipeline.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-danger/5 border border-danger/15 rounded-xl p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-sm">❌</span>
                                <span className="text-xs font-bold text-danger">Generic AI</span>
                            </div>
                            <p className="text-sm text-text-tertiary leading-relaxed italic">
                                "Your approach is reasonable. Consider optimizing the time complexity.
                                The code is clean but could be improved. Think about edge cases."
                            </p>
                            <p className="text-[10px] text-text-disabled mt-3 border-t border-danger/10 pt-3">
                                Vague. Could apply to literally any solution. Zero team context.
                            </p>
                        </div>
                        <div className="bg-success/5 border border-success/15 rounded-xl p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-sm">✅</span>
                                <span className="text-xs font-bold text-success">ProbSolver AI (RAG)</span>
                            </div>
                            <p className="text-sm text-text-tertiary leading-relaxed italic">
                                "Your O(n²) nested loop works but your teammate Alex solved this in O(n) using
                                a HashMap. The admin notes say the key insight is 'trading space for time.'
                                Your Feynman explanation is strong but missing the real-world connection
                                that 2 other teammates mentioned."
                            </p>
                            <p className="text-[10px] text-text-disabled mt-3 border-t border-success/10 pt-3">
                                Specific. Comparative. Names teammates. Checks admin expectations.
                            </p>
                        </div>
                    </div>
                </motion.div>

                {/* All 8 AI features */}
                <motion.h3
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2"
                >
                    <span>🤖</span> 8 AI Features — All Live in Production
                </motion.h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                    <AIFeatureItem icon="💬" name="AI Mock Interviewer" desc="GPT-4o real-time conversation with 8 styles, function calling, WebSocket streaming, structured debrief" status="Live" delay={0} />
                    <AIFeatureItem icon="🤖" name="RAG Solution Review" desc="Vector search finds teammate solutions + admin notes → specific, comparative feedback" status="Live" delay={0.04} />
                    <AIFeatureItem icon="🧩" name="AI Quiz Generation" desc="Type any subject → instant MCQ with explanations and post-quiz weak area analysis" status="Live" delay={0.08} />
                    <AIFeatureItem icon="📅" name="AI Weekly Coach" desc="Personalized 7-day study plan from your 6D scores, quiz history, and target company" status="Live" delay={0.12} />
                    <AIFeatureItem icon="📋" name="AI Content Generator" desc="Enter a problem title → AI fills context, use cases, teaching notes, and follow-ups" status="Live" delay={0.16} />
                    <AIFeatureItem icon="💡" name="Progressive AI Hints" desc="3-level adaptive hints during simulations based on time and problem pattern" status="Live" delay={0.20} />
                    <AIFeatureItem icon="🎯" name="Smart Recommendations" desc="5 strategies: company-targeted, pattern gaps, low confidence, vector similarity, category balance" status="Live" delay={0.24} />
                    <AIFeatureItem icon="🩺" name="Platform Health AI" desc="Analyzes all platform metrics → generates insights, trends, risks, and actionable recommendations" status="Live" delay={0.28} />
                </div>

                {/* AI Live Metrics */}
                {stats?.aiEnabled && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="bg-brand-400/5 border border-brand-400/20 rounded-2xl p-6"
                    >
                        <h3 className="text-xs font-bold text-brand-300 uppercase tracking-widest mb-4">
                            AI Activity — Live
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {[
                                { icon: '🤖', value: stats.aiReviewCount || 0, label: 'AI Reviews' },
                                { icon: '🧩', value: stats.totalQuizzes || 0, label: 'AI Quizzes' },
                                { icon: '💬', value: stats.totalSims || 0, label: 'Mock Interviews' },
                                { icon: '📐', value: stats.embeddingCount || stats.problemEmbeddings || 0, label: 'Embeddings' },
                            ].map((s, i) => (
                                <div key={s.label} className="text-center">
                                    <span className="text-xl">{s.icon}</span>
                                    <div className="text-xl font-extrabold font-mono text-brand-300 mt-1">
                                        {s.value}
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