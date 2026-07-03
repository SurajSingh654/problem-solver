# Sprint 9 — Frontend Foundation Hardening — Design Spec

**Date:** 2026-07-03
**Sprint:** 9 (final sprint of the audit-closure campaign; opens the frontend page-by-page phase per roadmap row 10+)
**Branch:** `feat/frontend-foundation-hardening`
**Layers on:** main, post Sprint 8c (`513a3ce`)
**Feature flag:** None — pure hardening, no user-facing feature toggle
**Review history (spec v2):** 4-role panel completed pre-implementation. All 4 reviewers returned; 3 BLOCKERS + several real-gap findings folded in.
- **PO** — APPROVED_WITH_NOTES → no-test-runner risk under-rated; smoke evidence must precede push; defensive check on hex composition
- **BA** — CHANGES_REQUESTED → hex count is 24 not 15+; `useToastingMutation` prop is `errorPrefix` not `errorToast` (concatenates as `${errorPrefix} — ${serverMsg}`); 3 of 8 candidate hooks don't exist
- **Security Manager** — APPROVED_WITH_NOTES → `tone` prop silently dropped (modal uses `danger: boolean`); regex-validate CSS-var value in `toMonacoHex`; code comment on `Toast.jsx` against unsafe-HTML fields
- **Lead Engineer** — CHANGES_REQUESTED → `monacoRef.current` doesn't exist in current CodeEditor (must add `useRef` + assign in `handleMount` + initial-apply from `handleMount`); theme-detection wrong (actual `useUIStore.js:31-36` toggles only `dark`/`light`; correct check is `!contains("light")`)

**Spec v2 changes (all fold-ins):**
1. **Lead Eng F1 (BLOCKER):** Item 1 now requires adding `const monacoRef = useRef(null)` and assigning in `handleMount`; `applyThemes` fires from BOTH `handleMount` (initial paint) AND the observer callback (theme toggles). Effect cannot run before Monaco lazy-loads, so first paint depends on `handleMount`.
2. **Lead Eng F7 (BLOCKER):** Theme detection uses `!document.documentElement.classList.contains("light")` — matches the actual `useUIStore.js:31-36` toggle semantics.
3. **Lead Eng F2 / Security F1 (BLOCKER):** Item 2 migration uses `danger: true` (4 delete sites) / `danger: false` (ReviewQueue close-and-discard renders neutral border, acceptable trade-off). No `tone` string.
4. **Lead Eng F3 / BA F5 (BLOCKER):** Item 3 migration uses `errorPrefix` not `errorToast`. Migrated copy accounts for the wrapper's `${errorPrefix} — ${serverMsg}` concatenation format (short verb-based prefixes, not full sentences).
5. **BA F6 (BLOCKER):** Candidate hook list corrected. Actual hooks: `useSubmitSolution`, `useSubmitReview`, `useCreateNote`, `useUpdateNote`, `useDeleteNotePermanent`, `useCreateProblem`, `useUpdateProblem`, `useCreateNoteFolder` (or `useUpdateNoteFolder` / `useDeleteNoteFolder` as fallbacks). Dropped: `useRateSolutionClarity` (dormant per CLAUDE.md), `useSwitchTeam` (doesn't exist).
6. **BA F3 (nit):** Hex count corrected to 24 chrome-drift values (dark `colors{}` = 15, light `colors{}` = 9), plus 12 additional syntax-rule hex values NOT migrated (deliberate identity colors).
7. **Security F3 + PO F5 (nit):** `toMonacoHex` validates via `/^#?[0-9a-fA-F]{3,8}$/` and expands 3-digit shorthand to 6-digit before use.
8. **Lead Eng F6 (nit):** Observer callback uses `queueMicrotask` debounce so `remove("dark") + add("light")` in `useUIStore.js:32-36` does not fire `applyThemes` twice per toggle.
9. **Security F4 (nit):** Code comment added to `Toast.jsx` (documentation only; no code path change) documenting the "never introduce raw-HTML props here — server error messages flow through" invariant.
10. **PO F3 (nit):** Done criteria and Task 4 gates now require smoke evidence captured in commit body BEFORE the FF-merge push. `useSubmitReview` smoke explicitly verifies 409/retry semantics survive the wrapper migration.

---

## Problem

The audit-closure campaign has been backend-focused (Sprints 2-8c). The queued "Sprint 9 — frontend foundation (design system + dead code)" item assumed the frontend needed a tokens-and-primitives layer built from scratch. **Exploration disproved that assumption:**

- Design tokens are **already formal**: 65+ named values in `src/styles/index.css` (5-tier surfaces, 4-way status semantics, brand palette, motion, shadows, z-index), all mirrored between `.force-dark-theme` and `.force-light-theme` scopes with WCAG contrast annotated inline. `tailwind.config.js` extends them cleanly.
- **18 UI primitives** exist in canonical `src/components/ui/`, all PascalCase, all imported and used.
- **Zero dead code** detected in `ui/`; zero naming violations.
- **Motion + a11y foundation** (Skeleton, ErrorBoundary, MotionConfig, ConfirmProvider, useConfirm, useToastingMutation) all shipped in Phase 3.2.
- **Phase 3.3/3.4 punchlist items are largely shipped:** ReportPage progressive-load skeleton (L1672-1684), Dashboard "Submit your first solution" CTA (L654), MockInterview WS-disconnect banner (L1136), styled ConfirmModal + hook — all live.

Three drift/adoption gaps remain measurable in current source:

| Gap | Evidence |
|---|---|
| **CodeEditor CSS-var drift** | `client/src/components/ui/CodeEditor.jsx:58-73` (dark) + `:86-95` (light) — 15+ hardcoded hex values duplicating theme surfaces, borders, selection, cursor. Editor chrome will not follow token adjustments without manual edit. |
| **`window.confirm()` migration incomplete** | `ConfirmProvider` shipped in Phase 3.2 + is mounted at `App.jsx:163`. `useConfirm` hook exists at `hooks/useConfirm.js`. But 5 call sites still use native `window.confirm()`: `NotesSidebar.jsx:74`, `ReviewQueuePage.jsx:460`, `NotesListPage.jsx:288`, `NoteDetailPage.jsx:183`, `NoteDetailPage.jsx:213`. |
| **`useToastingMutation` adoption at 1-3%** | `hooks/useToastingMutation.js` shipped in Phase 3.2 but only ~1-3 call sites use it out of 109 `useMutation` invocations across `hooks/`, `pages/`, `components/`. Every unmigrated hook that toasts on error re-implements the same boilerplate. |

**Failure model these hardenings guard:**
- CodeEditor drift → future token adjustments won't propagate; two sources of truth for "surface color."
- `window.confirm()` sites → inconsistent modal UX (native browser chrome vs. styled), no focus-trap, no keyboard-nav consistency, no test hook for future E2E.
- Missing `useToastingMutation` adoption → error-toast copy inconsistency across 108 sites, easy to drift a translation/copy update, high maintenance surface.

---

## Principle

**Tight 3-item hardening pass, single-branch, manual-smoke validated.** No test-runner exists for the client workspace (per `CLAUDE.md`); validation is `npm run lint` (`--max-warnings 0`) + `npm run build` (production build must succeed) + manual `npm run dev` smoke of each touched surface. This bounds scope — the sprint deliberately skips AIReviewCard (1,113 LOC) and ReportPage (2,008 LOC) decomposition because 1000+ LOC refactors with only manual smoke as safety net are unsafe.

---

## Scope

### In scope

**Item 1 — CodeEditor CSS-var migration.** Refactor `CodeEditor.jsx` so Monaco theme colors are derived from `src/styles/index.css` custom properties at runtime, not hardcoded. Handle theme toggle (dark ↔ light) via a `MutationObserver` on `document.documentElement.class`.

**Item 2 — `window.confirm()` migration.** Replace 5 call sites with `useConfirm()` from `hooks/useConfirm.js`. Match `tone` (`danger` vs `warning`) to intent. Verify each call site's handler is `async`-compatible (or convert if not).

**Item 3 — `useToastingMutation` adoption on 8 high-traffic hooks.** Migrate the 8 hooks that already re-implement `onError → toast` boilerplate. Recorded exclusions (hooks whose semantics don't cleanly fit the wrapper) go into commit body.

### Out of scope (carved)

- **AIReviewCard.jsx extraction** (1,113 LOC) — requires a dedicated sprint with a rendering-test harness; deferred.
- **ReportPage.jsx decomposition** (2,008 LOC) — progressive-load shipped in Phase 3.3; decomposition is aesthetic, not correctness-driven. Deferred.
- **Migration of the remaining ~100 `useMutation` sites** — Sprint 9 proves the pattern on 8; residual migration is Sprint 10+ per-page work.
- **Client test-runner setup** (Vitest + RTL) — user explicitly de-prioritized this option; noted for a future sprint.
- **New primitives** — 18 exist and cover the current surface; no addition needed.

---

## Architecture

```
client/src/
├── App.jsx                                          [READ-ONLY — ConfirmProvider already mounted at L163]
├── components/
│   └── ui/
│       ├── CodeEditor.jsx                           [MODIFY — Item 1]
│       └── ConfirmModal.jsx                         [READ-ONLY]
├── hooks/
│   ├── useConfirm.js                                [READ-ONLY]
│   ├── useToastingMutation.js                       [READ-ONLY]
│   └── use<*>.js                                    [MODIFY — 8 hooks in Item 3]
├── components/notes/NotesSidebar.jsx                [MODIFY — Item 2 (1 site)]
├── pages/
│   ├── ReviewQueuePage.jsx                          [MODIFY — Item 2 (1 site)]
│   └── notes/
│       ├── NotesListPage.jsx                        [MODIFY — Item 2 (1 site)]
│       └── NoteDetailPage.jsx                       [MODIFY — Item 2 (2 sites)]
└── styles/index.css                                 [READ-ONLY — canonical source of truth for tokens]
```

**Unchanged:**
- All backend code
- `tailwind.config.js`
- `App.jsx` (ConfirmProvider already mounted)
- All other client components
- All server tests (backend not touched)

---

## Item 1 — CodeEditor CSS-var migration

### Current state

`client/src/components/ui/CodeEditor.jsx:44-98` defines two Monaco themes via `monaco.editor.defineTheme("probsolver-dark", ...)` and `"probsolver-light"`. **24 chrome-drift hex values** (dark `colors{}` L58-72 = 15; light `colors{}` L87-95 = 9) for background, foreground, line highlight, selection, cursor, indent guide, scrollbar, bracket match. The `rules[]` arrays (L50-55, L79-84) contain 12 additional hex values for token-syntax colors (`comment`, `keyword`, `string`) — those are deliberate identity colors and are NOT migrated in Sprint 9.

**Handler shape (BA-verified):** `handleMount(editor, monaco)` at L125 receives the `monaco` instance but does NOT store it in a ref. Any effect that needs `monaco` post-mount must first introduce that ref.

### Design

Monaco's `defineTheme` API accepts hex strings (`#rrggbb` or `#rrggbbaa`) — not CSS classes. So we cannot eliminate hex values entirely. What we CAN do is source them from computed CSS custom-property values at theme-definition time:

```js
// New helper (co-located in CodeEditor.jsx)
function readCssVar(name, fallback) {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

// Convert a CSS-var value to a Monaco-compatible 6-digit hex.
// - Rejects malformed values (only 3/4/6/8 hex digits accepted, optionally prefixed)
// - Expands 3-digit shorthand (#abc → #aabbcc) so downstream alpha concat is safe
// - Falls back on any non-hex form (rgb(), hsl(), color(), keyword) — protects
//   against CSS-var injection primitives (Security F3) and legacy shorthand.
function toMonacoHex(value, fallback) {
  const raw = (value || "").trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(raw)) {
    return fallback;
  }
  // Expand 3-digit shorthand.
  if (raw.length === 3) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
  }
  return `#${raw}`;
}

function buildTheme(mode) {
  // mode === "dark" or "light" — decides which var namespace we pull.
  // CSS vars are defined identically in .force-dark-theme and .force-light-theme
  // scopes in src/styles/index.css, and getComputedStyle honors the current
  // scope automatically — so we don't need to branch on mode for the reads,
  // only for base ("vs-dark" vs "vs") and any syntax rules that differ.
  return {
    base: mode === "dark" ? "vs-dark" : "vs",
    inherit: true,
    rules: [
      // Token syntax colors are deliberate identity choices, not tokens.
      // Kept as fixed hex per current design.
      { token: "comment", foreground: mode === "dark" ? "55556e" : "6b6b8a", fontStyle: "italic" },
      { token: "keyword", foreground: mode === "dark" ? "9d93f9" : "6358d4" },
      { token: "string", foreground: mode === "dark" ? "22c55e" : "16a34a" },
      { token: "number", foreground: mode === "dark" ? "eab308" : "ca8a04" },
      { token: "type", foreground: mode === "dark" ? "3b82f6" : "2563eb" },
      { token: "function", foreground: mode === "dark" ? "60a5fa" : "3b82f6" },
    ],
    colors: {
      // These read from CSS vars — the primary drift-elimination win.
      "editor.background": toMonacoHex(readCssVar("--surface-0"), mode === "dark" ? "#111118" : "#f0f0f5"),
      "editor.foreground": toMonacoHex(readCssVar("--fg-primary"), mode === "dark" ? "#eeeef5" : "#0f0f1a"),
      "editor.lineHighlightBackground": toMonacoHex(readCssVar("--surface-1"), mode === "dark" ? "#18181f" : "#e8e8f0"),
      "editorLineNumber.foreground": toMonacoHex(readCssVar("--fg-tertiary"), mode === "dark" ? "#35354a" : "#9999b0"),
      "editorLineNumber.activeForeground": toMonacoHex(readCssVar("--fg-secondary"), mode === "dark" ? "#55556e" : "#6b6b8a"),
      "editorCursor.foreground": toMonacoHex(readCssVar("--brand-500"), "#7c6ff7"),
      "editorIndentGuide.background": toMonacoHex(readCssVar("--surface-2"), mode === "dark" ? "#202028" : "#dddde8"),
      "editorIndentGuide.activeBackground": toMonacoHex(readCssVar("--surface-3"), mode === "dark" ? "#282832" : "#c9c9d4"),

      // Alpha-suffixed values — CSS vars don't include alpha, so we compose
      // the base color from the var + append the alpha suffix from the design.
      // (Or keep as identity colors — they're brand-500 + alpha; low drift risk.)
      "editor.selectionBackground": `${toMonacoHex(readCssVar("--brand-500"), "#7c6ff7")}30`,
      "editor.inactiveSelectionBackground": `${toMonacoHex(readCssVar("--brand-500"), "#7c6ff7")}15`,
      "editor.selectionHighlightBackground": `${toMonacoHex(readCssVar("--brand-500"), "#7c6ff7")}20`,
      "editorBracketMatch.background": `${toMonacoHex(readCssVar("--brand-500"), "#7c6ff7")}25`,
      "editorBracketMatch.border": `${toMonacoHex(readCssVar("--brand-500"), "#7c6ff7")}50`,
      "scrollbarSlider.background": `${toMonacoHex(readCssVar("--surface-3"), mode === "dark" ? "#282832" : "#dddde8")}40`,
      "scrollbarSlider.hoverBackground": `${toMonacoHex(readCssVar("--surface-3"), mode === "dark" ? "#282832" : "#dddde8")}80`,
    },
  };
}
```

### Theme change reactivity

The current file at L120 reads `document.documentElement.classList` synchronously in the component body to determine `isDark`. That's a hack that fires once at mount; if the user toggles theme afterward, the editor keeps its stale theme.

**Lead Eng F1 (BLOCKER):** current file does NOT have a `monacoRef`. `handleMount(editor, monaco)` at L125 receives the `monaco` instance but never stores it. Sprint 9 must introduce the ref.

**Lead Eng F7 (BLOCKER):** `useUIStore.js:31-36` toggles `dark` / `light` classes only — never `force-dark-theme`. Correct detection is `!document.documentElement.classList.contains("light")` (matches the existing L120 check pattern).

**Fix pattern:**

```js
// New: add ref at component top
const monacoRef = useRef(null);
const themeAppliedRef = useRef(false);

// Existing handleMount extended:
function handleMount(editor, monaco) {
  monacoRef.current = monaco;
  applyThemes(monaco); // initial paint — must run here because effect fires
                       // BEFORE Monaco lazy-loads; ref is null in effect body
                       // on first mount.
  themeAppliedRef.current = true;
  // ...existing handleMount body if any
}

// Helper (module-level or component-scoped):
function applyThemes(monaco) {
  const isDark = !document.documentElement.classList.contains("light");
  monaco.editor.defineTheme("probsolver-dark", buildTheme("dark"));
  monaco.editor.defineTheme("probsolver-light", buildTheme("light"));
  monaco.editor.setTheme(isDark ? "probsolver-dark" : "probsolver-light");
}

// New effect — watches theme class toggle
useEffect(() => {
  // Debounce with queueMicrotask so `remove("dark") + add("light")` in
  // useUIStore.js:32-36 batches into one applyThemes call, not two
  // (Lead Eng F6).
  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      if (monacoRef.current) applyThemes(monacoRef.current);
    });
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}, []);
```

**Why apply from `handleMount` AND effect:** the effect mounts before Monaco lazy-loads, so `monacoRef.current` is null on first fire; observer-only initialization would leave the editor with default `probsolver-dark` / `probsolver-light` themes on first paint (which don't exist unless `handleMount` defines them). Applying from `handleMount` ensures the themes exist at first paint. The effect's role is only reactivity to future class-toggle mutations.

### Risk

- **Perf under rapid theme toggle:** `defineTheme` + `setTheme` on every class mutation is fine for user-driven toggles (once every few seconds max); a hypothetical scripted toggler could thrash. Not a realistic concern.
- **`getComputedStyle` timing:** if the effect fires before CSS is applied, values return empty and fall back to hardcoded defaults. Fallback ensures no visual regression.
- **Firefox / Safari:** `MutationObserver` + `getComputedStyle` are stable cross-browser (IE-era APIs). No concern.

### Files touched

- `client/src/components/ui/CodeEditor.jsx` — refactor `defineTheme` into `buildTheme(mode)` helper + add effect + `readCssVar`/`toMonacoHex` utilities. Estimated delta: −40 / +80 lines (net +40; two theme blocks collapse into one factory + effect).

### Manual smoke

- `npm run dev`, open any page that renders `CodeEditor` (Problem Detail, Solution submit).
- Toggle theme (via existing theme switcher in Topbar/Settings) — verify editor colors change without page reload.
- Inspect editor background — should match `--surface-0` value in DevTools.
- Confirm token syntax colors (comment/keyword/string) are still visible + readable in both themes.

---

## Item 2 — `window.confirm()` migration

### Sites

| # | File:line | Current copy | Tone |
|---|---|---|---|
| 1 | `client/src/components/notes/NotesSidebar.jsx:74` | Note deletion | `danger` |
| 2 | `client/src/pages/ReviewQueuePage.jsx:460` | Close review, discard typed recall | `warning` |
| 3 | `client/src/pages/notes/NotesListPage.jsx:288` | Note deletion (list view) | `danger` |
| 4 | `client/src/pages/notes/NoteDetailPage.jsx:183` | Note deletion (detail view) | `danger` |
| 5 | `client/src/pages/notes/NoteDetailPage.jsx:213` | Note permanent-delete (harder confirm) | `danger` |

### Design

**Lead Eng F2 / Security F1 (BLOCKER):** `ConfirmModal.jsx:41-50` destructures the options as `{ title, description, confirmLabel, cancelLabel, danger }` — a boolean `danger`, NOT a string `tone`. Spec's original `tone: "danger"` shape would be silently dropped (spread into `...rest`). Correct migration uses `danger: true | false`.

Uniform migration shape per site:

```jsx
// New imports
import { useConfirm } from "@hooks/useConfirm";

function ComponentName() {
  const confirm = useConfirm();

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete this note?",
      description: "This can be undone within 30 days from Trash.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      danger: true,  // renders red confirm button + danger-tone border
    });
    if (!ok) return;

    // ... existing delete logic
  };
}
```

**Per-site `danger` value:**

| # | Site | `danger` |
|---|---|---|
| 1 | NotesSidebar delete | `true` |
| 2 | ReviewQueue close-and-discard | `false` (renders neutral border — best-fit with current `danger:boolean` API; adding a `warning` variant would be scope expansion) |
| 3 | NotesList delete | `true` |
| 4 | NoteDetail delete | `true` |
| 5 | NoteDetail permanent-delete | `true` |

**Handler async-ness (Lead Eng F8 confirmed):** all 5 handlers are trivially convertible:
- `NotesSidebar.jsx:73-81` `confirmDelete(node)` — currently sync; convert to `async`
- `ReviewQueuePage.jsx:459-465` — inline `onClick={() => {...}}`; convert to `async () => {...}`
- `NotesListPage.jsx:285-293` `onDelete(e)` — currently sync; `stop(e)` calls `e.stopPropagation() / preventDefault()` BEFORE the `await` (React 17+ event pooling gone, so this is safe as-ordered)
- `NoteDetailPage.jsx:181-192, 211-223` — already `async` arrow handlers; just add `await`

**Copy consistency:** each modal gets 4 props (`title`, `description`, `confirmLabel`, `danger`). Copy should match or upgrade the current native-confirm string — never regress information density.

**Security F2 (documentation-only):** `title` and `description` props are rendered as JSX text children by React (auto-escaped). Do NOT refactor to raw-HTML-injecting props to allow bolding note names, etc. — that opens an XSS sink for user-controlled `note.title` values.

### Files touched

- `client/src/components/notes/NotesSidebar.jsx` — 1 site, ~10 lines delta
- `client/src/pages/ReviewQueuePage.jsx` — 1 site, ~10 lines delta
- `client/src/pages/notes/NotesListPage.jsx` — 1 site, ~10 lines delta
- `client/src/pages/notes/NoteDetailPage.jsx` — 2 sites, ~20 lines delta

Total delta: ~50 lines across 4 files.

### Risk

- **ConfirmProvider mount verified** — App.jsx:163 already wraps the app tree with `<ConfirmProvider>`. All 5 sites are inside routes that render under `AppShell`, which is inside `ConfirmProvider`. No provider mount needed.
- **`useConfirm` fallback** — hook logs a dev-warn + falls back to `window.confirm` if no provider is in tree. That's belt-and-suspenders; not relied upon here.
- **Test coverage:** none (no test runner). Manual smoke per site: trigger delete, verify modal appears with correct copy + tone styling, cancel + confirm both work.

### Manual smoke

`npm run dev`:
1. NotesSidebar delete — right-click a note in the sidebar → confirm modal → danger tone → deletes on confirm.
2. ReviewQueue close-during-review — start a review, type recall, hit Close → warning modal → discards on confirm.
3. NotesList delete — from `/notes` list, delete a note → danger modal → deletes.
4. NoteDetail delete — from note detail view, hit Delete → danger modal.
5. NoteDetail permanent-delete — for trashed notes, hit Delete Permanently → danger modal with stronger copy.

---

## Item 3 — `useToastingMutation` adoption on 8 high-traffic hooks

### Candidate list (BA-verified against actual hook files)

**BA F6 (BLOCKER):** 3 of 8 original candidates don't exist in `client/src/hooks/`:
- `useRateSolutionClarity` — real name is `useRateSolution` (`useSolutions.js:125`), documented as **dormant** in CLAUDE.md (peer-rating UI deferred). Excluded.
- `useDeleteNote` — real name is `useDeleteNotePermanent` (`useNotes.js:74`). Renamed in list below.
- `useSwitchTeam` — does NOT exist under `client/src/hooks/`. Grep returns zero hits. Excluded.

Corrected list (8 hooks, all verified to exist):

| # | Hook | File:line | Trigger |
|---|---|---|---|
| 1 | `useSubmitSolution` | `useSolutions.js:59` | Problem Detail: submit code |
| 2 | `useSubmitReview` | `useSolutions.js:102` | Review Queue: submit spaced-repetition confidence |
| 3 | `useCreateNote` | `useNotes.js:38` | Notes: new note |
| 4 | `useUpdateNote` | `useNotes.js:50` | Notes: save edit |
| 5 | `useDeleteNotePermanent` | `useNotes.js:74` | Notes: permanent delete |
| 6 | `useCreateProblem` | `useProblems.js:38` | Admin: create problem |
| 7 | `useUpdateProblem` | (verify path during impl) | Admin: update problem |
| 8 | `useCreateNoteFolder` | (`useNoteFolders.js`, verify) | Notes: new folder |

**During implementation, each hook will be inspected for:**
- (a) does it already re-implement `onError → toast` boilerplate?
- (b) does its API surface fit `useToastingMutation`'s options cleanly?
- (c) is it currently using `useToastingMutation` (skip if yes)?

If (a) is false or (b) is false for any candidate, swap for `useUpdateNoteFolder` / `useDeleteNoteFolder` and record divergence in commit body.

**PO F3 emphasis:** `useSubmitReview` is prod-critical (SM-2 write path with interactive-transaction wrapper on server). Its migration must preserve 409/retry error semantics — smoke MUST verify a conflict response still surfaces to the user via toast (not swallowed).

### Migration shape

**Lead Eng F3 / BA F5 (BLOCKER):** actual wrapper prop is `errorPrefix` (not `errorToast`), and it CONCATENATES rather than falls back — `${errorPrefix} — ${serverMsg}`. Migrated copy must use short verb-based prefixes (e.g., `"Save failed"`), not full sentences, otherwise toasts become verbose like `"Failed to create note — Team is full"`.

```js
// Before
export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.notes.create(payload),
    onError: (err) => {
      toast.error(extractErrorMessage(err) || "Failed to create note");
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["notes"] });
      // ...any existing success logic
    },
  });
}

// After
export function useCreateNote() {
  const qc = useQueryClient();
  return useToastingMutation({
    mutationFn: (payload) => api.notes.create(payload),
    errorPrefix: "Save failed",  // concatenated as "Save failed — <serverMsg>"
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}
```

**Per-hook errorPrefix strings (short, verb-based):**

| # | Hook | `errorPrefix` |
|---|---|---|
| 1 | `useSubmitSolution` | `"Submit failed"` |
| 2 | `useSubmitReview` | `"Review submit failed"` |
| 3 | `useCreateNote` | `"Save failed"` |
| 4 | `useUpdateNote` | `"Update failed"` |
| 5 | `useDeleteNotePermanent` | `"Delete failed"` |
| 6 | `useCreateProblem` | `"Create failed"` |
| 7 | `useUpdateProblem` | `"Update failed"` |
| 8 | `useCreateNoteFolder` | `"Folder create failed"` |

**What `useToastingMutation` handles (per wrapper source at `useToastingMutation.js:35-76`):**
- On error: `toast.error(\`${errorPrefix} — ${extractErrorMessage(err)}\`)` (concat, not fallback)
- On success: shows `successMessage` toast if provided
- Special-cases network errors and 409 conflicts (verify against wrapper source during implementation)
- Preserves the full `useMutation` return shape so call sites don't need to change

**What stays in each hook after migration:**
- The `mutationFn`
- Any `onSuccess` that does more than toast (invalidation, redirect, etc.)
- Any custom retry logic (skip migration if present)
- Query key definitions

### Files touched

Each of the 8 hooks lives in `client/src/hooks/`. Expected delta per file: 5-15 lines (removal of `onError` boilerplate, addition of `errorToast` prop).

**Recorded exclusions:** if a candidate turns out unfit (custom retry, non-toast error handling, already migrated), swap in one of these fallbacks and note in commit:
- `useCreateFlashcard` / `useUpdateFlashcard` / `useDeleteFlashcard`
- `useSaveDesignSession`
- `useAssignProblem`

### Risk

- **`useToastingMutation` API drift** — if the wrapper's props signature doesn't match assumption (e.g., prop is `errorMessage` not `errorToast`), adapt to actual API. Verify by reading `useToastingMutation.js` before writing migrations.
- **Silent behavior regression** — a hook that had a custom `onError` doing more than toasting (e.g., navigation, state reset) would lose that logic if migrated blindly. Read each hook fully before migrating. Migrate only when `onError` is toast-only.
- **Toast styling divergence** — the wrapper's toast style should match the current site-by-site style. Manual smoke on 2-3 hooks confirms visual parity.

### Manual smoke

Per hook — trigger the mutation with a forced error (e.g., temporarily disable server or use invalid payload), verify:
- Error toast appears
- Toast copy matches the `errorToast` prop
- Success path: trigger with valid payload, verify no error toast + expected side effects

Smoking 2-3 hooks representatively is sufficient (they share the wrapper — either the wrapper works for all or none).

---

## Order + branch discipline

**Single feature branch:** `feat/frontend-foundation-hardening`.
**Three commits, one per item:**
1. `Migrate CodeEditor theme to CSS custom properties`
2. `Replace window.confirm() with useConfirm at 5 sites`
3. `Adopt useToastingMutation on 8 high-traffic hooks`

Each commit is independently revertable. Smoke passes between commits. If item N breaks something, N+1 doesn't start.

**Standing rules:**
- Single-line commit subject
- NO Co-Authored-By trailer
- Divergences captured in commit body

---

## Test count target

- Server suite unchanged at **1475** (Sprint 9 is client-only; no server tests added or affected).
- Client has no test runner; no test count exists.

---

## Done criteria

- Item 1 done: CodeEditor.jsx reads CSS vars for editor chrome; theme toggle propagates without reload
- Item 2 done: 5 `window.confirm()` call sites migrated to `useConfirm`
- Item 3 done: 8 hooks migrated to `useToastingMutation` (or fewer if exclusions recorded)
- `npm run lint` (server + client) exit 0 with `--max-warnings 0`
- `npm run build` (client) exit 0
- `npm audit --audit-level=high` (both workspaces) exit 0
- `npx prisma migrate status` up to date
- Server suite still passing at 1475
- Manual smoke completed for each item (documented in commit body or plan checklist)
- Feature branch FF-merged to main; both pushed
- Roadmap Sprint 9 → ✅ shipped 2026-07-03
- 4-role panel review completed pre-implementation; CHANGES_REQUESTED fold-ins applied

---

## Production risk inventory

| Dimension | Status |
|---|---|
| Schema migration | None |
| Backend behavior change | None — client-only sprint |
| Client behavior change | Item 1: editor chrome now theme-aware (visual improvement, no functional change). Item 2: modals replace native confirm (visual improvement, same yes/no outcome). Item 3: error-toast plumbing centralized (identical user-visible behavior when toasts fire). |
| Test coverage | Server: unchanged (1475 pass). Client: none exists — manual smoke is the safety net. |
| Rollback | Revert the 3 commits individually; each is independently safe to undo. |
| Risk floor | Low-medium — no test runner is the biggest single risk factor. Mitigated by tight scope + per-commit smoke + independent revertability. |

---

## Backward compatibility

Full. No API surface changes, no schema changes, no user-facing behavior changes. Confirm modals REPLACE native browser confirm dialogs — same yes/no semantics, better UX. Editor theme now follows the design system instead of drifting from it — same colors on first paint (fallbacks match current hex values exactly).

---

## Self-review

| Check | Status |
|---|---|
| Placeholders | None — 3 items specified with concrete file:line targets, code shapes, and fallback behavior |
| Internal consistency | Item ordering matches risk: Item 1 highest-risk (Monaco integration) ships first so smoke has full sprint runway; Items 2 and 3 are mechanical |
| Scope | Tight: 3 items, ~14 files, ~200 line net delta. Skips AIReviewCard (1113 LOC) and ReportPage (2008 LOC) explicitly |
| Ambiguity | Two explicit divergence policies: (a) if a `useToastingMutation` migration candidate has non-toast `onError` logic, skip it + record; (b) if `readCssVar` returns empty, fall back to current hex values (no visual regression) |
| Adversarial review | Biggest risk = no client test runner. Mitigation: independent commits per item, mandatory smoke between items, decompose sprint into 3 independently-revertable slices |
| Risk floor | Low-medium |
