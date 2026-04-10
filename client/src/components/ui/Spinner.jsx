import { cn } from '@utils/cn'

const sizes = {
  xs: 'w-3 h-3 border',
  sm: 'w-4 h-4 border',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-2',
  xl: 'w-12 h-12 border-[3px]',
}

export function Spinner({ size = 'md', className }) {
  return (
    <div
      className={cn(
        'rounded-full border-border-default border-t-brand-400',
        'animate-spin',
        sizes[size],
        className
      )}
    />
  )
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-[60vh] w-full">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-xs text-text-tertiary animate-pulse">Loading…</p>
      </div>
    </div>
  )
}