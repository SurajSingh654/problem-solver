import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
    DocsLayout, DocsHero, Section, SectionTitle, SectionDesc,
    CardGrid, FeatureCard, StackItem, Table, Check, Cross,
    ArchBlock, FileTree, DimCard, Callout, SbLink,
} from './components'

// ── Sidebar sections ───────────────────────────────────
const NAV = [
    {
        group: 'Overview', items: [
            { id: 'what', label: 'What Is It' },
            { id: 'why', label: 'Why Different' },
            { id: 'features', label: 'Features' },
        ]
    },
    {
        group: 'Architecture', items: [
            { id: 'stack', label: 'Tech Stack' },
            { id: 'arch', label: 'System Design' },
            { id: 'structure', label: 'File Structure' },
            { id: 'dataflow', label: 'Data Flow' },
        ]
    },
    {
        group: 'Intelligence', items: [
            { id: 'dimensions', label: '6D Engine' },
            { id: 'ai', label: 'AI Integration' },
        ]
    },
    {
        group: 'Reference', items: [
            { id: 'roles', label: 'Roles' },
            { id: 'api', label: 'API Endpoints' },
            { id: 'schema', label: 'Database Schema' },
            { id: 'pages', label: 'Pages' },
            { id: 'changelog', label: 'Changelog' },
        ]
    },
]

export default function ReadmePage() {
    const [active, setActive] = useState('what')
    const mainRef = useRef(null)

    // Scroll spy
    useEffect(() => {
        const allIds = NAV.flatMap(g => g.items.map(i => i.id))
        const observer = new IntersectionObserver(
            entries => {
                entries.forEach(e => {
                    if (e.isIntersecting) setActive(e.target.id)
                })
            },
            { rootMargin: '-20% 0px -65% 0px' }
        )
        allIds.forEach(id => {
            const el = document.getElementById(id)
            if (el) observer.observe(el)
        })
        return () => observer.disconnect()
    }, [])

    const scrollToSection = (href) => {
        const id = href.replace('#', '')
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setActive(id)
    }

    // Sidebar content
    const sidebar = (
        <>
            {/* Logo */}
            <div className="flex items-center gap-3 px-5 py-6
                      border-b border-border-default flex-shrink-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center
                        text-lg flex-shrink-0"
                    style={{
                        background: 'linear-gradient(135deg,#7c6ff7,#60a5fa)',
                        boxShadow: '0 0 20px rgba(124,111,247,0.3)'
                    }}>
                    ⚡
                </div>
                <div>
                    <div className="text-sm font-extrabold bg-gradient-to-r from-brand-300
                          to-blue-400 bg-clip-text text-transparent">
                        ProbSolver
                    </div>
                    <div className="text-[11px] text-text-disabled font-mono uppercase tracking-wider">
                        README · v2.0.0
                    </div>
                </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 py-4 space-y-4">
                {NAV.map(group => (
                    <div key={group.group}>
                        <div className="text-[11px] font-bold text-text-disabled uppercase
                            tracking-widest px-2.5 pb-1.5">
                            {group.group}
                        </div>
                        <div className="space-y-0.5">
                            {group.items.map(item => (
                                <SbLink
                                    key={item.id}
                                    href={'#' + item.id}
                                    active={active === item.id}
                                    onClick={scrollToSection}
                                >
                                    {item.label}
                                </SbLink>
                            ))}
                        </div>
                    </div>
                ))}

                {/* Links */}
                <div>
                    <div className="text-[11px] font-bold text-text-disabled uppercase
                          tracking-widest px-2.5 pb-1.5">
                        Links
                    </div>
                    <div className="space-y-0.5">
                        <Link to="/docs/setup"
                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg
                             text-xs font-medium text-text-tertiary
                             hover:bg-surface-3 hover:text-text-primary transition-all">
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-400/40" />
                            Setup Guide →
                        </Link>
                        <Link to="/"
                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg
                             text-xs font-medium text-text-tertiary
                             hover:bg-surface-3 hover:text-text-primary transition-all">
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-400/40" />
                            ← Back to App
                        </Link>
                    </div>
                </div>
            </nav>
        </>
    )

    return (
        <DocsLayout sidebar={sidebar}>

            {/* Hero */}
            <DocsHero
                eyebrow="⚡ Team Edition · v2.0.0"
                title="ProbSolver —"
                titleGradient="Team Intelligence Platform"
                desc="Most engineers fail top interviews not because they haven't solved enough problems — but because they've been solving them the wrong way. ProbSolver fixes that. A full learning intelligence system built for engineering teams serious about cracking top-tier interviews."
            >
                <div className="flex flex-wrap gap-2">
                    {[
                        ['purple', 'React 18 + Vite'],
                        ['blue', 'Node.js + Express'],
                        ['green', 'Prisma + SQLite → PostgreSQL'],
                        ['yellow', 'TanStack Query'],
                        ['purple', 'Zustand'],
                        ['blue', 'Framer Motion'],
                        ['red', 'JWT Auth'],
                        ['green', 'Recharts'],
                    ].map(([color, label]) => (
                        <span key={label}
                            className={`px-3 py-1 rounded-full text-xs font-semibold border
                    ${color === 'purple' ? 'bg-brand-400/12 text-brand-300 border-brand-400/25' :
                                    color === 'blue' ? 'bg-blue-500/12 text-blue-400 border-blue-500/25' :
                                        color === 'green' ? 'bg-success/12 text-success border-success/25' :
                                            color === 'yellow' ? 'bg-warning/12 text-warning border-warning/25' :
                                                'bg-danger/12  text-danger  border-danger/25'}`}>
                            {label}
                        </span>
                    ))}
                </div>
            </DocsHero>

            {/* Content */}
            <div className="px-10 py-12 max-w-4xl">

                {/* What is it */}
                <Section id="what">
                    <SectionTitle icon="🧠">What Is ProbSolver</SectionTitle>
                    <SectionDesc>A team-first, intelligence-driven platform for serious interview preparation.</SectionDesc>
                    <p className="text-sm text-text-secondary leading-relaxed mb-3">
                        Most engineers fail top interviews not because they haven't solved enough problems,
                        but because they've been solving them wrong. They memorise solutions instead of
                        building pattern recognition. They practice alone instead of learning from peers.
                    </p>
                    <p className="text-sm text-text-secondary leading-relaxed mb-6">
                        ProbSolver fixes all three. An Admin curates the problem list with real-world
                        context and follow-up questions. Every member submits their own solution capturing
                        their full thinking process. The platform analyses everything and generates a
                        personalised intelligence report.
                    </p>
                    <CardGrid cols={4}>
                        <FeatureCard icon="👑" title="Admin Curates" desc="Admin adds problems with source links, real-world context, use cases, and follow-up questions." />
                        <FeatureCard icon="💡" title="Team Solves" desc="Every member submits their own solution with approach, complexity, code, and insights." />
                        <FeatureCard icon="📊" title="Platform Analyses" desc="The intelligence engine computes 6 readiness dimensions and generates an actionable report." />
                        <FeatureCard icon="🏆" title="Team Grows" desc="Compare solutions, rate clarity, compete on leaderboard, and level up together." />
                    </CardGrid>
                </Section>

                {/* Why different */}
                <Section id="why">
                    <SectionTitle icon="🎯">Why This Is Different</SectionTitle>
                    <SectionDesc>How ProbSolver compares to existing tools.</SectionDesc>
                    <Table
                        headers={['Feature', 'ProbSolver', 'LeetCode', 'NeetCode', 'AlgoExpert']}
                        rows={[
                            ['Team collaboration', <Check />, <Cross />, <Cross />, <Cross />],
                            ["See teammates' solutions", <Check />, <Cross />, <Cross />, <Cross />],
                            ['Real-world context', <span className="text-success font-semibold text-xs">✓ Admin-curated</span>, <Cross />, <Cross />, 'Partial'],
                            ['6D intelligence report', <Check />, <Cross />, <Cross />, <Cross />],
                            ['Personalised action plan', <Check />, <Cross />, <Cross />, <Cross />],
                            ['Interview simulation', <Check />, 'Premium', <Cross />, 'Premium'],
                            ['Spaced repetition reviews', <Check />, <Cross />, <Cross />, <Cross />],
                            ['AI integration (Phase 2)', <span className="text-success font-semibold text-xs">✓ Planned</span>, 'Partial', <Cross />, 'Partial'],
                            ['Free for teams', <span className="text-success font-semibold text-xs">✓ Self-hosted</span>, 'Freemium', <Check />, 'Paid'],
                        ]}
                    />
                </Section>

                {/* Features */}
                <Section id="features">
                    <SectionTitle icon="✨">Features</SectionTitle>
                    <CardGrid cols={4}>
                        <FeatureCard icon="📋" title="Problem Library" desc="Admin-curated with source links, difficulty, tags, company tags, real-world context, and follow-up questions." />
                        <FeatureCard icon="📝" title="5-Step Solution Form" desc="Pattern ID → brute force → optimized approach + code → depth (Feynman, real world) → self-assessment." />
                        <FeatureCard icon="👥" title="Team Solutions View" desc="See every teammate's solution side by side. Rate clarity scores on each one." />
                        <FeatureCard icon="📊" title="Intelligence Report" desc="6D readiness radar chart, strengths, weaknesses, blind spots, company readiness, and weekly action plan." />
                        <FeatureCard icon="⏱️" title="Interview Simulation" desc="45-minute timed mode. No hints, no tags. Post-sim debrief with self-scoring." />
                        <FeatureCard icon="🧠" title="Spaced Repetition" desc="Review queue surfaces problems at scientifically optimal intervals." />
                        <FeatureCard icon="🏆" title="Leaderboard" desc="Ranked by readiness score, problems solved, streak, and difficulty mix." />
                        <FeatureCard icon="🤖" title="AI Ready (Phase 2)" desc="Architecture built for AI from day one. One env flag + API key activates it." />
                    </CardGrid>
                </Section>

                {/* Tech stack */}
                <Section id="stack">
                    <SectionTitle icon="🛠">Tech Stack</SectionTitle>
                    <h3 className="text-sm font-bold text-text-primary mb-3 mt-4">Frontend</h3>
                    <div className="grid grid-cols-2 gap-2.5 mb-5">
                        <StackItem emoji="⚛️" name="React 18" desc="Component UI with hooks" />
                        <StackItem emoji="⚡" name="Vite 5" desc="Instant HMR, fast builds" />
                        <StackItem emoji="🎨" name="TailwindCSS v3" desc="Utility-first styling" />
                        <StackItem emoji="🎭" name="Framer Motion" desc="Spring physics animations" />
                        <StackItem emoji="🔄" name="TanStack Query v5" desc="Server state + caching" />
                        <StackItem emoji="🐻" name="Zustand v5" desc="Lightweight UI state" />
                        <StackItem emoji="📈" name="Recharts" desc="React-native charts" />
                        <StackItem emoji="📋" name="React Hook Form + Zod" desc="Forms + validation" />
                    </div>
                    <h3 className="text-sm font-bold text-text-primary mb-3">Backend</h3>
                    <div className="grid grid-cols-2 gap-2.5">
                        <StackItem emoji="🟢" name="Node.js 20 + Express" desc="REST API server" />
                        <StackItem emoji="🔺" name="Prisma 5" desc="Type-safe ORM" />
                        <StackItem emoji="📁" name="SQLite (Phase 1)" desc="Zero-setup file database" />
                        <StackItem emoji="🍃" name="PostgreSQL (Phase 2)" desc="Production database" />
                        <StackItem emoji="🔐" name="JWT + bcryptjs" desc="Auth + password hashing" />
                        <StackItem emoji="✅" name="Zod (shared)" desc="Validation on client + server" />
                    </div>
                </Section>

                {/* Architecture */}
                <Section id="arch">
                    <SectionTitle icon="🏗">System Architecture</SectionTitle>
                    <SectionDesc>How the pieces fit together.</SectionDesc>
                    <ArchBlock>
                        {`Browser (React SPA)              Express API                Database
┌─────────────────────┐  REST   ┌──────────────────┐  Prisma  ┌──────────────┐
│  React 18 + Vite    │ ──────► │ Node.js + Express│ ───────► │ SQLite (dev) │ ← Phase 1
│  :5173              │ ◄────── │ :5000            │          └──────────────┘
│                     │  JSON   │                  │
│  TanStack Query     │         │  Routes          │          ┌──────────────┐
│  (server state)     │         │  Controllers     │ ───────► │ PostgreSQL   │ ← Phase 2
│                     │         │  Middleware       │          └──────────────┘
│  Zustand            │         │  Prisma ORM      │
│  (UI state only)    │         │                  │
│  React Router v6    │         │  AI Service      │ ← Phase 2
└─────────────────────┘         └──────────────────┘

Vite proxies /api → localhost:5000  ← eliminates CORS in development
JWT in Authorization header         ← Axios interceptor adds it automatically`}
                    </ArchBlock>
                    <Callout type="info">
                        <strong>Key design decision:</strong> Vite proxies all{' '}
                        <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">/api</code>{' '}
                        requests to Express in development, eliminating CORS issues entirely.
                    </Callout>
                </Section>

                {/* File structure */}
                <Section id="structure">
                    <SectionTitle icon="📁">File Structure</SectionTitle>
                    <SectionDesc>Complete project layout. Every folder has a single responsibility.</SectionDesc>
                    <FileTree>
                        {`\x1b[0mproject-root/
│
├── client/                        React + Vite frontend
│   ├── public/docs/               README and SETUP pages (React)
│   └── src/
│       ├── components/layout/     AppShell, Sidebar, Topbar, ProtectedRoute
│       ├── components/ui/         Button, Card, Badge, Input, Modal, Toast...
│       ├── components/charts/     RadarChart, ActivityHeatmap, MiniSparkline
│       ├── components/features/   ProblemCard, SolutionCard, LeaderboardRow...
│       ├── pages/                 One component per route
│       ├── store/                 Zustand — useAuthStore, useUIStore
│       ├── hooks/                 Custom hooks wrapping TanStack Query
│       ├── services/              Axios API call functions
│       └── utils/                 cn, constants, formatters, intelligence
│
├── server/
│   ├── prisma/
│   │   ├── schema.prisma          All database models
│   │   └── seed.js                Sample data
│   └── src/
│       ├── routes/                Route definitions only
│       ├── controllers/           Business logic
│       ├── middleware/            auth, admin, validate, error
│       ├── schemas/               Zod validation schemas
│       └── lib/                   prisma singleton, jwt, hash`}
                    </FileTree>
                </Section>

                {/* Data flow */}
                <Section id="dataflow">
                    <SectionTitle icon="🔄">Data Flow</SectionTitle>
                    <SectionDesc>How a request travels through the system — submit a solution.</SectionDesc>
                    <ArchBlock>
                        {`1.  User fills 5-step form
    → React Hook Form validates with Zod schema

2.  Axios POST /api/solutions
    → JWT auto-attached by Axios request interceptor

3.  Express middleware chain:
    auth.middleware      → verify JWT, attach req.user
    validate.middleware  → run Zod schema on req.body
    solutions.controller → business logic executes

4.  Prisma writes to database:
    prisma.solution.create({ data: { ...validated } })

5.  Response: { success: true, data: newSolution }

6.  TanStack Query:
    queryClient.invalidateQueries(['solutions', problemId])
    → components refetch automatically
    → Framer Motion animates the new card in`}
                    </ArchBlock>
                </Section>

                {/* 6D Engine */}
                <Section id="dimensions">
                    <SectionTitle icon="🔬">The 6D Intelligence Engine</SectionTitle>
                    <SectionDesc>Every score is computed from real signals in submitted solutions — not arbitrary point systems.</SectionDesc>
                    <div className="grid grid-cols-3 gap-3 mb-5">
                        <DimCard num="D1" name="Pattern Recognition" color="#7c6ff7" desc="Speed and accuracy at identifying the right algorithm pattern." />
                        <DimCard num="D2" name="Solution Depth" color="#22c55e" desc="Quality of Feynman explanations, follow-up answers, real-world connections." />
                        <DimCard num="D3" name="Communication" color="#3b82f6" desc="Clarity of written explanations as peer-rated by teammates." />
                        <DimCard num="D4" name="Optimization" color="#eab308" desc="Ability to improve from brute force to optimal. Complexity prediction accuracy." />
                        <DimCard num="D5" name="Pressure Performance" color="#ef4444" desc="Solution quality under timed interview simulation conditions." />
                        <DimCard num="D6" name="Knowledge Retention" color="#a855f7" desc="Recall scores during spaced repetition reviews and retention trends." />
                    </div>
                    <ArchBlock>
                        {`Overall Readiness = D1×0.20 + D2×0.20 + D3×0.15 + D4×0.20 + D5×0.15 + D6×0.10

D1 Pattern  = speedScore×0.4 + accuracyScore×0.4 + coverageScore×0.2
D2 Depth    = fieldsCompleted×0.5 + followUpRate×0.5
D3 Comms    = peerRatings×0.6 + explanationQuality×0.4
D4 Optimize = improvementRate×0.4 + predictionAccuracy×0.3 + hardRate×0.3
D5 Pressure = completionRate×0.5 + timeEfficiency×0.3 + noHintRate×0.2
D6 Retention= avgRecallScore×0.5 + onTimeRate×0.3 + trend×0.2`}
                    </ArchBlock>
                </Section>

                {/* AI */}
                <Section id="ai">
                    <SectionTitle icon="🤖">AI Integration Architecture</SectionTitle>
                    <SectionDesc>AI is built into the data model from day one. Zero refactoring needed to activate it.</SectionDesc>
                    <Callout type="info">
                        AI fields already exist on every model:{' '}
                        <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">Solution.aiFeedback</code>,{' '}
                        <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">Problem.aiHints</code>,{' '}
                        <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">User.aiConversations</code>.
                        Set <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">AI_ENABLED=true</code> and
                        add <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">OPENAI_API_KEY</code> to activate.
                    </Callout>
                    <CardGrid cols={2}>
                        <FeatureCard icon="💡" title="Hint Generation" desc="Progressive hints when a user is stuck, without giving away the solution." />
                        <FeatureCard icon="📝" title="Approach Feedback" desc="AI reviews your written approach on clarity, completeness, and accuracy." />
                        <FeatureCard icon="📅" title="Weekly Action Plans" desc="AI analyses your 6D scores and generates a specific 7-day study plan." />
                        <FeatureCard icon="🎤" title="AI Interviewer" desc="During simulation mode, AI asks follow-up questions as you explain." />
                    </CardGrid>
                </Section>

                {/* Roles */}
                <Section id="roles">
                    <SectionTitle icon="👥">Roles</SectionTitle>
                    <Table
                        headers={['Capability', 'Admin', 'Member']}
                        rows={[
                            ['Add / edit / delete problems', <Check />, <Cross />],
                            ['Add real-world context + follow-ups', <Check />, <Cross />],
                            ['Submit + edit own solution', <Check />, <Check />],
                            ["View all teammates' solutions", <Check />, <Check />],
                            ['Rate solution clarity', <Check />, <Check />],
                            ['View leaderboard + profiles', <Check />, <Check />],
                            ['View intelligence report', <Check />, <Check />],
                            ['Interview simulation mode', <Check />, <Check />],
                            ['Admin panel (team health)', <Check />, <Cross />],
                        ]}
                    />
                </Section>

                {/* API */}
                <Section id="api">
                    <SectionTitle icon="🔌">API Endpoints</SectionTitle>
                    <SectionDesc>
                        All responses: <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">
                            {'{"success": true, "data": {...}, "message": "..."}'}
                        </code>
                    </SectionDesc>
                    <Table
                        headers={['Method', 'Endpoint', 'Auth', 'Description']}
                        rows={[
                            [<span className="text-blue-400 font-mono font-bold text-xs">POST</span>, <code className="text-brand-300 text-xs">/api/auth/register</code>, '—', 'Register new account'],
                            [<span className="text-blue-400 font-mono font-bold text-xs">POST</span>, <code className="text-brand-300 text-xs">/api/auth/login</code>, '—', 'Login, get JWT token'],
                            [<span className="text-success font-mono font-bold text-xs">GET</span>, <code className="text-brand-300 text-xs">/api/auth/me</code>, 'JWT', 'Get current user'],
                            [<span className="text-blue-400 font-mono font-bold text-xs">POST</span>, <code className="text-brand-300 text-xs">/api/auth/admin/claim</code>, 'JWT', 'Claim admin role'],
                            [<span className="text-success font-mono font-bold text-xs">GET</span>, <code className="text-brand-300 text-xs">/api/problems</code>, 'JWT', 'List all problems'],
                            [<span className="text-blue-400 font-mono font-bold text-xs">POST</span>, <code className="text-brand-300 text-xs">/api/problems</code>, 'Admin', 'Create problem'],
                            [<span className="text-warning font-mono font-bold text-xs">PUT</span>, <code className="text-brand-300 text-xs">/api/problems/:id</code>, 'Admin', 'Update problem'],
                            [<span className="text-danger font-mono font-bold text-xs">DELETE</span>, <code className="text-brand-300 text-xs">/api/problems/:id</code>, 'Admin', 'Delete problem'],
                            [<span className="text-success font-mono font-bold text-xs">GET</span>, <code className="text-brand-300 text-xs">/api/solutions/problem/:id</code>, 'JWT', 'All solutions for a problem'],
                            [<span className="text-blue-400 font-mono font-bold text-xs">POST</span>, <code className="text-brand-300 text-xs">/api/solutions</code>, 'JWT', 'Submit solution'],
                            [<span className="text-warning font-mono font-bold text-xs">PUT</span>, <code className="text-brand-300 text-xs">/api/solutions/:id</code>, 'JWT+Owner', 'Update own solution'],
                            [<span className="text-success font-mono font-bold text-xs">GET</span>, <code className="text-brand-300 text-xs">/api/stats/leaderboard</code>, 'JWT', 'Ranked leaderboard'],
                            [<span className="text-success font-mono font-bold text-xs">GET</span>, <code className="text-brand-300 text-xs">/api/stats/report</code>, 'JWT', 'My 6D intelligence report'],
                        ]}
                    />
                </Section>

                {/* Schema */}
                <Section id="schema">
                    <SectionTitle icon="🗂">Database Schema</SectionTitle>
                    <SectionDesc>Key models. Full schema in <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">server/prisma/schema.prisma</code>.</SectionDesc>
                    <ArchBlock>
                        {`User                         Problem
─────────────────────        ──────────────────────────
id            cuid()         id              cuid()
username      unique         title           String
email         unique         source          LEETCODE|GFG|...
passwordHash  String         sourceUrl       String
role          ADMIN|MEMBER   difficulty      EASY|MEDIUM|HARD
avatarColor   String         tags            JSON array
streak        Int            companyTags     JSON array
targetCompanies JSON         realWorldContext String?
solutions     Solution[]     followUps       FollowUpQuestion[]

Solution                              SimSession
──────────────────────────────────    ────────────────────
id              cuid()                id            cuid()
problemId  →    Problem.id            userId   →    User.id
userId     →    User.id               timeLimitSecs Int
patternIdentified  String?            completed     Boolean
firstInstinct      String?            approachScore Int?
bruteForceApproach String?            overallScore  Int?
optimizedApproach  String?
code               String?
keyInsight         String?
feynmanExplanation String?
confidenceLevel    Int (0-5)
reviewDates        JSON array`}
                    </ArchBlock>
                </Section>

                {/* Pages */}
                <Section id="pages">
                    <SectionTitle icon="📄">Pages & Routes</SectionTitle>
                    <Table
                        headers={['Route', 'Page', 'Auth', 'Status']}
                        rows={[
                            [<code className="text-brand-300 text-xs">/login</code>, 'Login', 'Public', <Check />],
                            [<code className="text-brand-300 text-xs">/register</code>, 'Register', 'Public', <Check />],
                            [<code className="text-brand-300 text-xs">/</code>, 'Dashboard', 'JWT', <Check />],
                            [<code className="text-brand-300 text-xs">/problems</code>, 'Problem List', 'JWT', <Check />],
                            [<code className="text-brand-300 text-xs">/problems/:id</code>, 'Problem Detail', 'JWT', <Check />],
                            [<code className="text-brand-300 text-xs">/problems/:id/submit</code>, 'Submit Solution', 'JWT', <Check />],
                            [<code className="text-brand-300 text-xs">/problems/:id/edit</code>, 'Edit Solution', 'JWT', <Check />],
                            [<code className="text-brand-300 text-xs">/interview</code>, 'Interview Simulation', 'JWT', <Check />],
                            [<code className="text-brand-300 text-xs">/review</code>, 'Review Queue', 'JWT', <Check />],
                            [<code className="text-brand-300 text-xs">/report</code>, 'Intelligence Report', 'JWT', <Check />],
                            [<code className="text-brand-300 text-xs">/leaderboard</code>, 'Leaderboard', 'JWT', <Check />],
                            [<code className="text-brand-300 text-xs">/profile/:username</code>, 'Member Profile', 'JWT', <Check />],
                            [<code className="text-brand-300 text-xs">/settings</code>, 'Settings', 'JWT', <Check />],
                            [<code className="text-brand-300 text-xs">/admin</code>, 'Admin Panel', 'Admin', <Check />],
                            [<code className="text-brand-300 text-xs">/admin/problems/new</code>, 'Add Problem', 'Admin', <Check />],
                            [<code className="text-brand-300 text-xs">/admin/problems/:id/edit</code>, 'Edit Problem', 'Admin', <Check />],
                            [<code className="text-brand-300 text-xs">/docs/readme</code>, 'README', 'JWT', <Check />],
                            [<code className="text-brand-300 text-xs">/docs/setup</code>, 'Setup Guide', 'JWT', <Check />],
                        ]}
                    />
                </Section>

                {/* Changelog */}
                {/* Changelog */}
                <Section id="changelog">
                    <SectionTitle icon="📦">Changelog</SectionTitle>
                    <div className="border-t border-border-default">

                        {/* v2.0.0 */}
                        <div className="flex gap-4 py-5 border-b border-border-default">
                            <div className="bg-surface-3 border border-border-strong rounded-lg
                      px-3 py-1 font-mono text-xs font-bold text-brand-300
                      whitespace-nowrap h-fit flex-shrink-0">
                                v2.0.0
                            </div>
                            <div>
                                <div className="text-sm font-bold text-text-primary mb-1">
                                    Full-stack rebuild — complete feature set
                                </div>
                                <div className="text-xs text-text-disabled font-mono mb-3">
                                    Current release · All 12 steps complete
                                </div>
                                <ul className="space-y-1">
                                    {[
                                        'React 18 + Vite + TailwindCSS dark-first design system',
                                        'Express REST API with JWT authentication and role system',
                                        'Prisma ORM with SQLite (zero setup) → PostgreSQL-ready schema',
                                        'TanStack Query v5 for all server state management',
                                        'Zustand for UI state — theme, sidebar, toasts, command palette',
                                        '5-step solution submission form capturing the full thinking process',
                                        '6D Intelligence engine — computes readiness across 6 dimensions',
                                        'Hexagonal radar chart + activity heatmap on intelligence report',
                                        '4-screen interview simulation with countdown timer and debrief',
                                        'Spaced repetition review queue with adaptive scheduling',
                                        'Full leaderboard with podium, ranked table, and profile pages',
                                        'Admin panel — problem CRUD, follow-up builder, team management',
                                        'Command palette with live problem search (⌘K)',
                                        'AI integration architecture built in — one env flag to activate',
                                    ].map((item, i) => (
                                        <li key={i} className="flex items-start gap-2 text-xs text-text-tertiary">
                                            <span className="text-brand-400 flex-shrink-0">→</span>
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        {/* v1.0.0 */}
                        <div className="flex gap-4 py-5">
                            <div className="bg-surface-3 border border-border-strong rounded-lg
                      px-3 py-1 font-mono text-xs font-bold text-text-disabled
                      whitespace-nowrap h-fit flex-shrink-0">
                                v1.0.0
                            </div>
                            <div>
                                <div className="text-sm font-bold text-text-primary mb-1">
                                    Initial concept — static prototype
                                </div>
                                <div className="text-xs text-text-disabled font-mono mb-3">
                                    Legacy · Replaced by v2.0.0
                                </div>
                                <ul className="space-y-1">
                                    {[
                                        'Plain HTML/CSS/JS static prototype',
                                        'No backend — data stored in localStorage',
                                        'Basic problem list and solution tracking',
                                        'Replaced entirely by the full-stack v2.0.0 rebuild',
                                    ].map((item, i) => (
                                        <li key={i} className="flex items-start gap-2 text-xs text-text-tertiary">
                                            <span className="text-text-disabled flex-shrink-0">→</span>
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                    </div>
                </Section>

            </div>

            {/* Footer */}
            <div className="border-t border-border-default bg-surface-1
                      px-10 py-6 flex items-center justify-between flex-wrap gap-4">
                <span className="text-xs text-text-disabled">
                    <strong className="text-text-secondary">ProbSolver</strong> · Team Edition · v2.0.0
                </span>
                <div className="flex gap-4">
                    <Link to="/docs/setup" className="text-xs text-text-tertiary hover:text-brand-300 transition-colors">
                        Setup Guide →
                    </Link>
                    <Link to="/docs/deploy"
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg
                 text-xs font-medium text-text-tertiary
                 hover:bg-surface-3 hover:text-text-primary transition-all">
                        <span className="w-1.5 h-1.5 rounded-full bg-success/50" />
                        Deploy Guide →
                    </Link>
                    <Link to="/" className="text-xs text-text-tertiary hover:text-brand-300 transition-colors">
                        ← Back to App
                    </Link>
                </div>
            </div>

        </DocsLayout>
    )
}