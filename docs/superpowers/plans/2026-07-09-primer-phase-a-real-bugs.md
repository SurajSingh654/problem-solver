# Primer Phase A — Real Bugs Implementation Plan

**Goal:** Ship the real-bug fixes surfaced by the 4-reviewer primer audit. No schema changes, no migration, no design-approval gates. Independent of Phase B (section model).

**Architecture:** Fix in place. Client-side changes to `MarkdownRenderer` (shared component — touch carefully), `ConceptPrimerTab`, `ConceptPage`. Server-side change to `getConceptDetail` for over-fetch + sequential-query fixes.

**Tech Stack:** React, Vite, Tailwind, DOMPurify, Prisma, Express.

---

## Task 1: Light-mode `prose-invert` bug

**File:** `client/src/components/ui/MarkdownRenderer.jsx`

Change `prose prose-invert prose-app` → `prose dark:prose-invert prose-app`. `prose-invert` currently applies white text unconditionally; light-mode users see white-on-white body text.

Verify by loading a primer with the app in light mode and confirming body text is legible.

## Task 2: DOMPurify `data:`/`blob:` URI hook

**File:** `client/src/components/ui/MarkdownRenderer.jsx`

Add DOMPurify `afterSanitizeAttributes` hook: strip `src` attribute when value doesn't match `/^https?:\/\//i`. Registered once at module load. Symmetric with the server-side `canonicalSources[].url` check already shipped.

## Task 3: `h2` rank promotion in MarkdownRenderer + section-label demotion in ConceptPrimerTab

**Files:** `client/src/components/ui/MarkdownRenderer.jsx`, `client/src/pages/learn/tabs/ConceptPrimerTab.jsx`

- `MarkdownRenderer`: override heading renderer — `##` → `<h3>`, `###` → `<h4>`, etc.
- `ConceptPrimerTab`: change section labels ("Worked example", "Check yourself") from `<h2>` to `<h3>`.

Ensures the heading outline stays hierarchical: `<h1>` on ConceptPage → `<h2>` (implicit for the tab body) → `<h3>` for authored + section labels.

## Task 4: Render `cheatsheetMarkdown` inline

**File:** `client/src/pages/learn/tabs/ConceptPrimerTab.jsx`

Add a collapsible `<details>` block below the primer body, before the "Check yourself" section. Header: "Cheatsheet". Empty state hides the block entirely. Uses `MarkdownRenderer size="sm"`. Wired to a compact `bg-surface-2` card matching `workedExample`.

## Task 5: `getConceptDetail` explicit `select` on Concept

**File:** `server/src/controllers/curriculum.controller.js`

Replace the outer `include: { topic, lab, masteries }` with an explicit `select` on the Concept root:

```js
select: {
  id: true, topicId: true, teamId: true, slug: true, name: true,
  order: true, status: true,
  primerMarkdown: true, workedExample: true, cheatsheetMarkdown: true,
  canonicalSources: true, expectedQuestions: true,
  createdAt: true, updatedAt: true, publishedAt: true,
  topic: { select: {
    id: true, slug: true, name: true, category: true,
    _count: { select: { concepts: { where: { status: "PUBLISHED" } } } }
  }},
  lab:   { select: { /* existing explicit lab select */ } },
  masteries: { where: { userId: req.user.id }, select: { /* existing */ } },
}
```

**Drops from wire:** `readinessRubric`, `assessmentCriteria`, `primerHtml`, `richHtmlEnabled`. Adds `cheatsheetMarkdown` (needed for Task 4) and `topic.category` (needed for the CategoryBadge already in use downstream).

## Task 6: Fold `latestAttempt` into `lab.attempts` include

**File:** `server/src/controllers/curriculum.controller.js`

Replace the sequential `prisma.labAttempt.findFirst` call with a nested include on `lab.attempts` (take: 1, ordered desc, userId-filtered). Then `latestAttempt = concept.lab?.attempts?.[0] ?? null`. Same response shape, one less DB round-trip.

## Task 7: Footer CTA mobile responsive fix

**File:** `client/src/pages/learn/tabs/ConceptPrimerTab.jsx`

Footer container: `flex items-center justify-between gap-4` → `flex flex-wrap items-center justify-between gap-4 sm:flex-nowrap`. Wraps to two rows on narrow screens (tagline on top, button below) without overflow.

## Task 8: Tabpanel focus management on tab switch

**File:** `client/src/pages/learn/ConceptPage.jsx`

Add `useRef` on the tabpanel `motion.div`. In a `useEffect` that depends on `activeTab`, call `ref.current?.focus()` — but skip the initial mount (else the initial render steals focus from breadcrumbs). Add `tabIndex={-1}` to the motion.div so it's programmatically focusable without joining the tab order.

## Task 9: Respect `prefers-reduced-motion` on footer CTA fade

**File:** `client/src/pages/learn/tabs/ConceptPrimerTab.jsx`

Import `useReducedMotion` from framer-motion. Short-circuit `initial` and `transition` when reduced-motion is preferred: `initial={prefersReduced ? false : { opacity: 0 }}`.

## Verification

1. `cd server && npm run lint` — must pass with 0 warnings
2. `cd client && npm run lint` — must pass with 0 warnings
3. `cd server && npx vitest run test/integration/curriculum.attempt.integration.test.js` — should still pass
4. Manual browser check:
   - Load a concept in light mode, verify primer body text is legible
   - Load a concept whose primer contains headings — inspect DOM, first-level should be `<h3>`, screen reader outline linear
   - Load a concept with a `cheatsheetMarkdown` populated — verify the collapsible cheatsheet renders below the body
   - Tab into the tab bar, activate a tab — focus should land on the tabpanel

## Commit

Single commit: `"Primer Phase A: light-mode fix + XSS hook + over-fetch narrow + a11y polish"`.
