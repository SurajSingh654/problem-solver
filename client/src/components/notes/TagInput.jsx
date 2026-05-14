// ============================================================================
// TagInput — chip-based tag input
// ============================================================================
//
// Controlled. Press Enter / comma to commit a tag, Backspace on empty
// input to remove the last chip. Tags are normalized to kebab-case to
// match the server-side regex; max 20 tags, 2–30 chars each.
//
// Server's normalizeTags() in notes.controller.js applies the canonical
// rule, so the client just does a friendly mirror to keep chips accurate.
// ============================================================================
import { useState } from "react";
import { cn } from "@utils/cn";

const MAX_TAGS = 20;

function slugify(raw) {
    return String(raw || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export default function TagInput({ value = [], onChange, disabled, placeholder = "Add tag…" }) {
    const [draft, setDraft] = useState("");

    function commit(raw) {
        const slug = slugify(raw);
        if (!slug || slug.length < 2 || slug.length > 30) return;
        if (value.includes(slug)) return;
        if (value.length >= MAX_TAGS) return;
        onChange?.([...value, slug]);
        setDraft("");
    }

    function remove(slug) {
        onChange?.(value.filter((t) => t !== slug));
    }

    function onKeyDown(e) {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit(draft);
        } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
            remove(value[value.length - 1]);
        }
    }

    return (
        <div className="flex items-center flex-wrap gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-disabled">
                Tags
            </span>
            {value.map((t) => (
                <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md
                               bg-surface-2 border border-border-default text-[11px]
                               font-bold text-text-secondary"
                >
                    #{t}
                    {!disabled && (
                        <button
                            type="button"
                            onClick={() => remove(t)}
                            className="text-text-disabled hover:text-danger-fg"
                            aria-label={`Remove tag ${t}`}
                        >
                            ✕
                        </button>
                    )}
                </span>
            ))}
            {!disabled && value.length < MAX_TAGS && (
                <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKeyDown}
                    onBlur={() => draft && commit(draft)}
                    placeholder={placeholder}
                    className={cn(
                        "text-xs px-2 py-0.5 rounded-md bg-transparent",
                        "outline-none border border-transparent",
                        "focus:border-brand-line focus:bg-surface-1",
                        "placeholder:text-text-disabled w-32",
                    )}
                />
            )}
        </div>
    );
}
