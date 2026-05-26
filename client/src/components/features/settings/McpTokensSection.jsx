// ============================================================================
// MCP token management — Settings section (Phase MCP-4-UI)
// ============================================================================
// Self-serve token issuance / listing / revocation. Mirrors the GitHub PAT
// UX pattern: token shown ONCE on creation, copy-to-clipboard, never
// retrievable later. Server endpoints + the 5-active-token cap are in
// server/src/controllers/mcpTokens.controller.js.
// ============================================================================

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    useMcpTokens,
    useCreateMcpToken,
    useRevokeMcpToken,
} from '@hooks/useMcpTokens'
import { useConfirm } from '@hooks/useConfirm'
import { useFocusTrap } from '@hooks/useFocusTrap'
import { Button } from '@components/ui/Button'
import { Input } from '@components/ui/Input'
import { toast } from '@store/useUIStore'
import { formatRelativeDate, formatShortDate } from '@utils/formatters'
import { cn } from '@utils/cn'

const MAX_ACTIVE = 5
const MCP_URL =
    import.meta.env.VITE_MCP_URL || 'https://your-deployment.example.com/mcp'

// ── Status chip ─────────────────────────────────────────
function StatusChip({ status }) {
    const cls = {
        active:  'bg-success-soft text-success-fg border-success-line',
        revoked: 'bg-surface-3   text-text-tertiary border-border-default',
        expired: 'bg-warning-soft text-warning-fg border-warning-line',
    }[status] || 'bg-surface-3 text-text-tertiary border-border-default'
    const label = { active: 'Active', revoked: 'Revoked', expired: 'Expired' }[status] || status
    return (
        <span className={cn(
            'inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border',
            cls,
        )}>
            {label}
        </span>
    )
}

// ── Token row ───────────────────────────────────────────
function TokenRow({ token, onRevoke }) {
    const isActive = token.status === 'active'
    return (
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center
                        py-3 border-b border-border-subtle last:border-b-0">
            <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate">
                    {token.name || <span className="text-text-tertiary italic">unnamed</span>}
                </p>
                <p className="text-[11px] text-text-tertiary mt-0.5 font-mono">
                    {token.jti.slice(0, 8)}…
                </p>
            </div>
            <StatusChip status={token.status} />
            <div className="text-right text-[11px] text-text-tertiary leading-tight">
                <p>Last used: {token.lastUsedAt ? formatRelativeDate(token.lastUsedAt) : 'Never'}</p>
                <p>{isActive ? 'Expires' : 'Created'}: {formatShortDate(isActive ? token.expiresAt : token.issuedAt)}</p>
            </div>
            {isActive ? (
                <Button
                    type="button"
                    variant="danger"
                    size="xs"
                    onClick={() => onRevoke(token)}
                >
                    Revoke
                </Button>
            ) : (
                <span className="w-[60px]" /> /* spacer */
            )}
        </div>
    )
}

// ── Create modal ────────────────────────────────────────
function CreateTokenModal({ created, onClose }) {
    const containerRef = useFocusTrap({ active: true, onEscape: onClose })
    const [revealed, setRevealed] = useState(false)

    const cliSnippet =
        `claude mcp add --transport http --scope user binary-thinkers ` +
        `${MCP_URL} --header "Authorization: Bearer ${created.token}"`

    function copy(text, label) {
        navigator.clipboard
            .writeText(text)
            .then(() => toast.success(`${label} copied to clipboard.`))
            .catch(() => toast.error(`Failed to copy ${label.toLowerCase()}.`))
    }

    const masked = '•'.repeat(48)

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4"
            role="presentation"
            onClick={onClose}
        >
            <motion.div
                ref={containerRef}
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ duration: 0.15 }}
                onClick={(e) => e.stopPropagation()}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="mcp-token-title"
                className="bg-surface-1 border border-border-default rounded-2xl
                           w-full max-w-2xl shadow-2xl"
            >
                <div className="p-5 space-y-4">
                    <div>
                        <h2 id="mcp-token-title" className="text-base font-bold text-text-primary">
                            Token created — copy it now
                        </h2>
                        <p className="text-xs text-text-tertiary mt-1">
                            {created.name ? <><span className="font-semibold">{created.name}</span> · </> : null}
                            Expires {formatShortDate(created.expiresAt)}
                        </p>
                    </div>

                    {/* Strong warning */}
                    <div className="flex items-start gap-2 p-3 bg-warning-soft border border-warning-line rounded-lg">
                        <span aria-hidden className="text-base leading-none mt-px">⚠</span>
                        <div className="text-xs text-warning-fg leading-relaxed">
                            <strong>This token will not be shown again.</strong> Copy it before
                            closing this dialog. If you lose it, revoke and create a new one.
                        </div>
                    </div>

                    {/* Token field */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-text-secondary">Token</label>
                        <div className="flex items-stretch gap-2">
                            <code className="flex-1 px-3 py-2 bg-surface-2 border border-border-default
                                              rounded-md text-xs font-mono break-all select-all"
                                  aria-label="MCP token"
                            >
                                {revealed ? created.token : masked}
                            </code>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => setRevealed((v) => !v)}
                                aria-label={revealed ? 'Hide token' : 'Reveal token'}
                            >
                                {revealed ? 'Hide' : 'Reveal'}
                            </Button>
                            <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                onClick={() => copy(created.token, 'Token')}
                            >
                                Copy
                            </Button>
                        </div>
                    </div>

                    {/* CLI snippet */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-text-secondary">
                            Add to Claude Code
                        </label>
                        <div className="space-y-2">
                            <pre className="px-3 py-2 bg-surface-2 border border-border-default
                                            rounded-md text-[11px] font-mono whitespace-pre-wrap
                                            break-all leading-relaxed text-text-primary"
                            >
                                {cliSnippet}
                            </pre>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => copy(cliSnippet, 'CLI snippet')}
                            >
                                Copy snippet
                            </Button>
                        </div>
                        <p className="text-[11px] text-text-tertiary mt-1">
                            After running this, restart Claude Code and run <code>/mcp</code> to verify the connection.
                        </p>
                    </div>
                </div>
                <div className="px-5 py-3 border-t border-border-subtle bg-surface-2/40
                                rounded-b-2xl flex items-center justify-end">
                    <Button type="button" variant="primary" size="sm" onClick={onClose}>
                        I copied it — close
                    </Button>
                </div>
            </motion.div>
        </motion.div>
    )
}

// ══════════════════════════════════════════════════════
// Main section
// ══════════════════════════════════════════════════════
export function McpTokensSection() {
    const { data: tokens, isLoading, isError } = useMcpTokens()
    const createToken = useCreateMcpToken()
    const revokeToken = useRevokeMcpToken()
    const confirm = useConfirm()

    const [showNameInput, setShowNameInput] = useState(false)
    const [name, setName] = useState('')
    const [created, setCreated] = useState(null)

    const list = tokens ?? []
    const activeCount = list.filter((t) => t.status === 'active').length
    const atCap = activeCount >= MAX_ACTIVE

    async function handleCreate() {
        try {
            const trimmed = name.trim()
            const result = await createToken.mutateAsync(
                trimmed ? { name: trimmed } : {},
            )
            setCreated(result)
            setShowNameInput(false)
            setName('')
        } catch {
            /* error toasted by hook */
        }
    }

    async function handleRevoke(token) {
        const ok = await confirm({
            title: 'Revoke this token?',
            description: `${token.name || 'This token'} will stop working within 60 seconds. Any MCP client using it will need a new token.`,
            confirmLabel: 'Revoke',
            danger: true,
        })
        if (!ok) return
        try {
            await revokeToken.mutateAsync(token.jti)
        } catch {
            /* error toasted by hook */
        }
    }

    return (
        <>
            <div className="space-y-3">
                {/* Description */}
                <p className="text-xs text-text-tertiary leading-relaxed">
                    Tokens for connecting MCP clients (Claude Code, Cursor, etc.) to
                    your Binary Thinkers data. Each token is shown once on creation —
                    if you lose it, revoke and create a new one. Up to {MAX_ACTIVE} active
                    tokens per account.
                </p>

                {/* Token list */}
                {isLoading && (
                    <div className="text-xs text-text-tertiary py-3">Loading tokens…</div>
                )}
                {isError && (
                    <div className="text-xs text-danger-fg py-3">
                        Failed to load tokens. Refresh to try again.
                    </div>
                )}
                {!isLoading && !isError && list.length === 0 && (
                    <div className="text-xs text-text-tertiary py-3 italic">
                        No tokens yet. Create one to connect your MCP client.
                    </div>
                )}
                {!isLoading && !isError && list.length > 0 && (
                    <div className="bg-surface-2 border border-border-default rounded-xl px-4">
                        {list.map((token) => (
                            <TokenRow
                                key={token.jti}
                                token={token}
                                onRevoke={handleRevoke}
                            />
                        ))}
                    </div>
                )}

                {/* Create flow */}
                {!showNameInput ? (
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            disabled={atCap}
                            onClick={() => setShowNameInput(true)}
                            title={
                                atCap
                                    ? `${MAX_ACTIVE} active tokens (max). Revoke one first.`
                                    : ''
                            }
                        >
                            New token
                        </Button>
                        {atCap && (
                            <span className="text-[11px] text-text-tertiary">
                                Max reached — revoke one first
                            </span>
                        )}
                    </div>
                ) : (
                    <div className="flex items-end gap-2 p-3 bg-surface-2 border border-border-default rounded-xl">
                        <Input
                            label="Name (optional)"
                            placeholder="e.g. My Mac, Work laptop"
                            value={name}
                            onChange={(e) => setName(e.target.value.slice(0, 80))}
                            className="flex-1"
                        />
                        <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            loading={createToken.isPending}
                            onClick={handleCreate}
                        >
                            Create
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setShowNameInput(false)
                                setName('')
                            }}
                        >
                            Cancel
                        </Button>
                    </div>
                )}
            </div>

            {/* Create modal — shown ONCE after creation */}
            <AnimatePresence>
                {created && (
                    <CreateTokenModal
                        created={created}
                        onClose={() => setCreated(null)}
                    />
                )}
            </AnimatePresence>
        </>
    )
}
