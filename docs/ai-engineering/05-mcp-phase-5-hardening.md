# Phase MCP-5 — Hardening

> **Status**: ✅ Shipped 2026-05-27.
> The "MCP works" → "MCP is enterprise-shippable" delta. Pre-push vulnerability gate, debounced last-used tracking, dead langchain deps removed, secret-rotation runbook + threat-model entries documented.
>
> **Prerequisite**: read [`04-mcp-phase-4-token-api.md`](./04-mcp-phase-4-token-api.md) — MCP-5 closes the operational loop on the token UX MCP-4 opened.

## Quick reference

```
- Phase:         MCP-5 (hardening)
- Status:        Shipped 2026-05-27
- Theme:         Trust & Truth + Production-grade ops
- One-line goal: Close the gaps between "MCP ships" and "MCP is something an enterprise customer plugs in."
- Key concepts:  Debounced fire-and-forget activity tracking; pre-push CVE gate; secret-rotation runbook.
- Stack added:   None — same Express, same Prisma, same auth chain. Documentation + middleware tweak.
- Effort:        S (≈ 2 hrs end-to-end)
- Dependencies:  MCP-4-UI shipped (the "Last used" column needs the truth)
- Rollback:      All four sub-phases revert independently (see plan file).
```

## What we audited & what we changed

### MCP-5-1 — Truthful `lastUsedAt` + `lastUsedIp`

**Before**: Settings → API Access showed every active token as `Last used: Never`. The schema header (`schema.prisma:2536-2541`) said the column was "best-effort, updated lazily by auth middleware" — but `mcpAuth.js` never wrote it. The header decision-log had even rationalized the gap ("MCP requests are bot-frequency, debounce would churn writes").

**After**: A 5-minute debounced fire-and-forget update, mirroring the web `auth.middleware.js` `updateActivity` pattern. Per-jti `Map<jti, lastWrittenAtEpochMs>` cache; the cache is updated **eagerly** before the DB write so concurrent requests in the same window all skip. Auth path stays clean even if the write rejects (the row could have been deleted concurrently). 5 new tests in `middleware.test.js` cover: first-write, debounce-skip, post-window write, write-fail-but-auth-succeeds, no-write-on-revoked.

The schema's "best-effort, updated lazily" promise is now actually delivered.

### MCP-5-2 — `npm audit` gate in pre-push

`.githooks/pre-push` now runs `npm audit --audit-level=high` on both workspaces. Failing on HIGH/CRITICAL — moderates print to stderr but don't block (transitive moderates are usually unfixable without major-version bumps; the gate would become noise). Bypass with `--no-verify` is the documented emergency exit.

This is the gate that should have caught langsmith and lodash-es six weeks ago.

### MCP-5-3 — Dead langchain deps removed

`@langchain/core` and `@langchain/openai` were in `server/package.json` from an early prototyping branch — never imported (`grep -rn "@langchain"` returns empty across `src/scripts/test`). They pulled in **langsmith ≤ 0.6.0** which carries CWE-502 (unsafe deserialization), the only HIGH on the server. `npm uninstall @langchain/core @langchain/openai` + `npm audit fix` cleared it. Server audit at `--audit-level=high` is now clean.

The client lodash-es vuln (CWE-1321 prototype pollution, deep transitive via `@excalidraw → @mermaid-js → chevrotain`) is `moderate`, not high — gate stays green; documented as accepted-known until @excalidraw ships an upstream fix.

### MCP-5-4 — Operational docs

- **`CLAUDE.md` "Secret rotation" runbook** — concrete steps for every secret that can leak (`JWT_SECRET`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `SUPER_ADMIN_PASSWORD`, MCP tokens, `DATABASE_URL`). Most importantly, calls out the **side effect of rotating `JWT_SECRET`**: every active session AND every MCP token instantly invalidates. That's by design — the alternative is leaving forged-token windows. Documented now while the lesson is fresh.
- **Threat model rows 16–20** in `docs/AGENT_TOOLING_REFERENCE.md` covering MCP-4-UI exposures: token leaks via chat/share, clipboard residue, DevTools Network tab, maintainer-pasting-secrets, and the new vulnerability gate itself.

The threats existed before; they were just undocumented. Now reviewers can scan the table and see exactly which surfaces are mitigated and which are accepted-known.

## What broke (real bugs)

🔴 **Pre-push gate failed both sides immediately.** Server: 1 HIGH (langsmith). Client: 1 HIGH (lodash-es). The very first `npm audit --audit-level=high` after wiring the gate confirmed it works as intended — couldn't push until cleanup ran. Worth pausing on: this is the entire reason the gate exists.

🟡 **The lastUsedAt design comment was wrong.** The original mcpAuth header (MCP-1) explicitly rejected per-request activity tracking ("would just churn writes"). The actual write rate, with the same debounce as the web layer, is identical to web auth — a problem the architecture had already solved that we copy-pasted at the wrong layer. Lesson: when a doc says "we deliberately don't do X," verify the rationale still holds before copying it forward.

🟢 **Threat-model + runbook landed cleanly.** No surprises. Just writing down what we'd implicitly understood from the recent leak incident.

## Threat-model evolution since MCP-4

| Threat | Pre-MCP-5 | Post-MCP-5 |
|---|---|---|
| Vulnerable transitive dep ships | Implicit ("we'll see it in CI eventually") | Explicit pre-push gate, fail-closed at HIGH+ |
| User leaks own token | Acknowledged in MCP-4 docs | Explicit threat-model row + Settings → Revoke flow validated by real incident |
| Maintainer pastes secrets to LLM | Not addressed | Documented runbook + `***` masking convention |
| "Last used" UI lies to users | Shipped + lying | Truthful within 5-min window |

## What's still on the deferred list (MCP-6 candidates)

- **Token audit log table** (`TokenAuditLog`) — every create/revoke/use writes a row with userId, jti, action, ip, userAgent, timestamp. Required for SOC2 / enterprise compliance. Current state: the only audit trail is `lastUsedAt` (most-recent only) + the row's own `revokedAt` + `revokedReason`. Adequate for "did this token get used?" Insufficient for "show me the full lifecycle of jti X."
- **Soft-delete cleanup cron** for revoked tokens > 90d — bounded growth (5 active + maybe ~50 lifetime per user) means this isn't urgent.
- **IP geolocation** ("Last used from Tokyo, 3h ago") — premium UX feature, unblocks "did someone in Russia just use my token?" detection without a full SOC pipeline.
- **New-device email notifications** — needs email infra polish first.
- **OAuth 2.1 migration** — separate strategic phase. The Linear/Notion-tier UX. Replaces the PAT flow with browser-consent + auto-refresh. ~2 weeks of work; worth doing for v1.0 SaaS polish.

## Closing reflection

After MCP-5, the only architectural thing standing between this stack and a Linear/Notion-tier MCP server is **OAuth 2.1**. PAT-style works fine for technical users (which is who Binary Thinkers serves today), but the moment we want a non-technical interview candidate to set up MCP without copy-pasting a CLI command, OAuth is the next phase.

Everything else — the multi-tenancy invariants, the prompt-injection defenses, the rate limiter, the revocation flow, the activity tracking, the vulnerability gate — is now production-grade. MCP-1 through MCP-5 took the system from "demo-quality" to "enterprise-shippable" in the space the docs predicted (~4 weeks). The system is real.

## Try this yourself

1. **Verify the gate**: `cd server && npm audit --audit-level=high` → should be `0 vulnerabilities`. Same for client (with `lodash-es` showing as `moderate`, not blocked).
2. **Verify last-used tracking**:
   ```
   # Mint a token via /settings → API Access → New token
   # Use it once: any MCP request through Claude Code or curl
   # Reload /settings → token's "Last used" updates from "Never" to "a few seconds ago"
   ```
3. **Verify debounce**: make 5 MCP requests in 30 seconds → "Last used" stays at the first request's timestamp until 5 minutes pass.
4. **Read the runbook**: open CLAUDE.md → "Secret rotation" subsection should answer "what happens if my JWT_SECRET leaks" in under 30 seconds.
