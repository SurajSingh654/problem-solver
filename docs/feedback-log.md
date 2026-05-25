# ProbSolver — Feedback & Bug Tracking Log

Living document for triaging user-reported feedback from the in-app feedback widget (and any other source). Updated every time a new feedback export is processed. One entry per reported item; entries persist after resolution so the history of what users hit and how it was handled stays auditable.

## Workflow for the next export

When a new export arrives (e.g. `probsolver-feedback-YYYY-MM-DDTHH-MM.md`):

1. **Don't overwrite.** Open this file and append/update entries — never rewrite from scratch.
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

| #   | Title                               | Type | Severity   | Status     | Feedback ID                  | Resolution                                                  |
| --- | ----------------------------------- | ---- | ---------- | ---------- | ---------------------------- | ----------------------------------------------------------- |
| 1   | Unable to review past quizzes       | 🐛   | `CRITICAL` | `RESOLVED` | `cmpl0q6n0001c1q9w58rt1ey1`  | Commit [`ac5e6f6`](#1--unable-to-review-past-quizzes)       |
| 2   | Time complexity hint per problem    | ❓   | `LOW`      | `PLANNED`  | `cmpc65upk000d45v2b6xz1gi4`  | Roadmap [`problem-optimal-complexity-fields`](#2--time-complexity-hints-on-coding-problems) |

**Counts:** 1 resolved · 1 planned · 0 open · 0 won't fix
**Last updated:** 2026-05-25 (export `probsolver-feedback-2026-05-25T09-43.md`)

---

## Items

### #1 — Unable to review past quizzes

| Field            | Value                                                       |
| ---------------- | ----------------------------------------------------------- |
| **Feedback ID**  | `cmpl0q6n0001c1q9w58rt1ey1`                                 |
| **Type**         | 🐛 BUG                                                      |
| **Severity**     | `CRITICAL`                                                  |
| **Status**       | `RESOLVED` · shipped 2026-05-25                             |
| **Submitter**    | Jayshree (jayshreeprajapati426@gmail.com) · Binary Thinkers |
| **Reported**     | 2026-05-25                                                  |
| **Affected area**| Quizzes                                                     |

#### Original report

> I attempted a Quiz. After submitting it, i am not able to review my quiz again.

**Steps to reproduce (verbatim):**
1. Attempt a Quiz
2. Click on submit quiz
3. Refresh / close the window
4. Go to quiz section again

#### Root cause

`QuizPage.jsx` was a single-component state machine: `screen: 'setup' | 'active' | 'results'`. After submit, `ResultsScreen` rendered from in-component memory (`quizData`, `gradedAnswers`, `quizId`). On refresh / close, all four state values reset; `screen` reverted to `'setup'`. The `QuizHistory` cards offered only **"New Questions"** (fresh quiz, different content) and **"Retry Last"** (clones the questions into a new attempt) — neither path opened the saved review screen for an existing attempt. There was no `/quizzes/:id` client route either.

The data was always persisted server-side: `submitQuizAnswers` (`server/src/controllers/quiz.controller.js:345`) writes the full graded answers + `score` + `completedAt` to `QuizAttempt`, and `GET /quizzes/:quizId` (`quiz.controller.js:504`) returns them. The hook `useQuiz(quizId)` (`client/src/hooks/useQuiz.js:83`) already fetched them. The bug was purely "no client surface to consume what the server already returned."

#### Resolution

Shipped in commit [`ac5e6f6`](https://github.com/) — *Fix quiz review path + roadmap entry for complexity hints*.

- **New page** `client/src/pages/QuizReviewPage.jsx` at route `/quizzes/:quizId/review` — fetches the saved attempt, maps `quiz.answers` → `gradedAnswers` shape, renders the existing `ResultsScreen` (now exported) read-only with the persisted graded answers + AI analysis. Defensive 404 + "not yet submitted" empty states.
- **Review button** added to each `QuizHistory` card in `client/src/pages/QuizPage.jsx`, alongside "New Questions" and "Retry Last". Disabled with tooltip if the latest attempt isn't yet submitted.
- **Retry-from-review** flow: navigates back to `/quizzes` with `location.state.resumeQuiz`; QuizPage picks up the active session on mount — single-click retry, no double-navigation.
- **Route** registered in `client/src/App.jsx`.

No server change required. No schema change.

#### Reply-to-user copy

> Hi Jayshree — fixed and deployed. On the Quizzes page each subject card now has a **Review** button that opens your saved results with answers and AI analysis. You can also bookmark / share the URL `/quizzes/<id>/review` to come back to a specific attempt anytime.

---

### #2 — Time complexity hints on coding problems

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

Three possible directions were considered:

1. **Admin-curated `optimalTimeComplexity` + `optimalSpaceComplexity` on `Problem`**, gated by a "Reveal" toggle on the problem page so it doesn't spoil. Faithful to the user's ask. **Recommended.**
2. AI-generated complexity computed at the post-submit AI review — no schema change, but each problem's "optimal" is recomputed per submission and varies; drift risk.
3. A 3-tier "Hint" panel (brute-force / better / best) with complexities behind a click — biggest scope, highest user value, deferred to v2 once curated fields exist.

#### Resolution

`PLANNED` — roadmap item **`problem-optimal-complexity-fields`** was added to NEXT phase (Content & Problems theme, Medium effort). Captures option 1: schema migration, admin form with optional AI-suggest button, and a reveal-on-click chip on `ProblemDetailPage`. Research-backed (Bjork desirable difficulties, Sweller cognitive load, Wieman) — curated rather than AI-generated to avoid hallucinated complexities. See `client/src/pages/superadmin/roadmap/roadmapData.js`.

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
- `Description` — free-form
- `Steps to Reproduce` (bugs only) — sometimes HTML-escaped from a rich-text editor; un-escape before quoting
- `Admin Note` — internal comment if any

If the export adds a `Resolved By` / `Resolved At` field in the future, mirror it in the table above.
