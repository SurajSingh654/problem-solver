// ============================================================================
// MarkdownRenderer — Renders Markdown strings as formatted HTML
// Uses the existing prose-content CSS class for consistent styling.
// Used for AI-generated content: description, adminNotes, realWorldContext.
// ============================================================================
import { useMemo } from 'react'
import { marked } from 'marked'
import { cn } from '@utils/cn'

// Configure marked once — consistent settings across all renders
marked.setOptions({
    breaks: true,      // Convert \n to <br> — important for AI-generated content
    gfm: true,         // GitHub Flavored Markdown — supports tables, strikethrough
})

export function MarkdownRenderer({ content, className, size = 'default' }) {
    const html = useMemo(() => {
        if (!content) return ''
        // If content is an object (AI sometimes returns adminNotes as object)
        // convert to string before parsing
        const text = typeof content === 'object'
            ? Object.values(content).join('\n\n')
            : String(content)
        return marked.parse(text)
    }, [content])

    if (!html) return null

    const sizeClass = size === 'sm' ? 'text-xs' : 'text-sm'

    return (
        <div
            className={cn('prose-content', sizeClass, className)}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    )
}