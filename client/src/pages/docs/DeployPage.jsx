import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
    DocsLayout, DocsHero, Section, SectionTitle, SectionDesc,
    StepCard, CodeBlock, Callout, Table, SbLink,
} from './components'

const STEPS = [
    { id: 'overview', label: 'Overview' },
    { id: 'prepare', label: '1. Prepare Codebase' },
    { id: 'github', label: '2. Push to GitHub' },
    { id: 'railway', label: '3. Create Railway Project' },
    { id: 'postgres', label: '4. Add PostgreSQL' },
    { id: 'backend', label: '5. Deploy Backend' },
    { id: 'frontend', label: '6. Deploy Frontend' },
    { id: 'verify', label: '7. Verify & Share' },
    { id: 'troubleshoot', label: 'Troubleshooting' },
]

export default function DeployPage() {
    const [active, setActive] = useState('overview')
    const [done, setDone] = useState({})

    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                entries.forEach(e => {
                    if (e.isIntersecting) {
                        setActive(e.target.id)
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
        STEPS.forEach(s => {
            const el = document.getElementById(s.id)
            if (el) observer.observe(el)
        })
        return () => observer.disconnect()
    }, [])

    function scrollTo(id) {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        setActive(id)
    }

    const sidebar = (
        <>
            <div className="flex items-center gap-3 px-5 py-6
                      border-b border-border-default flex-shrink-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,#7c6ff7,#3b82f6)', boxShadow: '0 0 20px rgba(124,111,247,0.3)' }}>
                    🚀
                </div>
                <div>
                    <div className="text-sm font-extrabold bg-gradient-to-r from-brand-300
                          to-blue-400 bg-clip-text text-transparent">
                        ProbSolver
                    </div>
                    <div className="text-[11px] text-text-disabled font-mono uppercase tracking-wider">
                        Deployment Guide
                    </div>
                </div>
            </div>

            {/* Progress */}
            <div className="px-3 py-4 border-b border-border-default flex-shrink-0">
                <div className="text-[11px] font-bold text-text-disabled uppercase
                        tracking-widest px-2 pb-2">
                    Steps
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
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center
                                 text-[10px] font-extrabold font-mono flex-shrink-0
                                 border transition-all ${isDone
                                        ? 'bg-success border-success text-black'
                                        : isActive
                                            ? 'bg-brand-400/15 border-brand-400 text-brand-300'
                                            : 'border-border-strong text-text-disabled'
                                    }`}>
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

            <nav className="flex-1 px-3 py-4 space-y-1">
                <div className="text-[11px] font-bold text-text-disabled uppercase
                        tracking-widest px-2 pb-2">
                    Links
                </div>
                <Link to="/docs/readme"
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg
                         text-xs font-medium text-text-tertiary
                         hover:bg-surface-3 hover:text-text-primary transition-all">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-400/40" />
                    README →
                </Link>
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
            </nav>
        </>
    )

    return (
        <DocsLayout sidebar={sidebar}>
            <DocsHero
                eyebrow="🚀 Railway Deployment Guide"
                eyebrowColor="#7c6ff7"
                title="Deploy ProbSolver"
                titleGradient="to Railway in 30 Minutes"
                desc="The exact steps to go from a local codebase to a live production app on Railway — including every error we hit and how we fixed them. No surprises."
            >
                <div className="flex flex-wrap gap-2">
                    {[
                        'Railway Free Tier',
                        'PostgreSQL',
                        'Docker',
                        'React + Nginx',
                        'Node.js + Prisma',
                    ].map(t => (
                        <span key={t}
                            className="px-3 py-1 rounded-full text-xs font-semibold border
                             bg-brand-400/12 text-brand-300 border-brand-400/25">
                            {t}
                        </span>
                    ))}
                </div>
            </DocsHero>

            <div className="px-10 py-12 max-w-4xl">

                {/* Overview */}
                <Section id="overview">
                    <SectionTitle icon="🗺️">What We're Building</SectionTitle>
                    <SectionDesc>
                        Three Railway services — backend, frontend, and database — all in one project.
                    </SectionDesc>
                    <div className="bg-surface-0 border border-border-default rounded-xl p-5
                          font-mono text-xs leading-7 text-text-tertiary overflow-x-auto mb-5 whitespace-pre">
                        {`Railway Project: problem-solver
├── Backend Service     Node.js + Express + Prisma
│   └── Domain:         your-backend.up.railway.app
├── Frontend Service    React + Vite built, served by Node serve
│   └── Domain:         your-frontend.up.railway.app
└── PostgreSQL Plugin   Free, 1GB, internal network only
    └── Connection:     postgres.railway.internal:5432`}
                    </div>
                    <Callout type="info">
                        <strong>Free tier limits:</strong> 500 hours/month across all services.
                        For a small team this is enough. When you need always-on, upgrade to
                        Railway Hobby at $5/month — zero config changes needed.
                    </Callout>
                </Section>

                {/* Step 1 — Prepare */}
                <Section id="prepare">
                    <SectionTitle icon="📁">1. Prepare the Codebase</SectionTitle>
                    <SectionDesc>
                        Four files need to be created or updated before pushing to GitHub.
                    </SectionDesc>

                    <StepCard num="1a" numColor="#7c6ff7" numBg="rgba(124,111,247,0.12)"
                        title="Switch Prisma to PostgreSQL"
                        sub="One line change in schema.prisma">
                        <CodeBlock label="server/prisma/schema.prisma" color="#7c6ff7"
                            copyText={`datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}`}>
                            {`datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}`}
                        </CodeBlock>
                    </StepCard>

                    <StepCard num="1b" numColor="#7c6ff7" numBg="rgba(124,111,247,0.12)"
                        title="Regenerate PostgreSQL migrations"
                        sub="Delete old SQLite migrations and create fresh ones">
                        <CodeBlock label="Terminal — from server/" color="#7c6ff7"
                            copyText="rm -rf prisma/migrations\nmkdir -p prisma/migrations/20260402012638_init">
                            {`rm -rf prisma/migrations
mkdir -p prisma/migrations/20260402012638_init`}
                        </CodeBlock>
                        <p className="text-xs text-text-tertiary my-2">
                            Create <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">
                                server/prisma/migrations/migration_lock.toml
                            </code>:
                        </p>
                        <CodeBlock label="migration_lock.toml" color="#7c6ff7"
                            copyText={`# Please do not edit this file manually\nprovider = "postgresql"`}>
                            {`# Please do not edit this file manually
# It should be added in your version-control system (e.g., Git)
provider = "postgresql"`}
                        </CodeBlock>
                        <Callout type="warning">
                            <strong>Important:</strong> The migration SQL must use{' '}
                            <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">TIMESTAMP(3)</code>
                            {' '}not <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">DATETIME</code>.
                            PostgreSQL does not have a DATETIME type — this was our biggest gotcha.
                        </Callout>
                    </StepCard>

                    <StepCard num="1c" numColor="#7c6ff7" numBg="rgba(124,111,247,0.12)"
                        title="Create server/Dockerfile"
                        sub="Use node:20-slim with OpenSSL — alpine breaks Prisma">
                        <CodeBlock label="server/Dockerfile" color="#7c6ff7"
                            copyText={`FROM node:20-slim\nRUN apt-get update -y && apt-get install -y openssl\nWORKDIR /app\nCOPY package*.json ./\nCOPY prisma ./prisma/\nRUN npm install\nCOPY . .\nRUN npx prisma generate\nEXPOSE 5000\nCMD ["npm", "run", "start:prod"]`}>
                            {`FROM node:20-slim

# Required by Prisma — alpine does NOT work
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install
COPY . .
RUN npx prisma generate
EXPOSE 5000
CMD ["npm", "run", "start:prod"]`}
                        </CodeBlock>
                        <Callout type="danger">
                            <strong>Do NOT use node:20-alpine for the backend.</strong> Alpine uses
                            musl libc which breaks Prisma's binary engine. Always use node:20-slim
                            (Debian) and install OpenSSL explicitly.
                        </Callout>
                    </StepCard>

                    <StepCard num="1d" numColor="#7c6ff7" numBg="rgba(124,111,247,0.12)"
                        title="Add start:prod script to server/package.json"
                        sub="Runs migrations then starts the server">
                        <CodeBlock label="server/package.json — scripts section" color="#7c6ff7"
                            copyText={`"start:prod": "npx prisma migrate deploy && node src/index.js"`}>
                            {`"scripts": {
  "dev"        : "nodemon src/index.js",
  "start"      : "node src/index.js",
  "build"      : "npx prisma generate",
  "start:prod" : "npx prisma migrate deploy && node src/index.js"
}`}
                        </CodeBlock>
                    </StepCard>

                    <StepCard num="1e" numColor="#7c6ff7" numBg="rgba(124,111,247,0.12)"
                        title="Create client/Dockerfile"
                        sub="Use Node serve — NOT nginx. Nginx port issues on Railway are a nightmare.">
                        <CodeBlock label="client/Dockerfile" color="#7c6ff7"
                            copyText={`FROM node:20-alpine AS builder\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nRUN npm run build\n\nFROM node:20-alpine\nWORKDIR /app\nRUN npm install -g serve\nCOPY --from=builder /app/dist ./dist\nEXPOSE 3000\nCMD ["serve", "-s", "dist", "-l", "3000"]`}>
                            {`FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]`}
                        </CodeBlock>
                        <Callout type="danger">
                            <strong>Do NOT use nginx for the frontend on Railway.</strong> Railway's
                            proxy expects a dynamic port but nginx binds early. Using{' '}
                            <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">serve</code>
                            {' '}with a hardcoded port 3000 + PORT variable set in Railway works perfectly.
                        </Callout>
                    </StepCard>

                    <StepCard num="1f" numColor="#7c6ff7" numBg="rgba(124,111,247,0.12)"
                        title="Add auto-seed to server/src/index.js"
                        sub="Seeds the database automatically on first deploy">
                        <CodeBlock label="server/src/index.js — add before app.listen" color="#7c6ff7"
                            copyText={`async function autoSeedIfEmpty() {\n  try {\n    const userCount = await prisma.user.count()\n    if (userCount === 0) {\n      console.log('  📦 Database empty — running seed...')\n      const { execSync } = await import('child_process')\n      execSync('node prisma/seed.js', { cwd: process.cwd(), stdio: 'inherit', env: process.env })\n    }\n  } catch (e) {\n    console.log('  ⚠️  Auto-seed skipped:', e.message)\n  }\n}`}>
                            {`// Add this function before app.listen
async function autoSeedIfEmpty() {
  try {
    const userCount = await prisma.user.count()
    if (userCount === 0) {
      const { execSync } = await import('child_process')
      execSync('node prisma/seed.js', {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: process.env,
      })
    }
  } catch (e) {
    console.log('  ⚠️  Auto-seed skipped:', e.message)
  }
}

// Update app.listen to call it:
app.listen(env.PORT, async () => {
  console.log('  ⚡ ProbSolver API')
  console.log(\`  🚀 Running on http://localhost:\${env.PORT}\`)
  await autoSeedIfEmpty()
})`}
                        </CodeBlock>
                    </StepCard>

                    <StepCard num="1g" numColor="#7c6ff7" numBg="rgba(124,111,247,0.12)"
                        title="Create root .gitignore"
                        sub="Never commit node_modules or .env files">
                        <CodeBlock label=".gitignore" color="#7c6ff7"
                            copyText={`node_modules/\nclient/node_modules/\nserver/node_modules/\n.env\nclient/.env\nserver/.env\nserver/prisma/dev.db\nserver/prisma/dev.db-journal\nclient/dist/\n.DS_Store`}>
                            {`node_modules/
client/node_modules/
server/node_modules/
.env
client/.env
server/.env
server/prisma/dev.db
server/prisma/dev.db-journal
client/dist/
.DS_Store`}
                        </CodeBlock>
                    </StepCard>
                </Section>

                {/* Step 2 — GitHub */}
                <Section id="github">
                    <SectionTitle icon="🐙">2. Push to GitHub</SectionTitle>
                    <SectionDesc>
                        Create a repo that contains only the problem-solver folder — not your entire Projects directory.
                    </SectionDesc>

                    <Callout type="danger">
                        <strong>Common mistake:</strong> Running{' '}
                        <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">git init</code>
                        {' '}from the wrong directory commits unrelated projects. Always{' '}
                        <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">cd</code>
                        {' '}into <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">problem-solver/</code>
                        {' '}first and verify with{' '}
                        <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">pwd</code>
                        {' '}before running git commands.
                    </Callout>

                    <StepCard num="2a" numColor="#22c55e" numBg="rgba(34,197,94,0.12)"
                        title="Configure git identity (first time only)"
                        sub="Required before your first commit">
                        <CodeBlock label="Terminal" color="#22c55e"
                            copyText={`git config --global user.email "you@example.com"\ngit config --global user.name "Your Name"`}>
                            {`git config --global user.email "you@example.com"
git config --global user.name "Your Name"`}
                        </CodeBlock>
                    </StepCard>

                    <StepCard num="2b" numColor="#22c55e" numBg="rgba(34,197,94,0.12)"
                        title="Initialize repo inside problem-solver/"
                        sub="Not in the parent Projects/ directory">
                        <CodeBlock label="Terminal" color="#22c55e"
                            copyText={`cd ~/Downloads/Projects/problem-solver\ngit init\ngit add .\ngit commit -m "production ready — railway deploy"`}>
                            {`cd ~/Downloads/Projects/problem-solver   # ← must be inside here
pwd   # verify: should end with /problem-solver
git init
git add .
git commit -m "production ready — railway deploy"`}
                        </CodeBlock>
                    </StepCard>

                    <StepCard num="2c" numColor="#22c55e" numBg="rgba(34,197,94,0.12)"
                        title="Create GitHub repo and push"
                        sub="Go to github.com/new — do NOT initialize with README">
                        <CodeBlock label="Terminal" color="#22c55e"
                            copyText={`git remote add origin https://github.com/YOUR_USERNAME/problem-solver.git\ngit branch -M main\ngit push -u origin main`}>
                            {`git remote add origin https://github.com/YOUR_USERNAME/problem-solver.git
git branch -M main
git push -u origin main`}
                        </CodeBlock>
                        <Callout type="info">
                            Verify the GitHub repo root shows <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">client/</code>,{' '}
                            <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">server/</code>, and{' '}
                            <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">.gitignore</code> —
                            NOT a <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">problem-solver/</code> subfolder.
                        </Callout>
                    </StepCard>

                    <StepCard num="2d" numColor="#22c55e" numBg="rgba(34,197,94,0.12)"
                        title="Fix case-sensitive filename issues"
                        sub="macOS is case-insensitive — Linux is not. Use git mv to rename.">
                        <CodeBlock label="Terminal — example fix" color="#22c55e"
                            copyText={`git mv client/src/components/charts/ActivityHeatMap.jsx client/src/components/charts/ActivityHeatmap.jsx`}>
                            {`# If a file works locally but fails on Railway with ENOENT:
# Use git mv instead of regular mv to force the rename
git mv client/src/components/charts/ActivityHeatMap.jsx \
       client/src/components/charts/ActivityHeatmap.jsx
git commit -m "fix: case sensitive filename for linux"
git push`}
                        </CodeBlock>
                    </StepCard>
                </Section>

                {/* Step 3 — Railway */}
                <Section id="railway">
                    <SectionTitle icon="🚂">3. Create Railway Project</SectionTitle>
                    <SectionDesc>Sign up and create an empty project — do not use a template.</SectionDesc>

                    <StepCard num="3a" numColor="#eab308" numBg="rgba(234,179,8,0.12)"
                        title="Sign up and create project"
                        sub="Use GitHub OAuth — makes repo connection seamless">
                        <p className="text-xs text-text-secondary leading-relaxed">
                            Go to{' '}
                            <a href="https://railway.app" target="_blank" className="text-brand-300 underline">railway.app</a>
                            {' '}→ <strong>Login with GitHub</strong> → <strong>New Project</strong> →{' '}
                            <strong>Empty Project</strong> → name it <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">problem-solver</code>.
                        </p>
                    </StepCard>
                </Section>

                {/* Step 4 — PostgreSQL */}
                <Section id="postgres">
                    <SectionTitle icon="🗄️">4. Add PostgreSQL</SectionTitle>
                    <SectionDesc>Always add the database FIRST before any application services.</SectionDesc>

                    <StepCard num="4a" numColor="#a855f7" numBg="rgba(168,85,247,0.12)"
                        title="Add PostgreSQL plugin"
                        sub="Wait for green Active status before proceeding">
                        <p className="text-xs text-text-secondary leading-relaxed mb-3">
                            In Railway project → <strong>+ New</strong> → <strong>Database</strong> →{' '}
                            <strong>Add PostgreSQL</strong>. Wait for the green Active dot.
                        </p>
                        <Callout type="danger">
                            <strong>If PostgreSQL shows this error:</strong>{' '}
                            <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">
                                ERROR (catatonit:2): failed to exec pid1: No such file or directory
                            </code>
                            {' '}— delete it and add a fresh one. This is a Railway infrastructure glitch,
                            not your code. Simply remove and re-add the PostgreSQL service.
                        </Callout>
                    </StepCard>
                </Section>

                {/* Step 5 — Backend */}
                <Section id="backend">
                    <SectionTitle icon="⚙️">5. Deploy Backend</SectionTitle>
                    <SectionDesc>Connect your GitHub repo and set all environment variables.</SectionDesc>

                    <StepCard num="5a" numColor="#3b82f6" numBg="rgba(59,130,246,0.12)"
                        title="Add backend service"
                        sub="Root directory must be set to 'server'">
                        <p className="text-xs text-text-secondary leading-relaxed">
                            <strong>+ New</strong> → <strong>GitHub Repo</strong> → select <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">problem-solver</code> →
                            set <strong>Root Directory</strong> to <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">server</code> → Deploy.
                        </p>
                    </StepCard>

                    <StepCard num="5b" numColor="#3b82f6" numBg="rgba(59,130,246,0.12)"
                        title="Set environment variables"
                        sub="Backend service → Variables → Raw Editor">
                        <CodeBlock />
                        <p className="text-xs text-text-tertiary mb-2 mt-3">
                            Generate JWT_SECRET:
                        </p>
                        <CodeBlock label="Terminal" color="#3b82f6"
                            copyText={`node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`}>
                            {`node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`}
                        </CodeBlock>
                        <Callout type="warning">
                            <strong>CLIENT_URL</strong> — set a placeholder for now. Update it after
                            the frontend is deployed with the real frontend domain.
                        </Callout>
                    </StepCard>

                    <StepCard num="5c" numColor="#3b82f6" numBg="rgba(59,130,246,0.12)"
                        title="Generate backend domain"
                        sub="You need this URL for the frontend VITE_API_URL variable">
                        <p className="text-xs text-text-secondary leading-relaxed">
                            Backend service → <strong>Settings</strong> → <strong>Networking</strong> →{' '}
                            <strong>Generate Domain</strong>. Copy the domain — looks like{' '}
                            <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">
                                web-production-xxxx.up.railway.app
                            </code>.
                        </p>
                    </StepCard>

                    <StepCard num="5d" numColor="#3b82f6" numBg="rgba(59,130,246,0.12)"
                        title="Verify backend is running"
                        sub="Hit the health endpoint before deploying frontend">
                        <CodeBlock label="Browser or curl" color="#3b82f6"
                            copyText="https://YOUR_BACKEND_DOMAIN/health">
                            {`https://YOUR_BACKEND_DOMAIN/health

# Expected response:
{
  "status": "ok",
  "environment": "production",
  "aiEnabled": false
}`}
                        </CodeBlock>
                        <Callout type="success">
                            You should also see in the Railway logs:
                            <br />
                            <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">
                                📦 Database empty — running seed...
                            </code>
                            <br />
                            <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">
                                ✅ Seed complete!
                            </code>
                        </Callout>
                    </StepCard>
                </Section>

                {/* Step 6 — Frontend */}
                <Section id="frontend">
                    <SectionTitle icon="🎨">6. Deploy Frontend</SectionTitle>
                    <SectionDesc>
                        VITE_API_URL is a build-time variable — it gets baked into the JavaScript bundle.
                        Set it before the first build.
                    </SectionDesc>

                    <StepCard num="6a" numColor="#22c55e" numBg="rgba(34,197,94,0.12)"
                        title="Add frontend service"
                        sub="Same repo, different root directory">
                        <p className="text-xs text-text-secondary leading-relaxed">
                            <strong>+ New</strong> → <strong>GitHub Repo</strong> → select <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">problem-solver</code> →
                            set <strong>Root Directory</strong> to <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-xs">client</code> → Deploy.
                        </p>
                    </StepCard>

                    <StepCard num="6b" numColor="#22c55e" numBg="rgba(34,197,94,0.12)"
                        title="Set frontend variables"
                        sub="Frontend service → Variables">
                        <CodeBlock label="Frontend Variables" color="#22c55e"
                            copyText={`VITE_API_URL=https://YOUR_BACKEND_DOMAIN/api\nPORT=3000`}>
                            {`VITE_API_URL=https://YOUR_BACKEND_DOMAIN/api
PORT=3000`}
                        </CodeBlock>
                        <Callout type="warning">
                            <strong>After setting VITE_API_URL</strong> you must trigger a redeploy
                            so Vite rebuilds with the URL baked in. Go to Deployments → Redeploy.
                        </Callout>
                    </StepCard>

                    <StepCard num="6c" numColor="#22c55e" numBg="rgba(34,197,94,0.12)"
                        title="Generate frontend domain"
                        sub="This is the URL you share with your team">
                        <p className="text-xs text-text-secondary leading-relaxed">
                            Frontend service → <strong>Settings</strong> → <strong>Networking</strong> →{' '}
                            <strong>Generate Domain</strong>. Copy this URL.
                        </p>
                    </StepCard>

                    <StepCard num="6d" numColor="#22c55e" numBg="rgba(34,197,94,0.12)"
                        title="Update backend CORS"
                        sub="Go back to backend and update CLIENT_URL">
                        <CodeBlock label="Backend Variables — update this" color="#22c55e"
                            copyText="CLIENT_URL=https://YOUR_FRONTEND_DOMAIN.up.railway.app">
                            {`CLIENT_URL=https://YOUR_FRONTEND_DOMAIN.up.railway.app`}
                        </CodeBlock>
                        <Callout type="warning">
                            Must match exactly — no trailing slash. If CORS errors appear in the
                            browser console, this is the first thing to check.
                        </Callout>
                    </StepCard>
                </Section>

                {/* Step 7 — Verify */}
                <Section id="verify">
                    <SectionTitle icon="✅">7. Verify & Share</SectionTitle>
                    <SectionDesc>Run through this checklist before sharing with your team.</SectionDesc>

                    <div className="space-y-2 mb-6">
                        {[
                            'Frontend URL loads the login page',
                            'Login with admin@probsolver.dev / admin123 works',
                            'Dashboard shows stat cards and 5 seeded problems',
                            '/problems shows the problem list with filters',
                            'Click a problem → detail page loads',
                            '/admin works for admin user — shows problems table',
                            'Submit a solution → success toast appears',
                            '/report shows the radar chart',
                            'Backend health check returns { "status": "ok" }',
                        ].map((item, i) => (
                            <CheckItem key={i} label={item} />
                        ))}
                    </div>

                    <div className="bg-surface-2 border border-border-default rounded-xl p-5">
                        <p className="text-sm font-bold text-text-primary mb-3">
                            Share with your team:
                        </p>
                        <CodeBlock label="Message to send teammates" color="#22c55e"
                            copyText={`ProbSolver is live!\n\nApp: https://YOUR_FRONTEND_DOMAIN.up.railway.app\n\nTo join:\n1. Go to /register and create your account\n2. Set your target company in Settings\n\nAdmin login (keep private):\n  admin@probsolver.dev / admin123`}>
                            {`ProbSolver is live!

App: https://YOUR_FRONTEND_DOMAIN.up.railway.app

To join:
1. Go to /register and create your account
2. Set your target company in Settings

Admin login (keep private):
  admin@probsolver.dev / admin123`}
                        </CodeBlock>
                    </div>
                </Section>

                {/* Troubleshooting */}
                <Section id="troubleshoot">
                    <SectionTitle icon="🔧">Troubleshooting</SectionTitle>
                    <SectionDesc>
                        Every error we hit during deployment — and the exact fix.
                    </SectionDesc>

                    <div className="space-y-3">
                        {[
                            {
                                error: 'Prisma failed to detect libssl/openssl version',
                                fix: 'You used node:20-alpine in server/Dockerfile. Switch to node:20-slim and add: RUN apt-get update -y && apt-get install -y openssl',
                            },
                            {
                                error: 'DATETIME type does not exist (P3018)',
                                fix: 'Your migration SQL uses SQLite DATETIME syntax. PostgreSQL needs TIMESTAMP(3). Run: sed -i \'s/DATETIME/TIMESTAMP(3)/g\' server/prisma/migrations/*/migration.sql then reset the Railway database and redeploy.',
                            },
                            {
                                error: 'migration_lock.toml provider sqlite does not match postgresql (P3019)',
                                fix: 'Delete server/prisma/migrations/ entirely, recreate migration_lock.toml with provider = "postgresql", and regenerate the migration SQL. Commit and push.',
                            },
                            {
                                error: 'P1001: Can\'t reach database server at postgres.railway.internal',
                                fix: 'DATABASE_URL variable is not set or the PostgreSQL service is not in the same Railway project. Check backend Variables tab — DATABASE_URL should show ${{Postgres.DATABASE_URL}}. If PostgreSQL is crashed, delete it and add a fresh one.',
                            },
                            {
                                error: 'Application failed to respond (502)',
                                fix: 'nginx port mismatch with Railway proxy. Switch to Node serve in client/Dockerfile: RUN npm install -g serve && CMD ["serve", "-s", "dist", "-l", "3000"]. Set PORT=3000 in frontend Variables.',
                            },
                            {
                                error: 'ENOENT: no such file or directory (build fails on Railway)',
                                fix: 'Case-sensitive filename mismatch. macOS is case-insensitive, Linux is not. Use git mv OldName.jsx newname.jsx to force the rename in git history.',
                            },
                            {
                                error: 'CORS error in browser console',
                                fix: 'CLIENT_URL in backend variables does not match the frontend domain exactly. Must include https://, no trailing slash.',
                            },
                            {
                                error: 'Login works but API calls fail (network error)',
                                fix: 'VITE_API_URL is wrong or not set. It must point to your backend domain with /api at the end. After changing it, trigger a full redeploy — it\'s a build-time variable.',
                            },
                            {
                                error: 'ERROR (catatonit:2): failed to exec pid1: No such file or directory',
                                fix: 'PostgreSQL service is corrupted. Delete it from the Railway project and add a fresh PostgreSQL database. This is a Railway infrastructure issue.',
                            },
                            {
                                error: 'Seed fails: A record with this value already exists',
                                fix: 'Database already has data from a previous seed attempt. The seed script clears data first — if it\'s crashing before that, reset the Railway database via the PostgreSQL service Data tab and redeploy.',
                            },
                            {
                                error: 'Login fails with HTML response instead of JSON (VITE_API_URL not baked in)',
                                fix: 'VITE_API_URL is a Vite build-time variable — Railway does not pass env vars to Docker builds automatically. You must declare it as a build ARG in client/Dockerfile. Add these two lines before RUN npm run build:\n\nARG VITE_API_URL\nENV VITE_API_URL=$VITE_API_URL\n\nWithout this, the built JS bundle has no API URL and all requests go to the frontend server instead of the backend, returning HTML instead of JSON.',
                                code: `ARG VITE_API_URL\nENV VITE_API_URL=$VITE_API_URL`,
                            },
                        ].map((item, i) => (
                            <div key={i}
                                className="bg-surface-2 border border-border-default rounded-xl p-4">
                                <div className="flex items-start gap-2.5 mb-2">
                                    <span className="bg-danger/12 text-danger border border-danger/25
                       rounded px-2 py-0.5 text-[11px] font-extrabold
                       flex-shrink-0 mt-0.5">
                                        ERROR
                                    </span>
                                    <code className="text-sm font-mono text-text-primary leading-snug">
                                        {item.error}
                                    </code>
                                </div>
                                <div className="text-sm text-text-tertiary leading-relaxed pl-16 space-y-2">
                                    {item.fix.split('\n\n').map((para, pi) => (
                                        <p key={pi}>{para}</p>
                                    ))}
                                    {item.code && (
                                        <CodeBlock label="client/Dockerfile" color="#7c6ff7" copyText={item.code}>
                                            {item.code}
                                        </CodeBlock>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </Section>

            </div>

            {/* Footer */}
            <div className="border-t border-border-default bg-surface-1
                      px-10 py-6 flex items-center justify-between flex-wrap gap-4">
                <span className="text-xs text-text-disabled">
                    <strong className="text-text-secondary">ProbSolver Deployment Guide</strong> · v2.0.0
                </span>
                <div className="flex gap-4">
                    <Link to="/docs/readme"
                        className="text-xs text-text-tertiary hover:text-brand-300 transition-colors">
                        README →
                    </Link>
                    <Link to="/docs/setup"
                        className="text-xs text-text-tertiary hover:text-brand-300 transition-colors">
                        Setup Guide →
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

// ── Interactive checklist item ─────────────────────────
function CheckItem({ label }) {
    const [checked, setChecked] = useState(false)
    return (
        <button
            onClick={() => setChecked(v => !v)}
            className="w-full flex items-center gap-3 p-3 rounded-xl border
                 bg-surface-2 border-border-default text-left
                 hover:border-border-strong transition-all group"
        >
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center
                       flex-shrink-0 transition-all duration-150 ${checked
                    ? 'bg-success border-success'
                    : 'border-border-strong group-hover:border-brand-400'
                }`}>
                {checked && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                        stroke="white" strokeWidth="3.5"
                        strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                )}
            </div>
            <span className={`text-sm transition-colors ${checked ? 'text-text-disabled line-through' : 'text-text-secondary'
                }`}>
                {label}
            </span>
        </button>
    )
}