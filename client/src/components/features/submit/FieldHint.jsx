import { cn } from '@utils/cn'
import { iconForLabel } from './icons'

const TONE_CLASSES = {
  error:   'text-danger-fg',
  info:    'text-text-tertiary',
  success: 'text-success-fg',
}

const TONE_ICONS = {
  error:   'tone-warning',
  info:    'tone-info',
  success: 'check',
}

/**
 * Inline hint rendered immediately below a form field. Used for first-blur
 * validation messages, info notes, and saved-state indicators.
 *
 * Returns null when `children` is falsy so callers can render
 * unconditionally and let the component decide.
 */
export function FieldHint({ tone = 'info', children, className }) {
  if (!children) return null
  const Icon = iconForLabel(TONE_ICONS[tone])
  return (
    <p className={cn(
      'mt-1 flex items-center gap-1.5 text-[11px] leading-relaxed',
      TONE_CLASSES[tone],
      className,
    )}>
      {Icon && <Icon className="w-3 h-3 flex-shrink-0" aria-hidden="true" />}
      <span>{children}</span>
    </p>
  )
}
