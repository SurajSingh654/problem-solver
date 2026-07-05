# Curriculum Phase 1 · Week 4 (Learner Catalog + ConceptPage + Async Attempts) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the learner-facing side of the curriculum feature: catalog + enroll + concept detail + lab-attempt async pipeline + check-in flow + real-time WS notification. This makes published curricula (from W3) actually reachable by learners.

**Architecture:**
- **Server:** `curriculum.controller.js` (learner reads + writes, team-scoped via `req.teamId`). Attempt submit uses fire-and-forget `.then()` chain (matching `teaching.controller.js:1237` pattern), transitions `LabAttempt.reviewStatus` through PENDING → REVIEWING → COMPLETED | ERROR. On completion, `sendToUser` fires `curriculum:review_ready` WS event to the attempt owner.
- **Signal writers:** `conceptMastery.service.recordPrimerReadSignal` / `recordCheckInSignal` / `recordLabSignal` delegate to `mentor.service.updateMastery()` (the storage-layer writer). Signal writes happen inside the source-event `$transaction` (atomic with source per Security M5).
- **Client:** Upgrade the existing empty-state `LearnPage`, `TopicDetailPage`, and `ConceptPage` (all shipped as scaffolds in the earlier concept-mastery work). ConceptPage becomes a 5-tab layout (Primer / Lab / Check-in / Notes / Teach). Lab tab in W4 is a minimal viewer + "Open Lab" CTA — the full Monaco editor lands in W5.

**Reference spec:** `docs/superpowers/specs/2026-07-04-curriculum-learn-teach-design.md` §5.1 (learner routes), §5.2 (reveal gate), §5.3 (signal writers), §5.4 (async pattern + `sendToUser`), §7.2 (ConceptPage tabs).

---

## Task summary

| # | Task | Files | Deliverable |
|---|---|---|---|
| 1 | Learner catalog + concept detail routes | `curriculum.controller.js` + routes + tests | GET topics / topic / concept, POST enroll |
| 2 | Lab attempt submit + polling (async 202) | Extend controller + tests | fire-and-forget CODE_REVIEW, reviewStatus state machine |
| 3 | Reveal-reference gate + check-in submit | Extend controller + tests | Struggle-first reveal + CHECK_IN validator wiring |
| 4 | WS `curriculum:review_ready` + signal writers | `conceptMastery.service.js` new writers + WS fire | recordPrimerReadSignal / recordCheckInSignal / recordLabSignal delegate to mentor.updateMastery |
| 5 | Client hooks | `useCurriculumLearn.js` (or split) | useLearnCatalog / useTopicDetail / useConceptDetail / useSubmitAttempt / useAttempt / useSubmitCheckIn / useCurriculumReviewReady |
| 6 | LearnPage + TopicDetailPage upgrade | 2 pages | Catalog with published topics + topic detail with concept tree |
| 7 | ConceptPage 5-tab shell | 1 page + 5 tab components | Primer / Lab / Check-in / Notes / Teach |
| 8 | Integration tests | 3 test files | attempt round-trip + async ERROR + WS event delivery |
| 9 | Verification + roadmap + push | Roadmap update | Pre-push green, FF-merge to main |

Total: ~9 commits. Test count target: 1765 → ~1795+.

---

## Global conventions (same as W1-W3)

- **Tenancy:** `req.teamId` always. Cross-team → 404 (avoid enumeration leaks).
- **Rate limiter:** learner AI-backed routes (attempt submit — triggers CODE_REVIEW; check-in submit — triggers CHECK_IN) chain `aiLimiter + aiTeamLimiter`. Read-only + polling routes use `apiLimiter`.
- **Response envelope:** standard success/error via `response.js`.
- **Concurrency:** `LabAttempt.attemptNumber` allocation via `INSERT ... ON CONFLICT DO NOTHING` + retry (per spec §5.5). `pg_advisory_xact_lock` NOT used (per LeadEng M1).
- **Signal writes atomic with source event:** inside the same `prisma.$transaction` as the attempt/check-in write.
- **Feature flag:** `FEATURE_CURRICULUM` + `VITE_FEATURE_CURRICULUM`.
- **TDD** + short single-line commits + no Co-Authored-By trailer.

---

## Task 1 — Learner catalog + concept detail routes

**Files:**
- Create: `server/src/controllers/curriculum.controller.js`
- Create: `server/src/routes/curriculum.routes.js`
- Modify: `server/src/index.js` — mount inside `mountRoutes()`
- Create: `server/test/integration/curriculum.learner.integration.test.js`

**Routes** (auth chain `authenticate + requireTeamContext`, `apiLimiter`, filter by `req.teamId`):

- `GET /curriculum/topics` — list PUBLISHED topics for this team + user's enrollment state per topic.
- `GET /curriculum/topics/:slug` — topic detail with concepts (ordered), user's enrollment, per-concept progress (mastery score + status).
- `POST /curriculum/topics/:slug/enroll` — upsert `TopicEnrollment` for `req.user.id` on this topic. Body accepts `{ preferences: { targetOutcome? }, calibration? }` (both optional; enrollment can happen bare).
- `GET /curriculum/concepts/:slug` — concept detail: primer, workedExample, expectedQuestions, canonicalSources, lab summary (id + title + timebox + status but NOT reference solution), user's most recent LabAttempt summary, user's ConceptMastery signals count.

**Rejections:**
- Topic slug not published → 404 (topic exists but not learner-visible).
- Topic/concept not in this team → 404.
- Enrollment on a team-mismatched topic → 404.

**Note on Concept status:** DRAFT/REVIEWED concepts are NOT visible to learners — only PUBLISHED. But if a Topic is PUBLISHED and has some DRAFT concepts, show only the PUBLISHED ones with a "more coming" hint (or omit — simpler).

**Test coverage:**
- 401 no token.
- 200 list — only PUBLISHED topics returned; DRAFT topics filtered out.
- 200 detail — concepts ordered by `order`.
- 200 concept detail — no reference solution leaked.
- 404 cross-team probe.
- 404 attempting to enroll in DRAFT topic.
- 201 enrollment upsert (repeat call → idempotent).

---

## Task 2 — Lab attempt submit + polling

**Files:**
- Extend: `curriculum.controller.js`
- Extend: `curriculum.routes.js`
- Create: `server/test/integration/curriculum.attempt.integration.test.js`

**Routes:**

- `POST /curriculum/labs/:id/attempts` — chain `aiLimiter + aiTeamLimiter`. Body: `{ code }` (multi-file packed with `// File: X.java` separators). Server-side 100KB cap via Zod (per Security m2).
  - Inside `prisma.$transaction`: allocate `attemptNumber = MAX + 1`, insert `LabAttempt (reviewStatus=PENDING, submittedAt=now)`.
  - Return `202 { attemptId, reviewStatus: "PENDING", attemptNumber }`.
  - Fire unawaited `.then()` chain: `runValidator("CODE_REVIEW", { targetId: labId, ... })`. On success → `PATCH LabAttempt { reviewStatus: COMPLETED, reviewedAt, codeReviewVerdict, codeReview }`. On error → `PATCH LabAttempt { reviewStatus: ERROR }`.
  - After PATCH, fire `sendToUser(userId, { type: "curriculum:review_ready", attemptId, reviewStatus, verdict })` (from W1.T2 primitive) — Task 4 will wire this.

- `GET /curriculum/labs/:id/attempts/:attemptId` — poll for review result. Only returns the attempt if `attempt.userId === req.user.id` (private). 404 otherwise.

**Zod cap on body.code:**
```javascript
const submitBodySchema = z.object({
  code: z.string().max(100_000),  // 100 KB Postgres text is fine; hard cap enforced here.
}).strict();
```

**Async pattern (matches spec §5.4 + `teaching.controller.js:1237` precedent):**

```javascript
export async function submitAttempt(req, res) {
  // ... validation, team scope check ...
  const attempt = await prisma.$transaction(async (tx) => {
    const maxAttempt = await tx.labAttempt.aggregate({
      where: { userId: req.user.id, labId },
      _max: { attemptNumber: true },
    });
    const attemptNumber = (maxAttempt._max.attemptNumber ?? 0) + 1;
    return tx.labAttempt.create({
      data: {
        labId,
        userId: req.user.id,
        attemptNumber,
        code: body.code,
        reviewStatus: "PENDING",
      },
    });
  });

  // Fire-and-forget review — controller returns 202 immediately.
  runValidator("CODE_REVIEW", { targetId: labId, /* + lab/concept/attempt context */ })
    .then((result) => onReviewCompleted(attempt.id, result))
    .catch((err) => onReviewFailed(attempt.id, err));

  return success(res, { attemptId: attempt.id, reviewStatus: attempt.reviewStatus, attemptNumber: attempt.attemptNumber }, 202);
}

async function onReviewCompleted(attemptId, result) {
  const updated = await prisma.labAttempt.update({
    where: { id: attemptId },
    data: {
      reviewStatus: "COMPLETED",
      reviewedAt: new Date(),
      codeReviewVerdict: result.body.codeReviewVerdict,
      codeReview: result.body,
    },
  });
  // Task 4 will add sendToUser here.
}

async function onReviewFailed(attemptId, err) {
  console.warn(`[curriculum:attempt] review failed for ${attemptId}:`, err.message);
  await prisma.labAttempt.update({
    where: { id: attemptId },
    data: { reviewStatus: "ERROR", reviewedAt: new Date() },
  });
  // Task 4 will add sendToUser here.
}
```

**Test coverage:**
- 401/404 auth + team gates.
- 202 submit — attempt created with PENDING status + correct attemptNumber (increments on subsequent submissions).
- 400 on empty body or code >100KB.
- Polling: GET returns PENDING immediately, then COMPLETED after mock aiComplete resolves.
- ERROR state: force `runValidator` to throw, verify LabAttempt.reviewStatus becomes ERROR.
- Cross-user: user A can't GET user B's attempt (404).

Use `_overrideValidatorSpec("CODE_REVIEW", { aiComplete: mockFn })` for controllable outputs. Because the async runs after 202 returns, tests may need to `await new Promise(setTimeout, ...)` briefly OR poll GET until reviewStatus is not PENDING (with a timeout of ~5s).

---

## Task 3 — Reveal-reference gate + check-in submit

**Files:**
- Extend: `curriculum.controller.js`
- Extend: `curriculum.routes.js`
- Extend: `curriculum.attempt.integration.test.js` (or add new file for check-in)

**Routes:**

- `POST /curriculum/labs/:id/reveal-reference` — no body. Enforces spec §5.2: latest LabAttempt for `(userId, labId)` must have `codeReviewVerdict IN (STRONG, ADEQUATE)` AND `nextStep === READY_FOR_REFERENCE`. If passes: set `revealedReferenceAt = now()` on the attempt, return the Lab's `referenceSolution`. If fails: 403 with specific error code (`REVEAL_BLOCKED_VERDICT` / `REVEAL_BLOCKED_NEXT_STEP` / `REVEAL_BLOCKED_NO_ATTEMPT`).

- `POST /curriculum/concepts/:slug/checkin` — chain `aiLimiter + aiTeamLimiter`. Body: `{ recallAnswer, applyAnswer, buildAnswer, preConfidence (1-5) }`.
  - Inside `$transaction`: run `runValidator("CHECK_IN", { concept, answers, preConfidence })` (synchronous — check-in review is fast, ~2s with AI_MODEL_FAST, doesn't need async pattern), allocate `attemptNumber = MAX+1`, insert `ConceptCheckIn` row with verdict + calibrationDelta.
  - Since ConceptCheckIn has attemptNumber (re-check-in support per spec §4), same INSERT-ON-CONFLICT pattern.
  - Return `success(res, { checkIn, verdict, calibrationDelta })`.

**Unlock rule per spec §6.4:** ConceptCheckIn is allowed only when the user has ≥1 LabAttempt with `codeReviewVerdict IN (STRONG, ADEQUATE)` for that concept's lab. Enforce at server:

```javascript
const eligibleAttempt = await prisma.labAttempt.findFirst({
  where: {
    userId: req.user.id,
    lab: { conceptId: concept.id },
    codeReviewVerdict: { in: ["STRONG", "ADEQUATE"] },
  },
});
if (!eligibleAttempt) {
  return error(res, "Check-in locked — complete lab first with STRONG or ADEQUATE verdict", 403, "CHECKIN_LOCKED");
}
```

**Test coverage:**
- Reveal gate: STRONG + READY_FOR_REFERENCE → 200 with reference. STRONG + MINI_DRILL → 403. WEAK → 403. No attempt → 403. Cross-user attempt → 403.
- Reveal sets `revealedReferenceAt` (test the state change).
- Check-in: locked (403) when no STRONG/ADEQUATE attempt exists. Unlocked and 200 with verdict when eligible. calibrationDelta computed. Signal writers fire (Task 4 wires the writer — Task 3 leaves TODOs).

---

## Task 4 — WS event + signal writers

**Files:**
- Modify: `server/src/services/websocket.service.js` (already has `sendToUser` from W1.T2 — no change needed unless a helper is warranted).
- Modify: `server/src/services/curriculum/conceptMastery.service.js` — add three write methods.
- Modify: `server/src/services/mentor.service.js` — expand `VALID_SIGNAL_SOURCES` to include `checkin` + `primer_read` (per spec §5.3).
- Modify: `curriculum.controller.js` — wire signal writers into attempt-completion + check-in submit + primer-read endpoint.
- Add: `GET /curriculum/concepts/:slug/mark-primer-read` OR `POST` — small route that writes a `primer_read` signal. Simpler: fold into the concept-detail GET (fires a low-weight signal once per session on first fetch). Or a dedicated POST. Recommend the dedicated POST for testability.
- Extend: `curriculum.attempt.integration.test.js` — assert `sendToUser` fires on both COMPLETED and ERROR paths + assert `ConceptMastery.signals` gets appended.

**`conceptMastery.service.js` new methods:**

```javascript
import { updateMastery } from "../mentor.service.js";

/**
 * Record a check-in signal on ConceptMastery.
 * calibrationDelta is passed for D10 tracking.
 * Called inside the check-in submit transaction — atomic with the ConceptCheckIn insert.
 */
export async function recordCheckInSignal(tx, { userId, conceptId, verdict, calibrationDelta }) {
  const value = verdict === "PASS" ? 100 : verdict === "PARTIAL" ? 60 : 20;
  await updateMastery(tx, {
    userId,
    conceptId,
    source: "checkin",
    value,
    metadata: { verdict, calibrationDelta },
  });
}

/**
 * Record a practice signal (from a completed lab attempt).
 * Called from the async review completion path — separate txn from attempt submit.
 */
export async function recordLabSignal({ userId, conceptId, codeReviewVerdict }) {
  if (!["STRONG", "ADEQUATE", "WEAK"].includes(codeReviewVerdict)) return;
  const value = { STRONG: 100, ADEQUATE: 70, WEAK: 40 }[codeReviewVerdict];
  await updateMastery(prisma, {
    userId,
    conceptId,
    source: "practice",
    value,
    metadata: { codeReviewVerdict },
  });
}

/**
 * Record a light "user opened primer" engagement signal.
 * Called from POST /curriculum/concepts/:slug/mark-primer-read.
 */
export async function recordPrimerReadSignal({ userId, conceptId }) {
  await updateMastery(prisma, {
    userId,
    conceptId,
    source: "primer_read",
    value: 10,  // Low weight — engagement, not competence.
    metadata: {},
  });
}
```

**Verify `mentor.service.updateMastery` signature:** it may be `updateMastery(userId, conceptId, signal)` or `updateMastery({ userId, ... })`. Match the actual shape. The BA review in W1 mentioned this function exists at `mentor.service.js:305` — grep and adapt.

**`VALID_SIGNAL_SOURCES` expansion:** find the constant in `mentor.service.js`, add `checkin` + `primer_read` if not already there. Verify `computeScore(log)` handles the new sources (may need to add weight entries).

**WS wiring in `curriculum.controller.js`:**

```javascript
import { sendToUser } from "../services/websocket.service.js";

async function onReviewCompleted(attemptId, result) {
  const updated = await prisma.labAttempt.update({
    where: { id: attemptId },
    data: {
      reviewStatus: "COMPLETED",
      reviewedAt: new Date(),
      codeReviewVerdict: result.body.codeReviewVerdict,
      codeReview: result.body,
    },
    include: { lab: { select: { conceptId: true } } },
  });

  // Fire the practice signal AFTER completion, in its own txn.
  await recordLabSignal({
    userId: updated.userId,
    conceptId: updated.lab.conceptId,
    codeReviewVerdict: result.body.codeReviewVerdict,
  });

  // Notify the user.
  sendToUser(updated.userId, {
    type: "curriculum:review_ready",
    attemptId,
    reviewStatus: "COMPLETED",
    verdict: result.body.codeReviewVerdict,
  });
}

async function onReviewFailed(attemptId, err) {
  const updated = await prisma.labAttempt.update({
    where: { id: attemptId },
    data: { reviewStatus: "ERROR", reviewedAt: new Date() },
  });
  sendToUser(updated.userId, {
    type: "curriculum:review_ready",
    attemptId,
    reviewStatus: "ERROR",
  });
}
```

**Test coverage:**
- Signal write on check-in submit inside the txn → assert ConceptMastery.signals appended.
- Signal write on attempt COMPLETED → assert signals row.
- No signal write on WEAK+ADDRESS_AND_RESUBMIT (still writes practice signal at value=40).
- `sendToUser` called on both COMPLETED and ERROR (test via a WS test hook or a spy on the sendToUser function).

---

## Task 5 — Client hooks

**Files:**
- Create: `client/src/hooks/useCurriculumLearn.js`
- Create: `client/src/services/curriculumLearn.api.js`

**Hook exports:**

```javascript
export function useLearnCatalog()        // GET /curriculum/topics
export function useTopicDetail(slug)      // GET /curriculum/topics/:slug
export function useConceptDetail(slug)    // GET /curriculum/concepts/:slug
export function useEnrollInTopic(slug)    // POST /curriculum/topics/:slug/enroll (useToastingMutation)
export function useSubmitAttempt(labId)   // POST /curriculum/labs/:id/attempts (returns { attemptId, ... })
export function useAttempt(labId, attemptId, { pollingIntervalMs = 3000 })  // GET with polling until reviewStatus !== PENDING/REVIEWING
export function useSubmitCheckIn(slug)    // POST /curriculum/concepts/:slug/checkin
export function useRevealReference(labId) // POST /curriculum/labs/:id/reveal-reference
export function useMarkPrimerRead(slug)   // POST /curriculum/concepts/:slug/mark-primer-read (fire-and-forget)

// WS subscription
export function useCurriculumReviewReady(attemptId, { onCompleted, onError })
```

**`useAttempt` polling logic** — use TanStack Query's `refetchInterval`:

```javascript
export function useAttempt(labId, attemptId) {
  return useQuery({
    queryKey: ["curriculum", "attempt", attemptId],
    enabled: !!attemptId,
    queryFn: () => api.get(`/curriculum/labs/${labId}/attempts/${attemptId}`).then((r) => r.data.data.attempt),
    refetchInterval: (query) => {
      const status = query.state.data?.reviewStatus;
      if (status === "COMPLETED" || status === "ERROR") return false; // Stop polling.
      return 3000; // Poll every 3s.
    },
  });
}
```

**`useCurriculumReviewReady` WS hook** — subscribes to the existing WS connection (from `websocket.service.js` client side — grep for the client WS setup, may be `client/src/services/websocket.js` or similar). Filter events by `type === "curriculum:review_ready"` AND `payload.attemptId === attemptId`.

If a WS hook helper already exists (`useWebSocketEvent`?), reuse it. Otherwise add a small subscription with useEffect + cleanup.

---

## Task 6 — LearnPage + TopicDetailPage upgrade

**Files:**
- Modify: `client/src/pages/learn/LearnPage.jsx` (currently empty-state per W1 analysis)
- Modify: `client/src/pages/learn/TopicDetailPage.jsx`

**LearnPage:** grid of PUBLISHED topics for the current team. Each card: name, category badge, estimated hours, enrollment state (Enrolled / Not enrolled), Enroll CTA or Continue CTA.

Empty state: "No published curricula yet. Ask your team admin to publish one."

**TopicDetailPage:** overview + concept list (in `order`). Each concept row shows: name, status badge, mastery score (from `ConceptMastery.score` if enrolled), progress indicator. Click concept → `/learn/concepts/:slug`.

Header: enrollment card with target-outcome selector (INTERVIEW_PASS / TEACH_TO_TEAM / BUILD_PRODUCTION / RESEARCH — match the existing `TargetOutcome` enum from `TopicEnrollment.preferences`). If not enrolled, "Enroll" primary button; if enrolled, show current progress + "Pause" / "Continue" options.

**Feature-flag gate**: routes only registered if `VITE_FEATURE_CURRICULUM === "true"`. Match the W3 pattern in App.jsx.

**Chunk:** these live in the existing `learn` chunk if there is one; otherwise no new manualChunks entry needed (they don't pull heavy deps).

---

## Task 7 — ConceptPage 5-tab shell

**Files:**
- Modify: `client/src/pages/learn/ConceptPage.jsx`
- Create: `client/src/pages/learn/tabs/ConceptPrimerTab.jsx`
- Create: `client/src/pages/learn/tabs/ConceptLabTab.jsx`
- Create: `client/src/pages/learn/tabs/ConceptCheckInTab.jsx`
- Create: `client/src/pages/learn/tabs/ConceptNotesTab.jsx`
- Create: `client/src/pages/learn/tabs/ConceptTeachTab.jsx`

Reuse the tab-bar UI pattern established in W3.T9's `TopicAuthoringPage`.

**Tabs:**

1. **Primer** — rendered `primerMarkdown` (via existing markdown renderer OR the sanitized `primerHtml` if the server compiled it). Includes `useMarkPrimerRead` fire-and-forget on first mount. Shows `workedExample` in a callout below.

2. **Lab** — minimal Phase 1 view (Monaco editor is W5):
   - Task description (rendered `taskMarkdown`)
   - Timebox, expected artifacts
   - CTA: "Open lab (Monaco editor coming in Phase 1 Week 5)" — for W4, links to a placeholder or is disabled with a "coming soon" chip.
   - If user has attempts: attempt history table (attemptNumber, submittedAt, reviewStatus, verdict badge).
   - "Reveal reference" button — disabled unless gate passes.

3. **Check-in** — 3-question form (recall / apply / build) + preConfidence slider (1-5). Submit button gated: disabled unless the user has an eligible STRONG/ADEQUATE attempt (server enforces this; client shows a lock message + link back to Lab tab).
   - Shows most recent check-in verdict below if exists.

4. **Notes** — reuse existing `<NotesList>` filtered by `linkedEntityType=CONCEPT&linkedEntityId=<conceptId>`. If NotesList doesn't accept those filter props, add them. "New note" prefills the concept link.

5. **Teach** — CTA: "Schedule a teaching session on this concept" — links to the existing teaching-session create flow with `conceptId` prefilled. Shows past sessions for this concept + peer ratings + `teachingReady` status.

**`useCurriculumReviewReady` wiring:** on the LabTab, subscribe to WS events for the latest PENDING/REVIEWING attempt. When event fires, invalidate the attempt query so the UI reflects the new status.

---

## Task 8 — Integration tests

**Files:**
- Create/extend: `server/test/integration/curriculum.attempt.integration.test.js` (some of this may already exist from Task 2)
- Create: `server/test/integration/curriculum.async-review-error.integration.test.js`
- Create: `server/test/integration/curriculum.ws-review-ready.integration.test.js`

**Coverage:**

- **`curriculum.attempt.integration`** — happy path: submit attempt → GET returns PENDING → wait for async → GET returns COMPLETED with STRONG verdict → reveal-reference succeeds → signal appended to ConceptMastery.

- **`curriculum.async-review-error`** — force `runValidator` to throw → LabAttempt.reviewStatus becomes ERROR → GET returns ERROR → reveal-reference still blocked (no verdict).

- **`curriculum.ws-review-ready`** — this is trickiest. Mock `sendToUser` to a spy and verify it's called with the correct payload on both COMPLETED and ERROR paths. Real WS delivery test requires a WS client, which is complex — a spy is sufficient for W4.

Bump `TEST_TIMEOUT_MS = 30000` (or 60000 for the attempt round-trip since it awaits async completion).

Test slug prefix `test_w4_` to avoid cross-file collisions.

---

## Task 9 — Verification + roadmap + FF-merge to main

1. Full server test suite → target ~1795+/1795+ (baseline 1765 + ~30 new).
2. Client build → succeeds, no new heavy chunks (learn pages are small).
3. Pre-push gate green (all 7 checks).
4. Add roadmap entry `curriculum-phase-1-week-4-learner-ui` to `roadmapData.js` under SHIPPED, matching W1/W2/W3 shape.
5. Commit roadmap update.
6. `git checkout main && git merge --ff-only feat/curriculum-phase-1-w4 && git push origin main`.
7. Report Week 4 summary.

**Deferred to Week 5+:**
- LabPage (Monaco) — full code entry UI.
- D8 mapping adapter in `designAptitudeStats.js` (LLD lab attempts feed D8 designSessions count).
- Concept editor Phase 2 polish (canonical-sources array editor, etc.).

---

## Self-review

**Spec coverage:**
- §5.1 learner routes: Tasks 1-3.
- §5.2 reveal gate: Task 3.
- §5.3 signal writers: Task 4.
- §5.4 async pattern + sendToUser: Tasks 2 + 4.
- §7.2 ConceptPage tabs: Task 7.

**Placeholders:** none.

**Type consistency:**
- `runValidator(type, input)` shape matches W2.T2 contract.
- `sendToUser(userId, message)` shape matches W1.T2 contract.
- `LabAttempt.reviewStatus` state machine values (PENDING / REVIEWING / COMPLETED / ERROR) match the enum from W1.T5.

Plan complete.
