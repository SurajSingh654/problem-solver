// ============================================================================
// MarkdownEditor — split textarea + preview
// ============================================================================
//
// v1 is intentionally a markdown-first plain textarea + side-by-side
// preview. This matches Teaching's note-submit substrate and keeps the
// canonical AI input as raw markdown. TipTap upgrade deferred to v2
// once usage justifies it.
// ============================================================================
import { useEffect, useState } from "react";
import { MarkdownRenderer } from "@components/ui/MarkdownRenderer";
import { cn } from "@utils/cn";

const MODE_CYCLE = ["split", "edit", "preview"];

export default function MarkdownEditor({
    value,
    onChange,
    placeholder = "Start writing in markdown… **bold**, *italic*, `code`, # headings, - lists",
    minHeight = 480,
    autoFocus = false,
}) {
    const [mode, setMode] = useState("split"); // "edit" | "preview" | "split"

    // Cmd/Ctrl+/ cycles edit ↔ split ↔ preview
    useEffect(() => {
        function onKey(e) {
            if ((e.metaKey || e.ctrlKey) && e.key === "/") {
                e.preventDefault();
                setMode((cur) => {
                    const i = MODE_CYCLE.indexOf(cur);
                    return MODE_CYCLE[(i + 1) % MODE_CYCLE.length];
                });
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    return (
        <div className="rounded-xl border border-border-default bg-surface-1 overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle bg-surface-2">
                <div className="text-[10px] font-semibold tracking-widest uppercase text-text-disabled">
                    Markdown <span className="text-text-disabled/60 normal-case font-normal ml-2">⌘/ to toggle</span>
                </div>
                <div className="flex gap-1 text-[10px] font-bold">
                    {[
                        { id: "edit", label: "Edit" },
                        { id: "split", label: "Split" },
                        { id: "preview", label: "Preview" },
                    ].map((m) => (
                        <button
                            key={m.id}
                            type="button"
                            onClick={() => setMode(m.id)}
                            className={cn(
                                "px-2.5 py-1 rounded-md transition-colors",
                                mode === m.id
                                    ? "bg-brand-soft text-brand-fg-soft"
                                    : "text-text-tertiary hover:bg-surface-3 hover:text-text-primary",
                            )}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>
            </div>

            <div
                className={cn(
                    "grid",
                    mode === "split" ? "grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border-subtle" : "grid-cols-1",
                )}
                style={{ minHeight }}
            >
                {(mode === "edit" || mode === "split") && (
                    <textarea
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={placeholder}
                        autoFocus={autoFocus}
                        spellCheck={false}
                        className="w-full p-4 bg-transparent text-sm text-text-primary
                                   resize-none outline-none font-mono leading-relaxed
                                   placeholder:text-text-disabled"
                        style={{ minHeight }}
                    />
                )}
                {(mode === "preview" || mode === "split") && (
                    <div
                        className="p-4 overflow-y-auto bg-surface-0/30"
                        style={{ minHeight }}
                    >
                        {value?.trim() ? (
                            <MarkdownRenderer content={value} />
                        ) : (
                            <p className="text-sm text-text-disabled italic">
                                Preview will appear here.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
