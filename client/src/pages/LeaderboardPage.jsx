import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useLeaderboard } from '@hooks/useReport'
import { useAuthStore } from '@store/useAuthStore'
import { Avatar } from '@components/ui/Avatar'
import { Badge } from '@components/ui/Badge'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import { CONFIDENCE_LEVELS } from '@utils/constants'

const DIFF_COLORS = {
    easy: 'text-success',
    medium: 'text-warning',
    hard: 'text-danger',
}

// ── Rank medal ─────────────────────────────────────────
function RankDisplay({ rank }) {
    if (rank === 1) return <span className="text-xl">🥇</span>
    if (rank === 2) return <span className="text-xl">🥈</span>
    if (rank === 3) return <span className="text-xl">🥉</span>
    return (
        <span className="text-sm font-bold text-text-disabled font-mono w-6 text-center">
            {rank}
        </span>
    )
}

// ── Level badge ────────────────────────────────────────
function LevelBadge({ level }) {
    const config = {
        BEGINNER: { label: 'Beginner', color: 'text-text-secondary bg-surface-3 border-border-default' },
        INTERMEDIATE: { label: 'Intermediate', color: 'text-info bg-info/10 border-info/25' },
        ADVANCED: { label: 'Advanced', color: 'text-warning bg-warning/10 border-warning/25' },
    }
    const c = config[level] || config.BEGINNER
    return (
        <span className={cn(
            'text-[10px] font-bold px-2 py-px rounded-full border hidden sm:inline',
            c.color
        )}>
            {c.label}
        </span>
    )
}

// ── Top 3 podium ───────────────────────────────────────
function Podium({ top3, onSelect }) {
    if (!top3?.length) return null

    const order = [
        top3[1] && { ...top3[1], pos: 2, height: 'h-20', delay: 0.1 },
        top3[0] && { ...top3[0], pos: 1, height: 'h-28', delay: 0 },
        top3[2] && { ...top3[2], pos: 3, height: 'h-14', delay: 0.2 },
    ].filter(Boolean)

    return (
        <div className="flex items-end justify-center gap-4 mb-8 pt-4">
            {order.map(entry => (
                <motion.div
                    key={entry.userId}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: entry.delay, duration: 0.4 }}
                    onClick={() => onSelect(entry.username)}
                    className="flex flex-col items-center gap-2 cursor-pointer group"
                >
                    {/* Position */}
                    <div className="text-2xl">
                        {entry.pos === 1 ? '🥇' : entry.pos === 2 ? '🥈' : '🥉'}
                    </div>
                    {/* Avatar */}
                    <div className={cn(
                        'relative',
                        entry.pos === 1 && 'ring-2 ring-warning/60 ring-offset-2 ring-offset-surface-0 rounded-full'
                    )}>
                        <Avatar
                            name={entry.username}
                            color={entry.avatarColor}
                            size={entry.pos === 1 ? 'lg' : 'md'}
                        />
                    </div>
                    {/* Name */}
                    <span className={cn(
                        'text-xs font-bold text-center truncate max-w-[80px]',
                        entry.isYou ? 'text-brand-300' : 'text-text-primary',
                        'group-hover:text-brand-300 transition-colors'
                    )}>
                        {entry.username}
                        {entry.isYou && ' (you)'}
                    </span>
                    {/* Solved count */}
                    <div className={cn(
                        'flex items-end justify-center rounded-t-lg w-16',
                        entry.height,
                        entry.pos === 1
                            ? 'bg-warning/15 border-t-2 border-x-2 border-warning/40'
                            : entry.pos === 2
                                ? 'bg-surface-3 border-t-2 border-x-2 border-border-strong'
                                : 'bg-surface-3 border-t-2 border-x-2 border-border-default'
                    )}>
                        <span className={cn(
                            'text-lg font-extrabold font-mono pb-2',
                            entry.pos === 1 ? 'text-warning' : 'text-text-primary'
                        )}>
                            {entry.totalSolved}
                        </span>
                    </div>
                </motion.div>
            ))}
        </div>
    )
}

// ── Table row ──────────────────────────────────────────
function LeaderRow({ entry, index, onSelect }) {
    const conf = CONFIDENCE_LEVELS.find(c => c.value === Math.round(entry.avgConfidence))

    return (
        <motion.tr
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15, delay: index * 0.03 }}
            onClick={() => onSelect(entry.username)}
            className={cn(
                'group cursor-pointer transition-all duration-150',
                'hover:bg-surface-3',
                entry.isYou && 'bg-brand-400/5 hover:bg-brand-400/10'
            )}
        >
            {/* Rank */}
            <td className="pl-4 py-3.5 w-12">
                <div className="flex items-center justify-center">
                    <RankDisplay rank={entry.rank} />
                </div>
            </td>

            {/* User */}
            <td className="py-3.5">
                <div className="flex items-center gap-3">
                    <Avatar
                        name={entry.username}
                        color={entry.avatarColor}
                        size="sm"
                    />
                    <div>
                        <div className="flex items-center gap-2">
                            <span className={cn(
                                'text-sm font-bold',
                                entry.isYou ? 'text-brand-300' : 'text-text-primary'
                            )}>
                                {entry.username}
                                {entry.isYou && (
                                    <span className="ml-1.5 text-[10px] font-bold px-1.5 py-px
                                   rounded-full bg-brand-400/15 text-brand-300
                                   border border-brand-400/25">
                                        you
                                    </span>
                                )}
                            </span>
                            {entry.role === 'ADMIN' && (
                                <span className="text-[10px] font-bold px-1.5 py-px rounded-full
                                 bg-warning/12 text-warning border border-warning/25
                                 hidden sm:inline">
                                    ⚡ Admin
                                </span>
                            )}
                        </div>
                        <LevelBadge level={entry.currentLevel} />
                    </div>
                </div>
            </td>

            {/* Solved */}
            <td className="py-3.5 text-center">
                <span className="text-sm font-extrabold font-mono text-text-primary">
                    {entry.totalSolved}
                </span>
                <div className="flex items-center justify-center gap-1 mt-0.5">
                    <span className="text-[10px] text-success">{entry.easy}E</span>
                    <span className="text-text-disabled text-[10px]">·</span>
                    <span className="text-[10px] text-warning">{entry.medium}M</span>
                    <span className="text-text-disabled text-[10px]">·</span>
                    <span className="text-[10px] text-danger">{entry.hard}H</span>
                </div>
            </td>

            {/* Streak */}
            <td className="py-3.5 text-center hidden md:table-cell">
                <span className={cn(
                    'text-sm font-bold font-mono',
                    entry.streak > 0 ? 'text-warning' : 'text-text-disabled'
                )}>
                    {entry.streak > 0 ? `${entry.streak} 🔥` : '—'}
                </span>
            </td>

            {/* Avg confidence */}
            <td className="py-3.5 text-center hidden lg:table-cell">
                {conf ? (
                    <span className="text-base" title={conf.label}>{conf.emoji}</span>
                ) : (
                    <span className="text-text-disabled text-xs">—</span>
                )}
            </td>

            {/* Coverage */}
            <td className="py-3.5 pr-4 text-center hidden sm:table-cell">
                <div className="flex flex-col items-center gap-1">
                    <span className="text-xs font-bold text-text-primary">
                        {entry.solvedPercent}%
                    </span>
                    <div className="w-16 h-1 bg-surface-4 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${entry.solvedPercent}%` }}
                            transition={{ duration: 0.6, delay: index * 0.02 }}
                            className="h-full bg-brand-400 rounded-full"
                        />
                    </div>
                </div>
            </td>
        </motion.tr>
    )
}

// ══════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════
export default function LeaderboardPage() {
    const navigate = useNavigate()
    const { user } = useAuthStore()
    const [filter, setFilter] = useState('all') // 'all' | 'members'

    const { data, isLoading } = useLeaderboard()

    const leaderboard = data?.leaderboard || []
    const totalProblems = data?.totalProblems || 0
    const totalMembers = data?.totalMembers || 0

    const top3 = leaderboard.slice(0, 3)
    const rest = leaderboard.slice(3)
    const myEntry = leaderboard.find(e => e.isYou)

    function handleSelect(username) {
        navigate(`/profile/${username}`)
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <Spinner size="lg" />
                    <p className="text-xs text-text-tertiary animate-pulse">
                        Loading leaderboard…
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-[900px] mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-text-primary mb-1">
                        Leaderboard
                    </h1>
                    <p className="text-sm text-text-tertiary">
                        {totalMembers} members · {totalProblems} problems
                    </p>
                </div>
                {myEntry && (
                    <div className="flex items-center gap-3 bg-surface-2 border border-brand-400/25
                          rounded-xl px-4 py-2.5">
                        <span className="text-xs text-text-tertiary">Your rank</span>
                        <RankDisplay rank={myEntry.rank} />
                        <span className="text-sm font-bold text-brand-300">
                            #{myEntry.rank}
                        </span>
                    </div>
                )}
            </div>

            {/* Podium */}
            {top3.length >= 2 && (
                <div className="bg-surface-1 border border-border-default rounded-2xl
                        px-6 pt-6 pb-0 mb-6 overflow-hidden">
                    <Podium top3={top3} onSelect={handleSelect} />
                </div>
            )}

            {/* Table */}
            <div className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border-default">
                            <th className="pl-4 py-3 text-left">
                                <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                                    #
                                </span>
                            </th>
                            <th className="py-3 text-left">
                                <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                                    Member
                                </span>
                            </th>
                            <th className="py-3 text-center">
                                <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                                    Solved
                                </span>
                            </th>
                            <th className="py-3 text-center hidden md:table-cell">
                                <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                                    Streak
                                </span>
                            </th>
                            <th className="py-3 text-center hidden lg:table-cell">
                                <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                                    Conf.
                                </span>
                            </th>
                            <th className="py-3 pr-4 text-center hidden sm:table-cell">
                                <span className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                                    Coverage
                                </span>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                        {leaderboard.map((entry, i) => (
                            <LeaderRow
                                key={entry.userId}
                                entry={entry}
                                index={i}
                                onSelect={handleSelect}
                            />
                        ))}
                    </tbody>
                </table>

                {leaderboard.length === 0 && (
                    <div className="flex flex-col items-center gap-3 py-16 text-center">
                        <div className="text-4xl">🏆</div>
                        <p className="text-sm font-semibold text-text-primary">
                            No one on the board yet
                        </p>
                        <p className="text-xs text-text-tertiary">
                            Solve problems to claim the top spot!
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}