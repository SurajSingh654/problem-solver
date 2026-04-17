import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import { cn } from '@utils/cn'

// ── Toolbar button ─────────────────────────────────────
function ToolbarBtn({ onClick, active, title, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className={cn(
                'w-7 h-7 flex items-center justify-center rounded-md',
                'text-xs transition-all duration-100',
                active
                    ? 'bg-brand-400/20 text-brand-300'
                    : 'text-text-tertiary hover:text-text-primary hover:bg-surface-4'
            )}
        >
            {children}
        </button>
    )
}

// ── Divider ────────────────────────────────────────────
function Divider() {
    return <div className="w-px h-4 bg-border-default mx-0.5" />
}

// ── Main component ─────────────────────────────────────
export function RichTextEditor({
    content = '',
    onChange,
    placeholder = 'Start writing...',
    label,
    optional = false,
    hint,
    minHeight = '120px',
    className,
}) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: false,
                codeBlock: false,
                horizontalRule: false,
                blockquote: {
                    HTMLAttributes: {
                        class: 'border-l-3 border-brand-400/40 pl-3 italic text-text-tertiary',
                    },
                },
            }),
            Underline,
            Placeholder.configure({
                placeholder,
                emptyEditorClass:
                    'before:content-[attr(data-placeholder)] before:text-text-disabled ' +
                    'before:float-left before:h-0 before:pointer-events-none',
            }),
        ],
        content,
        editorProps: {
            attributes: {
                class: cn(
                    'outline-none text-sm text-text-primary leading-relaxed',
                    'prose-p:mb-2 prose-ul:pl-5 prose-ol:pl-5',
                    'prose-li:mb-0.5 prose-strong:text-text-primary',
                    'prose-em:text-text-secondary',
                    'prose-u:underline prose-u:decoration-brand-400/50',
                ),
                style: `min-height: ${minHeight}`,
            },
        },
        onUpdate: ({ editor }) => {
            onChange?.(editor.getHTML())
        },
    })

    if (!editor) return null

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
            {hint && (
                <p className="text-xs text-text-tertiary">{hint}</p>
            )}

            {/* Editor container */}
            <div className={cn(
                'bg-surface-3 border border-border-strong rounded-xl overflow-hidden',
                'transition-all duration-150',
                'focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-400/20',
            )}>
                {/* Toolbar */}
                <div className="flex items-center gap-0.5 px-2 py-1.5
                        border-b border-border-default bg-surface-2/50">
                    {/* Bold */}
                    <ToolbarBtn
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        active={editor.isActive('bold')}
                        title="Bold (⌘B)"
                    >
                        <span className="font-bold text-xs">B</span>
                    </ToolbarBtn>

                    {/* Italic */}
                    <ToolbarBtn
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        active={editor.isActive('italic')}
                        title="Italic (⌘I)"
                    >
                        <span className="italic text-xs">I</span>
                    </ToolbarBtn>

                    {/* Underline */}
                    <ToolbarBtn
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        active={editor.isActive('underline')}
                        title="Underline (⌘U)"
                    >
                        <span className="underline text-xs">U</span>
                    </ToolbarBtn>

                    {/* Strike */}
                    <ToolbarBtn
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                        active={editor.isActive('strike')}
                        title="Strikethrough"
                    >
                        <span className="line-through text-xs">S</span>
                    </ToolbarBtn>

                    <Divider />

                    {/* Bullet list */}
                    <ToolbarBtn
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        active={editor.isActive('bulletList')}
                        title="Bullet list"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <line x1="8" y1="6" x2="21" y2="6" />
                            <line x1="8" y1="12" x2="21" y2="12" />
                            <line x1="8" y1="18" x2="21" y2="18" />
                            <line x1="3" y1="6" x2="3.01" y2="6" />
                            <line x1="3" y1="12" x2="3.01" y2="12" />
                            <line x1="3" y1="18" x2="3.01" y2="18" />
                        </svg>
                    </ToolbarBtn>

                    {/* Ordered list */}
                    <ToolbarBtn
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        active={editor.isActive('orderedList')}
                        title="Numbered list"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <line x1="10" y1="6" x2="21" y2="6" />
                            <line x1="10" y1="12" x2="21" y2="12" />
                            <line x1="10" y1="18" x2="21" y2="18" />
                            <path d="M4 6h1v4" />
                            <path d="M4 10h2" />
                            <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
                        </svg>
                    </ToolbarBtn>

                    {/* Blockquote */}
                    <ToolbarBtn
                        onClick={() => editor.chain().focus().toggleBlockquote().run()}
                        active={editor.isActive('blockquote')}
                        title="Quote"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
                            <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z" />
                        </svg>
                    </ToolbarBtn>

                    <Divider />

                    {/* Inline code */}
                    <ToolbarBtn
                        onClick={() => editor.chain().focus().toggleCode().run()}
                        active={editor.isActive('code')}
                        title="Inline code"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="16 18 22 12 16 6" />
                            <polyline points="8 6 2 12 8 18" />
                        </svg>
                    </ToolbarBtn>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Clear formatting */}
                    <ToolbarBtn
                        onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
                        title="Clear formatting"
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 7V4h16v3" />
                            <path d="M9 20h6" />
                            <path d="M12 4v16" />
                            <line x1="2" y1="2" x2="22" y2="22" />
                        </svg>
                    </ToolbarBtn>
                </div>

                {/* Editor content area */}
                <div className="px-3.5 py-2.5">
                    <EditorContent editor={editor} />
                </div>
            </div>
        </div>
    )
}