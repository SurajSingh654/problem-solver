import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@components/ui/Button'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import {
    useDesignSessions,
    useDeleteDesignSession,
    useUpdateSessionStatus,
} from '@hooks/useDesignStudio'
import { STATUS_CONFIG, formatTime } from '../constants/phases'

// ══════════════════════════════════════════════════════════════════════════
// SESSION LIST VIEW
// ══════════════════════════════════════════════════════════════════════════
export default function SessionListView({ onSelectSession, onCreateNew }) {
    const [designTypeFilter, setDesignTypeFilter] = useState('ALL')
    const [statusFilter, setStatusFilter] = useState('ALL')

    const queryParams = {}
    if (designTypeFilter !== 'ALL') queryParams.designType = designTypeFilter
    if (statusFilter !== 'ALL') queryParams.status = statusFilter

    const { data, isLoading } = useDesignSessions(queryParams)
    const deleteSession = useDeleteDesignSession()
    const updateSessionStatus = useUpdateSessionStatus()
    const sessions = data?.sessions || []
    const hasActiveFilter = designTypeFilter !== 'ALL' || statusFilter !== 'ALL'

    const statusConfig = STATUS_CONFIG

    const designTypeOptions = [
        { id: 'ALL', label: 'All' },
        { id: 'SYSTEM_DESIGN', label: '🏗️ SD' },
        { id: 'LOW_LEVEL_DESIGN', label: '🔧 LLD' },
    ]
    const statusOptions = [
        { id: 'ALL', label: 'All' },
        { id: 'IN_PROGRESS', label: 'In Progress' },
        { id: 'VALIDATING', label: 'Validating' },
        { id: 'COMPLETED', label: 'Completed' },
        { id: 'ABANDONED', label: 'Abandoned' },
    ]

    const FilterGroup = ({ options, value, onChange }) => (
        <div className="inline-flex rounded-lg border border-border-default bg-surface-2 p-0.5">
            {options.map(opt => (
                <button
                    key={opt.id}
                    onClick={() => onChange(opt.id)}
                    className={cn(
                        'text-[10px] font-bold px-2.5 py-1 rounded-md transition-all',
                        value === opt.id
                            ? 'bg-brand-400 text-white'
                            : 'text-text-tertiary hover:text-text-primary'
                    )}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    )

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mr-1">Filter</span>
                <FilterGroup options={designTypeOptions} value={designTypeFilter} onChange={setDesignTypeFilter} />
                <FilterGroup options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
                {hasActiveFilter && (
                    <button
                        onClick={() => { setDesignTypeFilter('ALL'); setStatusFilter('ALL') }}
                        className="text-[10px] font-semibold text-text-tertiary hover:text-text-primary px-2 py-1 transition-colors"
                    >
                        Clear
                    </button>
                )}
            </div>

            {isLoading ? (
                <div className="flex justify-center py-16"><Spinner size="lg" /></div>
            ) : sessions.length === 0 ? (
                <div className="bg-surface-1 border border-border-default rounded-2xl p-10 text-center">
                    <div className="text-4xl mb-3">🏗️</div>
                    <p className="text-sm font-semibold text-text-primary mb-1">No design sessions yet</p>
                    <p className="text-xs text-text-tertiary mb-4">Start your first design practice session.</p>
                    <Button variant="primary" size="md" onClick={onCreateNew}>Start First Session</Button>
                </div>
            ) : (
                <div className="space-y-3">
                    {sessions.map((session, i) => {
                        const status = statusConfig[session.status] || statusConfig.IN_PROGRESS
                        return (
                            <motion.div
                                key={session.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.04 }}
                                className="bg-surface-1 border border-border-default rounded-xl p-4
                                           hover:border-brand-line transition-all cursor-pointer"
                                onClick={() => onSelectSession(session.id)}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                        <span className="text-xl flex-shrink-0 mt-0.5">
                                            {session.designType === 'SYSTEM_DESIGN' ? '🏗️' : '🔧'}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-text-primary truncate">{session.title}</p>
                                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                <span className={cn('text-[10px] font-bold px-2 py-px rounded-full border', status.color)}>
                                                    {status.label}
                                                </span>
                                                <span className="text-[10px] text-text-disabled">{session.difficulty}</span>
                                                <span className="text-[10px] text-text-disabled">{formatTime(session.totalTimeSpent)} spent</span>
                                                {session.evaluationScore && (
                                                    <span className="text-[10px] font-bold text-brand-fg-soft">Score: {session.evaluationScore}/10</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        {(session.status === 'IN_PROGRESS' || session.status === 'VALIDATING') && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    if (window.confirm('Abandon this session? It will be marked abandoned and become read-only. Use the Abandoned filter to find it later.')) {
                                                        updateSessionStatus.mutate({ sessionId: session.id, status: 'ABANDONED' })
                                                    }
                                                }}
                                                title="Abandon session"
                                                className="text-text-disabled hover:text-warning-fg transition-colors p-1"
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                                                </svg>
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); if (window.confirm('Delete this session? This cannot be undone.')) deleteSession.mutate(session.id) }}
                                            title="Delete session"
                                            className="text-text-disabled hover:text-danger-fg transition-colors p-1"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14H7L5 6" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
