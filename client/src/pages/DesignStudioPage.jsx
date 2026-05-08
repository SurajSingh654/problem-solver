// ============================================================================
// ProbSolver v3.0 — Design Studio Page
// ============================================================================
//
// LAYOUT ARCHITECTURE:
//
// ┌─────────────────────────────────────────────────────────────────┐
// │  TOP BAR: Problem title · Phase stepper (dots) · Timer · Submit │
// ├─────────────────────────────────────────────────────────────────┤
// │                                                                  │
// │              CANVAS (Excalidraw — 60-80% of viewport)           │
// │                                                                  │
// ├──────── drag handle to resize ──────────────────────────────────┤
// │  BOTTOM PANEL: Phase input + AI coaching (20-40% height)        │
// └─────────────────────────────────────────────────────────────────┘
//
// DESIGN DECISIONS:
//
// 1. Canvas-first layout. The diagram IS the work for system design.
//    Bottom panel is collapsible/resizable so users control the split.
//
// 2. Phase stepper is horizontal dots in the top bar — clicking a dot
//    switches the bottom panel content without affecting the canvas.
//
// 3. AI coaching is available at every phase via three buttons:
//    "Am I on track?" / "I'm stuck" / "Teach me..."
//    AI never volunteers — user must ask.
//
// 4. Auto-save on blur/debounce for phase content and diagram state.
//    No explicit "Save" button — everything persists automatically.
//
// 5. Timer is soft — shows elapsed time, user decides when to move on.
//
// ============================================================================
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ExcalidrawEditor } from '@components/ui/ExcalidrawEditor'
import { Button } from '@components/ui/Button'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import {
    useDesignSession,
    useDesignSessions,
    useCreateDesignSession,
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

// ── Session creation screen ────────────────────────────────────────────
function CreateSessionScreen({ onCreated }) {
    const createSession = useCreateDesignSession()
    const [designType, setDesignType] = useState('SYSTEM_DESIGN')
    const [title, setTitle] = useState('')
    const [difficulty, setDifficulty] = useState('MEDIUM')

    async function handleCreate() {
        if (!title.trim()) {
            toast.error('Enter a title for your design session')
            return
        }
        try {
            const res = await createSession.mutateAsync({
                designType,
                title: title.trim(),
                difficulty,
            })
            onCreated(res.data.data.session.id)
        } catch {
            // handled by hook
        }
    }

    return (
        <div className="max-w-[600px] mx-auto p-6">
            <div className="mb-8">
                <h1 className="text-2xl font-extrabold text-text-primary mb-2">
                    Design Studio
                </h1>
                <p className="text-sm text-text-tertiary leading-relaxed">
                    Practice system design and low-level design with AI coaching at every step.
                    Design, validate, and get comprehensive feedback.
                </p>
            </div>

            <div className="bg-surface-1 border border-border-default rounded-2xl p-6 space-y-5">
                {/* Design Type */}
                <div>
                    <label className="block text-sm font-semibold text-text-primary mb-3">
                        What are you designing?
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { id: 'SYSTEM_DESIGN', label: 'System Design', icon: '🏗️', desc: 'Scalable distributed systems' },
                            { id: 'LOW_LEVEL_DESIGN', label: 'Low-Level Design', icon: '🔧', desc: 'OOP, classes, patterns' },
                        ].map(t => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setDesignType(t.id)}
                                className={cn(
                                    'flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-all',
                                    designType === t.id
                                        ? 'bg-brand-400/10 border-brand-400/40 text-brand-300'
                                        : 'bg-surface-3 border-border-default hover:border-border-strong text-text-tertiary'
                                )}
                            >
                                <span className="text-2xl">{t.icon}</span>
                                <span className="text-xs font-bold">{t.label}</span>
                                <span className="text-[10px] text-text-disabled">{t.desc}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Title */}
                <div>
                    <label className="block text-sm font-semibold text-text-primary mb-1.5">
                        Design Title
                    </label>
                    <input
                        type="text"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder={designType === 'SYSTEM_DESIGN'
                            ? 'e.g. Design WhatsApp, Design YouTube, Design Uber'
                            : 'e.g. Parking Lot System, Chess Game, Elevator System'}
                        className="w-full bg-surface-3 border border-border-strong rounded-xl
                                   text-sm text-text-primary placeholder:text-text-tertiary
                                   px-3.5 py-2.5 outline-none
                                   focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                    />
                </div>

                {/* Difficulty */}
                <div>
                    <label className="block text-sm font-semibold text-text-primary mb-2">
                        Difficulty
                    </label>
                    <div className="flex gap-2">
                        {['EASY', 'MEDIUM', 'HARD'].map(d => (
                            <button
                                key={d}
                                type="button"
                                onClick={() => setDifficulty(d)}
                                className={cn(
                                    'flex-1 py-2.5 rounded-xl border text-xs font-bold transition-all',
                                    difficulty === d
                                        ? d === 'EASY' ? 'bg-success/12 border-success/30 text-success'
                                            : d === 'MEDIUM' ? 'bg-warning/12 border-warning/30 text-warning'
                                                : 'bg-danger/12 border-danger/30 text-danger'
                                        : 'bg-surface-3 border-border-default text-text-tertiary hover:border-border-strong'
                                )}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Create */}
                <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    loading={createSession.isPending}
                    onClick={handleCreate}
                    disabled={!title.trim()}
                >
                    Start Design Session
                </Button>
            </div>
        </div>
    )
}

// ── AI Coaching Toolbar ────────────────────────────────────────────────
function AICoachingBar({ sessionId, phaseId, onResponse }) {
    const askCoach = useAICoach()
    const [teachQuery, setTeachQuery] = useState('')
    const [showTeachInput, setShowTeachInput] = useState(false)

    async function handleAsk(mode) {
        if (mode === 'teach' && !teachQuery.trim()) {
            toast.error('Type what you want to learn')
            return
        }
        try {
            const res = await askCoach.mutateAsync({
                sessionId,
                mode,
                phaseId,
                userQuery: mode === 'teach' ? teachQuery.trim() : '',
            })
            onResponse(res.data.data.coaching)
            if (mode === 'teach') {
                setTeachQuery('')
                setShowTeachInput(false)
            }
        } catch {
            // handled by hook
        }
    }

    return (
        <div className="border-t border-border-subtle pt-3 mt-3">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-text-disabled">🤖 AI Coach:</span>
                <button
                    type="button"
                    onClick={() => handleAsk('validate')}
                    disabled={askCoach.isPending}
                    className="text-[10px] font-semibold px-3 py-1.5 rounded-lg border
                               bg-success/5 border-success/20 text-success
                               hover:bg-success/10 transition-colors disabled:opacity-50"
                >
                    Am I on track?
                </button>
                <button
                    type="button"
                    onClick={() => handleAsk('guide')}
                    disabled={askCoach.isPending}
                    className="text-[10px] font-semibold px-3 py-1.5 rounded-lg border
                               bg-warning/5 border-warning/20 text-warning
                               hover:bg-warning/10 transition-colors disabled:opacity-50"
                >
                    I'm stuck
                </button>
                <button
                    type="button"
                    onClick={() => setShowTeachInput(!showTeachInput)}
                    disabled={askCoach.isPending}
                    className="text-[10px] font-semibold px-3 py-1.5 rounded-lg border
                               bg-info/5 border-info/20 text-info
                               hover:bg-info/10 transition-colors disabled:opacity-50"
                >
                    Teach me...
                </button>
                {askCoach.isPending && (
                    <Spinner size="sm" />
                )}
            </div>
            {showTeachInput && (
                <div className="flex gap-2 mt-2">
                    <input
                        type="text"
                        value={teachQuery}
                        onChange={e => setTeachQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleAsk('teach') }}
                        placeholder="What concept do you need help with?"
                        className="flex-1 bg-surface-3 border border-border-strong rounded-lg
                                   text-xs text-text-primary placeholder:text-text-disabled
                                   px-3 py-2 outline-none focus:border-brand-400"
                    />
                    <Button size="sm" variant="primary" onClick={() => handleAsk('teach')}>
                        Ask
                    </Button>
                </div>
            )}
        </div>
    )
}

// ── AI Response Display ────────────────────────────────────────────────
function AIResponsePanel({ response, onDismiss }) {
    if (!response) return null

    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-brand-400/5 border border-brand-400/20 rounded-xl p-4 mt-3"
        >
            <div className="flex items-start justify-between gap-3 mb-2">
                <span className="text-xs font-bold text-brand-300">🤖 AI Coach</span>
                <button onClick={onDismiss} className="text-text-disabled hover:text-text-primary">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>
            {response.response && (
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    {response.response}
                </p>
            )}
            {response.guidingQuestions?.length > 0 && (
                <div className="space-y-1.5 mt-2">
                    {response.guidingQuestions.map((q, i) => (
                        <p key={i} className="text-xs text-text-tertiary flex items-start gap-2">
                            <span className="text-brand-300 flex-shrink-0">→</span>
                            {q}
                        </p>
                    ))}
                </div>
            )}
            {response.conceptExplanation && (
                <p className="text-xs text-text-secondary leading-relaxed mt-2 pt-2 border-t border-brand-400/10">
                    {response.conceptExplanation}
                </p>
            )}
            {response.exampleInContext && (
                <p className="text-[11px] text-text-tertiary leading-relaxed mt-2 italic">
                    In your design: {response.exampleInContext}
                </p>
            )}
        </motion.div>
    )
}

// ── Main Design Workspace ──────────────────────────────────────────────
function DesignWorkspace({ sessionId }) {
    const { data: session, isLoading } = useDesignSession(sessionId)
    const savePhase = useSavePhase()
    const saveDiagram = useSaveDiagram()
    const updateTiming = useUpdateTiming()
    const navigate = useNavigate()

    const [activePhaseIdx, setActivePhaseIdx] = useState(0)
    const [phaseContent, setPhaseContent] = useState({})
    const [diagramData, setDiagramData] = useState(null)
    const [aiResponse, setAiResponse] = useState(null)
    const [panelHeight, setPanelHeight] = useState(35) // percentage
    const [elapsedTime, setElapsedTime] = useState(0)

    const debounceRef = useRef(null)
    const timerRef = useRef(null)
    const dragRef = useRef(null)

    const phases = session?.designType === 'SYSTEM_DESIGN' ? SD_PHASES : LLD_PHASES
    const activePhase = phases[activePhaseIdx]

    // Load session data into local state
    useEffect(() => {
        if (session) {
            setPhaseContent(session.phases || {})
            setDiagramData(session.diagramData || null)
            setElapsedTime(session.totalTimeSpent || 0)
        }
    }, [session])

    // Timer — counts up every second
    useEffect(() => {
        timerRef.current = setInterval(() => {
            setElapsedTime(prev => prev + 1)
        }, 1000)
        return () => clearInterval(timerRef.current)
    }, [])

    // Save timing every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            if (sessionId && elapsedTime > 0) {
                updateTiming.mutate({ sessionId, totalTimeSpent: elapsedTime })
            }
        }, 30000)
        return () => clearInterval(interval)
    }, [sessionId, elapsedTime])

    // Auto-save phase content on debounce
    function handlePhaseChange(value) {
        const newContent = { ...phaseContent, [activePhase.id]: value }
        setPhaseContent(newContent)

        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            savePhase.mutate({ sessionId, phaseId: activePhase.id, content: value })
        }, 1000)
    }

    // Auto-save diagram on change
    const handleDiagramChange = useCallback((data) => {
        setDiagramData(data)
        // Debounced save — diagram changes fire rapidly
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            saveDiagram.mutate({ sessionId, diagramData: data, componentAnnotations: [], dataFlowDescription: '' })
        }, 2000)
    }, [sessionId])

    // Resizable panel drag handler
    function handleDragStart(e) {
        e.preventDefault()
        dragRef.current = { startY: e.clientY, startHeight: panelHeight }

        function onMove(ev) {
            const deltaY = dragRef.current.startY - ev.clientY
            const viewportHeight = window.innerHeight
            const deltaPercent = (deltaY / viewportHeight) * 100
            const newHeight = Math.min(70, Math.max(15, dragRef.current.startHeight + deltaPercent))
            setPanelHeight(newHeight)
        }

        function onUp() {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
        }

        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }

    // Format elapsed time
    const minutes = Math.floor(elapsedTime / 60)
    const seconds = elapsedTime % 60
    const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Spinner size="lg" />
            </div>
        )
    }

    if (!session) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <p className="text-text-secondary">Session not found.</p>
                <Button variant="secondary" onClick={() => navigate('/design-studio')}>
                    Back to Design Studio
                </Button>
            </div>
        )
    }

    return (
        <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden">
            {/* ── Top Bar ──────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-default bg-surface-1 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/design-studio')}
                        className="text-text-tertiary hover:text-text-primary transition-colors"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12" />
                            <polyline points="12 19 5 12 12 5" />
                        </svg>
                    </button>
                    <div>
                        <h2 className="text-sm font-bold text-text-primary">{session.title}</h2>
                        <p className="text-[10px] text-text-disabled">
                            {session.designType === 'SYSTEM_DESIGN' ? '🏗️ System Design' : '🔧 Low-Level Design'}
                            {' · '}{session.difficulty}
                        </p>
                    </div>
                </div>

                {/* Phase dots */}
                <div className="flex items-center gap-1.5">
                    {phases.map((phase, idx) => {
                        const hasContent = (phaseContent[phase.id] || '').trim().length > 20
                        const isActive = idx === activePhaseIdx
                        return (
                            <button
                                key={phase.id}
                                onClick={() => { setActivePhaseIdx(idx); setAiResponse(null) }}
                                title={phase.label}
                                className={cn(
                                    'w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all',
                                    isActive
                                        ? 'bg-brand-400 text-white scale-110'
                                        : hasContent
                                            ? 'bg-success/20 text-success border border-success/30'
                                            : 'bg-surface-3 text-text-disabled border border-border-default hover:border-brand-400/30'
                                )}
                            >
                                {phase.icon}
                            </button>
                        )
                    })}
                </div>

                {/* Timer */}
                <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-text-disabled">{timeDisplay}</span>
                    <span className={cn(
                        'w-2 h-2 rounded-full',
                        savePhase.isPending || saveDiagram.isPending ? 'bg-warning animate-pulse' : 'bg-success'
                    )} title={savePhase.isPending ? 'Saving...' : 'Saved'} />
                </div>
            </div>

            {/* ── Canvas Area ──────────────────────────────────── */}
            <div style={{ height: `${100 - panelHeight}%` }} className="flex-shrink-0 relative">
                <ExcalidrawEditor
                    onChange={handleDiagramChange}
                    initialData={diagramData}
                />
            </div>

            {/* ── Resize Handle ────────────────────────────────── */}
            <div
                onMouseDown={handleDragStart}
                className="h-2 bg-surface-2 border-y border-border-default cursor-row-resize
                           flex items-center justify-center hover:bg-brand-400/10 transition-colors flex-shrink-0"
            >
                <div className="w-8 h-0.5 bg-border-strong rounded-full" />
            </div>

            {/* ── Bottom Panel ─────────────────────────────────── */}
            <div style={{ height: `${panelHeight}%` }} className="flex flex-col overflow-hidden bg-surface-1">
                {/* Phase header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-default flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="text-base">{activePhase.icon}</span>
                        <div>
                            <span className="text-xs font-bold text-text-primary">{activePhase.label}</span>
                            <p className="text-[10px] text-text-disabled">{activePhase.hint}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-text-disabled">
                            {activePhaseIdx + 1} / {phases.length}
                        </span>
                        {activePhaseIdx > 0 && (
                            <button onClick={() => { setActivePhaseIdx(activePhaseIdx - 1); setAiResponse(null) }}
                                className="text-text-tertiary hover:text-text-primary p-1">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
                            </button>
                        )}
                        {activePhaseIdx < phases.length - 1 && (
                            <button onClick={() => { setActivePhaseIdx(activePhaseIdx + 1); setAiResponse(null) }}
                                className="text-text-tertiary hover:text-text-primary p-1">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* Phase content area */}
                <div className="flex-1 overflow-y-auto px-4 py-3">
                    <textarea
                        value={phaseContent[activePhase.id] || ''}
                        onChange={e => handlePhaseChange(e.target.value)}
                        placeholder={`Write your ${activePhase.label.toLowerCase()} here...`}
                        className="w-full h-full min-h-[120px] bg-transparent text-sm text-text-primary
                                   placeholder:text-text-disabled outline-none resize-none leading-relaxed"
                    />

                    {/* AI Response */}
                    <AIResponsePanel response={aiResponse} onDismiss={() => setAiResponse(null)} />

                    {/* AI Coaching Bar */}
                    <AICoachingBar
                        sessionId={sessionId}
                        phaseId={activePhase.id}
                        onResponse={setAiResponse}
                    />
                </div>
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function DesignStudioPage() {
    const [activeSessionId, setActiveSessionId] = useState(null)

    if (activeSessionId) {
        return <DesignWorkspace sessionId={activeSessionId} />
    }

    return <CreateSessionScreen onCreated={setActiveSessionId} />
}