// ============================================================================
// LearnAiResultCard — one row in the palette's results grid.
// ============================================================================
// Tools return result shapes that don't fully match each other. We pass
// the raw object in and pull out fields with safe accessors so an unknown
// tool still renders a useful debug view (raw JSON in <pre>) rather than
// crashing the palette.
// ============================================================================
import { useState } from "react";
import { cn } from "@utils/cn";
import { toast } from "@store/useUIStore";

const SNIPPET_PREVIEW_LINES = 8;

function copy(text, label = "Copied.") {
    navigator.clipboard?.writeText(text).then(
        () => toast.success(label),
        () => toast.error("Clipboard write failed."),
    );
}

function clipLines(text, n) {
    if (!text) return { preview: "", clipped: false };
    const lines = text.split("\n");
    if (lines.length <= n) return { preview: text, clipped: false };
    return { preview: lines.slice(0, n).join("\n"), clipped: true };
}

export function LearnAiResultCard({ hit }) {
    const [expanded, setExpanded] = useState(false);

    const file = hit.file || "?";
    const startLine = hit.line_start ?? hit.line ?? 0;
    const endLine = hit.line_end ?? startLine;
    const range = endLine && endLine !== startLine ? `${startLine}-${endLine}` : `${startLine}`;
    const fileLine = startLine ? `${file}:${range}` : file;
    const snippet = hit.snippet ?? hit.text ?? hit.code ?? "";

    const { preview, clipped } = clipLines(snippet, SNIPPET_PREVIEW_LINES);

    return (
        <div className="rounded-xl border border-border-default bg-surface-2 p-3 hover:border-border-strong transition-colors">
            {/* Header row: file:line + score + kind + actions */}
            <div className="flex items-center gap-2 text-xs">
                <code className="font-mono text-text-primary truncate" title={fileLine}>
                    {fileLine}
                </code>
                {hit.kind && (
                    <span className="px-1.5 py-px rounded bg-surface-3 text-[10px] uppercase text-text-tertiary">
                        {hit.kind}
                    </span>
                )}
                {typeof hit.score === "number" && (
                    <span className="text-[10px] text-text-tertiary">
                        score {hit.score.toFixed(3)}
                    </span>
                )}
                <div className="ml-auto flex gap-1">
                    {snippet && (
                        <button
                            type="button"
                            onClick={() => copy(snippet, "Snippet copied.")}
                            className="px-2 py-0.5 rounded bg-surface-3 text-[11px] text-text-secondary hover:text-text-primary"
                        >
                            Copy snippet
                        </button>
                    )}
                    {fileLine && (
                        <button
                            type="button"
                            onClick={() => copy(fileLine, "Path copied.")}
                            className="px-2 py-0.5 rounded bg-surface-3 text-[11px] text-text-secondary hover:text-text-primary"
                        >
                            Copy path
                        </button>
                    )}
                </div>
            </div>

            {/* Body */}
            {snippet ? (
                <pre
                    className={cn(
                        "mt-2 whitespace-pre-wrap break-words text-xs font-mono",
                        "text-text-secondary bg-surface-1 rounded-lg p-2 border border-border-default",
                        "overflow-x-auto",
                    )}
                >
                    {expanded ? snippet : preview}
                </pre>
            ) : (
                <pre className="mt-2 text-xs text-text-tertiary bg-surface-1 rounded-lg p-2 border border-border-default overflow-x-auto">
                    {JSON.stringify(hit, null, 2)}
                </pre>
            )}

            {clipped && (
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="mt-1 text-[11px] text-brand-fg-soft hover:underline"
                >
                    {expanded ? "Collapse" : `Show all (${snippet.split("\n").length} lines)`}
                </button>
            )}
        </div>
    );
}
