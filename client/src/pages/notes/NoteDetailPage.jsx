// ============================================================================
// NoteDetailPage — view + edit a single note
// ============================================================================
//
// Auto-saves edits 1.2s after the user stops typing. Manual save still
// available via Cmd/Ctrl+S. Pin / archive / restore live in the header
// toolbar. Future phases attach AI panels (P4), Related panel (P3),
// Flashcard panel (P5), and entity-link badge (P1) here.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    useNote,
    useUpdateNote,
    useArchiveNote,
    useRestoreNote,
    useTogglePinNote,
} from "@hooks/useNotes";
import MarkdownEditor from "@components/notes/MarkdownEditor";
import EntityLinkPicker from "@components/notes/EntityLinkPicker";
import TagInput from "@components/notes/TagInput";
import RelatedNotesPanel from "@components/notes/RelatedNotesPanel";
import AiSummaryCard from "@components/notes/AiSummaryCard";
import SuggestedTagsBar from "@components/notes/SuggestedTagsBar";
import { Button } from "@components/ui/Button";
import { Spinner } from "@components/ui/Spinner";
import { formatRelativeDate } from "@utils/formatters";

export default function NoteDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { data: note, isLoading, isError, error } = useNote(id);
    const update = useUpdateNote(id);
    const archive = useArchiveNote();
    const restore = useRestoreNote();
    const togglePin = useTogglePinNote();

    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [tags, setTags] = useState([]);
    const [dirty, setDirty] = useState(false);
    const [savedAt, setSavedAt] = useState(null);
    const initRef = useRef(false);
    const debounceRef = useRef(null);

    // Hydrate local state from server once
    useEffect(() => {
        if (note && !initRef.current) {
            setTitle(note.title);
            setContent(note.contentMarkdown || "");
            setTags(note.tags || []);
            initRef.current = true;
        }
    }, [note]);

    // Debounced auto-save (1.2s after last keystroke)
    useEffect(() => {
        if (!initRef.current || !dirty) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            if (!title.trim()) return;
            await update.mutateAsync({
                title: title.trim(),
                contentMarkdown: content,
                tags,
            });
            setDirty(false);
            setSavedAt(new Date());
        }, 1200);
        return () => debounceRef.current && clearTimeout(debounceRef.current);
    }, [title, content, tags, dirty, update]);

    // Cmd/Ctrl+S manual save
    useEffect(() => {
        function onKey(e) {
            const isSave =
                (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s";
            if (!isSave) return;
            e.preventDefault();
            if (debounceRef.current) clearTimeout(debounceRef.current);
            if (!title.trim()) return;
            update.mutate(
                { title: title.trim(), contentMarkdown: content, tags },
                {
                    onSuccess: () => {
                        setDirty(false);
                        setSavedAt(new Date());
                    },
                },
            );
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [title, content, tags, update]);

    if (isLoading) {
        return (
            <div className="max-w-5xl mx-auto p-6">
                <Spinner />
            </div>
        );
    }
    if (isError) {
        return (
            <div className="max-w-5xl mx-auto p-6">
                <div className="p-8 rounded-xl bg-danger-soft border border-danger-line text-sm text-danger-fg">
                    {error?.response?.data?.error?.message || "Failed to load note."}
                </div>
            </div>
        );
    }
    if (!note) return null;

    const isArchived = Boolean(note.archivedAt);

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <button
                    type="button"
                    onClick={() => navigate("/notes")}
                    className="text-xs text-text-tertiary hover:text-text-primary"
                >
                    ← Back to notes
                </button>
                <div className="flex items-center gap-2">
                    <SavedIndicator dirty={dirty} pending={update.isPending} savedAt={savedAt} />
                    <Button
                        variant="ghost"
                        onClick={() => togglePin.mutate(note.id)}
                        title={note.pinned ? "Unpin" : "Pin"}
                    >
                        {note.pinned ? "Unpin" : "📌 Pin"}
                    </Button>
                    {isArchived ? (
                        <Button
                            variant="ghost"
                            onClick={() =>
                                restore.mutate(note.id, {
                                    onSuccess: () => navigate("/notes"),
                                })
                            }
                        >
                            Restore
                        </Button>
                    ) : (
                        <Button
                            variant="ghost"
                            onClick={() =>
                                archive.mutate(note.id, {
                                    onSuccess: () => navigate("/notes"),
                                })
                            }
                        >
                            Archive
                        </Button>
                    )}
                </div>
            </div>

            {isArchived && (
                <div className="p-3 rounded-lg bg-warning-soft border border-warning-line text-xs text-warning-fg">
                    This note is archived. Restore it to keep editing.
                </div>
            )}

            <EntityLinkPicker
                disabled={isArchived}
                value={
                    note.linkedEntityType
                        ? {
                            linkedEntityType: note.linkedEntityType,
                            linkedEntityId: note.linkedEntityId,
                            linkedEntityTitle: note.linkedEntityTitle,
                        }
                        : null
                }
                onChange={(next) => {
                    if (next) {
                        update.mutate({
                            linkedEntityType: next.linkedEntityType,
                            linkedEntityId: next.linkedEntityId,
                        });
                    } else {
                        update.mutate({ linkedEntityType: null });
                    }
                }}
            />

            <TagInput
                value={tags}
                disabled={isArchived}
                onChange={(next) => {
                    setTags(next);
                    setDirty(true);
                }}
            />

            {!isArchived && (
                <SuggestedTagsBar
                    note={note}
                    currentTags={tags}
                    onAdoptTag={(t) => {
                        if (tags.includes(t)) return;
                        setTags([...tags, t]);
                        setDirty(true);
                    }}
                />
            )}

            <input
                value={title}
                onChange={(e) => {
                    setTitle(e.target.value);
                    setDirty(true);
                }}
                disabled={isArchived}
                maxLength={200}
                className="w-full text-2xl font-extrabold bg-transparent outline-none
                           text-text-primary placeholder:text-text-disabled border-b
                           border-border-subtle pb-2 focus:border-brand-line
                           disabled:opacity-60 transition-colors"
            />

            <MarkdownEditor
                value={content}
                onChange={(v) => {
                    setContent(v);
                    setDirty(true);
                }}
            />

            {!isArchived && <AiSummaryCard note={note} />}
            {!isArchived && <RelatedNotesPanel noteId={note.id} />}

            <p className="text-[10px] text-text-disabled text-right">
                Last edited {formatRelativeDate(note.updatedAt)} · personal note
            </p>
        </div>
    );
}

function SavedIndicator({ dirty, pending, savedAt }) {
    if (pending) return <span className="text-[10px] text-text-disabled">Saving…</span>;
    if (dirty) return <span className="text-[10px] text-text-disabled">Unsaved changes</span>;
    if (savedAt)
        return <span className="text-[10px] text-text-disabled">Saved</span>;
    return null;
}
