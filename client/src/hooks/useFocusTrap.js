// ============================================================================
// useFocusTrap — keyboard focus management for modals/drawers
// ============================================================================
//
// When a modal opens, screen-reader and keyboard-only users expect:
//   1. Focus moves INTO the modal (so Tab cycles through its controls,
//      not the page behind it)
//   2. Focus is TRAPPED inside (Tab from the last element wraps to the
//      first, Shift+Tab from first wraps to last)
//   3. Escape closes the modal
//   4. On close, focus returns to the element that triggered the modal
//
// Without this, the modal might "look" open but a keyboard user keeps
// tabbing through page-behind controls — total UX failure for a11y.
//
// Usage:
//   const ref = useFocusTrap({ active: isOpen, onEscape: onClose })
//   return <div ref={ref}>...</div>
//
// Implementation matches the WAI-ARIA Modal Dialog pattern. We don't
// pull in `focus-trap` or `react-focus-lock` because both libraries are
// 5-10kb and we only need a small subset.
// ============================================================================

import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useFocusTrap({ active = true, onEscape } = {}) {
    const containerRef = useRef(null)

    useEffect(() => {
        if (!active) return
        const container = containerRef.current
        if (!container) return

        // Save the element that had focus before we opened — restore it on close.
        const previouslyFocused = document.activeElement

        // Move focus to the first focusable inside the modal. If nothing
        // is focusable, focus the container itself (so screen readers
        // start announcing from there).
        const firstFocusable = container.querySelector(FOCUSABLE_SELECTOR)
        if (firstFocusable) {
            firstFocusable.focus()
        } else {
            container.setAttribute('tabindex', '-1')
            container.focus()
        }

        function handleKeyDown(e) {
            if (e.key === 'Escape' && onEscape) {
                e.preventDefault()
                onEscape()
                return
            }
            if (e.key !== 'Tab') return

            const focusable = Array.from(
                container.querySelectorAll(FOCUSABLE_SELECTOR),
            ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)
            if (focusable.length === 0) {
                e.preventDefault()
                return
            }

            const first = focusable[0]
            const last = focusable[focusable.length - 1]

            // Tab on last → wrap to first; Shift+Tab on first → wrap to last.
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault()
                last.focus()
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault()
                first.focus()
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => {
            document.removeEventListener('keydown', handleKeyDown)
            // Restore focus to whatever was focused before the modal opened.
            // Skip if that element is gone from the DOM — nothing useful to do.
            if (previouslyFocused && document.contains(previouslyFocused)) {
                previouslyFocused.focus?.()
            }
        }
    }, [active, onEscape])

    return containerRef
}
