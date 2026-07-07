// client/src/pages/docs/howto/TaskPage.jsx
//
// Generic renderer for a single How-To task. Reads :taskId from route
// params, looks up the manifest entry, lazy-imports the content
// component, wraps with breadcrumbs / prereqs / footer.
//
// Role-mismatch soft-block: if the current user's effective role
// doesn't match the task's role, show a "This guide is for X"
// screen with a "View anyway" escape hatch. Content visibility is
// a UX filter — real authz lives in server middleware.

import { Suspense, lazy, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { findTask, GROUPS } from './manifest'
import { DocsLayout } from '../components'
import { NextUp, PrereqList } from './components'
import { useEffectiveRole } from './useEffectiveRole'

export default function TaskPage() {
    const { taskId } = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    const { effectiveRole, isSuperAdmin, isTeamAdmin } = useEffectiveRole()
    const [forceView, setForceView] = useState(false)

    const task = useMemo(() => findTask(taskId), [taskId])
    const Content = useMemo(() => (task ? lazy(task.component) : null), [task])

    // Task not found → 404
    if (!task) {
        return (
            <DocsLayout>
                <div className="text-center py-16">
                    <div className="text-4xl mb-3">🤷</div>
                    <div className="text-lg font-bold text-text-primary mb-2">
                        Guide not found
                    </div>
                    <div className="text-sm text-text-tertiary mb-6">
                        No task with id <code className="bg-surface-3 px-2 py-0.5 rounded">{taskId}</code>.
                    </div>
                    <Link to="/docs/how-to"
                          className="text-sm text-brand-fg-soft hover:text-brand-400 underline">
                        ← Back to all guides
                    </Link>
                </div>
            </DocsLayout>
        )
    }

    // Role-mismatch soft-block
    const roleMismatch = task.role !== '*' && task.role !== effectiveRole
    if (roleMismatch && !forceView) {
        const viewAnyway = () => {
            // If admin, set the URL viewAs param to task.role so refreshes stick.
            if ((isSuperAdmin || isTeamAdmin) && task.role !== 'super-admin') {
                const params = new URLSearchParams(location.search)
                params.set('viewAs', task.role)
                navigate(`${location.pathname}?${params.toString()}`, { replace: true })
            } else {
                // Non-admins just get a session-only override
                setForceView(true)
            }
        }
        return (
            <DocsLayout>
                <div className="max-w-lg mx-auto text-center py-16">
                    <div className="text-4xl mb-3">🛑</div>
                    <div className="text-lg font-bold text-text-primary mb-2">
                        This guide is for {task.role.replace('-', ' ')}
                    </div>
                    <div className="text-sm text-text-tertiary mb-6">
                        You&apos;re viewing as <strong>{effectiveRole}</strong>. The actions described
                        below may not be available to you in the app.
                    </div>
                    <div className="flex gap-2 justify-center">
                        <Link to="/docs/how-to"
                              className="text-sm px-4 py-2 rounded-lg border border-border-default
                                         hover:border-brand-line">
                            Back to your guides
                        </Link>
                        <button onClick={viewAnyway}
                                className="text-sm px-4 py-2 rounded-lg border border-brand-line
                                           bg-brand-soft text-brand-fg-soft hover:bg-brand-soft/60">
                            View anyway →
                        </button>
                    </div>
                </div>
            </DocsLayout>
        )
    }

    const group = GROUPS[task.group]
    const prereqItems = (task.prerequisites || []).map(pid => {
        const t = findTask(pid)
        return t ? `${t.title} — open guide` : pid
    })

    return (
        <DocsLayout>
            {/* Breadcrumbs */}
            <div className="text-xs text-text-tertiary mb-3">
                <Link to="/docs/how-to" className="hover:text-text-primary">All guides</Link>
                {' / '}
                {group?.label || task.group}
                {' / '}
                <span className="text-text-primary">{task.title}</span>
            </div>

            {/* Title */}
            <h1 className="text-2xl font-extrabold text-text-primary mb-2">
                {task.icon} {task.title}
            </h1>
            <div className="flex gap-3 text-[11px] font-bold text-text-disabled uppercase tracking-widest mb-4">
                {task.estimatedMinutes && <span>⏱ {task.estimatedMinutes} min</span>}
                <span>· {task.role.replace('-', ' ')}</span>
            </div>

            <PrereqList items={prereqItems} />

            <Suspense fallback={<div className="text-sm text-text-tertiary italic py-6">Loading guide…</div>}>
                {Content && <Content />}
            </Suspense>

            <NextUp taskIds={task.relatedTasks} taskLookup={findTask} />

            <div className="mt-8 pt-4 border-t border-border-default text-xs text-text-tertiary">
                <Link to="/docs/how-to" className="hover:text-text-primary">
                    ← All guides
                </Link>
            </div>
        </DocsLayout>
    )
}
