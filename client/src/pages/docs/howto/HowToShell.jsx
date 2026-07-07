// client/src/pages/docs/howto/HowToShell.jsx
//
// Landing + search + role-tab + view-as toggle for /docs/how-to.
// Reads user role via useEffectiveRole(), filters TASKS + GROUPS from
// the manifest, renders workflow-grouped tiles.
//
// Legacy hash anchors (#solve, #ds-sd, etc.) redirect to their new
// /task/:taskId URLs via HASH_ALIAS_MAP.

import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { HASH_ALIAS_MAP, tasksForRole, groupsForRole } from './manifest'
import { DocsLayout, DocsHero } from '../components'
import { useEffectiveRole } from './useEffectiveRole'

// ── Search matcher ──────────────────────────────────────
function scoreTask(task, tokens) {
    const haystack = `${task.title} ${task.summary} ${(task.keywords || []).join(' ')}`.toLowerCase()
    let score = 0
    for (const tok of tokens) {
        if (haystack.includes(tok)) score++
    }
    return score
}

function searchTasks(tasks, query) {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return null
    return tasks
        .map(t => ({ task: t, score: scoreTask(t, tokens) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score || a.task.title.localeCompare(b.task.title))
        .slice(0, 10)
        .map(x => x.task)
}

// ── Task tile ──────────────────────────────────────────
function TaskTile({ task }) {
    return (
        <Link
            to={`/docs/how-to/task/${task.id}`}
            className="block bg-surface-2 border border-border-default rounded-xl p-4
                       hover:border-brand-line hover:bg-surface-3 transition-all"
        >
            <div className="flex items-start gap-3">
                <div className="text-xl flex-shrink-0">{task.icon}</div>
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-text-primary mb-0.5">
                        {task.title}
                    </div>
                    <div className="text-xs text-text-tertiary leading-relaxed">
                        {task.summary}
                    </div>
                    {task.estimatedMinutes && (
                        <div className="text-[10px] text-text-disabled uppercase tracking-widest mt-1.5">
                            ⏱ {task.estimatedMinutes} min
                        </div>
                    )}
                </div>
            </div>
        </Link>
    )
}

// ── View-as menu ────────────────────────────────────────
function ViewAsMenu({ isSuperAdmin, isTeamAdmin, viewAsActive }) {
    const navigate = useNavigate()
    const location = useLocation()
    const [open, setOpen] = useState(false)

    if (!isSuperAdmin && !isTeamAdmin) return null

    const setViewAs = (role) => {
        const params = new URLSearchParams(location.search)
        if (role) params.set('viewAs', role)
        else params.delete('viewAs')
        const qs = params.toString()
        navigate(`${location.pathname}${qs ? '?' + qs : ''}`)
        setOpen(false)
    }

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(v => !v)}
                className="text-xs px-3 py-2 rounded-lg border border-brand-line
                           bg-brand-soft text-brand-fg-soft hover:bg-brand-soft/60"
            >
                👁️ {viewAsActive ? 'Viewing as…' : 'View as'} ▾
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border
                                border-border-default bg-surface-2 shadow-lg z-10">
                    <button onClick={() => setViewAs('member')}
                            className="block w-full text-left text-xs px-3 py-2
                                       hover:bg-surface-3">
                        Member
                    </button>
                    {isSuperAdmin && (
                        <button onClick={() => setViewAs('team-admin')}
                                className="block w-full text-left text-xs px-3 py-2
                                           hover:bg-surface-3">
                            Team Admin
                        </button>
                    )}
                    <button onClick={() => setViewAs(null)}
                            className="block w-full text-left text-xs px-3 py-2
                                       hover:bg-surface-3 border-t border-border-default">
                        Reset to my role
                    </button>
                </div>
            )}
        </div>
    )
}

// ── Main shell ─────────────────────────────────────────
export default function HowToShell() {
    const { actualRole, effectiveRole, viewAsActive, isSuperAdmin, isTeamAdmin } = useEffectiveRole()
    const [query, setQuery] = useState('')
    const navigate = useNavigate()
    const location = useLocation()

    // Legacy hash-anchor redirect. Unknown hashes pass through untouched.
    useEffect(() => {
        const hash = window.location.hash.replace(/^#/, '')
        if (hash && HASH_ALIAS_MAP[hash]) {
            navigate(`/docs/how-to/task/${HASH_ALIAS_MAP[hash]}`, { replace: true })
        }
    }, [navigate])

    const filteredTasks = useMemo(() => tasksForRole(effectiveRole), [effectiveRole])
    const visibleGroups = useMemo(() => groupsForRole(effectiveRole), [effectiveRole])
    const searchResults = useMemo(() => searchTasks(filteredTasks, query), [filteredTasks, query])

    const resetViewAs = () => {
        const params = new URLSearchParams(location.search)
        params.delete('viewAs')
        const qs = params.toString()
        navigate(`${location.pathname}${qs ? '?' + qs : ''}`)
    }

    return (
        <DocsLayout>
            <DocsHero
                eyebrow="📘 How-To Guide · v5.0"
                title="Do everything —"
                titleGradient="one guide"
                desc={`Every workflow, filtered to your role (${effectiveRole}). Search or browse.`}
            />

            {viewAsActive && (
                <div className="mb-4 p-3 rounded-lg border border-brand-line bg-brand-soft/40 text-xs">
                    👁️ Viewing as <strong>{effectiveRole}</strong>. Your actual role is <strong>{actualRole}</strong>.
                    {' '}
                    <button onClick={resetViewAs} className="underline hover:text-brand-400">
                        Reset
                    </button>
                </div>
            )}

            <div className="flex items-center gap-3 mb-6">
                <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="🔍  Search guides…"
                    className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-border-default
                               bg-surface-2 text-text-primary placeholder:text-text-disabled
                               focus:outline-none focus:border-brand-line"
                />
                <div className="text-[11px] font-bold text-text-disabled uppercase tracking-widest">
                    {effectiveRole}
                </div>
                <ViewAsMenu isSuperAdmin={isSuperAdmin} isTeamAdmin={isTeamAdmin} viewAsActive={viewAsActive} />
            </div>

            {searchResults ? (
                <div>
                    <div className="text-[11px] font-bold text-text-disabled uppercase tracking-widest mb-2">
                        {searchResults.length} result{searchResults.length === 1 ? '' : 's'}
                    </div>
                    <div className="grid md:grid-cols-2 gap-3">
                        {searchResults.map(t => <TaskTile key={t.id} task={t} />)}
                    </div>
                    {searchResults.length === 0 && (
                        <p className="text-sm text-text-tertiary italic">
                            No guides match your search. Clear the query to see all workflows.
                        </p>
                    )}
                </div>
            ) : (
                visibleGroups.map(group => {
                    const groupTasks = filteredTasks.filter(t => t.group === group.id)
                    if (groupTasks.length === 0) return null
                    return (
                        <div key={group.id} className="mb-8">
                            <div className="text-sm font-bold text-brand-fg-soft mb-3">
                                {group.label} <span className="text-text-disabled">· {groupTasks.length} guide{groupTasks.length === 1 ? '' : 's'}</span>
                            </div>
                            <div className="grid md:grid-cols-2 gap-3">
                                {groupTasks.map(t => <TaskTile key={t.id} task={t} />)}
                            </div>
                        </div>
                    )
                })
            )}

            {/* Empty-state message when no groups render (e.g., manifest still empty) */}
            {!searchResults && visibleGroups.every(g => filteredTasks.filter(t => t.group === g.id).length === 0) && (
                <p className="text-sm text-text-tertiary italic text-center py-16">
                    No guides yet for this role. Check back soon.
                </p>
            )}
        </DocsLayout>
    )
}

