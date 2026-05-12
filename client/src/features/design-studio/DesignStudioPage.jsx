import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@components/ui/Button'
import SessionListView from './views/SessionListView'
import ProblemPracticeView from './views/ProblemPracticeView'
import CreateSessionScreen from './views/CreateSessionScreen'
import DesignWorkspace from './workspace/DesignWorkspace'

// ══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════
export default function DesignStudioPage() {
    const [searchParams, setSearchParams] = useSearchParams()
    const problemIdFromUrl = searchParams.get('problemId')
    // Derive initial view from URL: arriving with ?problemId=xxx drops the
    // user directly into the problem-linked practice hub (past attempts +
    // start new). Without it, normal session-list view.
    const [view, setView] = useState(problemIdFromUrl ? 'problem' : 'list')
    const [activeSessionId, setActiveSessionId] = useState(null)

    // Clear the URL param when navigating away from the problem-linked view,
    // so subsequent in-app navigation doesn't keep re-routing there.
    function clearProblemContext() {
        if (problemIdFromUrl) {
            const next = new URLSearchParams(searchParams)
            next.delete('problemId')
            setSearchParams(next, { replace: true })
        }
    }

    if (view === 'workspace' && activeSessionId) {
        return (
            <DesignWorkspace
                sessionId={activeSessionId}
                onBack={() => {
                    // Return to the problem hub if we came from one; otherwise the list.
                    if (problemIdFromUrl) {
                        setView('problem')
                    } else {
                        setView('list')
                    }
                    setActiveSessionId(null)
                }}
            />
        )
    }

    if (view === 'problem' && problemIdFromUrl) {
        return (
            <div className="p-6 max-w-[700px] mx-auto">
                <div className="mb-6">
                    <h1 className="text-2xl font-extrabold text-text-primary mb-1">Design Studio</h1>
                    <p className="text-sm text-text-tertiary">Practice this problem with AI coaching.</p>
                </div>
                <ProblemPracticeView
                    problemId={problemIdFromUrl}
                    onSelectSession={(id) => { setActiveSessionId(id); setView('workspace') }}
                    onStartSession={(id) => { setActiveSessionId(id); setView('workspace') }}
                    onBack={() => { clearProblemContext(); setView('list') }}
                />
            </div>
        )
    }

    if (view === 'create') {
        return (
            <div className="p-6 max-w-[600px] mx-auto">
                <div className="mb-6">
                    <h1 className="text-2xl font-extrabold text-text-primary mb-2">Design Studio</h1>
                    <p className="text-sm text-text-tertiary leading-relaxed">Practice system design and low-level design with AI coaching at every step.</p>
                </div>
                <CreateSessionScreen onCreated={(id) => { setActiveSessionId(id); setView('workspace') }} onBack={() => setView('list')} />
            </div>
        )
    }

    return (
        <div className="p-6 max-w-[700px] mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-extrabold text-text-primary mb-1">Design Studio</h1>
                    <p className="text-sm text-text-tertiary">Practice, validate, and master system design with AI coaching.</p>
                </div>
                <Button variant="primary" size="md" onClick={() => setView('create')}>+ New Session</Button>
            </div>
            <SessionListView onSelectSession={(id) => { setActiveSessionId(id); setView('workspace') }} onCreateNew={() => setView('create')} />
        </div>
    )
}
