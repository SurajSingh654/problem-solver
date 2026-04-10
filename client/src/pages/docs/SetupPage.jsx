import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
    DocsLayout, DocsHero, Section, SectionTitle, SectionDesc,
    StepCard, CodeBlock, Callout, Table, RoleCard, ScriptItem,
    TroubleItem, SbLink,
} from './components'

const STEPS = [
    { id: 'prerequisites', label: 'Prerequisites' },
    { id: 'install', label: 'Clone & Install' },
    { id: 'env', label: 'Environment' },
    { id: 'database', label: 'Database' },
    { id: 'run', label: 'Run the App' },
    { id: 'firstrun', label: 'First Run' },
    { id: 'team', label: 'Team Setup' },
]

const REF_LINKS = [
    { id: 'scripts', label: 'All Scripts' },
    { id: 'env-ref', label: 'Env Variables' },
    { id: 'troubleshoot', label: 'Troubleshooting' },
    { id: 'postgres', label: 'PostgreSQL' },
    { id: 'ai-setup', label: 'AI Setup' },
]

export default function SetupPage() {
    const [active, setActive] = useState('prerequisites')
    const [done, setDone] = useState({})

    // Scroll spy
    useEffect(() => {
        const allIds = [...STEPS.map(s => s.id), ...REF_LINKS.map(r => r.id)]
        const observer = new IntersectionObserver(
            entries => {
                entries.forEach(e => {
                    if (e.isIntersecting) {
                        setActive(e.target.id)
                        // Mark setup steps as done when scrolled past
                        const idx = STEPS.findIndex(s => s.id === e.target.id)
                        if (idx > 0) {
                            setDone(prev => {
                                const next = { ...prev }
                                STEPS.slice(0, idx).forEach(s => { next[s.id] = true })
                                return next
                            })
                        }
                    }
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

    const scrollTo = (id) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setActive(id)
    }

    const sidebar = (
        <>
            {/* Logo */}
            <div className="flex items-center gap-3 px-5 py-6
                      border-b border-border-default flex-shrink-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                    style={{
                        background: 'linear-gradient(135deg,#22c55e,#0ea5e9)',
                        boxShadow: '0 0 20px rgba(34,197,94,0.25)'
                    }}>
                    🚀
                </div>
                <div>
                    <div className="text-sm font-extrabold bg-gradient-to-r from-success
                          to-blue-400 bg-clip-text text-transparent">
                        ProbSolver
                    </div>
                    <div className="text-[11px] text-text-disabled font-mono uppercase tracking-wider">
                        Setup Guide · v2.0
                    </div>
                </div>
            </div>

            {/* Progress */}
            <div className="px-3 py-4 border-b border-border-default flex-shrink-0">
                <div className="text-[11px] font-bold text-text-disabled uppercase
                        tracking-widest px-2 pb-2">
                    Setup Progress
                </div>
                <div className="space-y-0.5">
                    {STEPS.map((step, i) => {
                        const isDone = done[step.id]
                        const isActive = active === step.id

                        return (
                            <button
                                key={step.id}
                                onClick={() => scrollTo(step.id)}
                                className="w-full flex items-center gap-2.5 px-2 py-1.5
                           rounded-lg text-xs font-medium transition-all text-left
                           hover:bg-surface-3"
                            >
                                <div
                                    className={`w-5 h-5 rounded-full flex items-center justify-center
                              text-[10px] font-extrabold font-mono flex-shrink-0
                              border transition-all ${isDone
                                            ? 'bg-success border-success text-black'
                                            : isActive
                                                ? 'bg-brand-400/15 border-brand-400 text-brand-300'
                                                : 'border-border-strong text-text-disabled'
                                        }`}
                                >
                                    {isDone ? '✓' : i + 1}
                                </div>
                                <span className={
                                    isDone ? 'text-text-secondary' :
                                        isActive ? 'text-text-primary font-semibold' :
                                            'text-text-tertiary'
                                }>
                                    {step.label}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Reference links */}
            <nav className="flex-1 px-3 py-4 space-y-4">
                <div>
                    <div className="text-[11px] font-bold text-text-disabled uppercase
                          tracking-widest px-2 pb-2">
                        Reference
                    </div>
                    <div className="space-y-0.5">
                        {REF_LINKS.map(link => (
                            <SbLink
                                key={link.id}
                                href={'#' + link.id}
                                active={active === link.id}
                                onClick={scrollTo}
                            >
                                {link.label}
                            </SbLink>
                        ))}
                    </div>
                </div>

                <div>
                    <div className="text-[11px] font-bold text-text-disabled uppercase
                          tracking-widest px-2 pb-2">
                        Links
                    </div>
                    <div className="space-y-0.5">
                        <Link to="/docs/readme"
                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg
                             text-xs font-medium text-text-tertiary
                             hover:bg-surface-3 hover:text-text-primary transition-all">
                            <span className="w-1.5 h-1.5 rounded-full bg-success/50" />
                            README →
                        </Link>
                        <Link to="/"
                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg
                             text-xs font-medium text-text-tertiary
                             hover:bg-surface-3 hover:text-text-primary transition-all">
                            <span className="w-1.5 h-1.5 rounded-full bg-success/50" />
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
                eyebrow="🚀 Setup Guide — v2.0.0"
                eyebrowColor="#22c55e"
                title="Up and Running"
                titleGradient="in Under 10 Minutes"
                desc="Complete step-by-step guide from zero to a fully running app. Every error we hit during development is documented in the troubleshooting section."
            >
                <div className="flex flex-wrap gap-2">
                    {['macOS / Linux / Windows', 'Node.js 18+', 'npm 9+', 'Git', '~10 minutes'].map(p => (
                        <div key={p}
                            className="flex items-center gap-1.5 bg-surface-3 border border-border-strong
                            rounded-full px-3 py-1.5 text-xs font-semibold text-text-secondary">
                            <span className="text-success text-xs">✓</span>
                            {p}
                        </div>
                    ))}
                </div>
            </DocsHero>

            {/* Content */}
            <div className="px-10 py-12 max-w-4xl">

                {/* Step 1 */}
                <Section id="prerequisites">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center
                            text-sm font-extrabold font-mono"
                            style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa' }}>
                            1
                        </div>
                        <h2 className="text-2xl font-extrabold text-text-primary tracking-tight">
                            Prerequisites
                        </h2>
                    </div>
                    <SectionDesc>Install these before anything else.</SectionDesc>

                    <StepCard
                        num="1a" numColor="#22c55e" numBg="rgba(34,197,94,0.12)"
                        title="Install Node.js via nvm"
                        sub="Recommended — manage multiple Node versions without touching system files"
                    >
                        <CodeBlock label="macOS / Linux" color="#22c55e"
                            copyText={`curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash\nsource ~/.zshrc\nnvm install 20\nnvm use 20\nnvm alias default 20\nnode --version\nnpm --version`}>
                            {`# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Reload shell (or close and reopen terminal)
source ~/.zshrc          # zsh — default on modern Mac
source ~/.bashrc         # bash — Linux / older Mac

# Install Node 20 LTS
nvm install 20
nvm use 20
nvm alias default 20

# Verify
node --version    # v20.x.x
npm  --version    # 10.x.x`}
                        </CodeBlock>
                        <Callout type="warning">
                            <strong>After installing nvm</strong> — close your terminal completely and reopen it.
                            The PATH change only takes effect in new shells.
                        </Callout>
                    </StepCard>

                    <StepCard
                        num="1b" numColor="#22c55e" numBg="rgba(34,197,94,0.12)"
                        title="Verify Git"
                        sub="Comes pre-installed on macOS — install if missing"
                    >
                        <CodeBlock label="Terminal" color="#22c55e"
                            copyText="git --version">
                            {`git --version         # git version 2.x.x

# Install on macOS if missing:
xcode-select --install

# Install on Ubuntu/Debian:
sudo apt-get install git`}
                        </CodeBlock>
                    </StepCard>
                </Section>

                {/* Step 2 */}
                <Section id="install">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center
                            text-sm font-extrabold font-mono"
                            style={{ background: 'rgba(124,111,247,0.12)', color: '#9d93f9' }}>
                            2
                        </div>
                        <h2 className="text-2xl font-extrabold text-text-primary tracking-tight">
                            Clone & Install
                        </h2>
                    </div>
                    <SectionDesc>Get the code and install all dependencies.</SectionDesc>

                    <StepCard
                        num="2a" numColor="#9d93f9" numBg="rgba(124,111,247,0.12)"
                        title="Clone the repository"
                        sub="Or download ZIP if you don't have Git access"
                    >
                        <CodeBlock label="Terminal" color="#9d93f9"
                            copyText="git clone https://github.com/your-team/problem-solver.git\ncd problem-solver">
                            {`git clone https://github.com/your-team/problem-solver.git
cd problem-solver`}
                        </CodeBlock>
                    </StepCard>

                    <StepCard
                        num="2b" numColor="#9d93f9" numBg="rgba(124,111,247,0.12)"
                        title="Install dependencies"
                        sub="Install client and server packages separately"
                    >
                        <CodeBlock label="Terminal — install server" color="#9d93f9"
                            copyText="cd server && npm install">
                            {`cd server && npm install`}
                        </CodeBlock>
                        <CodeBlock label="Terminal — install client" color="#9d93f9"
                            copyText="cd client && npm install">
                            {`cd client && npm install`}
                        </CodeBlock>
                        <Callout type="success">
                            You should see <strong>"added X packages"</strong> for both.
                            No vulnerabilities from server packages, only minor dev warnings from Vite are safe to ignore.
                        </Callout>
                    </StepCard>
                </Section>

                {/* Step 3 */}
                <Section id="env">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center
                            text-sm font-extrabold font-mono"
                            style={{ background: 'rgba(234,179,8,0.12)', color: '#eab308' }}>
                            3
                        </div>
                        <h2 className="text-2xl font-extrabold text-text-primary tracking-tight">
                            Environment Variables
                        </h2>
                    </div>
                    <SectionDesc>Create <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">.env</code> files. Never committed to Git.</SectionDesc>

                    <StepCard
                        num="3a" numColor="#eab308" numBg="rgba(234,179,8,0.12)"
                        title="Create server/.env"
                        sub="Copy the example then fill in your values"
                    >
                        <CodeBlock label="Terminal" color="#eab308"
                            copyText="cp server/.env.example server/.env">
                            {`cp server/.env.example server/.env`}
                        </CodeBlock>
                        <p className="text-xs text-text-tertiary mb-2">
                            Open <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">server/.env</code> and set:
                        </p>
                        <CodeBlock label="server/.env" color="#eab308"
                            copyText={`PORT=5000\nNODE_ENV=development\nDATABASE_URL="file:./prisma/dev.db"\nJWT_SECRET=replace-with-a-very-long-random-string\nJWT_EXPIRES_IN=7d\nADMIN_PASSWORD=your-team-admin-password\nCLIENT_URL=http://localhost:5173`}>
                            {`PORT=5000
NODE_ENV=development
DATABASE_URL="file:./prisma/dev.db"
JWT_SECRET=replace-with-a-very-long-random-string
JWT_EXPIRES_IN=7d
ADMIN_PASSWORD=your-team-admin-password
CLIENT_URL=http://localhost:5173`}
                        </CodeBlock>
                        <Callout type="warning">
                            <strong>JWT_SECRET</strong> must be long and random. Generate one:{' '}
                            <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">
                                node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
                            </code>
                        </Callout>
                    </StepCard>

                    <StepCard
                        num="3b" numColor="#eab308" numBg="rgba(234,179,8,0.12)"
                        title="Create client/.env"
                        sub="Tells Vite where the API lives"
                    >
                        <CodeBlock label="client/.env" color="#eab308"
                            copyText="VITE_API_URL=http://localhost:5000/api\nVITE_APP_NAME=ProbSolver">
                            {`VITE_API_URL=http://localhost:5000/api
VITE_APP_NAME=ProbSolver`}
                        </CodeBlock>
                    </StepCard>
                </Section>

                {/* Step 4 */}
                <Section id="database">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center
                            text-sm font-extrabold font-mono"
                            style={{ background: 'rgba(168,85,247,0.12)', color: '#c084fc' }}>
                            4
                        </div>
                        <h2 className="text-2xl font-extrabold text-text-primary tracking-tight">
                            Database Setup
                        </h2>
                    </div>
                    <SectionDesc>Prisma + SQLite. Zero setup — SQLite is just a file.</SectionDesc>

                    <StepCard
                        num="4a" numColor="#c084fc" numBg="rgba(168,85,247,0.12)"
                        title="Run migration"
                        sub="Creates the SQLite file and all tables from the Prisma schema"
                    >
                        <CodeBlock label="Terminal — from server/" color="#c084fc"
                            copyText="cd server && npx prisma migrate dev --name init">
                            {`cd server
npx prisma migrate dev --name init
# Output:
Applying migration '20260101000000_init'
Your database is now in sync with your schema.`}
                        </CodeBlock>
                    </StepCard>

                    <StepCard
                        num="4b" numColor="#c084fc" numBg="rgba(168,85,247,0.12)"
                        title="Seed sample data"
                        sub="1 admin · 3 members · 5 problems · sample solutions"
                    >
                        <CodeBlock label="Terminal — from server/" color="#c084fc"
                            copyText="cd server && npx prisma db seed">
                            {`cd server
npx prisma db seed
🌱 Seeding database...
✓ Created admin: admin
✓ Created 3 members
✓ Created 5 problems
✅ Seed complete!
Admin:   admin@probsolver.dev / admin123
Members: alex@example.com / member123`}
                        </CodeBlock>
                        <Callout type="info">
                            Browse the database visually:{' '}
                            <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">
                                cd server && npx prisma studio
                            </code>
                            {' '}opens Prisma Studio at{' '}
                            <a href="http://localhost:5555" target="_blank" className="text-brand-300 underline">
                                localhost:5555
                            </a>
                        </Callout>
                    </StepCard>
                </Section>

                {/* Step 5 */}
                <Section id="run">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center
                            text-sm font-extrabold font-mono"
                            style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
                            5
                        </div>
                        <h2 className="text-2xl font-extrabold text-text-primary tracking-tight">
                            Run the App
                        </h2>
                    </div>
                    <SectionDesc>Start both servers with one command.</SectionDesc>

                    <StepCard
                        num="5a" numColor="#22c55e" numBg="rgba(34,197,94,0.12)"
                        title="Start both servers"
                        sub="Open two terminal windows — one for server, one for client"
                    >
                        <CodeBlock label="Terminal 1 — backend" color="#22c55e"
                            copyText="cd server && npm run dev">
                            {`cd server && npm run dev
  ⚡ ProbSolver API
  🚀 Running on   http://localhost:5000
  🌍 Environment: development
  🤖 AI features: disabled`}
                        </CodeBlock>
                        <CodeBlock label="Terminal 2 — frontend" color="#22c55e"
                            copyText="cd client && npm run dev">
                            {`cd client && npm run dev
  VITE v5.x.x  ready in 169ms
  ➜  Local: http://localhost:5173/`}
                        </CodeBlock>
                        <Callout type="success">
                            Open{' '}
                            <a href="http://localhost:5173" target="_blank" className="text-brand-300 underline font-semibold">
                                http://localhost:5173
                            </a>
                            {' '}— your app is live. API health check:{' '}
                            <a href="http://localhost:5000/health" target="_blank" className="text-brand-300 underline">
                                localhost:5000/health
                            </a>
                        </Callout>
                    </StepCard>

                    <StepCard
                        num="5b" numColor="#ef4444" numBg="rgba(239,68,68,0.12)"
                        title="Port already in use? Kill it first"
                        sub="Run this if you see EADDRINUSE error"
                    >
                        <CodeBlock label="Terminal" color="#ef4444"
                            copyText="lsof -ti:5000 | xargs kill -9\nlsof -ti:5173 | xargs kill -9\nnpm run dev">
                            {`lsof -ti:5000 | xargs kill -9   # kill port 5000
lsof -ti:5173 | xargs kill -9   # kill port 5173
npm run dev`}
                        </CodeBlock>
                    </StepCard>
                </Section>

                {/* Step 6 */}
                <Section id="firstrun">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center
                            text-sm font-extrabold font-mono"
                            style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                            6
                        </div>
                        <h2 className="text-2xl font-extrabold text-text-primary tracking-tight">
                            First Run Setup
                        </h2>
                    </div>
                    <SectionDesc>What to do the first time you open the app.</SectionDesc>

                    <StepCard
                        num="6a" numColor="#ef4444" numBg="rgba(239,68,68,0.12)"
                        title="Register your account"
                        sub="All accounts start as Member role"
                    >
                        <p className="text-xs text-text-secondary mb-2">
                            Go to{' '}
                            <a href="http://localhost:5173/register" target="_blank"
                                className="text-brand-300 underline">
                                localhost:5173/register
                            </a>
                            . Or log in with a seeded account:
                        </p>
                        <Callout type="info">
                            <strong>Admin:</strong> admin@probsolver.dev / admin123<br />
                            <strong>Member:</strong> alex@example.com / member123
                        </Callout>
                    </StepCard>

                    <StepCard
                        num="6b" numColor="#ef4444" numBg="rgba(239,68,68,0.12)"
                        title="Claim Admin role"
                        sub="One person per team only"
                    >
                        <p className="text-xs text-text-secondary mb-2">
                            Go to <strong className="text-text-primary">Settings → Role → Claim Admin</strong>.
                            Enter the <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">ADMIN_PASSWORD</code>{' '}
                            from <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">server/.env</code>.
                        </p>
                        <Callout type="warning">
                            Only <strong>one person</strong> per team should be Admin.
                            Share <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">ADMIN_PASSWORD</code> with nobody else.
                        </Callout>
                    </StepCard>
                </Section>

                {/* Step 7 */}
                <Section id="team">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center
                            text-sm font-extrabold font-mono"
                            style={{ background: 'rgba(251,146,60,0.12)', color: '#fb923c' }}>
                            7
                        </div>
                        <h2 className="text-2xl font-extrabold text-text-primary tracking-tight">
                            Team Setup
                        </h2>
                    </div>
                    <SectionDesc>How each person sets up their local environment.</SectionDesc>

                    <div className="grid grid-cols-2 gap-3 mb-5">
                        <RoleCard
                            title="Admin Setup"
                            badge="ADMIN"
                            badgeColor="#eab308"
                            desc="Manages the problem list. One per team."
                            steps={[
                                'Follow Steps 1–6',
                                'Claim Admin in Settings → Role',
                                'Add problems via Admin Panel',
                                'Share repo URL with team',
                            ]}
                        />
                        <RoleCard
                            title="Member Setup"
                            badge="MEMBER"
                            badgeColor="#7c6ff7"
                            desc="Solves problems, submits solutions."
                            steps={[
                                'Clone the same repo',
                                'cd server && npm install',
                                'cd client && npm install',
                                'Create server/.env and client/.env',
                                'cd server && npx prisma migrate dev',
                                'Run both servers in two terminals',
                                'Register at /register',
                                'Set target company in Settings',
                            ]}
                        />
                    </div>

                    <Callout type="info">
                        <strong>Shared server:</strong> One person runs Express, all teammates set{' '}
                        <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">VITE_API_URL</code>{' '}
                        to that machine's IP. Or deploy to{' '}
                        <a href="https://railway.app" target="_blank" className="text-brand-300 underline">Railway</a> or{' '}
                        <a href="https://render.com" target="_blank" className="text-brand-300 underline">Render</a> free tier.
                    </Callout>
                </Section>

                {/* Scripts */}
                <Section id="scripts">
                    <SectionTitle icon="📦">All Scripts</SectionTitle>
                    <div className="flex flex-col gap-1.5">
                        <ScriptItem cmd="npm run dev" desc="Start Express with nodemon (hot reload)" dir="server/" />
                        <ScriptItem cmd="npm run start" desc="Start Express in production mode" dir="server/" />
                        <ScriptItem cmd="npx prisma migrate dev" desc="Run database migrations" dir="server/" />
                        <ScriptItem cmd="npx prisma db seed" desc="Populate with sample data" dir="server/" />
                        <ScriptItem cmd="npx prisma studio" desc="Open visual database browser on :5555" dir="server/" />
                        <ScriptItem cmd="npx prisma migrate reset" desc="Reset and re-migrate (destroys data)" dir="server/" />
                        <ScriptItem cmd="npx prisma generate" desc="Regenerate Prisma client after schema change" dir="server/" />
                        <ScriptItem cmd="npm run dev" desc="Vite dev server on :5173" dir="client/" />
                        <ScriptItem cmd="npm run build" desc="Build React app for production" dir="client/" />
                        <ScriptItem cmd="npm run preview" desc="Preview production build on :4173" dir="client/" />
                    </div>
                </Section>

                {/* Env reference */}
                <Section id="env-ref">
                    <SectionTitle icon="🔑">Environment Variables</SectionTitle>
                    <Table
                        headers={['Variable', 'Default', 'Required', 'Description']}
                        rows={[
                            ['PORT', '5000', 'No', 'Express server port'],
                            ['NODE_ENV', 'development', 'No', 'development | production'],
                            ['DATABASE_URL', 'file:./prisma/dev.db', 'Yes', 'SQLite path or PostgreSQL URL'],
                            ['JWT_SECRET', '—', 'Yes', 'Signs JWT tokens. 64+ char random string.'],
                            ['JWT_EXPIRES_IN', '7d', 'No', 'Token expiry: 7d, 24h, 30d'],
                            ['ADMIN_PASSWORD', '—', 'Yes', 'Password to claim admin role'],
                            ['CLIENT_URL', 'http://localhost:5173', 'No', 'CORS allowed origin'],
                            ['VITE_API_URL', 'http://localhost:5000/api', 'Yes', 'API base URL for React client'],
                            ['OPENAI_API_KEY', '—', 'Phase 2', 'OpenAI API key for AI features'],
                            ['AI_ENABLED', 'false', 'Phase 2', 'Enable AI features (true/false)'],
                        ]}
                    />
                </Section>

                {/* Troubleshooting */}
                <Section id="troubleshoot">
                    <SectionTitle icon="🔧">Troubleshooting</SectionTitle>
                    <SectionDesc>Every error we hit during development — and exactly how to fix it.</SectionDesc>

                    <TroubleItem error="zsh: command not found: npm">
                        Node.js is not installed or not on PATH. Follow Step 1.
                        After installing nvm, close and reopen terminal, then run{' '}
                        <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">nvm use 20</code>.
                    </TroubleItem>

                    <TroubleItem error="nvm: command not found (after installing)">
                        Run <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">source ~/.zshrc</code>{' '}
                        or close and reopen terminal. The install script adds nvm to your shell config
                        but the current session doesn't see it yet.
                    </TroubleItem>

                    <TroubleItem error="EADDRINUSE: address already in use :::5000">
                        A previous server is still running. Kill it:{' '}
                        <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">
                            lsof -ti:5000 | xargs kill -9
                        </code>{' '}
                        then restart with{' '}
                        <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">npm run dev</code>.
                    </TroubleItem>

                    <TroubleItem error="CORS error or font blocked (file:// protocol)">
                        You opened a file directly in the browser. Always use{' '}
                        <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">npm run dev</code>{' '}
                        and access via{' '}
                        <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">http://localhost:5173</code>{' '}
                        — never via <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">file://</code>.
                    </TroubleItem>

                    <TroubleItem error="@import must precede all other statements">
                        The Google Fonts <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">@import</code>{' '}
                        in your CSS was not the very first line. Move it to line 1 of{' '}
                        <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">
                            client/src/styles/index.css
                        </code>.
                    </TroubleItem>

                    <TroubleItem error="Environment variable not found: DATABASE_URL">
                        You haven't created <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">server/.env</code>.
                        Run{' '}
                        <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">
                            cp server/.env.example server/.env
                        </code>{' '}
                        then fill in the values.
                    </TroubleItem>

                    <TroubleItem error="JWT error — invalid token or token expired">
                        Clear browser localStorage and log in again. In Chrome: DevTools → Application
                        → Local Storage → Right-click → Clear All.
                    </TroubleItem>

                    <TroubleItem error="Seed fails: A record with this value already exists">
                        Run{' '}
                        <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">npm run db:reset</code>{' '}
                        then{' '}
                        <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">npm run db:seed</code>{' '}
                        again.
                    </TroubleItem>
                </Section>

                {/* PostgreSQL */}
                <Section id="postgres">
                    <SectionTitle icon="🗄️">Upgrade to PostgreSQL</SectionTitle>
                    <SectionDesc>When ready for production. Only 3 things change — everything else stays identical.</SectionDesc>

                    <StepCard
                        num="DB" numColor="#eab308" numBg="rgba(234,179,8,0.12)"
                        title="Switch Prisma provider"
                        sub="Frontend, routes, and controllers stay 100% unchanged"
                    >
                        <p className="text-xs text-text-tertiary mb-2">
                            1. In <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">server/prisma/schema.prisma</code> change:
                        </p>
                        <CodeBlock label="schema.prisma" color="#eab308"
                            copyText={`datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}`}>
                            {`datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}`}
                        </CodeBlock>
                        <p className="text-xs text-text-tertiary my-2">
                            2. Update <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">server/.env</code>:
                        </p>
                        <CodeBlock label="server/.env" color="#eab308"
                            copyText={`DATABASE_URL="postgresql://user:pass@host:5432/probsolver"`}>
                            {`DATABASE_URL="postgresql://user:pass@host:5432/probsolver"`}
                        </CodeBlock>
                        <p className="text-xs text-text-tertiary my-2">3. Re-run migration:</p>
                        <CodeBlock label="Terminal" color="#eab308"
                            copyText="npm run db:migrate">
                            {`npm run db:migrate`}
                        </CodeBlock>
                        <Callout type="info">
                            Free PostgreSQL:{' '}
                            <a href="https://neon.tech" target="_blank" className="text-brand-300 underline">neon.tech</a>
                            {' '}(serverless, great for teams) or{' '}
                            <a href="https://railway.app" target="_blank" className="text-brand-300 underline">railway.app</a>.
                            Both have free tiers.
                        </Callout>
                    </StepCard>
                </Section>

                {/* AI */}
                <Section id="ai-setup">
                    <SectionTitle icon="🤖">AI Integration (Phase 2)</SectionTitle>
                    <SectionDesc>AI is wired into the architecture. Two lines in .env to activate.</SectionDesc>

                    <StepCard
                        num="AI" numColor="#9d93f9" numBg="rgba(124,111,247,0.12)"
                        title="Enable AI features"
                        sub="Uses OpenAI gpt-4o-mini by default — very cost-effective"
                    >
                        <CodeBlock label="server/.env — add these" color="#9d93f9"
                            copyText="OPENAI_API_KEY=sk-your-key-here\nAI_ENABLED=true\nOPENAI_MODEL=gpt-4o-mini\nAI_RATE_LIMIT_PER_DAY=20">
                            {`OPENAI_API_KEY=sk-your-key-here
AI_ENABLED=true
OPENAI_MODEL=gpt-4o-mini
AI_RATE_LIMIT_PER_DAY=20`}
                        </CodeBlock>
                    </StepCard>
                </Section>

            </div>

            {/* Footer */}
            <div className="border-t border-border-default bg-surface-1
                      px-10 py-6 flex items-center justify-between flex-wrap gap-4">
                <span className="text-xs text-text-disabled">
                    <strong className="text-text-secondary">ProbSolver Setup Guide</strong> · v2.0.0 ·
                    Last updated: Step 2
                </span>
                <div className="flex gap-4">
                    <Link to="/docs/readme"
                        className="text-xs text-text-tertiary hover:text-brand-300 transition-colors">
                        README →
                    </Link>
                    <Link to="/"
                        className="text-xs text-text-tertiary hover:text-brand-300 transition-colors">
                        ← Back to App
                    </Link>
                </div>
            </div>

        </DocsLayout>
    )
}