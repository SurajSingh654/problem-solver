# Curriculum Phase 1 · Week 3 (TEAM_ADMIN Authoring UI + Fork Flow) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first user-facing curriculum surface: TEAM_ADMIN can browse global templates, fork one into their team, edit metadata, run AI validators (curriculum + lesson + code review), and publish once gates pass — all via a real UI.

**Architecture:** Server ships `curriculumAdmin.controller.js` + `curriculumFork.service.js` behind `authenticate + requireTeamContext + requireTeamAdmin`. Client ships three new pages (`CurriculumAdminPage`, `TopicAuthoringPage`, `TemplateBrowserPage`) + three shared components (`<VerdictBadge>`, `<PublishGateChecklist>`, `<MarkdownEditor>`). SUPER_ADMIN team-overrides are audited via `CurriculumAdminAuditLog` (model already exists from W1.T9).

**Tech stack (pre-existing except one new client dep):** All backend infra from W1-W2. New client dep: `@uiw/react-md-editor` (lazy-loaded).

**Reference spec:** `docs/superpowers/specs/2026-07-04-curriculum-learn-teach-design.md` §5.1, §5.2, §5.3, §7.4.

---

## Task summary

| # | Task | Files | Key deliverable |
|---|---|---|---|
| 1 | `curriculumFork.service.js` | `server/src/services/curriculum/curriculumFork.service.js` + tests | Deep-clone `TopicTemplate → Topic` atomically; 409 on duplicate |
| 2 | Topic admin CRUD | `curriculumAdmin.controller.js`, `curriculumAdmin.routes.js` + tests | GET/POST/PATCH topics + from-template fork endpoint |
| 3 | Concept + Lab admin CRUD | Extend controller + tests | POST/PATCH concepts + labs under team-admin gate |
| 4 | Review + publish gates | Extend controller + integration test | Trigger validators; enforce publish gates; 400 body per spec |
| 5 | SUPER_ADMIN override audit | Middleware/helper + integration test | Write `CurriculumAdminAuditLog` when SUPER_ADMIN overrides team |
| 6 | Install `@uiw/react-md-editor` | package.json | User-approved install |
| 7 | Client UI primitives | 3 components + tests-if-any | `<VerdictBadge>`, `<PublishGateChecklist>`, `<MarkdownEditor>` |
| 8 | Admin + template browser pages | 2 pages + hooks + route registration | Status board + fork flow |
| 9 | `TopicAuthoringPage` | 1 page + hooks | 4 tabs: Metadata / Concepts / Review / Publish |
| 10 | Fork + tenancy integration tests | `test/integration/*.test.js` | Cross-team 403; SUPER_ADMIN override logged |
| 11 | Verification + roadmap + push | Roadmap update | Pre-push gate green; FF-merge to main |

Total estimated commits: ~11. Test count target: 1690 → ~1730+.

---

## Global conventions (same as W1/W2)

- **Tenancy:** never `req.user.currentTeamId`; always `req.teamId`. All curriculum admin routes filter by `req.teamId`. Cross-team access rejected 403.
- **Rate limiter:** curriculum admin AI-backed routes (review triggers) chain both `aiLimiter` (per-user) + `aiTeamLimiter` (per-team). CRUD-only routes use `apiLimiter`.
- **Prompt-injection:** validators already sanitize; controller shouldn't add new AI plumbing — just calls `contentReview.runValidator(type, input)`.
- **Response envelope:** standard success `{ success, data, meta? }` + error `{ success: false, error: { message, code?, requestId?, details? } }` via `response.js` helpers.
- **Concurrency:** fork inside single `prisma.$transaction`. Publish transitions with `SELECT ... FOR UPDATE`.
- **Feature flag:** everything gated by `FEATURE_CURRICULUM` + `VITE_FEATURE_CURRICULUM`.
- **TDD:** red → green → commit per task.
- **Commits:** short single-line subject, no Co-Authored-By trailer.

---

## Task 1 — `curriculumFork.service.js`

**Files:**
- Create: `server/src/services/curriculum/curriculumFork.service.js`
- Create: `server/test/services/curriculumFork.test.js`

**Interface:**
```javascript
export async function forkTopicTemplate({ templateSlug, teamId, actorUserId }) {
  // 1. Load TopicTemplate + concepts + labs (with cascade eager-load).
  // 2. Check for (teamId, slug) collision → throw 409-compatible error.
  // 3. Inside prisma.$transaction:
  //    a. Create Topic with new id, teamId, slug from template, forkedFromTemplateId = template.id, forkedAt = now(), status = DRAFT.
  //    b. For each ConceptTemplate → create Concept with new id, topicId (new), teamId, all content fields copied.
  //    c. For each LabTemplate → create Lab with new id, conceptId (new), teamId, all content fields copied.
  // 4. Return the created Topic id (or full tree).
}
```

**Tests to cover:**
- Fork produces new IDs for Topic, Concept, Lab (not template IDs).
- `forkedFromTemplateId` set on Topic.
- `forkedAt` set to a recent timestamp.
- All content fields deep-copied (primerMarkdown, primerHtml, taskMarkdown, referenceSolution, etc.).
- `(teamId, slug)` duplicate → throws with code `FORK_DUPLICATE` (or similar) that the controller maps to HTTP 409.
- Whole tree written atomically — if Concept insert fails, Topic insert rolled back.
- Handles template with 0 concepts (edge case).
- Handles concept template with no lab (edge case).

**Watchouts:**
- Concept invariant `Concept.teamId === Topic.teamId` — set explicitly on each Concept insert.
- Lab invariant `Lab.teamId === Concept.teamId` — same.
- Do NOT copy `templateStatus` from template to new team-scoped `status`. New topic starts DRAFT regardless of template status.

---

## Task 2 — Topic admin CRUD + fork route

**Files:**
- Create: `server/src/controllers/curriculumAdmin.controller.js`
- Create: `server/src/routes/curriculumAdmin.routes.js`
- Modify: `server/src/index.js` — mount inside `mountRoutes()`
- Create: `server/test/integration/curriculumAdmin.topic.integration.test.js`

**Routes to expose (all mounted at `/api/*/curriculum/admin`):**

Middleware chain: `authenticate → requireTeamContext → requireTeamAdmin → [rate limiter as noted]`

- `GET /topics` (`apiLimiter`) — list team's topics with status, updatedAt, concept count
- `POST /topics` (`apiLimiter`) — create blank Topic (`teamId = req.teamId`, `status = DRAFT`)
- `PATCH /topics/:id` (`apiLimiter`) — update metadata (name, description, category, estimatedHours, cheatsheetHtml — sanitize this via `sanitize.service`)
- `POST /topics/from-template/:templateSlug` (`apiLimiter`) — call `curriculumFork.forkTopicTemplate(...)`; return the created Topic
- `GET /topics/:id/template-status` (`apiLimiter`) — for the template-updated chip: return `{ hasUpdate: bool, templateUpdatedAt: date | null }`

**Rejection rules:**
- Any topic id not owned by `req.teamId` → 404 (not 403 — don't leak existence).
- Duplicate (teamId, slug) on POST → 409 with `code: 'DUPLICATE_SLUG'`.
- Missing template on from-template → 404.

**Test coverage:**
- Auth: 401 no token; 403 non-team-admin; 200 team-admin.
- List: returns only own-team topics.
- Cross-team: 404 when patching another team's topic id.
- Fork happy path: creates topic + concepts + labs in one call, returns new topic.
- Fork double-attempt: 409.
- Fork non-existent template: 404.

---

## Task 3 — Concept + Lab admin CRUD

**Files:**
- Extend: `curriculumAdmin.controller.js`
- Extend: `curriculumAdmin.routes.js`
- Create: `server/test/integration/curriculumAdmin.concept.integration.test.js`
- Create: `server/test/integration/curriculumAdmin.lab.integration.test.js`

**Routes:**
- `POST /concepts` (body: `{ topicId, slug, name, order, primerMarkdown, workedExample?, ... }`) — sanitize markdown fields; compile `primerHtml` via `sanitizeMarkdownToHtml`; enforce `Concept.teamId = Topic.teamId`.
- `PATCH /concepts/:id` — same sanitization; re-compile `primerHtml` on any primer change.
- `POST /labs` (body: `{ conceptId, title, taskMarkdown, timeboxMinutes?, language, starterCode?, referenceSolution, expectedArtifacts }`) — Lab is 1:1 with Concept; enforce unique.
- `PATCH /labs/:id` — same rules.

**Sanitization:**
- All markdown fields (primer, workedExample, taskMarkdown, cheatsheetMarkdown) pass through `sanitizeMarkdownToHtml` for the HTML column; original markdown stored as-is (it's not rendered raw).
- Any raw HTML in `cheatsheetHtml` on Topic passes through `sanitizeHtml`.

**Rejections:**
- Concept POST with `topicId` from another team → 403.
- Lab POST with `conceptId` from another team → 403.
- Duplicate concept `(topicId, slug)` → 409.
- Duplicate lab `conceptId` (already has a lab) → 409.

**Test coverage:** happy path + cross-team + duplicates + sanitization (script tag in cheatsheet gets stripped in stored HTML column).

---

## Task 4 — Review + Publish routes + gate enforcement

**Files:**
- Extend: `curriculumAdmin.controller.js`
- Extend: `curriculumAdmin.routes.js`
- Create: `server/test/integration/curriculumAdmin.publish-gate.integration.test.js`

**Routes:**
- `POST /topics/:id/review` (`aiLimiter + aiTeamLimiter`) — calls `contentReview.runValidator("CURRICULUM_REVIEW", ...)`; returns verdict + logId; updates `Topic.lastReviewedAt` + `Topic.curriculumReview` cache.
- `POST /topics/:id/publish` (`apiLimiter`) — enforces gate: latest `ContentReviewLog(target=TOPIC).verdict === 'WORTH_LEARNING'` AND every child Concept `status === 'PUBLISHED'`. On success: `Topic.status = PUBLISHED`, `publishedAt = now()`.
- `POST /concepts/:id/review` (`aiLimiter + aiTeamLimiter`) — calls `LESSON_REVIEW` validator.
- `POST /concepts/:id/publish` (`apiLimiter`) — enforces: latest verdict `READY` AND `Concept.readinessRubric` non-null.
- `POST /labs/:id/review` (`aiLimiter + aiTeamLimiter`) — lightweight lab-shape check (task clarity, reference solution present, expectedArtifacts non-empty). May reuse LESSON_REVIEW OR add a new lab-shape validator — decide during impl. Simplest: skip AI for lab-shape check and use a deterministic validator (nothing AI-native to grade). Ship deterministic check for T4.

**Publish gate 400 body shape** (per spec §5.2):
```json
{
  "success": false,
  "error": {
    "message": "Publish blocked",
    "code": "PUBLISH_GATE_BLOCKED",
    "details": {
      "gates": [
        { "id": "curriculum_review_verdict", "label": "Curriculum review verdict", "status": "PASS", "message": "WORTH_LEARNING" },
        { "id": "concepts_all_published", "label": "All concepts PUBLISHED", "status": "FAIL", "message": "2 of 3 published; missing: 02-solid, 03-machine-coding" }
      ]
    }
  }
}
```

**Test coverage:**
- Publish blocked when no review has been run → `curriculum_review_verdict` gate FAIL.
- Publish blocked when review verdict is `WORTH_WITH_ADJUSTMENTS` or `NOT_WORTH_TIME` → FAIL.
- Publish blocked when 1 of N concepts is still DRAFT → concepts_all_published FAIL.
- Publish success when all gates PASS → Topic.status = PUBLISHED.
- Concept publish gate: no verdict → FAIL; verdict READY + rubric present → PASS.

---

## Task 5 — SUPER_ADMIN override audit log

**Files:**
- Create/Modify: helper in `curriculumAdmin.controller.js` (e.g., `auditIfSuperAdminOverride(req, action, payload)`)
- Modify: relevant controller entry points to call the helper
- Create: `server/test/integration/curriculumAdmin.audit.integration.test.js`

**Behavior:**
On any curriculum admin write, if `req.user.globalRole === 'SUPER_ADMIN'` AND the current team context was set via override (`?teamId=` or `X-Team-Id` header — check `req.teamContextOverride` or similar hint from `requireTeamContext`), write `CurriculumAdminAuditLog`:

```javascript
await prisma.curriculumAdminAuditLog.create({
  data: {
    actorUserId: req.user.id,
    actorRole: 'SUPER_ADMIN',
    targetTeamId: req.teamId,
    action: 'TOPIC_PUBLISH',   // or 'TOPIC_EDIT', 'CONCEPT_CREATE', etc.
    payload: { topicId, ...relevantFields },
  },
});
```

**IMPORTANT:** verify how `requireTeamContext` signals a SUPER_ADMIN override. If it doesn't currently, we may need to add a `req.superAdminOverride: boolean` flag. Grep `team.middleware.js` to see current shape.

**Test coverage:**
- Regular TEAM_ADMIN write → no audit row.
- SUPER_ADMIN own-team write → no audit row (they're just acting as a regular team member).
- SUPER_ADMIN with `?teamId=X` override → audit row written with `actorRole: SUPER_ADMIN`, `targetTeamId: X`, correct action.

---

## Task 6 — Install `@uiw/react-md-editor`

Ask user to run:
```bash
cd /Users/surajsingh/Downloads/Projects/problem-solver/client
npm install @uiw/react-md-editor
```

Wait for confirmation. Then commit `package.json` + `package-lock.json`.

---

## Task 7 — Client UI primitives

**Files:**
- Create: `client/src/components/curriculum/VerdictBadge.jsx`
- Create: `client/src/components/curriculum/PublishGateChecklist.jsx`
- Create: `client/src/components/curriculum/MarkdownEditor.jsx`

**`<VerdictBadge>`:** small pill component. Props: `verdict: string`. Renders color-coded badge per verdict family:
- `WORTH_LEARNING | READY | STRONG | PASS` → green (brand-500 bg)
- `WORTH_WITH_ADJUSTMENTS | POLISH | ADEQUATE | PARTIAL` → amber (brand-400 / warning color from existing palette)
- `NOT_WORTH_TIME | NOT_READY | WEAK | FAIL` → red (use existing warn/danger classes)
- `DRAFT | UNKNOWN | REVIEWING | PENDING | ERROR` → gray

Use only allowed brand classes: `brand-{300,400,500,600}`, `brand-{soft,fg-soft,line}`. Check existing status-badge component for the color palette.

**`<PublishGateChecklist>`:** takes `gates: [{ id, label, status, message }]`. Renders as a list with green ✅ / red ❌ per gate. Blocker rendering.

**`<MarkdownEditor>`:** lazy-imports `@uiw/react-md-editor`. Split-pane preview. Props: `value`, `onChange`, `label`, optional `height`. Wrap in `<Lazy>` Suspense helper. Add `manualChunks` entry in `vite.config.js` under `mdEditor` chunk.

---

## Task 8 — CurriculumAdminPage + TemplateBrowserPage

**Files:**
- Create: `client/src/pages/team-admin/curriculum/CurriculumAdminPage.jsx`
- Create: `client/src/pages/team-admin/curriculum/TemplateBrowserPage.jsx`
- Create: `client/src/hooks/useCurriculumAdmin.js` (or split — one hook per query key group)
- Modify: `client/src/App.jsx` — register routes inside the team-admin protected group
- Modify: `vite.config.js` — add `manualChunks` entry for `curriculumAdmin` chunk

**Routes:**
- `/team-admin/curriculum` → `CurriculumAdminPage`
- `/team-admin/curriculum/templates` → `TemplateBrowserPage`

**`CurriculumAdminPage`:**
- Status board — table of topics grouped by status (DRAFT / REVIEWED / PUBLISHED counts + rows).
- "Fork from template" CTA → navigates to `/team-admin/curriculum/templates`.
- "New Topic (blank)" CTA → POSTs to `POST /curriculum/admin/topics` and navigates to the new authoring page.
- Each row clickable → `/team-admin/curriculum/topics/:id`.

**`TemplateBrowserPage`:**
- Lists global templates via `GET /curriculum/admin/templates` (route already exists from spec — verify).
- Each template card: name, category, concept count, "Fork into my team" button.
- On fork click → confirm via `useConfirm` ("Fork LLD template into your team?"), then POST `/curriculum/admin/topics/from-template/:slug`, navigate to authoring page on success.
- 409 handling: show inline error "Already forked — go to My Topics".

**Hooks:**
- `useCurriculumAdminTopics()` — `GET /curriculum/admin/topics`.
- `useCurriculumTemplates()` — `GET /curriculum/admin/templates`.
- `useForkTemplate()` — `POST /curriculum/admin/topics/from-template/:slug` via `useToastingMutation`.
- `useCreateBlankTopic()` — POST via `useToastingMutation`.

**Feature flag:** entire routes gated on `import.meta.env.VITE_FEATURE_CURRICULUM === 'true'` — if OFF, routes 404 in the router.

---

## Task 9 — TopicAuthoringPage (4 tabs)

**Files:**
- Create: `client/src/pages/team-admin/curriculum/TopicAuthoringPage.jsx`
- Create sub-components in same folder:
  - `TopicMetadataTab.jsx`
  - `ConceptsListTab.jsx`
  - `CurriculumReviewTab.jsx`
  - `PublishTab.jsx`
- Extend hooks in `useCurriculumAdmin.js`

**Route:** `/team-admin/curriculum/topics/:id`

**Layout:** tab bar at top (Metadata / Concepts / Curriculum Review / Publish) + tab-content panel.

- **Metadata tab:** editable name, description (via `<MarkdownEditor>`), category, estimatedHours. Save via `useUpdateTopic()` mutation.
- **Concepts tab:** list child concepts with inline edit (order, name, status). Click concept row → opens a Concept detail modal or navigates to concept editor (Phase 1 keeps it inline for simplicity). Includes "New Concept" and "New Lab under this concept" CTAs.
- **Curriculum Review tab:** button "Run curriculum review" — calls `POST /curriculum/admin/topics/:id/review`. Shows latest verdict via `<VerdictBadge>` + full review body rendered (outcomes list, wontTeach, structuralSanity, modulesNeedingWork, etc.).
- **Publish tab:** shows `<PublishGateChecklist>` with all publish gates. Publish button disabled unless all gates PASS. On click → confirm → POST `/publish`.

**Template-updated chip:** if `template-status` endpoint returns `hasUpdate: true`, show a chip near the topic title: "Template updated on {date} — [View diff (Phase 2)]" (chip is informational only in Phase 1).

**Hooks additions:**
- `useTopicDetail(id)` — GET single topic + concepts.
- `useUpdateTopic()` — PATCH.
- `useRunCurriculumReview()` — POST review, invalidates topic detail + review query keys.
- `useTopicTemplateStatus(id)` — GET template-status.
- `usePublishTopic()` — POST publish.
- `useCreateConcept()`, `useUpdateConcept()`, `useCreateLab()`, `useUpdateLab()`, `usePublishConcept()`.

---

## Task 10 — Fork + tenancy integration tests

**Files:**
- Create: `server/test/integration/curriculum.fork.integration.test.js`
- Create: `server/test/integration/curriculum.tenancy.integration.test.js`

**Fork test scenarios:**
- Team A forks LLD template → new Topic + all concepts + labs cloned with new IDs, correct teamId, `forkedFromTemplateId` set.
- Team A tries to fork again → 409.
- Team B forks the same template → succeeds (different teamId).
- Fork inside a transaction is atomic: if we simulate a Concept insert failure mid-fork, Topic row is rolled back (this may need a Prisma test hook or mock — verify).

**Tenancy test scenarios:**
- TEAM_ADMIN of Team A → 200 on their own topic.
- TEAM_ADMIN of Team A → 404 on Team B's topic (existence not leaked).
- TEAM_ADMIN of Team A → 403 (or 404) trying to PATCH Team B's concept.
- SUPER_ADMIN with `?teamId=B` → 200 + audit log row written.
- SUPER_ADMIN without override → operates only on their own team's topics (if any).
- Non-authenticated → 401.
- Non-team-admin (regular USER in team) → 403.

---

## Task 11 — Verification + roadmap + FF-merge to main

**Steps:**
1. Full server test suite → target ~1730+/1730+ (baseline 1690 + ~40 new tests).
2. Client build → passes (with new Monaco / md-editor chunks).
3. Pre-push gate green (server lint / tests / audit / migrate status / client lint / audit / build).
4. Manual smoke: log into local dev as SUPER_ADMIN, visit `/team-admin/curriculum`, fork the LLD template into personal team, verify Topic + concepts + labs created.
5. Add roadmap entry `curriculum-phase-1-week-3-authoring-ui` to `roadmapData.js` under SHIPPED, matching W1/W2 entry shape.
6. Commit roadmap update.
7. `git checkout main && git merge --ff-only feat/curriculum-phase-1-w3 && git push origin main`.
8. Report Week 3 summary.

**Deferred items acknowledged in roadmap notes:**
- Template-diff view (chip only in Phase 1; full diff Phase 2).
- Concept editor is inline; standalone `/team-admin/curriculum/concepts/:id` route deferred.
- Peer teaching-pairing UI (Phase 2).
- `AI_MODEL_PRIMARY` model versioning caching (Phase 2).

---

## Self-review (writing-plans skill)

**Spec coverage:**
- §5.1 team-admin routes: ✅ covered by Tasks 2-4.
- §5.2 publish-gate 400 body: ✅ Task 4.
- §5.3 audit log: ✅ Task 5.
- §7.4 authoring pages: ✅ Tasks 8-9.
- §14 template-update chip: ✅ Task 9 (minimal chip).

**Placeholder scan:**
- Task 4 lab-review defaults to a deterministic check (no AI). If implementation reveals need for LAB validator via AI, add in-task.
- No TBD / TODO / vague requirements.

**Type consistency:**
- `curriculumFork.forkTopicTemplate({ templateSlug, teamId, actorUserId })` matches its use in Task 2's POST from-template handler.
- Publish gate 400 body shape is stable across Task 4 (server) and Task 9 (client `<PublishGateChecklist>`).
- Hook names in Task 9 match the endpoints in Tasks 2-4.

Plan complete.
