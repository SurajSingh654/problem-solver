import { useState } from 'react'
import Editor from '@monaco-editor/react'
import { cn } from '@utils/cn'
import { LANGUAGE_LABELS } from '@utils/constants'

// ── Monaco language mapping ────────────────────────────
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
    OTHER: 'plaintext',
}

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
    height = '300px',
    showLanguageSelector = true,
    className,
}) {
    const [copied, setCopied] = useState(false)
    const [mounted, setMounted] = useState(false)

    // Detect theme from html class
    const isDark = typeof document !== 'undefined'
        ? document.documentElement.classList.contains('dark') ||
        !document.documentElement.classList.contains('light')
        : true

    function handleMount(editor, monaco) {
        defineTheme(monaco)
        monaco.editor.setTheme(isDark ? 'probsolver-dark' : 'probsolver-light')
        setMounted(true)

        // Set editor options after mount
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
            <div className="border border-border-strong rounded-xl overflow-hidden
                      bg-surface-1">

                {/* Header bar */}
                <div className="flex items-center justify-between px-3 py-2
                        border-b border-border-default bg-surface-2">

                    {/* Language selector */}
                    {showLanguageSelector && onLanguageChange ? (
                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                            {Object.entries(LANGUAGE_LABELS).map(([key, lbl]) => (
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
                                    {lbl}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <span className="text-xs font-mono text-text-tertiary">
                            {LANGUAGE_LABELS[language] || language}
                        </span>
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