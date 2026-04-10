import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@utils/cn'
import { formatShortDate } from '@utils/formatters'

export function ActivityHeatmap({ activity = {}, days = 91 }) {
    const cells = useMemo(() => {
        const result = []
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today)
            d.setDate(d.getDate() - i)
            const key = d.toISOString().split('T')[0]
            const count = activity[key] || 0
            result.push({ date: key, count, d })
        }
        return result
    }, [activity, days])

    const maxCount = Math.max(...cells.map(c => c.count), 1)

    function getColor(count) {
        if (count === 0) return 'bg-surface-3'
        const pct = count / maxCount
        if (pct <= 0.25) return 'bg-brand-400/30'
        if (pct <= 0.50) return 'bg-brand-400/55'
        if (pct <= 0.75) return 'bg-brand-400/80'
        return 'bg-brand-400'
    }

    // Group into weeks (columns)
    const weeks = useMemo(() => {
        const w = []
        for (let i = 0; i < cells.length; i += 7) {
            w.push(cells.slice(i, i + 7))
        }
        return w
    }, [cells])

    const months = useMemo(() => {
        const seen = new Set()
        const labels = []
        weeks.forEach((week, wi) => {
            week.forEach(cell => {
                const month = cell.d.toLocaleString('default', { month: 'short' })
                if (!seen.has(month)) {
                    seen.add(month)
                    labels.push({ month, col: wi })
                }
            })
        })
        return labels
    }, [weeks])

    const totalActive = cells.filter(c => c.count > 0).length
    const totalSolved = cells.reduce((sum, c) => sum + c.count, 0)

    return (
        <div>
            {/* Month labels */}
            <div className="flex mb-1.5 ml-0">
                <div className="flex gap-[3px]">
                    {weeks.map((week, wi) => {
                        const label = months.find(m => m.col === wi)
                        return (
                            <div key={wi} className="w-[10px] text-[9px] text-text-disabled font-mono">
                                {label ? label.month : ''}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Grid */}
            <div className="flex gap-[3px]">
                {weeks.map((week, wi) => (
                    <div key={wi} className="flex flex-col gap-[3px]">
                        {week.map((cell, di) => (
                            <motion.div
                                key={cell.date}
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.2, delay: wi * 0.01 }}
                                title={`${formatShortDate(cell.date)}: ${cell.count} solved`}
                                className={cn(
                                    'w-[10px] h-[10px] rounded-[2px] transition-all duration-150',
                                    'hover:ring-1 hover:ring-brand-400/60 cursor-default',
                                    getColor(cell.count)
                                )}
                            />
                        ))}
                    </div>
                ))}
            </div>

            {/* Legend + summary */}
            <div className="flex items-center justify-between mt-3">
                <span className="text-[11px] text-text-disabled">
                    {totalSolved} solved · {totalActive} active days
                </span>
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-text-disabled">Less</span>
                    {['bg-surface-3', 'bg-brand-400/30', 'bg-brand-400/55', 'bg-brand-400/80', 'bg-brand-400'].map(c => (
                        <div key={c} className={cn('w-[10px] h-[10px] rounded-[2px]', c)} />
                    ))}
                    <span className="text-[10px] text-text-disabled">More</span>
                </div>
            </div>
        </div>
    )
}