# Sprint 9 — Frontend Foundation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 3 measurable client-side drift/adoption gaps: CodeEditor CSS-var migration (Item 1), `window.confirm()` → `useConfirm` at 5 sites (Item 2), `useToastingMutation` adoption on 8 high-traffic hooks (Item 3). No new features; no user-facing behavior change beyond visual consistency and modal-vs-native UX.

**Architecture:** One feature branch, three commits, one per item. Each commit independently revertable. No test runner exists for the client workspace — validation is `npm run lint` + `npm run build` + manual smoke via `npm run dev`, with smoke evidence captured in each commit body.

**Tech Stack:** React 18, Vite 5, Tailwind 3.x, `@monaco-editor/react`, TanStack Query 5, Zustand, custom Toast component.

**Spec:** [`docs/superpowers/specs/2026-07-03-sprint-9-frontend-foundation-hardening-design.md`](../specs/2026-07-03-sprint-9-frontend-foundation-hardening-design.md)

**Branch:** `feat/frontend-foundation-hardening` (already created; spec v2 committed at `29ebb1f`)

**Baseline:** server tests 1475 passing (Sprint 8c ship), server + client lint clean, client build clean, prisma migrate status up to date.

**Review history:** Full 4-role panel completed pre-implementation with all 3 BLOCKER fold-ins applied in spec v2 (`29ebb1f`):
- Lead Eng F1: `monacoRef` doesn't exist — must add + assign in `handleMount` + initial-apply from `handleMount`
- Lead Eng F7: theme detection is `!contains("light")`, not `contains("force-dark-theme") || contains("dark")`
- Lead Eng F2 / Sec F1: `useConfirm` uses `danger: boolean`, not `tone: string`
- Lead Eng F3 / BA F5: `useToastingMutation` prop is `errorPrefix` (concatenated as `${errorPrefix} — ${serverMsg}`), not `errorToast`
- BA F6: 3 of 8 hooks renamed/swapped based on actual source

---

## File map

**Modify (Item 1):**
- `client/src/components/ui/CodeEditor.jsx`

**Modify (Item 2):**
- `client/src/components/notes/NotesSidebar.jsx` (1 site)
- `client/src/pages/ReviewQueuePage.jsx` (1 site)
- `client/src/pages/notes/NotesListPage.jsx` (1 site)
- `client/src/pages/notes/NoteDetailPage.jsx` (2 sites)

**Modify (Item 3):**
- `client/src/hooks/useSolutions.js` (2 hooks — `useSubmitSolution`, `useSubmitReview`)
- `client/src/hooks/useNotes.js` (3 hooks — `useCreateNote`, `useUpdateNote`, `useDeleteNotePermanent`)
- `client/src/hooks/useProblems.js` (2 hooks — `useCreateProblem`, `useUpdateProblem`)
- `client/src/hooks/useNoteFolders.js` (1 hook — `useCreateNoteFolder`; verify path exists during Task 3)

**Modify (Task 4 only):**
- `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`

**Read-only (verification only):**
- `client/src/hooks/useConfirm.js`
- `client/src/hooks/useToastingMutation.js`
- `client/src/components/ui/ConfirmModal.jsx`
- `client/src/components/ui/Toast.jsx`
- `client/src/store/useUIStore.js`
- `client/src/styles/index.css`
- `client/src/App.jsx`

**Unchanged (explicit):**
- All server code
- All server tests (backend not touched; count stays at 1475)
- All Prisma migrations
- `tailwind.config.js`
- `client/src/services/api.js`

---

## Task 0: Pre-flight

- [ ] **Step 1: Confirm branch + clean state**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git status
git log --oneline -3
```

Expected: branch `feat/frontend-foundation-hardening`, latest commit `29ebb1f` (spec v2), clean tree.

- [ ] **Step 2: Baseline gates (all must exit 0)**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "^ *Tests +" | tail -3
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run build
```

Expected: server tests 1475 passed; all lint clean; migrate status up to date; client build clean.

- [ ] **Step 3: Verify API surfaces referenced in spec**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && grep -n "danger\|tone\|title\|description\|confirmLabel\|cancelLabel" client/src/components/ui/ConfirmModal.jsx | head -20
grep -n "errorPrefix\|errorToast\|successMessage\|onError\|extractErrorMessage" client/src/hooks/useToastingMutation.js
grep -n "classList\|force-dark-theme\|force-light-theme" client/src/store/useUIStore.js
```

Expected findings (spec baseline):
- `ConfirmModal.jsx` destructures `danger` (boolean), NOT `tone`
- `useToastingMutation.js` exposes `errorPrefix`, NOT `errorToast`; concat format `${errorPrefix} — ${serverMsg}`
- `useUIStore.js` toggles `dark`/`light` classes only (no `force-*-theme`)

If any expectation fails, escalate before starting Task 1 — the spec's fold-ins were based on this API shape.

NO commits.

---

## Task 1: CodeEditor CSS-var migration

**Files:** `client/src/components/ui/CodeEditor.jsx`

### Steps

- [ ] **Step 1: Read the current CodeEditor thoroughly**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && cat -n client/src/components/ui/CodeEditor.jsx | head -140
```

Locate:
- The two `defineTheme` calls (L44-98)
- The `handleMount(editor, monaco)` handler (L125 per BA)
- The `isDark` variable (L120) — will be replaced
- The `<Editor>` render + `theme=` prop (near L305 per Lead Eng note)

- [ ] **Step 2: Add `useRef` import + `monacoRef`**

At the top-of-file imports:
```js
import { useEffect, useRef, useState } from 'react'
```

Inside the component body:
```js
const monacoRef = useRef(null)
```

- [ ] **Step 3: Add `readCssVar` and `toMonacoHex` helpers**

Place before the component definition (after `MONACO_LANG` const). The helpers are module-level pure functions:

```js
// Read a CSS custom property from :root, returning fallback on empty/missing.
function readCssVar(name, fallback) {
  if (typeof document === "undefined") return fallback
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return value || fallback
}

// Convert a CSS-var value to a Monaco-compatible 6-digit hex.
// - Rejects malformed values (only 3/6/8 hex digits accepted, optionally #-prefixed)
// - Expands 3-digit shorthand (#abc → #aabbcc) so downstream alpha concat is safe
// - Falls back on any non-hex form (rgb(), hsl(), keyword) — protects against
//   CSS-var injection primitives + legacy shorthand.
function toMonacoHex(value, fallback) {
  const raw = (value || "").trim().replace(/^#/, "")
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(raw)) {
    return fallback
  }
  if (raw.length === 3) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`
  }
  return `#${raw}`
}
```

- [ ] **Step 4: Replace the two `defineTheme` blocks with a `buildTheme(mode)` factory**

Delete lines 44-98 (both `defineTheme` calls inside `defineTheme(monaco)`). Replace with:

```js
// Build a Monaco theme object from CSS-var reads.
// - Chrome colors (background, fg, line highlight, cursor, indent, scrollbar,
//   selection) source from CSS vars in src/styles/index.css.
// - Syntax rule colors (comment/keyword/string/number/type/function) stay as
//   deliberate identity hex values — those are design decisions, not tokens.
// - Alpha-suffixed selection colors use the brand-500 CSS var + literal alpha
//   suffix so a token change propagates cleanly.
function buildTheme(mode) {
  const brand = toMonacoHex(readCssVar("--brand-500"), "#7c6ff7")
  const surface0 = toMonacoHex(readCssVar("--surface-0"), mode === "dark" ? "#111118" : "#f0f0f5")
  const surface1 = toMonacoHex(readCssVar("--surface-1"), mode === "dark" ? "#18181f" : "#e8e8f0")
  const surface2 = toMonacoHex(readCssVar("--surface-2"), mode === "dark" ? "#202028" : "#dddde8")
  const surface3 = toMonacoHex(readCssVar("--surface-3"), mode === "dark" ? "#282832" : "#c9c9d4")
  const fgPrimary = toMonacoHex(readCssVar("--fg-primary"), mode === "dark" ? "#eeeef5" : "#0f0f1a")
  const fgSecondary = toMonacoHex(readCssVar("--fg-secondary"), mode === "dark" ? "#55556e" : "#6b6b8a")
  const fgTertiary = toMonacoHex(readCssVar("--fg-tertiary"), mode === "dark" ? "#35354a" : "#9999b0")

  return {
    base: mode === "dark" ? "vs-dark" : "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: mode === "dark" ? "55556e" : "6b6b8a", fontStyle: "italic" },
      { token: "keyword", foreground: mode === "dark" ? "9d93f9" : "6358d4" },
      { token: "string", foreground: mode === "dark" ? "22c55e" : "16a34a" },
      { token: "number", foreground: mode === "dark" ? "eab308" : "ca8a04" },
      { token: "type", foreground: mode === "dark" ? "3b82f6" : "2563eb" },
      { token: "function", foreground: mode === "dark" ? "60a5fa" : "3b82f6" },
    ],
    colors: {
      "editor.background": surface0,
      "editor.foreground": fgPrimary,
      "editor.lineHighlightBackground": surface1,
      "editorLineNumber.foreground": fgTertiary,
      "editorLineNumber.activeForeground": fgSecondary,
      "editorCursor.foreground": brand,
      "editorIndentGuide.background": surface2,
      "editorIndentGuide.activeBackground": surface3,
      "editor.selectionBackground": `${brand}30`,
      "editor.inactiveSelectionBackground": `${brand}15`,
      "editor.selectionHighlightBackground": `${brand}20`,
      "editorBracketMatch.background": `${brand}25`,
      "editorBracketMatch.border": `${brand}50`,
      "scrollbarSlider.background": `${surface3}40`,
      "scrollbarSlider.hoverBackground": `${surface3}80`,
    },
  }
}

// Apply both themes + activate the current one based on `.light` class presence.
function applyThemes(monaco) {
  const isDark = !document.documentElement.classList.contains("light")
  monaco.editor.defineTheme("probsolver-dark", buildTheme("dark"))
  monaco.editor.defineTheme("probsolver-light", buildTheme("light"))
  monaco.editor.setTheme(isDark ? "probsolver-dark" : "probsolver-light")
}
```

- [ ] **Step 5: Wire `handleMount` to store ref + apply themes on first paint**

Locate the existing `handleMount` (around L125). Extend it so `monaco` is stored and themes are applied:

```js
function handleMount(editor, monaco) {
  monacoRef.current = monaco
  applyThemes(monaco)
  // ...preserve any existing handleMount body verbatim
}
```

- [ ] **Step 6: Add `useEffect` for theme-toggle reactivity**

Inside the component body, after existing state declarations:

```js
useEffect(() => {
  // Debounce with queueMicrotask so useUIStore.js:32-36 (`remove(dark) + add(light)`)
  // batches into ONE applyThemes call, not two.
  let pending = false
  const observer = new MutationObserver(() => {
    if (pending) return
    pending = true
    queueMicrotask(() => {
      pending = false
      if (monacoRef.current) applyThemes(monacoRef.current)
    })
  })
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  })
  return () => observer.disconnect()
}, [])
```

- [ ] **Step 7: Remove the stale `isDark` at L120**

The old L120 `isDark` variable is now redundant — `applyThemes` derives it fresh from classList at each apply. Delete the variable + any `theme={isDark ? "probsolver-dark" : "probsolver-light"}` prop on `<Editor>` if it was passed statically (Lead Eng note: static prop becomes stale-but-harmless once effect + handleMount take over; delete to avoid two sources of truth). If it's required by `@monaco-editor/react` for initial render, pass `theme="probsolver-dark"` as a placeholder — `applyThemes` overwrites it immediately in `handleMount`.

- [ ] **Step 8: Run client build + lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint 2>&1 | tail -10
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run build 2>&1 | tail -10
```

Expected: both clean.

- [ ] **Step 9: Manual smoke via dev server**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run dev
```

In a browser at http://localhost:5173:
1. Navigate to any page rendering CodeEditor (Problem Detail submit form, Solution edit).
2. Verify editor renders with correct colors on first paint (background matches `--surface-0`).
3. Toggle theme via Topbar/Settings (dark ↔ light).
4. **Verify editor colors update WITHOUT page reload** — this is the load-bearing behavior. If they don't, the observer setup is wrong.
5. Inspect DevTools → Elements → `<html>` — confirm class changes `dark` ↔ `light` (not `force-*-theme`).
6. Read a CSS var value in DevTools console: `getComputedStyle(document.documentElement).getPropertyValue('--surface-0')` — confirm it matches the editor background.

Record smoke observations for the commit body.

- [ ] **Step 10: Commit Item 1**

Standing rules: single-line subject, NO Co-Authored-By.

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add client/src/components/ui/CodeEditor.jsx && git commit -m "$(cat <<'EOF'
Migrate CodeEditor theme to CSS custom properties

Smoke: dark→light toggle without reload confirmed; editor background follows
--surface-0 in DevTools inspection. handleMount + MutationObserver both fire
themes; queueMicrotask debounce batches useUIStore's dual class mutation.
EOF
)"
```

---

## Task 2: `window.confirm()` → `useConfirm` at 5 sites

**Files:**
- `client/src/components/notes/NotesSidebar.jsx`
- `client/src/pages/ReviewQueuePage.jsx`
- `client/src/pages/notes/NotesListPage.jsx`
- `client/src/pages/notes/NoteDetailPage.jsx`

### Steps

- [ ] **Step 1: Confirm `useConfirm` API shape**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && cat -n client/src/hooks/useConfirm.js
cd /Users/surajsingh/Downloads/Projects/problem-solver && grep -n "danger\|title\|description\|confirmLabel\|cancelLabel" client/src/components/ui/ConfirmModal.jsx | head -20
```

Verify: `useConfirm()` returns a function that accepts `{ title, description, confirmLabel, cancelLabel, danger }` and resolves to `boolean` (true=confirm, false=cancel).

- [ ] **Step 2: Migrate NotesSidebar.jsx:74**

Read the current handler:
```bash
sed -n '70,85p' client/src/components/notes/NotesSidebar.jsx
```

Add `import { useConfirm } from "@hooks/useConfirm"` to the imports. Inside the component, add `const confirm = useConfirm()`.

Replace the `window.confirm(...)` call with:
```js
const ok = await confirm({
  title: "Delete this note?",
  description: `"${node.title || 'Untitled'}" will be moved to Trash. You can restore it within 30 days.`,
  confirmLabel: "Delete",
  cancelLabel: "Cancel",
  danger: true,
});
if (!ok) return;
```

Convert the handler to `async` if it isn't already.

- [ ] **Step 3: Migrate ReviewQueuePage.jsx:460**

Same pattern; `danger: false` (this is close-and-discard, not deletion):
```js
const ok = await confirm({
  title: "Close this review?",
  description: "Your typed recall will be discarded.",
  confirmLabel: "Close",
  cancelLabel: "Continue reviewing",
  danger: false,
});
if (!ok) return;
```

- [ ] **Step 4: Migrate NotesListPage.jsx:288**

Same shape as NotesSidebar. `danger: true`. Confirm `stop(e)` (or equivalent `preventDefault`/`stopPropagation`) fires BEFORE the `await`.

- [ ] **Step 5: Migrate NoteDetailPage.jsx:183 (soft delete)**

`danger: true`:
```js
const ok = await confirm({
  title: "Delete this note?",
  description: "It will be moved to Trash and can be restored within 30 days.",
  confirmLabel: "Delete",
  cancelLabel: "Cancel",
  danger: true,
});
if (!ok) return;
```

- [ ] **Step 6: Migrate NoteDetailPage.jsx:213 (permanent delete — stronger copy)**

`danger: true`:
```js
const ok = await confirm({
  title: "Permanently delete this note?",
  description: "This cannot be undone. The note and its embedding will be removed immediately.",
  confirmLabel: "Delete permanently",
  cancelLabel: "Cancel",
  danger: true,
});
if (!ok) return;
```

- [ ] **Step 7: Client build + lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint 2>&1 | tail -5
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run build 2>&1 | tail -5
```

Expected: both clean. If lint complains about unused `useConfirm` imports in files that don't use them, remove those.

- [ ] **Step 8: Manual smoke (5 sites)**

Via `npm run dev`:
1. **NotesSidebar** — right-click a note → Delete → styled modal with danger tone → cancel + confirm both work. Note title interpolates safely (no HTML rendering).
2. **ReviewQueue close** — start a review, type some recall text, click Close → neutral modal, "Close" + "Continue reviewing" buttons → discards on confirm.
3. **NotesList delete** — from `/notes` list, delete a note → danger modal → deletes.
4. **NoteDetail soft delete** — from a note's detail view, click Delete → danger modal → soft-deletes (moves to Trash).
5. **NoteDetail permanent delete** — from Trash, click Delete Permanently → danger modal with stronger copy → permanently removes.

Verify no console errors, no double-modal flashes, focus returns correctly after modal closes.

- [ ] **Step 9: Commit Item 2**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add client/src/components/notes/NotesSidebar.jsx client/src/pages/ReviewQueuePage.jsx client/src/pages/notes/NotesListPage.jsx client/src/pages/notes/NoteDetailPage.jsx && git commit -m "$(cat <<'EOF'
Replace window.confirm() with useConfirm at 5 sites

Smoke: all 5 sites tested — NotesSidebar delete, ReviewQueue close-and-discard
(neutral tone), NotesList delete, NoteDetail soft delete, NoteDetail permanent
delete. All modals render, cancel/confirm work, focus restored on close.
EOF
)"
```

---

## Task 3: `useToastingMutation` adoption on 8 hooks

**Files:** `client/src/hooks/useSolutions.js`, `useNotes.js`, `useProblems.js`, `useNoteFolders.js` (verify path)

### Steps

- [ ] **Step 1: Read the wrapper's actual behavior**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && cat -n client/src/hooks/useToastingMutation.js
```

Confirm the props signature (spec claims `errorPrefix`, concat format `${errorPrefix} — ${serverMsg}`). If the actual shape differs, adapt the migrations in this task to whatever the wrapper actually supports — record the delta in commit body.

- [ ] **Step 2: For each of 8 hooks, verify it's a migration candidate**

For each hook, read the current source and check:
- (a) Does it already use `useToastingMutation`? If yes, skip.
- (b) Does its `onError` do only a toast (possibly with `extractErrorMessage`)? If no (custom logic like navigation, state reset), skip and swap for a fallback candidate.
- (c) Does it fit the wrapper's option surface cleanly? If it has custom retry, invalidation timing tied to error, or other complexity, skip.

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && grep -n "useMutation\|useToastingMutation\|onError\|extractErrorMessage" client/src/hooks/useSolutions.js client/src/hooks/useNotes.js client/src/hooks/useProblems.js client/src/hooks/useNoteFolders.js 2>&1 | head -40
```

- [ ] **Step 3: Migrate `useSubmitSolution` (useSolutions.js)**

Pattern:
```js
// Before
export function useSubmitSolution() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload) => api.solutions.submit(payload),
    onError: (err) => toast.error(extractErrorMessage(err) || "Failed to submit"),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["solutions"] })
      // ...
    },
  })
}

// After
export function useSubmitSolution() {
  const qc = useQueryClient()
  return useToastingMutation({
    mutationFn: (payload) => api.solutions.submit(payload),
    errorPrefix: "Submit failed",
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["solutions"] })
      // ...
    },
  })
}
```

Add `import { useToastingMutation } from "@hooks/useToastingMutation"`. Remove any now-unused imports (`toast`, `extractErrorMessage`) if this was the only user in the file — but check before deleting; other hooks in the same file may still need them.

- [ ] **Step 4: Migrate `useSubmitReview` (useSolutions.js)**

Same pattern, `errorPrefix: "Review submit failed"`. **CRITICAL (PO F3):** this is the SM-2 write path with server-side interactive-transaction lock (`SELECT ... FOR UPDATE`). The wrapper migration must preserve error-surfacing semantics — a server 409 (conflict, lock loser) must still reach the user as a visible toast, not be swallowed. Verify against wrapper source before migrating.

- [ ] **Step 5-8: Migrate remaining hooks**

Repeat for:
- `useCreateNote` → `errorPrefix: "Save failed"`
- `useUpdateNote` → `errorPrefix: "Update failed"`
- `useDeleteNotePermanent` → `errorPrefix: "Delete failed"`
- `useCreateProblem` → `errorPrefix: "Create failed"`
- `useUpdateProblem` → `errorPrefix: "Update failed"`
- `useCreateNoteFolder` → `errorPrefix: "Folder create failed"` (verify hook exists at this path; if not, swap to `useUpdateNoteFolder` or `useDeleteNoteFolder`)

For any hook that fails the (b)/(c) check in Step 2, swap to a fallback candidate and record in commit body: `<originalHook>: <reason for skip> → migrated <replacement>` instead.

- [ ] **Step 9: Client build + lint**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint 2>&1 | tail -5
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run build 2>&1 | tail -5
```

Expected: both clean.

- [ ] **Step 10: Manual smoke — representative sampling**

Since 8 hooks share the same wrapper, smoke 2-3 representative ones:

1. **`useCreateNote` success path** — via `npm run dev`, open Notes, create a new note. Verify no error toast fires, note appears in list.
2. **`useCreateNote` error path** — force an error: open DevTools, block the request URL (e.g., DevTools → Network → right-click → Block request URL) OR temporarily invalidate the payload. Verify error toast appears with format `"Save failed — <server message>"`.
3. **`useSubmitReview` — the load-bearing one** — start a review of a solution, submit a confidence rating. Happy path: no error toast, next review card loads. Error path: force a duplicate submit (or block URL temporarily) and verify a toast surfaces — DO NOT let the migration silently swallow errors.
4. **Optional: `useSubmitSolution`** — submit a valid solution on a problem, verify success; block URL, verify error toast surfaces.

- [ ] **Step 11: Commit Item 3**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add client/src/hooks/useSolutions.js client/src/hooks/useNotes.js client/src/hooks/useProblems.js client/src/hooks/useNoteFolders.js && git commit -m "$(cat <<'EOF'
Adopt useToastingMutation on 8 high-traffic hooks

Migrated: useSubmitSolution, useSubmitReview, useCreateNote, useUpdateNote,
useDeleteNotePermanent, useCreateProblem, useUpdateProblem, useCreateNoteFolder.

Smoke: useCreateNote (happy + forced-error), useSubmitReview (SM-2 write path,
verified 409 error still surfaces as toast — PO F3 protection).

Divergences: [record any hooks that couldn't migrate cleanly here]
EOF
)"
```

If ANY hook needed to be swapped out, list it in the Divergences section.

---

## Task 4: Final gates + FF-merge + roadmap

**Files:** `docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md`

- [ ] **Step 1: Full pre-push gate** (sequential):

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm test 2>&1 | grep -E "^ *Tests +" | tail -3
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/server && npx prisma migrate status
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run lint
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm audit --audit-level=high
cd /Users/surajsingh/Downloads/Projects/problem-solver/client && npm run build
```

Expected: server tests 1475 passing (unchanged), all lint clean, migrate status up to date, client build clean, 0 vulns.

- [ ] **Step 2: Verify smoke evidence is captured in ALL 3 commit bodies (PO F3)**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git log feat/frontend-foundation-hardening --format='%s%n%b%n---' -3
```

Each of the 3 item commits MUST include a "Smoke: ..." line. If any is missing, `git commit --amend` before pushing.

- [ ] **Step 3: Push feature branch**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push -u origin feat/frontend-foundation-hardening
```

DO NOT use `--no-verify`.

- [ ] **Step 4: FF-merge to main**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git checkout main && git pull --ff-only origin main && git merge --ff-only feat/frontend-foundation-hardening && git push origin main
```

- [ ] **Step 5: Update roadmap**

Find the Sprint 9 row:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && grep -n "^| 9 " docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md
```

Replace with (match file's actual column format):
```markdown
| 9 | Frontend foundation hardening pass (CodeEditor CSS-var migration — 24 chrome-drift hex values → CSS var reads + MutationObserver-driven theme toggle; window.confirm() → useConfirm at 5 sites — NotesSidebar/ReviewQueue/NotesList/NoteDetail×2; useToastingMutation adoption on 8 high-traffic hooks; foundation confirmed already-strong on 65+ tokens + 18 primitives + Phase 3.2 motion/a11y ship; 4-role panel reviewed pre-implementation with 3 BLOCKER fold-ins — monacoRef needed, tone→danger API mismatch, errorPrefix not errorToast) | ✅ shipped | [`2026-07-03-sprint-9-frontend-foundation-hardening-design.md`](../specs/2026-07-03-sprint-9-frontend-foundation-hardening-design.md) | 2026-07-03 |
```

- [ ] **Step 6: Commit + push roadmap**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git add docs/superpowers/roadmaps/2026-06-20-refactor-redesign-sprint.md && git commit -m "Mark Sprint 9 (frontend foundation hardening) shipped"
cd /Users/surajsingh/Downloads/Projects/problem-solver && git push origin main
```

- [ ] **Step 7: Verification**

```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver && git log --oneline -10
cd /Users/surajsingh/Downloads/Projects/problem-solver && git rev-parse HEAD && git rev-parse origin/main
```

Verify local HEAD == origin/main.

---

## Self-review (writing-plans skill)

### Spec coverage

- ✅ Item 1 (CodeEditor CSS-var migration) — Task 1 Steps 1-10; includes ref add, buildTheme factory, applyThemes helper, handleMount extension, effect with debounce
- ✅ Item 2 (window.confirm migration, 5 sites) — Task 2 Steps 1-9; uses `danger: boolean` per API
- ✅ Item 3 (useToastingMutation adoption, 8 hooks) — Task 3 Steps 1-11; uses `errorPrefix`
- ✅ All 3 BLOCKER fold-ins applied (monacoRef, danger, errorPrefix)
- ✅ All 6 candidate hooks BA-verified (corrected list in File map + Step 5-8)
- ✅ PO F3 emphasis on `useSubmitReview` smoke (Task 3 Step 4 + Task 3 Step 10)
- ✅ Roadmap update → Task 4 Step 5

### Placeholder scan

No "TBD" / "implement later". Every step includes complete text or explicit "verify against source" markers pointing to file:line.

### Type consistency

- Every prop name matches the actual API: `danger` (not `tone`), `errorPrefix` (not `errorToast`), `!contains("light")` (not `force-dark-theme`).
- Task 3 explicitly verifies wrapper shape at Step 1 before migrations — protects against future wrapper drift.
- Task 0 Step 3 baselines the same three APIs before any code — early fail if fold-ins were wrong.

### Adversarial check

- **No client test runner** — biggest risk factor, explicitly acknowledged. Mitigations: (a) 3 independent commits with per-commit smoke, (b) smoke evidence required in commit bodies (verified in Task 4 Step 2), (c) `useSubmitReview` smoke explicitly probes 409/retry semantics.
- **Silent-drop danger with `tone` string** — Task 2 uses `danger: boolean` exclusively; the "warning" tone site (ReviewQueue) is explicitly `danger: false` renders neutral.
- **`errorPrefix` concat bloating toasts** — Task 3 uses short verb-based prefixes to avoid `"Failed to create note — <server msg>"` verbosity.
- **Monaco first-paint before ref set** — Task 1 Step 5 explicitly calls `applyThemes(monaco)` from `handleMount` so the effect isn't relied upon for initial paint.
- **CSS-var injection primitive** — `toMonacoHex` regex-validates + falls back on non-hex forms.

---

## Done criteria

- Item 1 (CodeEditor CSS-var migration) shipped in a single commit with smoke evidence in commit body
- Item 2 (`window.confirm()` → `useConfirm` at 5 sites) shipped in a single commit with smoke evidence
- Item 3 (`useToastingMutation` adoption on 8 hooks, or fewer with divergences recorded) shipped in a single commit with smoke evidence including `useSubmitReview` 409-surfacing verification
- `npm run lint` (server + client) exit 0
- `npm run build` (client) exit 0
- `npm audit --audit-level=high` (both) exit 0
- `npx prisma migrate status` up to date
- Server suite still 1475 (untouched)
- Feature branch FF-merged to main; both pushed
- Roadmap Sprint 9 → ✅ shipped 2026-07-03
- 4-role panel review completed pre-implementation; all 3 BLOCKER fold-ins applied in spec v2 (`29ebb1f`)
