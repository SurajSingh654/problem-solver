// ============================================================================
// useSaveCoordinator — single debounce + single in-flight outbox drain
// ============================================================================
//
// Owns:
//   - ONE debounce timer (1000 ms). Any queue* call resets it.
//   - A `drain()` loop that processes scopes in priority order
//     (phase → diagram → timing), one at a time, never concurrent.
//   - A `flushAll()` escape hatch that bypasses the debounce — used on
//     Pause & Exit and beforeunload so nothing is lost on navigation.
//
// Why a single timer instead of per-scope timers:
//   - The old code had 1000 / 1500 / 1500 / 2000 ms timers per scope.
//     With coalescing, the per-scope tuning stopped mattering — Excalidraw
//     can fire onChange 30×/second during a drag, but the coalescing
//     outbox collapses that into one save on idle. 1000 ms of idle across
//     all scopes is both simpler and slightly safer (less data at risk).
//
// Mutation reference stability:
//   - tanstack-query mutation objects are new on every render, so we
//     stash them in a ref to keep `drain()` stable. Otherwise every
//     queue* handler would re-bind on every render and Excalidraw's
//     onChange prop would change every render (bad).
// ============================================================================

import { useCallback, useEffect, useRef } from 'react'
import { useDesignSessionStore } from '../store/useDesignSessionStore'

const DEBOUNCE_MS = 1000

export function useSaveCoordinator({
    sessionId,
    savePhaseMutation,
    saveDiagramMutation,
    updateTimingMutation,
}) {
    // Subscribe to state for derived `status` return. The `.getState()`
    // reads inside callbacks deliberately bypass this subscription so
    // callbacks don't re-bind on every store update.
    const state = useDesignSessionStore()

    const timerRef = useRef(null)
    // Promise-mutex for drain(). Concurrent callers await the same
    // promise — so `flushAll()` after an in-flight save correctly waits
    // for completion instead of returning early.
    const drainPromiseRef = useRef(null)

    // Keep mutations in a ref — tanstack-query returns new objects each
    // render, and we don't want that to recreate `drain`/`schedule`.
    const mutationsRef = useRef({
        savePhase: savePhaseMutation,
        saveDiagram: saveDiagramMutation,
        updateTiming: updateTimingMutation,
    })
    useEffect(() => {
        mutationsRef.current = {
            savePhase: savePhaseMutation,
            saveDiagram: saveDiagramMutation,
            updateTiming: updateTimingMutation,
        }
    }, [savePhaseMutation, saveDiagramMutation, updateTimingMutation])

    // Reset per-session state on session change.
    useEffect(() => {
        if (sessionId) useDesignSessionStore.getState().reset(sessionId)
    }, [sessionId])

    // Clear the timer on unmount so a late fire can't hit a stale session.
    useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current)
    }, [])

    // ── Drain loop ────────────────────────────────────────────────────
    // Single-flight mutex via `drainPromiseRef`: concurrent callers await
    // the same promise so they all see the drain fully complete. The loop
    // inside processes scopes in priority order (phase → diagram → timing)
    // until nothing is pending. Early-returns on error so the user can
    // retry by editing again (which re-queues and reschedules).
    const drain = useCallback(async () => {
        if (drainPromiseRef.current) return drainPromiseRef.current

        const promise = (async () => {
            while (true) {
                const s = useDesignSessionStore.getState()
                const snapshot = s.pendingPhase
                    ? { kind: 'phase', value: s.pendingPhase }
                    : s.pendingDiagram
                        ? { kind: 'diagram', value: s.pendingDiagram }
                        : s.pendingTiming
                            ? { kind: 'timing', value: s.pendingTiming }
                            : null
                if (!snapshot) return

                const { savePhase, saveDiagram, updateTiming } = mutationsRef.current
                useDesignSessionStore.getState().setInflight(snapshot.kind)
                try {
                    if (snapshot.kind === 'phase') {
                        for (const [phaseId, content] of Object.entries(snapshot.value)) {
                            await savePhase.mutateAsync({ sessionId, phaseId, content })
                        }
                        useDesignSessionStore.getState().clearPhaseIfMatches(snapshot.value)
                    } else if (snapshot.kind === 'diagram') {
                        await saveDiagram.mutateAsync({
                            sessionId,
                            diagramData: snapshot.value.diagramData,
                            componentAnnotations: snapshot.value.annotations,
                            dataFlowDescription: snapshot.value.dataFlow,
                        })
                        useDesignSessionStore.getState().clearDiagramIfMatches(snapshot.value)
                    } else if (snapshot.kind === 'timing') {
                        await updateTiming.mutateAsync({ sessionId, ...snapshot.value })
                        useDesignSessionStore.getState().clearTimingIfMatches(snapshot.value)
                    }
                    useDesignSessionStore.getState().clearInflight()
                } catch (err) {
                    useDesignSessionStore.getState().setError(err)
                    return  // bail; mutation hook already toasted the user
                }

                // If the user has scheduled more work during this save, let
                // the debounce timer drive the next drain. Otherwise we'd
                // save on every network-RTT instead of every idle window —
                // defeating the debounce and hammering the server during
                // fast typing. `flushAll()` clears the timer before calling
                // drain, so this check is a no-op in the flush path.
                if (timerRef.current) return
            }
        })()

        drainPromiseRef.current = promise
        try { await promise } finally { drainPromiseRef.current = null }
    }, [sessionId])

    const schedule = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
            timerRef.current = null
            drain()
        }, DEBOUNCE_MS)
    }, [drain])

    const queuePhase = useCallback((phaseId, content) => {
        useDesignSessionStore.getState().queuePhase(phaseId, content)
        schedule()
    }, [schedule])

    const queueDiagram = useCallback((full) => {
        useDesignSessionStore.getState().queueDiagram(full)
        schedule()
    }, [schedule])

    const queueTiming = useCallback((full, opts = {}) => {
        useDesignSessionStore.getState().queueTiming(full)
        if (opts.immediate) {
            if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
            drain()
        } else {
            schedule()
        }
    }, [schedule, drain])

    // Flush everything pending immediately, bypassing debounce. Used on
    // Pause & Exit and (best-effort) beforeunload. Returns a promise that
    // resolves when the outbox is empty or errored.
    const flushAll = useCallback(async () => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
        await drain()
    }, [drain])

    // Synchronous check used by the beforeunload guard.
    const hasPending = useCallback(() => {
        const s = useDesignSessionStore.getState()
        return !!(s.pendingPhase || s.pendingDiagram || s.pendingTiming || s.inflightScope)
    }, [])

    // Derived status for the top-bar dot indicator.
    const status = state.saveError
        ? 'error'
        : state.inflightScope
            ? 'saving'
            : (state.pendingPhase || state.pendingDiagram || state.pendingTiming)
                ? 'dirty'
                : 'idle'

    return {
        status,
        saveError: state.saveError,
        lastSaved: state.lastSaved,
        queuePhase,
        queueDiagram,
        queueTiming,
        flushAll,
        hasPending,
    }
}
