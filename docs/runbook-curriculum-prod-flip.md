# Curriculum Phase 1 → Production Flip Runbook

Turn `FEATURE_CURRICULUM` and its prerequisites ON in Railway prod. Zero code change — env vars + redeploy only. Zero schema change — rollback is symmetric.

## 0. Decision log

**2026-07-14** — flip proceeds WITHOUT the roadmap's recommended one-week staging soak + golden-path walkthrough. Rationale:

- Feature is code-complete after W6 (1859+ tests passing, integration tests cover walkthrough / tenancy / race / prompt-injection).
- Rollback is symmetric — 4 env flips + redeploy. ~30 seconds.
- No schema change to unwind if things go sideways.
- Pre-launch context — real user base is small; the "canary risk" is bounded.

**Recommended-but-skipped gates**, for reference if this flip needs to be re-done later or for a future team-driven variant:

1. Set Railway log retention ≥ 30 days for the four telemetry events (`signal_shift_delta`, `reveal_reference_verdict`, `teachingReady_flipped`, `checkin_gate_blocked`). Behavioral analytics needs monthly cohorts.
2. Query staging logs for one week — verify:
   - ≥ 1 `signal_shift_delta` per active learner
   - `teachingReady_flipped` rate roughly matches count of learners who completed STRONG-lab + PASS-checkin
   - `reveal_reference_verdict` NOT firing before any STRONG/ADEQUATE attempt exists (validates the gate)
   - `checkin_gate_blocked` volume is proportional to `signal_shift_delta{source=checkin}` (else check-in is being reached but not cleared — bug)
3. Manual golden-path walkthrough on staging: TEAM_ADMIN forks → publishes → learner enrolls → submits lab → gets STRONG/ADEQUATE → reveals → PASSes check-in → `teachingReady` flips.

If any of the above becomes possible before the flip, do them and delete this section.

## 1. Scope — what flips ON

**Server env vars** (Railway prod SERVER service):

| Variable | New value | Why |
|---|---|---|
| `FEATURE_CURRICULUM` | `true` | Main curriculum flag. Router guard at `/api/v1/curriculum/*` returns 404 when false. |
| `FEATURE_TEACHING_SESSIONS` | `true` | Curriculum hard-depends on this — startup fails fast if curriculum is on but this isn't. |
| `FEATURE_NOTES_ENABLED` | `true` | Same hard-depend. |

**Client env vars** (Railway prod CLIENT service — baked at BUILD time via Dockerfile ARG):

| Variable | New value | Why |
|---|---|---|
| `VITE_FEATURE_CURRICULUM` | `true` | Client mirror — sidebar link, /learn route, feature-gated components. |
| `VITE_FEATURE_TEACHING_SESSIONS` | `true` | Client mirror. |
| `VITE_FEATURE_NOTES_ENABLED` | `true` | Client mirror. |

## 2. Scope — what STAYS OFF

| Variable | Value | Why |
|---|---|---|
| `FEATURE_CURRICULUM_WALKTHROUGH` | `false` (default) | AI-narrated reveal walkthrough — dark launch continues. Flip separately after the base curriculum feature is stable. |
| `VITE_FEATURE_CURRICULUM_WALKTHROUGH` | `false` (default) | Client mirror. |

`FEATURE_AI_REVIEW_LANGUAGE_GUARD` (Rule 24, default `true`) — leave as-is. It's a per-review coherence check, unrelated to the curriculum feature.

## 3. Execution order

Sequence matters — server first, client second. Client bake reads the server's flags at build time only for HTTP-response contracts; but the SERVER must be ready to serve `/api/v1/curriculum/*` before the client tries to hit it after redeploy.

### Step 3.1 — Server env vars

Railway dashboard → prod server service → Variables:

```
FEATURE_CURRICULUM=true
FEATURE_TEACHING_SESSIONS=true
FEATURE_NOTES_ENABLED=true
```

Save. Railway will queue a redeploy automatically when vars change. Watch the deploy logs — the server startup logs should include:

```
⚡ ProbSolver v3.0
📡 Connecting to database...
✅ Database connected
🚀 Server running on port ...
```

**If startup fails** with `FEATURE_CURRICULUM=true requires: FEATURE_TEACHING_SESSIONS, FEATURE_NOTES_ENABLED` — you missed one of the prereqs. Set them all before restart.

### Step 3.2 — Client env vars

Railway dashboard → prod client service → Variables:

```
VITE_FEATURE_CURRICULUM=true
VITE_FEATURE_TEACHING_SESSIONS=true
VITE_FEATURE_NOTES_ENABLED=true
```

Save. Then **trigger a redeploy** — the client is a build-time bake, so setting the var is not enough; you need the Dockerfile ARG to see the new value on the next build. In Railway: Deployments tab → latest deployment → Redeploy.

## 4. Verification

Run each command from your local terminal (Zscaler-on is fine — these are outbound HTTPS to your public endpoints).

### 4.1 — Server topics endpoint returns 200 (not 404)

```bash
# Replace <prod-server> + <token> with real values
TOKEN="<a valid JWT for a team-member user>"
curl -sH "Authorization: Bearer $TOKEN" \
  https://<prod-server>/api/v1/curriculum/topics | jq
```

Expected: `{ success: true, data: { topics: [...] } }` — array is empty if no team has published yet, non-empty otherwise. **A 404 means `FEATURE_CURRICULUM` did not take effect on the server** — check the Variables tab and redeploy.

### 4.2 — Client bundle has the baked flag

```bash
# Grab the client index page, find the JS bundle hash, grep for the flag
CLIENT=https://<prod-client>
BUNDLE=$(curl -s $CLIENT | grep -oE '/assets/index-[A-Za-z0-9]+\.js' | head -1)
curl -s "$CLIENT$BUNDLE" | grep -oE 'VITE_FEATURE_CURRICULUM[^;,}]*' | head -3
```

Expected: at least one match containing `"true"`. **A match containing `"false"` means the client redeploy did NOT rebuild with the new ARG** — verify the Dockerfile has the ARG line, then re-trigger redeploy from Deployments tab.

### 4.3 — Smoke test in browser

1. Open prod URL in an incognito window.
2. Sign in as a real user with a real team membership.
3. Sidebar should now show a "Learn" link under Practice.
4. Click Learn — should render the topic catalog (empty state if no team has published yet).
5. If TEAM_ADMIN: sidebar should show a "Curriculum Admin" link — click, verify the templates + topic list renders.

## 5. Rollback

If anything above is broken, execute in this order:

```
# Server service — set:
FEATURE_CURRICULUM=false
FEATURE_TEACHING_SESSIONS=false      # only if you turned it on for this flip
FEATURE_NOTES_ENABLED=false          # only if you turned it on for this flip

# Client service — set:
VITE_FEATURE_CURRICULUM=false
VITE_FEATURE_TEACHING_SESSIONS=false # only if you turned it on for this flip
VITE_FEATURE_NOTES_ENABLED=false     # only if you turned it on for this flip
```

Redeploy both services. **Zero schema unwind needed** — the curriculum tables stay populated but the routes 404 again and the sidebar link disappears.

If either `FEATURE_TEACHING_SESSIONS` or `FEATURE_NOTES_ENABLED` was ALREADY ON in prod (independent of this flip) — leave those ON on rollback. Only revert what you just changed.

## 6. Post-flip monitoring — first hour

Railway prod server → Logs. Watch for:

**Expected events (searchable log lines):**
```
event: signal_shift_delta       ← learner submitted a lab / check-in / primer-read
event: reveal_reference_verdict ← learner clicked Reveal on a STRONG/ADEQUATE attempt
event: teachingReady_flipped    ← learner completed the full loop (STRONG lab + PASS check-in)
event: checkin_gate_blocked     ← learner tried check-in without a passing lab (expected; not an error)
```

If ALL of these are silent after an hour: nobody's exercising the feature. Not necessarily a bug, but nothing to observe.

**Anomaly signals (act on these):**
- `event: signal_shift_delta` with `delta < 0` → shouldn't happen (signals only add). Investigate before it accumulates.
- 500 errors on `/api/v1/curriculum/*` → check the specific route; likely a missing tenancy filter or a Prisma pool issue. Grab the full stack from Logs.
- OpenAI cost spike (Railway metrics or your OpenAI dashboard) → the per-team `aiTeamLimiter` should cap this, but if it breaches, verify the limiter is in the chain on `/api/v1/curriculum/labs/:id/attempts` + `/reveal-reference`.
- `teachingReady_flipped` firing WITHOUT preceding `signal_shift_delta` events → auto-flip guard is skipping the truth-table check. Regression.

## 7. Post-flip announcement

Internal channel — feature is live. Include:

- Link to prod curriculum landing (`/learn`)
- Any published-topic examples (if you seeded any before flip)
- Where to file bugs
- Explicit note that the **Reveal Walkthrough is still dark-launched** (raw diff is still the reveal artifact until walkthrough flips separately)

## 8. Follow-up on outstanding items (from the roadmap entry)

- `primer_markdown` adversarial injection test (defense exists in production code, dedicated test still missing) — file if not already tracked
- Vitest parallel-file flake investigation (2-3 known-flaky tests under high load) — scope before Phase 2 starts
- Post-flip: schedule the one-week metric review that was supposed to happen pre-flip — do it retroactively as a sanity check

## Related

- [`docs/local-dev-setup.md`](./local-dev-setup.md) — local Zscaler + macOS TCC + cert refactor
- [`docs/runbook-secrets.md`](./runbook-secrets.md) — rotate secrets after a leak
- Roadmap entry `curriculum-phase-1-flip-prod` in `client/src/pages/superadmin/roadmap/roadmapData.js` — the source-of-truth spec this runbook executes against.
