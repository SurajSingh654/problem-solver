import { cn } from '@utils/cn'

// Maps every verdict / gate-status string we emit anywhere in the curriculum
// pipeline (Week 2 validators + Week 3 gate labels) to one of four semantic
// palettes. Anything unrecognized falls through to `gray` — safer than throwing.
const VERDICT_COLOR = {
  // green — positive / ready / passing
  WORTH_LEARNING: 'success',
  READY: 'success',
  STRONG: 'success',
  PASS: 'success',
  PUBLISHED: 'success',
  // amber — partial / needs polish / reviewed but not shipped
  WORTH_WITH_ADJUSTMENTS: 'warning',
  POLISH: 'warning',
  ADEQUATE: 'warning',
  PARTIAL: 'warning',
  REVIEWED: 'warning',
  // red — blocker / failing / negative
  NOT_WORTH_TIME: 'danger',
  NOT_READY: 'danger',
  WEAK: 'danger',
  FAIL: 'danger',
  ERROR: 'danger',
  // gray — explicit neutral states
  DRAFT: 'gray',
  UNKNOWN: 'gray',
  PENDING: 'gray',
  REVIEWING: 'gray',
}

// Semantic tokens — same set the shared <Badge> component uses. These are
// theme-aware (light + dark) and pass WCAG on both surfaces. Do NOT switch
// to raw `bg-success/10 text-success` — see Badge.jsx comment.
const COLOR_CLASSES = {
  success: 'bg-success-soft text-success-fg    border-success-line',
  warning: 'bg-warning-soft text-warning-fg    border-warning-line',
  danger : 'bg-danger-soft  text-danger-fg     border-danger-line',
  gray   : 'bg-surface-3    text-text-secondary border-border-default',
}

export function VerdictBadge({ verdict, className }) {
  const color = VERDICT_COLOR[verdict] ?? 'gray'
  const label = String(verdict ?? 'UNKNOWN').replace(/_/g, ' ')
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border',
        'font-semibold leading-none whitespace-nowrap',
        'text-xs px-2 py-0.5',
        COLOR_CLASSES[color],
        className,
      )}
    >
      {label}
    </span>
  )
}
