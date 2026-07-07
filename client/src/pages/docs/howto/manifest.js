// client/src/pages/docs/howto/manifest.js
//
// Single source of truth for the How-To Guide. Every task, group, and
// role-gate lives here. Structural invariants are checked by
// client/scripts/validate-manifest.js in pre-push.
//
// See docs/superpowers/specs/2026-07-07-how-to-guide-redesign-design.md
// for design rationale.

export const ROLES = ['member', 'team-admin', 'super-admin']

export const GROUPS = {
    'getting-started':      { label: '🚀 Getting Started',      roles: ['*'],           order: 1 },
    'learn':                { label: '📚 Learn',                 roles: ['member'],      order: 2 },
    'practice':             { label: '💪 Practice',              roles: ['member'],      order: 3 },
    'insights':             { label: '📊 Insights',              roles: ['member'],      order: 4 },
    'curriculum-authoring': { label: '📚 Curriculum Authoring',  roles: ['team-admin'],  order: 5 },
    'problem-bank':         { label: '📝 Problem Bank',          roles: ['team-admin'],  order: 6 },
    'team-management':      { label: '👥 Team Management',       roles: ['team-admin'],  order: 7 },
    'platform-ops':         { label: '⚡ Platform Operations',   roles: ['super-admin'], order: 8 },
    'moderation':           { label: '🛡️ Moderation',           roles: ['super-admin'], order: 9 },
    'support':              { label: '💬 Support',               roles: ['*'],           order: 10 },
}

export const TASKS = []

// ── Hash alias map ─────────────────────────────────────
// The old How-To was a single-page-scrolling doc with hash anchors like
// #solve, #ds-sd. Existing bookmarks and inbound links (e.g. feedback
// email templates) may still use these. HowToShell reads on mount and
// navigates to the equivalent task page. Unknown hashes pass through.
export const HASH_ALIAS_MAP = {
    'overview':          'what-is-problem-solver',
    'ds-sd':             'design-studio-sd',
    'ds-lld':            'design-studio-lld',
    'solve':             'solve-problem',
    'edit-solution':     'edit-solution',
    'history':           'attempt-history',
    'review':            'review-queue',
    'report':            'intelligence-report',
    'add-problem-ai':    'add-problem-ai',
    'add-problem-manual':'add-problem-manual',
    'quiz':              'quiz',
    'mock':              'mock-interview',
    'feedback':          'feedback',
}

// ── Helpers ────────────────────────────────────────────

export function findTask(id) {
    return TASKS.find(t => t.id === id)
}

export function tasksForRole(effectiveRole) {
    return TASKS.filter(t => t.role === effectiveRole || t.role === '*')
}

export function groupsForRole(effectiveRole) {
    return Object.entries(GROUPS)
        .filter(([, g]) => g.roles.includes(effectiveRole) || g.roles.includes('*'))
        .sort(([, a], [, b]) => a.order - b.order)
        .map(([id, g]) => ({ id, ...g }))
}
