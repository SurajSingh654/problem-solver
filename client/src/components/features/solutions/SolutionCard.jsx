// ============================================================================
// ProbSolver v3.0 — Solution Card
// ============================================================================
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Avatar } from '@components/ui/Avatar'
import { Badge } from '@components/ui/Badge'
import { MarkdownRenderer } from '@components/ui/MarkdownRenderer'
import { cn } from '@utils/cn'
import { formatRelativeDate } from '@utils/formatters'
import { LANGUAGE_LABELS, CONFIDENCE_LEVELS } from '@utils/constants'

// ── System Design structured display ──────────────────
// Only renders for solutions with SD-specific categorySpecificData keys.
// LLD and other categories that may eventually use categorySpecificData
// are handled by the generic tabs below.
function SDSolutionDisplay({ data }) {
    const [activeKey, setActiveKey] = useState(() => {
        // Default to first section that has content
        const orderedKeys = [
            'functionalRequirements', 'nonFunctionalRequirements',
            'capacityEstimation', 'apiDesign', 'schemaDesign',
            'architectureNotes', 'tradeoffReasoning', 'failureModes',
        ]
        return orderedKeys.find(k => data[k]?.trim?.()?.length > 0) || 'functionalRequirements'
    })

    const sections = [
        { key: 'functionalRequirements', label: 'Requirements', icon: '📋' },
        { key: 'nonFunctionalRequirements', label: 'NFRs', icon: '⚙️' },
        { key: 'capacityEstimation', label: 'Estimation', icon: '🔢' },
        { key: 'apiDesign', label: 'API', icon: '🔌', isCode: true },
        { key: 'schemaDesign', label: 'Schema', icon: '🗄️', isCode: true },
        { key: 'architectureNotes', label: 'Architecture', icon: '🏗️' },
        { key: 'tradeoffReasoning', label: 'Trade-offs', icon: '⚖️' },
        { key: 'failureModes', label: 'Failures', icon: '🔥' },
    ].filter(s => (data[s.key]?.trim?.()?.length ?? 0) > 0)

    if (sections.length === 0) {
        return (
            <p className="text-xs text-text-disabled italic">
                No design content recorded.
            </p>
        )
    }

    const activeSection = sections.find(s => s.key === activeKey) || sections[0]

    return (
        <div>
            {/* Section tabs */}
            <div className="flex flex-wrap gap-1 mb-4">
                {sections.map(s => (
                    <button
                        key={s.key}
                        onClick={() => setActiveKey(s.key)}
                        className={cn(
                            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg',
                            'text-[10px] font-semibold transition-all border',
                            activeKey === s.key
                                ? 'bg-brand-400/15 text-brand-300 border-brand-400/25'
                                : 'text-text-tertiary hover:text-text-primary hover:bg-surface-3 border-transparent'
                        )}
                    >
                        <span>{s.icon}</span>{s.label}
                    </button>
                ))}
            </div>
            {/* Active section content */}
            {activeSection.isCode ? (
                <pre className="bg-surface-0 border border-border-default rounded-xl p-4
                                text-xs font-mono text-text-secondary whitespace-pre-wrap
                                overflow-x-auto max-h-[400px] leading-relaxed">
                    {data[activeKey]}
                </pre>
            ) : (
                <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                    {data[activeKey]}
                </div>
            )}
        </div>
    )
}

// ── LLD structured display ─────────────────────────────
function LLDSolutionDisplay({ data, code, language }) {
    const [activeKey, setActiveKey] = useState(() => {
        const orderedKeys = ['entities', 'classHierarchy', 'designPattern', 'solidAnalysis', 'extensibilityAnalysis']
        return orderedKeys.find(k => data[k]?.trim?.()?.length > 0) || 'entities'
    })
    const [showCode, setShowCode] = useState(false)

    const sections = [
        { key: 'entities', label: 'Entities', icon: '📦' },
        { key: 'classHierarchy', label: 'Hierarchy', icon: '🗂️', isCode: true },
        { key: 'designPattern', label: 'Patterns', icon: '🧩' },
        { key: 'solidAnalysis', label: 'SOLID', icon: '🏛️' },
        { key: 'extensibilityAnalysis', label: 'Extensibility', icon: '🔬' },
    ].filter(s => (data[s.key]?.trim?.()?.length ?? 0) > 0)

    const hasImplementation = (data.implementationCode?.trim?.()?.length ?? 0) > 0 ||
        (code?.trim?.()?.length ?? 0) > 0
    const implementationCode = data.implementationCode || code

    if (sections.length === 0 && !hasImplementation) {
        return <p className="text-xs text-text-disabled italic">No design content recorded.</p>
    }

    const activeSection = sections.find(s => s.key === activeKey) || sections[0]

    return (
        <div>
            {/* Section tabs + implementation toggle */}
            <div className="flex flex-wrap gap-1 mb-4">
                {sections.map(s => (
                    <button
                        key={s.key}
                        onClick={() => { setActiveKey(s.key); setShowCode(false) }}
                        className={cn(
                            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg',
                            'text-[10px] font-semibold transition-all border',
                            activeKey === s.key && !showCode
                                ? 'bg-purple-400/15 text-purple-400 border-purple-400/25'
                                : 'text-text-tertiary hover:text-text-primary hover:bg-surface-3 border-transparent'
                        )}
                    >
                        <span>{s.icon}</span>{s.label}
                    </button>
                ))}
                {hasImplementation && (
                    <button
                        onClick={() => setShowCode(true)}
                        className={cn(
                            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg',
                            'text-[10px] font-semibold transition-all border',
                            showCode
                                ? 'bg-success/15 text-success border-success/25'
                                : 'text-text-tertiary hover:text-text-primary hover:bg-surface-3 border-transparent'
                        )}
                    >
                        <span>💻</span>Code
                    </button>
                )}
            </div>

            {/* Content */}
            {showCode ? (
                <pre className="bg-surface-0 border border-border-default rounded-xl p-4
                                text-xs font-mono text-text-secondary whitespace-pre-wrap
                                overflow-x-auto max-h-[500px] leading-relaxed">
                    {implementationCode}
                </pre>
            ) : activeSection ? (
                activeSection.isCode ? (
                    <pre className="bg-surface-0 border border-border-default rounded-xl p-4
                                    text-xs font-mono text-text-secondary whitespace-pre-wrap
                                    overflow-x-auto max-h-[400px] leading-relaxed">
                        {data[activeKey]}
                    </pre>
                ) : (
                    <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                        {data[activeKey]}
                    </div>
                )
            ) : null}
        </div>
    )
}

// ── Code block ─────────────────────────────────────────
function CodeBlock({ code, language }) {
    const [copied, setCopied] = useState(false)

    function copy() {
        navigator.clipboard.writeText(code)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="relative rounded-xl overflow-hidden border border-border-default">
            <div className="flex items-center justify-between px-4 py-2
                            bg-surface-3 border-b border-border-default">
                <span className="text-xs font-mono text-text-tertiary">
                    {LANGUAGE_LABELS[language] || language}
                </span>
                <button
                    onClick={copy}
                    className="text-xs text-text-tertiary hover:text-text-primary
                               flex items-center gap-1.5 transition-colors"
                >
                    {copied ? (
                        <span className="text-success">✓ Copied!</span>
                    ) : 'Copy'}
                </button>
            </div>
            <pre className="p-4 text-xs font-mono text-text-secondary overflow-x-auto
                            max-h-[400px] bg-surface-1 leading-relaxed">
                <code>{code}</code>
            </pre>
        </div>
    )
}

// ── Section row ────────────────────────────────────────
function SectionRow({ label, value, mode = 'markdown' }) {
    if (!value) return null
    return (
        <div>
            <p className="text-[11px] font-bold text-text-disabled uppercase tracking-widest mb-1.5">
                {label}
            </p>
            {mode === 'mono' ? (
                <p className="text-sm text-text-secondary font-mono text-xs
                               bg-surface-3 px-2 py-1 rounded-lg inline-block">
                    {value}
                </p>
            ) : mode === 'html' ? (
                <div
                    className="prose-content text-sm"
                    dangerouslySetInnerHTML={{ __html: value }}
                />
            ) : (
                <MarkdownRenderer content={value} size="sm" />
            )}
        </div>
    )
}

// ── Confidence display ─────────────────────────────────
function ConfidenceDisplay({ level }) {
    const conf = CONFIDENCE_LEVELS.find(c => c.value === level)
    if (!conf) return null
    return (
        <div className="flex items-center gap-2">
            <span className="text-lg">{conf.emoji}</span>
            <div>
                <p className={cn('text-xs font-bold', conf.color)}>{conf.label}</p>
                <div className="flex gap-0.5 mt-0.5">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className={cn(
                            'w-4 h-1.5 rounded-full',
                            i <= level ? conf.color.replace('text-', 'bg-') : 'bg-surface-4'
                        )} />
                    ))}
                </div>
            </div>
        </div>
    )
}

// ── Main SolutionCard ──────────────────────────────────
export function SolutionCard({ solution, isOwn = false, problemFollowUps = [] }) {
    const [expanded, setExpanded] = useState(false)
    const [tab, setTab] = useState('approach')

    if (!solution) return null

    const {
        user,
        createdAt,
        language,
        code,
        pattern,
        approach,
        bruteForce,
        optimizedApproach,
        timeComplexity,
        spaceComplexity,
        keyInsight,
        feynmanExplanation,
        realWorldConnection,
        confidence,
        avgClarityRating,
        totalRatings,
    } = solution

    // Determine if this is a System Design submission with structured data.
    // Detected by presence of SD-specific keys in categorySpecificData.
    // This distinguishes SD from LLD or other future categories that may
    // also use categorySpecificData with different field shapes.
    const isSDSubmission = !!(
        solution.categorySpecificData &&
        Object.keys(solution.categorySpecificData).length > 0 &&
        (
            solution.categorySpecificData.functionalRequirements !== undefined ||
            solution.categorySpecificData.apiDesign !== undefined ||
            solution.categorySpecificData.tradeoffReasoning !== undefined
        )
    )

    const isLLDSubmission = !!(
        solution.categorySpecificData &&
        Object.keys(solution.categorySpecificData).length > 0 &&
        (
            solution.categorySpecificData.entities !== undefined ||
            solution.categorySpecificData.solidAnalysis !== undefined ||
            solution.categorySpecificData.designPattern !== undefined
        )
    )

    const tabs = [
        { id: 'approach', label: 'Approach' },
        { id: 'code', label: 'Code', hidden: !code },
        { id: 'depth', label: 'Depth' },
    ].filter(t => !t.hidden)

    return (
        <motion.div
            layout
            className={cn(
                'border rounded-xl overflow-hidden transition-all duration-200',
                isOwn
                    ? 'border-brand-400/30 bg-brand-400/3'
                    : 'border-border-default bg-surface-2'
            )}
        >
            {/* Header */}
            <div
                className="flex items-center gap-3 p-4 cursor-pointer
                           hover:bg-surface-3/50 transition-colors"
                onClick={() => setExpanded(v => !v)}
            >
                <Avatar
                    name={user?.name || '?'}
                    color={user?.avatarUrl || '#7c6ff7'}
                    size="sm"
                />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-text-primary">
                            {user?.name || 'Unknown'}
                        </span>
                        {isOwn && (
                            <span className="text-[10px] font-bold px-1.5 py-px rounded-full
                                             bg-brand-400/15 text-brand-300 border border-brand-400/25">
                                You
                            </span>
                        )}
                        {language && !isSDSubmission && !isLLDSubmission && (
                            <Badge variant="gray" size="xs">
                                {LANGUAGE_LABELS[language] || language}
                            </Badge>
                        )}
                        {isSDSubmission && (
                            <span className="text-[10px] font-bold px-1.5 py-px rounded-full
                     bg-info/10 text-info border border-info/20">
                                System Design
                            </span>
                        )}
                        {isLLDSubmission && (
                            <span className="text-[10px] font-bold px-1.5 py-px rounded-full
                     bg-purple-400/10 text-purple-400 border border-purple-400/20">
                                LLD
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-xs text-text-tertiary">
                            {formatRelativeDate(createdAt)}
                        </span>
                        {avgClarityRating && (
                            <span className="text-xs text-text-tertiary">
                                ⭐ {avgClarityRating} clarity ({totalRatings})
                            </span>
                        )}
                    </div>
                </div>
                <div className="hidden sm:block flex-shrink-0">
                    <ConfidenceDisplay level={confidence} />
                </div>
                <motion.div
                    animate={{ rotate: expanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-text-tertiary flex-shrink-0"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </motion.div>
            </div>

            {/* Expanded content */}
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="border-t border-border-default">
                            {/* Tabs — only for standard coding solutions */}
                            {!isSDSubmission && !isLLDSubmission && (
                                <div className="flex gap-1 p-3 border-b border-border-default bg-surface-1/50">
                                    {tabs.map(t => (
                                        <button key={t.id} onClick={() => setTab(t.id)}
                                            className={cn(
                                                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                                                tab === t.id
                                                    ? 'bg-brand-400/15 text-brand-300 border border-brand-400/25'
                                                    : 'text-text-tertiary hover:text-text-primary hover:bg-surface-3'
                                            )}>
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Content */}
                            <div className="p-4 space-y-4">
                                {isSDSubmission ? (
                                    <SDSolutionDisplay data={solution.categorySpecificData} />
                                ) : isLLDSubmission ? (
                                    <LLDSolutionDisplay
                                        data={solution.categorySpecificData}
                                        code={code}
                                        language={language}
                                    />
                                ) : (
                                    // All other categories: tab-based display
                                    <>
                                        {tab === 'approach' && (
                                            <>
                                                <SectionRow label="Pattern" value={pattern} mode="mono" />
                                                <SectionRow label="Approach" value={approach} mode="markdown" />
                                                {bruteForce && (
                                                    <div className="border border-border-subtle rounded-xl p-3 space-y-2">
                                                        <p className="text-[11px] font-bold text-text-disabled uppercase tracking-widest">
                                                            Brute Force
                                                        </p>
                                                        <MarkdownRenderer content={bruteForce} size="sm" />
                                                    </div>
                                                )}
                                                {optimizedApproach && (
                                                    <div className="border border-brand-400/20 rounded-xl p-3 space-y-2 bg-brand-400/3">
                                                        <p className="text-[11px] font-bold text-brand-300 uppercase tracking-widest">
                                                            Optimized
                                                        </p>
                                                        <MarkdownRenderer content={optimizedApproach} size="sm" />
                                                        <div className="flex gap-3">
                                                            {timeComplexity && (
                                                                <Badge variant="brand" size="xs">⏱ {timeComplexity}</Badge>
                                                            )}
                                                            {spaceComplexity && (
                                                                <Badge variant="brand" size="xs">💾 {spaceComplexity}</Badge>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                        {tab === 'code' && code && (
                                            <CodeBlock code={code} language={language} />
                                        )}
                                        {tab === 'depth' && (
                                            <>
                                                <SectionRow label="Key Insight" value={keyInsight} mode="markdown" />
                                                <SectionRow label="Feynman Explanation" value={feynmanExplanation} mode="html" />
                                                <SectionRow label="Real World Connection" value={realWorldConnection} mode="html" />
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}