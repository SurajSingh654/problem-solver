# Phase MCP-4 — Token API (server-side MVP)

> **Status**: ✅ Server-side shipped 2026-05-26. Settings-page UI deferred to MCP-4-UI.
> Replaces the dev-only mint script (`scripts/mintMcpToken.js`) with a real per-user API: create / list / revoke tokens that work for SUPER_ADMIN and end-users alike.
>
> **Prerequisite**: read [`01-mcp-phase-1-foundation.md`](./01-mcp-phase-1-foundation.md) — MCP-1 introduced `RevokedMcpToken` as a revocation list. MCP-4 evolves that table into the full token-of-record store (`McpToken`) and exposes a 3-endpoint API on top of it.

## Quick reference

```
- Phase:         MCP-4 (token API)
- Status:        Shipped server-side 2026-05-26 (UI deferred)
- Theme:         Trust & Truth + Production-grade ops
- One-line goal: Every user can issue/list/revoke their own MCP tokens through the API; the dev mint script becomes optional.
- Key concept:   The token (the JWT string) is shown ONCE on creation. Server stores only metadata (jti + name + timestamps + revokedAt). A leaked DB never leaks tokens.
- Stack added:   None — same Express, same JWT, same Prisma. One schema migration + one new controller.
- Effort:        S (≈ 3 hrs end-to-end including tests + middleware tests update)
- Dependencies:  MCP-1 (the revocation list whose table we're evolving).
- Rollback:      `FEATURE_MCP_ENABLED=false` disables all 3 endpoints (each returns 503). The migration is forward-only but does not break the auth middleware (which now reads from the same renamed table).
```

## What we're building & why

MCP-1 shipped a dev-only minter — the maintainer ran `node scripts/mintMcpToken.js --email user@x.com`, copied the printed JWT into `claude mcp add --header`, and called it good. This was fine when only the maintainer was using MCP, but it doesn't scale to a multi-user deployment.

The Phase MCP-4 surface area:

| Endpoint                                  | Purpose                                                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/users/me/mcp-tokens`        | Create a token. Body: `{ name? }`. Returns `{ token, jti, name, issuedAt, expiresAt, instructions }` — token shown ONCE.     |
| `GET /api/v1/users/me/mcp-tokens`         | List the caller's tokens (active + revoked + expired). Each row has a derived `status` field.                                |
| `DELETE /api/v1/users/me/mcp-tokens/:jti` | Revoke. Idempotent on already-revoked. Cross-user attempts return **404 (not 403)** — don't tell an attacker the JTI exists. |

### Schema evolution

`RevokedMcpToken` → `McpToken`. The old table only stored revoked rows (`revokedAt` was `DEFAULT NOW()` and `NOT NULL`); the new table stores **every issued token** with `revokedAt` nullable.

```sql
-- 20260526200000_mcp_token_table_evolve/migration.sql
ALTER TABLE "revoked_mcp_tokens" RENAME TO "mcp_tokens";
ALTER TABLE "mcp_tokens" ALTER COLUMN "revokedAt" DROP DEFAULT;
ALTER TABLE "mcp_tokens" ALTER COLUMN "revokedAt" DROP NOT NULL;
ALTER TABLE "mcp_tokens" RENAME COLUMN "reason" TO "revokedReason";
ALTER TABLE "mcp_tokens" ALTER COLUMN "revokedReason" DROP NOT NULL;
ALTER TABLE "mcp_tokens" ADD COLUMN "name" TEXT;
-- + index renames + FK renames (see file)
```

Existing rows from MCP-1 (revoked tokens with `revokedAt = <date>`) become "revoked" rows under the new schema for free. No backfill needed.

The auth middleware (`mcpAuth.js`) was updated to read `McpToken` instead of `RevokedMcpToken`. The semantic shift: a token is **revoked** if there's a row AND `revokedAt !== null`. The dev mint script doesn't insert a row at all (so its tokens are still treated as ACTIVE — backward compatible).

## Decisions worth recording

### 1. Token shown ONCE — never store plaintext

The endpoint returns the JWT in the response, then **never again**. We persist `jti`, `name`, `issuedAt`, `expiresAt`, `lastUsedAt`, `lastUsedIp`, `revokedAt`, `revokedReason`. The user must paste the token into their MCP client config immediately; if they lose it, their only path is "revoke + create new."

This is the standard pattern for API-key UX (GitHub PATs, Stripe restricted keys, etc.). A DB compromise still gives an attacker the metadata, but never the token.

### 2. 404 (not 403) on cross-user revocation

Returning 403 leaks the existence of a JTI. With 404, the response is identical whether the JTI doesn't exist OR belongs to someone else. An attacker probing JTIs gains nothing.

```js
if (!existing) {
  return error(res, "Token not found.", 404);
}
if (existing.userId !== userId) {
  // Cross-user revocation attempt — don't tell them the jti exists.
  return error(res, "Token not found.", 404);
}
```

### 3. MAX_ACTIVE_TOKENS_PER_USER = 5

Hard cap. Prevents accidental sprawl ("I'll just create another one"), bounds the size of the eventual settings page list, and limits blast radius if a user's web session is compromised. The error message tells them how to recover (revoke an old token).

### 4. Idempotent revocation

`DELETE /me/mcp-tokens/:jti` on an already-revoked token returns `200 + { revoked: jti, alreadyRevoked: true }`. No 409, no error. The user-visible meaning of revocation is "this token is dead" — and after a successful first call, it's already dead, so the call is a no-op. Standard REST idempotency.

### 5. Dev mint script kept for emergencies

`scripts/mintMcpToken.js` still works because tokens issued via the script don't insert a `McpToken` row, and `isJtiRevoked` treats "no row" as "active." The script is now an emergency tool (e.g. when the API is down), not the primary path.

## What broke (real bugs)

🔴 **The middleware tests still mocked `prisma.revokedMcpToken`.** After renaming, 4 tests in `test/mcp/middleware.test.js` started failing — `Cannot read properties of undefined (reading 'findUnique')`. Fix: rename mock + assertion sites, and update the "rejects revoked token" mock to return `{ revokedAt: new Date() }` (the new shape — was just `{ jti }`).

This is the kind of thing the pre-push gate catches. The 4 failures showed up in the first `npm test` run after the rename and were obvious to fix.

🟡 **Initial Zod schema didn't reject extra fields.** Forgot `.strict()` on the body schema, which meant `{ name: "ok", userId: "spoofed" }` would pass through (Zod default is `.passthrough()` — unknown keys silently ignored, NOT rejected). Added `.strict()`. The test case for this is now in `test/mcp/tokens.test.js`.

🟢 **Middleware change worked first try.** `prisma.mcpToken.findUnique` + `revokedAt !== null` semantics — the renamed table + new column shape mapped 1:1 to the existing logic. This was the "easy" half of MCP-4.

## What changed since MCP-1's threat model

| Threat                                    | MCP-1 mitigation                 | MCP-4 evolution                                                                          |
| ----------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| Stolen token                              | JTI revocation list (60s cache)  | **Same** — revocation now means setting `revokedAt`, but the cache + check are unchanged |
| User can't self-serve                     | Maintainer ran mint script       | Resolved: any authenticated user can create/list/revoke                                  |
| Token sprawl                              | None (assumed ≤1 token per user) | `MAX_ACTIVE_TOKENS_PER_USER=5` cap + revoke-old-first error                              |
| Attacker probes JTIs to find valid tokens | Not addressed                    | Resolved: cross-user revocation returns 404                                              |

Threats unchanged from MCP-1: scope separation (`mcp:read`), DNS rebinding (Origin allowlist), DoS (rate limiter), prompt injection (XML-tag wrapping), server-side authz (don't trust client args).

## Tests added

`test/mcp/tokens.test.js` — 12 tests covering:

- `createMcpToken`: valid request → 200 + token + JTI; metadata persisted; cap enforced; `.strict()` rejects unknown fields; empty body accepted (name optional)
- `listMcpTokens`: status field correctness across active/revoked/expired; multi-tenancy filter
- `revokeMcpToken`: revokes by JTI; 404 on nonexistent; **404 (not 403) for cross-user** (security regression guard); idempotent on already-revoked; rejects malformed JTI

Plus updates to `test/mcp/middleware.test.js` (rename mocked Prisma model + update revoked-row shape).

Total MCP test count: 91 (was 79 before MCP-4: token API + middleware updates).

## What's deferred to MCP-4-UI

- Settings page in the React app
- "Last used" surfaced as relative time
- "Created from" device fingerprint (browser UA + IP)
- Copy-to-clipboard with auto-clear after 30s
- Soft-delete cleanup cron (delete revoked rows older than 90d)

The server-side API is feature-complete for now. The CLI is `claude mcp add --header "Authorization: Bearer <pasted-token>"`, which works fine for the maintainer + any technical user.

## Glossary

- **JTI** — JWT ID claim. UUIDv4 we generate per token. Indexed in `mcp_tokens.jti`. The handle by which a token is revoked.
- **Token of record** — the persisted metadata row, vs the JWT itself which is never stored. After MCP-4, every issued token has a row.
- **Idempotent revocation** — calling DELETE on an already-revoked token is a no-op (`alreadyRevoked: true`); no 409.
- **Cross-user revocation probe** — attacker iterates JTIs against `DELETE /me/mcp-tokens/:jti` looking for a 200 vs 404 response. We close this by returning 404 for both "doesn't exist" and "belongs to someone else."

## Try this yourself

1. **Apply the migration**:

   ```
   cd server
   npx prisma generate              # regenerate Prisma client (renamed model)
   npx prisma migrate dev           # apply 20260526200000_mcp_token_table_evolve
   ```

   When prompted "Enter a name for the new migration", **Ctrl+C** — that's the vector-drift prompt, not a real migration. (See CLAUDE.md "Migration workflow".)

2. **Create a token via the API** (need a web JWT for `Authorization`):

   ```
   curl -X POST localhost:5000/api/v1/users/me/mcp-tokens \
     -H "Authorization: Bearer <your-web-jwt>" \
     -H "Content-Type: application/json" \
     -d '{"name":"My Mac"}'
   ```

   Copy the `data.token` field.

3. **Register with Claude Code** (replaces the mint-script flow):

   ```
   claude mcp add --transport http --scope user binary-thinkers \
     <your-mcp-url> --header "Authorization: Bearer <data.token>"
   ```

4. **Revoke** via the API or via the eventual settings page:

   ```
   curl -X DELETE localhost:5000/api/v1/users/me/mcp-tokens/<jti> \
     -H "Authorization: Bearer <your-web-jwt>"
   ```

5. **Verify revocation works**: any subsequent MCP call from the revoked token returns 401 within 60s (cache TTL).
