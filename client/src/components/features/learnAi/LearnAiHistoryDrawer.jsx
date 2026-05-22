// ============================================================================
// LearnAiHistoryDrawer — last-10 query history; click to re-run.
// ============================================================================
import { cn } from "@utils/cn";
import { useLearnAiHistoryStore } from "@store/useLearnAiHistoryStore";

function summarizeArgs(tool, args) {
    if (!args) return "";
    if (tool === "find_similar") {
        const s = args.snippet || "";
        return s.length > 60 ? `${s.slice(0, 60)}…` : s;
    }
    if (tool === "deep_explain") return args.question || "";
    if (tool === "read_chunk") return args.chunk_id || "";
    if (tool === "explain_symbol") return args.name || "";
    if (tool === "recent_changes") return args.path || "";
    return args.query || "";
}

export function LearnAiHistoryDrawer({ onPick }) {
    const entries = useLearnAiHistoryStore((s) => s.entries);
    const clear = useLearnAiHistoryStore((s) => s.clear);

    if (!entries.length) {
        return (
            <div className="px-4 py-3 text-xs text-text-tertiary">
                No previous queries yet.
            </div>
        );
    }

    return (
        <div className="flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border-default">
                <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest">
                    Recent
                </p>
                <button
                    type="button"
                    onClick={clear}
                    className="text-[11px] text-text-tertiary hover:text-text-primary"
                >
                    Clear
                </button>
            </div>
            <ul className="max-h-48 overflow-y-auto py-1">
                {entries.map((e) => {
                    const summary = summarizeArgs(e.tool, e.args);
                    return (
                        <li key={`${e.ts}-${e.tool}`}>
                            <button
                                type="button"
                                onClick={() => onPick?.(e)}
                                className={cn(
                                    "w-full flex items-center gap-2 px-4 py-1.5 text-left",
                                    "text-xs text-text-secondary hover:text-text-primary hover:bg-surface-3",
                                )}
                            >
                                <span className="font-mono text-[10px] text-text-tertiary w-24 shrink-0">
                                    {e.tool}
                                </span>
                                <span className="truncate">{summary}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
