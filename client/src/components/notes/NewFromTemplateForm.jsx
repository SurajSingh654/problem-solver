// ============================================================================
// NewFromTemplateForm — AI-driven note generation from templates
// ============================================================================
//
// Modal flow:
//   1. Pick a folder (defaults to user's "Templates" folder by name match
//      if present; otherwise "All folders").
//   2. Multi-select 1–3 notes from that folder. These are STRUCTURAL
//      templates — the LLM will treat them as guides, not content to copy.
//   3. Optionally pin a Problem (from the Problems table) as context for
//      coding-related notes.
//   4. Optionally pick a target folder for the new note.
//   5. Click Generate → streaming preview pane fills in live → on done,
//      navigate to the new note.
//
// Streaming uses fetch + ReadableStream via streamGenerateNoteFromTemplates.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useNotes, useLinkSearch } from "@hooks/useNotes";
import { useNoteFolders } from "@hooks/useNoteFolders";
import { streamGenerateNoteFromTemplates } from "@services/notesAiTemplate.api";
import { Button } from "@components/ui/Button";
import { MarkdownRenderer } from "@components/ui/MarkdownRenderer";
import { toast } from "@store/useUIStore";
import { cn } from "@utils/cn";

const MAX_TEMPLATES = 3;

export default function NewFromTemplateForm({ open, onClose }) {
    if (!open) return null;
    return (
        <AnimatePresence>
            <ModalShell onClose={onClose}>
                <FormBody onClose={onClose} />
            </ModalShell>
        </AnimatePresence>
    );
}

function ModalShell({ children, onClose }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4"
            onClick={onClose}
            role="presentation"
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ duration: 0.15 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-surface-1 border border-border-default rounded-2xl
                           w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
                role="dialog"
                aria-modal="true"
            >
                {children}
            </motion.div>
        </motion.div>
    );
}

function FormBody({ onClose }) {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { data: folders = [] } = useNoteFolders();

    const [folderId, setFolderId] = useState("__all__");
    const [selectedTemplates, setSelectedTemplates] = useState(new Set());
    const [problem, setProblem] = useState(null); // { id, title }
    const [problemQuery, setProblemQuery] = useState("");
    const [problemDropdownOpen, setProblemDropdownOpen] = useState(false);
    const [targetFolderId, setTargetFolderId] = useState("");

    // Streaming state
    const [generating, setGenerating] = useState(false);
    const [streamedContent, setStreamedContent] = useState("");
    const [streamError, setStreamError] = useState(null);
    const abortRef = useRef(null);

    // Default folder filter to user's "Templates" folder if present.
    useEffect(() => {
        if (folders.length === 0) return;
        const t = folders.find(
            (f) => f.name.trim().toLowerCase() === "templates",
        );
        if (t) setFolderId(t.id);
    }, [folders]);

    const listParams = useMemo(() => {
        const p = { archived: "false", limit: "100" };
        if (folderId !== "__all__") p.folderId = folderId;
        return p;
    }, [folderId]);

    const { data: notesData, isLoading: notesLoading } = useNotes(listParams);
    const candidateNotes = notesData?.notes || [];

    // Problem typeahead — debounced
    const [debouncedProblemQuery, setDebouncedProblemQuery] = useState("");
    useEffect(() => {
        const t = setTimeout(() => setDebouncedProblemQuery(problemQuery), 250);
        return () => clearTimeout(t);
    }, [problemQuery]);

    const { data: problemResults } = useLinkSearch(
        problemDropdownOpen ? "PROBLEM" : null,
        debouncedProblemQuery,
    );

    function toggleTemplate(id) {
        setSelectedTemplates((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else if (next.size >= MAX_TEMPLATES) {
                toast.error(`At most ${MAX_TEMPLATES} templates per note.`);
                return prev;
            } else {
                next.add(id);
            }
            return next;
        });
    }

    async function handleGenerate() {
        if (selectedTemplates.size === 0) {
            toast.error("Pick at least one template.");
            return;
        }
        setGenerating(true);
        setStreamedContent("");
        setStreamError(null);

        const ctrl = new AbortController();
        abortRef.current = ctrl;

        const body = {
            templateNoteIds: Array.from(selectedTemplates),
            problemId: problem?.id || null,
            targetFolderId: targetFolderId || null,
        };

        try {
            for await (const event of streamGenerateNoteFromTemplates(body, {
                signal: ctrl.signal,
            })) {
                if (event.chunk) {
                    setStreamedContent((s) => s + event.chunk);
                } else if (event.done) {
                    qc.invalidateQueries({ queryKey: ["notes"] });
                    qc.invalidateQueries({ queryKey: ["note-folders"] });
                    onClose?.();
                    navigate(`/notes/${event.noteId}`);
                    return;
                } else if (event.error) {
                    setStreamError(event.error);
                    toast.error(event.error);
                    setGenerating(false);
                    return;
                }
            }
            // Stream ended without `done` — likely client-side abort.
            setGenerating(false);
        } catch (err) {
            if (err?.name === "AbortError") {
                setGenerating(false);
                return;
            }
            const msg = err?.message || "Generation failed";
            setStreamError(msg);
            toast.error(msg);
            setGenerating(false);
        }
    }

    function handleCancel() {
        abortRef.current?.abort();
        setGenerating(false);
    }

    // Esc to close (if not generating)
    useEffect(() => {
        function onKey(e) {
            if (e.key === "Escape" && !generating) onClose?.();
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose, generating]);

    return (
        <>
            <div className="px-5 py-4 border-b border-border-subtle">
                <h2 className="text-base font-extrabold text-text-primary">
                    📑 New note from template
                </h2>
                <p className="text-xs text-text-tertiary mt-1">
                    Pick 1–{MAX_TEMPLATES} templates and an optional Problem. The AI
                    merges them into a fresh note structured the way you want.
                </p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {generating || streamedContent ? (
                    <StreamingPreview content={streamedContent} error={streamError} />
                ) : (
                    <>
                        <Section label="Templates folder">
                            <select
                                value={folderId}
                                onChange={(e) => setFolderId(e.target.value)}
                                className="w-full bg-surface-2 border border-border-subtle rounded-lg
                                           px-2.5 py-1.5 text-sm text-text-primary outline-none"
                            >
                                <option value="__all__">All folders</option>
                                {folders.map((f) => (
                                    <option key={f.id} value={f.id}>
                                        📁 {f.name}
                                    </option>
                                ))}
                            </select>
                        </Section>

                        <Section
                            label={`Templates (${selectedTemplates.size}/${MAX_TEMPLATES} selected)`}
                            hint="Each acts as a structural guide; the AI merges them."
                        >
                            <TemplateList
                                notes={candidateNotes}
                                loading={notesLoading}
                                selected={selectedTemplates}
                                onToggle={toggleTemplate}
                            />
                        </Section>

                        <Section
                            label="Problem (optional)"
                            hint="For coding notes, pin the problem so the AI uses its title + description."
                        >
                            <ProblemPicker
                                problem={problem}
                                onChange={setProblem}
                                query={problemQuery}
                                onQueryChange={setProblemQuery}
                                results={problemResults || []}
                                open={problemDropdownOpen}
                                onOpenChange={setProblemDropdownOpen}
                            />
                        </Section>

                        <Section label="Save the new note in (optional)">
                            <select
                                value={targetFolderId}
                                onChange={(e) => setTargetFolderId(e.target.value)}
                                className="w-full bg-surface-2 border border-border-subtle rounded-lg
                                           px-2.5 py-1.5 text-sm text-text-primary outline-none"
                            >
                                <option value="">📭 Uncategorized</option>
                                {folders.map((f) => (
                                    <option key={f.id} value={f.id}>
                                        📁 {f.name}
                                    </option>
                                ))}
                            </select>
                        </Section>
                    </>
                )}
            </div>

            <div className="px-5 py-3 border-t border-border-subtle bg-surface-2/40
                            flex items-center justify-between gap-2">
                <p className="text-[10px] text-text-disabled">
                    {generating
                        ? "Streaming in… cancelling discards the output."
                        : "Templates are read by the AI as structure, not copied verbatim."}
                </p>
                <div className="flex items-center gap-2">
                    {generating ? (
                        <Button variant="ghost" size="sm" onClick={handleCancel}>
                            Cancel generation
                        </Button>
                    ) : (
                        <>
                            <Button variant="ghost" size="sm" onClick={onClose}>
                                Close
                            </Button>
                            <Button
                                variant="primary"
                                size="sm"
                                disabled={selectedTemplates.size === 0}
                                onClick={handleGenerate}
                            >
                                ✨ Generate
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

function Section({ label, hint, children }) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-text-disabled">
                    {label}
                </span>
                {hint && (
                    <span className="text-[10px] text-text-disabled italic">{hint}</span>
                )}
            </div>
            {children}
        </div>
    );
}

function TemplateList({ notes, loading, selected, onToggle }) {
    if (loading) {
        return (
            <div className="text-xs text-text-disabled px-2 py-3">Loading notes…</div>
        );
    }
    if (notes.length === 0) {
        return (
            <div className="text-xs text-text-disabled italic px-2 py-3">
                No notes in this folder. Pick a different folder above.
            </div>
        );
    }
    return (
        <div className="max-h-[200px] overflow-y-auto space-y-1 border border-border-subtle
                        rounded-lg p-1 bg-surface-2/30">
            {notes.map((n) => {
                const isSelected = selected.has(n.id);
                return (
                    <button
                        key={n.id}
                        type="button"
                        onClick={() => onToggle(n.id)}
                        className={cn(
                            "w-full text-left px-2.5 py-2 rounded-md transition-colors",
                            "flex items-start gap-2",
                            isSelected
                                ? "bg-brand-soft border border-brand-line"
                                : "hover:bg-surface-2 border border-transparent",
                        )}
                    >
                        <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                            <p className={cn(
                                "text-xs font-medium truncate",
                                isSelected ? "text-brand-fg-soft" : "text-text-primary",
                            )}>
                                {n.title}
                            </p>
                            {n.folder && (
                                <p className="text-[10px] text-text-disabled flex items-center gap-1 mt-0.5">
                                    <span>📁</span>
                                    <span className="truncate">{n.folder.name}</span>
                                </p>
                            )}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

function ProblemPicker({
    problem,
    onChange,
    query,
    onQueryChange,
    results,
    open,
    onOpenChange,
}) {
    const containerRef = useRef(null);

    useEffect(() => {
        function onDocClick(e) {
            if (!containerRef.current?.contains(e.target)) onOpenChange(false);
        }
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, [onOpenChange]);

    if (problem) {
        return (
            <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg
                                 bg-brand-soft border border-brand-line text-xs">
                    <span>📋</span>
                    <span className="font-bold text-brand-fg-soft truncate max-w-[24rem]">
                        {problem.title}
                    </span>
                </span>
                <button
                    type="button"
                    onClick={() => onChange(null)}
                    className="text-xs text-text-disabled hover:text-danger-fg"
                >
                    ✕ unlink
                </button>
            </div>
        );
    }

    return (
        <div className="relative" ref={containerRef}>
            <input
                type="text"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onFocus={() => onOpenChange(true)}
                placeholder="Search problems by title…"
                className="w-full bg-surface-2 border border-border-subtle rounded-lg
                           px-2.5 py-1.5 text-sm text-text-primary outline-none"
            />
            {open && (
                <div className="absolute left-0 right-0 mt-1 z-modal max-h-[200px] overflow-y-auto
                                bg-surface-1 border border-border-default rounded-lg shadow-xl p-1">
                    {results.length === 0 ? (
                        <div className="text-[11px] text-text-disabled italic px-2 py-2">
                            {query ? "No matches." : "Type to search."}
                        </div>
                    ) : (
                        results.map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                    onChange({ id: p.id, title: p.title });
                                    onOpenChange(false);
                                    onQueryChange("");
                                }}
                                className="w-full text-left px-2 py-1.5 rounded text-xs
                                           text-text-primary hover:bg-surface-2 truncate"
                            >
                                📋 {p.title}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

function StreamingPreview({ content, error }) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase text-text-disabled">
                {error ? (
                    <span className="text-danger-fg">⚠ Generation failed</span>
                ) : (
                    <>
                        <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
                        <span>Generating live…</span>
                    </>
                )}
            </div>
            <div className="border border-border-subtle rounded-lg p-4 bg-surface-2/30 min-h-[200px]">
                {content ? (
                    <MarkdownRenderer content={content} size="sm" />
                ) : (
                    <p className="text-xs text-text-disabled italic">
                        Waiting for the first tokens…
                    </p>
                )}
            </div>
            {error && (
                <p className="text-xs text-danger-fg">{error}</p>
            )}
        </div>
    );
}
