// client/src/pages/docs/howto/content/member/notes.jsx
//
// NEW content — written from source-reading of:
//   - client/src/pages/notes/NotesListPage.jsx (folder sidebar + cards)
//   - client/src/pages/notes/NoteNewPage.jsx  ("Save note" button, entity link picker)
//   - client/src/pages/notes/NoteDetailPage.jsx
//
// Feature-flag gate verified: client/src/App.jsx:279 requires
// VITE_FEATURE_NOTES_ENABLED === 'true' for the /notes route to mount.
// Sidebar link (client/src/components/layout/Sidebar.jsx:30) is gated the
// same way — hence the SummaryBlock heads-up.
import {
    SummaryBlock, PrereqList, StepCard, Callout, K,
    BRAND, SUCCESS, INFO,
} from '../../components'

export default function NotesGuide() {
    return (
        <>
            <SummaryBlock>
                Personal, private markdown notes tied to problems, interviews, design sessions, or teaching
                sessions. Only you can see them. Gated by <K>VITE_FEATURE_NOTES_ENABLED</K> — if the sidebar
                Notes link is missing, ask your admin to enable the flag.
            </SummaryBlock>

            <PrereqList items={[
                'VITE_FEATURE_NOTES_ENABLED === "true" in your deployment (sidebar shows a Notes link when active).',
            ]} />

            <StepCard num="1" {...BRAND} title="Open Notes" sub="Sidebar → Notes">
                <p className="text-xs text-text-secondary leading-relaxed">
                    The Notes workspace is a two-column layout: folder sidebar on the left (Views + Folders +
                    Tags), note cards on the right. The URL drives view selection so reload and browser
                    back/forward preserve where you were: <K>/notes</K>, <K>/notes?view=pinned</K>,
                    <K>/notes?view=archive</K>, <K>/notes?view=uncategorized</K>, or <K>/notes?folder=&lt;id&gt;</K>.
                </p>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Create a note tied to a problem" sub="Two entry points">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    You have two ways to attach a note to a problem (or interview / design / teaching session):
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>From the entity page:</strong> the problem / session detail page shows an <strong>Add note</strong> action that pre-fills the link on the new-note page.</li>
                    <li><strong>From the Notes workspace:</strong> click <strong>New note</strong>, then use the entity link picker inside the editor to pick a linked problem or session.</li>
                </ul>
                {/* per client/src/pages/notes/NoteNewPage.jsx:20-27 — searchParams entityType + entityId pre-fill link */}
            </StepCard>

            <StepCard num="3" {...BRAND} title="Write the note" sub="Title + entity link + tags + markdown body">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    The new-note editor has four inputs:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>Title</strong> — up to 200 chars, required. Descriptive title beats a category name.</li>
                    <li><strong>Entity link picker</strong> — attach the note to a Problem, Interview session, Design session, Teaching session, or a Custom URL.</li>
                    <li><strong>Tag input</strong> — free-form tags. Reuse a tag by starting to type it — matches from your existing tags autocomplete.</li>
                    <li><strong>Markdown editor</strong> — standard markdown (headings, lists, code fences, links). Full-fidelity render on the detail page.</li>
                </ul>
            </StepCard>

            <StepCard num="4" {...SUCCESS} title="Save the note" sub="Save note → detail page">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Click <strong>Save note</strong>. You&apos;re redirected to <K>/notes/&lt;id&gt;</K> — the detail
                    page renders the markdown. From there you can pin (⭐), archive, or move to a folder.
                </p>
            </StepCard>

            <StepCard num="5" {...INFO} title="Browse and organize" sub="Views, folders, and tags">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Use the sidebar to filter:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>All notes</strong> — every note you own.</li>
                    <li><strong>Pinned</strong> — starred notes surface here for quick access.</li>
                    <li><strong>Archive</strong> — hidden from All notes but still searchable. Restore any time.</li>
                    <li><strong>Uncategorized</strong> — notes not in any folder. Good weekly-triage view.</li>
                    <li><strong>Folders</strong> — arbitrary hierarchy you control.</li>
                    <li><strong>Tags</strong> — click any tag chip to filter to notes with that tag.</li>
                </ul>
            </StepCard>

            <StepCard num="6" {...INFO} title="Edit or delete" sub="Detail page → Edit / Delete">
                <p className="text-xs text-text-secondary leading-relaxed">
                    The detail page has an <strong>Edit</strong> button that reopens the same editor. Deletes are
                    two-step: first <strong>Archive</strong>, then <strong>Delete permanently</strong> from the
                    archive view — protects you from muscle-memory deletes on notes you actually want.
                </p>
            </StepCard>

            <Callout type="info">
                Notes are personal — only visible to you. Attaching a note to a team-shared problem does not share the note.
            </Callout>
        </>
    )
}
