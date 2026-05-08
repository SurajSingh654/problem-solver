// ============================================================================
// ProbSolver v3.0 — Design Studio Page (Complete: Design + Validate)
// ============================================================================
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ExcalidrawEditor } from '@components/ui/ExcalidrawEditor'
import { Button } from '@components/ui/Button'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import {
    useDesignSession,
    useDesignSessions,
    useCreateDesignSession,
    useDeleteDesignSession,
    useSavePhase,
    useSaveDiagram,
    useUpdateTiming,
    useAICoach,
    useGenerateScenarios,
    useSubmitScenarioResponse,
    useEvaluateScenario,
    useSaveScaleAnalysis,
    useRequestEvaluation,
    useUpdateSessionStatus,
} from '@hooks/useDesignStudio'
import { toast } from '@store/useUIStore'

// ── Phase definitions ──────────────────────────────────────────────────
const SD_PHASES = [
    { id: 'requirements', label: 'Requirements', icon: '📋', hint: 'What must the system do? What are the scale constraints?' },
    { id: 'capacityEstimation', label: 'Estimation', icon: '🔢', hint: 'Back-of-envelope: QPS, storage, bandwidth' },
    { id: 'apiDesign', label: 'API Design', icon: '🔌', hint: 'Define endpoints, request/response shapes' },
    { id: 'dataModel', label: 'Data Model', icon: '🗄️', hint: 'Tables, relationships, indexes, access patterns' },
    { id: 'architecture', label: 'Architecture', icon: '🏗️', hint: 'Draw components on the canvas above, describe data flow here' },
    { id: 'deepDive', label: 'Deep Dive', icon: '🔬', hint: 'Pick 2-3 components and explain in detail' },
    { id: 'tradeoffs', label: 'Trade-offs', icon: '⚖️', hint: 'Decisions made, costs acknowledged, failure modes' },
]

const LLD_PHASES = [
    { id: 'requirements', label: 'Requirements', icon: '📋', hint: 'What must the system do at object level?' },
    { id: 'entities', label: 'Entities', icon: '📦', hint: 'Identify classes with single responsibilities' },
    { id: 'classHierarchy', label: 'Hierarchy', icon: '🗂️', hint: 'Inheritance vs composition, interfaces' },
    { id: 'designPatterns', label: 'Patterns', icon: '🧩', hint: 'Which patterns and structural justification' },
    { id: 'methodSignatures', label: 'Methods', icon: '💻', hint: 'Key method signatures and algorithms' },
    { id: 'solidAnalysis', label: 'SOLID', icon: '🏛️', hint: 'Per-principle analysis, honest about violations' },
]

function formatTime(seconds) {
    if (!seconds) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
}

// ══════════════════════════════════════════════════════════════════════════
// SESSION LIST VIEW
// ══════════════════════════════════════════════════════════════════════════
function SessionListView({ onSelectSession, onCreateNew }) {
    const { data, isLoading } = useDesignSessions()
    const deleteSession = useDeleteDesignSession()
    const sessions = data?.sessions || []

    const statusConfig = {
        IN_PROGRESS: { label: 'In Progress', color: 'text-brand-300 bg-brand-400/10 border-brand-400/20' },
        VALIDATING: { label: 'Validating', color: 'text-warning bg-warning/10 border-warning/20' },
        COMPLETED: { label: 'Completed', color: 'text-success bg-success/10 border-success/20' },
        ABANDONED: { label: 'Abandoned', color: 'text-text-disabled bg-surface-3 border-border-default' },
    }

    if (isLoading) {
        return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
    }

    return (
        <div className="space-y-4">
            {sessions.length === 0 ? (
                <div className="bg-surface-1 border border-border-default rounded-2xl p-10 text-center">
                    <div className="text-4xl mb-3">🏗️</div>
                    <p className="text-sm font-semibold text-text-primary mb-1">No design sessions yet</p>
                    <p className="text-xs text-text-tertiary mb-4">Start your first design practice session.</p>
                    <Button variant="primary" size="md" onClick={onCreateNew}>Start First Session</Button>
                </div>
            ) : (
                <div className="space-y-3">
                    {sessions.map((session, i) => {
                        const status = statusConfig[session.status] || statusConfig.IN_PROGRESS
                        return (
                            <motion.div
                                key={session.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.04 }}
                                className="bg-surface-1 border border-border-default rounded-xl p-4
                                           hover:border-brand-400/30 transition-all cursor-pointer"
                                onClick={() => onSelectSession(session.id)}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                        <span className="text-xl flex-shrink-0 mt-0.5">
                                            {session.designType === 'SYSTEM_DESIGN' ? '🏗️' : '🔧'}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-text-primary truncate">{session.title}</p>
                                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                <span className={cn('text-[10px] font-bold px-2 py-px rounded-full border', status.color)}>
                                                    {status.label}
                                                </span>
                                                <span className="text-[10px] text-text-disabled">{session.difficulty}</span>
                                                <span className="text-[10px] text-text-disabled">{formatTime(session.totalTimeSpent)} spent</span>
                                                {session.evaluationScore && (
                                                    <span className="text-[10px] font-bold text-brand-300">Score: {session.evaluationScore}/10</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); if (confirm('Delete this session?')) deleteSession.mutate(session.id) }}
                                        className="text-text-disabled hover:text-danger transition-colors p-1 flex-shrink-0"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14H7L5 6" />
                                        </svg>
                                    </button>
                                </div>
                            </motion.div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════════════════
// SESSION CREATION SCREEN
// ══════════════════════════════════════════════════════════════════════════
function CreateSessionScreen({ onCreated, onBack }) {
    const createSession = useCreateDesignSession()
    const [designType, setDesignType] = useState('SYSTEM_DESIGN')
    const [title, setTitle] = useState('')
    const [difficulty, setDifficulty] = useState('MEDIUM')

    async function handleCreate() {
        if (!title.trim()) { toast.error('Enter a title'); return }
        try {
            const res = await createSession.mutateAsync({ designType, title: title.trim(), difficulty })
            onCreated(res.data.data.session.id)
        } catch { /* handled */ }
    }

    return (
        <div className="space-y-6">
            {onBack && (
                <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-primary transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                    Back to sessions
                </button>
            )}
            <div className="bg-surface-1 border border-border-default rounded-2xl p-6 space-y-5">
                <div>
                    <label className="block text-sm font-semibold text-text-primary mb-3">What are you designing?</label>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { id: 'SYSTEM_DESIGN', label: 'System Design', icon: '🏗️', desc: 'Scalable distributed systems' },
                            { id: 'LOW_LEVEL_DESIGN', label: 'Low-Level Design', icon: '🔧', desc: 'OOP, classes, patterns' },
                        ].map(t => (
                            <button key={t.id} type="button" onClick={() => setDesignType(t.id)}
                                className={cn('flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-all',
                                    designType === t.id ? 'bg-brand-400/10 border-brand-400/40 text-brand-300' : 'bg-surface-3 border-border-default hover:border-border-strong text-text-tertiary')}>
                                <span className="text-2xl">{t.icon}</span>
                                <span className="text-xs font-bold">{t.label}</span>
                                <span className="text-[10px] text-text-disabled">{t.desc}</span>
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-semibold text-text-primary mb-1.5">Design Title</label>
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && title.trim()) handleCreate() }}
                        placeholder={designType === 'SYSTEM_DESIGN' ? 'e.g. Design WhatsApp, Design YouTube' : 'e.g. Parking Lot, Chess Game'}
                        className="w-full bg-surface-3 border border-border-strong rounded-xl text-sm text-text-primary placeholder:text-text-tertiary px-3.5 py-2.5 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20" />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-text-primary mb-2">Difficulty</label>
                    <div className="flex gap-2">
                        {['EASY', 'MEDIUM', 'HARD'].map(d => (
                            <button key={d} type="button" onClick={() => setDifficulty(d)}
                                className={cn('flex-1 py-2.5 rounded-xl border text-xs font-bold transition-all',
                                    difficulty === d ? d === 'EASY' ? 'bg-success/12 border-success/30 text-success' : d === 'MEDIUM' ? 'bg-warning/12 border-warning/30 text-warning' : 'bg-danger/12 border-danger/30 text-danger'
                                        : 'bg-surface-3 border-border-default text-text-tertiary hover:border-border-strong')}>{d}</button>
                        ))}
                    </div>
                </div>
                <Button variant="primary" size="lg" fullWidth loading={createSession.isPending} onClick={handleCreate} disabled={!title.trim()}>
                    Start Design Session
                </Button>
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════════════════════════
// COMPONENT ANNOTATIONS PANEL
// ══════════════════════════════════════════════════════════════════════════
function ComponentAnnotationsPanel({ annotations, onChange, isCollapsed, onToggle }) {
    const [newName, setNewName] = useState('')

    function addComponent() {
        if (!newName.trim()) return
        onChange([...(annotations || []), { componentName: newName.trim(), purpose: '', technology: '', notes: '' }])
        setNewName('')
    }
    function updateComponent(i, field, value) {
        const updated = [...(annotations || [])]; updated[i] = { ...updated[i], [field]: value }; onChange(updated)
    }
    function removeComponent(i) { onChange((annotations || []).filter((_, idx) => idx !== i)) }

    return (
        <div className="border-t border-border-default">
            <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-2/50 transition-colors">
                <div className="flex items-center gap-2">
                    <span className="text-sm">🧩</span>
                    <span className="text-xs font-bold text-text-primary">Component Annotations</span>
                    <span className="text-[10px] text-text-disabled">({(annotations || []).length})</span>
                </div>
                <motion.div animate={{ rotate: isCollapsed ? 0 : 180 }} transition={{ duration: 0.2 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                </motion.div>
            </button>
            <AnimatePresence>
                {!isCollapsed && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="px-4 pb-3 space-y-2">
                            <p className="text-[10px] text-text-disabled">Annotate components so AI understands your architecture</p>
                            {(annotations || []).map((comp, i) => (
                                <div key={i} className="bg-surface-2 border border-border-subtle rounded-lg p-2.5 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-text-primary">{comp.componentName}</span>
                                        <button onClick={() => removeComponent(i)} className="text-text-disabled hover:text-danger text-[10px]">✕</button>
                                    </div>
                                    <input type="text" value={comp.purpose} onChange={e => updateComponent(i, 'purpose', e.target.value)} placeholder="Purpose..."
                                        className="w-full bg-surface-3 border border-border-default rounded-lg text-[11px] text-text-primary placeholder:text-text-disabled px-2.5 py-1.5 outline-none focus:border-brand-400/40" />
                                    <div className="flex gap-1.5">
                                        <input type="text" value={comp.technology} onChange={e => updateComponent(i, 'technology', e.target.value)} placeholder="Technology..."
                                            className="flex-1 bg-surface-3 border border-border-default rounded-lg text-[11px] text-text-primary placeholder:text-text-disabled px-2.5 py-1.5 outline-none focus:border-brand-400/40" />
                                        <input type="text" value={comp.notes} onChange={e => updateComponent(i, 'notes', e.target.value)} placeholder="Notes..."
                                            className="flex-1 bg-surface-3 border border-border-default rounded-lg text-[11px] text-text-primary placeholder:text-text-disabled px-2.5 py-1.5 outline-none focus:border-brand-400/40" />
                                    </div>
                                </div>
                            ))}
                            <div className="flex gap-2">
                                <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') addComponent() }} placeholder="Add component..."
                                    className="flex-1 bg-surface-3 border border-border-default rounded-lg text-[11px] text-text-primary placeholder:text-text-disabled px-2.5 py-1.5 outline-none focus:border-brand-400/40" />
                                <button onClick={addComponent} disabled={!newName.trim()}
                                    className="text-[10px] font-bold text-brand-300 px-2.5 py-1.5 bg-brand-400/10 border border-brand-400/20 rounded-lg hover:bg-brand-400/20 transition-colors disabled:opacity-40">+ Add</button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

// ══════════════════════════════════════════════════════════════════════════
// AI COACHING TOOLBAR + RESPONSE
// ══════════════════════════════════════════════════════════════════════════
function AICoachingBar({ sessionId, phaseId, onResponse }) {
    const askCoach = useAICoach()
    const [teachQuery, setTeachQuery] = useState('')
    const [showTeachInput, setShowTeachInput] = useState(false)

    async function handleAsk(mode) {
        if (mode === 'teach' && !teachQuery.trim()) { toast.error('Type what you want to learn'); return }
        try {
            const res = await askCoach.mutateAsync({ sessionId, mode, phaseId, userQuery: mode === 'teach' ? teachQuery.trim() : '' })
            onResponse(res.data.data.coaching)
            if (mode === 'teach') { setTeachQuery(''); setShowTeachInput(false) }
        } catch { /* handled */ }
    }

    return (
        <div className="border-t border-border-subtle pt-3 mt-3">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-text-disabled">🤖 AI Coach:</span>
                <button type="button" onClick={() => handleAsk('validate')} disabled={askCoach.isPending}
                    className="text-[10px] font-semibold px-3 py-1.5 rounded-lg border bg-success/5 border-success/20 text-success hover:bg-success/10 transition-colors disabled:opacity-50">Am I on track?</button>
                <button type="button" onClick={() => handleAsk('guide')} disabled={askCoach.isPending}
                    className="text-[10px] font-semibold px-3 py-1.5 rounded-lg border bg-warning/5 border-warning/20 text-warning hover:bg-warning/10 transition-colors disabled:opacity-50">I'm stuck</button>
                <button type="button" onClick={() => setShowTeachInput(!showTeachInput)} disabled={askCoach.isPending}
                    className="text-[10px] font-semibold px-3 py-1.5 rounded-lg border bg-info/5 border-info/20 text-info hover:bg-info/10 transition-colors disabled:opacity-50">Teach me...</button>
                {askCoach.isPending && <Spinner size="sm" />}
            </div>
            {showTeachInput && (
                <div className="flex gap-2 mt-2">
                    <input type="text" value={teachQuery} onChange={e => setTeachQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAsk('teach') }} placeholder="What concept do you need help with?"
                        className="flex-1 bg-surface-3 border border-border-strong rounded-lg text-xs text-text-primary placeholder:text-text-disabled px-3 py-2 outline-none focus:border-brand-400" />
                    <Button size="sm" variant="primary" onClick={() => handleAsk('teach')}>Ask</Button>
                </div>
            )}
        </div>
    )
}

function AIResponsePanel({ response, onDismiss }) {
    if (!response) return null
    return (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className="bg-brand-400/5 border border-brand-400/20 rounded-xl p-4 mt-3">
            <div className="flex items-start justify-between gap-3 mb-2">
                <span className="text-xs font-bold text-brand-300">🤖 AI Coach</span>
                <button onClick={onDismiss} className="text-text-disabled hover:text-text-primary">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
            </div>
            {response.response && <p className="text-xs text-text-secondary leading-relaxed mb-2">{response.response}</p>}
            {response.guidingQuestions?.length > 0 && (
                <div className="space-y-1.5 mt-2">
                    {response.guidingQuestions.map((q, i) => (
                        <p key={i} className="text-xs text-text-tertiary flex items-start gap-2"><span className="text-brand-300 flex-shrink-0">→</span>{q}</p>
                    ))}
                </div>
            )}
            {response.conceptExplanation && <p className="text-xs text-text-secondary leading-relaxed mt-2 pt-2 border-t border-brand-400/10">{response.conceptExplanation}</p>}
            {response.exampleInContext && <p className="text-[11px] text-text-tertiary leading-relaxed mt-2 italic">In your design: {response.exampleInContext}</p>}
        </motion.div>
    )
}

// ══════════════════════════════════════════════════════════════════════════
// CHUNK 2: SCENARIO TESTING UI
// ══════════════════════════════════════════════════════════════════════════
function ScenarioTestingView({ session, sessionId }) {
    const submitResponse = useSubmitScenarioResponse()
    const evaluateScenario = useEvaluateScenario()
    const requestEvaluation = useRequestEvaluation()
    const [responses, setResponses] = useState({})

    const scenarios = session.scenarios || []
    const evaluatedCount = scenarios.filter(s => s.status === 'evaluated').length
    const answeredCount = scenarios.filter(s => s.status === 'answered' || s.status === 'evaluated').length
    const allEvaluated = scenarios.length > 0 && evaluatedCount === scenarios.length

    const verdictConfig = {
        PASS: { label: 'PASS', color: 'text-success bg-success/10 border-success/20', icon: '✅' },
        PARTIAL: { label: 'PARTIAL', color: 'text-warning bg-warning/10 border-warning/20', icon: '⚠️' },
        FAIL: { label: 'FAIL', color: 'text-danger bg-danger/10 border-danger/20', icon: '❌' },
    }

    async function handleSubmitResponse(scenarioId) {
        const response = responses[scenarioId]
        if (!response || response.trim().length < 10) {
            toast.error('Write at least 10 characters')
            return
        }
        try {
            await submitResponse.mutateAsync({ sessionId, scenarioId, response: response.trim() })
            toast.success('Response saved')
        } catch { /* handled */ }
    }

    async function handleEvaluate(scenarioId) {
        try {
            await evaluateScenario.mutateAsync({ sessionId, scenarioId })
        } catch { /* handled */ }
    }

    async function handleRequestFinalEval() {
        try {
            await requestEvaluation.mutateAsync(sessionId)
        } catch { /* handled */ }
    }

    return (
        <div className="p-6 max-w-[800px] mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-extrabold text-text-primary flex items-center gap-2">
                        <span>🧪</span> Scenario Testing
                    </h2>
                    <p className="text-xs text-text-tertiary mt-1">
                        AI generated {scenarios.length} scenarios based on YOUR design.
                        Trace through your architecture for each one.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-text-disabled">
                        {evaluatedCount}/{scenarios.length} evaluated
                    </span>
                    {allEvaluated && (
                        <Button variant="primary" size="sm" loading={requestEvaluation.isPending}
                            onClick={handleRequestFinalEval}>
                            Get Final Evaluation →
                        </Button>
                    )}
                </div>
            </div>

            {/* Progress bar */}
            <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
                <motion.div
                    animate={{ width: `${scenarios.length > 0 ? (evaluatedCount / scenarios.length) * 100 : 0}%` }}
                    transition={{ duration: 0.4 }}
                    className="h-full bg-brand-400 rounded-full"
                />
            </div>

            {/* Scenarios */}
            <div className="space-y-4">
                {scenarios.map((scenario, i) => {
                    const verdict = scenario.aiVerdict
                    const verdictInfo = verdict ? verdictConfig[verdict.verdict] || verdictConfig.PARTIAL : null
                    const isAnswered = scenario.status === 'answered' || scenario.status === 'evaluated'
                    const isEvaluated = scenario.status === 'evaluated'

                    return (
                        <motion.div
                            key={scenario.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.06 }}
                            className={cn(
                                'bg-surface-1 border rounded-2xl overflow-hidden',
                                isEvaluated
                                    ? verdict?.verdict === 'PASS' ? 'border-success/30' : verdict?.verdict === 'FAIL' ? 'border-danger/30' : 'border-warning/30'
                                    : 'border-border-default'
                            )}
                        >
                            {/* Scenario header */}
                            <div className="p-5">
                                <div className="flex items-start gap-3">
                                    <span className="text-lg flex-shrink-0 mt-0.5">
                                        {isEvaluated ? verdictInfo?.icon : '🎯'}
                                    </span>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                            <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                                                Scenario {i + 1}
                                            </span>
                                            {scenario.category && (
                                                <span className="text-[10px] text-text-disabled bg-surface-3 border border-border-subtle rounded-full px-2 py-px">
                                                    {scenario.category}
                                                </span>
                                            )}
                                            {scenario.difficulty && (
                                                <span className={cn('text-[10px] font-bold px-2 py-px rounded-full border',
                                                    scenario.difficulty === 'easy' ? 'text-success bg-success/10 border-success/20'
                                                        : scenario.difficulty === 'hard' ? 'text-danger bg-danger/10 border-danger/20'
                                                            : 'text-warning bg-warning/10 border-warning/20')}>
                                                    {scenario.difficulty}
                                                </span>
                                            )}
                                            {verdictInfo && (
                                                <span className={cn('text-[10px] font-bold px-2 py-px rounded-full border', verdictInfo.color)}>
                                                    {verdictInfo.label}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-text-primary leading-relaxed">
                                            {scenario.scenario}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Response area */}
                            <div className="px-5 pb-5 space-y-3">
                                {!isEvaluated && (
                                    <>
                                        <textarea
                                            rows={4}
                                            value={responses[scenario.id] || scenario.userResponse || ''}
                                            onChange={e => setResponses(prev => ({ ...prev, [scenario.id]: e.target.value }))}
                                            disabled={isAnswered && !isEvaluated}
                                            placeholder="Trace through your architecture: which components handle this? What's the request path? What could fail?"
                                            className="w-full bg-surface-3 border border-border-strong rounded-xl text-sm text-text-primary
                                                       placeholder:text-text-disabled px-3.5 py-2.5 outline-none resize-y leading-relaxed
                                                       focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20 disabled:opacity-60"
                                        />
                                        <div className="flex items-center gap-2">
                                            {!isAnswered && (
                                                <Button size="sm" variant="secondary"
                                                    loading={submitResponse.isPending}
                                                    onClick={() => handleSubmitResponse(scenario.id)}>
                                                    Save Response
                                                </Button>
                                            )}
                                            {isAnswered && !isEvaluated && (
                                                <Button size="sm" variant="primary"
                                                    loading={evaluateScenario.isPending}
                                                    onClick={() => handleEvaluate(scenario.id)}>
                                                    🤖 Evaluate
                                                </Button>
                                            )}
                                        </div>
                                    </>
                                )}

                                {/* Verdict display */}
                                {isEvaluated && verdict && (
                                    <div className={cn('rounded-xl p-4 space-y-3',
                                        verdict.verdict === 'PASS' ? 'bg-success/5 border border-success/15'
                                            : verdict.verdict === 'FAIL' ? 'bg-danger/5 border border-danger/15'
                                                : 'bg-warning/5 border border-warning/15')}>
                                        {/* User's response */}
                                        <div>
                                            <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">Your Response</p>
                                            <p className="text-xs text-text-secondary leading-relaxed">{scenario.userResponse}</p>
                                        </div>
                                        {/* AI explanation */}
                                        <div className="pt-3 border-t border-border-subtle">
                                            <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">AI Analysis</p>
                                            <p className="text-xs text-text-secondary leading-relaxed">{verdict.explanation}</p>
                                        </div>
                                        {/* Missed points */}
                                        {verdict.missedPoints?.length > 0 && (
                                            <div>
                                                <p className="text-[10px] font-bold text-danger uppercase tracking-widest mb-1">Missed</p>
                                                <ul className="space-y-1">
                                                    {verdict.missedPoints.map((point, j) => (
                                                        <li key={j} className="text-xs text-text-tertiary flex items-start gap-2">
                                                            <span className="text-danger flex-shrink-0">•</span>{point}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {/* Suggestions */}
                                        {verdict.suggestions?.length > 0 && (
                                            <div>
                                                <p className="text-[10px] font-bold text-brand-300 uppercase tracking-widest mb-1">Suggestions</p>
                                                <ul className="space-y-1">
                                                    {verdict.suggestions.map((sug, j) => (
                                                        <li key={j} className="text-xs text-text-tertiary flex items-start gap-2">
                                                            <span className="text-brand-300 flex-shrink-0">→</span>{sug}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )
                })}
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════════════════════════
// CHUNK 2: SCALE ANALYSIS UI
// ══════════════════════════════════════════════════════════════════════════
function ScaleAnalysisView({ session, sessionId }) {
    const saveScale = useSaveScaleAnalysis()
    const [scaleData, setScaleData] = useState({
        current: session.scaleAnalysis?.current || '',
        tenX: session.scaleAnalysis?.tenX || '',
        hundredX: session.scaleAnalysis?.hundredX || '',
        failureAtScale: session.scaleAnalysis?.failureAtScale || '',
    })

    function handleSave() {
        saveScale.mutate({ sessionId, ...scaleData })
    }

    const scales = [
        {
            id: 'current',
            label: '1x — Current Scale',
            icon: '📊',
            color: 'text-success',
            bg: 'bg-success/5 border-success/20',
            hint: 'Does your design work at the scale you stated in capacity estimation? Walk through a normal request.',
            placeholder: 'At 23K messages/sec, my system handles this because...\n\nRequest path: Client → LB → Chat Service → Message Queue → DB\nEach component handles: [explain capacity]',
        },
        {
            id: 'tenX',
            label: '10x — Growth Scale',
            icon: '📈',
            color: 'text-warning',
            bg: 'bg-warning/5 border-warning/20',
            hint: 'What breaks first at 10x traffic? What component hits its limit? How do you scale it?',
            placeholder: 'At 230K messages/sec:\n\n• First bottleneck: [component] because [reason]\n• Solution: [horizontal scaling / sharding / caching]\n• New components needed: [what and why]',
        },
        {
            id: 'hundredX',
            label: '100x — Extreme Scale',
            icon: '🚀',
            color: 'text-danger',
            bg: 'bg-danger/5 border-danger/20',
            hint: 'At 100x, your architecture likely needs fundamental changes. What would you redesign?',
            placeholder: 'At 2.3M messages/sec:\n\n• Architecture changes needed: [what]\n• Database can no longer be: [current choice] → switch to: [new choice]\n• New patterns required: [e.g., event sourcing, CQRS, geo-sharding]',
        },
        {
            id: 'failureAtScale',
            label: '🔥 Failure at Scale',
            icon: '💥',
            color: 'text-danger',
            bg: 'bg-danger/5 border-danger/20',
            hint: 'At 10x traffic, your cache goes cold (restart). What happens to your database? How do you recover?',
            placeholder: 'If Redis restarts at 10x traffic:\n\n• Thundering herd: all 230K req/sec hit the database directly\n• Database max capacity: [X] req/sec → overloaded by [Y]x\n• Mitigation: [circuit breaker / request coalescing / gradual warmup]\n• Recovery time: [estimate]',
        },
    ]

    return (
        <div className="p-6 max-w-[800px] mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-extrabold text-text-primary flex items-center gap-2">
                        <span>📐</span> Scale Analysis
                    </h2>
                    <p className="text-xs text-text-tertiary mt-1">
                        Stress-test your design at different traffic levels. What breaks and when?
                    </p>
                </div>
                <Button variant="secondary" size="sm" loading={saveScale.isPending} onClick={handleSave}>
                    Save Analysis
                </Button>
            </div>

            <div className="space-y-4">
                {scales.map(scale => (
                    <div key={scale.id} className={cn('border rounded-2xl overflow-hidden', scale.bg)}>
                        <div className="px-5 py-4">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-base">{scale.icon}</span>
                                <h3 className={cn('text-sm font-bold', scale.color)}>{scale.label}</h3>
                            </div>
                            <p className="text-[11px] text-text-tertiary mb-3">{scale.hint}</p>
                            <textarea
                                rows={5}
                                value={scaleData[scale.id]}
                                onChange={e => setScaleData(prev => ({ ...prev, [scale.id]: e.target.value }))}
                                placeholder={scale.placeholder}
                                className="w-full bg-surface-0/80 border border-border-default rounded-xl text-sm text-text-primary
                                           placeholder:text-text-disabled px-3.5 py-2.5 outline-none resize-y leading-relaxed
                                           focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN DESIGN WORKSPACE (updated with validate mode)
// ══════════════════════════════════════════════════════════════════════════
function DesignWorkspace({ sessionId, onBack }) {
    const { data: session, isLoading, refetch } = useDesignSession(sessionId)
    const savePhase = useSavePhase()
    const saveDiagram = useSaveDiagram()
    const updateTiming = useUpdateTiming()
    const generateScenarios = useGenerateScenarios()

    const [activePhaseIdx, setActivePhaseIdx] = useState(0)
    const [phaseContent, setPhaseContent] = useState({})
    const [diagramData, setDiagramData] = useState(null)
    const [annotations, setAnnotations] = useState([])
    const [dataFlow, setDataFlow] = useState('')
    const [aiResponse, setAiResponse] = useState(null)
    const [panelHeight, setPanelHeight] = useState(35)
    const [elapsedTime, setElapsedTime] = useState(0)
    const [annotationsCollapsed, setAnnotationsCollapsed] = useState(true)
    const [workspaceMode, setWorkspaceMode] = useState('design') // 'design' | 'scenarios' | 'scale'

    const debounceRef = useRef(null)
    const diagramDebounceRef = useRef(null)
    const timerRef = useRef(null)
    const dragRef = useRef(null)

    const phases = session?.designType === 'SYSTEM_DESIGN' ? SD_PHASES : LLD_PHASES
    const activePhase = phases[activePhaseIdx]

    // Load session data
    useEffect(() => {
        if (session) {
            setPhaseContent(session.phases || {})
            setDiagramData(session.diagramData || null)
            setAnnotations(session.componentAnnotations || [])
            setDataFlow(session.dataFlowDescription || '')
            setElapsedTime(session.totalTimeSpent || 0)
            // Auto-switch to scenarios view if session is in VALIDATING status
            if (session.status === 'VALIDATING' && session.scenarios?.length > 0) {
                setWorkspaceMode('scenarios')
            }
            if (session.status === 'COMPLETED') {
                setWorkspaceMode('scenarios')
            }
        }
    }, [session])

    // Timer
    useEffect(() => {
        timerRef.current = setInterval(() => setElapsedTime(prev => prev + 1), 1000)
        return () => clearInterval(timerRef.current)
    }, [])

    // Save timing every 30s
    useEffect(() => {
        const interval = setInterval(() => {
            if (sessionId && elapsedTime > 0) updateTiming.mutate({ sessionId, totalTimeSpent: elapsedTime })
        }, 30000)
        return () => clearInterval(interval)
    }, [sessionId, elapsedTime])

    function handlePhaseChange(value) {
        const newContent = { ...phaseContent, [activePhase.id]: value }
        setPhaseContent(newContent)
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            savePhase.mutate({ sessionId, phaseId: activePhase.id, content: value })
        }, 1000)
    }

    const handleDiagramChange = useCallback((data) => {
        setDiagramData(data)
        if (diagramDebounceRef.current) clearTimeout(diagramDebounceRef.current)
        diagramDebounceRef.current = setTimeout(() => {
            saveDiagram.mutate({ sessionId, diagramData: data, componentAnnotations: annotations, dataFlowDescription: dataFlow })
        }, 2000)
    }, [sessionId, annotations, dataFlow])

    function handleAnnotationsChange(newAnnotations) {
        setAnnotations(newAnnotations)
        saveDiagram.mutate({ sessionId, diagramData, componentAnnotations: newAnnotations, dataFlowDescription: dataFlow })
    }

    function handleDragStart(e) {
        e.preventDefault()
        dragRef.current = { startY: e.clientY, startHeight: panelHeight }
        function onMove(ev) {
            const deltaY = dragRef.current.startY - ev.clientY
            setPanelHeight(Math.min(70, Math.max(15, dragRef.current.startHeight + (deltaY / window.innerHeight) * 100)))
        }
        function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }

    async function handleStartValidation() {
        try {
            await generateScenarios.mutateAsync(sessionId)
            await refetch()
            setWorkspaceMode('scenarios')
        } catch { /* handled */ }
    }

    if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><Spinner size="lg" /></div>
    if (!session) return <div className="flex flex-col items-center justify-center h-[60vh] gap-4"><p className="text-text-secondary">Session not found.</p><Button variant="secondary" onClick={onBack}>Back</Button></div>

    const filledPhases = Object.values(phaseContent).filter(v => v && v.trim().length > 30).length
    const canValidate = filledPhases >= 3

    // ── SCENARIO TESTING VIEW ────────────────────────────
    if (workspaceMode === 'scenarios') {
        return (
            <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden">
                {/* Top bar */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-default bg-surface-1 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <button onClick={onBack} className="text-text-tertiary hover:text-text-primary transition-colors">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                        </button>
                        <div>
                            <h2 className="text-sm font-bold text-text-primary">{session.title}</h2>
                            <p className="text-[10px] text-text-disabled">Validation Phase</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setWorkspaceMode('design')}
                            className={cn('text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all',
                                'text-text-tertiary bg-surface-3 border-border-default hover:border-brand-400/30')}>
                            ← Back to Design
                        </button>
                        <button onClick={() => setWorkspaceMode('scale')}
                            className={cn('text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all',
                                'text-brand-300 bg-brand-400/10 border-brand-400/20 hover:bg-brand-400/20')}>
                            Scale Analysis →
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    <ScenarioTestingView session={session} sessionId={sessionId} />
                </div>
            </div>
        )
    }

    // ── SCALE ANALYSIS VIEW ──────────────────────────────
    if (workspaceMode === 'scale') {
        return (
            <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-default bg-surface-1 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <button onClick={onBack} className="text-text-tertiary hover:text-text-primary transition-colors">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                        </button>
                        <div>
                            <h2 className="text-sm font-bold text-text-primary">{session.title}</h2>
                            <p className="text-[10px] text-text-disabled">Scale Analysis</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setWorkspaceMode('scenarios')}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border text-text-tertiary bg-surface-3 border-border-default hover:border-brand-400/30 transition-all">
                            ← Back to Scenarios
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    <ScaleAnalysisView session={session} sessionId={sessionId} />
                </div>
            </div>
        )
    }

    // ── DESIGN VIEW (default) ────────────────────────────
    return (
        <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden">
            {/* Top Bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-default bg-surface-1 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="text-text-tertiary hover:text-text-primary transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                    </button>
                    <div>
                        <h2 className="text-sm font-bold text-text-primary">{session.title}</h2>
                        <p className="text-[10px] text-text-disabled">
                            {session.designType === 'SYSTEM_DESIGN' ? '🏗️ System Design' : '🔧 LLD'} · {session.difficulty}
                        </p>
                    </div>
                </div>

                {/* Phase dots */}
                <div className="flex items-center gap-1.5">
                    {phases.map((phase, idx) => {
                        const hasContent = (phaseContent[phase.id] || '').trim().length > 20
                        const isActive = idx === activePhaseIdx
                        return (
                            <button key={phase.id} onClick={() => { setActivePhaseIdx(idx); setAiResponse(null) }} title={phase.label}
                                className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all',
                                    isActive ? 'bg-brand-400 text-white scale-110' : hasContent ? 'bg-success/20 text-success border border-success/30' : 'bg-surface-3 text-text-disabled border border-border-default hover:border-brand-400/30')}>
                                {phase.icon}
                            </button>
                        )
                    })}
                </div>

                {/* Timer + Actions */}
                <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-text-disabled">{formatTime(elapsedTime)}</span>
                    <span className={cn('w-2 h-2 rounded-full', savePhase.isPending || saveDiagram.isPending ? 'bg-warning animate-pulse' : 'bg-success')} />
                    {canValidate && session.status === 'IN_PROGRESS' && (
                        <Button variant="primary" size="sm" loading={generateScenarios.isPending} onClick={handleStartValidation}>
                            Validate Design →
                        </Button>
                    )}
                    {session.status === 'VALIDATING' && (
                        <Button variant="secondary" size="sm" onClick={() => setWorkspaceMode('scenarios')}>
                            View Scenarios →
                        </Button>
                    )}
                </div>
            </div>

            {/* Canvas */}
            <div style={{ height: `${100 - panelHeight}%` }} className="flex-shrink-0 relative">
                <ExcalidrawEditor onChange={handleDiagramChange} initialData={diagramData} />
            </div>

            {/* Resize Handle */}
            <div onMouseDown={handleDragStart}
                className="h-2 bg-surface-2 border-y border-border-default cursor-row-resize flex items-center justify-center hover:bg-brand-400/10 transition-colors flex-shrink-0">
                <div className="w-8 h-0.5 bg-border-strong rounded-full" />
            </div>

            {/* Bottom Panel */}
            <div style={{ height: `${panelHeight}%` }} className="flex flex-col overflow-hidden bg-surface-1">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-default flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="text-base">{activePhase.icon}</span>
                        <div>
                            <span className="text-xs font-bold text-text-primary">{activePhase.label}</span>
                            <p className="text-[10px] text-text-disabled">{activePhase.hint}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-text-disabled">{activePhaseIdx + 1} / {phases.length}</span>
                        {activePhaseIdx > 0 && (
                            <button onClick={() => { setActivePhaseIdx(activePhaseIdx - 1); setAiResponse(null) }} className="text-text-tertiary hover:text-text-primary p-1">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
                            </button>
                        )}
                        {activePhaseIdx < phases.length - 1 && (
                            <button onClick={() => { setActivePhaseIdx(activePhaseIdx + 1); setAiResponse(null) }} className="text-text-tertiary hover:text-text-primary p-1">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3">
                    <textarea
                        value={phaseContent[activePhase.id] || ''}
                        onChange={e => handlePhaseChange(e.target.value)}
                        placeholder={`Write your ${activePhase.label.toLowerCase()} here...`}
                        className="w-full h-full min-h-[120px] bg-transparent text-sm text-text-primary placeholder:text-text-disabled outline-none resize-none leading-relaxed"
                    />
                    <AIResponsePanel response={aiResponse} onDismiss={() => setAiResponse(null)} />
                    <AICoachingBar sessionId={sessionId} phaseId={activePhase.id} onResponse={setAiResponse} />
                </div>

                <ComponentAnnotationsPanel annotations={annotations} onChange={handleAnnotationsChange}
                    isCollapsed={annotationsCollapsed} onToggle={() => setAnnotationsCollapsed(v => !v)} />
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════
export default function DesignStudioPage() {
    const [view, setView] = useState('list')
    const [activeSessionId, setActiveSessionId] = useState(null)

    if (view === 'workspace' && activeSessionId) {
        return <DesignWorkspace sessionId={activeSessionId} onBack={() => { setView('list'); setActiveSessionId(null) }} />
    }

    if (view === 'create') {
        return (
            <div className="p-6 max-w-[600px] mx-auto">
                <div className="mb-6">
                    <h1 className="text-2xl font-extrabold text-text-primary mb-2">Design Studio</h1>
                    <p className="text-sm text-text-tertiary leading-relaxed">Practice system design and low-level design with AI coaching at every step.</p>
                </div>
                <CreateSessionScreen onCreated={(id) => { setActiveSessionId(id); setView('workspace') }} onBack={() => setView('list')} />
            </div>
        )
    }

    return (
        <div className="p-6 max-w-[700px] mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-extrabold text-text-primary mb-1">Design Studio</h1>
                    <p className="text-sm text-text-tertiary">Practice, validate, and master system design with AI coaching.</p>
                </div>
                <Button variant="primary" size="md" onClick={() => setView('create')}>+ New Session</Button>
            </div>
            <SessionListView onSelectSession={(id) => { setActiveSessionId(id); setView('workspace') }} onCreateNew={() => setView('create')} />
        </div>
    )
}