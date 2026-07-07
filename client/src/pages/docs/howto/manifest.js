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

export const TASKS = [
    // ── MEMBER guides ───────────────────────────────────────
    {
        id: 'learn-curriculum-topic',
        role: 'member',
        group: 'learn',
        icon: '📚',
        title: 'Learn a Curriculum Topic',
        summary: 'Enroll on a team-published topic, work each concept Primer → Lab → Check-in → Reveal → Teach.',
        keywords: ['learn', 'curriculum', 'topic', 'concept', 'primer', 'lab', 'check-in', 'teach', 'enroll', 'mastery'],
        estimatedMinutes: 30,
        prerequisites: [],
        relatedTasks: ['solve-problem', 'notes', 'review-queue'],
        component: () => import('./content/member/learn-curriculum-topic.jsx'),
        hasErrors: true,
    },
    {
        id: 'solve-problem',
        role: 'member',
        group: 'practice',
        icon: '📝',
        title: 'Solve a Problem',
        summary: 'Pick a team-curated problem, write your solution, submit for AI review across 5 dimensions.',
        keywords: ['solve', 'submit', 'solution', 'problem', 'coding', 'review', 'workspace'],
        estimatedMinutes: 15,
        prerequisites: [],
        relatedTasks: ['edit-solution', 'attempt-history', 'review-queue'],
        component: () => import('./content/member/solve-problem.jsx'),
        hasErrors: true,
    },
    {
        id: 'design-studio-sd',
        role: 'member',
        group: 'practice',
        icon: '🏗️',
        title: 'Design Studio — System Design',
        summary: 'Full System Design walkthrough: 7 phases, AI Coach, scenarios, scale analysis, final evaluation.',
        keywords: ['system design', 'sd', 'design studio', 'architecture', 'scale', 'ai coach', 'excalidraw'],
        estimatedMinutes: 40,
        prerequisites: [],
        relatedTasks: ['design-studio-lld', 'mock-interview', 'intelligence-report'],
        component: () => import('./content/member/design-studio-sd.jsx'),
        hasErrors: false,
    },
    {
        id: 'design-studio-lld',
        role: 'member',
        group: 'practice',
        icon: '🔧',
        title: 'Design Studio — Low-Level Design',
        summary: 'Low-Level Design walkthrough: 6 phases from Requirements to SOLID, OOP-specific evaluation.',
        keywords: ['low-level design', 'lld', 'oop', 'solid', 'strategy pattern', 'class hierarchy', 'design studio'],
        estimatedMinutes: 40,
        prerequisites: [],
        relatedTasks: ['design-studio-sd', 'mock-interview', 'intelligence-report'],
        component: () => import('./content/member/design-studio-lld.jsx'),
        hasErrors: false,
    },
    {
        id: 'edit-solution',
        role: 'member',
        group: 'practice',
        icon: '✏️',
        title: 'Edit a Solution',
        summary: 'Revise a previous solution — re-run AI scoring while every prior attempt is preserved as a snapshot.',
        keywords: ['edit', 'revise', 'update', 'solution', 'resubmit', 'improve'],
        estimatedMinutes: 5,
        prerequisites: [],
        relatedTasks: ['solve-problem', 'attempt-history', 'review-queue'],
        component: () => import('./content/member/edit-solution.jsx'),
        hasErrors: false,
    },
    {
        id: 'attempt-history',
        role: 'member',
        group: 'practice',
        icon: '🕓',
        title: 'Attempt History + A/B Diff',
        summary: 'Every submit / edit / Design Studio bridge appends an immutable snapshot; diff any two attempts.',
        keywords: ['history', 'attempts', 'diff', 'timeline', 'a/b', 'snapshot', 'trajectory'],
        estimatedMinutes: 5,
        prerequisites: [],
        relatedTasks: ['solve-problem', 'edit-solution', 'review-queue'],
        component: () => import('./content/member/attempt-history.jsx'),
        hasErrors: false,
    },
    {
        id: 'review-queue',
        role: 'member',
        group: 'practice',
        icon: '🔁',
        title: 'Review Queue + Recall',
        summary: 'Spaced repetition — recall then reveal then rate. SM-2 schedules your next review by confidence.',
        keywords: ['review', 'recall', 'sm-2', 'spaced repetition', 'queue', 'retention', 'diff', 'mixed mode'],
        estimatedMinutes: 15,
        prerequisites: [],
        relatedTasks: ['solve-problem', 'edit-solution', 'intelligence-report'],
        component: () => import('./content/member/review-queue.jsx'),
        hasErrors: true,
    },
    {
        id: 'quiz',
        role: 'member',
        group: 'practice',
        icon: '🎯',
        title: 'Attempt a Quiz',
        summary: 'AI-generated multiple choice on any subject — 5–30 questions with per-option explanations.',
        keywords: ['quiz', 'multiple choice', 'mcq', 'test', 'refresher', 'ai-generated'],
        estimatedMinutes: 15,
        prerequisites: [],
        relatedTasks: ['mock-interview', 'intelligence-report', 'review-queue'],
        component: () => import('./content/member/quiz.jsx'),
        hasErrors: false,
    },
    {
        id: 'mock-interview',
        role: 'member',
        group: 'practice',
        icon: '🎙️',
        title: 'Mock Interview',
        summary: 'Live AI interviewer over WebSocket — text or voice mode. SD/LLD routes into Design Studio interview mode.',
        keywords: ['mock', 'interview', 'websocket', 'voice', 'live', 'ai interviewer', 'debrief'],
        estimatedMinutes: 45,
        prerequisites: [],
        relatedTasks: ['design-studio-sd', 'design-studio-lld', 'intelligence-report'],
        component: () => import('./content/member/mock-interview.jsx'),
        hasErrors: true,
    },
    {
        id: 'intelligence-report',
        role: 'member',
        group: 'insights',
        icon: '📊',
        title: 'Intelligence Report',
        summary: 'Calibrated readiness across dimensions, 95% CI, AI verdict, and per-tier readiness (FAANG / T2 / T3 / Junior).',
        keywords: ['report', 'dimensions', 'readiness', 'tier', 'verdict', 'activation', 'ci', 'confidence interval'],
        estimatedMinutes: 10,
        prerequisites: [],
        relatedTasks: ['solve-problem', 'review-queue', 'mock-interview'],
        component: () => import('./content/member/intelligence-report.jsx'),
        hasErrors: false,
    },
    {
        id: 'notes',
        role: 'member',
        group: 'practice',
        icon: '📝',
        title: 'Personal Notes on a Problem',
        summary: 'Private markdown notes tied to problems, interviews, design sessions, or teaching sessions.',
        keywords: ['notes', 'markdown', 'personal', 'notebook', 'attach', 'pin', 'archive', 'folders'],
        estimatedMinutes: 10,
        prerequisites: [],
        relatedTasks: ['solve-problem', 'learn-curriculum-topic', 'review-queue'],
        component: () => import('./content/member/notes.jsx'),
        hasErrors: false,
    },
    {
        id: 'join-team',
        role: 'member',
        group: 'practice',
        icon: '👥',
        title: 'Join or Switch a Team',
        summary: 'Enter a team join code to become a MEMBER, or use the sidebar team switcher to move between teams.',
        keywords: ['team', 'join', 'switch', 'join code', 'membership', 'personal mode', 'invite'],
        estimatedMinutes: 5,
        prerequisites: [],
        relatedTasks: ['solve-problem', 'learn-curriculum-topic', 'feedback'],
        component: () => import('./content/member/join-team.jsx'),
        hasErrors: true,
    },
    {
        id: 'feedback',
        role: '*',
        group: 'support',
        icon: '💬',
        title: 'File Feedback',
        summary: 'Report bugs, request features, or flag content. Tracked to resolution from a shared admin inbox.',
        keywords: ['feedback', 'bug', 'issue', 'report', 'feature request', 'content flag', 'support'],
        estimatedMinutes: 3,
        prerequisites: [],
        relatedTasks: [],
        component: () => import('./content/member/feedback.jsx'),
        hasErrors: false,
    },
]

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
