// ============================================================================
// useCoachingHistory — derive a grouped, filterable history from aiInteractions
// ============================================================================
//
// `session.aiInteractions` is already persisted by the server on every
// coach call (after Commit 3 extended the persisted shape to include the
// full `response` object). This hook just groups + filters that log for
// the history drawer UI.
//
// Kept as a dumb pure derivation: given the raw array + an optional phase
// filter, produce a reverse-chronological list with a few presentation
// helpers. No caching / memo beyond what React's useMemo gives the
// caller — the input is small (cap 50) and this runs once per render.
// ============================================================================

import { useMemo } from 'react'

export function useCoachingHistory(aiInteractions, { phaseFilter = null } = {}) {
    return useMemo(() => {
        const all = Array.isArray(aiInteractions) ? aiInteractions : []

        // Newest first so the drawer reads like a chat transcript from the
        // user's current moment backwards.
        const sorted = [...all].sort((a, b) => {
            const ta = new Date(a?.timestamp || 0).getTime()
            const tb = new Date(b?.timestamp || 0).getTime()
            return tb - ta
        })

        const filtered = phaseFilter
            ? sorted.filter((i) => i?.phase === phaseFilter)
            : sorted

        // Count per phase for the filter-chip badges in the UI.
        const countsByPhase = {}
        for (const i of all) {
            const p = i?.phase || 'unknown'
            countsByPhase[p] = (countsByPhase[p] || 0) + 1
        }

        return {
            items: filtered,
            total: all.length,
            countsByPhase,
        }
    }, [aiInteractions, phaseFilter])
}

/**
 * Short preview of an interaction's main text — what shows in the
 * collapsed list row. Picks the best available content across the three
 * response modes (validate / guide / teach).
 */
export function interactionPreview(interaction, maxChars = 120) {
    if (!interaction) return ''
    const text =
        interaction.userQuery ||
        interaction.aiResponse ||
        interaction.response?.response ||
        interaction.response?.specificStrength ||
        interaction.response?.conceptExplanation ||
        interaction.guidingQuestions?.[0] ||
        ''
    if (!text) return ''
    return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text
}

/** Human-friendly short time label for the history row. */
export function interactionTimeLabel(interaction) {
    const ts = interaction?.timestamp
    if (!ts) return ''
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) return ''
    // HH:MM — same-day sessions are the common case; for older sessions
    // include the date as well.
    const now = new Date()
    const sameDay =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (sameDay) return time
    const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' })
    return `${date} · ${time}`
}
