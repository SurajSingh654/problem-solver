// ============================================================================
// LearnAiPalette — Cmd+Shift+K dialog that proxies the 7 MCP tools.
// ============================================================================
//
// Tabs across the top pick the tool. The body renders a tool-specific input
// then the result list. We keep state per-tab so switching tools doesn't
// blow away the user's typed query — useful when re-running the same
// concept across `search_code` and `search_docs`.
//
// Visibility:
//   - The whole component is unmounted by AppShell when VITE_LEARN_AI_ENABLED
//     isn't true OR after the server returns 503 LEARN_AI_DISABLED.
//   - The "read_chunk" tab is hidden for non-SuperAdmins (server enforces too).
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@utils/cn";
import useAuthStore from "@store/useAuthStore";
import { useLearnAiPaletteStore } from "@store/useLearnAiPaletteStore";
import { useLearnAiCall } from "@hooks/useLearnAi";
import { LearnAiResultCard } from "./LearnAiResultCard";
import { LearnAiHistoryDrawer } from "./LearnAiHistoryDrawer";

// ── Tool metadata ───────────────────────────────────────────────────────
// `inputs` describes the form fields per tool. The palette stores form
// state in a flat object keyed by `${tool}:${field}` so each tab keeps
// its own value across switches.
const TOOLS = [
    {
        key: "search_code",
        label: "Code",
        icon: "🔍",
        description: "BM25 + dense over .py files",
        inputs: [
            { field: "query", kind: "text", placeholder: "e.g. prompt caching" },
            { field: "k", kind: "number", default: 5, min: 1, max: 20 },
            { field: "ext", kind: "text", placeholder: "ext (optional, e.g. py)", optional: true },
            { field: "rerank", kind: "boolean", default: false, label: "rerank" },
        ],
    },
    {
        key: "search_docs",
        label: "Docs",
        icon: "📖",
        description: "BM25 + dense over .md files",
        inputs: [
            { field: "query", kind: "text", placeholder: "e.g. how does RAG work" },
            { field: "k", kind: "number", default: 5, min: 1, max: 20 },
            { field: "rerank", kind: "boolean", default: false, label: "rerank" },
        ],
    },
    {
        key: "find_similar",
        label: "Similar",
        icon: "🧬",
        description: "Embed a snippet, find lookalikes",
        inputs: [
            {
                field: "snippet",
                kind: "textarea",
                placeholder: "Paste a code snippet (max 8000 chars)",
            },
            { field: "k", kind: "number", default: 5, min: 1, max: 20 },
        ],
    },
    {
        key: "explain_symbol",
        label: "Symbol",
        icon: "🔣",
        description: "AST def + RAG usages",
        inputs: [
            { field: "name", kind: "text", placeholder: "e.g. RAGRetriever" },
            { field: "file_hint", kind: "text", placeholder: "file hint (optional)", optional: true },
        ],
    },
    {
        key: "recent_changes",
        label: "Changes",
        icon: "🕒",
        description: "git log for a path",
        inputs: [
            { field: "path", kind: "text", placeholder: "e.g. project/src/learning_assistant" },
            { field: "n", kind: "number", default: 10, min: 1, max: 50 },
        ],
    },
    {
        key: "deep_explain",
        label: "Deep",
        icon: "🧠",
        description: "Multi-step retrieve+answer (needs ANTHROPIC_API_KEY)",
        inputs: [
            { field: "question", kind: "textarea", placeholder: "What do you want explained?" },
        ],
    },
    {
        key: "read_chunk",
        label: "Chunk",
        icon: "📄",
        description: "Fetch full chunk text by id (SuperAdmin)",
        superAdminOnly: true,
        inputs: [
            { field: "chunk_id", kind: "text", placeholder: "e.g. lessons/06_rag_basic/_shared.py#2" },
        ],
    },
];

function defaultArgsFor(tool) {
    const out = {};
    for (const i of tool.inputs) {
        if (i.default !== undefined) out[i.field] = i.default;
    }
    return out;
}

// ── Result rendering — a few tools return non-list shapes ───────────────
function pickHits(toolKey, result) {
    if (!result) return null;
    if (toolKey === "search_code" || toolKey === "search_docs") {
        // result was {result: [hits]} from the Python side
        return Array.isArray(result?.result) ? result.result : null;
    }
    if (toolKey === "find_similar") {
        return Array.isArray(result?.results) ? result.results : null;
    }
    if (toolKey === "recent_changes") {
        return Array.isArray(result?.result) ? result.result : null;
    }
    if (toolKey === "explain_symbol") {
        return null; // rendered specially below
    }
    if (toolKey === "read_chunk") {
        return [result];
    }
    return null;
}

// ── Component ───────────────────────────────────────────────────────────
export function LearnAiPalette() {
    const { isOpen, close, serverDisabled } = useLearnAiPaletteStore();
    const isSuperAdmin = useAuthStore((s) => s.user?.globalRole === "SUPER_ADMIN");

    const [activeTool, setActiveTool] = useState("search_code");
    const [forms, setForms] = useState(() => {
        const init = {};
        for (const t of TOOLS) init[t.key] = defaultArgsFor(t);
        return init;
    });
    const [results, setResults] = useState({});
    const inputRef = useRef(null);

    const visibleTools = useMemo(
        () => TOOLS.filter((t) => !t.superAdminOnly || isSuperAdmin),
        [isSuperAdmin],
    );

    const tool = visibleTools.find((t) => t.key === activeTool) || visibleTools[0];

    const { mutate, isPending } = useLearnAiCall();

    // Reset focus on open.
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 30);
        }
    }, [isOpen, activeTool]);

    // Global keyboard handler (Cmd+Shift+K toggles, Esc closes).
    useEffect(() => {
        const handler = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "k") {
                if (serverDisabled) return;
                e.preventDefault();
                useLearnAiPaletteStore.getState().toggle();
                return;
            }
            if (!isOpen) return;
            if (e.key === "Escape") {
                close();
            }
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [isOpen, close, serverDisabled]);

    function setField(toolKey, field, value) {
        setForms((prev) => ({
            ...prev,
            [toolKey]: { ...prev[toolKey], [field]: value },
        }));
    }

    function submit(e) {
        e?.preventDefault?.();
        const args = { ...(forms[activeTool] || {}) };
        // Drop empty optional strings so the server schema doesn't trip on them.
        for (const i of tool.inputs) {
            if (i.optional && (args[i.field] === "" || args[i.field] === undefined)) {
                delete args[i.field];
            }
        }
        mutate(
            { tool: activeTool, args },
            {
                onSuccess: ({ result }) => {
                    setResults((prev) => ({ ...prev, [activeTool]: result }));
                },
            },
        );
    }

    function reRunFromHistory(entry) {
        setActiveTool(entry.tool);
        setForms((prev) => ({ ...prev, [entry.tool]: { ...entry.args } }));
        // Defer the call until state has flushed.
        setTimeout(() => {
            mutate(
                { tool: entry.tool, args: entry.args },
                {
                    onSuccess: ({ result }) => {
                        setResults((prev) => ({ ...prev, [entry.tool]: result }));
                    },
                },
            );
        }, 0);
    }

    if (serverDisabled) return null;

    const result = results[activeTool];
    const hits = pickHits(activeTool, result);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="fixed inset-0 z-modal bg-black/60 backdrop-blur-sm"
                        onClick={close}
                    />
                    <div className="fixed inset-0 z-modal flex items-start justify-center pt-[10vh] px-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -16 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -16 }}
                            transition={{ type: "spring", stiffness: 400, damping: 35 }}
                            className="w-full max-w-3xl bg-surface-2 border border-border-strong rounded-2xl shadow-xl overflow-hidden flex flex-col"
                        >
                            {/* Header — title + close */}
                            <div className="flex items-center gap-3 px-4 py-3 border-b border-border-default">
                                <span className="text-base">🧠</span>
                                <div className="flex-1">
                                    <p className="text-sm font-semibold text-text-primary">
                                        Learn-AI Brain
                                    </p>
                                    <p className="text-[11px] text-text-tertiary">{tool.description}</p>
                                </div>
                                <kbd className="text-[11px] text-text-disabled bg-surface-3 border border-border-default rounded px-1.5 py-0.5 font-mono">
                                    ESC
                                </kbd>
                            </div>

                            {/* Tabs */}
                            <div className="flex gap-1 px-3 py-2 border-b border-border-default bg-surface-1 overflow-x-auto no-scrollbar">
                                {visibleTools.map((t) => (
                                    <button
                                        key={t.key}
                                        type="button"
                                        onClick={() => setActiveTool(t.key)}
                                        className={cn(
                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                                            activeTool === t.key
                                                ? "bg-brand-soft text-brand-fg-soft"
                                                : "text-text-secondary hover:text-text-primary hover:bg-surface-3",
                                        )}
                                    >
                                        <span>{t.icon}</span>
                                        <span>{t.label}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Inputs */}
                            <form onSubmit={submit} className="px-4 py-3 border-b border-border-default flex flex-col gap-2">
                                {tool.inputs.map((input, idx) => {
                                    const value = forms[activeTool]?.[input.field] ?? "";
                                    if (input.kind === "textarea") {
                                        return (
                                            <textarea
                                                key={input.field}
                                                ref={idx === 0 ? inputRef : null}
                                                value={value}
                                                onChange={(e) =>
                                                    setField(activeTool, input.field, e.target.value)
                                                }
                                                placeholder={input.placeholder}
                                                rows={4}
                                                className="w-full bg-surface-1 border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-brand-400 font-mono"
                                            />
                                        );
                                    }
                                    if (input.kind === "number") {
                                        return (
                                            <div key={input.field} className="flex items-center gap-2 text-xs text-text-tertiary">
                                                <label className="w-16 font-mono">{input.field}</label>
                                                <input
                                                    type="number"
                                                    min={input.min}
                                                    max={input.max}
                                                    value={value}
                                                    onChange={(e) =>
                                                        setField(
                                                            activeTool,
                                                            input.field,
                                                            e.target.value === "" ? "" : Number(e.target.value),
                                                        )
                                                    }
                                                    className="w-20 bg-surface-1 border border-border-default rounded px-2 py-1 text-text-primary outline-none focus:border-brand-400"
                                                />
                                            </div>
                                        );
                                    }
                                    if (input.kind === "boolean") {
                                        return (
                                            <label key={input.field} className="flex items-center gap-2 text-xs text-text-tertiary">
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(value)}
                                                    onChange={(e) =>
                                                        setField(activeTool, input.field, e.target.checked)
                                                    }
                                                />
                                                <span className="font-mono">{input.label || input.field}</span>
                                            </label>
                                        );
                                    }
                                    return (
                                        <input
                                            key={input.field}
                                            ref={idx === 0 ? inputRef : null}
                                            type="text"
                                            value={value}
                                            onChange={(e) =>
                                                setField(activeTool, input.field, e.target.value)
                                            }
                                            placeholder={input.placeholder}
                                            className="w-full bg-surface-1 border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-brand-400"
                                        />
                                    );
                                })}
                                <div className="flex items-center justify-between pt-1">
                                    <p className="text-[11px] text-text-disabled">
                                        Press <kbd className="bg-surface-3 border border-border-default rounded px-1 py-px font-mono">↵</kbd> to run
                                    </p>
                                    <button
                                        type="submit"
                                        disabled={isPending}
                                        className={cn(
                                            "px-3 py-1.5 rounded-lg text-xs font-semibold",
                                            isPending
                                                ? "bg-surface-3 text-text-tertiary cursor-not-allowed"
                                                : "bg-brand-soft text-brand-fg-soft hover:opacity-90",
                                        )}
                                    >
                                        {isPending ? "Running…" : `Run ${tool.label}`}
                                    </button>
                                </div>
                            </form>

                            {/* Results */}
                            <div className="flex-1 overflow-y-auto max-h-[40vh] px-3 py-3">
                                {!result && !isPending && (
                                    <p className="text-xs text-text-tertiary text-center py-6">
                                        Run a query to see results.
                                    </p>
                                )}
                                {isPending && (
                                    <p className="text-xs text-text-tertiary text-center py-6">
                                        Querying brain…
                                    </p>
                                )}
                                {hits && hits.length > 0 && (
                                    <div className="flex flex-col gap-2">
                                        {hits.map((h, idx) => (
                                            <LearnAiResultCard key={h.id || h.sha || idx} hit={h} />
                                        ))}
                                    </div>
                                )}
                                {hits && hits.length === 0 && (
                                    <p className="text-xs text-text-tertiary text-center py-6">
                                        No results.
                                    </p>
                                )}
                                {/* explain_symbol returns a structured object, not a list. */}
                                {activeTool === "explain_symbol" && result && (
                                    <ExplainSymbolView result={result} />
                                )}
                                {/* deep_explain — fall through to JSON for now. */}
                                {activeTool === "deep_explain" && result && (
                                    <pre className="text-xs font-mono text-text-secondary bg-surface-1 rounded-lg p-3 border border-border-default whitespace-pre-wrap">
                                        {typeof result === "string"
                                            ? result
                                            : JSON.stringify(result, null, 2)}
                                    </pre>
                                )}
                            </div>

                            {/* History drawer */}
                            <LearnAiHistoryDrawer onPick={reRunFromHistory} />
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}

function ExplainSymbolView({ result }) {
    if (!result.found) {
        return (
            <div className="text-xs text-text-tertiary">
                <p>
                    Symbol{" "}
                    <code className="font-mono text-text-secondary">{result.name}</code>{" "}
                    not found.
                </p>
                {result.suggestions?.length > 0 && (
                    <p className="mt-2">
                        Did you mean:{" "}
                        {result.suggestions.map((s) => (
                            <code
                                key={s}
                                className="font-mono text-text-secondary mr-2"
                            >
                                {s}
                            </code>
                        ))}
                    </p>
                )}
            </div>
        );
    }
    const def = result.definition || {};
    return (
        <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-border-default bg-surface-2 p-3">
                <p className="text-[10px] uppercase tracking-widest text-text-disabled mb-1">
                    Definition
                </p>
                <code className="font-mono text-xs text-text-primary">
                    {def.file}:{def.line} ({def.kind})
                </code>
                {def.code && (
                    <pre className="mt-2 text-xs font-mono text-text-secondary bg-surface-1 rounded-lg p-2 border border-border-default whitespace-pre-wrap overflow-x-auto">
                        {def.code}
                    </pre>
                )}
            </div>
            {Array.isArray(result.usages) && result.usages.length > 0 && (
                <div>
                    <p className="text-[10px] uppercase tracking-widest text-text-disabled mb-2 px-1">
                        Usages
                    </p>
                    <div className="flex flex-col gap-2">
                        {result.usages.map((u, i) => (
                            <LearnAiResultCard key={u.id || i} hit={u} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
