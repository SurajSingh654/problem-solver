# Lab Phase A — Real Bugs + Top-5 Cross-Reviewer Wins

**Goal:** Ship the correctness fixes + triple-confirmed UX wins from the 4-reviewer Lab audit. No large redesigns; independent of Phases B/C/D.

**Architecture:** Small schema change (one boolean column on LabAttempt) + one migration. Server: 6 controllers/services touched. Client: 4 files touched, all with concentrated changes.

**Tech Stack:** React, Vite, Tailwind, Monaco, Prisma, Express.

---

## Task 1: Schema — `LabAttempt.usedFallback` + migration

**Files:**
- Modify `server/prisma/schema.prisma`
- Create `server/prisma/migrations/20260710100000_lab_attempt_used_fallback/migration.sql`

Add `usedFallback Boolean @default(false)` to LabAttempt. Migration is `ALTER TABLE ... ADD COLUMN ... DEFAULT false`. Apply via `prisma migrate deploy`.

## Task 2: Persist `usedFallback` in `onReviewCompleted`

**File:** `server/src/controllers/curriculum.controller.js`

Line ~430 (`onReviewCompleted`). Add `usedFallback: result.usedFallback ?? false` to the update payload.

## Task 3: Return `usedFallback` + conditional `code` from `getAttempt`

**File:** `server/src/controllers/curriculum.controller.js`

`getAttempt` handler (~line 900). Update select:
- Add `usedFallback: true`
- Keep `code: true` — the field is needed for ReferenceDiff. But when `reviewStatus` is PENDING or REVIEWING, the client isn't going to render it. Leaving `code` in for now (S1 is a bandwidth optimization, not a correctness bug — deferring to a wider selectivity pass).

Actually the reviewer's S1 is right — during PENDING polling, `code` is sent every 3s. Change: only include `code` in the select when the request has a query flag OR always send it (200 KB × N polls is measurable). For Phase A, keep as-is (simpler) and address S1 in Phase B.

## Task 4: `revealReference` error responses include `nextStep`

**File:** `server/src/controllers/curriculum.controller.js`

The `REVEAL_BLOCKED_VERDICT` and `REVEAL_BLOCKED_NEXT_STEP` errors already include `{ codeReviewVerdict, nextStep }` in `details`. Confirm and verify the client parses this on the failure path.

## Task 5: `reviewSemaphore` queue depth cap

**File:** `server/src/services/curriculum/reviewSemaphore.js`

Add `MAX_QUEUE_DEPTH` (env-driven, default 10). When `slot.queue.length >= MAX_QUEUE_DEPTH`, reject the returned promise with a `REVIEW_QUEUE_FULL` marker error. Update the callsite in `submitAttempt` to catch this and flip the attempt to `ERROR` via `onReviewFailed`.

## Task 6: Startup PENDING resurrection scan

**File:** `server/src/index.js` (or a new `startup.js` module)

After `prisma.$connect()` and before `server.listen()`, run one Prisma update:

```js
const cutoff = new Date(Date.now() - 5 * 60 * 1000);
const flipped = await prisma.labAttempt.updateMany({
  where: { reviewStatus: "PENDING", submittedAt: { lt: cutoff } },
  data: { reviewStatus: "ERROR" },
});
console.log(`[startup] Flipped ${flipped.count} orphaned PENDING attempts to ERROR`);
```

## Task 7: CODE_REVIEW prompt reads `primerSections` fallback

**File:** `server/src/services/ai.prompts.js`

`buildCodeReviewPrompt` receives `input.concept.primerExcerpt`. That excerpt is computed in `submitAttempt` from `lab.concept.primerMarkdown`. Update `submitAttempt` to derive the excerpt from `primerSections` (concatenate `body` + `mentalModel` markdown fields) when `primerMarkdown` is empty.

## Task 8: `topFocus` primary callout in `CodeReviewResult`

**File:** `client/src/components/curriculum/CodeReviewResult.jsx`

Above the 6-dimension grid, render:

```jsx
{review.topFocus && (
  <section className="rounded-xl border border-brand-line bg-brand-soft p-4">
    <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-fg-soft mb-1">Focus on this</h4>
    <p className="text-sm text-text-primary leading-relaxed">{review.topFocus}</p>
  </section>
)}
```

## Task 9: `usedFallback` banner in `CodeReviewResult`

**File:** `client/src/components/curriculum/CodeReviewResult.jsx`

At the top of the component, render a banner when `review.usedFallback === true` (prop drilled from `attempt.usedFallback`). Copy: "AI reviewer wasn't available for this attempt — the verdict below uses a conservative structural check. Try resubmitting for a full review."

## Task 10: Client reveal-gate mirrors both server gates

**File:** `client/src/pages/learn/tabs/ConceptLabTab.jsx`

`computeRevealGate` currently checks only `codeReviewVerdict`. Extend to also check `codeReview.nextStep`. If verdict is STRONG/ADEQUATE but `nextStep !== 'READY_FOR_REFERENCE'`, disable the button with the message: `"Reviewer's next step is [nextStep]. Follow that first before revealing."`

## Task 11: Reveal button `aria-describedby`

**File:** `client/src/pages/learn/tabs/ConceptLabTab.jsx`

Add `id="reveal-gate-msg"` on the message span, `aria-describedby="reveal-gate-msg"` on the Button.

## Task 12: `DimBadge` colorblind parity

**File:** `client/src/components/curriculum/CodeReviewResult.jsx`

`DimBadge` renders a colored pill with text. Add a shape icon (`aria-hidden`):
- STRONG → `<CheckCircle2 className="w-3 h-3" />`
- ADEQUATE → `<Minus className="w-3 h-3" />`
- WEAK → `<AlertTriangle className="w-3 h-3" />`

## Task 13: Monaco `tabFocusMode`

**File:** `client/src/components/curriculum/MonacoLabEditor.jsx`

Add `tabFocusMode: true` to the Monaco `options` prop.

## Task 14: `prefers-reduced-motion` on ReferenceDiffModal

**File:** `client/src/pages/learn/tabs/ConceptLabTab.jsx`

Wrap the modal's `motion.div` animations with a `useReducedMotion` guard (same pattern as ConceptPrimerTab).

## Task 15: `clearDraft` unconditional on 2xx

**File:** `client/src/pages/learn/tabs/ConceptLabTab.jsx`

Line ~241. Change `if (result?.attemptId) clearDraft(labId)` to `clearDraft(labId)` — the surrounding `try` block already handles error paths.

## Verification

1. `cd server && npm run lint` — 0 warnings
2. `cd server && npm run boot-check` — 167 modules load cleanly (new `usedFallback` column doesn't break Prisma client generation)
3. `cd server && npm run test:unit` — 1589+ tests pass
4. `cd client && npm run lint` — 0 warnings
5. Manual smoke: submit an attempt via the Lab tab, verify verdict renders with `topFocus` callout at top, reveal button state matches gate

## Commit strategy

One commit: `"Lab Phase A: usedFallback banner + topFocus + reveal-gate mirror + queue cap + a11y"`
