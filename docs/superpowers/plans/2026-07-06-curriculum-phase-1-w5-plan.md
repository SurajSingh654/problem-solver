# Curriculum Phase 1 · Week 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Monaco-backed lab editor + auto-flipping `teachingReady` + D8 (design aptitude) adapter that maps curriculum LabAttempts into the readiness verdict.

**Architecture:** Three thin client pieces (Monaco editor, structured review renderer, Monaco DiffEditor for reference reveal) plus three server pieces (two new writer functions in `conceptMastery.service.js`, a truth-table auto-flip embedded in the existing signal writers, and a D8 adapter that pulls STRONG/ADEQUATE LabAttempts on design-category Concepts into the existing `computeDesignAptitudeStats` input). No new npm dependencies — `@monaco-editor/react ^4.7.0` is already installed. No schema changes — `ConceptMastery.teachingReady` boolean already exists.

**Tech Stack:** React, `@monaco-editor/react` (already in `client/package.json`), Prisma, existing `mentor.service.updateMastery` primitive, existing `MarkdownRenderer` component for sanitized markdown fields inside review payloads.

---

## Scope inputs

**Master plan §Week 5 ship criteria (verbatim):**

- `LabPage.jsx` with `<MonacoLabEditor>` (5s autosave, 100KB client-side cap, tab-collision policy).
- `<CodeReviewResult>` component renders structured `codeReview` JSON.
- `<ReferenceDiff>` component; reveal button gated on verdict + `nextStep`.
- Check-in flow: submit → `POST /checkin` → AI verdict shown; unlock rule ("≥1 STRONG/ADEQUATE LabAttempt") enforced client + server. **← already shipped in W4; verification only in W5.**
- `conceptMastery.service.js` implements: `recordCheckInSignal`, `recordLabSignal`, `recordTeachingSignal`, `recordPrimerReadSignal`, `setTeachingReady`.
- `mentor.service.js`: expand `VALID_SIGNAL_SOURCES` with `checkin` + `primer_read`; adjust `computeScore` weight table. **← already shipped in W4.**
- `topics.controller.js` manual `teachingReady` sets rewired through `conceptMastery.service.setTeachingReady()`. **← no manual sets exist today; W5 adds the auto-flip via truth-table.**
- D8 mapping adapter in `designAptitudeStats.js`: LOW_LEVEL_DESIGN/SYSTEM_DESIGN LabAttempts with STRONG/ADEQUATE count toward `designSessions`.
- Signal writes happen inside source-event `$transaction` (atomicity).

**Delta from what W4 shipped (surveyed 2026-07-06):**
- `mentor.service.VALID_SIGNAL_SOURCES` + `SIGNAL_WEIGHTS` already contain `checkin` (0.30) and `primer_read` (0.0). No changes needed.
- Three writers exist: `recordLabSignal`, `recordCheckInSignal`, `recordPrimerReadSignal`. W5 adds `recordTeachingSignal` + `setTeachingReady`.
- No code path anywhere writes to `ConceptMastery.teachingReady` (audited `topics.controller.js`, `teaching.controller.js`, `designStudio.controller.js`, `notes.controller.js`, `curriculum.controller.js` — every `teachingReady` reference is a `select:` clause or a JS object-literal fallback in the API response, none is a Prisma `update`/`create`/`upsert data`). W5's auto-flip is the only writer.
- `designAptitudeStats.js` currently consumes only `DesignSession` rows — no `LabAttempt` reference. W5 adds the adapter.
- `ConceptLabTab.jsx` has a `<textarea>` + a "Coming in Week 5" disabled Monaco button — W5 replaces both.

**Multi-file editor descope (approved 2026-07-06):** Master plan §2410 says "multi-file tabs" for `<MonacoLabEditor>`. Current schema stores `Lab.starterCode`, `Lab.referenceSolution`, `LabAttempt.code` as single `String` — supporting multi-file requires a Prisma migration (String → Json file-map), a matching update to the CODE_REVIEW AI prompt template (accept a file-map, not a string), and an editor tab-bar UI. Estimated at 7-8 days vs 4 days for single-file. **Descoped: W5 ships single-file. A dedicated Phase 2 roadmap entry `curriculum-lab-multi-file` is added in T8 Step 6 so the master-plan gap does not silently rot.**

**Master-plan test-file-name mapping (from master plan §2423):**
- Master plan `curriculum.checkin.signals.integration.test.js` → W5 T7a `curriculum.teachingReady-flip.integration.test.js` (same coverage: primer + STRONG + PASS → mastery signals + teachingReady). The renamed file spans the entire signal-flip flow, not just check-in.
- Master plan `curriculum.autosave-collision.integration.test.js` → deferred with the multi-file descope. Autosave is client-only localStorage; there's no server-side collision to test in W5's single-file architecture. Tracked as `curriculum-lab-multi-file` follow-up.
- Master plan `conceptMastery.service.test.js` → W5 T5 `server/test/services/conceptMastery.teachingReady-truthtable.test.js` (unit tests of the truth table + monotonicity + idempotence).

**Truth table for `teachingReady` auto-flip (server-side, called from `recordLabSignal` + `recordCheckInSignal` + `recordPrimerReadSignal`):**

| primer_read | ≥1 STRONG/ADEQUATE lab in this team | latest ConceptCheckIn aiVerdict = PASS | → teachingReady |
| :-: | :-: | :-: | :-: |
| ✗ | any | any | false |
| ✓ | ✗ | any | false |
| ✓ | ✓ | ✗ (or none) | false |
| ✓ | ✓ | ✓ | **true (monotonic — never flips back)** |

**Explicit requirements (formalized from panel review):**

- **R1 — Team-scoped signal blend.** All three preconditions must be satisfied _within the same team_. A user in Team A and Team B cannot have Team A's STRONG lab count toward Team B's truth table. Enforced by threading `teamId` through `_shouldAutoFlipTeachingReady` and every writer that calls it (see T5).
- **R2 — Monotonic once true.** Once `teachingReady = true`, the truth table never flips it back to false. A user's manual PATCH could unset it, but the system does not. Protects a learner who has already demonstrated readiness from a later WEAK re-attempt.
- **R3 — Best-effort auto-flip.** The auto-flip runs OUTSIDE the source-event `$transaction` (i.e. after the signal write has already committed). If it throws, the signal write remains persisted — the caller must not see the failure. A subsequent signal (re-attempt, new check-in) re-triggers the flip attempt. Not to be called from inside an open transaction — would deadlock on the `ConceptMastery` row lock inside `setTeachingReady`.
- **R4 — Server-side unlock rule reaffirmed.** `POST /curriculum/concepts/:slug/checkin` returns 403 `CHECKIN_LOCKED` unless the user has ≥1 STRONG or ADEQUATE LabAttempt on the concept's Lab. Already enforced in W4; W5 T7's integration test adds a negative-path assertion (submit check-in with zero completed attempts → 403).

---

## File structure

**Client:**
- Create: `client/src/components/curriculum/MonacoLabEditor.jsx` — `@monaco-editor/react` wrapper with 5s debounced autosave to localStorage + 100KB cap.
- Create: `client/src/components/curriculum/CodeReviewResult.jsx` — structured render of `codeReview` JSON. Uses existing `MarkdownRenderer` for markdown fields (`overall`, `mentalModelSignal`) so no new sanitization surface.
- Create: `client/src/components/curriculum/ReferenceDiff.jsx` — Monaco `DiffEditor` wrapper for reveal.
- Modify: `client/src/pages/learn/tabs/ConceptLabTab.jsx` — swap textarea + reference `<pre>` for the three new components.
- Modify: `client/vite.config.js` — add `manualChunks` entry `monaco: ["@monaco-editor/react", "monaco-editor"]`.

**Server:**
- Modify: `server/src/services/curriculum/conceptMastery.service.js` — add `recordTeachingSignal` (delegates to `mentor.service.updateMastery` with `source: "teaching"`) and `setTeachingReady({ userId, conceptId, reason })` (idempotent write to `teachingReady = true`). Embed truth-table auto-flip in existing `recordLabSignal` + `recordCheckInSignal` + `recordPrimerReadSignal` after each signal write.
- Create: `server/src/utils/designAptitude.curriculum.js` — pure function `mapLabAttemptsToDesignSessions({ userId, teamId })` that pulls `LabAttempt` rows joined to their `Lab → Concept → Topic` where `Topic.category ∈ {LOW_LEVEL_DESIGN, SYSTEM_DESIGN}` and `codeReviewVerdict ∈ {STRONG, ADEQUATE}`.
- Modify: `server/src/controllers/stats.controller.js` — call the adapter and merge results with existing `DesignSession` rows before passing to `computeDesignAptitudeStats`.

**Test:**
- Create: `server/test/services/conceptMastery.teachingReady-truthtable.test.js` — unit test of the 4-row truth table + monotonicity + idempotence.
- Create: `server/test/integration/curriculum.teachingReady-flip.integration.test.js` — end-to-end enroll → primer → lab STRONG → check-in PASS → GET concept detail asserts `mastery.teachingReady === true`.
- Create: `server/test/utils/designAptitude.curriculum.test.js` — adapter shape + team scoping + non-design filtering.
- Create: `server/test/integration/curriculum.d8-lab-adapter.integration.test.js` — end-to-end verifies D8 `designSessions` count reflects curriculum labs.

---

## Global rules (from master plan §"Global rules for every week")

1. **Feature flag guard** — every new render remains gated on the flag. No new routes in W5.
2. **Tenancy** — never `req.user.currentTeamId`; always `req.teamId`. D8 adapter's Postgres query MUST filter `Concept.teamId = req.teamId`.
3. **Prompt injection** — no new AI calls in W5. `<CodeReviewResult>` renders server-persisted JSON but still routes markdown fields through the existing `MarkdownRenderer` (which pipelines `marked → DOMPurify`), matching the pattern already used across the app.
4. **HTML sanitization** — reuse `MarkdownRenderer` for all markdown fields; do not introduce any raw-HTML injection sink in the new components.
5. **Transactions** — `setTeachingReady` runs inside its own `prisma.$transaction` with an upsert-then-conditional-update pattern (row lock inside the tx prevents lost double-flip). The upstream signal writers (`recordLabSignal` / `recordCheckInSignal` / `recordPrimerReadSignal`) each run their own internal `$transaction` via `mentor.service.updateMastery` and CANNOT be composed inside an outer transaction (see `conceptMastery.service.js` file header comment lines 17-24). The auto-flip therefore runs AFTER the signal-write tx commits, as a separate best-effort call — never wrapped in an outer tx.
6. **AI service** — no new AI calls.
7. **Rate limiter** — no new AI-backed routes.
8. **Tests before code** — TDD per task.
9. **Commit frequency** — every task's Step 5 is a commit.
10. **Ask before install** — no new deps.

---

## Task 1: MonacoLabEditor component + logout hook

**Files:**
- Create: `client/src/components/curriculum/MonacoLabEditor.jsx`
- Modify: `client/vite.config.js`
- Modify: `client/src/store/authStore.js` (or wherever the logout handler lives) — add `clearAllLabDrafts()` call on logout to prevent shared-workstation draft leak (Security m1).

- [ ] **Step 1: Write the component**

```jsx
// client/src/components/curriculum/MonacoLabEditor.jsx
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef } from "react";
import { useTheme } from "../../hooks/useTheme.js";

const Editor = lazy(() => import("@monaco-editor/react"));

const AUTOSAVE_DEBOUNCE_MS = 5000;
const MAX_CHARS = 100_000;
const LANG_MAP = {
  JAVA: "java",
  PYTHON: "python",
  TYPESCRIPT: "typescript",
  JAVASCRIPT: "javascript",
  GO: "go",
  CPP: "cpp",
  CSHARP: "csharp",
};

export default function MonacoLabEditor({
  labId,
  language = "JAVA",
  starterCode = "",
  value,
  onChange,
  disabled = false,
}) {
  const { theme } = useTheme();
  const autosaveKey = useMemo(() => `curriculum:lab:draft:${labId}`, [labId]);
  const debounceRef = useRef();

  const scheduleAutosave = useCallback(
    (next) => {
      if (typeof window === "undefined") return;
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        try {
          window.localStorage.setItem(autosaveKey, next);
        } catch {
          // Storage quota — silent drop, draft is not source of truth.
        }
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [autosaveKey],
  );

  const handleChange = useCallback(
    (next) => {
      const clamped = (next ?? "").slice(0, MAX_CHARS);
      onChange?.(clamped);
      scheduleAutosave(clamped);
    },
    [onChange, scheduleAutosave],
  );

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  return (
    <div className="h-[420px] rounded-md border border-surface-line overflow-hidden">
      <Suspense fallback={<div className="p-4 text-fg-soft">Loading editor…</div>}>
        <Editor
          height="420px"
          language={LANG_MAP[language] ?? "plaintext"}
          value={value ?? starterCode}
          onChange={handleChange}
          theme={theme === "dark" ? "vs-dark" : "vs"}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            readOnly: disabled,
          }}
        />
      </Suspense>
    </div>
  );
}

export function loadDraft(labId) {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(`curriculum:lab:draft:${labId}`);
  } catch {
    return null;
  }
}

export function clearDraft(labId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`curriculum:lab:draft:${labId}`);
  } catch {
    /* no-op */
  }
}

/**
 * Nuke every curriculum lab draft — called from the auth store's logout
 * handler so a shared workstation doesn't leak one user's draft to the next
 * user who opens the same lab URL.
 */
export function clearAllLabDrafts() {
  if (typeof window === "undefined") return;
  try {
    const doomed = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith("curriculum:lab:draft:")) doomed.push(key);
    }
    doomed.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* no-op */
  }
}
```

- [ ] **Step 2: Add manualChunks entry to `client/vite.config.js`**

Inside `build.rollupOptions.output.manualChunks`, add:

```javascript
monaco: ["@monaco-editor/react", "monaco-editor"],
```

- [ ] **Step 3: Run client build to verify Monaco chunk splits**

Run: `cd client && npm run build`
Expected: `dist/assets/monaco-*.js` chunk exists and is NOT merged into `index-*.js`.

- [ ] **Step 4: Wire `clearAllLabDrafts()` into the auth logout handler**

Locate the client-side logout code — likely `client/src/store/authStore.js` (Zustand) or the API-service logout function. In the logout path, immediately before the token clear, call `clearAllLabDrafts()` imported from the new component file. Rationale: shared-workstation defense — one user's draft must not survive into the next user's browser session (Security review m1).

- [ ] **Step 5: Manual smoke through dev server**

Run: `cd client && npm run dev`
- Visit any concept lab tab. Editor renders (1-2s lazy-load), typing echoes.
- Type in Monaco, wait 6 seconds, verify `localStorage["curriculum:lab:draft:<labId>"]` is set (DevTools → Application).
- Log out. Verify all `curriculum:lab:draft:*` keys are gone.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/curriculum/MonacoLabEditor.jsx client/vite.config.js client/src/store/authStore.js
git commit -m "Add MonacoLabEditor + 5s autosave + 100KB cap + logout draft-clear"
```

---

## Task 2: CodeReviewResult component

**Files:**
- Create: `client/src/components/curriculum/CodeReviewResult.jsx`

Renders the `codeReview` JSON shape defined by `ai.schemas.js::codeReviewSchema`. Markdown fields (`overall`, `mentalModelSignal`) are delegated to the existing `MarkdownRenderer` component — no new raw-HTML injection sink.

- [ ] **Step 1: Write the component using MarkdownRenderer for markdown fields**

```jsx
// client/src/components/curriculum/CodeReviewResult.jsx
import { MarkdownRenderer } from "../ui/MarkdownRenderer.jsx";

const VERDICT_STYLES = {
  STRONG: { label: "STRONG", bg: "bg-success-soft", fg: "text-success-fg" },
  ADEQUATE: { label: "ADEQUATE", bg: "bg-warning-soft", fg: "text-warning-fg" },
  WEAK: { label: "WEAK", bg: "bg-danger-soft", fg: "text-danger-fg" },
};

const NEXT_STEP_COPY = {
  READY_FOR_REFERENCE: "You can reveal the reference solution now.",
  TRY_AGAIN: "Try another attempt — you're close.",
  SEEK_HELP: "Consider reviewing the primer or asking for help.",
};

function DimBadge({ label, verdict }) {
  const style = VERDICT_STYLES[verdict] ?? VERDICT_STYLES.WEAK;
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded border border-surface-line">
      <span className="text-sm text-fg-soft">{label}</span>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${style.bg} ${style.fg}`}>
        {style.label}
      </span>
    </div>
  );
}

export default function CodeReviewResult({ review }) {
  if (!review) return null;
  const overallStyle = VERDICT_STYLES[review.codeReviewVerdict] ?? VERDICT_STYLES.WEAK;

  return (
    <div className="space-y-4">
      <div className={`p-4 rounded ${overallStyle.bg}`}>
        <div className={`text-xs font-semibold ${overallStyle.fg} mb-1`}>
          Code Review Verdict — {overallStyle.label}
        </div>
        <MarkdownRenderer content={review.overall} size="sm" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <DimBadge label="Correctness" verdict={review.correctness} />
        <DimBadge label="Concept Application" verdict={review.conceptApplication} />
        <DimBadge label="Design Quality" verdict={review.designQuality} />
        <DimBadge label="Idiomatic Style" verdict={review.idiomaticStyle} />
        <DimBadge label="Robustness" verdict={review.robustness} />
        <DimBadge label="Testing" verdict={review.testing} />
      </div>

      {review.whatYouGotRight?.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold text-success-fg mb-2">What you got right</h4>
          <ul className="list-disc list-inside space-y-1 text-sm">
            {review.whatYouGotRight.map((it, i) => (
              <li key={i}>
                {it.item}
                {it.lineRef && <span className="text-fg-soft"> ({it.lineRef})</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {review.thingsToImprove?.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold text-warning-fg mb-2">Things to improve</h4>
          <ul className="list-disc list-inside space-y-1 text-sm">
            {review.thingsToImprove.map((it, i) => (
              <li key={i}>
                {it.item}
                {it.lineRef && <span className="text-fg-soft"> ({it.lineRef})</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {review.bugs?.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold text-danger-fg mb-2">Bugs</h4>
          <ul className="list-disc list-inside space-y-1 text-sm">
            {review.bugs.map((b, i) => (
              <li key={i}>
                <span className="uppercase text-xs font-semibold mr-1">{b.severity}</span>
                {b.description}
                {b.lineRef && <span className="text-fg-soft"> ({b.lineRef})</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {review.mentalModelSignal && (
        <section className="border-t border-surface-line pt-3">
          <h4 className="text-sm font-semibold text-fg-soft mb-1">Mental model signal</h4>
          <MarkdownRenderer content={review.mentalModelSignal} size="sm" />
        </section>
      )}

      {review.nextStep && (
        <div className="text-sm text-fg-soft italic">
          <strong>Next step:</strong> {NEXT_STEP_COPY[review.nextStep] ?? review.nextStep}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manual smoke through dev server**

Trigger a completed attempt in dev; verify the six dim badges, findings sections, and next-step footer render.

- [ ] **Step 3: XSS regression check**

In React DevTools, mutate a mounted `review.overall` to `"<script>alert(1)</script> hi"`. Expected: rendered HTML shows "hi", no script node. (Guaranteed by `MarkdownRenderer`'s DOMPurify pipeline — this step just verifies we're actually using it.)

- [ ] **Step 4: Client lint**

Run: `cd client && npm run lint`
Expected: 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/curriculum/CodeReviewResult.jsx
git commit -m "Add CodeReviewResult component (6-dim grid, uses MarkdownRenderer for md fields)"
```

---

## Task 3: ReferenceDiff component (Monaco DiffEditor)

**Files:**
- Create: `client/src/components/curriculum/ReferenceDiff.jsx`

Uses `DiffEditor` from `@monaco-editor/react` — already in the Monaco bundle from T1.

- [ ] **Step 1: Write the diff component**

```jsx
// client/src/components/curriculum/ReferenceDiff.jsx
import { Suspense, lazy } from "react";
import { useTheme } from "../../hooks/useTheme.js";

const DiffEditor = lazy(() =>
  import("@monaco-editor/react").then((m) => ({ default: m.DiffEditor })),
);

const LANG_MAP = {
  JAVA: "java",
  PYTHON: "python",
  TYPESCRIPT: "typescript",
  JAVASCRIPT: "javascript",
  GO: "go",
  CPP: "cpp",
  CSHARP: "csharp",
};

export default function ReferenceDiff({ language = "JAVA", userCode, referenceCode }) {
  const { theme } = useTheme();
  return (
    <div className="h-[520px] rounded-md border border-surface-line overflow-hidden">
      <Suspense fallback={<div className="p-4 text-fg-soft">Loading diff…</div>}>
        <DiffEditor
          height="520px"
          language={LANG_MAP[language] ?? "plaintext"}
          original={userCode ?? ""}
          modified={referenceCode ?? ""}
          theme={theme === "dark" ? "vs-dark" : "vs"}
          options={{
            renderSideBySide: true,
            minimap: { enabled: false },
            readOnly: true,
            fontSize: 13,
          }}
        />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 2: Manual smoke**

Submit a STRONG lab attempt, click Reveal, verify side-by-side diff.

- [ ] **Step 3: Client lint**

Run: `cd client && npm run lint`

- [ ] **Step 4: Commit**

```bash
git add client/src/components/curriculum/ReferenceDiff.jsx
git commit -m "Add ReferenceDiff component (Monaco DiffEditor wrapper)"
```

---

## Task 4: Rewire ConceptLabTab to use the three new components

**Files:**
- Modify: `client/src/pages/learn/tabs/ConceptLabTab.jsx`

Replaces:
- Plain `<textarea>` → `<MonacoLabEditor>` (draft-restore on mount, clear-draft on submit-success).
- `<pre><code>` reference block → `<ReferenceDiff>` when `attempt.revealedReferenceAt` is set.
- Verdict badge → `<CodeReviewResult review={attempt.codeReview} />` when `attempt.reviewStatus === "COMPLETED"`.
- Disabled "Monaco coming Week 5" button → removed.

Keeps unchanged: reveal-gate on prior STRONG/ADEQUATE attempt, `useAttempt` polling, submit-disabled state, WS `curriculum:review_ready` subscription.

- [ ] **Step 1: Read the current file**

Run: `sed -n '1,290p' client/src/pages/learn/tabs/ConceptLabTab.jsx` and lock the existing surface.

- [ ] **Step 2: Swap the textarea and reference blocks**

Wire the three new components, restoring draft on mount:

```jsx
import MonacoLabEditor, { loadDraft, clearDraft } from "../../../components/curriculum/MonacoLabEditor.jsx";
import CodeReviewResult from "../../../components/curriculum/CodeReviewResult.jsx";
import ReferenceDiff from "../../../components/curriculum/ReferenceDiff.jsx";

// Inside the component body:
const [code, setCode] = useState(() => loadDraft(labId) ?? starterCode ?? "");

// After successful submit:
clearDraft(labId);

// In JSX (replaces the current <textarea>):
<MonacoLabEditor labId={labId} language={language} starterCode={starterCode} value={code} onChange={setCode} disabled={isSubmitting} />

// Replaces the current <pre><code> reference block, when revealedReferenceAt is set.
// CRITICAL: userCode MUST be the SUBMITTED attempt.code (locked at submit time),
// not the live editor state `code`. Otherwise a user editing after submit sees
// their current edits diffed against the reference instead of what they actually
// submitted — misleading and defeats the point of the reveal. (PO review M2.)
<ReferenceDiff language={language} userCode={attempt.code} referenceCode={referenceSolution} />

// Replaces the current verdict badge when attempt.codeReview is present:
<CodeReviewResult review={attempt.codeReview} />
```

**Note on `referenceSolution`:** the field is not on the concept detail payload — the learner surface deliberately withholds it. It becomes available on the response of `POST /curriculum/labs/:id/reveal-reference` (see W4 `curriculum.controller.revealReference` — returns `{ referenceSolution, attempt }`). Persist that response into local state (`setReferenceSolution(res.data.referenceSolution)`) inside the `handleReveal` handler, then pass the local state to `<ReferenceDiff>`. Do NOT read from `concept.lab.referenceSolution` — it's null on the learner payload.

- [ ] **Step 3: Full manual smoke**

- Draft persistence: type in Monaco, close tab, reopen → draft restored.
- Submit STRONG: `CodeReviewResult` renders (six dim badges + findings + next-step).
- Reveal: `ReferenceDiff` renders side-by-side.
- Character cap: paste >100KB, verify truncation.
- WS event: mock a `curriculum:review_ready` message and verify the polling stops.

- [ ] **Step 4: Client lint + build**

Run: `cd client && npm run lint && npm run build`
Expected: 0 warnings, both `monaco-*.js` and `mdEditor-*.js` chunks present and separate.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/learn/tabs/ConceptLabTab.jsx
git commit -m "Rewire ConceptLabTab: Monaco editor + structured review + Monaco diff reveal"
```

---

## Task 5: setTeachingReady + recordTeachingSignal + truth-table auto-flip

**Files:**
- Modify: `server/src/services/curriculum/conceptMastery.service.js`
- Create: `server/test/services/conceptMastery.teachingReady-truthtable.test.js`

- [ ] **Step 1: Write the failing unit tests**

Seven tests covering the truth table + monotonicity + idempotence:

```javascript
// server/test/services/conceptMastery.teachingReady-truthtable.test.js
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import prisma from "../../src/lib/prisma.js";
import {
  recordLabSignal,
  recordCheckInSignal,
  recordPrimerReadSignal,
  setTeachingReady,
} from "../../src/services/curriculum/conceptMastery.service.js";

const PREFIX = "test_w5t5_";
const USER_ID = `${PREFIX}user`;
const CONCEPT_ID = `${PREFIX}concept`;
const TEAM_ID = `${PREFIX}team`;
const LAB_ID = `${PREFIX}lab`;

async function scrub() {
  await prisma.$executeRawUnsafe(`DELETE FROM "lab_attempts" WHERE "userId" = $1`, USER_ID);
  await prisma.$executeRawUnsafe(`DELETE FROM "concept_check_ins" WHERE "userId" = $1`, USER_ID);
  await prisma.$executeRawUnsafe(`DELETE FROM "concept_masteries" WHERE "userId" = $1`, USER_ID);
  await prisma.$executeRawUnsafe(`DELETE FROM "labs" WHERE "id" = $1`, LAB_ID);
  await prisma.$executeRawUnsafe(`DELETE FROM "concepts" WHERE "id" = $1`, CONCEPT_ID);
  await prisma.$executeRawUnsafe(`DELETE FROM "topics" WHERE "teamId" = $1`, TEAM_ID);
  await prisma.$executeRawUnsafe(`DELETE FROM "team_memberships" WHERE "teamId" = $1`, TEAM_ID);
  await prisma.$executeRawUnsafe(`DELETE FROM "teams" WHERE "id" = $1`, TEAM_ID);
  await prisma.$executeRawUnsafe(`DELETE FROM "users" WHERE "email" LIKE $1`, `${PREFIX}%`);
}

async function seed() {
  await prisma.user.create({
    data: {
      id: USER_ID, email: `${PREFIX}u@example.test`,
      password: "$2b$12$placeholderhashforintegrationtest",
      name: "T5", globalRole: "USER", onboardingComplete: true,
    },
  });
  await prisma.team.create({
    data: { id: TEAM_ID, name: "T5", status: "ACTIVE", createdById: USER_ID, maxMembers: 20, isPersonal: false },
  });
  await prisma.teamMembership.create({
    data: { userId: USER_ID, teamId: TEAM_ID, role: "MEMBER", isActive: true },
  });
  const topic = await prisma.topic.create({
    data: {
      slug: `${PREFIX}topic`, name: "T5", description: "d",
      category: "LOW_LEVEL_DESIGN", status: "PUBLISHED", teamId: TEAM_ID,
    },
  });
  await prisma.concept.create({
    data: {
      id: CONCEPT_ID, slug: `${PREFIX}concept`, name: "C", order: 1,
      status: "PUBLISHED", primerMarkdown: "p", primerHtml: "<p>p</p>",
      workedExample: "e", canonicalSources: [], expectedQuestions: [],
      assessmentCriteria: {}, readinessRubric: null,
      teamId: TEAM_ID, topicId: topic.id,
    },
  });
  await prisma.lab.create({
    data: {
      id: LAB_ID, title: "L", taskMarkdown: "t", timeboxMinutes: 30,
      language: "JAVA", referenceSolution: "ref", expectedArtifacts: [],
      status: "PUBLISHED", teamId: TEAM_ID, conceptId: CONCEPT_ID,
    },
  });
}

async function loadMastery() {
  return prisma.conceptMastery.findUnique({
    where: { userId_conceptId: { userId: USER_ID, conceptId: CONCEPT_ID } },
  });
}

async function makeAttempt(verdict, n = 1) {
  return prisma.labAttempt.create({
    data: {
      labId: LAB_ID, userId: USER_ID, attemptNumber: n, code: "c",
      reviewStatus: "COMPLETED", codeReviewVerdict: verdict, reviewedAt: new Date(),
    },
  });
}

async function makeCheckIn(verdict, n = 1) {
  return prisma.conceptCheckIn.create({
    data: {
      conceptId: CONCEPT_ID, userId: USER_ID, attemptNumber: n,
      recallAnswer: "r", applyAnswer: "a", buildAnswer: "b",
      preConfidence: 4, aiVerdict: verdict, calibrationDelta: 0.1,
      perQuestionVerdicts: {},
    },
  });
}

beforeEach(async () => { await scrub(); await seed(); });
afterAll(async () => { await scrub(); });

describe("teachingReady truth table", () => {
  it("stays false when only primer_read exists", async () => {
    await recordPrimerReadSignal({ userId: USER_ID, conceptId: CONCEPT_ID });
    expect((await loadMastery()).teachingReady).toBe(false);
  });

  it("stays false with primer + STRONG lab but no PASS check-in", async () => {
    await recordPrimerReadSignal({ userId: USER_ID, conceptId: CONCEPT_ID });
    await recordLabSignal({ userId: USER_ID, conceptId: CONCEPT_ID, attempt: await makeAttempt("STRONG") });
    expect((await loadMastery()).teachingReady).toBe(false);
  });

  it("stays false with primer + PASS check-in but no STRONG lab", async () => {
    await recordPrimerReadSignal({ userId: USER_ID, conceptId: CONCEPT_ID });
    await recordCheckInSignal({ userId: USER_ID, conceptId: CONCEPT_ID, checkIn: await makeCheckIn("PASS") });
    expect((await loadMastery()).teachingReady).toBe(false);
  });

  it("flips to true on primer + STRONG lab + PASS check-in", async () => {
    await recordPrimerReadSignal({ userId: USER_ID, conceptId: CONCEPT_ID });
    await recordLabSignal({ userId: USER_ID, conceptId: CONCEPT_ID, attempt: await makeAttempt("STRONG") });
    await recordCheckInSignal({ userId: USER_ID, conceptId: CONCEPT_ID, checkIn: await makeCheckIn("PASS") });
    expect((await loadMastery()).teachingReady).toBe(true);
  });

  it("flips regardless of signal-arrival order (check-in first, then lab)", async () => {
    await recordPrimerReadSignal({ userId: USER_ID, conceptId: CONCEPT_ID });
    await recordCheckInSignal({ userId: USER_ID, conceptId: CONCEPT_ID, checkIn: await makeCheckIn("PASS") });
    await recordLabSignal({ userId: USER_ID, conceptId: CONCEPT_ID, attempt: await makeAttempt("STRONG") });
    expect((await loadMastery()).teachingReady).toBe(true);
  });

  it("ADEQUATE lab also satisfies the truth table", async () => {
    await recordPrimerReadSignal({ userId: USER_ID, conceptId: CONCEPT_ID });
    await recordLabSignal({ userId: USER_ID, conceptId: CONCEPT_ID, attempt: await makeAttempt("ADEQUATE") });
    await recordCheckInSignal({ userId: USER_ID, conceptId: CONCEPT_ID, checkIn: await makeCheckIn("PASS") });
    expect((await loadMastery()).teachingReady).toBe(true);
  });

  it("does NOT un-flip when a later WEAK attempt arrives", async () => {
    await recordPrimerReadSignal({ userId: USER_ID, conceptId: CONCEPT_ID });
    await recordLabSignal({ userId: USER_ID, conceptId: CONCEPT_ID, attempt: await makeAttempt("STRONG", 1) });
    await recordCheckInSignal({ userId: USER_ID, conceptId: CONCEPT_ID, checkIn: await makeCheckIn("PASS") });
    await recordLabSignal({ userId: USER_ID, conceptId: CONCEPT_ID, attempt: await makeAttempt("WEAK", 2) });
    expect((await loadMastery()).teachingReady).toBe(true); // monotonic
  });

  it("setTeachingReady is idempotent", async () => {
    await setTeachingReady({ userId: USER_ID, conceptId: CONCEPT_ID, reason: "manual" });
    const a = await loadMastery();
    await setTeachingReady({ userId: USER_ID, conceptId: CONCEPT_ID, reason: "manual" });
    const b = await loadMastery();
    expect(a.teachingReady).toBe(true);
    expect(b.teachingReady).toBe(true);
    const aTR = (a.signals ?? []).filter((s) => s.source === "teachingReady").length;
    const bTR = (b.signals ?? []).filter((s) => s.source === "teachingReady").length;
    expect(bTR).toBe(aTR); // no duplicate audit entry.
  });

  it("does NOT flip when the STRONG lab is on a different team's Lab row", async () => {
    // Simulate a user who is in Team A (this seed) and also Team B. The
    // seeded Team A has a Concept + Lab; imagine Team B has an equivalent
    // Concept with the SAME conceptId (impossible in practice — CUIDs
    // guarantee uniqueness — but the query safety must not depend on that).
    // The test asserts the teamId filter on the truth-table read is active.
    const OTHER_TEAM_ID = `${PREFIX}team_b`;
    await prisma.team.create({
      data: { id: OTHER_TEAM_ID, name: "T5B", status: "ACTIVE", createdById: USER_ID, maxMembers: 20, isPersonal: false },
    });
    await prisma.teamMembership.create({
      data: { userId: USER_ID, teamId: OTHER_TEAM_ID, role: "MEMBER", isActive: true },
    });
    await recordPrimerReadSignal({ userId: USER_ID, conceptId: CONCEPT_ID, teamId: OTHER_TEAM_ID });
    // Register a STRONG attempt on Team A's Lab (the seeded LAB_ID sits under TEAM_ID / Team A).
    await recordLabSignal({
      userId: USER_ID,
      conceptId: CONCEPT_ID,
      teamId: OTHER_TEAM_ID,                   // caller passes Team B
      attempt: await makeAttempt("STRONG"),    // attempt was actually on Team A's Lab
    });
    await recordCheckInSignal({
      userId: USER_ID,
      conceptId: CONCEPT_ID,
      teamId: OTHER_TEAM_ID,
      checkIn: await makeCheckIn("PASS"),
    });
    // Team A's STRONG lab must NOT count toward Team B's truth table.
    expect((await loadMastery()).teachingReady).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify red**

Run: `cd server && npx vitest run test/services/conceptMastery.teachingReady-truthtable.test.js`
Expected: FAIL — `setTeachingReady` not yet implemented + no auto-flip.

- [ ] **Step 3: Implement `setTeachingReady`, `recordTeachingSignal`, and truth-table auto-flip**

Add these to `conceptMastery.service.js`:

```javascript
export async function setTeachingReady({ userId, conceptId, reason = "truthTable" }) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.conceptMastery.upsert({
      where: { userId_conceptId: { userId, conceptId } },
      update: {},
      create: { userId, conceptId, signals: [] },
    });
    if (existing.teachingReady) return existing;
    const currentSignals = Array.isArray(existing.signals) ? existing.signals : [];
    const nextSignals = [
      ...currentSignals,
      { source: "teachingReady", value: 1, evidence: { reason }, at: new Date().toISOString() },
    ];
    return tx.conceptMastery.update({
      where: { userId_conceptId: { userId, conceptId } },
      data: { teachingReady: true, signals: nextSignals },
    });
  });
}

export async function recordTeachingSignal({ userId, conceptId, teachingSessionId, verdict, at }) {
  return mentorUpdateMastery(userId, conceptId, {
    source: "teaching",
    value: verdict === "STRONG" ? 100 : verdict === "ADEQUATE" ? 70 : 30,
    evidence: { teachingSessionId, verdict },
    at: at ?? new Date().toISOString(),
  });
}

/**
 * The truth-table read. teamId MUST be passed to prevent cross-team signal
 * bleed: a user in Team A and Team B could otherwise have a STRONG lab
 * on Team A's Lab (same Concept slug, different `Lab.id`) satisfy the
 * truth table for Team B. Security review flagged this as MAJOR — required.
 *
 * MUST NOT be called from inside an open $transaction — setTeachingReady
 * opens its own tx and would deadlock on the ConceptMastery row lock.
 */
async function _shouldAutoFlipTeachingReady({ userId, conceptId, teamId }) {
  const mastery = await prisma.conceptMastery.findUnique({
    where: { userId_conceptId: { userId, conceptId } },
  });
  const signals = Array.isArray(mastery?.signals) ? mastery.signals : [];
  const hasPrimer = signals.some((s) => s.source === "primer_read");
  if (!hasPrimer) return false;

  const anyStrong = await prisma.labAttempt.findFirst({
    where: {
      userId,
      lab: { conceptId, teamId },          // ← teamId filter closes the cross-team bleed
      codeReviewVerdict: { in: ["STRONG", "ADEQUATE"] },
      reviewStatus: "COMPLETED",
    },
    select: { id: true },
  });
  if (!anyStrong) return false;

  const latestCheckIn = await prisma.conceptCheckIn.findFirst({
    where: {
      userId,
      conceptId,
      concept: { teamId },                 // ← same defense on the check-in side
    },
    orderBy: { attemptNumber: "desc" },
    select: { aiVerdict: true },
  });
  return latestCheckIn?.aiVerdict === "PASS";
}

async function _maybeAutoFlipTeachingReady({ userId, conceptId, teamId }) {
  try {
    if (await _shouldAutoFlipTeachingReady({ userId, conceptId, teamId })) {
      await setTeachingReady({ userId, conceptId, reason: "truthTable" });
    }
  } catch (err) {
    // Never let auto-flip failure surface to the signal caller — the
    // signal write is already committed and the caller should not be
    // asked to retry solely for the flip. A subsequent signal will
    // re-trigger the flip attempt.
    logger.error({ err, userId, conceptId, teamId }, "teachingReady auto-flip failed");
  }
}
```

Then update the three signal writers to accept and forward `teamId`:

- `recordLabSignal({ userId, conceptId, teamId, attempt })` — teamId is available on `attempt.lab.teamId` if the caller does the include, but safer to have the controller pass `req.teamId` explicitly.
- `recordCheckInSignal({ userId, conceptId, teamId, checkIn })`
- `recordPrimerReadSignal({ userId, conceptId, teamId })`

Each writer's LAST line becomes:

```javascript
await _maybeAutoFlipTeachingReady({ userId, conceptId, teamId });
```

Then update every existing call site in `server/src/controllers/curriculum.controller.js` to forward `req.teamId`. (There are exactly three: one inside `onReviewCompleted` after CODE_REVIEW resolves — read `teamId` off the persisted `LabAttempt.lab.teamId`; one inside `submitCheckIn`; one inside `markPrimerRead` — pass `req.teamId` directly.)

- [ ] **Step 4: Run tests to verify green**

Run: `npx vitest run test/services/conceptMastery.teachingReady-truthtable.test.js`
Expected: PASS 8/8.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/curriculum/conceptMastery.service.js server/test/services/conceptMastery.teachingReady-truthtable.test.js
git commit -m "Add setTeachingReady + auto-flip truth table (primer + STRONG lab + PASS check-in)"
```

---

## Task 6: D8 adapter — LabAttempts feed designSessions

**Files:**
- Create: `server/src/utils/designAptitude.curriculum.js`
- Create: `server/test/utils/designAptitude.curriculum.test.js`
- Modify: `server/src/controllers/stats.controller.js`

- [ ] **Step 1: Write the failing unit test**

Five cases: empty user, STRONG-on-LLD maps, WEAK excluded, non-design category excluded, cross-team leak check.

```javascript
// server/test/utils/designAptitude.curriculum.test.js
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import prisma from "../../src/lib/prisma.js";
import { mapLabAttemptsToDesignSessions } from "../../src/utils/designAptitude.curriculum.js";

const PREFIX = "test_w5t6_";
const USER_ID = `${PREFIX}user`;
const TEAM_ID = `${PREFIX}team`;

async function scrub() {
  await prisma.$executeRawUnsafe(`DELETE FROM "lab_attempts" WHERE "userId" = $1`, USER_ID);
  await prisma.$executeRawUnsafe(`DELETE FROM "labs" WHERE "teamId" = $1`, TEAM_ID);
  await prisma.$executeRawUnsafe(`DELETE FROM "concepts" WHERE "teamId" = $1`, TEAM_ID);
  await prisma.$executeRawUnsafe(`DELETE FROM "topics" WHERE "teamId" = $1`, TEAM_ID);
  await prisma.$executeRawUnsafe(`DELETE FROM "team_memberships" WHERE "teamId" = $1`, TEAM_ID);
  await prisma.$executeRawUnsafe(`DELETE FROM "teams" WHERE "id" = $1`, TEAM_ID);
  await prisma.$executeRawUnsafe(`DELETE FROM "users" WHERE "email" LIKE $1`, `${PREFIX}%`);
}

async function seed(category) {
  await scrub();
  await prisma.user.create({
    data: {
      id: USER_ID, email: `${PREFIX}u@example.test`,
      password: "$2b$12$placeholderhashforintegrationtest",
      name: "T6", globalRole: "USER", onboardingComplete: true,
    },
  });
  await prisma.team.create({
    data: { id: TEAM_ID, name: "T6", status: "ACTIVE", createdById: USER_ID, maxMembers: 20, isPersonal: false },
  });
  await prisma.teamMembership.create({
    data: { userId: USER_ID, teamId: TEAM_ID, role: "MEMBER", isActive: true },
  });
  const topic = await prisma.topic.create({
    data: {
      slug: `${PREFIX}topic`, name: "T6", description: "d",
      category, status: "PUBLISHED", teamId: TEAM_ID,
    },
  });
  const concept = await prisma.concept.create({
    data: {
      slug: `${PREFIX}concept`, name: "C", order: 1, status: "PUBLISHED",
      primerMarkdown: "p", primerHtml: "p", workedExample: "e",
      canonicalSources: [], expectedQuestions: [],
      assessmentCriteria: {}, readinessRubric: null,
      teamId: TEAM_ID, topicId: topic.id,
    },
  });
  const lab = await prisma.lab.create({
    data: {
      title: "L", taskMarkdown: "t", timeboxMinutes: 30, language: "JAVA",
      referenceSolution: "ref", expectedArtifacts: [],
      status: "PUBLISHED", teamId: TEAM_ID, conceptId: concept.id,
    },
  });
  return { concept, lab };
}

async function attempt(labId, verdict) {
  return prisma.labAttempt.create({
    data: {
      labId, userId: USER_ID, attemptNumber: 1, code: "c",
      reviewStatus: "COMPLETED", codeReviewVerdict: verdict, reviewedAt: new Date(),
    },
  });
}

afterAll(async () => { await scrub(); });

describe("mapLabAttemptsToDesignSessions", () => {
  it("returns [] when user has no attempts", async () => {
    await seed("LOW_LEVEL_DESIGN");
    expect(await mapLabAttemptsToDesignSessions({ userId: USER_ID, teamId: TEAM_ID })).toEqual([]);
  });

  it("maps STRONG on LLD to a design-session shape", async () => {
    const { lab, concept } = await seed("LOW_LEVEL_DESIGN");
    await attempt(lab.id, "STRONG");
    const out = await mapLabAttemptsToDesignSessions({ userId: USER_ID, teamId: TEAM_ID });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      userId: USER_ID, conceptId: concept.id, source: "curriculum_lab", verdict: "STRONG",
    });
    expect(out[0].evaluation?.dimensions).toBeDefined();
  });

  it("does NOT map WEAK attempts", async () => {
    const { lab } = await seed("LOW_LEVEL_DESIGN");
    await attempt(lab.id, "WEAK");
    expect(await mapLabAttemptsToDesignSessions({ userId: USER_ID, teamId: TEAM_ID })).toEqual([]);
  });

  it("does NOT map attempts on non-design topics", async () => {
    const { lab } = await seed("ALGORITHMS_DATA_STRUCTURES");
    await attempt(lab.id, "STRONG");
    expect(await mapLabAttemptsToDesignSessions({ userId: USER_ID, teamId: TEAM_ID })).toEqual([]);
  });

  it("scopes strictly to the caller's team", async () => {
    const { lab } = await seed("SYSTEM_DESIGN");
    await attempt(lab.id, "STRONG");
    expect(await mapLabAttemptsToDesignSessions({ userId: USER_ID, teamId: `${TEAM_ID}_x` })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify red**

- [ ] **Step 3: Implement the adapter**

**Critical shape requirements (LeadEng + PO review found these missing from v1):**

`computeDesignAptitudeStats` at `server/src/utils/designAptitudeStats.js`:
- Splits sessions by `s.designType === "SYSTEM_DESIGN"` vs `"LOW_LEVEL_DESIGN"` (line 220). Missing `designType` → session lands in neither bucket, both counts stay 0.
- Weights `s.evaluation?.overallScore` at 50% (line 226 — the largest sub-component). Missing `overallScore` → the 50% weight silently zeros out.
- Counts filled `phases` and enumerates `scenarios`. Missing these → completeness + scenario-resilience sub-components zero. Provide explicit `null` so the existing null-guards handle them cleanly.

```javascript
// server/src/utils/designAptitude.curriculum.js
import prisma from "../lib/prisma.js";

const DESIGN_CATEGORIES = ["LOW_LEVEL_DESIGN", "SYSTEM_DESIGN"];
const PASSING_VERDICTS = ["STRONG", "ADEQUATE"];

/**
 * 0-10 scale, matching the DesignSession evaluation.overallScore contract
 * consumed by computeDesignAptitudeStats. STRONG lab → 10 (excellent);
 * ADEQUATE → 7 (passing but not excellent). Aligns with the CODE_REVIEW
 * validator's verbal rubric.
 */
function overallScoreForVerdict(verdict) {
  if (verdict === "STRONG") return 10;
  if (verdict === "ADEQUATE") return 7;
  return 0; // WEAK never reaches this fn — PASSING_VERDICTS filter blocks it.
}

export async function mapLabAttemptsToDesignSessions({ userId, teamId }) {
  if (!userId || !teamId) return [];
  const attempts = await prisma.labAttempt.findMany({
    where: {
      userId,
      codeReviewVerdict: { in: PASSING_VERDICTS },
      reviewStatus: "COMPLETED",
      lab: {
        teamId,
        concept: {
          teamId,
          topic: { category: { in: DESIGN_CATEGORIES } },
        },
      },
    },
    include: {
      lab: {
        include: {
          concept: {
            select: {
              id: true,
              topicId: true,
              topic: { select: { category: true } },
            },
          },
        },
      },
    },
    orderBy: { submittedAt: "asc" },
  });

  return attempts.map((a) => {
    const category = a.lab.concept.topic.category;
    // Map the Topic category to the SESSION designType enum that
    // computeDesignAptitudeStats splits on. Both categories currently
    // pass through 1:1 — kept explicit to catch a future category rename.
    const designType = category === "SYSTEM_DESIGN" ? "SYSTEM_DESIGN" : "LOW_LEVEL_DESIGN";
    return {
      id: `lab-${a.id}`,
      userId,
      teamId,
      conceptId: a.lab.concept.id,
      topicId: a.lab.concept.topicId,
      source: "curriculum_lab",
      verdict: a.codeReviewVerdict,
      designType,                                  // ← required by aggregator split (PO B1)
      submittedAt: a.submittedAt,
      evaluation: {
        overallScore: overallScoreForVerdict(a.codeReviewVerdict),  // ← required by 50%-weight sub-component (LeadEng)
        dimensions: {
          systemDesign: a.codeReviewVerdict === "STRONG" ? 5 : 4,
          coding: a.codeReviewVerdict === "STRONG" ? 5 : 4,
          communication: null,
        },
      },
      // Explicit nulls so the aggregator's guards handle them cleanly.
      phases: null,
      scenarios: null,
      interviewSessions: [],
    };
  });
}
```

**Update the T6 Step 1 unit tests** to assert on the newly-added fields:

```javascript
// Add to the "maps STRONG on LLD" test:
expect(out[0]).toMatchObject({
  designType: "LOW_LEVEL_DESIGN",
  evaluation: { overallScore: 10 },
});
// Add a case that verifies SYSTEM_DESIGN → SYSTEM_DESIGN mapping:
it("maps SYSTEM_DESIGN category to designType SYSTEM_DESIGN with overallScore=10 for STRONG", async () => {
  const { lab } = await seed("SYSTEM_DESIGN");
  await attempt(lab.id, "STRONG");
  const out = await mapLabAttemptsToDesignSessions({ userId: USER_ID, teamId: TEAM_ID });
  expect(out).toHaveLength(1);
  expect(out[0].designType).toBe("SYSTEM_DESIGN");
  expect(out[0].evaluation.overallScore).toBe(10);
});
// Add: ADEQUATE → overallScore=7
it("maps ADEQUATE verdict to overallScore=7", async () => {
  const { lab } = await seed("LOW_LEVEL_DESIGN");
  await attempt(lab.id, "ADEQUATE");
  const out = await mapLabAttemptsToDesignSessions({ userId: USER_ID, teamId: TEAM_ID });
  expect(out[0].evaluation.overallScore).toBe(7);
});
```

- [ ] **Step 4: Run test to verify green**

- [ ] **Step 5: Wire into `stats.controller.js`** — restructure the D8 branch so curriculum-only users activate the dimension

**CRITICAL correctness (PO B2 + LeadEng): the existing controller branches on `designSessionsCompleted.length === 0` at ~line 2358 to return the "Complete a Design Studio session" inactive-dim CTA. If you naively add `mergedDesignSessions` INSIDE the `else` branch, a user with only curriculum labs (zero DesignSession rows) still hits the inactive branch first and D8 never activates — completely defeating T6's purpose.** The guard MUST be restructured to use the merged length.

Find the D8 branch in `server/src/controllers/stats.controller.js`. The exact variable name in the current code is `designSessionsCompleted` (not `designSessions` — verify by grep). Update the block:

```javascript
import { mapLabAttemptsToDesignSessions } from "../utils/designAptitude.curriculum.js";

// Fetch curriculum-lab sessions in the same Promise.all block that fetches
// designSessionsCompleted, so the merge is available BEFORE the inactive guard.
const [designSessionsCompleted, curriculumLabSessions, /* other fetches */] = await Promise.all([
  /* existing DesignSession fetch */,
  mapLabAttemptsToDesignSessions({ userId: req.user.id, teamId: req.teamId }),
  /* other existing fetches */,
]);

// Merge before the activation guard so a curriculum-only user still activates D8.
const mergedDesignSessions = [...designSessionsCompleted, ...curriculumLabSessions];

if (!Array.isArray(mergedDesignSessions) || mergedDesignSessions.length === 0) {
  // ...existing inactive-dim CTA path — unchanged...
} else {
  const d8 = computeDesignAptitudeStats({
    sessions: mergedDesignSessions,      // ← merged, not raw
    /* other args unchanged */
  });
  // ...existing D8 branch...
}
```

Two rules:
1. Every place the old code read `designSessionsCompleted.length` must now read `mergedDesignSessions.length`.
2. Every place the old code passed `designSessionsCompleted` as a `sessions` arg must now pass `mergedDesignSessions`.

Grep for both patterns before committing to ensure no stale reference survives:

```bash
grep -n "designSessionsCompleted\." server/src/controllers/stats.controller.js
```

Every hit that gates on the sessions being present should now use `mergedDesignSessions`.

- [ ] **Step 6: Commit**

```bash
git add server/src/utils/designAptitude.curriculum.js server/src/controllers/stats.controller.js server/test/utils/designAptitude.curriculum.test.js
git commit -m "Wire curriculum LabAttempts into D8 input (designType + overallScore + merged guard)"
```

---

## Task 7: Integration tests

**Files:**
- Create: `server/test/integration/curriculum.teachingReady-flip.integration.test.js`
- Create: `server/test/integration/curriculum.d8-lab-adapter.integration.test.js`

- [ ] **Step 1: teachingReady-flip integration test**

Prefix `test_w5t7a_`. Follow W4.T8 fixture pattern (express + curriculum router + `_overrideValidatorSpec` for STRONG + PASS mocks). Walk: enroll → primer-read → attempt (STRONG) → poll → reveal → check-in (PASS) → GET concept detail → assert `mastery.teachingReady === true`.

**Also cover the server-side unlock-rule negative path (BA review m2):**
- Submit check-in with ZERO completed attempts on the concept → expect 403 `CHECKIN_LOCKED`.
- Submit lab attempt (WEAK mock) → poll to COMPLETED → submit check-in → expect 403 `CHECKIN_LOCKED` (a WEAK attempt does not unlock the check-in gate; the gate requires STRONG or ADEQUATE).
- Submit reveal-reference with zero completed attempts → expect 403 `REVEAL_BLOCKED_NO_ATTEMPT`.

These assertions verify the unlock rule is enforced on the server, not just on the client — the W4 routes already implement them; this test locks the invariant.

- [ ] **Step 2: d8-lab-adapter integration test**

Prefix `test_w5t7b_`. Seed user + team + LLD Topic + Concept + Lab + three LabAttempts (2 STRONG + 1 WEAK). Call `GET /api/v1/stats/report` (the report endpoint that returns 10-dim including D8). Assert `d8.designSessions >= 2`. Repeat with an ALGORITHMS_DATA_STRUCTURES topic and assert its STRONG attempts do NOT count in D8.

- [ ] **Step 3: Run each in isolation**

Run: `npx vitest run test/integration/curriculum.teachingReady-flip.integration.test.js`
Run: `npx vitest run test/integration/curriculum.d8-lab-adapter.integration.test.js`
Expected: both PASS.

- [ ] **Step 4: Run full server suite**

Run: `cd server && npm test`
Expected: all prior tests still pass + new tests pass. No flakes.

- [ ] **Step 5: Commit**

```bash
git add server/test/integration/curriculum.teachingReady-flip.integration.test.js server/test/integration/curriculum.d8-lab-adapter.integration.test.js
git commit -m "Add W5 integration tests (teachingReady auto-flip + D8 lab adapter)"
```

---

## Task 8: Verification + roadmap + FF-merge to main

- [ ] **Step 1: Full server suite** — `cd server && npm test`
- [ ] **Step 2: Server lint** — `cd server && npm run lint`
- [ ] **Step 3: Client lint + build** — `cd client && npm run lint && npm run build`. Verify `monaco-*.js` + `mdEditor-*.js` chunks both present.
- [ ] **Step 4: Prisma migrate status** — `cd server && npx prisma migrate status`. Expected: "Database schema is up to date."
- [ ] **Step 5: Manual golden-path walkthrough** — enroll → primer → Monaco lab → STRONG → CodeReviewResult → reveal → ReferenceDiff → check-in PASS → verify `teachingReady=true` on concept detail → GET stats report → verify D8 aggregation includes the STRONG lab.
- [ ] **Step 6: Roadmap update** — three entries in `client/src/pages/superadmin/roadmap/roadmapData.js`:
  1. **DONE** — `curriculum-phase-1-week-5-lab-editor-signals` mirroring the W4 format. Include the Monaco chunk sizes from Step 3, the truth-table description, and the D8 adapter one-liner.
  2. **NEXT (or LATER)** — `curriculum-lab-multi-file` — Phase 2 gap. Schema migration `starterCode / referenceSolution / code : String → Json`, CODE_REVIEW prompt template accepts file-map, Monaco tab bar UI, autosave-collision integration test. Deferred from W5 to keep single-file Phase 1 tight.
  3. **NEXT (or LATER)** — `curriculum-lab-d8-real-dim-scores` — Phase 2 gap. Replace the stubbed `evaluation.dimensions = { systemDesign: 5|4, coding: 5|4 }` with dimension scores extracted from the actual `codeReview` payload (correctness / conceptApplication / designQuality → systemDesign; correctness / robustness / testing → coding). Prevents current mild score-inflation for curriculum-only D8 users.
- [ ] **Step 7: FF-merge + push**

```bash
git checkout main
git merge --ff-only feat/curriculum-phase-1-w5
git push origin main   # pre-push hook runs all gates
```

- [ ] **Step 8: Delete the merged branch** — `git branch -d feat/curriculum-phase-1-w5`

---

# Self-review (writing-plans skill) — v2, post-panel

**Plan version:** v2 (2026-07-06, folded 4-role panel review — PO / BA / Security / LeadEng).

**Fixed in v2:**
- **BLOCKER (PO B1 + LeadEng)** D8 adapter output was missing `designType` (breaks the LLD/SD split at aggregator line 220) and `overallScore` (silently zeros the 50%-weight sub-component). Fixed in T6 Step 3 — adapter now emits `designType`, `overallScore` (STRONG=10, ADEQUATE=7), `phases: null`, `scenarios: null`, `interviewSessions: []`.
- **BLOCKER (PO B2 + LeadEng)** stats.controller guard `designSessionsCompleted.length === 0` ran BEFORE the merge — curriculum-only users hit the "Complete a Design Studio session" CTA and D8 never activated. Fixed in T6 Step 5 — guard now uses `mergedDesignSessions.length`, merge happens inside the same `Promise.all` block.
- **BLOCKER (Security)** `_shouldAutoFlipTeachingReady` was missing `teamId` — cross-team signal bleed possible for multi-team users. Fixed in T5 Step 3 — `teamId` threaded through all three writers, `lab: { teamId, conceptId }` filter added, cross-team isolation test added to T5 Step 1.
- **BLOCKER (BA)** Multi-file editor scope descope: user approved single-file for W5. Documented in scope inputs + Phase 2 roadmap entry `curriculum-lab-multi-file` added in T8 Step 6.
- **MAJOR (PO M2)** `<ReferenceDiff>` was reading live editor `code` — fixed in T4 to pass `attempt.code` (submitted) + persisted `referenceSolution` from the reveal response.
- **MAJOR (BA M1)** `topics/teaching/designStudio/notes.controller.js` write-path audit — completed (2026-07-06 grep). All `teachingReady` references are `select:` clauses or JS object-literal fallbacks. No writes exist. N/A confirmed and documented in scope inputs.
- **MAJOR (BA M2)** Master-plan test-file-name mapping documented in scope inputs. `curriculum.autosave-collision.integration.test.js` explicitly deferred with the multi-file descope.
- **MAJOR (LeadEng)** Explicit constraint added to `_shouldAutoFlipTeachingReady` doc comment: "MUST NOT be called from inside an open `$transaction` — deadlock on `ConceptMastery` row lock inside `setTeachingReady`."
- **MAJOR (PO M1)** Global Rule 5 wording corrected — `setTeachingReady` in its own tx; upstream signal writers cannot be composed inside outer tx (cites `conceptMastery.service.js` header).
- **MINOR (Security m1)** localStorage draft clear-on-logout added to T1 (new `clearAllLabDrafts()` export + wire in auth store logout handler).
- **MINOR (BA m1)** Monotonicity elevated to explicit requirement R2 in the truth table section.
- **MINOR (BA m2)** Server-side unlock-rule rejection cases added to T7 (check-in with zero attempts → 403, check-in with only WEAK attempts → 403, reveal without any attempt → 403).
- **MINOR (BA m3 + PO m1)** Both Phase 2 roadmap entries approved and added to T8 Step 6 (`curriculum-lab-multi-file`, `curriculum-lab-d8-real-dim-scores`).

**Deferred to post-W5 (documented, not blocking):**
- Security m2 — validate `review.nextStep` at the Zod schema layer (already an enum in `ai.schemas.js::codeReviewSchema`; verify during T2 build, escalate if not).
- LeadEng minor — `recordTeachingSignal` wiring to `teaching.controller.js` peer-session flow. Phase 2 — no caller today, W5 exports the writer only.
- LeadEng minor — `monaco-editor` bare package inert in `manualChunks`. Left as-is; Vite ignores unresolved entries. T1 Step 3 verifies chunk splits regardless.

**Spec coverage (master plan §Week 5 ship criteria):**
- `<MonacoLabEditor>` (5s autosave, 100KB cap; multi-file DESCOPED) → T1.
- `<CodeReviewResult>` → T2.
- `<ReferenceDiff>` (gated on verdict + nextStep) → T3.
- Check-in unlock rule ("≥1 STRONG/ADEQUATE LabAttempt") verified — negative test cases added → T7.
- Five conceptMastery writers → 3 in W4 + `recordTeachingSignal` + `setTeachingReady` in T5.
- `mentor.service.js` VALID_SIGNAL_SOURCES/SIGNAL_WEIGHTS → already shipped in W4, verified in scope inputs.
- `topics.controller.js` manual teachingReady rewire → audit-confirmed N/A; truth-table auto-flip is the sole writer.
- D8 adapter → T6.
- Signal writes atomicity → clarified (see fixed-in-v2 Global Rule 5).

**Type consistency (post-v2):**
- `setTeachingReady({ userId, conceptId, reason })` — same shape at every call site.
- `_shouldAutoFlipTeachingReady({ userId, conceptId, teamId })` + `_maybeAutoFlipTeachingReady({ userId, conceptId, teamId })` + all three signal writers now accept `teamId`.
- `mapLabAttemptsToDesignSessions({ userId, teamId })` — team-scoped; output shape now `{ id, userId, teamId, conceptId, topicId, source, verdict, designType, submittedAt, evaluation: { overallScore, dimensions }, phases, scenarios, interviewSessions }`.

---

# Execution handoff

Plan v2 complete. Execution proceeds via **subagent-driven-development** — fresh subagent per task with two-stage review (spec + quality) after each. T1 → T8 in order; each task's implementer receives the full task text + relevant scope-inputs + panel-fold notes for that task.
