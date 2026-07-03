import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { cn } from '@utils/cn'
import { LANGUAGE_LABELS } from '@utils/constants'

// ── Monaco language mapping ────────────────────────────
// Maps uppercase enum keys to Monaco language identifiers
const MONACO_LANG = {
    PYTHON: 'python',
    JAVASCRIPT: 'javascript',
    JAVA: 'java',
    CPP: 'cpp',
    C: 'c',
    GO: 'go',
    RUST: 'rust',
    TYPESCRIPT: 'typescript',
    SWIFT: 'swift',
    KOTLIN: 'kotlin',
    GROOVY: 'groovy',
    SQL: 'sql',       // Added — used in SQL category problems
    OTHER: 'plaintext',
}

// Languages shown in the submit form dropdown — interview-relevant only.
// Full list available in CodeEditor when showLanguageSelector=true.
// (Co-located with the editor for cohesion; HMR fast-refresh warning
// is acceptable since this constant rarely changes.)
// eslint-disable-next-line react-refresh/only-export-components
export const SUBMIT_LANGUAGES = [
    'PYTHON',
    'JAVASCRIPT',
    'TYPESCRIPT',
    'JAVA',
    'CPP',
    'C',
    'GO',
    'RUST',
    'SWIFT',
    'KOTLIN',
    'GROOVY',
    'SQL',
]

// ── CSS-var readers ────────────────────────────────────
// Read a CSS custom property from :root, returning fallback on empty/missing.
function readCssVar(name, fallback) {
    if (typeof document === 'undefined') return fallback
    const value = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim()
    return value || fallback
}

// Convert a CSS-var value to a Monaco-compatible 6-digit hex.
// - Rejects malformed values (only 3/6/8 hex digits accepted, optionally #-prefixed)
// - Expands 3-digit shorthand (#abc → #aabbcc) so downstream alpha concat is safe
// - Falls back on any non-hex form (rgb(), hsl(), keyword) — protects against
//   CSS-var injection primitives + legacy shorthand.
function toMonacoHex(value, fallback) {
    const raw = (value || '').trim().replace(/^#/, '')
    if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(raw)) {
        return fallback
    }
    if (raw.length === 3) {
        return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`
    }
    return `#${raw}`
}

// ── Theme factory ──────────────────────────────────────
// Build a Monaco theme object from CSS-var reads.
// - Chrome colors (background, fg, line highlight, cursor, indent, scrollbar,
//   selection) source from CSS vars in src/styles/index.css.
// - Syntax rule colors (comment/keyword/string/number/type/function) stay as
//   deliberate identity hex values — those are design decisions, not tokens.
// - Alpha-suffixed selection colors use the brand-500 CSS var + literal alpha
//   suffix so a token change propagates cleanly.
function buildTheme(mode) {
    const brand = toMonacoHex(readCssVar('--brand-500'), '#7c6ff7')
    const surface0 = toMonacoHex(readCssVar('--surface-0'), mode === 'dark' ? '#111118' : '#f0f0f5')
    const surface1 = toMonacoHex(readCssVar('--surface-1'), mode === 'dark' ? '#18181f' : '#e8e8f0')
    const surface2 = toMonacoHex(readCssVar('--surface-2'), mode === 'dark' ? '#202028' : '#dddde8')
    const surface3 = toMonacoHex(readCssVar('--surface-3'), mode === 'dark' ? '#282832' : '#c9c9d4')
    const fgPrimary = toMonacoHex(readCssVar('--fg-primary'), mode === 'dark' ? '#eeeef5' : '#0f0f1a')
    const fgSecondary = toMonacoHex(readCssVar('--fg-secondary'), mode === 'dark' ? '#55556e' : '#6b6b8a')
    const fgTertiary = toMonacoHex(readCssVar('--fg-tertiary'), mode === 'dark' ? '#35354a' : '#9999b0')

    return {
        base: mode === 'dark' ? 'vs-dark' : 'vs',
        inherit: true,
        rules: [
            { token: 'comment', foreground: mode === 'dark' ? '55556e' : '6b6b8a', fontStyle: 'italic' },
            { token: 'keyword', foreground: mode === 'dark' ? '9d93f9' : '6358d4' },
            { token: 'string', foreground: mode === 'dark' ? '22c55e' : '16a34a' },
            { token: 'number', foreground: mode === 'dark' ? 'eab308' : 'ca8a04' },
            { token: 'type', foreground: mode === 'dark' ? '3b82f6' : '2563eb' },
            { token: 'function', foreground: mode === 'dark' ? '60a5fa' : '3b82f6' },
        ],
        colors: {
            'editor.background': surface0,
            'editor.foreground': fgPrimary,
            'editor.lineHighlightBackground': surface1,
            'editorLineNumber.foreground': fgTertiary,
            'editorLineNumber.activeForeground': fgSecondary,
            'editorCursor.foreground': brand,
            'editorIndentGuide.background': surface2,
            'editorIndentGuide.activeBackground': surface3,
            'editor.selectionBackground': `${brand}30`,
            'editor.inactiveSelectionBackground': `${brand}15`,
            'editor.selectionHighlightBackground': `${brand}20`,
            'editorBracketMatch.background': `${brand}25`,
            'editorBracketMatch.border': `${brand}50`,
            'scrollbarSlider.background': `${surface3}40`,
            'scrollbarSlider.hoverBackground': `${surface3}80`,
        },
    }
}

// Apply both themes + activate the current one based on `.light` class presence.
// `useUIStore.js:31-36` toggles only `dark`/`light` classes on <html>, so
// !contains("light") is the correct dark-mode signal (matches the store's
// implicit "dark unless light is set" semantic).
function applyThemes(monaco) {
    const isDark = !document.documentElement.classList.contains('light')
    monaco.editor.defineTheme('probsolver-dark', buildTheme('dark'))
    monaco.editor.defineTheme('probsolver-light', buildTheme('light'))
    monaco.editor.setTheme(isDark ? 'probsolver-dark' : 'probsolver-light')
}

// ── Main component ─────────────────────────────────────
export function CodeEditor({
    code = '',
    onChange,
    language = 'PYTHON',
    onLanguageChange,
    label,
    optional = false,
    hint,
    height = '320px',
    showLanguageSelector = true,
    // 'buttons' — horizontal scrollable button row (original behavior)
    // 'dropdown' — compact select dropdown (used in submit/edit forms)
    selectorStyle = 'buttons',
    // Optional filter for which languages to show in the selector
    languages = null,
    className,
}) {
    const [copied, setCopied] = useState(false)
    const monacoRef = useRef(null)

    // Reactively re-apply themes when the user toggles dark/light on <html>.
    // Debounce via queueMicrotask so useUIStore.js:31-36's `remove(dark) + add(light)`
    // batches into ONE applyThemes call, not two per toggle.
    useEffect(() => {
        let pending = false
        const observer = new MutationObserver(() => {
            if (pending) return
            pending = true
            queueMicrotask(() => {
                pending = false
                if (monacoRef.current) applyThemes(monacoRef.current)
            })
        })
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class'],
        })
        return () => observer.disconnect()
    }, [])

    function handleMount(editor, monaco) {
        // Store monaco for the MutationObserver effect. The effect fires
        // BEFORE Monaco lazy-loads, so we cannot rely on it for initial paint —
        // applyThemes must run here at first mount too.
        monacoRef.current = monaco
        applyThemes(monaco)
        editor.updateOptions({
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace",
            fontLigatures: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: 'on',
            glyphMargin: false,
            folding: true,
            lineDecorationsWidth: 8,
            lineNumbersMinChars: 3,
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: 'line',
            roundedSelection: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true,
            tabSize: 2,
            wordWrap: 'on',
            automaticLayout: true,
            bracketPairColorization: { enabled: true },
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            overviewRulerLanes: 0,
            scrollbar: {
                vertical: 'auto',
                horizontal: 'auto',
                verticalScrollbarSize: 6,
                horizontalScrollbarSize: 6,
            },
        })
    }

    function handleCopy() {
        if (!code) return
        navigator.clipboard.writeText(code)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const monacoLang = MONACO_LANG[language] || 'plaintext'
    const displayLanguages = languages || Object.keys(LANGUAGE_LABELS)

    return (
        <div className={cn('space-y-1.5', className)}>
            {/* Label */}
            {label && (
                <label className="block text-sm font-semibold text-text-primary">
                    {label}
                    {optional && (
                        <span className="ml-1.5 text-xs font-normal text-text-disabled">
                            optional
                        </span>
                    )}
                </label>
            )}
            {hint && <p className="text-xs text-text-tertiary">{hint}</p>}

            {/* Editor container */}
            <div className="border border-border-strong rounded-xl overflow-hidden bg-surface-1">

                {/* Header bar */}
                <div className="flex items-center justify-between px-3 py-2
                        border-b border-border-default bg-surface-2">

                    {/* Language selector */}
                    {showLanguageSelector && onLanguageChange ? (
                        selectorStyle === 'dropdown' ? (
                            // ── Dropdown mode ──────────────────────────────
                            <div className="flex items-center gap-2">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2"
                                    strokeLinecap="round" strokeLinejoin="round"
                                    className="text-text-disabled flex-shrink-0">
                                    <polyline points="16 18 22 12 16 6" />
                                    <polyline points="8 6 2 12 8 18" />
                                </svg>
                                <select
                                    value={language}
                                    onChange={e => onLanguageChange(e.target.value)}
                                    className="bg-transparent text-xs font-semibold text-text-primary
                                               outline-none cursor-pointer border-none
                                               appearance-none pr-4"
                                    style={{ backgroundImage: 'none' }}
                                >
                                    {displayLanguages.map(key => (
                                        <option
                                            key={key}
                                            value={key}
                                            className="bg-surface-2 text-text-primary"
                                        >
                                            {LANGUAGE_LABELS[key] || key}
                                        </option>
                                    ))}
                                </select>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round"
                                    className="text-text-disabled flex-shrink-0 -ml-3 pointer-events-none">
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                            </div>
                        ) : (
                            // ── Buttons mode (original) ─────────────────────
                            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                                {displayLanguages.map(key => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => onLanguageChange(key)}
                                        className={cn(
                                            'px-2 py-1 rounded-md text-[11px] font-semibold',
                                            'transition-all duration-100 whitespace-nowrap',
                                            language === key
                                                ? 'bg-brand-soft text-brand-fg-soft border border-brand-line'
                                                : 'text-text-disabled hover:text-text-tertiary border border-transparent'
                                        )}
                                    >
                                        {LANGUAGE_LABELS[key] || key}
                                    </button>
                                ))}
                            </div>
                        )
                    ) : (
                        // Read-only language label
                        <div className="flex items-center gap-1.5">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round"
                                className="text-text-disabled">
                                <polyline points="16 18 22 12 16 6" />
                                <polyline points="8 6 2 12 8 18" />
                            </svg>
                            <span className="text-xs font-mono text-text-tertiary">
                                {LANGUAGE_LABELS[language] || language}
                            </span>
                        </div>
                    )}

                    {/* Copy button */}
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-md
                       text-xs text-text-tertiary hover:text-text-primary
                       transition-colors flex-shrink-0 ml-2"
                    >
                        {copied ? (
                            <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                    stroke="#22c55e" strokeWidth="2.5"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span className="text-success-fg font-semibold">Copied</span>
                            </>
                        ) : (
                            <>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2"
                                    strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                                <span>Copy</span>
                            </>
                        )}
                    </button>
                </div>

                {/* Monaco Editor */}
                <div style={{ height }}>
                    <Editor
                        language={monacoLang}
                        value={code}
                        onChange={val => onChange?.(val || '')}
                        onMount={handleMount}
                        // Static placeholder — applyThemes() in handleMount overwrites
                        // this immediately with the correct theme based on classList.
                        theme="probsolver-dark"
                        loading={
                            <div className="flex items-center justify-center h-full
                              text-xs text-text-tertiary gap-2">
                                <div className="w-4 h-4 rounded-full border-2 border-brand-400
                                border-t-transparent animate-spin" />
                                Loading editor...
                            </div>
                        }
                        options={{
                            fontSize: 13,
                            fontFamily: "'JetBrains Mono', monospace",
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            padding: { top: 12, bottom: 12 },
                            automaticLayout: true,
                            tabSize: 2,
                            wordWrap: 'on',
                        }}
                    />
                </div>
            </div>
        </div>
    )
}
