import { cn } from '@utils/cn'

// Category badge for `Topic.category` — DISTINCT from VerdictBadge, which was
// being misused for category values and rendered every non-verdict string as
// a gray "UNKNOWN"-style pill (BLOCKER-level UX bug — Learn cards showed a
// giant gray "LOW LEVEL DESIGN" pill that read as a status warning).
//
// Categories are content taxonomy (what kind of topic), not workflow verdicts.
// Each maps to a distinct tone so scanning a Learn catalog is fast.
const CATEGORY_TONE = {
  CODING:               'brand',    // interview coding staple
  SYSTEM_DESIGN:        'info',     // architecture blue
  LOW_LEVEL_DESIGN:     'purple',   // OOP/patterns purple
  AI_ENGINEERING:       'success',  // ML/LLM green
  DATA_STRUCTURES:      'warning',  // fundamentals amber
  DSA:                  'warning',  // schema-canonical name for DATA_STRUCTURES
  BEHAVIORAL:           'gray',
  CS_FUNDAMENTALS:      'gray',
  HR:                   'gray',
  DBMS:                 'info',
  OS:                   'gray',
  NETWORKS:             'info',
  // Phase D — cross-discipline curriculum expansion.
  PROGRAMMING_LANGUAGE: 'brand',    // language-first curricula
  FRAMEWORK:            'purple',   // language on top of language
  SQL:                  'info',     // relational query DB
  NOSQL:                'success',  // document / KV DB
}

// Semantic classes — theme-aware (light + dark), same convention as
// VerdictBadge + Badge.jsx. `purple` uses a soft violet; if the theme
// doesn't ship purple-* tokens the fallback lands on gray via CSS.
const TONE_CLASSES = {
  brand:   'bg-brand-soft    text-brand-fg-soft border-brand-line',
  info:    'bg-info-soft     text-info-fg       border-info-line',
  purple:  'bg-purple-100    text-purple-700    border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700/50',
  success: 'bg-success-soft  text-success-fg    border-success-line',
  warning: 'bg-warning-soft  text-warning-fg    border-warning-line',
  gray:    'bg-surface-3     text-text-secondary border-border-default',
}

export function CategoryBadge({ category, className }) {
  const tone = CATEGORY_TONE[category] ?? 'gray'
  const label = String(category ?? 'CATEGORY').replace(/_/g, ' ')
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border',
        'font-semibold leading-none whitespace-nowrap',
        'text-[10px] uppercase tracking-wider px-2 py-0.5',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {label}
    </span>
  )
}
