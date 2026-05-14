// ============================================================================
// NotesListPage — main notes workspace
// ============================================================================
import { useState, useMemo, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
    useNotes,
    useNoteTags,
    useTogglePinNote,
    useArchiveNote,
    useRestoreNote,
    useDeleteNotePermanent,
} from "@hooks/useNotes";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import { formatRelativeDate } from "@utils/formatters";
import { cn } from "@utils/cn";

const ENTITY_ICON = {
    PROBLEM: "📋",
    INTERVIEW_SESSION: "💬",
    DESIGN_SESSION: "🏗️",
    TEACHING_SESSION: "📚",
    CUSTOM: "🔗",
};

const TABS = [
    { id: "active", label: "Notes", archived: false, pinned: false },
    { id: "pinned", label: "Pinned", archived: false, pinned: true },
    { id: "archived", label: "Archive", archived: true, pinned: false },
];

export default function NotesListPage() {
    const navigate = useNavigate();
    const [tabId, setTabId] = useState("active");
    const [q, setQ] = useState("");
    const [tagFilter, setTagFilter] = useState(null);
    const searchRef = useRef(null);

    // Cmd/Ctrl+K focuses the search input
    useEffect(() => {
        function onKey(e) {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                searchRef.current?.focus();
                searchRef.current?.select();
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const tab = TABS.find((t) => t.id === tabId);
    const params = useMemo(
        () => ({
            archived: String(tab.archived),
            ...(tab.pinned ? { pinned: "true" } : {}),
            ...(q.trim() ? { q: q.trim() } : {}),
            ...(tagFilter ? { tag: tagFilter } : {}),
        }),
        [tab, q, tagFilter],
    );

    const { data, isLoading, isError, error } = useNotes(params);
    const notes = data?.notes || [];
    const { data: tagList } = useNoteTags();
    const topTags = (tagList || []).slice(0, 12);

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
                    ref={searchRef}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search by title…  (⌘K)"
                    className="text-xs px-3 py-2 rounded-lg bg-surface-1 border border-border-default
                               outline-none focus:border-brand-line w-56"
                />
            </div>

            {topTags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-text-disabled">
                        Tags
                    </span>
                    {tagFilter && (
                        <button
                            onClick={() => setTagFilter(null)}
                            className="px-2 py-0.5 rounded-md text-[11px] font-bold
                                       bg-danger-soft text-danger-fg hover:bg-danger-soft/80"
                        >
                            Clear filter
                        </button>
                    )}
                    {topTags.map(({ tag, count }) => (
                        <button
                            key={tag}
                            onClick={() => setTagFilter(tag === tagFilter ? null : tag)}
                            className={cn(
                                "px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors",
                                tag === tagFilter
                                    ? "bg-brand-soft text-brand-fg-soft border border-brand-line"
                                    : "bg-surface-2 text-text-secondary hover:bg-surface-3 border border-border-default",
                            )}
                        >
                            #{tag} <span className="text-text-disabled">{count}</span>
                        </button>
                    ))}
                </div>
            )}

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
    const togglePin = useTogglePinNote();
    const archive = useArchiveNote();
    const restore = useRestoreNote();
    const deletePermanent = useDeleteNotePermanent();
    const isArchived = Boolean(note.archivedAt);

    const preview = (note.contentMarkdown || "")
        .replace(/```[\s\S]*?```/g, "")          // strip fenced code
        .replace(/[#*_`~>]/g, "")                  // strip markdown decorations
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")  // links → text
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 220);

    const hasSummary = !!note.summary && !note.summary._fallback;
    const hasFallbackSummary = !!note.summary?._fallback;
    const charCount = (note.contentMarkdown || "").length;

    function stop(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function onPin(e) {
        stop(e);
        togglePin.mutate(note.id);
    }
    function onArchive(e) {
        stop(e);
        archive.mutate(note.id);
    }
    function onRestore(e) {
        stop(e);
        restore.mutate(note.id);
    }
    function onDelete(e) {
        stop(e);
        if (
            !window.confirm(
                `Delete "${note.title}" permanently? This cannot be undone.`,
            )
        )
            return;
        deletePermanent.mutate(note.id);
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="group relative"
        >
            <Link
                to={`/notes/${note.id}`}
                className={cn(
                    "block p-4 rounded-xl border transition-colors h-full",
                    "bg-surface-1 hover:border-brand-400/40",
                    note.pinned && !isArchived
                        ? "border-warning-line/60"
                        : "border-border-default",
                    isArchived && "opacity-75",
                )}
            >
                {/* Header — title + pinned mark */}
                <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                        {note.pinned && !isArchived && (
                            <span
                                className="text-[9px] font-bold uppercase tracking-widest text-warning-fg
                                           inline-flex items-center gap-1 mb-1"
                            >
                                📌 Pinned
                            </span>
                        )}
                        {isArchived && (
                            <span
                                className="text-[9px] font-bold uppercase tracking-widest text-text-disabled
                                           inline-flex items-center gap-1 mb-1"
                            >
                                🗄️ Archived
                            </span>
                        )}
                        <h3 className="text-sm font-bold text-text-primary line-clamp-2 leading-tight">
                            {note.title}
                        </h3>
                    </div>
                    {hasSummary && (
                        <span
                            className="text-[9px] text-brand-fg-soft shrink-0"
                            title="AI summary available"
                        >
                            ✨
                        </span>
                    )}
                    {hasFallbackSummary && (
                        <span
                            className="text-[9px] text-warning-fg shrink-0"
                            title="AI summary fell back — retry from the note"
                        >
                            ⚠️
                        </span>
                    )}
                </div>

                {/* Linked-entity badge */}
                {note.linkedEntityType && (
                    <div className="mb-2">
                        <span
                            className="inline-flex items-center gap-1 px-1.5 py-px rounded
                                       bg-brand-soft/40 border border-brand-line/40
                                       text-[10px] text-brand-fg-soft truncate max-w-full"
                        >
                            <span>{ENTITY_ICON[note.linkedEntityType] || "🔗"}</span>
                            <span className="truncate">
                                {note.linkedEntityTitle || note.linkedEntityType}
                            </span>
                        </span>
                    </div>
                )}

                {/* Preview */}
                <p className="text-xs text-text-tertiary line-clamp-3 mb-2 min-h-[2.5em] leading-relaxed">
                    {preview || (
                        <span className="italic text-text-disabled">No content yet.</span>
                    )}
                </p>

                {/* Tags */}
                {note.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                        {note.tags.slice(0, 4).map((t) => (
                            <span
                                key={t}
                                className="text-[9px] font-bold px-1.5 py-px rounded
                                           bg-surface-2 text-text-tertiary border border-border-subtle"
                            >
                                #{t}
                            </span>
                        ))}
                        {note.tags.length > 4 && (
                            <span className="text-[9px] text-text-disabled self-center">
                                +{note.tags.length - 4}
                            </span>
                        )}
                    </div>
                )}

                {/* Footer — meta line */}
                <div className="flex items-center justify-between text-[10px] text-text-disabled gap-2">
                    <span className="truncate">
                        {formatRelativeDate(note.updatedAt)}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                        {charCount > 0 && (
                            <span title={`${charCount} characters`}>
                                {charCount > 1000
                                    ? `${(charCount / 1000).toFixed(1)}K`
                                    : charCount}
                                {" chars"}
                            </span>
                        )}
                        {note.flashcardCount > 0 && (
                            <span className="flex items-center gap-0.5">
                                🃏 {note.flashcardCount}
                            </span>
                        )}
                    </div>
                </div>
            </Link>

            {/* Hover-revealed action bar — top-right of card */}
            <div
                className="absolute top-2 right-2 flex items-center gap-1 opacity-0
                           group-hover:opacity-100 focus-within:opacity-100 transition-opacity
                           bg-surface-1/95 backdrop-blur-sm border border-border-subtle
                           rounded-lg p-0.5 shadow-sm"
            >
                {!isArchived && (
                    <CardAction
                        onClick={onPin}
                        title={note.pinned ? "Unpin" : "Pin"}
                        label={note.pinned ? "📌" : "📍"}
                    />
                )}
                {!isArchived && (
                    <CardAction
                        onClick={onArchive}
                        title="Archive (soft delete)"
                        label="🗄️"
                    />
                )}
                {isArchived && (
                    <CardAction
                        onClick={onRestore}
                        title="Restore from archive"
                        label="↩️"
                    />
                )}
                <CardAction
                    onClick={onDelete}
                    title="Delete permanently"
                    label="🗑️"
                    danger
                />
            </div>
        </motion.div>
    );
}

function CardAction({ onClick, title, label, danger }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            aria-label={title}
            className={cn(
                "px-1.5 py-0.5 rounded-md text-xs transition-colors",
                "hover:bg-surface-2",
                danger && "hover:bg-danger-soft",
            )}
        >
            {label}
        </button>
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
