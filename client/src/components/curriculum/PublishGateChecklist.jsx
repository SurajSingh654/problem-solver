import { cn } from '@utils/cn'
import { VerdictBadge } from './VerdictBadge'

/**
 * Renders the list of publish gates returned by the review/publish endpoint
 * (see W3.T4). Each gate has `{ id, label, status: 'PASS' | 'FAIL', message }`.
 * Empty / non-array input renders nothing (so the caller doesn't have to guard).
 */
export function PublishGateChecklist({ gates, className }) {
  if (!Array.isArray(gates) || gates.length === 0) return null
  return (
    <ul className={cn('space-y-3', className)}>
      {gates.map((gate) => (
        <li key={gate.id} className="flex items-start gap-3">
          <VerdictBadge verdict={gate.status} className="mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text-primary">
              {gate.label}
            </div>
            {gate.message && (
              <div className="text-xs text-text-secondary mt-0.5">
                {gate.message}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
