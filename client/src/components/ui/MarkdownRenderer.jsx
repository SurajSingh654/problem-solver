// ============================================================================
// MarkdownRenderer — sanitized markdown with syntax-highlighted code blocks
// ============================================================================
//
// Pipeline: marked → DOMPurify → hljs-class injection → prose-app styles.
//
// - marked v18 emits HTML; we override the `code` renderer to inject
//   highlight.js classes on fenced code blocks.
// - DOMPurify strips XSS vectors (event handlers, javascript: URLs, etc.)
//   while keeping `class` so hljs colors survive.
// - The wrapper class `prose prose-invert prose-app` applies Tailwind
//   Typography defaults plus our `.prose-app` overrides (in prose.css)
//   that retune prose tokens to match the rest of the app.
//
// Caller signature unchanged: <MarkdownRenderer content={...} className={...} size="default|sm" />
// ============================================================================
import { useMemo } from 'react'
import { Marked } from 'marked'
import hljs from 'highlight.js/lib/common'
import DOMPurify from 'dompurify'
import { cn } from '@utils/cn'

// One Marked instance per module — keep config local so we don't pollute
// any other surface that might import marked directly.
const md = new Marked({
    breaks: true,   // \n → <br>; matters for AI-generated content
    gfm: true,      // tables, strikethrough, task lists
})

md.use({
    renderer: {
        // Override the code renderer to inject highlight.js classes.
        // Returning the full <pre><code class="hljs language-X"> string
        // tells marked to use ours instead of its default.
        code({ text, lang }) {
            const language = lang && hljs.getLanguage(lang) ? lang : null
            let html
            try {
                html = language
                    ? hljs.highlight(text, { language, ignoreIllegals: true }).value
                    : hljs.highlightAuto(text).value
            } catch {
                // hljs can throw on degenerate input — fall back to escaped text
                html = escapeHtml(text)
            }
            const cls = language ? `hljs language-${language}` : 'hljs'
            return `<pre><code class="${cls}">${html}</code></pre>\n`
        },
    },
})

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

// DOMPurify config — allow the markdown surface area + class for hljs.
// We deliberately do NOT allow `style` attributes (a common XSS vector)
// or `target=_blank`-without-rel rewrites; sanitization is the goal.
const PURIFY_CONFIG = {
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'align', 'colspan', 'rowspan', 'checked', 'disabled', 'type'],
    // Keep all standard markdown tags. Block <iframe>, <object>, <embed>, etc.
    FORBID_TAGS: ['iframe', 'object', 'embed', 'form', 'input', 'button', 'script', 'style'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit'],
}

export function MarkdownRenderer({ content, className, size = 'default' }) {
    const html = useMemo(() => {
        if (!content) return ''
        // AI sometimes returns objects where strings were expected; flatten.
        const text = typeof content === 'object'
            ? Object.values(content).join('\n\n')
            : String(content)
        const raw = md.parse(text)
        return DOMPurify.sanitize(raw, PURIFY_CONFIG)
    }, [content])

    if (!html) return null

    const sizeClass = size === 'sm' ? 'prose-sm' : 'prose-base'

    return (
        <div
            className={cn('prose prose-invert prose-app max-w-none', sizeClass, className)}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    )
}
