import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@components/ui/Button'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import {
    useDesignSession,
    useSavePhase,
    useSaveDiagram,
    useUpdateTiming,
    useGenerateScenarios,
    useUpdateSessionStatus,
} from '@hooks/useDesignStudio'
import DesignView from './DesignView'
import ScenarioTestingView from './ScenarioTestingView'
import ScaleAnalysisView from './ScaleAnalysisView'
import FlowSimulationView from './FlowSimulationView'
import EvaluationResultsView from './EvaluationResultsView'
import { SD_PHASES, LLD_PHASES } from '../constants/phases'

// ══════════════════════════════════════════════════════════════════════════
// MAIN DESIGN WORKSPACE (updated with validate mode)
// ══════════════════════════════════════════════════════════════════════════
export default function DesignWorkspace({ sessionId, onBack }) {
    const navigate = useNavigate()
    const { data: session, isLoading, refetch } = useDesignSession(sessionId)
    const savePhase = useSavePhase()
    const saveDiagram = useSaveDiagram()
    const updateTiming = useUpdateTiming()
    const generateScenarios = useGenerateScenarios()
    const updateSessionStatus = useUpdateSessionStatus()

    const [activePhaseIdx, setActivePhaseIdx] = useState(0)
    const [phaseContent, setPhaseContent] = useState({})
    const [diagramData, setDiagramData] = useState(null)
    const [annotations, setAnnotations] = useState([])
    const [dataFlow, setDataFlow] = useState('')
    const [aiResponse, setAiResponse] = useState(null)
    const [panelHeight, setPanelHeight] = useState(35)
    const [elapsedTime, setElapsedTime] = useState(0)
    const [annotationsCollapsed, setAnnotationsCollapsed] = useState(true)
    const [dataFlowCollapsed, setDataFlowCollapsed] = useState(true)
    const [workspaceMode, setWorkspaceMode] = useState('design') // 'design' | 'scenarios' | 'scale' | 'flow' | 'evaluation'

    const debounceRef = useRef(null)
    const diagramDebounceRef = useRef(null)
    const annotationsDebounceRef = useRef(null)
    const dataFlowDebounceRef = useRef(null)
    const timerRef = useRef(null)
    const dragRef = useRef(null)
    const elapsedTimeRef = useRef(0)
    const diagramDataRef = useRef(null)
    const dataFlowRef = useRef('')
    const annotationsRef = useRef([])
    // Per-phase time tracking — we record the elapsedTime at which the user
    // entered the current phase, and accumulate deltas into phaseTimingsRef
    // on every phase switch. This feeds the "time allocation" analysis in
    // the final evaluation prompt.
    const phaseEnterTimeRef = useRef(0)
    const phaseTimingsRef = useRef({})
    // Tracks whether we've already picked an initial workspace mode for this session.
    // Without this, every background refetch would snap the user back to a server-chosen view.
    const initializedRef = useRef(false)

    const phases = session?.designType === 'SYSTEM_DESIGN' ? SD_PHASES : LLD_PHASES
    const activePhase = phases[activePhaseIdx]
    // Read-only mode: terminal statuses can't be edited. All user-triggered
    // saves no-op, text inputs are readOnly, and edit action buttons are hidden.
    const isReadOnly = session?.status === 'COMPLETED' || session?.status === 'ABANDONED'

    // Seed local editable state from the server ONCE, on first session load.
    // Subsequent session refetches (triggered by mutations) must NOT overwrite
    // local state or we'll clobber in-flight keystrokes / diagram edits that
    // the user made after the last debounced save began. Server-generated
    // fields (scenarios, evaluation) are read directly from the session prop
    // by the relevant views — no local mirror needed.
    useEffect(() => {
        if (!session || initializedRef.current) return
        initializedRef.current = true
        setPhaseContent(session.phases || {})
        setDiagramData(session.diagramData || null)
        setAnnotations(session.componentAnnotations || [])
        setDataFlow(session.dataFlowDescription || '')
        setElapsedTime(session.totalTimeSpent || 0)
        phaseTimingsRef.current = session.phaseTimings || {}
        // Seed activePhase from server so users resume where they left off.
        const startIdx = Math.min(
            Math.max(0, session.currentPhase || 0),
            (session.designType === 'SYSTEM_DESIGN' ? SD_PHASES : LLD_PHASES).length - 1,
        )
        setActivePhaseIdx(startIdx)
        phaseEnterTimeRef.current = session.totalTimeSpent || 0
        if (session.status === 'COMPLETED' && session.evaluation) {
            setWorkspaceMode('evaluation')
        } else if (session.status === 'VALIDATING' && session.scenarios?.length > 0) {
            setWorkspaceMode('scenarios')
        } else if (session.status === 'COMPLETED') {
            // Completed without evaluation — show scenarios if any, else design view
            setWorkspaceMode(session.scenarios?.length > 0 ? 'scenarios' : 'design')
        }
    }, [session])

    // beforeunload guard — warn the user if they try to close the tab while
    // a debounce is still pending or a mutation is in flight. The modern
    // browser behaviour is to show a generic confirmation; the returnValue
    // string is mostly ignored but required for compatibility.
    useEffect(() => {
        const handler = (e) => {
            const pendingDebounce =
                debounceRef.current ||
                diagramDebounceRef.current ||
                annotationsDebounceRef.current ||
                dataFlowDebounceRef.current
            const pendingMutation =
                savePhase.isPending ||
                saveDiagram.isPending ||
                updateTiming.isPending
            if (pendingDebounce || pendingMutation) {
                e.preventDefault()
                e.returnValue = ''
                return ''
            }
        }
        window.addEventListener('beforeunload', handler)
        return () => window.removeEventListener('beforeunload', handler)
    }, [savePhase.isPending, saveDiagram.isPending, updateTiming.isPending])

    // Mirror elapsedTime / diagramData / dataFlow / annotations into refs so
    // long-lived intervals and debounced callbacks read fresh values without
    // re-subscribing.
    useEffect(() => { elapsedTimeRef.current = elapsedTime }, [elapsedTime])
    useEffect(() => { diagramDataRef.current = diagramData }, [diagramData])
    useEffect(() => { dataFlowRef.current = dataFlow }, [dataFlow])
    useEffect(() => { annotationsRef.current = annotations }, [annotations])

    // Timer — stop when session is terminal so completed sessions don't keep accumulating
    useEffect(() => {
        if (session?.status === 'COMPLETED' || session?.status === 'ABANDONED') return
        timerRef.current = setInterval(() => setElapsedTime(prev => prev + 1), 1000)
        return () => clearInterval(timerRef.current)
    }, [session?.status])

    // Save timing every 30s — reads elapsedTime / phaseTimings from refs, so
    // the interval is created once per session and not torn down on every tick.
    // phaseTimings is sent too so a tab-close / crash doesn't lose the running
    // delta for the currently-active phase.
    useEffect(() => {
        if (!sessionId) return
        const interval = setInterval(() => {
            if (elapsedTimeRef.current > 0) {
                updateTiming.mutate({
                    sessionId,
                    totalTimeSpent: elapsedTimeRef.current,
                    phaseTimings: phaseTimingsRef.current,
                })
            }
        }, 30000)
        return () => clearInterval(interval)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId])

    function handlePhaseChange(value) {
        if (isReadOnly) return
        const newContent = { ...phaseContent, [activePhase.id]: value }
        setPhaseContent(newContent)
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            savePhase.mutate({ sessionId, phaseId: activePhase.id, content: value })
        }, 1000)
    }

    const handleDiagramChange = useCallback((data) => {
        if (isReadOnly) return
        setDiagramData(data)
        if (diagramDebounceRef.current) clearTimeout(diagramDebounceRef.current)
        diagramDebounceRef.current = setTimeout(() => {
            saveDiagram.mutate({ sessionId, diagramData: data, componentAnnotations: annotations, dataFlowDescription: dataFlow })
        }, 2000)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId, annotations, dataFlow, isReadOnly])

    function handleAnnotationsChange(newAnnotations) {
        if (isReadOnly) return
        setAnnotations(newAnnotations)
        if (annotationsDebounceRef.current) clearTimeout(annotationsDebounceRef.current)
        annotationsDebounceRef.current = setTimeout(() => {
            saveDiagram.mutate({
                sessionId,
                diagramData: diagramDataRef.current,
                componentAnnotations: newAnnotations,
                dataFlowDescription: dataFlowRef.current,
            })
        }, 1500)
    }

    function handleDataFlowChange(newDataFlow) {
        if (isReadOnly) return
        setDataFlow(newDataFlow)
        if (dataFlowDebounceRef.current) clearTimeout(dataFlowDebounceRef.current)
        dataFlowDebounceRef.current = setTimeout(() => {
            saveDiagram.mutate({
                sessionId,
                diagramData: diagramDataRef.current,
                componentAnnotations: annotationsRef.current,
                dataFlowDescription: newDataFlow,
            })
        }, 1500)
    }

    // Single entry point for changing the active phase. Accumulates time spent
    // on the phase being left, persists currentPhase + phaseTimings to the
    // server, clears the AI response panel.
    function handlePhaseSwitch(newIdx) {
        const prevPhaseId = phases[activePhaseIdx]?.id
        if (prevPhaseId) {
            const delta = Math.max(0, elapsedTimeRef.current - phaseEnterTimeRef.current)
            if (delta > 0) {
                const prev = phaseTimingsRef.current[prevPhaseId] || 0
                phaseTimingsRef.current = { ...phaseTimingsRef.current, [prevPhaseId]: prev + delta }
            }
        }
        phaseEnterTimeRef.current = elapsedTimeRef.current
        setActivePhaseIdx(newIdx)
        setAiResponse(null)
        updateTiming.mutate({
            sessionId,
            totalTimeSpent: elapsedTimeRef.current,
            phaseTimings: phaseTimingsRef.current,
            currentPhase: newIdx,
        })
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

    // Accumulate the in-flight delta for the currently-active phase into
    // phaseTimingsRef so the exit save includes it. Idempotent — resets
    // phaseEnterTimeRef to the current elapsed so a repeat call is a no-op.
    function accumulateCurrentPhaseTime() {
        const currentPhaseId = phases[activePhaseIdx]?.id
        if (!currentPhaseId) return
        const delta = Math.max(0, elapsedTimeRef.current - phaseEnterTimeRef.current)
        if (delta > 0) {
            const prev = phaseTimingsRef.current[currentPhaseId] || 0
            phaseTimingsRef.current = { ...phaseTimingsRef.current, [currentPhaseId]: prev + delta }
            phaseEnterTimeRef.current = elapsedTimeRef.current
        }
    }

    async function handlePauseExit() {
        // Flush any pending debounced saves before leaving. Auto-save keeps
        // status at IN_PROGRESS so the session resumes exactly as left.
        if (debounceRef.current) clearTimeout(debounceRef.current)
        if (diagramDebounceRef.current) clearTimeout(diagramDebounceRef.current)
        if (annotationsDebounceRef.current) clearTimeout(annotationsDebounceRef.current)
        if (dataFlowDebounceRef.current) clearTimeout(dataFlowDebounceRef.current)
        accumulateCurrentPhaseTime()
        if (elapsedTimeRef.current > 0) {
            try {
                await updateTiming.mutateAsync({
                    sessionId,
                    totalTimeSpent: elapsedTimeRef.current,
                    phaseTimings: phaseTimingsRef.current,
                    currentPhase: activePhaseIdx,
                })
            } catch { /* ignore */ }
        }
        onBack()
    }

    async function handleCompleteDesign() {
        // Terminal transition — user chooses to finish without running AI eval.
        // For the evaluation-backed completion path, they use "Validate Design" → "Get Final Evaluation".
        if (!window.confirm('Mark this design session as complete? You will no longer be able to edit it.')) return
        try {
            accumulateCurrentPhaseTime()
            if (elapsedTimeRef.current > 0) {
                try {
                    await updateTiming.mutateAsync({
                        sessionId,
                        totalTimeSpent: elapsedTimeRef.current,
                        phaseTimings: phaseTimingsRef.current,
                        currentPhase: activePhaseIdx,
                    })
                } catch { /* ignore */ }
            }
            await updateSessionStatus.mutateAsync({ sessionId, status: 'COMPLETED' })
            onBack()
        } catch { /* handled by hook */ }
    }

    if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><Spinner size="lg" /></div>
    if (!session) return <div className="flex flex-col items-center justify-center h-[60vh] gap-4"><p className="text-text-secondary">Session not found.</p><Button variant="secondary" onClick={onBack}>Back</Button></div>

    const filledPhases = Object.values(phaseContent).filter(v => v && v.trim().length > 30).length
    const canValidate = filledPhases >= 3

    const hasEvaluation = !!session.evaluation

    // Shared "View Problem" nav — rendered in each workspace-mode top bar
    // when this session is linked to a Problem record. Compact button,
    // same visual weight as other nav buttons.
    const viewProblemButton = session.problemId ? (
        <button
            type="button"
            onClick={() => navigate(`/problems/${session.problemId}`)}
            title="View the source problem"
            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border
                       text-text-tertiary bg-surface-3 border-border-default
                       hover:border-brand-line transition-all"
        >
            📋 Problem
        </button>
    ) : null

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
                        {viewProblemButton}
                        <button onClick={() => setWorkspaceMode('design')}
                            className={cn('text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all',
                                'text-text-tertiary bg-surface-3 border-border-default hover:border-brand-line')}>
                            ← Back to Design
                        </button>
                        <button onClick={() => setWorkspaceMode('flow')}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border text-brand-fg-soft bg-brand-soft border-brand-line hover:bg-brand-soft transition-all">
                            Flow Simulation →
                        </button>
                        <button onClick={() => setWorkspaceMode('scale')}
                            className={cn('text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all',
                                'text-brand-fg-soft bg-brand-soft border-brand-line hover:bg-brand-soft')}>
                            Scale Analysis →
                        </button>
                        {hasEvaluation && (
                            <button onClick={() => setWorkspaceMode('evaluation')}
                                className="text-[10px] font-bold px-3 py-1.5 rounded-lg border text-success-fg bg-success-soft border-success-line hover:bg-success-soft transition-all">
                                View Evaluation →
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    <ScenarioTestingView
                        session={session}
                        sessionId={sessionId}
                        isReadOnly={isReadOnly}
                        onEvaluationReady={() => setWorkspaceMode('evaluation')}
                    />
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
                        {viewProblemButton}
                        <button onClick={() => setWorkspaceMode('scenarios')}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border text-text-tertiary bg-surface-3 border-border-default hover:border-brand-line transition-all">
                            ← Back to Scenarios
                        </button>
                        <button onClick={() => setWorkspaceMode('flow')}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border text-brand-fg-soft bg-brand-soft border-brand-line hover:bg-brand-soft transition-all">
                            Flow Simulation →
                        </button>
                        {hasEvaluation && (
                            <button onClick={() => setWorkspaceMode('evaluation')}
                                className="text-[10px] font-bold px-3 py-1.5 rounded-lg border text-success-fg bg-success-soft border-success-line hover:bg-success-soft transition-all">
                                View Evaluation →
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    <ScaleAnalysisView session={session} sessionId={sessionId} isReadOnly={isReadOnly} />
                </div>
            </div>
        )
    }

    // ── FLOW SIMULATION VIEW ─────────────────────────────
    if (workspaceMode === 'flow') {
        return (
            <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-default bg-surface-1 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <button onClick={onBack} className="text-text-tertiary hover:text-text-primary transition-colors">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                        </button>
                        <div>
                            <h2 className="text-sm font-bold text-text-primary">{session.title}</h2>
                            <p className="text-[10px] text-text-disabled">Flow Simulation</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {viewProblemButton}
                        <button onClick={() => setWorkspaceMode('design')}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border text-text-tertiary bg-surface-3 border-border-default hover:border-brand-line transition-all">
                            ← Back to Design
                        </button>
                        {session.scenarios?.length > 0 && (
                            <button onClick={() => setWorkspaceMode('scenarios')}
                                className="text-[10px] font-bold px-3 py-1.5 rounded-lg border text-brand-fg-soft bg-brand-soft border-brand-line hover:bg-brand-soft transition-all">
                                Scenarios →
                            </button>
                        )}
                        <button onClick={() => setWorkspaceMode('scale')}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border text-brand-fg-soft bg-brand-soft border-brand-line hover:bg-brand-soft transition-all">
                            Scale Analysis →
                        </button>
                        {hasEvaluation && (
                            <button onClick={() => setWorkspaceMode('evaluation')}
                                className="text-[10px] font-bold px-3 py-1.5 rounded-lg border text-success-fg bg-success-soft border-success-line hover:bg-success-soft transition-all">
                                View Evaluation →
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    <FlowSimulationView session={session} sessionId={sessionId} isReadOnly={isReadOnly} />
                </div>
            </div>
        )
    }

    // ── EVALUATION RESULTS VIEW ──────────────────────────
    if (workspaceMode === 'evaluation') {
        return (
            <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-default bg-surface-1 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <button onClick={onBack} className="text-text-tertiary hover:text-text-primary transition-colors">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                        </button>
                        <div>
                            <h2 className="text-sm font-bold text-text-primary">{session.title}</h2>
                            <p className="text-[10px] text-text-disabled">Final Evaluation</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {viewProblemButton}
                        {session.scenarios?.length > 0 && (
                            <button onClick={() => setWorkspaceMode('scenarios')}
                                className="text-[10px] font-bold px-3 py-1.5 rounded-lg border text-text-tertiary bg-surface-3 border-border-default hover:border-brand-line transition-all">
                                ← Scenarios
                            </button>
                        )}
                        <button onClick={() => setWorkspaceMode('flow')}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border text-text-tertiary bg-surface-3 border-border-default hover:border-brand-line transition-all">
                            Flows
                        </button>
                        <button onClick={() => setWorkspaceMode('design')}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border text-text-tertiary bg-surface-3 border-border-default hover:border-brand-line transition-all">
                            View Design
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    <EvaluationResultsView session={session} />
                </div>
            </div>
        )
    }

    // ── DESIGN VIEW (default) ────────────────────────────
    return (
        <DesignView
            session={session}
            sessionId={sessionId}
            phases={phases}
            activePhase={activePhase}
            activePhaseIdx={activePhaseIdx}
            phaseContent={phaseContent}
            diagramData={diagramData}
            annotations={annotations}
            dataFlow={dataFlow}
            aiResponse={aiResponse}
            setAiResponse={setAiResponse}
            elapsedTime={elapsedTime}
            panelHeight={panelHeight}
            annotationsCollapsed={annotationsCollapsed}
            setAnnotationsCollapsed={setAnnotationsCollapsed}
            dataFlowCollapsed={dataFlowCollapsed}
            setDataFlowCollapsed={setDataFlowCollapsed}
            isReadOnly={isReadOnly}
            hasEvaluation={hasEvaluation}
            canValidate={canValidate}
            onBack={onBack}
            onPhaseChange={handlePhaseChange}
            onDiagramChange={handleDiagramChange}
            onAnnotationsChange={handleAnnotationsChange}
            onDataFlowChange={handleDataFlowChange}
            onPhaseSwitch={handlePhaseSwitch}
            onDragStart={handleDragStart}
            onPauseExit={handlePauseExit}
            onCompleteDesign={handleCompleteDesign}
            onStartValidation={handleStartValidation}
            onSwitchMode={setWorkspaceMode}
            savePhase={savePhase}
            saveDiagram={saveDiagram}
            updateTiming={updateTiming}
            generateScenarios={generateScenarios}
            updateSessionStatus={updateSessionStatus}
        />
    )
}
