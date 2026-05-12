// ============================================================================
// RecallByPatternTable — sortable table: pattern × attempts/rate/confidence
// ============================================================================
import { useMemo, useState } from 'react'
import { cn } from '@utils/cn'

const COLS = [
    { key: 'pattern', label: 'Pattern', align: 'left' },
    { key: 'attempts', label: 'Reviews', align: 'right' },
    { key: 'recallRate', label: 'Recall rate', align: 'right' },
    { key: 'avgConfidence', label: 'Avg confidence', align: 'right' },
]

function ratePillClass(rate) {
    if (rate >= 0.8) return 'text-success-fg bg-success-soft border-success-line'
    if (rate >= 0.5) return 'text-warning-fg bg-warning-soft border-warning-line'
    return 'text-danger-fg bg-danger-soft border-danger-line'
}

export function RecallByPatternTable({ rows }) {
    const [sortKey, setSortKey] = useState('attempts')
    const [sortDir, setSortDir] = useState('desc')

    const sorted = useMemo(() => {
        const sign = sortDir === 'asc' ? 1 : -1
        return [...rows].sort((a, b) => {
            const x = a[sortKey]
            const y = b[sortKey]
            if (typeof x === 'string') return sign * x.localeCompare(y)
            return sign * (x - y)
        })
    }, [rows, sortKey, sortDir])

    function onSort(key) {
        if (sortKey === key) {
            setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
        } else {
            setSortKey(key)
            setSortDir('desc')
        }
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-xs">
                <thead>
                    <tr className="border-b border-border-subtle">
                        {COLS.map(col => (
                            <th
                                key={col.key}
                                onClick={() => onSort(col.key)}
                                className={cn(
                                    'py-2 px-2 font-bold text-[10px] uppercase tracking-widest cursor-pointer select-none',
                                    col.align === 'right' ? 'text-right' : 'text-left',
                                    sortKey === col.key ? 'text-text-primary' : 'text-text-disabled',
                                )}
                            >
                                {col.label}
                                {sortKey === col.key && (
                                    <span className="ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>
                                )}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {sorted.map(r => (
                        <tr key={r.pattern} className="border-b border-border-subtle last:border-0">
                            <td className="py-2 px-2 text-text-primary font-semibold">{r.pattern}</td>
                            <td className="py-2 px-2 text-right text-text-secondary tabular-nums">{r.attempts}</td>
                            <td className="py-2 px-2 text-right">
                                <span className={cn('inline-block text-[10px] font-bold border rounded-full px-1.5 py-px tabular-nums', ratePillClass(r.recallRate))}>
                                    {Math.round(r.recallRate * 100)}%
                                </span>
                            </td>
                            <td className="py-2 px-2 text-right text-text-secondary tabular-nums">
                                {r.avgConfidence.toFixed(2)} / 5
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
