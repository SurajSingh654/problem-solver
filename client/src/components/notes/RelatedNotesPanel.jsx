// ============================================================================
// RelatedNotesPanel — embedding-driven similar notes + problems
// ============================================================================
//
// P3 ships raw cosine similarity (no LLM). P4 will replace the data
// shape with LLM-ranked output and add per-item rationales — the UI
// here is forward-compatible (it'll just gain a `rationale` field on
// each row).
// ============================================================================
import { Link } from "react-router-dom";
import { useRelatedForNote } from "@hooks/useNotes";
import { Spinner } from "@components/ui/Spinner";

export default function RelatedNotesPanel({ noteId }) {
    const { data, isLoading } = useRelatedForNote(noteId);

    if (isLoading) {
        return (
            <div className="rounded-xl bg-surface-1 border border-border-default p-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary mb-2">
                    🧭 Related
                </h3>
                <Spinner size="sm" />
            </div>
        );
    }

    const notes = data?.relatedNotes || [];
    const problems = data?.relatedProblems || [];
    const empty = notes.length === 0 && problems.length === 0;

    return (
        <div className="rounded-xl bg-surface-1 border border-border-default p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                    🧭 Related
                </h3>
                {data?.aiGenerated && (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-brand-fg-soft">
                        ✨ AI-ranked
                    </span>
                )}
            </div>

            {empty ? (
                <p className="text-xs text-text-disabled italic">
                    No related notes or problems yet. Embedding generates a few seconds
                    after you save — try refreshing in a moment, or write more content
                    so the model has signal to match against.
                </p>
            ) : (
                <>
                    {notes.length > 0 && (
                        <Section title="Notes">
                            {notes.map((n) => (
                                <RelatedRow
                                    key={n.id}
                                    to={`/notes/${n.id}`}
                                    title={n.title}
                                    subtitle={(n.tags || []).slice(0, 3).map((t) => `#${t}`).join(" ")}
                                    rationale={n.rationale}
                                    similarity={n.similarity}
                                />
                            ))}
                        </Section>
                    )}
                    {problems.length > 0 && (
                        <Section title="Problems">
                            {problems.map((p) => (
                                <RelatedRow
                                    key={p.id}
                                    to={`/problems/${p.id}`}
                                    title={p.title}
                                    subtitle={`${p.category} · ${p.difficulty}`}
                                    rationale={p.rationale}
                                    similarity={p.similarity}
                                />
                            ))}
                        </Section>
                    )}
                </>
            )}
        </div>
    );
}

function Section({ title, children }) {
    return (
        <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-disabled">
                {title}
            </p>
            <ul className="space-y-1">{children}</ul>
        </div>
    );
}

function RelatedRow({ to, title, subtitle, similarity, rationale }) {
    const pct = Math.round((similarity || 0) * 100);
    return (
        <li>
            <Link
                to={to}
                className="block px-3 py-2 rounded-lg bg-surface-2 hover:bg-surface-3 transition-colors"
            >
                <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-xs font-bold text-text-primary truncate">
                            {title}
                        </p>
                        {subtitle && (
                            <p className="text-[10px] text-text-disabled truncate">
                                {subtitle}
                            </p>
                        )}
                    </div>
                    <span className="text-[10px] text-text-disabled font-mono shrink-0">
                        {pct}%
                    </span>
                </div>
                {rationale && (
                    <p className="text-[11px] text-text-tertiary mt-1 italic leading-snug">
                        {rationale}
                    </p>
                )}
            </Link>
        </li>
    );
}
