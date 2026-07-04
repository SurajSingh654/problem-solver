# Secret rotation runbook

Rotate when a secret leaks: DevTools shared on a call, chat history with an LLM, screen share, public repo, laptop loss. Default to "rotate, don't risk" — rotation is cheap, breach impact isn't.

## `JWT_SECRET`

Signs every web auth token AND every MCP token.

1. `openssl rand -hex 64` → new value.
2. Update Railway server service. Redeploy.
3. **Side effect**: every active web session AND every active MCP token instantly becomes invalid. Users re-login + re-mint MCP tokens via Settings → API Access. This is by design — the alternative is leaving a window where an attacker with the leaked secret can mint forged tokens at will.

## `OPENAI_API_KEY`

platform.openai.com → API keys → revoke leaked → create new → Railway → redeploy. No user impact; watch billing dashboard for anomalous usage from the leaked window.

## `RESEND_API_KEY`

Resend dashboard → revoke + recreate → Railway → redeploy.

## `SUPER_ADMIN_PASSWORD`

Log in, change via Settings → Password.

## MCP tokens (any user-issued JWT)

Owner goes to Settings → API Access → Revoke. Cache TTL 60s, so revocation propagates within a minute.

## `DATABASE_URL`

Rotate the Postgres password via Railway's DB service → redeploy server. No user impact (auth is JWT, not DB credentials).

## Sharing env dumps for debugging

When pasting env-var dumps into chat / LLM / screen share, **mask all secrets with `***`** first. Conversation history outlives token expiry.
