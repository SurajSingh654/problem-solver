// ============================================================================
// NotesListPage — main notes workspace
// ============================================================================
import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useNotes } from "@hooks/useNotes";
import { Button } from "@components/ui/Button";
import { Spinner } from "@components/ui/Spinner";
import { Skeleton } from "@components/ui/Skeleton";
import { formatRelativeDate } from "@utils/formatters";
import { cn } from "@utils/cn";

const TABS = [
    { id: "active", label: "Notes", archived: false, pinned: false },
    { id: "pinned", label: "Pinned", archived: false, pinned: true },
    { id: "archived", label: "Archive", archived: true, pinned: false },
];

export default function NotesListPage() {
    const navigate = useNavigate();
    const [tabId, setTabId] = useState("active");
    const [q, setQ] = useState("");

    const tab = TABS.find((t) => t.id === tabId);
    const params = useMemo(
        () => ({
            archived: String(tab.archived),
            ...(tab.pinned ? { pinned: "true" } : {}),
            ...(q.trim() ? { q: q.trim() } : {}),
        }),
        [tab, q],
    );

    const { data, isLoading, isError, error } = useNotes(params);
    const notes = data?.notes || [];

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-extrabold text-text-primary">Notes</h1>
                    <p className="text-xs text-text-tertiary mt-1">
                        Personal markdown notebook. Capture insights, organize thinking,
                        revisit later.
                    </p>
                </div>
                <Button onClick={() => navigate("/notes/new")}>+ New note</Button>
            </div>

            {/* Tabs + search */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex gap-1">
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setTabId(t.id)}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                                tabId === t.id
                                    ? "bg-brand-soft text-brand-fg-soft"
                                    : "text-text-tertiary hover:bg-surface-2 hover:text-text-primary",
                            )}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search by title…"
                    className="text-xs px-3 py-2 rounded-lg bg-surface-1 border border-border-default
                               outline-none focus:border-brand-line w-56"
                />
            </div>

            {/* Body */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[...Array(6)].map((_, i) => (
                        <Skeleton.Card key={i} />
                    ))}
                </div>
            ) : isError ? (
                <div className="p-8 rounded-xl bg-danger-soft border border-danger-line text-sm text-danger-fg">
                    {error?.response?.data?.error?.message || "Failed to load notes."}
                </div>
            ) : notes.length === 0 ? (
                <EmptyState tab={tabId} />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {notes.map((n) => (
                        <NoteCard key={n.id} note={n} />
                    ))}
                </div>
            )}
        </div>
    );
}

function NoteCard({ note }) {
    const preview = (note.contentMarkdown || "")
        .replace(/[#*_`>~\-]/g, "")
        .trim()
        .slice(0, 200);
    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
        >
            <Link
                to={`/notes/${note.id}`}
                className="block p-4 rounded-xl bg-surface-1 border border-border-default
                           hover:border-brand-400/30 transition-colors h-full"
            >
                <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-bold text-text-primary line-clamp-2">
                        {note.title}
                    </h3>
                    {note.pinned && (
                        <span className="text-xs text-warning-fg shrink-0" aria-label="Pinned">
                            📌
                        </span>
                    )}
                </div>
                <p className="text-xs text-text-tertiary line-clamp-3 mb-3 min-h-[2.5em]">
                    {preview || <span className="italic text-text-disabled">No content yet.</span>}
                </p>
                <div className="flex items-center justify-between text-[10px] text-text-disabled">
                    <span>{formatRelativeDate(note.updatedAt)}</span>
                    {note.flashcardCount > 0 && (
                        <span>{note.flashcardCount} flashcards</span>
                    )}
                </div>
            </Link>
        </motion.div>
    );
}

function EmptyState({ tab }) {
    const navigate = useNavigate();
    const copy = {
        active: {
            icon: "📝",
            title: "No notes yet",
            sub: "Capture an insight, a definition, a tradeoff — anything you want to revisit later.",
            cta: "Create your first note",
        },
        pinned: {
            icon: "📌",
            title: "No pinned notes",
            sub: "Pin a note from its detail page to keep it at the top of your list.",
            cta: null,
        },
        archived: {
            icon: "🗄️",
            title: "No archived notes",
            sub: "Archived notes show up here — they're never deleted, just out of the way.",
            cta: null,
        },
    }[tab];
    return (
        <div className="text-center py-16 px-6 rounded-xl bg-surface-1 border border-border-subtle">
            <div className="text-4xl mb-3">{copy.icon}</div>
            <h2 className="text-base font-bold text-text-primary mb-1.5">
                {copy.title}
            </h2>
            <p className="text-xs text-text-tertiary max-w-sm mx-auto mb-4">
                {copy.sub}
            </p>
            {copy.cta && (
                <Button onClick={() => navigate("/notes/new")}>{copy.cta}</Button>
            )}
        </div>
    );
}
