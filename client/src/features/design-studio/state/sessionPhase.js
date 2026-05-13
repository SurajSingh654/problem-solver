// ============================================================================
// sessionPhase — pure reducer over the server session object
// ============================================================================
//
// The old code kept a local `workspaceMode` state ('design' | 'scenarios' |
// 'scale' | 'flow' | 'evaluation') alongside the server-authoritative
// `session.status` ('IN_PROGRESS' | 'VALIDATING' | 'COMPLETED' |
// 'ABANDONED'). Two state machines, two sources of truth, and zero guards
// against them drifting — e.g. `status=VALIDATING` with `scenarios=[]`
// (scenario generation half-succeeded) would leave the UI in a
// "scenarios" mode with nothing to render.
//
// This reducer is the single source of truth for "what lifecycle phase
// is this session in?". `view` (the workspace sub-page the user is
// looking at) is a SEPARATE concern — it's a URL search param so the
// user can deep-link / back-button. The reducer gates which views are
// accessible for each phase, so we never render a mode the session
// can't support.
//
// Phases are intentionally DERIVED, not stored. Whenever the server
// session object changes, the phase re-derives. No local state to drift.
// ============================================================================

/**
 * @typedef {'designing' | 'validating' | 'evaluated' | 'completed-no-eval' | 'abandoned'} SessionPhaseKind
 */

/**
 * Map a session object to a single SessionPhase discriminated union.
 *
 * @param {object|null|undefined} session — the server session or null
 * @returns {{ kind: SessionPhaseKind } & object}
 */
export function getSessionPhase(session) {
    if (!session) return { kind: 'designing' } // safe default; caller should also handle loading

    const hasScenarios = Array.isArray(session.scenarios) && session.scenarios.length > 0
    const hasEvaluation = !!session.evaluation

    // Terminal states are checked first.
    if (session.status === 'ABANDONED') {
        return { kind: 'abandoned' }
    }
    if (session.status === 'COMPLETED') {
        if (hasEvaluation) {
            return { kind: 'evaluated', evaluation: session.evaluation, scenarios: session.scenarios || [] }
        }
        // COMPLETED without an evaluation: user marked the session done
        // without going through the AI-eval path. Show their work read-only.
        return { kind: 'completed-no-eval', scenarios: session.scenarios || [] }
    }
    // Non-terminal states.
    if (session.status === 'VALIDATING' || hasScenarios) {
        // Includes the drift case: status=IN_PROGRESS but scenarios were
        // somehow generated. Treat as validating — the user has scenarios
        // to work through.
        return { kind: 'validating', scenarios: session.scenarios || [] }
    }
    return { kind: 'designing' }
}

// Allowed workspace views per phase. The main workspace has five sub-views
// (design canvas, scenario testing, scale analysis, flow simulation,
// evaluation results). Not all views are reachable in every phase — e.g.
// a 'designing' session has no scenarios to render yet.
// `reference` is conditionally accessible: always allowed once the
// session has reached validating/evaluated/completed-no-eval/abandoned,
// and conditionally allowed in `designing` only if filledPhases >= 4
// (gated at the DesignWorkspace level since it needs phase content).
// Allowing it in ALLOWED_VIEWS means deep-links to ?view=reference work
// once unlocked without throwing the user back to the default view.
const ALLOWED_VIEWS = {
    designing:           ['design', 'scale', 'flow', 'reference'],
    validating:          ['design', 'scenarios', 'scale', 'flow', 'reference'],
    evaluated:           ['design', 'scenarios', 'scale', 'flow', 'evaluation', 'reference'],
    'completed-no-eval': ['design', 'scenarios', 'scale', 'flow', 'reference'],
    abandoned:           ['design', 'scenarios', 'scale', 'flow', 'reference'],
}

/**
 * Given a phase and a requested view (from URL param), return the view
 * to actually render. Falls back to the phase's default if the requested
 * view isn't accessible — prevents deep-links to stale views (e.g.
 * `?view=evaluation` on a session that's no longer evaluated).
 */
export function resolveView(phase, requestedView) {
    const allowed = ALLOWED_VIEWS[phase.kind] || ALLOWED_VIEWS.designing
    if (requestedView && allowed.includes(requestedView)) return requestedView
    return defaultViewFor(phase)
}

/**
 * The view the workspace opens to when no `?view=` param is set, chosen
 * to put the user on the most recent meaningful work surface.
 */
export function defaultViewFor(phase) {
    switch (phase.kind) {
        case 'evaluated': return 'evaluation'
        case 'validating': return phase.scenarios?.length > 0 ? 'scenarios' : 'design'
        case 'completed-no-eval': return phase.scenarios?.length > 0 ? 'scenarios' : 'design'
        case 'abandoned': return 'design'
        case 'designing':
        default: return 'design'
    }
}

/** True iff the phase is terminal — UI should render read-only. */
export function isTerminal(phase) {
    return phase.kind === 'abandoned' || phase.kind === 'evaluated' || phase.kind === 'completed-no-eval'
}
