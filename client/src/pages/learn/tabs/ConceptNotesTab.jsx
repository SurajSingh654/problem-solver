// ============================================================================
// ConceptNotesTab — link to prefilled note create (W4.T7, minimal)
// ============================================================================
//
// Full "notes filtered by concept" list is Phase 2 polish — there's no
// shared `<NotesList>` component today (`NotesListPage` owns its own state
// + folder sidebar and isn't parameterisable). Ship the placeholder now,
// wire the deep-link surface, revisit when the notes surface itself grows
// a reusable filtered-list primitive.
//
// The "New note" button navigates to NoteNewPage with the entity
// pre-selected. NoteNewPage reads `?entityType=` and `?entityId=` from
// the URL (see NoteNewPage.jsx:20-27) — those are the two params we set.
// `linkedEntityType` in the DB will be `CONCEPT` (enum on
// server/prisma/schema.prisma NoteEntityType).
// ============================================================================
import { Link } from 'react-router-dom'
import { Button } from '@components/ui/Button'
import { NotebookPen, ExternalLink } from 'lucide-react'

export default function ConceptNotesTab({ concept }) {
    // NoteNewPage query-param names (`entityType` / `entityId`) — matches
    // its own `useSearchParams` reader. Do NOT rename these to
    // `linkedEntityType` / `linkedEntityId` even though those are the
    // DB column names — the page-level reader keys off the shorter form.
    const newNoteHref =
        `/notes/new?entityType=CONCEPT&entityId=${encodeURIComponent(concept.id)}`

    // Deep-link to the notes list with a query-string breadcrumb — even
    // though NotesListPage doesn't filter on entity today, the URL stays
    // future-compatible and the user still lands on a useful surface.
    const notesListHref = '/notes'

    return (
        <div className="max-w-2xl mx-auto py-8 space-y-6">
            <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-surface-2 border border-border-default flex items-center justify-center shrink-0">
                    <NotebookPen className="w-6 h-6 text-text-secondary" />
                </div>
                <div className="space-y-1.5">
                    <h2 className="text-lg font-bold text-text-primary">
                        Notes on {concept.name}
                    </h2>
                    <p className="text-sm text-text-tertiary leading-relaxed">
                        Concept-linked notes let you capture the "why" — mental
                        models, gotchas, mistakes to avoid, links to your own
                        past problems. Notes don't move your mastery score, but
                        they're the sharpest recall tool once you're teaching
                        the concept.
                    </p>
                </div>
            </div>

            <div className="bg-surface-1 border border-border-default rounded-xl p-5 space-y-4">
                <div className="space-y-1">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
                        Quick create
                    </h3>
                    <p className="text-xs text-text-tertiary leading-relaxed">
                        A new note pre-linked to this concept. The link is set
                        once — you can unlink or move it later on the note itself.
                    </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <Link to={newNoteHref}>
                        <Button variant="primary" size="md">
                            + New note (linked to this concept)
                        </Button>
                    </Link>
                    <Link
                        to={notesListHref}
                        className="text-xs text-text-tertiary hover:text-text-primary transition-colors inline-flex items-center gap-1"
                    >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open notes workspace
                    </Link>
                </div>
            </div>

            <p className="text-[11px] text-text-tertiary leading-relaxed">
                A concept-filtered notes list lands in Phase 2 — for now the notes
                workspace shows every note you've written across the app.
            </p>
        </div>
    )
}
