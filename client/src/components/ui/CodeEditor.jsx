import { useState } from 'react'
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

// Languages shown in the submit form dropdown — interview-relevant only
// Full list available in CodeEditor when showLanguageSelector=true (all buttons mode)
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

// ── Dark theme definition ──────────────────────────────
function defineTheme(monaco) {
    monaco.editor.defineTheme('probsolver-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'comment', foreground: '55556e', fontStyle: 'italic' },
            { token: 'keyword', foreground: '9d93f9' },
            { token: 'string', foreground: '22c55e' },
            { token: 'number', foreground: 'eab308' },
            { token: 'type', foreground: '3b82f6' },
            { token: 'function', foreground: '60a5fa' },
        ],
        colors: {
            'editor.background': '#111118',
            'editor.foreground': '#eeeef5',
            'editor.lineHighlightBackground': '#18181f',
            'editor.selectionBackground': '#7c6ff730',
            'editor.inactiveSelectionBackground': '#7c6ff715',
            'editorLineNumber.foreground': '#35354a',
            'editorLineNumber.activeForeground': '#55556e',
            'editorCursor.foreground': '#7c6ff7',
            'editorIndentGuide.background': '#202028',
            'editorIndentGuide.activeBackground': '#282832',
            'editor.selectionHighlightBackground': '#7c6ff720',
            'editorBracketMatch.background': '#7c6ff725',
            'editorBracketMatch.border': '#7c6ff750',
            'scrollbarSlider.background': '#28283240',
            'scrollbarSlider.hoverBackground': '#28283280',
        },
    })
    monaco.editor.defineTheme('probsolver-light', {
        base: 'vs',
        inherit: true,
        rules: [
            { token: 'comment', foreground: '6b6b8a', fontStyle: 'italic' },
            { token: 'keyword', foreground: '6358d4' },
            { token: 'string', foreground: '16a34a' },
            { token: 'number', foreground: 'ca8a04' },
            { token: 'type', foreground: '2563eb' },
            { token: 'function', foreground: '3b82f6' },
        ],
        colors: {
            'editor.background': '#f0f0f5',
            'editor.foreground': '#0f0f1a',
            'editor.lineHighlightBackground': '#e8e8f0',
            'editor.selectionBackground': '#7c6ff730',
            'editorLineNumber.foreground': '#9999b0',
            'editorLineNumber.activeForeground': '#6b6b8a',
            'editorCursor.foreground': '#7c6ff7',
            'editorIndentGuide.background': '#dddde8',
            'scrollbarSlider.background': '#dddde840',
        },
    })
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
    const [mounted, setMounted] = useState(false)

    const isDark = typeof document !== 'undefined'
        ? document.documentElement.classList.contains('dark') ||
        !document.documentElement.classList.contains('light')
        : true

    function handleMount(editor, monaco) {
        defineTheme(monaco)
        monaco.editor.setTheme(isDark ? 'probsolver-dark' : 'probsolver-light')
        setMounted(true)
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
                                                ? 'bg-brand-400/20 text-brand-300 border border-brand-400/30'
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
                                <span className="text-success font-semibold">Copied</span>
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
                        theme={isDark ? 'probsolver-dark' : 'probsolver-light'}
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