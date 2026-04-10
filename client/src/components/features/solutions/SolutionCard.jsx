import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Avatar } from '@components/ui/Avatar'
import { Badge } from '@components/ui/Badge'
import { Button } from '@components/ui/Button'
import { cn } from '@utils/cn'
import { formatRelativeDate, formatDuration } from '@utils/formatters'
import {
    LANGUAGE_LABELS, CONFIDENCE_LEVELS,
    DIFFICULTY_COLORS,
} from '@utils/constants'

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
                        <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                stroke="#22c55e" strokeWidth="2.5"
                                strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span className="text-success">Copied!</span>
                        </>
                    ) : (
                        <>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            Copy
                        </>
                    )}
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
function SectionRow({ label, value, mono = false }) {
    if (!value) return null
    return (
        <div>
            <p className="text-[11px] font-bold text-text-disabled uppercase
                    tracking-widest mb-1">
                {label}
            </p>
            <p className={cn(
                'text-sm text-text-secondary leading-relaxed',
                mono && 'font-mono text-xs bg-surface-3 px-2 py-1 rounded-lg inline-block'
            )}>
                {value}
            </p>
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
    const [tab, setTab] = useState('approach') // 'approach' | 'code' | 'depth'


    if (!solution) return null

    const {
        user, solvedAt, language, code,
        patternIdentified, firstInstinct, whyThisPattern,
        bruteForceApproach, bruteForceTime, bruteForceSpace,
        optimizedApproach, optimizedTime, optimizedSpace,
        keyInsight, feynmanExplanation, realWorldConnection,
        followUpAnswers, confidenceLevel,
        stuckPoints, hintsUsed,
        isInterviewMode, timeUsedSecs,
        clarityRatings,
    } = solution

    const avgClarity = clarityRatings?.length
        ? (clarityRatings.reduce((s, r) => s + r.score, 0) / clarityRatings.length).toFixed(1)
        : null

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
                    name={user?.username || '?'}
                    color={user?.avatarColor || '#7c6ff7'}
                    size="sm"
                />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-text-primary">
                            {user?.username || 'Unknown'}
                        </span>
                        {isOwn && (
                            <span className="text-[10px] font-bold px-1.5 py-px rounded-full
                               bg-brand-400/15 text-brand-300 border border-brand-400/25">
                                You
                            </span>
                        )}
                        {isInterviewMode && (
                            <span className="text-[10px] font-bold px-1.5 py-px rounded-full
                               bg-warning/12 text-warning border border-warning/25">
                                ⏱ Interview mode
                            </span>
                        )}
                        <Badge variant="gray" size="xs">
                            {LANGUAGE_LABELS[language] || language}
                        </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-xs text-text-tertiary">
                            {formatRelativeDate(solvedAt)}
                        </span>
                        {timeUsedSecs && (
                            <span className="text-xs text-text-tertiary">
                                ⏱ {formatDuration(timeUsedSecs)}
                            </span>
                        )}
                        {avgClarity && (
                            <span className="text-xs text-text-tertiary">
                                ⭐ {avgClarity} clarity
                            </span>
                        )}
                        {hintsUsed && (
                            <span className="text-xs text-text-tertiary">💡 Used hints</span>
                        )}
                    </div>
                </div>
                {/* Confidence */}
                <div className="hidden sm:block flex-shrink-0">
                    <ConfidenceDisplay level={confidenceLevel} />
                </div>
                {/* Expand chevron */}
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
                            {/* Tabs */}
                            <div className="flex gap-1 p-3 border-b border-border-default bg-surface-1/50">
                                {tabs.map(t => (
                                    <button
                                        key={t.id}
                                        onClick={() => setTab(t.id)}
                                        className={cn(
                                            'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                                            tab === t.id
                                                ? 'bg-brand-400/15 text-brand-300 border border-brand-400/25'
                                                : 'text-text-tertiary hover:text-text-primary hover:bg-surface-3'
                                        )}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>

                            {/* Tab content */}
                            <div className="p-4 space-y-4">
                                {tab === 'approach' && (
                                    <>
                                        <SectionRow label="Pattern Identified" value={patternIdentified} />
                                        <SectionRow label="First Instinct" value={firstInstinct} />
                                        <SectionRow label="Why This Pattern" value={whyThisPattern} />
                                        {bruteForceApproach && (
                                            <div className="border border-border-subtle rounded-xl p-3 space-y-2">
                                                <p className="text-[11px] font-bold text-text-disabled uppercase tracking-widest">
                                                    Brute Force
                                                </p>
                                                <p className="text-sm text-text-secondary">{bruteForceApproach}</p>
                                                <div className="flex gap-3">
                                                    {bruteForceTime && <Badge variant="gray" size="xs">⏱ {bruteForceTime}</Badge>}
                                                    {bruteForceSpace && <Badge variant="gray" size="xs">💾 {bruteForceSpace}</Badge>}
                                                </div>
                                            </div>
                                        )}
                                        {optimizedApproach && (
                                            <div className="border border-brand-400/20 rounded-xl p-3 space-y-2 bg-brand-400/3">
                                                <p className="text-[11px] font-bold text-brand-300 uppercase tracking-widest">
                                                    Optimized
                                                </p>
                                                <p className="text-sm text-text-secondary">{optimizedApproach}</p>
                                                <div className="flex gap-3">
                                                    {optimizedTime && <Badge variant="brand" size="xs">⏱ {optimizedTime}</Badge>}
                                                    {optimizedSpace && <Badge variant="brand" size="xs">💾 {optimizedSpace}</Badge>}
                                                </div>
                                            </div>
                                        )}
                                        {stuckPoints && (
                                            <SectionRow label="Where I got stuck" value={stuckPoints} />
                                        )}
                                    </>
                                )}

                                {tab === 'code' && code && (
                                    <CodeBlock code={code} language={language} />
                                )}

                                {tab === 'depth' && (
                                    <>
                                        <SectionRow label="Key Insight" value={keyInsight} />
                                        <SectionRow label="Feynman Explanation" value={feynmanExplanation} />
                                        <SectionRow label="Real World Connection" value={realWorldConnection} />
                                        {/* Follow-up answers */}
                                        {followUpAnswers?.length > 0 &&
                                            problemFollowUps?.length > 0 && (
                                                <div className="space-y-3">
                                                    <p className="text-[11px] font-bold text-text-disabled
                                        uppercase tracking-widest">
                                                        Follow-up Answers
                                                    </p>
                                                    {problemFollowUps.map((fq, i) => {
                                                        const ans = followUpAnswers[i]
                                                        if (!ans) return null
                                                        return (
                                                            <div key={fq.id}
                                                                className="bg-surface-3 rounded-xl p-3 space-y-1">
                                                                <p className="text-xs font-semibold text-text-secondary">
                                                                    {fq.question}
                                                                </p>
                                                                <p className="text-sm text-text-primary">{ans}</p>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
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