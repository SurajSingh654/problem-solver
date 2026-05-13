// ============================================================================
// useStuckDetector — surfaces a stuck-nudge when ALL four signals are quiet
// ============================================================================
//
// "Stuck" means EVERY one of the following is true for the active phase P:
//   1. Time spent in P ≥ rubric threshold T(P)
//   2. Phase content has NOT grown by ≥ 40 chars in last 90 s
//   3. No coach interaction for P in last 5 min
//   4. Canvas has no new Excalidraw elements in last 90 s (we count
//      element shape changes via a snapshot of Excalidraw's `elements`
//      array length + ids).
//
// All four are required, deliberately. Per Bjork's desirable-difficulty
// + Ericsson's deliberate-practice frames, thoughtful silence is a
// FEATURE, not a fault — we only fire when the user is actually idle by
// every signal we can measure. Conservative thresholds.
//
// Per-phase explicit dismissal sticks for the rest of the session: if
// the user dismisses the nudge on phase X, we won't show another nudge
// on X even if they later go idle there. Other phases still nudge
// independently.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { getStuckThresholdSec } from '../constants/phaseRubric'

const QUIET_WINDOW_MS = 90 * 1000
const COACH_QUIET_MS = 5 * 60 * 1000

export function useStuckDetector({
    designType,
    phaseId,
    phaseContent,            // string for the active phase
    diagramData,             // object | string from Excalidraw
    elapsedTimeInPhaseSec,   // seconds the user has been on this phase
    aiInteractions,          // session.aiInteractions array
    coordinatorIsSaving,     // suppress nudge during a save in flight
    isReadOnly,
    enabled = true,
}) {
    // Per-phase dismissal: once dismissed for phase P, we never show again
    // on P this session.
    const [dismissedPhases, setDismissedPhases] = useState(() => new Set())

    // Snapshots taken when we BECOME nudge-eligible for the current phase
    // — defines the "no growth" baseline. Re-taken on phase change.
    const snapshotRef = useRef({
        phaseId: null,
        contentLen: 0,
        diagramSig: '',
        takenAt: 0,
    })

    // Track the latest content + diagram signature in refs so the
    // tick-based effect doesn't need to re-subscribe on every keystroke.
    const contentLenRef = useRef((phaseContent || '').length)
    const diagramSigRef = useRef(diagramSignature(diagramData))
    const lastChangeAtRef = useRef(Date.now())

    useEffect(() => {
        const newLen = (phaseContent || '').length
        if (newLen !== contentLenRef.current) {
            // Only count substantial growth toward "activity" — single keystroke
            // shouldn't reset the quiet timer if the user is just typing one word.
            if (Math.abs(newLen - contentLenRef.current) >= 2) {
                lastChangeAtRef.current = Date.now()
            }
            contentLenRef.current = newLen
        }
    }, [phaseContent])

    useEffect(() => {
        const newSig = diagramSignature(diagramData)
        if (newSig !== diagramSigRef.current) {
            diagramSigRef.current = newSig
            lastChangeAtRef.current = Date.now()
        }
    }, [diagramData])

    // Reset snapshot when the active phase changes — each phase tracks
    // independently.
    useEffect(() => {
        snapshotRef.current = {
            phaseId,
            contentLen: contentLenRef.current,
            diagramSig: diagramSigRef.current,
            takenAt: Date.now(),
        }
    }, [phaseId])

    // Tick once per 5 s to evaluate — cheap and avoids re-running on every
    // keystroke. The four signals don't need sub-second latency.
    const [tickIdx, setTickIdx] = useState(0)
    useEffect(() => {
        if (!enabled || isReadOnly) return
        const i = setInterval(() => setTickIdx((t) => t + 1), 5000)
        return () => clearInterval(i)
    }, [enabled, isReadOnly])

    // Time since most recent coach interaction for THIS phase.
    const lastCoachAtForPhase = useMemo(() => {
        if (!Array.isArray(aiInteractions)) return 0
        let latest = 0
        for (const i of aiInteractions) {
            if (i?.phase !== phaseId) continue
            const t = new Date(i?.timestamp || 0).getTime()
            if (t > latest) latest = t
        }
        return latest
    }, [aiInteractions, phaseId])

    const isStuck = useMemo(() => {
        if (!enabled || isReadOnly) return false
        if (coordinatorIsSaving) return false
        if (dismissedPhases.has(phaseId)) return false

        const threshold = getStuckThresholdSec(designType, phaseId)
        if (elapsedTimeInPhaseSec < threshold) return false

        const now = Date.now()
        const sinceContentChange = now - lastChangeAtRef.current
        if (sinceContentChange < QUIET_WINDOW_MS) return false

        if (lastCoachAtForPhase && now - lastCoachAtForPhase < COACH_QUIET_MS) return false

        // Snapshot delta — guards against the case where the user came
        // back to a phase they were already idle on (we want fresh
        // eligibility from the moment they returned).
        const snap = snapshotRef.current
        if (snap.phaseId !== phaseId) return false
        const minDwellSinceSnapshot = 30 * 1000
        if (now - snap.takenAt < minDwellSinceSnapshot) return false

        return true
        // tickIdx is intentionally a dep so the memo re-evaluates each tick
        // even though we don't read it inline.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        tickIdx,
        enabled,
        isReadOnly,
        coordinatorIsSaving,
        dismissedPhases,
        phaseId,
        designType,
        elapsedTimeInPhaseSec,
        lastCoachAtForPhase,
    ])

    function dismissForCurrentPhase() {
        setDismissedPhases((prev) => {
            const next = new Set(prev)
            next.add(phaseId)
            return next
        })
    }

    // Build the stuckContext payload sent to the LLM when the user
    // taps "Get a hint" on the nudge. Captured at click time, not stored.
    function buildStuckContext() {
        const now = Date.now()
        return {
            timeInPhaseSec: elapsedTimeInPhaseSec,
            charsSinceLastEdit: 0, // by definition — they're idle
            quietForSec: Math.round((now - lastChangeAtRef.current) / 1000),
            phaseId,
        }
    }

    return {
        isStuck,
        dismissForCurrentPhase,
        buildStuckContext,
    }
}

// Cheap fingerprint over the Excalidraw diagram so we detect new/removed
// elements without deep-equal-ing huge JSON. Element ids + count is
// enough to catch "the user drew/erased something."
function diagramSignature(diagramData) {
    if (!diagramData) return 'empty'
    let elements = null
    if (typeof diagramData === 'string') {
        try {
            elements = JSON.parse(diagramData)?.elements
        } catch {
            return 'unparseable'
        }
    } else if (typeof diagramData === 'object') {
        elements = diagramData.elements
    }
    if (!Array.isArray(elements)) return 'no-elements'
    if (elements.length === 0) return 'len:0'
    // Take first + last element ids so insertions / deletions change the
    // signature even when length stays the same (e.g. delete-then-add).
    const first = elements[0]?.id || ''
    const last = elements[elements.length - 1]?.id || ''
    return `len:${elements.length}|${first}|${last}`
}
