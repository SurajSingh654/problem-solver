# ProbSolver — Feedback & Bug Tracking Log

Living document for triaging user-reported feedback from the in-app feedback widget (and any other source). Updated every time a new feedback export is processed. One entry per reported item; entries persist after resolution so the history of what users hit and how it was handled stays auditable.

## Workflow for the next export

When a new export arrives (e.g. `probsolver-feedback-YYYY-MM-DDTHH-MM.md`):

1. **Don't overwrite this file.** Open it and append/update entries — never rewrite from scratch.
2. **Match by `Feedback ID`** (the `cmpXXX...` cuid the export carries). If the ID already exists below, update the existing entry's status / add notes — do not duplicate.
3. **Triage in priority order**: 🐛 Bugs first (highest severity first within bugs), then ❓ Questions, then 💡 Suggestions.
4. **For each item** record:
   - Original report (verbatim) — preserves the user's words even after they leave the team.
   - Root cause / analysis — what the problem actually is, with file:line refs where they help.
   - Resolution path — `RESOLVED` (commit hash + brief), `PLANNED` (roadmap id), `WON'T FIX` (rationale), or `ACKNOWLEDGED`.
   - Reply-to-user copy — one short paragraph the team can paste into the feedback tool.
5. **Update the summary table** at the top so the at-a-glance view stays accurate.
6. **Commit the update** in the same PR as any code fix, so the trail of "user reported X → we did Y" lives in `git log`.

## Status legend

| Status         | Meaning                                                         |
| -------------- | --------------------------------------------------------------- |
| `OPEN`         | Reported, not yet triaged                                       |
| `TRIAGED`      | Root cause identified, fix not yet started                      |
| `IN PROGRESS`  | Being actively worked on                                        |
| `RESOLVED`     | Fix shipped — commit hash referenced                            |
| `PLANNED`      | Roadmap item created; not in active build                       |
| `WON'T FIX`    | Declined with documented rationale                              |
| `DUPLICATE`    | Points to canonical entry                                       |
| `ACKNOWLEDGED` | Informational / Q&A item; no code action required               |

---

## Summary

| #   | Title                               | Type | Severity   | Status        | Feedback ID                  | Resolution                                                  |
| --- | ----------------------------------- | ---- | ---------- | ------------- | ---------------------------- | ----------------------------------------------------------- |
| 1   | Problems review not working as expected | 🐛 | `CRITICAL` | `RESOLVED`    | `cmpl5lefk0006bvxu3gppm9ph`  | Commit [`dac9e19`](#1--problems-review-not-working-as-expected) |
| 2   | Unable to review past quizzes       | 🐛   | `CRITICAL` | `RESOLVED`    | `cmpl0q6n0001c1q9w58rt1ey1`  | Commit [`ac5e6f6`](#2--unable-to-review-past-quizzes)       |
| 3   | Time complexity hint per problem    | ❓   | `LOW`      | `PLANNED`     | `cmpc65upk000d45v2b6xz1gi4`  | Roadmap [`problem-optimal-complexity-fields`](#3--time-complexity-hints-on-coding-problems) |

**Counts:** 2 resolved · 1 planned · 0 in progress · 0 open · 0 won't fix
**Last updated:** 2026-05-25 (export `probsolver-feedback-2026-05-25T12-07.md`)

---

## Items

### #1 — Problems review not working as expected

| Field            | Value                                                     |
| ---------------- | --------------------------------------------------------- |
| **Feedback ID**  | `cmpl5lefk0006bvxu3gppm9ph`                               |
| **Type**         | 🐛 BUG                                                    |
| **Severity**     | `CRITICAL`                                                |
| **Status**       | `RESOLVED` · shipped 2026-05-25                           |
| **Submitter**    | Sooraj Singh (surajsinghj1654@gmail.com) · Binary Thinkers |
| **Reported**     | 2026-05-25                                                |
| **Resolved**     | 2026-05-25                                                |
| **Affected area**| Review Queue                                              |

#### Original report

> When you are trying to review any problem. It is asking for three things: Pattern, Key Insight and Complexity and below we have Text-area to fill details. Nothing mentioned the format what to fill and how to fill. Everything is plain text.
>
> When we filled details for review:
> **New (recall):** HashMap · Array Element stored as key and Element as Value · Complexity: Time=O(n), Space=O(n)
> **Old (notes):** Pattern: Array / Hashing · Key Insight: "The moment I saw, find pair of number from an array. I am able to think of HashMap" · Complexity: T: O(n) · S: O(n)
>
> There is Diff checker that is just checking for words, nothing else... There is no check if current recall is correct or not.
>
> After Review, we need to select confidence level — there is no measurement if current confidence level is correct or not...
>
> There are multiple bugs here....

**Steps to reproduce:** Click on any review for problem.

#### Root cause

Three distinct bugs sharing the same modal (`client/src/pages/ReviewQueuePage.jsx:114` `ReviewModal`):

1. **Format guidance is decorative, not functional.** The 3 prompt cards (Pattern / Key Insight / Complexity) at lines 282-297 are display-only. The actual input is a single free-form textarea at line 304 with placeholder *"Write what you remember... pattern, approach, key insight, complexity..."* — no structure, no per-field hint. Users dump everything into one box.
2. **The diff is purely string-matching, not semantic.** `client/src/components/features/solutions/RecallDiff.jsx:72` calls `diffWordsWithSpace` from the `diff` library. Sooraj's recall ("HashMap") vs notes ("Array / Hashing") share zero words but reference the same data structure family — word-diff says ~15% coverage, the user reads "you failed" when they got it right. False-negative feedback erodes trust in the platform.
3. **Confidence rating is uncalibrated.** Phase 3 lets the user self-rate 1-5; that score flows into `sm2EasinessFactor` and schedules the next review. There's no signal anywhere measuring whether the rating is accurate. Overconfident users get pushed out by ~2× the spacing — system reinforces the bias.

The AI infrastructure to fix #2 and #3 already exists (`useReviewHints` at `client/src/hooks/useAI.js:58` calls `POST /ai/review-hints/:solutionId` for follow-up questions); same shape extends to grading.

#### Resolution

Shipped in commit `dac9e19` — *Fix recall review: structured fields + AI semantic grading + calibration nudge*. Three coupled changes:

1. **Structured 3-field recall input** — `client/src/pages/ReviewQueuePage.jsx` `ReviewModal`. Replaced the single free-form textarea with Pattern (line input, placeholder *"e.g. HashMap, Two Pointers, Sliding Window"*), Key Insight (textarea, placeholder *"In one sentence — what's the 'aha'?"*), and Complexity (line input with format hint *"Time: O(?), Space: O(?)"*). Each field carries clear inline guidance so the user knows what to fill where.
2. **AI semantic grading endpoint** `POST /api/v1/ai/review-grade/:solutionId` — new `gradeReviewRecall` controller in `server/src/controllers/ai.controller.js`. Takes the structured recall, runs the LLM grader (gpt-4o-mini, temperature 0.2, surface `review-grade`), and returns `{ pattern: {match, feedback}, keyInsight: {match, feedback}, complexity: {match, feedback}, overall, suggestedConfidence, fallback }`. Synonyms count as matches per the system prompt's explicit rules ("HashMap matches Hashing or Hash Table"; "O(n) matches linear time"). Validate→fallback pattern: malformed AI output → deterministic conservative grade with `fallback: true`. AI failures don't 500 the modal — they degrade gracefully. Wire-level test in `server/test/controllers/ai.reviewGrade.test.js` (6 cases: empty rejection, valid, malformed, throws, 404, confidence clamp).
3. **AI Grade view + calibration nudge** — new `AiGradeView` component in `ReviewQueuePage.jsx` renders per-field ✓ / ◐ / ✗ cards with the AI's feedback. Added as the default tab in the reveal phase (with Side-by-side and Diff retained as fallbacks for users who want the legacy views). In the Rate phase, the user's confidence picker now shows the AI's suggested rating inline; if the gap between user and AI is ≥ 2, a soft *"Calibration check"* advisory surfaces — non-blocking, so users keep agency over the SM-2 input.

**Files changed (6):** `server/src/controllers/ai.controller.js` (+~140 LOC for `gradeReviewRecall` + helpers), `server/src/routes/ai.routes.js` (+1 route), `server/test/controllers/ai.reviewGrade.test.js` (new, +160 LOC), `client/src/hooks/useAI.js` (+`useReviewGrade`), `client/src/pages/ReviewQueuePage.jsx` (structured fields, AiGradeView, calibration nudge), `docs/feedback-log.md` (this entry). 278/278 server tests pass; client lint + build clean.

#### Reply-to-user copy

> Hi Sooraj — confirmed all three issues and shipped the fix in `dac9e19`. The recall form is now structured (Pattern / Key Insight / Complexity as separate fields with format hints), the comparison uses AI semantic matching instead of word-by-word diff (so "HashMap" and "Hashing" correctly count as a match), and the confidence rating is now paired with an AI-suggested score plus a calibration nudge if the gap is wide. Your detailed example with HashMap vs Hashing is exactly what convinced us to swap to semantic grading — thank you.

---

### #2 — Unable to review past quizzes

| Field            | Value                                                       |
| ---------------- | ----------------------------------------------------------- |
| **Feedback ID**  | `cmpl0q6n0001c1q9w58rt1ey1`                                 |
| **Type**         | 🐛 BUG                                                      |
| **Severity**     | `CRITICAL`                                                  |
| **Status**       | `RESOLVED` · shipped 2026-05-25                             |
| **Submitter**    | Jayshree (jayshreeprajapati426@gmail.com) · Binary Thinkers |
| **Reported**     | 2026-05-25                                                  |
| **Resolved**     | 2026-05-25                                                  |
| **Affected area**| Quizzes                                                     |

#### Original report

> I attempted a Quiz. After submitting it, i am not able to review my quiz again.

**Steps to reproduce:**
1. Attempt a Quiz
2. Click on submit quiz
3. Refresh / close the window
4. Go to quiz section again

#### Root cause

`QuizPage.jsx` was a single-component state machine: `screen: 'setup' | 'active' | 'results'`. After submit, `ResultsScreen` rendered from in-component memory (`quizData`, `gradedAnswers`, `quizId`). On refresh / close, all four state values reset; `screen` reverted to `'setup'`. The `QuizHistory` cards offered only **"New Questions"** (fresh quiz, different content) and **"Retry Last"** (clones questions into a new attempt) — neither path opened the saved review screen for an existing attempt. There was no `/quizzes/:id` client route either.

The data was always persisted server-side: `submitQuizAnswers` (`server/src/controllers/quiz.controller.js:345`) writes the full graded answers + `score` + `completedAt` to `QuizAttempt`, and `GET /quizzes/:quizId` (`quiz.controller.js:504`) returns them. `useQuiz(quizId)` (`client/src/hooks/useQuiz.js:83`) already fetched them. The bug was purely "no client surface to consume what the server already returned."

#### Resolution

Shipped in commit `ac5e6f6` — *Fix quiz review path + roadmap entry for complexity hints*.

- **New page** `client/src/pages/QuizReviewPage.jsx` at `/quizzes/:quizId/review` — fetches the saved attempt, maps `quiz.answers` → `gradedAnswers` shape, renders the existing `ResultsScreen` (now exported) read-only with the persisted graded answers + AI analysis. Defensive 404 + "not yet submitted" empty states.
- **Review button** added to each `QuizHistory` card in `client/src/pages/QuizPage.jsx`, alongside "New Questions" and "Retry Last". Disabled with tooltip if the latest attempt isn't yet submitted.
- **Retry-from-review** flow: navigates back to `/quizzes` with `location.state.resumeQuiz`; QuizPage picks up the active session on mount — single-click retry, no double-navigation.
- **Route** registered in `client/src/App.jsx`.

No server change required. No schema change.

#### Reply-to-user copy

> Hi Jayshree — fixed and deployed. On the Quizzes page each subject card now has a **Review** button that opens your saved results with answers and AI analysis. You can also bookmark / share the URL `/quizzes/<id>/review` to come back to a specific attempt anytime.

---

### #3 — Time complexity hints on coding problems

| Field            | Value                                                  |
| ---------------- | ------------------------------------------------------ |
| **Feedback ID**  | `cmpc65upk000d45v2b6xz1gi4`                            |
| **Type**         | ❓ QUESTION (feature request)                          |
| **Severity**     | `LOW`                                                  |
| **Status**       | `PLANNED` · roadmap NEXT                               |
| **Submitter**    | Ritu (rituprasad0000@gmail.com) · Binary Thinkers      |
| **Reported**     | 2026-05-19                                             |
| **Affected area**| Problems & Solutions                                   |

#### Original report

> there are multiple approaches of the same question. one is brute force some are better and best. can we have a hint of expected time complexity? so that we can think in that direction even if i have found the better approach I am not sure if the best solution exists.

#### Analysis

The `Problem` model in `server/prisma/schema.prisma:535` has **no** `optimalTimeComplexity` / `optimalSpaceComplexity` field today. Complexity columns exist only on `Solution` (the user's own claim) and on `AIReview` (post-submit estimate). The platform has no curated "this problem's optimal target is O(n log n)" data anywhere — there's literally nothing to display before submission.

Three possible directions:

1. **Admin-curated `optimalTimeComplexity` + `optimalSpaceComplexity` on `Problem`**, gated by a "Reveal" toggle on the problem page so it doesn't spoil. Faithful to the user's ask. **Recommended.**
2. AI-generated complexity computed at the post-submit AI review — no schema change, but each problem's "optimal" is recomputed per submission and varies; drift risk.
3. A 3-tier "Hint" panel (brute-force / better / best) with complexities behind a click — biggest scope, highest user value, deferred to v2 once curated fields exist.

#### Resolution

`PLANNED` — roadmap item **`problem-optimal-complexity-fields`** added to NEXT phase (Content & Problems theme, Medium effort). Captures option 1: schema migration, admin form with optional AI-suggest button, reveal-on-click chip on `ProblemDetailPage`. Research-backed (Bjork desirable difficulties, Sweller cognitive load, Wieman) — curated rather than AI-generated to avoid hallucinated complexities. See `client/src/pages/superadmin/roadmap/roadmapData.js`.

#### Reply-to-user copy

> Hi Ritu — accepted and planned for the next release cycle. We're adding curated time/space complexity targets to each problem with a reveal-on-click hint so it doesn't spoil the search. The plan is admin-authored (not AI-generated) so the targets are verifiably correct. Tracked on the SuperAdmin roadmap as `problem-optimal-complexity-fields`. Thanks for the framing — your "I'm not sure if the best solution exists" line is what convinced us to ship the hint as revealable rather than always-visible.

---

## Appendix — fields the export carries

For reference when adding new entries, the export format includes:

- `Feedback ID` — stable cuid, used as the primary key here
- `Type` — `BUG` / `SUGGESTION` / `QUESTION`
- `Status` — `OPEN` / `ACKNOWLEDGED` / `RESOLVED` / `WON'T FIX` (export-side state, not necessarily the same as our triage status)
- `Severity` — `CRITICAL` / `HIGH` / `MEDIUM` / `LOW`
- `Affected Area` — coarse module (Quizzes, Problems & Solutions, Mock Interview, etc.)
- `Submitter` — name + email
- `Team` — team name (multi-tenant context)
- `Created` — ISO timestamp
- `Resolved` — ISO timestamp (present once admin marks the export-side status RESOLVED)
- `Description` — free-form
- `Steps to Reproduce` (bugs only) — sometimes HTML-escaped from a rich-text editor; un-escape before quoting
- `Admin Note` — internal comment if any
