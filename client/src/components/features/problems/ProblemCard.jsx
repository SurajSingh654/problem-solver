// ============================================================================
// ProbSolver v3.0 — Problem Card
// ============================================================================
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Badge } from '@components/ui/Badge'
import { cn } from '@utils/cn'
import { formatCompactDate } from '@utils/formatters'
import { PROBLEM_CATEGORIES } from '@utils/constants'

const DIFF_VARIANT = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
}

export function ProblemCard({ problem, index = 0 }) {
  const navigate = useNavigate()

  const {
    id,
    title,
    difficulty,
    category,
    tags,
    isSolved,
    solutionCount,
    isPinned,
    source,
    createdAt,
  } = problem

  const cat = PROBLEM_CATEGORIES.find(c => c.id === category)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      onClick={() => navigate(`/problems/${id}`)}
      className={cn(
        'group relative bg-surface-2 border rounded-xl p-4',
        'cursor-pointer transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-md',
        isSolved
          ? 'border-success/20 hover:border-success/40'
          : 'border-border-default hover:border-brand-400/40'
      )}
    >
      {/* Solved indicator */}
      {isSolved && (
        <div className="absolute top-3 right-3">
          <div className="w-6 h-6 rounded-full bg-success/15 border border-success/30
                          flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="#22c55e" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>
      )}

      {/* Pinned badge */}
      {isPinned && (
        <div className="flex gap-1.5 mb-2">
          <span className="text-[10px] font-bold text-warning bg-warning/10
                           border border-warning/25 rounded px-1.5 py-px">
            📌 Pinned
          </span>
        </div>
      )}

      {/* Title */}
      <h3 className={cn(
        'text-sm font-semibold leading-snug mb-2.5 pr-6 transition-colors',
        isSolved
          ? 'text-text-secondary group-hover:text-text-primary'
          : 'text-text-primary'
      )}>
        {title}
      </h3>

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <Badge variant={DIFF_VARIANT[difficulty] || 'brand'} size="xs">
          {difficulty?.charAt(0) + difficulty?.slice(1).toLowerCase()}
        </Badge>

        {/* Category badge (show for non-CODING) */}
        {cat && category !== 'CODING' && (
          <span className={cn(
            'text-[10px] font-bold px-1.5 py-px rounded-full border',
            cat.bg
          )}>
            {cat.icon} {cat.label}
          </span>
        )}

        {/* Source — only show if AI generated */}
        {source === 'AI_GENERATED' && (
          <span className="text-[10px] font-bold text-brand-300 bg-brand-400/10
                           border border-brand-400/25 rounded px-1.5 py-px">
            🤖 AI
          </span>
        )}

        {(tags || []).slice(0, 2).map(tag => (
          <span key={tag}
            className="text-[11px] text-text-tertiary bg-surface-3
                       px-1.5 py-px rounded border border-border-subtle">
            {tag}
          </span>
        ))}
        {(tags || []).length > 2 && (
          <span className="text-[11px] text-text-tertiary">
            +{tags.length - 2}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-text-tertiary">
        <div className="flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span>{solutionCount || 0} solved</span>
        </div>
        <span className="font-mono">
          {formatCompactDate(createdAt)}
        </span>
      </div>
    </motion.div>
  )
}