import { cn } from '@utils/cn'

// Cost labels mirror the server-side CAPS table in
// server/src/utils/solveMethodCaps.js. If the server caps change, update
// these strings to match. Two integers don't justify a config endpoint.
const COST = {
  COLD:         { tone: 'success', label: 'Full credit' },
  HINTS:        { tone: 'warning', label: 'Pattern · Depth ≤8' },
  SAW_APPROACH: { tone: 'danger',  label: 'Pattern ≤5 · Depth ≤6' },
}

const TONE_CLASSES = {
  success: 'bg-success-soft text-success-fg border border-success-line',
  warning: 'bg-warning-soft text-warning-fg border border-warning-line',
  danger:  'bg-danger-soft text-danger-fg border border-danger-line',
}

/**
 * Cost badge for the SolveMethodPicker. Renders inline in each option card.
 * Surface the trade-off at the decision point — no after-the-fact surprise.
 */
export function SolveMethodCostBadge({ solveMethod, className }) {
  const cost = COST[solveMethod]
  if (!cost) return null
  return (
    <span className={cn(
      'inline-block text-[9px] font-bold uppercase tracking-wide rounded-md px-1.5 py-0.5',
      TONE_CLASSES[cost.tone],
      className,
    )}>
      {cost.label}
    </span>
  )
}
