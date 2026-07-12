# Node TLS + Zscaler + macOS TCC — local dev runbook

Applies only to local dev on a corporate-Zscaler macOS workstation. Railway prod has no Zscaler in the path and is unaffected.

## Symptom

Local server boot log contains:

```
Warning: Ignoring extra certs from `/Users/<you>/Downloads/zscaler-cert.pem`,
  load failed: error:80000001:system library::Operation not permitted
```

Every AI call falls back:

```
[contentReview:CODE_REVIEW] validation failed, falling back: Connection error.
```

Learners see "AI reviewer wasn't available — verdict is from a conservative structural check." Prisma calls to Railway similarly time out or drop mid-query.

## Root cause

macOS TCC (Transparency, Consent and Control) protects `~/Downloads`, `~/Documents`, `~/Desktop` and demands per-process filesystem-permission grants to read files under them. Interactive zsh (spawned by Terminal.app with the "Files and Folders → Downloads" grant) can read the cert. `nodemon` / `node` launched from other contexts (VS Code integrated terminal, Claude Code shell, LaunchAgents) cannot — even though the file is `-rw-r--r--`.

When `NODE_EXTRA_CA_CERTS` points at a TCC-blocked path, Node fails to load the extra CA, silently drops the Zscaler MITM root from its TLS trust store, and every outbound HTTPS to a Zscaler-intercepted host (OpenAI, Railway, GitHub API, …) fails at TLS handshake. The OpenAI SDK surfaces this as "Connection error", never a 4xx/5xx. Our fallback validator catches it and emits WEAK, which is correct but blocks the reveal gate + walkthrough for local dev.

## Fix (Option A — safe for Claude Code)

Copy the cert into `~/certs/` (unprotected by TCC) and point `NODE_EXTRA_CA_CERTS` there.

```bash
mkdir -p ~/certs
cp ~/Downloads/zscaler-cert.pem ~/certs/zscaler-cert.pem
chmod 644 ~/certs/zscaler-cert.pem
```

Edit `~/.zshrc` (or `~/.bashrc`):

```bash
# Before
export NODE_EXTRA_CA_CERTS=~/Downloads/zscaler-cert.pem

# After
export NODE_EXTRA_CA_CERTS=~/certs/zscaler-cert.pem
```

Re-source and restart the dev server:

```bash
source ~/.zshrc
# then in the server terminal:
#   kill any running node/nodemon
#   npm run dev
```

## Verification

1. **New server-boot log has no "Ignoring extra certs" warning.** Grep the boot output for `Ignoring extra certs` — expect zero hits.
2. **Trigger a real AI call.** Submit a lab attempt in the UI. Server log should show `POST /api/curriculum/labs/:id/attempts 202` followed a few seconds later by a normal `runValidator("CODE_REVIEW", ...)` completion — NO `Connection error` fallback line.
3. **Verify Claude Code still works.** In the same terminal, run `claude doctor` — expect green auth. Ask Claude Code anything; it should respond normally.

## Rollback plan

Revert if the fix causes any unexpected regression (Claude Code auth loss, corp policy change, cert rotation). Full rollback in three steps, ~30 seconds:

1. **Revert the env var.** In `~/.zshrc`, change the export line back to:

   ```bash
   export NODE_EXTRA_CA_CERTS=~/Downloads/zscaler-cert.pem
   ```

   `source ~/.zshrc` (or open a new terminal).

2. **(Optional) Delete the copy.** Only if desired for cleanliness:

   ```bash
   rm ~/certs/zscaler-cert.pem
   rmdir ~/certs 2>/dev/null   # only if ~/certs/ is empty
   ```

   Leaving the copy in place is harmless and keeps a fallback available if you flip the env var back later.

3. **Restart the dev server** so it re-reads env.

The original `~/Downloads/zscaler-cert.pem` was NOT modified by the fix — it stays intact throughout. No git repo state changes at any step. No Claude Code config touched. No corporate cert bundle modified.

## Why this is safe for Claude Code

Confirmed against the org's Claude Code setup (2026-07-12):

| Layer | Uses `NODE_EXTRA_CA_CERTS`? | Affected by fix? |
|---|---|---|
| Claude Code binary | No — separate auth stack (Okta / Bedrock / AWS SSO) | No |
| Claude Code's cert trust | Its own bundled roots + system keychain | No |
| Zscaler network path | Still active — required for Claude Code LLM access | No |
| Node dev servers | Yes — reads env var at process start | **Fixed** |

Zscaler itself stays ON at all times. This fix does NOT reduce corporate network security posture — Node still validates every outbound TLS handshake against the same corporate MITM root; we just make sure Node can actually *load* that root.

## When to revisit

- **Cert rotation.** Zscaler rolls its intermediate CA periodically. When the corporate IT channel announces a new cert, re-run the copy step with the new file. Restart Node processes.
- **New protected paths.** macOS occasionally expands TCC coverage. If a future release also protects `~/certs/`, move to `/etc/ssl/certs/zscaler-cert.pem` (system-wide) or `/usr/local/etc/ssl/` (Homebrew prefix).
- **Team laptop hand-off.** Include this runbook + the cert file in the workstation-setup checklist for anyone else who needs to run this repo locally.

## Related

- `docs/runbook-secrets.md` — rotate cert-adjacent secrets (`OPENAI_API_KEY`, `JWT_SECRET`, `DATABASE_URL`).
- `CLAUDE.md` § Environment — full `.env` layout including flags that need to match server + client + Dockerfile.
