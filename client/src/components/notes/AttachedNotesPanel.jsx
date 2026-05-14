// ============================================================================
// AttachedNotesPanel — embedded panel on entity detail pages
// ============================================================================
//
// Shows the user's notes linked to a specific entity (Problem, Mock
// Interview, Design Session, Teaching Session). Hidden entirely when the
// notes feature flag is off so detail pages stay byte-identical for users
// who don't have the feature.
// ============================================================================
import { Link, useNavigate } from "react-router-dom";
import { useNotesByEntity } from "@hooks/useNotes";
import { Spinner } from "@components/ui/Spinner";
import { formatRelativeDate } from "@utils/formatters";

export default function AttachedNotesPanel({ entityType, entityId }) {
    const navigate = useNavigate();
    const flagOn = import.meta.env.VITE_FEATURE_NOTES_ENABLED === "true";
    const { data: notes, isLoading } = useNotesByEntity(
        flagOn ? entityType : null,
        flagOn ? entityId : null,
    );

    if (!flagOn) return null;

    function handleAddNote() {
        const params = new URLSearchParams({
            entityType,
            entityId,
        });
        navigate(`/notes/new?${params.toString()}`);
    }

    return (
        <div className="rounded-xl bg-surface-1 border border-border-default p-4 space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                    📝 Your notes
                </h3>
                <button
                    type="button"
                    onClick={handleAddNote}
                    className="text-[10px] font-bold text-brand-fg-soft hover:underline"
                >
                    + Add note
                </button>
            </div>

            {isLoading ? (
                <Spinner size="sm" />
            ) : (notes?.length || 0) === 0 ? (
                <p className="text-xs text-text-disabled italic">
                    No notes yet. Capture an insight or thinking from this session.
                </p>
            ) : (
                <ul className="space-y-1.5">
                    {notes.map((n) => (
                        <li key={n.id}>
                            <Link
                                to={`/notes/${n.id}`}
                                className="block px-3 py-2 rounded-lg bg-surface-2
                                           hover:bg-surface-3 transition-colors"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-bold text-text-primary truncate">
                                        {n.pinned && (
                                            <span className="mr-1 text-warning-fg">📌</span>
                                        )}
                                        {n.title}
                                    </p>
                                    <span className="text-[10px] text-text-disabled shrink-0">
                                        {formatRelativeDate(n.updatedAt)}
                                    </span>
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
