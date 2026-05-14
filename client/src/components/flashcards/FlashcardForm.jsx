// ============================================================================
// FlashcardForm — modal for creating / editing a flashcard
// ============================================================================
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useCreateFlashcards, useUpdateFlashcard } from "@hooks/useFlashcards";
import TagInput from "@components/notes/TagInput";
import { Button } from "@components/ui/Button";

export default function FlashcardForm({ noteId, existing, onClose }) {
    const isEdit = Boolean(existing);
    const [front, setFront] = useState(existing?.front || "");
    const [back, setBack] = useState(existing?.back || "");
    const [tags, setTags] = useState(existing?.tags || []);
    const create = useCreateFlashcards();
    const update = useUpdateFlashcard(existing?.id);

    useEffect(() => {
        function onKey(e) {
            if (e.key === "Escape") onClose?.();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    async function handleSave() {
        if (!front.trim() || !back.trim()) return;
        if (isEdit) {
            await update.mutateAsync({ front: front.trim(), back: back.trim(), tags });
        } else {
            await create.mutateAsync({
                front: front.trim(),
                back: back.trim(),
                tags,
                ...(noteId ? { noteId } : {}),
            });
        }
        onClose?.();
    }

    const pending = create.isPending || update.isPending;

    return (
        <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm
                       flex items-center justify-center p-6"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-xl bg-surface-1 border border-border-default
                           rounded-2xl shadow-2xl p-5 space-y-4"
            >
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-extrabold text-text-primary">
                        {isEdit ? "Edit flashcard" : "New flashcard"}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-text-tertiary hover:text-text-primary text-sm"
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-text-disabled">
                        Front (the prompt)
                    </label>
                    <textarea
                        value={front}
                        onChange={(e) => setFront(e.target.value)}
                        placeholder="What concept does this card test?"
                        maxLength={500}
                        rows={3}
                        autoFocus
                        className="w-full text-sm p-3 rounded-lg bg-surface-2 border border-border-default
                                   outline-none focus:border-brand-line resize-none
                                   placeholder:text-text-disabled"
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-text-disabled">
                        Back (the answer)
                    </label>
                    <textarea
                        value={back}
                        onChange={(e) => setBack(e.target.value)}
                        placeholder="What you want to remember when you see the prompt"
                        maxLength={2000}
                        rows={5}
                        className="w-full text-sm p-3 rounded-lg bg-surface-2 border border-border-default
                                   outline-none focus:border-brand-line resize-none
                                   placeholder:text-text-disabled"
                    />
                </div>

                <TagInput value={tags} onChange={setTags} />

                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!front.trim() || !back.trim() || pending}
                    >
                        {pending ? "Saving…" : isEdit ? "Save" : "Create card"}
                    </Button>
                </div>
            </motion.div>
        </div>
    );
}
