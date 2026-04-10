import { motion } from 'framer-motion'
import { cn }     from '@utils/cn'
import { PATTERNS } from '@utils/constants.js'

const PATTERN_COLORS = [
  '#7c6ff7','#22c55e','#3b82f6','#ef4444',
  '#eab308','#ec4899','#14b8a6','#f97316',
  '#a855f7','#06b6d4','#84cc16','#f43f5e',
  '#8b5cf6','#10b981','#f59e0b','#6366f1',
]

export function PatternCoverage({ patternMap = {} }) {
  const total = PATTERNS.length

  const items = PATTERNS.map((pattern, i) => ({
    name  : pattern.label,
    count : patternMap[pattern.label] || 0,
    color : PATTERN_COLORS[i % PATTERN_COLORS.length],
  }))

  const covered = items.filter(p => p.count > 0).length
  const maxCount = Math.max(...items.map(p => p.count), 1)

  return (
    <div>
      {/* Coverage summary */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <span className="font-semibold text-text-primary text-sm">
            {covered}
          </span>
          <span>of {total} patterns touched</span>
        </div>
        <div className="text-xs font-mono text-text-tertiary">
          {Math.round((covered / total) * 100)}%
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-surface-3 rounded-full mb-5 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${(covered / total) * 100}%` }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
          className="h-full rounded-full bg-brand-400"
        />
      </div>

      {/* Pattern list */}
      <div className="space-y-2">
        {items.map((pattern, i) => (
          <motion.div
            key={pattern.name}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0  }}
            transition={{ duration: 0.15, delay: i * 0.03 }}
            className="flex items-center gap-3"
          >
            {/* Color dot */}
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: pattern.count > 0 ? pattern.color : '#35354a' }}
            />

            {/* Name */}
            <span className={cn(
              'text-xs flex-1 truncate',
              pattern.count > 0 ? 'text-text-secondary' : 'text-text-disabled'
            )}>
              {pattern.name}
            </span>

            {/* Bar */}
            <div className="w-20 h-1 bg-surface-3 rounded-full overflow-hidden flex-shrink-0">
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width: pattern.count > 0
                    ? `${(pattern.count / maxCount) * 100}%`
                    : '0%'
                }}
                transition={{ duration: 0.8, ease: 'easeOut', delay: i * 0.04 }}
                className="h-full rounded-full"
                style={{ background: pattern.color }}
              />
            </div>

            {/* Count */}
            <span className={cn(
              'text-[11px] font-mono w-4 text-right flex-shrink-0',
              pattern.count > 0 ? 'text-text-tertiary' : 'text-text-disabled'
            )}>
              {pattern.count || '—'}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}