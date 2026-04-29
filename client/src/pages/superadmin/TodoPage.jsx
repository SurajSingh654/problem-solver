// ============================================================================
// ProbSolver v3.0 — Product Roadmap & TODO (SUPER_ADMIN)
// ============================================================================
//
// Internal tracker for planned improvements and technical debt.
// Items are removed from here when completed and added to the changelog.
//
// ============================================================================
import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@utils/cn'

const TODO_ITEMS = [
    // ── Problem Generation ───────────────────────────────
    {
        id: 'multi-platform-search',
        category: 'Problem Generation',
        priority: 'HIGH',
        effort: 'Medium',
        title: 'Multi-platform problem search via Search API',
        description: 'Currently all AI-generated problems are from LeetCode only. Integrate Google Custom Search API or Serper.dev to resolve real URLs from GFG, HackerRank, InterviewBit, and CodeChef. Search query: "[problem title] site:[platform domain]" — takes the first result URL which is always correct.',
        why: 'Platform diversity gives users better preparation. GFG is better for Indian company interviews. HackerRank has unique problem sets. Users should be able to practice from multiple platforms.',
        technicalNotes: `
Server: Create server/src/services/search.service.js
- searchProblemUrl(title, platform) → returns verified URL
- Integrates with Serper.dev API (simple, just one API key)
- Falls back to platform search URL if API fails

Integration point: ai.controller.js generateProblemsAI()
- After Stage 2 (problem selection), for each selection call searchProblemUrl()
- Replace AI-generated URL with verified search result URL
- Cache resolved URLs in a problems_catalog table for future use

Environment variables needed:
- SERPER_API_KEY or GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX
        `.trim(),
    },
    {
        id: 'problem-catalog',
        category: 'Problem Generation',
        priority: 'HIGH',
        effort: 'Large',
        title: 'Curated problem catalog with verified URLs',
        description: 'Build an internal database of verified interview problems with exact URLs, difficulty, company tags, and patterns. AI selects from this catalog instead of generating free-form. Catalog grows automatically — every resolved URL gets saved.',
        why: '100% reliable URLs. No API dependency at query time. Builds a strategic asset — your own problem library is a competitive moat that improves over time.',
        technicalNotes: `
Schema: Add ProblemCatalog model
  id, title, platform, url, difficulty, category, tags[], companyTags[], 
  pattern, verifiedAt, addedById, sourceType (manual | auto-resolved)

Seed: 500 well-known interview problems as initial dataset
Auto-grow: Every search API resolution → save to catalog
Admin UI: Super Admin can browse, add, verify, and mark deprecated

Integration: generateProblemsAI() checks catalog first before AI selection
        `.trim(),
    },
    {
        id: 'ai-problem-scheduling',
        category: 'Problem Generation',
        priority: 'MEDIUM',
        effort: 'Medium',
        title: 'Scheduled AI problem generation (auto-pilot mode)',
        description: 'Allow Team Admins to configure automatic daily/weekly problem generation. AI adds N problems per day based on team performance, without manual admin action. Configurable by category, difficulty progression, and company target.',
        why: 'Removes the burden from Team Admins. Teams stay engaged with fresh content. Mirrors how real interview prep programs work — structured, progressive curriculum.',
        technicalNotes: `
Add to Team model: aiScheduleConfig JSON
  { enabled: true, dailyCount: 2, categories: ["CODING"], frequency: "daily" }

Server: Cron job (node-cron) runs daily at configured time
  → Checks each team's schedule config
  → Calls generateProblemsAI() with team context
  → Auto-publishes or sends to admin review queue based on config

UI: Team Admin settings page → "AI Auto-generate" toggle with config options
        `.trim(),
    },

    // ── Authentication & Accounts ────────────────────────
    {
        id: 'oauth-social-login',
        category: 'Authentication',
        priority: 'HIGH',
        effort: 'Medium',
        title: 'Google + GitHub OAuth social login',
        description: 'Add "Sign in with Google" and "Sign in with GitHub" buttons to the login and registration pages. Eliminates email verification friction for new users.',
        why: 'Registration drop-off is highest at email verification. Social login removes this entirely. GitHub login is especially relevant for engineering candidates — they already have accounts.',
        technicalNotes: `
Server: Add passport.js with Google and GitHub strategies
  → On first OAuth login: create user, skip email verification, go to onboarding
  → On subsequent: find by email, log in directly

Client: Add OAuth buttons to Login.jsx and Register.jsx
  → Redirect to /auth/google or /auth/github
  → Callback stores token + redirects to app

Environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
        `.trim(),
    },
    {
        id: 'email-notifications',
        category: 'Authentication',
        priority: 'MEDIUM',
        effort: 'Small',
        title: 'Email notifications system',
        description: 'Send email notifications for: spaced repetition reviews due, new problems added by team admin, weekly progress digest, streak reminders, team activity updates. Resend integration is already set up.',
        why: 'Notifications are the single highest-impact retention mechanism. Users who receive review reminders return 3x more often than those who don\'t.',
        technicalNotes: `
Create server/src/services/notification.service.js
  → sendReviewReminderEmail(user, dueCount)
  → sendWeeklyDigestEmail(user, stats)
  → sendNewProblemsEmail(teamMembers, problems)

Trigger points:
  - Daily cron: check nextReviewDate, send reminder if due > 0
  - On problem creation: notify team members
  - Weekly: digest of progress, streak, upcoming reviews

User preferences: Add notificationPrefs JSON to User model
        `.trim(),
    },

    // ── User Features ────────────────────────────────────
    {
        id: 'voice-interviews',
        category: 'User Features',
        priority: 'MEDIUM',
        effort: 'Large',
        title: 'Voice-based mock interviews',
        description: 'Extend the AI Mock Interview to support spoken conversation. User speaks their answer, Whisper (OpenAI STT) transcribes it, AI responds via text-to-speech. Simulates a real phone screen or in-person interview.',
        why: 'Most real interviews are spoken, not typed. Behavioral and HR rounds especially require verbal fluency. Voice practice builds confidence that text practice can\'t.',
        technicalNotes: `
Server: Add /api/interview-v2/voice/transcribe endpoint
  → Receives audio blob → OpenAI Whisper → returns transcript
  → Feed transcript into existing interview engine

Client: Add microphone button to interview chat input
  → MediaRecorder API to capture audio
  → Send to transcribe endpoint → populate input field
  → Optional: AI response via browser TTS (SpeechSynthesis API)

Cost: Whisper API is $0.006/minute — very affordable
        `.trim(),
    },
    {
        id: 'competition-system',
        category: 'User Features',
        priority: 'MEDIUM',
        effort: 'Large',
        title: 'Competition system with live leaderboard',
        description: 'Timed competition events where team members solve the same problem set simultaneously. Live leaderboard updates in real-time. Schema already has Competition and CompetitionEntry models.',
        why: 'Competitions create urgency and engagement that regular practice lacks. They reveal how users perform under real interview-like time pressure. Teams with competitions have significantly higher engagement.',
        technicalNotes: `
Schema: Competition and CompetitionEntry models already exist in schema.prisma
  → Just need to implement the controllers and UI

Server: 
  → POST /api/competitions (SuperAdmin creates)
  → POST /api/competitions/:id/join (user joins)
  → WebSocket: real-time leaderboard updates during competition
  → POST /api/competitions/:id/submit (submit answer)

Client: Competition lobby, live problem view, real-time leaderboard
        `.trim(),
    },
    {
        id: 'interview-pipeline-tracker',
        category: 'User Features',
        priority: 'LOW',
        effort: 'Medium',
        title: 'Interview pipeline tracker',
        description: 'Let users track their real interview applications: company, role, stage (applied/phone screen/technical/onsite/offer), date, outcome, and notes. Connects practice to real outcomes.',
        why: 'Users who see the connection between their practice and real interview outcomes stay engaged longer. The data also helps the AI make better recommendations — "you have a Google onsite in 2 weeks, focus on these topics."',
        technicalNotes: `
Schema: Add InterviewApplication model
  id, userId, company, role, stage, appliedAt, nextInterviewAt, outcome, notes

Client: New page /interview-tracker with kanban or list view
Server: CRUD endpoints for applications
Integration: AI weekly plan reads upcoming interviews and adjusts recommendations
        `.trim(),
    },
    {
        id: 'mobile-app',
        category: 'User Features',
        priority: 'LOW',
        effort: 'XLarge',
        title: 'Mobile app for reviews and quizzes on the go',
        description: 'React Native app focused on the two highest-frequency, low-friction activities: spaced repetition reviews and AI quizzes. The full platform stays on web.',
        why: 'Reviews and quizzes take 5-10 minutes. Users do them on the bus, waiting in line, at lunch. Mobile-first for these features dramatically increases daily engagement frequency.',
        technicalNotes: `
Scope: Review Queue + Quiz only (not problems, not mock interview)
Tech: React Native + Expo (shares component logic with web where possible)
Auth: Same JWT system, just different client
API: All existing endpoints work — no server changes needed
        `.trim(),
    },

    // ── Admin & Analytics ────────────────────────────────
    {
        id: 'typescript-migration',
        category: 'Technical Debt',
        priority: 'LOW',
        effort: 'XLarge',
        title: 'TypeScript migration',
        description: 'Incrementally migrate the codebase from JavaScript to TypeScript. Start with the server (controllers, services, middleware), then the client hooks and stores.',
        why: 'TypeScript catches entire categories of runtime bugs at compile time. The response envelope standardization we did is a good example — TypeScript would have caught the res.data.data mismatches before they reached production.',
        technicalNotes: `
Approach: Incremental — rename .js → .ts one file at a time
Start with: server/src/utils/response.ts (already typed behavior)
Then: controllers (most type-unsafe code lives here)
Client: hooks first (useAuth, useSolutions), then store
Target: 100% TypeScript in 3-6 months of incremental work
        `.trim(),
    },
    {
        id: 'redis-caching',
        category: 'Technical Debt',
        priority: 'LOW',
        effort: 'Medium',
        title: 'Redis caching for expensive endpoints',
        description: 'Add Redis caching layer for: platform analytics (expensive 15+ query aggregation), leaderboard (recalculated on every request), 6D report (complex multi-table computation). Cache invalidation on relevant data changes.',
        why: 'Currently relevant at 500+ active users. Platform analytics endpoint pulls entire tables into memory. At scale this becomes a real performance problem. Redis with 5-minute TTL eliminates 90% of these queries.',
        technicalNotes: `
Add: redis npm package + REDIS_URL environment variable
Create: server/src/lib/cache.js with get/set/invalidate helpers
Cache keys: "platform:health:30d", "leaderboard:teamId", "report:userId:teamId"
TTL: 5 minutes for analytics, 1 minute for leaderboard
Invalidation: on solution submit → invalidate leaderboard + report
        `.trim(),
    },
]

const PRIORITY_CONFIG = {
    HIGH: { color: 'bg-danger/10 text-danger border-danger/25', dot: 'bg-danger' },
    MEDIUM: { color: 'bg-warning/10 text-warning border-warning/25', dot: 'bg-warning' },
    LOW: { color: 'bg-info/10 text-info border-info/25', dot: 'bg-info' },
}

const EFFORT_CONFIG = {
    Small: 'bg-success/10 text-success border-success/25',
    Medium: 'bg-brand-400/10 text-brand-300 border-brand-400/25',
    Large: 'bg-warning/10 text-warning border-warning/25',
    XLarge: 'bg-danger/10 text-danger border-danger/25',
}

const CATEGORIES = [...new Set(TODO_ITEMS.map(t => t.category))]

function TodoItem({ item, index }) {
    const [expanded, setExpanded] = useState(false)
    const priority = PRIORITY_CONFIG[item.priority]

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            className="bg-surface-1 border border-border-default rounded-2xl overflow-hidden"
        >
            {/* Header */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-start gap-4 p-5 text-left
                   hover:bg-surface-2/50 transition-colors"
            >
                <div className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0 mt-1.5',
                    priority.dot
                )} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={cn(
                            'text-[9px] font-bold px-1.5 py-px rounded-full border',
                            priority.color
                        )}>
                            {item.priority}
                        </span>
                        <span className={cn(
                            'text-[9px] font-bold px-1.5 py-px rounded-full border',
                            EFFORT_CONFIG[item.effort]
                        )}>
                            {item.effort} effort
                        </span>
                        <span className="text-[9px] text-text-disabled bg-surface-3
                               border border-border-subtle rounded-full px-1.5 py-px">
                            {item.category}
                        </span>
                    </div>
                    <h3 className="text-sm font-bold text-text-primary">{item.title}</h3>
                    <p className="text-xs text-text-tertiary mt-0.5 line-clamp-1">
                        {item.description}
                    </p>
                </div>
                <motion.div
                    animate={{ rotate: expanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-text-disabled flex-shrink-0 mt-0.5"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </motion.div>
            </button>

            {/* Expanded detail */}
            {expanded && (
                <div className="px-5 pb-5 space-y-4 border-t border-border-subtle pt-4">
                    <div>
                        <p className="text-[10px] font-bold text-text-disabled uppercase
                               tracking-widest mb-1.5">
                            What & Why
                        </p>
                        <p className="text-xs text-text-secondary leading-relaxed">
                            {item.description}
                        </p>
                        <p className="text-xs text-brand-300 leading-relaxed mt-2">
                            → {item.why}
                        </p>
                    </div>
                    {item.technicalNotes && (
                        <div>
                            <p className="text-[10px] font-bold text-text-disabled uppercase
                                   tracking-widest mb-1.5">
                                Technical Notes
                            </p>
                            <pre className="text-[11px] text-text-tertiary leading-relaxed
                                    bg-surface-0 border border-border-subtle
                                    rounded-xl p-3 overflow-x-auto whitespace-pre-wrap
                                    font-mono">
                                {item.technicalNotes}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    )
}

export default function TodoPage() {
    const [activeCategory, setActiveCategory] = useState('All')

    const filtered = activeCategory === 'All'
        ? TODO_ITEMS
        : TODO_ITEMS.filter(t => t.category === activeCategory)

    const highCount = TODO_ITEMS.filter(t => t.priority === 'HIGH').length
    const mediumCount = TODO_ITEMS.filter(t => t.priority === 'MEDIUM').length
    const lowCount = TODO_ITEMS.filter(t => t.priority === 'LOW').length

    return (
        <div className="p-6 max-w-[900px] mx-auto">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-extrabold text-text-primary mb-1">
                    Product Roadmap
                </h1>
                <p className="text-sm text-text-tertiary">
                    Planned improvements and technical debt. Items are removed when completed.
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
                {[
                    { label: 'High Priority', value: highCount, color: 'text-danger', bg: 'bg-danger/5 border-danger/20' },
                    { label: 'Medium Priority', value: mediumCount, color: 'text-warning', bg: 'bg-warning/5 border-warning/20' },
                    { label: 'Low Priority', value: lowCount, color: 'text-info', bg: 'bg-info/5 border-info/20' },
                ].map(s => (
                    <div key={s.label}
                        className={cn('rounded-xl border p-4 text-center', s.bg)}>
                        <div className={cn('text-2xl font-extrabold font-mono', s.color)}>
                            {s.value}
                        </div>
                        <div className="text-[10px] text-text-disabled uppercase tracking-wider mt-0.5">
                            {s.label}
                        </div>
                    </div>
                ))}
            </div>

            {/* Category filter */}
            <div className="flex flex-wrap gap-1.5 mb-6">
                {['All', ...CATEGORIES].map(cat => (
                    <button
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        className={cn(
                            'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border',
                            activeCategory === cat
                                ? 'bg-brand-400/15 border-brand-400/30 text-brand-300'
                                : 'bg-surface-2 border-border-default text-text-tertiary hover:text-text-primary'
                        )}
                    >
                        {cat}
                        {cat !== 'All' && (
                            <span className="ml-1.5 text-text-disabled">
                                {TODO_ITEMS.filter(t => t.category === cat).length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Todo items */}
            <div className="space-y-3">
                {filtered.map((item, i) => (
                    <TodoItem key={item.id} item={item} index={i} />
                ))}
            </div>

            {/* Footer note */}
            <div className="mt-8 p-4 bg-surface-1 border border-border-default rounded-xl">
                <p className="text-xs text-text-tertiary leading-relaxed">
                    <span className="font-bold text-text-secondary">How to use this page:</span>{' '}
                    When an item is completed, remove it from the <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-[11px]">TODO_ITEMS</code> array
                    in <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-[11px]">TodoPage.jsx</code>.
                    Items are ordered by priority within each category.
                    Technical notes contain implementation details for future developers.
                </p>
            </div>
        </div>
    )
}