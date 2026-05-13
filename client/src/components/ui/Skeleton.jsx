// ============================================================================
// Skeleton — progressive-loading placeholder shapes
// ============================================================================
//
// Spinners say "something is loading." Skeletons say "content is coming, and
// here's the shape it will take." For perceived performance the latter wins
// (Nielsen Norman Group's perceived-load research, also Google Maps tile
// skeletons). Use when:
//   - a data-driven section is async and the layout shape is predictable
//   - the user is waiting on a single resource (a card, a list, a panel)
//
// Stick to the existing visual vocabulary — `bg-surface-2`, `border-*`,
// `rounded-*`. Animations honour `prefers-reduced-motion` automatically
// because Tailwind's `animate-pulse` is wrapped in `motion-safe:` here.
// Without that, motion-sensitive users would see a constant pulse.
// ============================================================================

import { cn } from '@utils/cn'

// Base block — every variant is a thin wrapper around this primitive.
// Pulse animation gated on motion-safe so reduced-motion users see a
// static placeholder (still legible, just not animated).
function SkeletonBlock({ className, style }) {
    return (
        <div
            aria-hidden="true"
            className={cn(
                'bg-surface-2 rounded-md',
                'motion-safe:animate-pulse',
                className,
            )}
            style={style}
        />
    )
}

// Single line of text. Width defaults to full; pass `w-2/3` etc. to vary.
function SkeletonText({ className }) {
    return <SkeletonBlock className={cn('h-3 w-full', className)} />
}

// N stacked text lines with the last one shorter — the natural reading
// shape humans expect from a paragraph.
function SkeletonLines({ lines = 3, className }) {
    return (
        <div className={cn('space-y-2', className)}>
            {Array.from({ length: lines }).map((_, i) => (
                <SkeletonBlock
                    key={i}
                    className={cn(
                        'h-3',
                        i === lines - 1 ? 'w-3/4' : 'w-full',
                    )}
                />
            ))}
        </div>
    )
}

// A card-shaped placeholder — title + 2-3 lines + optional action area.
// Matches the dimensions of the most common card pattern in the app
// (`bg-surface-1 border border-border-default rounded-2xl p-5`).
function SkeletonCard({ className, lines = 3, withFooter = false }) {
    return (
        <div
            className={cn(
                'bg-surface-1 border border-border-default rounded-2xl p-5 space-y-3',
                className,
            )}
        >
            <SkeletonBlock className="h-4 w-1/2" />
            <SkeletonLines lines={lines} />
            {withFooter && (
                <div className="flex items-center gap-2 pt-1">
                    <SkeletonBlock className="h-7 w-20" />
                    <SkeletonBlock className="h-7 w-20" />
                </div>
            )}
        </div>
    )
}

// A horizontal row — for list items: avatar + title-line + meta-line.
function SkeletonRow({ className }) {
    return (
        <div
            className={cn(
                'flex items-center gap-3 py-3',
                className,
            )}
        >
            <SkeletonBlock className="h-9 w-9 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5 min-w-0">
                <SkeletonBlock className="h-3 w-1/2" />
                <SkeletonBlock className="h-2.5 w-3/4" />
            </div>
        </div>
    )
}

// Avatar circle.
function SkeletonAvatar({ size = 'md', className }) {
    const sizes = { sm: 'h-7 w-7', md: 'h-9 w-9', lg: 'h-12 w-12' }
    return <SkeletonBlock className={cn(sizes[size], 'rounded-full', className)} />
}

// Compose-friendly default export — same pattern as design-system kits
// (Skeleton.Text, Skeleton.Card, etc.). Each piece is also exposed as a
// named export so tree-shaking still works for callers using one variant.
export const Skeleton = Object.assign(SkeletonBlock, {
    Text: SkeletonText,
    Lines: SkeletonLines,
    Card: SkeletonCard,
    Row: SkeletonRow,
    Avatar: SkeletonAvatar,
})

export {
    SkeletonBlock,
    SkeletonText,
    SkeletonLines,
    SkeletonCard,
    SkeletonRow,
    SkeletonAvatar,
}

export default Skeleton
