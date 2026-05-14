// ============================================================================
// NoteNewPage — create a new note
// ============================================================================
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateNote } from "@hooks/useNotes";
import MarkdownEditor from "@components/notes/MarkdownEditor";
import { Button } from "@components/ui/Button";

export default function NoteNewPage() {
    const navigate = useNavigate();
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const create = useCreateNote();

    async function handleSave() {
        if (!title.trim()) return;
        const note = await create.mutateAsync({
            title: title.trim(),
            contentMarkdown: content,
        });
        if (note?.id) navigate(`/notes/${note.id}`, { replace: true });
    }

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
                <button
                    type="button"
                    onClick={() => navigate("/notes")}
                    className="text-xs text-text-tertiary hover:text-text-primary"
                >
                    ← Back to notes
                </button>
                <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => navigate("/notes")}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!title.trim() || create.isPending}
                    >
                        {create.isPending ? "Saving…" : "Save note"}
                    </Button>
                </div>
            </div>

            <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Note title"
                autoFocus
                maxLength={200}
                className="w-full text-2xl font-extrabold bg-transparent outline-none
                           text-text-primary placeholder:text-text-disabled border-b
                           border-border-subtle pb-2 focus:border-brand-line transition-colors"
            />

            <MarkdownEditor value={content} onChange={setContent} />

            <p className="text-[10px] text-text-disabled text-right">
                Personal note — only visible to you.
            </p>
        </div>
    );
}
