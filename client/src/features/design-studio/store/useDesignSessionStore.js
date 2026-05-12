// ============================================================================
// Per-session autosave outbox — Zustand
// ============================================================================
//
// The old workspace had four independent `setTimeout` refs (phase text,
// diagram, annotations, data flow) that each fired their own mutation.
// When a user edited annotations and then quickly clicked a new phase,
// two independent saveDiagram calls could be in flight simultaneously
// with PARTIAL PAYLOADS built from stale closures — last-arrival-wins at
// the server, not last-keystroke. This store replaces that with a single
// coalesced outbox: every scope has at most one pending payload, at most
// one save in flight, and edits arriving during a save queue cleanly.
//
// Semantics per scope:
//   - `pendingPhase` is a map keyed by phaseId so edits to different
//     phases don't clobber each other; writes to the same phaseId
//     coalesce by last-write-wins (which is what we want — the user's
//     latest content is authoritative).
//   - `pendingDiagram` is a single object holding the FULL latest diagram
//     state (diagramData + annotations + dataFlow). Callers always pass
//     all three; coalescing is last-write-wins on the whole object.
//     Server PATCH overwrites all three fields, so we must always send
//     all three.
//   - `pendingTiming` is a single object; same pattern.
//
// `clearXIfMatches(snapshot)` is the subtle bit: after a save completes,
// we only clear the pending slot if the content is STILL what we sent.
// If the user edited during the save, the newer edit is preserved in
// the outbox for the next flush. This is the classic outbox pattern for
// at-least-once delivery without overwriting mid-flight edits.
// ============================================================================

import { create } from 'zustand'

export const useDesignSessionStore = create((set) => ({
    sessionId: null,

    // Per-scope pending payloads. `null` == nothing to send.
    pendingPhase: null,      // { [phaseId]: content } | null
    pendingDiagram: null,    // { diagramData, annotations, dataFlow } | null
    pendingTiming: null,     // { totalTimeSpent, phaseTimings, currentPhase? } | null

    // Single-save-at-a-time lock. `null` == idle. Values: 'phase', 'diagram', 'timing'.
    inflightScope: null,
    lastSaved: 0,
    saveError: null,

    // Reset on session change. Callers (`useSaveCoordinator`) invoke this
    // in an effect keyed on sessionId to prevent state from leaking between
    // sessions on rapid back→open navigation.
    reset: (sessionId) => set({
        sessionId,
        pendingPhase: null,
        pendingDiagram: null,
        pendingTiming: null,
        inflightScope: null,
        saveError: null,
    }),

    // ── Queue actions ────────────────────────────────────────────────────
    queuePhase: (phaseId, content) => set((s) => ({
        pendingPhase: { ...(s.pendingPhase || {}), [phaseId]: content },
    })),
    queueDiagram: (full) => set({ pendingDiagram: full }),
    queueTiming: (full) => set({ pendingTiming: full }),

    // ── Post-save reconcilers ────────────────────────────────────────────
    // If a key in the store still holds the value we sent, clear it.
    // If it was updated during the save, the newer value stays pending.
    clearPhaseIfMatches: (snapshot) => set((s) => {
        if (!s.pendingPhase) return {}
        const remaining = { ...s.pendingPhase }
        for (const [k, v] of Object.entries(snapshot)) {
            if (remaining[k] === v) delete remaining[k]
        }
        return { pendingPhase: Object.keys(remaining).length ? remaining : null }
    }),
    clearDiagramIfMatches: (snapshot) => set((s) => {
        if (s.pendingDiagram === snapshot) return { pendingDiagram: null }
        return {}  // a newer payload was queued — keep it
    }),
    clearTimingIfMatches: (snapshot) => set((s) => {
        if (s.pendingTiming === snapshot) return { pendingTiming: null }
        return {}
    }),

    // ── Lifecycle ────────────────────────────────────────────────────────
    setInflight: (scope) => set({ inflightScope: scope, saveError: null }),
    clearInflight: () => set({ inflightScope: null, lastSaved: Date.now() }),
    setError: (err) => set({ inflightScope: null, saveError: err }),
}))
