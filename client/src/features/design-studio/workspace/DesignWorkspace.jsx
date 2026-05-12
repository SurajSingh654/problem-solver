import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
import SessionErrorView from '../views/SessionErrorView'
import { SD_PHASES, LLD_PHASES } from '../constants/phases'
import { useSaveCoordinator } from '../hooks/useSaveCoordinator'
import { usePhaseTimer } from '../hooks/usePhaseTimer'
import { getSessionPhase, resolveView, defaultViewFor, isTerminal } from '../state/sessionPhase'

// 30-second heartbeat for long-idle sessions so totalTimeSpent stays fresh
// even when the user is thinking in a single phase without touching the
// canvas or textarea. Purely additive — the coordinator also saves
// timing on every phase switch and on pause/exit.
const HEARTBEAT_MS = 30_000

// ══════════════════════════════════════════════════════════════════════════
// DESIGN WORKSPACE — shell around the five view modes + the save coordinator
// ══════════════════════════════════════════════════════════════════════════
export default function DesignWorkspace({ sessionId, onBack }) {
    const navigate = useNavigate()
    const { data: session, isLoading, isError, error: fetchError, refetch } = useDesignSession(sessionId)

    const savePhase = useSavePhase()
    const saveDiagram = useSaveDiagram()
    const updateTiming = useUpdateTiming()
    const generateScenarios = useGenerateScenarios()
    const updateSessionStatus = useUpdateSessionStatus()

    const coordinator = useSaveCoordinator({
        sessionId,
        savePhaseMutation: savePhase,
        saveDiagramMutation: saveDiagram,
        updateTimingMutation: updateTiming,
    })

    // Local editable state — source of truth for what the user is editing
    // right now. Seeded ONCE from server on first load; refetches don't
    // clobber it (see seed effect below).
    const [activePhaseIdx, setActivePhaseIdx] = useState(0)
    const [phaseContent, setPhaseContent] = useState({})
    const [diagramData, setDiagramData] = useState(null)
    const [annotations, setAnnotations] = useState([])
    const [dataFlow, setDataFlow] = useState('')
    const [aiResponse, setAiResponse] = useState(null)
    const [panelHeight, setPanelHeight] = useState(35)
    const [annotationsCollapsed, setAnnotationsCollapsed] = useState(true)
    const [dataFlowCollapsed, setDataFlowCollapsed] = useState(true)
    // View lives in the URL (?view=design|scenarios|scale|flow|evaluation)
    // so deep-links and browser back/forward work. Gating is done via
    // the sessionPhase reducer — requests for views not allowed in the
    // current phase fall back to the phase's default.
    const [searchParams, setSearchParams] = useSearchParams()

    const dragRef = useRef(null)
    const initializedRef = useRef(false)

    // Mirror refs for the three diagram-scope fields. Handlers write to
    // the ref EAGERLY (same tick as setState) so a subsequent handler in
    // the same tick sees the fresh value. Without this, two rapid edits
    // in different fields (annotations then dataFlow) would have the
    // second handler read stale `annotations` from closure — its
    // queueDiagram call would overwrite the store's pending payload with
    // the stale annotations, silently losing the first edit.
    const diagramDataRef = useRef(null)
    const annotationsRef = useRef([])
    const dataFlowRef = useRef('')

    const phases = session?.designType === 'SYSTEM_DESIGN' ? SD_PHASES : LLD_PHASES
    const activePhase = phases[activePhaseIdx]

    // Lifecycle phase + workspace view are derived from the server
    // session (phase) + URL (view). Single source of truth; no local
    // workspaceMode state to drift out of sync.
    const sessionPhase = useMemo(() => getSessionPhase(session), [session])
    const requestedView = searchParams.get('view')
    const view = resolveView(sessionPhase, requestedView)
    const setView = useCallback((nextView) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            // Omit the param when the target matches the phase default to
            // keep URLs clean.
            if (nextView === defaultViewFor(sessionPhase)) {
                next.delete('view')
            } else {
                next.set('view', nextView)
            }
            return next
        }, { replace: true })
    }, [setSearchParams, sessionPhase])

    const isReadOnly = isTerminal(sessionPhase)

    // Phase timer owns elapsedTime + phaseTimings. Hooks up AFTER phases
    // are derived so it knows what phaseId to attribute time to.
    const initialActiveIdx = Math.min(
        Math.max(0, session?.currentPhase || 0),
        phases.length - 1,
    )
    const { elapsedTime, recordPhaseExit, setActivePhaseId, buildTimingPayload } = usePhaseTimer({
        session,
        phases,
        initialActiveIdx,
    })

    // Seed local editable state from the server ONCE, on first session load.
    // Subsequent session refetches (triggered by mutations) must NOT overwrite
    // local state or we'll clobber in-flight keystrokes.
    useEffect(() => {
        if (!session || initializedRef.current) return
        initializedRef.current = true
        setPhaseContent(session.phases || {})
        setDiagramData(session.diagramData || null)
        setAnnotations(session.componentAnnotations || [])
        setDataFlow(session.dataFlowDescription || '')
        // Seed the mirror refs too so the first edit reads correct values.
        diagramDataRef.current = session.diagramData || null
        annotationsRef.current = session.componentAnnotations || []
        dataFlowRef.current = session.dataFlowDescription || ''
        const startIdx = Math.min(
            Math.max(0, session.currentPhase || 0),
            (session.designType === 'SYSTEM_DESIGN' ? SD_PHASES : LLD_PHASES).length - 1,
        )
        setActivePhaseIdx(startIdx)
        setActivePhaseId(
            (session.designType === 'SYSTEM_DESIGN' ? SD_PHASES : LLD_PHASES)[startIdx]?.id ?? null,
        )
        // Workspace view is derived via `resolveView(sessionPhase, ?view)`
        // — no local seeding needed. Refetches no longer clobber the view.
    }, [session, setActivePhaseId])

    // beforeunload guard — warn the user if anything is pending. The
    // coordinator handles `inflightScope` AND pending queues uniformly via
    // hasPending(); the old code had to OR four debounce refs manually.
    useEffect(() => {
        const handler = (e) => {
            if (coordinator.hasPending()) {
                e.preventDefault()
                e.returnValue = ''
                return ''
            }
        }
        window.addEventListener('beforeunload', handler)
        return () => window.removeEventListener('beforeunload', handler)
    }, [coordinator])

    // 30-second timing heartbeat so long-idle sessions still persist
    // totalTimeSpent. Routed through the coordinator (not a direct
    // mutation) so it queues correctly if another save is in flight.
    useEffect(() => {
        if (!sessionId) return
        if (session?.status === 'COMPLETED' || session?.status === 'ABANDONED') return
        const i = setInterval(() => {
            coordinator.queueTiming(buildTimingPayload(activePhaseIdx))
        }, HEARTBEAT_MS)
        return () => clearInterval(i)
    }, [sessionId, session?.status, activePhaseIdx, coordinator, buildTimingPayload])

    // ── Edit handlers ────────────────────────────────────────────────────
    // Each handler updates LOCAL state for instant UI feedback and enqueues
    // the save into the coordinator. Debouncing, coalescing, in-flight
    // lock, and flush-on-exit are all handled by the coordinator.

    function handlePhaseChange(value) {
        if (isReadOnly) return
        setPhaseContent((prev) => ({ ...prev, [activePhase.id]: value }))
        coordinator.queuePhase(activePhase.id, value)
    }

    function handleDiagramChange(data) {
        if (isReadOnly) return
        diagramDataRef.current = data
        setDiagramData(data)
        // Always send FULL diagram state — server PATCH overwrites all
        // three fields, and passing stale/missing ones would wipe them.
        coordinator.queueDiagram({
            diagramData: data,
            annotations: annotationsRef.current,
            dataFlow: dataFlowRef.current,
        })
    }

    function handleAnnotationsChange(newAnnotations) {
        if (isReadOnly) return
        annotationsRef.current = newAnnotations
        setAnnotations(newAnnotations)
        coordinator.queueDiagram({
            diagramData: diagramDataRef.current,
            annotations: newAnnotations,
            dataFlow: dataFlowRef.current,
        })
    }

    function handleDataFlowChange(newDataFlow) {
        if (isReadOnly) return
        dataFlowRef.current = newDataFlow
        setDataFlow(newDataFlow)
        coordinator.queueDiagram({
            diagramData: diagramDataRef.current,
            annotations: annotationsRef.current,
            dataFlow: newDataFlow,
        })
    }

    function handlePhaseSwitch(newIdx) {
        // Move the phase-timer sentinel BEFORE changing React state so the
        // delta is attributed to the correct phaseId.
        setActivePhaseId(phases[newIdx]?.id ?? null)
        setActivePhaseIdx(newIdx)
        setAiResponse(null)
        // Phase switch is a meaningful checkpoint — flush timing right away
        // so the server knows where the user is if they close the tab.
        coordinator.queueTiming(buildTimingPayload(newIdx), { immediate: true })
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
            await coordinator.flushAll()
            await generateScenarios.mutateAsync(sessionId)
            await refetch()
            setView('scenarios')
        } catch { /* handled */ }
    }

    async function handlePauseExit() {
        // Record the in-flight phase delta so it's included in the final
        // timing save. Idempotent — safe even if the user clicked
        // mid-second.
        recordPhaseExit()
        coordinator.queueTiming(buildTimingPayload(activePhaseIdx))
        // Flush everything pending before navigating away. awaits the
        // coordinator's drain loop.
        try { await coordinator.flushAll() } catch { /* saveError already set */ }
        onBack()
    }

    async function handleCompleteDesign() {
        if (!window.confirm('Mark this design session as complete? You will no longer be able to edit it.')) return
        try {
            recordPhaseExit()
            coordinator.queueTiming(buildTimingPayload(activePhaseIdx))
            await coordinator.flushAll()
            await updateSessionStatus.mutateAsync({ sessionId, status: 'COMPLETED' })
            onBack()
        } catch { /* handled by hook */ }
    }

    if (isLoading) return <div className="flex items-center justify-center h-[60vh]"><Spinner size="lg" /></div>
    // Fetch error branch — replaces the old infinite-spinner behaviour on
    // 401/403/404/network failure. SessionErrorView picks a user-friendly
    // title + hint from the status code; retry where meaningful.
    if (isError) return <SessionErrorView error={fetchError} onRetry={() => refetch()} onBack={onBack} />
    if (!session) return <div className="flex flex-col items-center justify-center h-[60vh] gap-4"><p className="text-text-secondary">Session not found.</p><Button variant="secondary" onClick={onBack}>Back</Button></div>

    const filledPhases = Object.values(phaseContent).filter(v => v && v.trim().length > 30).length
    const canValidate = filledPhases >= 3

    const hasEvaluation = !!session.evaluation

    // Legacy props — DesignView reads `savePhase`/`saveDiagram`/`updateTiming`
    // `.isPending` to draw the green/warning save-status dot. Replace with a
    // single `isSaving` derived from the coordinator so the UI matches the
    // actual in-flight state.
    const isSaving = coordinator.status === 'saving'
    const savePhaseShim = { isPending: isSaving }
    const saveDiagramShim = { isPending: isSaving }
    const updateTimingShim = { isPending: isSaving }

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
    if (view === 'scenarios') {
        return (
            <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden">
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
                        <button onClick={() => setView('design')}
                            className={cn('text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all',
                                'text-text-tertiary bg-surface-3 border-border-default hover:border-brand-line')}>
                            ← Back to Design
                        </button>
                        <button onClick={() => setView('flow')}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border text-brand-fg-soft bg-brand-soft border-brand-line hover:bg-brand-soft transition-all">
                            Flow Simulation →
                        </button>
                        <button onClick={() => setView('scale')}
                            className={cn('text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all',
                                'text-brand-fg-soft bg-brand-soft border-brand-line hover:bg-brand-soft')}>
                            Scale Analysis →
                        </button>
                        {hasEvaluation && (
                            <button onClick={() => setView('evaluation')}
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
                        onEvaluationReady={() => setView('evaluation')}
                    />
                </div>
            </div>
        )
    }

    // ── SCALE ANALYSIS VIEW ──────────────────────────────
    if (view === 'scale') {
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
                        <button onClick={() => setView('scenarios')}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border text-text-tertiary bg-surface-3 border-border-default hover:border-brand-line transition-all">
                            ← Back to Scenarios
                        </button>
                        <button onClick={() => setView('flow')}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border text-brand-fg-soft bg-brand-soft border-brand-line hover:bg-brand-soft transition-all">
                            Flow Simulation →
                        </button>
                        {hasEvaluation && (
                            <button onClick={() => setView('evaluation')}
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
    if (view === 'flow') {
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
                        <button onClick={() => setView('design')}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border text-text-tertiary bg-surface-3 border-border-default hover:border-brand-line transition-all">
                            ← Back to Design
                        </button>
                        {session.scenarios?.length > 0 && (
                            <button onClick={() => setView('scenarios')}
                                className="text-[10px] font-bold px-3 py-1.5 rounded-lg border text-brand-fg-soft bg-brand-soft border-brand-line hover:bg-brand-soft transition-all">
                                Scenarios →
                            </button>
                        )}
                        <button onClick={() => setView('scale')}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border text-brand-fg-soft bg-brand-soft border-brand-line hover:bg-brand-soft transition-all">
                            Scale Analysis →
                        </button>
                        {hasEvaluation && (
                            <button onClick={() => setView('evaluation')}
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
    if (view === 'evaluation') {
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
                            <button onClick={() => setView('scenarios')}
                                className="text-[10px] font-bold px-3 py-1.5 rounded-lg border text-text-tertiary bg-surface-3 border-border-default hover:border-brand-line transition-all">
                                ← Scenarios
                            </button>
                        )}
                        <button onClick={() => setView('flow')}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border text-text-tertiary bg-surface-3 border-border-default hover:border-brand-line transition-all">
                            Flows
                        </button>
                        <button onClick={() => setView('design')}
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
            onSwitchMode={setView}
            savePhase={savePhaseShim}
            saveDiagram={saveDiagramShim}
            updateTiming={updateTimingShim}
            generateScenarios={generateScenarios}
            updateSessionStatus={updateSessionStatus}
        />
    )
}
