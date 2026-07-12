# Local dev setup — corporate macOS + Zscaler

Single reference for standing up problem-solver locally on a corporate-Zscaler macOS workstation. Covers Claude Code prerequisites, repo bring-up, the one-time TLS cert refactor (Option A), running the servers, troubleshooting, and rollback.

Not needed for Railway prod / staging — those environments have no Zscaler in the path.

---

## Part 0 — When to use each environment

| Environment          | Use for                                                               | Zscaler?      | Cert refactor needed?    |
| -------------------- | --------------------------------------------------------------------- | ------------- | ------------------------ |
| Local (this machine) | Fast iteration, UI polish, smoke test                                 | On (mandated) | **Yes** (Option A below) |
| Railway staging      | End-to-end walkthrough, real AI calls, feature-flag flips before prod | Not in path   | No                       |
| Railway prod         | Production traffic                                                    | Not in path   | No                       |

**Rule of thumb.** Anything that needs to hit `api.openai.com` or `mainline.proxy.rlwy.net` from a local Node process requires the Option A cert refactor. Anything covered by CI + integration tests + Railway staging does not.

---

## Part 1 — Claude Code prerequisites (org-provided)

Follow the org's Claude Code setup guide first (referenced in the Viva channel: **Claude Code Support**). Confirm before starting anything below:

1. **Homebrew installed** — `brew --version` returns a version.
2. **GitHub configured** — `ssh -T git@github.com` returns a "Hi <user>" banner.
3. **Zscaler is ON.** Required by Claude Code for LLM access via Bedrock/Okta. Do NOT turn Zscaler off for any troubleshooting step below.
4. **Claude Code installed** — `claude --version` prints a version.
5. **Baseline `claude doctor` is green.** If it's red now, fix Claude Code first (org channel) before proceeding — the fixes below assume Claude Code auth is working.

**Common Claude Code gotcha:** if you see `API Error: Token is expired. To refresh this SSO session run 'aws sso login'`, check `env | grep CLAUDE_CODE_USE_BEDROCK`. If that var is set, remove it — it forces AWS-auth instead of the current Okta-based flow. (Per the org's setup doc.)

---

## Part 2 — Repo bring-up

Clone + install:

```bash
git clone git@github.com:<org>/problem-solver.git
cd problem-solver

# Server
cd server
npm install
cp .env.example .env
# fill in: DATABASE_URL, OPENAI_API_KEY, JWT_SECRET, RESEND_API_KEY (if used),
# plus any FEATURE_* flags you want to test locally (default is safest)

# Client
cd ../client
npm install
# .env is optional locally — most VITE_* flags fall back to false
```

Enable the pre-push safety net (once per clone):

```bash
git config core.hooksPath .githooks
```

The hook runs lint + tests + `prisma migrate status` + `npm audit` + Vite build. Never bypass with `--no-verify` outside genuine emergencies. See `CLAUDE.md § Pre-push gate` for details.

---

## Part 3 — TLS cert refactor (Option A)

The one-time workstation fix that makes Node trust Zscaler's MITM root, so outbound HTTPS to OpenAI + Railway succeeds. Detailed root cause is in "Part 5 — Troubleshooting" below; the short version follows here.

### Why it's needed

Zscaler intercepts every corporate outbound HTTPS and presents its own cert. Node's TLS won't validate that cert unless the Zscaler root CA is in Node's trust store — set via `NODE_EXTRA_CA_CERTS`. On this workstation the env var is typically set in `~/.zshrc` and points to `~/Downloads/zscaler-cert.pem`. macOS TCC (Transparency, Consent and Control) protects `~/Downloads`, so the Node process fails to _read_ the cert file with `EPERM`, silently skips it (log warning: `Ignoring extra certs from … Operation not permitted`), and every OpenAI / Railway call fails at TLS handshake. OpenAI SDK reports "Connection error"; Prisma reports "Can't reach database server".

The fix moves the cert to `~/certs/` (unrestricted by TCC) and updates the env var.

### Steps

Run in a fresh terminal window so `claude doctor` runs cleanly between steps:

```bash
# 1. Baseline — MUST be green before starting
claude doctor

# 2. Copy the cert to an unrestricted directory (leave the Downloads copy intact)
mkdir -p ~/certs
cp ~/Downloads/zscaler-cert.pem ~/certs/zscaler-cert.pem
chmod 644 ~/certs/zscaler-cert.pem

# 3. Sanity check — this MUST succeed with no "Operation not permitted"
head -1 ~/certs/zscaler-cert.pem      # expect: -----BEGIN CERTIFICATE-----

# 4. Update ~/.zshrc — change the export line
#    Before: export NODE_EXTRA_CA_CERTS=~/Downloads/zscaler-cert.pem
#    After:  export NODE_EXTRA_CA_CERTS=~/certs/zscaler-cert.pem
# Use your editor: `code ~/.zshrc`, `nvim ~/.zshrc`, etc.

# 5. Reload shell + verify
source ~/.zshrc
echo "$NODE_EXTRA_CA_CERTS"           # expect: /Users/<you>/certs/zscaler-cert.pem
claude doctor                         # must STILL be green (unaffected by env change)
```

### Verification (after starting the server)

1. **No warning at boot.** Server startup log should NOT contain `Ignoring extra certs`.
2. **Real AI call succeeds.** Submit a lab attempt. Server log should show a normal `POST /api/curriculum/labs/:id/attempts 202` followed by `runValidator("CODE_REVIEW", ...)` completion — NO `[contentReview:CODE_REVIEW] validation failed, falling back: Connection error` line.
3. **Verdict comes back real** (STRONG / ADEQUATE / WEAK based on code quality) with `usedFallback: false` on the LabAttempt row. Confirms the AI reviewer is actually reached.
4. **Claude Code still works.** `claude doctor` in the same shell still green.

---

## Part 4 — Running servers locally

Two terminals:

```bash
# Terminal 1 — server (port 5000)
cd server
npm run dev
# nodemon watches src/**; auto-restarts on save

# Terminal 2 — client (port 5173, or 5174 if 5173 is taken by another project)
cd client
npm run dev
# or: npm run dev -- --port 5174 --strictPort false
```

Open http://localhost:5173 (or :5174). Client Vite proxies `/api` to the server on :5000.

Feature flags for the walkthrough dark launch:

```bash
# server/.env
FEATURE_CURRICULUM=true
FEATURE_CURRICULUM_WALKTHROUGH=true

# client/.env
VITE_FEATURE_CURRICULUM=true
VITE_FEATURE_CURRICULUM_WALKTHROUGH=true
```

Client must be restarted after `VITE_*` changes (Vite bakes them at dev-server start).

---

## Part 5 — Troubleshooting

Symptom → root cause → fix.

| Symptom                                                                         | Root cause                                                                          | Fix                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Ignoring extra certs from … Operation not permitted` at server boot            | macOS TCC blocking Node from reading a cert under `~/Downloads`                     | Part 3 above. Cert must live in `~/certs/` (or another TCC-unrestricted path).                                                                                                                                   |
| `[contentReview:CODE_REVIEW] validation failed, falling back: Connection error` | Node TLS to `api.openai.com` failing because Zscaler cert not loaded                | Part 3 above — same root cause as the "Ignoring extra certs" symptom.                                                                                                                                            |
| Learner sees "AI reviewer wasn't available" banner in the Lab tab               | Fallback fired due to AI call failure. Server-side `LabAttempt.usedFallback = true` | Check server log for `Connection error`; if present, Part 3 above. If AI reached but returned garbage, check `contentReview:CODE_REVIEW` log for the Zod / rule failure reason.                                  |
| Prisma `P1001: Can't reach database server` on every request                    | Zscaler intercepting Prisma's long-lived TLS connections                            | Part 3 above (same cert fix), OR add pool-tuning params to `DATABASE_URL`: `?connection_limit=5&pool_timeout=60&connect_timeout=30&socket_timeout=60`. Cert fix is the real solution; pool params only mitigate. |
| Server nodemon crashes on `prisma.$connect()` at startup                        | Transient Railway proxy blip OR Zscaler cert issue                                  | Retry once. If persistent, verify `nc -zv mainline.proxy.rlwy.net 39128` succeeds. If `nc` works but Node fails, it's Zscaler + cert (Part 3).                                                                   |
| `claude doctor` returns "Token is expired. Run 'aws sso login'"                 | Okta SSO session lapsed                                                             | Run `aws sso login` with the corresponding profile. Unrelated to this repo.                                                                                                                                      |
| `claude doctor` returns AWS auth errors                                         | `CLAUDE_CODE_USE_BEDROCK` env var still set from an old install                     | `unset CLAUDE_CODE_USE_BEDROCK`; remove from shell rc. Per org doc.                                                                                                                                              |
| `head: <path>: Operation not permitted` on a file you can `ls -la`              | macOS TCC on a protected dir (`~/Downloads`, `~/Documents`, `~/Desktop`)            | Move the file to an unrestricted dir (`~/certs/`, `~/.config/`), OR grant Terminal.app "Full Disk Access" in System Settings → Privacy & Security. Prefer the first — narrower blast radius.                     |
| Client env var change (`VITE_FEATURE_*`) not reflected in UI                    | Vite bakes `VITE_*` at dev-server start — HMR does NOT pick them up                 | Kill the client dev server (Ctrl+C), start again. Hard-refresh the browser. First diagnostic in prod: grep the deployed bundle for the flag name.                                                                |
| New Zod / server-body field silently persisted as null                          | `validate()` middleware strips unknown keys. Zod schema missing the field           | Log `Object.keys(req.body)` in the controller; add the field to the strict schema. See `CLAUDE.md § New request-body field` for the 5-touchpoint rule.                                                           |
| Pre-push `test:integration` flakes with DB unreachable                          | Railway proxy blip during test setup                                                | Wait 30s and retry the push. If persistent, verify `nc -zv mainline.proxy.rlwy.net 39128`.                                                                                                                       |

---

## Part 6 — Rollback plan (undo Option A)

Full revert in ~30 seconds. Original `~/Downloads/zscaler-cert.pem` is never modified by any step in Part 3, so it stays intact throughout.

```bash
# 1. Revert the env var — edit ~/.zshrc back to
#    export NODE_EXTRA_CA_CERTS=~/Downloads/zscaler-cert.pem
source ~/.zshrc

# 2. Verify
echo "$NODE_EXTRA_CA_CERTS"           # expect: /Users/<you>/Downloads/zscaler-cert.pem
claude doctor                         # still green

# 3. Restart the local Node server so it re-reads env
#    (Ctrl+C the running server, then `npm run dev` again)

# 4. (Optional) Delete the copy — harmless to leave
rm ~/certs/zscaler-cert.pem
rmdir ~/certs 2>/dev/null || true
```

**No git state changes**. No corporate cert bundle modified. No Claude Code config touched. Rollback returns the workstation to bit-identical state as before Part 3, except for step 4 which is a cleanup nice-to-have.

---

## Part 7 — Why this is safe for Claude Code

Confirmed against the org's Claude Code setup (2026-07-12):

| Layer                                                 | Uses `NODE_EXTRA_CA_CERTS`?                         | Affected by Part 3? |
| ----------------------------------------------------- | --------------------------------------------------- | ------------------- |
| Claude Code binary                                    | No — separate auth stack (Okta / Bedrock / AWS SSO) | No                  |
| Claude Code's cert trust                              | Its own bundled roots + system keychain             | No                  |
| Zscaler network path                                  | Still active — required for Claude Code LLM access  | No                  |
| Local Node dev servers (server + Prisma + OpenAI SDK) | Yes — reads env var at process start                | **Fixed**           |

Zscaler itself stays ON throughout. Part 3 does NOT reduce corporate network security posture — Node still validates every outbound TLS handshake against the Zscaler MITM root; we only make sure Node can actually _load_ that root.

The `claude doctor` check between every step is defense in depth: if any change unexpectedly affects Claude Code auth, we catch it immediately and roll back per Part 6.

---

## Part 8 — When to revisit / recheck

- **Cert rotation.** Zscaler rotates its intermediate CA periodically. When corp IT announces a new cert, re-run Part 3 step 2 (`cp` command) with the fresh file. Restart Node processes.
- **New TCC-protected paths.** macOS occasionally expands TCC coverage. If a future release also protects `~/certs/`, move to `/usr/local/etc/ssl/zscaler-cert.pem` (system-wide) or `~/.config/certs/`.
- **Team workstation onboarding.** Include this doc + the Zscaler cert file in the workstation-setup checklist for anyone else needing to run this repo locally.
- **Homebrew reinstall / macOS upgrade.** Re-run `claude doctor` first. If it fails, fix Claude Code before revisiting Part 3.

---

## Appendix — Related docs

- `docs/runbook-secrets.md` — rotate `OPENAI_API_KEY`, `JWT_SECRET`, `DATABASE_URL`, `RESEND_API_KEY`, `SUPER_ADMIN_PASSWORD`.
- `CLAUDE.md` — architecture invariants (multi-tenancy, migrations, feature flags, five-touchpoint rules).
- Org's Claude Code Setup guide — Viva channel: Claude Code Support.
