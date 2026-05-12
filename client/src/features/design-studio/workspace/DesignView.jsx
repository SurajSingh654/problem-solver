import { useNavigate } from 'react-router-dom'
import { ExcalidrawEditor } from '@components/ui/ExcalidrawEditor'
import { Button } from '@components/ui/Button'
import { cn } from '@utils/cn'
import AICoachSection from './panels/AICoachSection'
import DataFlowPanel from './panels/DataFlowPanel'
import ComponentAnnotationsPanel from './panels/ComponentAnnotationsPanel'
import { formatTime } from '../constants/phases'

// ══════════════════════════════════════════════════════════════════════════
// DESIGN VIEW — two-column layout
//
// LEFT (flex-1):  Excalidraw canvas on top, phase-text editor on bottom,
//                 horizontal resize handle between them. Canvas gets the
//                 visual real-estate it needs for diagram work; textarea
//                 keeps its own resizable space below.
//
// RIGHT (rail):   Fixed-width context rail with three sections, top to
//                 bottom: AI Coach (pinned, always visible), Data Flow
//                 (collapsible), Component Annotations (collapsible).
//                 This is the fix for the hidden-coach / hidden-panels
//                 discoverability problem in the old layout, where the
//                 Coach and helper panels were buried below the canvas.
// ══════════════════════════════════════════════════════════════════════════
export default function DesignView({
    session,
    sessionId,
    phases,
    activePhase,
    activePhaseIdx,
    phaseContent,
    diagramData,
    annotations,
    dataFlow,
    aiResponse,
    setAiResponse,
    elapsedTime,
    panelHeight,
    annotationsCollapsed,
    setAnnotationsCollapsed,
    dataFlowCollapsed,
    setDataFlowCollapsed,
    isReadOnly,
    hasEvaluation,
    canValidate,
    onBack,
    onPhaseChange,
    onDiagramChange,
    onAnnotationsChange,
    onDataFlowChange,
    onPhaseSwitch,
    onDragStart,
    onPauseExit,
    onCompleteDesign,
    onStartValidation,
    onSwitchMode,
    savePhase,
    saveDiagram,
    updateTiming,
    generateScenarios,
    updateSessionStatus,
}) {
    const navigate = useNavigate()

    return (
        <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden">
            {isReadOnly && (
                <div className={cn(
                    'flex items-center justify-center gap-2 py-1.5 text-[10px] font-bold uppercase tracking-widest border-b',
                    session.status === 'ABANDONED'
                        ? 'bg-surface-3 text-text-disabled border-border-default'
                        : 'bg-success-soft text-success-fg border-success-line'
                )}>
                    {session.status === 'ABANDONED' ? '⏸ Abandoned — read-only' : '🔒 Completed — read-only'}
                </div>
            )}

            {/* Top Bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-default bg-surface-1 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <button onClick={onBack} className="text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                    </button>
                    <div className="min-w-0">
                        <h2 className="text-sm font-bold text-text-primary truncate">{session.title}</h2>
                        <p className="text-[10px] text-text-disabled">
                            {session.designType === 'SYSTEM_DESIGN' ? '🏗️ System Design' : '🔧 LLD'} · {session.difficulty}
                        </p>
                    </div>
                </div>

                {/* Phase dots */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    {phases.map((phase, idx) => {
                        const hasContent = (phaseContent[phase.id] || '').trim().length > 20
                        const isActive = idx === activePhaseIdx
                        return (
                            <button key={phase.id} onClick={() => onPhaseSwitch(idx)} title={phase.label}
                                className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all',
                                    isActive ? 'bg-brand-400 text-white scale-110' : hasContent ? 'bg-success-soft text-success-fg border border-success-line' : 'bg-surface-3 text-text-disabled border border-border-default hover:border-brand-line')}>
                                {phase.icon}
                            </button>
                        )
                    })}
                </div>

                {/* Timer + Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-mono text-text-disabled">{formatTime(elapsedTime)}</span>
                    <span className={cn('w-2 h-2 rounded-full', savePhase.isPending || saveDiagram.isPending ? 'bg-warning animate-pulse' : 'bg-success')} />
                    <Button variant="ghost" size="sm" onClick={onPauseExit} loading={updateTiming.isPending}>
                        Pause &amp; Exit
                    </Button>
                    {session.problemId && (
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/problems/${session.problemId}`)}>
                            📋 Problem
                        </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => onSwitchMode('flow')}>
                        Flows
                    </Button>
                    {!isReadOnly && (
                        <Button variant="secondary" size="sm" onClick={onCompleteDesign} loading={updateSessionStatus.isPending}>
                            Complete Design
                        </Button>
                    )}
                    {!isReadOnly && canValidate && session.status === 'IN_PROGRESS' && (
                        <Button variant="primary" size="sm" loading={generateScenarios.isPending} onClick={onStartValidation}>
                            Validate Design →
                        </Button>
                    )}
                    {session.status === 'VALIDATING' && (
                        <Button variant="secondary" size="sm" onClick={() => onSwitchMode('scenarios')}>
                            View Scenarios →
                        </Button>
                    )}
                    {hasEvaluation && (
                        <Button variant="secondary" size="sm" onClick={() => onSwitchMode('evaluation')}>
                            View Evaluation →
                        </Button>
                    )}
                </div>
            </div>

            {/* ── Main two-column body ─────────────────────────────────── */}
            <div className="flex-1 min-h-0 flex">
                {/* ── LEFT: canvas + textarea (stacked, resizable) ────── */}
                <div className="flex-1 min-w-0 flex flex-col">
                    {/* Canvas */}
                    <div style={{ height: `${100 - panelHeight}%` }} className="flex-shrink-0 relative">
                        <ExcalidrawEditor onChange={onDiagramChange} initialData={diagramData} viewModeEnabled={isReadOnly} />
                    </div>

                    {/* Resize handle (horizontal — between canvas and textarea) */}
                    <div
                        onMouseDown={onDragStart}
                        className="h-2 bg-surface-2 border-y border-border-default cursor-row-resize flex items-center justify-center hover:bg-brand-soft transition-colors flex-shrink-0 group"
                        title="Drag to resize canvas / notes"
                    >
                        <div className="w-8 h-0.5 bg-border-strong group-hover:bg-brand-400 rounded-full transition-colors" />
                    </div>

                    {/* Phase text editor */}
                    <div style={{ height: `${panelHeight}%` }} className="flex flex-col overflow-hidden bg-surface-1">
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-default flex-shrink-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="text-base flex-shrink-0">{activePhase.icon}</span>
                                <div className="min-w-0">
                                    <span className="text-xs font-bold text-text-primary">{activePhase.label}</span>
                                    <p className="text-[10px] text-text-disabled truncate">{activePhase.hint}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-[10px] text-text-disabled">{activePhaseIdx + 1} / {phases.length}</span>
                                {activePhaseIdx > 0 && (
                                    <button onClick={() => onPhaseSwitch(activePhaseIdx - 1)} className="text-text-tertiary hover:text-text-primary p-1">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
                                    </button>
                                )}
                                {activePhaseIdx < phases.length - 1 && (
                                    <button onClick={() => onPhaseSwitch(activePhaseIdx + 1)} className="text-text-tertiary hover:text-text-primary p-1">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
                            <textarea
                                value={phaseContent[activePhase.id] || ''}
                                onChange={e => onPhaseChange(e.target.value)}
                                readOnly={isReadOnly}
                                placeholder={isReadOnly ? '(not filled in)' : `Write your ${activePhase.label.toLowerCase()} here...`}
                                className={cn(
                                    'w-full h-full min-h-[120px] bg-transparent text-sm text-text-primary placeholder:text-text-disabled outline-none resize-none leading-relaxed',
                                    isReadOnly && 'cursor-default opacity-90'
                                )}
                            />
                        </div>
                    </div>
                </div>

                {/* ── RIGHT: context rail ───────────────────────────── */}
                {/* Fixed width so canvas gets consistent real estate. */}
                {/* Width tuning: 320px on md/lg, 360px on xl — tight enough to keep */}
                {/* canvas primary, wide enough for coach response readability. */}
                <aside className="w-[320px] xl:w-[360px] flex-shrink-0 flex flex-col border-l border-border-default bg-surface-1 min-h-0">
                    {/* AI Coach — pinned top, takes the bulk of the rail */}
                    <div className="flex-1 min-h-0 flex flex-col">
                        <AICoachSection
                            sessionId={sessionId}
                            phaseId={activePhase.id}
                            phases={phases}
                            aiInteractions={session.aiInteractions || []}
                            response={aiResponse}
                            onResponse={setAiResponse}
                            onDismiss={() => setAiResponse(null)}
                            isReadOnly={isReadOnly}
                        />
                    </div>

                    {/* Data Flow — collapsible */}
                    <div className="flex-shrink-0">
                        <DataFlowPanel
                            value={dataFlow}
                            onChange={onDataFlowChange}
                            isCollapsed={dataFlowCollapsed}
                            onToggle={() => setDataFlowCollapsed(v => !v)}
                            isReadOnly={isReadOnly}
                        />
                    </div>

                    {/* Component Annotations — collapsible */}
                    <div className="flex-shrink-0">
                        <ComponentAnnotationsPanel
                            annotations={annotations}
                            onChange={onAnnotationsChange}
                            isCollapsed={annotationsCollapsed}
                            onToggle={() => setAnnotationsCollapsed(v => !v)}
                            isReadOnly={isReadOnly}
                        />
                    </div>
                </aside>
            </div>
        </div>
    )
}
