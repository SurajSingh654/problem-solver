import { Suspense, lazy } from 'react'
import { useUIStore } from '@store/useUIStore'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'

// Lazy-load — @uiw/react-md-editor + its remark/rehype transitive deps are
// ~350 KB gzipped. Keep them out of the main bundle. The `manualChunks`
// entry in vite.config.js isolates the module in its own chunk.
const MDEditorLazy = lazy(() => import('@uiw/react-md-editor'))

/**
 * Thin wrapper around @uiw/react-md-editor with:
 *   - lazy-loading (Suspense fallback = spinner placeholder at the same height)
 *   - theme wiring (reads useUIStore().theme → data-color-mode)
 *   - optional label above the editor for accessibility
 *
 * Props: value, onChange, label?, height? (default 400), id?, className?
 */
export function MarkdownEditor({
  value,
  onChange,
  label,
  height = 400,
  id,
  className,
}) {
  const theme = useUIStore((s) => s.theme)
  const colorMode = theme === 'light' ? 'light' : 'dark'

  return (
    <div className={className} data-color-mode={colorMode}>
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-text-primary mb-2"
        >
          {label}
        </label>
      )}
      <Suspense
        fallback={
          <div
            className={cn(
              'border border-border-default rounded-md bg-surface-2',
              'flex items-center justify-center gap-2 text-sm text-text-tertiary',
            )}
            style={{ height }}
          >
            <Spinner size="sm" />
            <span>Loading editor…</span>
          </div>
        }
      >
        <MDEditorLazy
          id={id}
          value={value ?? ''}
          onChange={(v) => onChange?.(v ?? '')}
          height={height}
          preview="live"
        />
      </Suspense>
    </div>
  )
}
