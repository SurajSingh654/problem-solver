// ============================================================================
// usePhaseTimer — per-phase elapsed-time tracking
// ============================================================================
//
// The old workspace had THREE refs for phase timing (phaseEnterTimeRef,
// phaseTimingsRef, elapsedTimeRef) plus a `handlePhaseSwitch` and a
// `accumulateCurrentPhaseTime` that were nearly identical but not quite —
// and the bug was that calling `accumulate` twice (once on phase switch,
// once on pause-exit) could double-count a delta on certain code paths.
//
// This hook replaces all of that with:
//   - One elapsedTime state (1s tick)
//   - One phaseTimings ref (cumulative seconds per phase)
//   - ONE `recordPhaseExit()` method that is idempotent — calling it
//     multiple times in a row is a no-op after the first because it
//     bumps phaseEnterTime forward each call.
//   - A sentinel `currentPhaseIdRef` so we know whose delta to attribute
//     even when props haven't re-rendered yet.
//
// Seeding from server is one-shot per hook instance. Resume works because
// the server stores totalTimeSpent + phaseTimings + currentPhase.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'

export function usePhaseTimer({ session, phases, initialActiveIdx }) {
    const [elapsedTime, setElapsedTime] = useState(0)
    // `phaseTimings` lives in a ref because the coordinator reads it
    // during saves — we want fresh values without re-binding the saver
    // on every tick.
    const phaseTimingsRef = useRef({})
    const phaseEnterTimeRef = useRef(0)
    const currentPhaseIdRef = useRef(null)

    const elapsedTimeRef = useRef(0)
    useEffect(() => { elapsedTimeRef.current = elapsedTime }, [elapsedTime])

    const seededRef = useRef(false)

    // Seed ONCE from server state. Subsequent refetches must not reset
    // the running clock or phaseTimings — the user would lose in-flight
    // time on every background poll.
    useEffect(() => {
        if (!session || seededRef.current) return
        seededRef.current = true
        const t = session.totalTimeSpent || 0
        setElapsedTime(t)
        phaseTimingsRef.current = session.phaseTimings || {}
        phaseEnterTimeRef.current = t
        currentPhaseIdRef.current = phases[initialActiveIdx]?.id ?? null
    }, [session, phases, initialActiveIdx])

    // Tick every second — stop when the session is terminal so a
    // completed session doesn't keep accumulating time if the user
    // leaves the tab open on it.
    useEffect(() => {
        if (session?.status === 'COMPLETED' || session?.status === 'ABANDONED') return
        const i = setInterval(() => setElapsedTime((t) => t + 1), 1000)
        return () => clearInterval(i)
    }, [session?.status])

    // Records the delta on the currently-tracked phase into phaseTimings.
    // Idempotent: after the first call, phaseEnterTime advances to "now",
    // so a second immediate call produces a 0 delta and no-ops. This is
    // the fix for the double-count bug — it was possible before because
    // two code paths (phase switch, pause exit) both ran the accumulation
    // logic.
    const recordPhaseExit = useCallback(() => {
        const phaseId = currentPhaseIdRef.current
        if (!phaseId) return
        const delta = Math.max(0, elapsedTimeRef.current - phaseEnterTimeRef.current)
        if (delta > 0) {
            const prev = phaseTimingsRef.current[phaseId] || 0
            phaseTimingsRef.current = { ...phaseTimingsRef.current, [phaseId]: prev + delta }
            phaseEnterTimeRef.current = elapsedTimeRef.current
        }
    }, [])

    // Switch tracking to a new phase. Records exit for the current phase,
    // then moves the sentinel.
    const setActivePhaseId = useCallback((phaseId) => {
        recordPhaseExit()
        currentPhaseIdRef.current = phaseId
        phaseEnterTimeRef.current = elapsedTimeRef.current
    }, [recordPhaseExit])

    // Build the payload the save coordinator needs. Callers pass the
    // currentPhase index separately since the server stores that as an
    // integer (0-indexed), not the phaseId.
    const buildTimingPayload = useCallback((currentPhase) => ({
        totalTimeSpent: elapsedTimeRef.current,
        phaseTimings: phaseTimingsRef.current,
        ...(currentPhase != null ? { currentPhase } : {}),
    }), [])

    return {
        elapsedTime,
        recordPhaseExit,
        setActivePhaseId,
        buildTimingPayload,
    }
}
