// ── Phase definitions ──────────────────────────────────────────────────
export const SD_PHASES = [
    { id: 'requirements', label: 'Requirements', icon: '📋', hint: 'What must the system do? What are the scale constraints?' },
    { id: 'capacityEstimation', label: 'Estimation', icon: '🔢', hint: 'Back-of-envelope: QPS, storage, bandwidth' },
    { id: 'apiDesign', label: 'API Design', icon: '🔌', hint: 'Define endpoints, request/response shapes' },
    { id: 'dataModel', label: 'Data Model', icon: '🗄️', hint: 'Tables, relationships, indexes, access patterns' },
    { id: 'architecture', label: 'Architecture', icon: '🏗️', hint: 'Draw components on the canvas above, describe data flow here' },
    { id: 'deepDive', label: 'Deep Dive', icon: '🔬', hint: 'Pick 2-3 components and explain in detail' },
    { id: 'tradeoffs', label: 'Trade-offs', icon: '⚖️', hint: 'Decisions made, costs acknowledged, failure modes' },
]

export const LLD_PHASES = [
    { id: 'requirements', label: 'Requirements', icon: '📋', hint: 'What must the system do at object level?' },
    { id: 'entities', label: 'Entities', icon: '📦', hint: 'Identify classes with single responsibilities' },
    { id: 'classHierarchy', label: 'Hierarchy', icon: '🗂️', hint: 'Inheritance vs composition, interfaces' },
    { id: 'designPatterns', label: 'Patterns', icon: '🧩', hint: 'Which patterns and structural justification' },
    { id: 'methodSignatures', label: 'Methods', icon: '💻', hint: 'Key method signatures and algorithms' },
    { id: 'solidAnalysis', label: 'SOLID', icon: '🏛️', hint: 'Per-principle analysis, honest about violations' },
]

export function formatTime(seconds) {
    if (!seconds) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
}

// Shared session status chip config — used by SessionListView + ProblemPracticeView.
export const STATUS_CONFIG = {
    IN_PROGRESS: { label: 'In Progress', color: 'text-brand-fg-soft bg-brand-soft border-brand-line' },
    VALIDATING: { label: 'Validating', color: 'text-warning-fg bg-warning-soft border-warning-line' },
    COMPLETED: { label: 'Completed', color: 'text-success-fg bg-success-soft border-success-line' },
    ABANDONED: { label: 'Abandoned', color: 'text-text-disabled bg-surface-3 border-border-default' },
}

// Evaluation dimension labels — used by EvaluationResultsView.
export const SD_DIMENSION_LABELS = {
    requirementsCompleteness: { label: 'Requirements', icon: '📋' },
    estimationSoundness: { label: 'Estimation', icon: '🔢' },
    apiDesignQuality: { label: 'API Design', icon: '🔌' },
    dataModelCorrectness: { label: 'Data Model', icon: '🗄️' },
    architectureCoherence: { label: 'Architecture', icon: '🏗️' },
    deepDiveDepth: { label: 'Deep Dive', icon: '🔬' },
    tradeoffAwareness: { label: 'Trade-offs', icon: '⚖️' },
    scenarioResilience: { label: 'Resilience', icon: '🛡️' },
    scaleReadiness: { label: 'Scale', icon: '📈' },
    communicationClarity: { label: 'Clarity', icon: '💬' },
}

export const LLD_DIMENSION_LABELS = {
    requirementsCompleteness: { label: 'Requirements', icon: '📋' },
    entityIdentification: { label: 'Entities', icon: '📦' },
    hierarchyCorrectness: { label: 'Hierarchy', icon: '🗂️' },
    patternApplication: { label: 'Patterns', icon: '🧩' },
    solidCompliance: { label: 'SOLID', icon: '🏛️' },
    implementationQuality: { label: 'Implementation', icon: '💻' },
    extensibilityScore: { label: 'Extensibility', icon: '🔧' },
    scenarioResilience: { label: 'Resilience', icon: '🛡️' },
    edgeCaseAwareness: { label: 'Edge Cases', icon: '⚠️' },
    communicationClarity: { label: 'Clarity', icon: '💬' },
}

export function scoreColor(score) {
    if (score >= 8) return { text: 'text-success-fg', bar: 'bg-success', bg: 'bg-success-soft', border: 'border-success-line' }
    if (score >= 6) return { text: 'text-brand-fg-soft', bar: 'bg-brand-400', bg: 'bg-brand-soft', border: 'border-brand-line' }
    if (score >= 4) return { text: 'text-warning-fg', bar: 'bg-warning', bg: 'bg-warning-soft', border: 'border-warning-line' }
    return { text: 'text-danger-fg', bar: 'bg-danger', bg: 'bg-danger-soft', border: 'border-danger-line' }
}
