// client/src/pages/docs/howto/content/super-admin/roadmap.jsx
//
// NEW content — written from source-reading of:
//   - client/src/pages/superadmin/TodoPage.jsx
//     Focus strip (NOW items) → Filter bar → Phase groups → Footer
//     Velocity stats: 5 tiles (line 307)
//     Keyboard shortcuts: j/k nav, e expand, / search, Esc clear (line 229)
//     #item-<id> deep-link expands + scrolls (line 204)
//     Density toggle persisted to localStorage (line 62)
//     DONE hidden behind "Show shipped" toggle (line 59)
//     Auto-collapse phases with > 8 items (line 32)
//   - client/src/pages/superadmin/roadmap/roadmapData.js
//     Phases: NOW / NEXT / LATER / SOMEDAY / BACKLOG / DONE (config line 21+)
//     Item shape documented at top: phase / theme / priority / effort / etc.
//     researchBasis flag surfaces the 🔬 icon
//   - client/src/App.jsx:235 → /super-admin/roadmap route
//
// Per CLAUDE.md: "roadmapData.js is the single source of truth for feature status.
// Do not re-explain roadmap items here." — this guide explains the PAGE, not items.
import {
    SummaryBlock, PrereqList, StepCard, Callout, K,
    IfItFails,
    BRAND,
} from '../../components'

export default function RoadmapPageGuide() {
    return (
        <>
            <SummaryBlock>
                The internal product roadmap. Everything in flight, queued, or considered — grouped
                by phase, filterable, keyboard-navigable, and each item deep-linkable via URL hash.
            </SummaryBlock>

            <PrereqList items={[
                'You are SUPER_ADMIN on the platform.',
            ]} />

            <Callout type="info">
                <strong>Data source.</strong> Every item on this page comes from a single JavaScript
                file in the client bundle: <K>client/src/pages/superadmin/roadmap/roadmapData.js</K>.
                Edit that file to add, move, or ship an item. No database, no admin form.
            </Callout>

            <StepCard num="1" {...BRAND} title="Open the Roadmap page" sub="Sidebar → Roadmap">
                <p className="text-xs text-text-secondary leading-relaxed">
                    From the super-admin sidebar click <strong>Roadmap</strong>. The header shows five
                    velocity tiles: <em>Shipped last 30d</em>, <em>Total shipped</em>,
                    <em> In progress</em>, <em>Planned</em>, and <em>Research-backed</em>.
                </p>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Understand the phases" sub="NOW → NEXT → LATER → SOMEDAY → BACKLOG → DONE">
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>NOW</strong> — currently building or immediately queued. Also highlighted at the top in a green &ldquo;Focus this week&rdquo; strip.</li>
                    <li><strong>NEXT</strong> — committed for the next 1-3 months.</li>
                    <li><strong>LATER</strong> — planned for 3-9 months, with a clear design.</li>
                    <li><strong>SOMEDAY</strong> — good ideas without a firm slot.</li>
                    <li><strong>BACKLOG</strong> — captured but not yet reviewed.</li>
                    <li><strong>DONE</strong> — hidden by default; toggle <strong>Show shipped</strong> to expose. Every DONE item has a <K>shippedAt</K> stamp — nothing gets deleted.</li>
                </ul>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    A large phase (&gt;&nbsp;8 items) auto-collapses its item list — click the phase
                    header to expand.
                </p>
            </StepCard>

            <StepCard num="3" {...BRAND} title="Filter the view" sub="Phase × Theme × Priority × Effort × Search">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    The filter bar exposes:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>Phase</strong> chips (multi-select).</li>
                    <li><strong>Theme</strong> chips — strategic pillar per item (multi-select).</li>
                    <li><strong>Priority</strong> single-select: HIGH / MEDIUM / LOW.</li>
                    <li><strong>Effort</strong> single-select: Small / Medium / Large / XLarge.</li>
                    <li><strong>Search</strong> — matches title, impact, description, why, technicalNotes, researchBasis, theme. Highlights inline.</li>
                    <li><strong>Density</strong> toggle — compact vs. comfortable. Persists in localStorage.</li>
                </ul>
            </StepCard>

            <StepCard num="4" {...BRAND} title="Use keyboard shortcuts" sub="Fastest way to review the whole roadmap">
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><K>/</K> — focus the search input.</li>
                    <li><K>j</K> or <K>↓</K> — next card.</li>
                    <li><K>k</K> or <K>↑</K> — previous card.</li>
                    <li><K>e</K> — expand or collapse the focused card.</li>
                    <li><K>Esc</K> — clear search / blur input.</li>
                </ul>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Shortcuts are inert while typing in any input.
                </p>
            </StepCard>

            <StepCard num="5" {...BRAND} title="Deep-link to a single item" sub="URL hash → #item-<id>">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Every card has an id (matches the object in <K>roadmapData.js</K>). Adding
                    <K>#item-&lt;id&gt;</K> to the roadmap URL auto-expands that card and scrolls it
                    into view — including DONE items (the <em>Show shipped</em> toggle flips on
                    automatically). Expanding a card via the UI also mirrors the hash to the URL so
                    you can share the link.
                </p>
            </StepCard>

            <Callout type="info">
                <strong>Editing the roadmap.</strong> Open <K>client/src/pages/superadmin/roadmap/roadmapData.js</K>,
                add or move an object in <K>ROADMAP_ITEMS</K>, and redeploy. When you ship, flip
                <K>phase</K> to <K>DONE</K> and add a <K>shippedAt</K> date — do not delete the row.
            </Callout>

            <IfItFails>
                <li><strong>The item I&apos;m looking for isn&apos;t in the list</strong> — check if a filter is active (top of the page shows &ldquo;Showing N of M items&rdquo;). Clear filters and re-search.</li>
                <li><strong>Keyboard shortcuts don&apos;t work</strong> — your focus is inside an input. Click empty page area or press <K>Esc</K> to blur, then retry.</li>
                <li><strong>URL hash didn&apos;t open the card</strong> — the id in the hash doesn&apos;t match anything in <K>roadmapData.js</K>. Fix the id or remove the hash.</li>
                <li><strong>Density toggle keeps resetting</strong> — localStorage was cleared by browser dev tools or a private-mode session. Reset it in the filter bar; it will persist again after that.</li>
                <li><strong>&ldquo;Show shipped&rdquo; toggle does nothing visible</strong> — you have no shipped items in the current filter slice. Clear filters first.</li>
            </IfItFails>
        </>
    )
}
