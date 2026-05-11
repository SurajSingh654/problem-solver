// ============================================================================
// ProbSolver — How-To Guide
// ============================================================================
// End-to-end walkthroughs for every major tool in the app.
// Sections start with Design Studio (SD + LLD) then cover Problems, Admin,
// Quizzes, Mock Interview, and Feedback. Each section has one concrete
// example the reader can follow along with.
// ============================================================================

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
    DocsLayout, DocsHero, Section, SectionTitle, SectionDesc,
    StepCard, Callout, ArchBlock, SbLink,
} from './components'

// ── Screenshot base path ────────────────────────────────────────────
// Screenshots go in client/public/docs/how-to/ and are referenced here by
// filename only. The public folder is served at site root, so a file named
// `ds-sd-00-create-session.png` is reachable at
// /docs/how-to/ds-sd-00-create-session.png. If a file is missing the image
// component shows a labeled placeholder with the expected filename so
// contributors know exactly what to drop in.
const SCREENSHOT_BASE = '/docs/how-to'

// ── Image with graceful placeholder + lightbox zoom ─────────────────
function HowToImage({ file, alt, caption }) {
    const [errored, setErrored] = useState(false)
    const [zoomed, setZoomed] = useState(false)
    const src = `${SCREENSHOT_BASE}/${file}`

    // ESC closes lightbox
    useEffect(() => {
        if (!zoomed) return
        const onKey = (e) => { if (e.key === 'Escape') setZoomed(false) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [zoomed])

    if (errored) {
        // Placeholder frame — still useful context for the reader while the
        // screenshot is pending. Shows the exact filename contributors need.
        return (
            <figure className="my-3 border-2 border-dashed border-border-default
                               rounded-xl bg-surface-0 overflow-hidden">
                <div className="flex flex-col items-center justify-center p-8 gap-2 min-h-[160px]">
                    <div className="text-2xl opacity-40">🖼️</div>
                    <div className="text-[11px] font-bold text-text-disabled uppercase tracking-widest">
                        Screenshot placeholder
                    </div>
                    {caption && (
                        <div className="text-xs text-text-tertiary text-center max-w-md">
                            {caption}
                        </div>
                    )}
                    <code className="text-[10px] font-mono text-brand-fg-soft bg-brand-soft
                                     border border-brand-line rounded px-2 py-1 mt-1">
                        public/docs/how-to/{file}
                    </code>
                </div>
            </figure>
        )
    }

    return (
        <>
            <figure className="my-3 group">
                <button
                    type="button"
                    onClick={() => setZoomed(true)}
                    className="block w-full rounded-xl overflow-hidden border border-border-default
                               bg-surface-0 hover:border-brand-line transition-colors cursor-zoom-in"
                    title="Click to enlarge"
                >
                    <img
                        src={src}
                        alt={alt}
                        loading="lazy"
                        onError={() => setErrored(true)}
                        className="w-full h-auto block"
                    />
                </button>
                {caption && (
                    <figcaption className="text-[11px] text-text-tertiary text-center mt-1.5 italic">
                        {caption}
                    </figcaption>
                )}
            </figure>
            {zoomed && (
                <div
                    onClick={() => setZoomed(false)}
                    className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm
                               flex items-center justify-center p-6 cursor-zoom-out
                               animate-in fade-in duration-150"
                >
                    <img
                        src={src}
                        alt={alt}
                        className="max-w-full max-h-full rounded-lg shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <button
                        onClick={() => setZoomed(false)}
                        className="absolute top-4 right-4 w-10 h-10 rounded-full
                                   bg-surface-2 border border-border-default text-text-primary
                                   hover:bg-surface-3 transition-colors"
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>
            )}
        </>
    )
}

// ── Sidebar sections ───────────────────────────────────
const NAV = [
    {
        group: 'Start Here', items: [
            { id: 'overview', label: 'Overview' },
            { id: 'ds-sd', label: '🏗️ System Design — URL Shortener' },
            { id: 'ds-lld', label: '🔧 Low-Level Design — Parking Lot' },
        ]
    },
    {
        group: 'Problems', items: [
            { id: 'solve', label: 'Solve a Problem' },
            { id: 'edit-solution', label: 'Edit Your Solution' },
        ]
    },
    {
        group: 'Admin', items: [
            { id: 'add-problem-ai', label: 'Add Problem (AI)' },
            { id: 'add-problem-manual', label: 'Add Problem (Manual)' },
        ]
    },
    {
        group: 'Practice', items: [
            { id: 'quiz', label: 'Attempt a Quiz' },
            { id: 'mock', label: 'Mock Interview' },
        ]
    },
    {
        group: 'Support', items: [
            { id: 'feedback', label: 'Feedback & Issues' },
        ]
    },
]

// Shared styling constants for StepCard
const BRAND = { numColor: '#7c6ff7', numBg: 'rgba(124,111,247,0.12)' }
const SUCCESS = { numColor: '#22c55e', numBg: 'rgba(34,197,94,0.12)' }
const WARN = { numColor: '#eab308', numBg: 'rgba(234,179,8,0.12)' }
const INFO = { numColor: '#3b82f6', numBg: 'rgba(59,130,246,0.12)' }

// Small inline example block — for pasteable content inside steps.
function Example({ children }) {
    return (
        <pre className="bg-surface-0 border border-border-default rounded-lg
                        p-3.5 text-[11px] leading-relaxed text-text-secondary
                        font-mono whitespace-pre-wrap overflow-x-auto my-2">
            {children}
        </pre>
    )
}

// A "paste this" block with a small label.
function PasteBlock({ label, children }) {
    return (
        <div className="my-2">
            {label && (
                <div className="text-[10px] font-bold text-text-disabled uppercase
                                tracking-widest mb-1">{label}</div>
            )}
            <Example>{children}</Example>
        </div>
    )
}

// A small inline shortcut / keyword chip.
function K({ children }) {
    return (
        <code className="bg-surface-3 border border-border-default rounded
                         px-1.5 py-0.5 text-[11px] font-mono text-brand-fg-soft">
            {children}
        </code>
    )
}

export default function HowToPage() {
    const [active, setActive] = useState('overview')

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

    const sidebar = (
        <>
            <div className="flex items-center gap-3 px-5 py-6
                            border-b border-border-default flex-shrink-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center
                                text-lg flex-shrink-0"
                    style={{
                        background: 'linear-gradient(135deg,#7c6ff7,#60a5fa)',
                        boxShadow: '0 0 20px rgba(124,111,247,0.3)'
                    }}>
                    📘
                </div>
                <div>
                    <div className="text-sm font-extrabold bg-gradient-to-r from-brand-300
                                    to-blue-400 bg-clip-text text-transparent">
                        How-To Guide
                    </div>
                    <div className="text-[11px] text-text-disabled font-mono uppercase tracking-wider">
                        Walkthroughs
                    </div>
                </div>
            </div>

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

                <div>
                    <div className="text-[11px] font-bold text-text-disabled uppercase
                                    tracking-widest px-2.5 pb-1.5">
                        Links
                    </div>
                    <div className="space-y-0.5">
                        <Link to="/docs/readme" className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg
                                                           text-xs font-medium text-text-tertiary
                                                           hover:bg-surface-3 hover:text-text-primary transition-all">
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-soft" />
                            README →
                        </Link>
                        <Link to="/" className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg
                                                text-xs font-medium text-text-tertiary
                                                hover:bg-surface-3 hover:text-text-primary transition-all">
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-soft" />
                            ← Back to App
                        </Link>
                    </div>
                </div>
            </nav>
        </>
    )

    return (
        <DocsLayout sidebar={sidebar}>
            <DocsHero
                eyebrow="📘 Walkthroughs · v3.0"
                title="How-To —"
                titleGradient="Use Every Tool"
                desc="Concrete, copy-pasteable walkthroughs for each feature in ProbSolver. Start with Design Studio if you're new — the two demo sessions (System Design + Low-Level Design) cover the end-to-end shape of every feature. Then pick the section that matches what you want to do."
            />

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* OVERVIEW                                                       */}
            {/* ══════════════════════════════════════════════════════════════ */}
            <Section id="overview">
                <SectionTitle icon="🗺️">Overview</SectionTitle>
                <SectionDesc>
                    Five tools to know. Pick based on what you want to practice:
                </SectionDesc>

                <div className="grid md:grid-cols-2 gap-3 mb-4">
                    <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                        <div className="text-lg mb-1">🏗️ Design Studio</div>
                        <p className="text-xs text-text-tertiary">
                            Phased, AI-coached practice for System Design & Low-Level Design. Whiteboard,
                            scenarios, scale analysis, flow simulation, final evaluation.
                        </p>
                    </div>
                    <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                        <div className="text-lg mb-1">📝 Problems</div>
                        <p className="text-xs text-text-tertiary">
                            Solve team-curated problems. Submit code or structured answers across 7 categories.
                            Get AI review across 5 dimensions.
                        </p>
                    </div>
                    <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                        <div className="text-lg mb-1">🎯 Quizzes</div>
                        <p className="text-xs text-text-tertiary">
                            Rapid-fire multiple choice on any subject. AI generates plausible distractors
                            tuned to difficulty.
                        </p>
                    </div>
                    <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                        <div className="text-lg mb-1">🎙️ Mock Interview</div>
                        <p className="text-xs text-text-tertiary">
                            Live AI interviewer over WebSocket — text or voice mode. Structured phases,
                            hints, final debrief.
                        </p>
                    </div>
                </div>

                <Callout type="info">
                    Every section below has <strong>one concrete example</strong> you can paste into the app verbatim
                    or adapt. Follow it end-to-end once, then run your own problems.
                </Callout>
            </Section>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* DESIGN STUDIO — SYSTEM DESIGN                                  */}
            {/* ══════════════════════════════════════════════════════════════ */}
            <Section id="ds-sd">
                <SectionTitle icon="🏗️">Design Studio — System Design</SectionTitle>
                <SectionDesc>
                    Example: <strong>Design a URL Shortener (like bit.ly)</strong>. Small enough to complete in one session,
                    touches every SD concept — scale, cache, DB choice, consistency, failure modes. Allow ~30–40 min
                    if you actually write the content.
                </SectionDesc>

                <Callout type="info">
                    <strong>Two ways in:</strong>
                    <ul className="mt-2 space-y-1 list-disc pl-4">
                        <li><strong>From a team-curated problem</strong> (recommended): open an SD problem from <K>Problems</K>, click <strong>🏗️ Practice in Design Studio</strong>. Title + difficulty are prefilled; admin notes flow into AI coaching; past attempts appear above the start button.</li>
                        <li><strong>Freeform</strong>: sidebar <K>Design Studio</K> → <strong>+ New Session</strong>. Pick your own title. No Problem record, so no admin notes or attempt tracking.</li>
                    </ul>
                </Callout>

                <StepCard num="0" {...BRAND} title="Create the session" sub="Problem page → Practice in Design Studio (or sidebar freeform)">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        <strong>From a problem:</strong> click <strong>🏗️ Practice in Design Studio</strong> on any SD problem — you land in a hub showing the problem context + your past attempts + a <strong>Start Practice Session</strong> button. One click and you&apos;re in the workspace.
                    </p>
                    <p className="text-xs text-text-secondary leading-relaxed mt-2">
                        <strong>Freeform:</strong> pick <strong>🏗️ System Design</strong>, title <K>Design URL Shortener</K>, difficulty <K>MEDIUM</K>, click <strong>Start Design Session</strong>.
                    </p>
                    <p className="text-xs text-text-secondary leading-relaxed mt-2">
                        Either way you land in the same workspace: Excalidraw canvas on top, phase editor below. Seven phases are dots in the top bar: Requirements → Estimation → API → Data Model → Architecture → Deep Dive → Trade-offs.
                    </p>
                    <HowToImage
                        file="ds-sd-00-create-session.png"
                        alt="Create session screen showing design type picker, title input, and difficulty buttons"
                        caption="Create-session screen with System Design selected"
                    />
                </StepCard>

                <StepCard num="1" {...BRAND} title="Requirements 📋" sub="What must the system do, at what scale">
                    <p className="text-xs text-text-secondary leading-relaxed mb-2">
                        Switch to the Requirements phase (first dot). Paste or adapt:
                    </p>
                    <PasteBlock>{`Functional:
- Shorten a long URL into a 7-char code (e.g. bit.ly/aZ3kP9x)
- Redirect from short code → long URL (302)
- Custom alias (optional, user-chosen)
- URL expiration (default 2 years, configurable)
- Analytics: click count per URL

Non-functional:
- Read:write ratio = 100:1 (redirects dominate)
- Reads: ~10K QPS average, 100K QPS peak
- Writes: ~100 QPS average
- Read latency: p99 < 50ms
- Availability: 99.9% (redirects can't go down)
- Consistency: eventual for analytics, strong for redirect mapping`}</PasteBlock>
                    <HowToImage
                        file="ds-sd-01-workspace.png"
                        alt="Design workspace — top bar with phase dots, Excalidraw canvas, bottom phase editor"
                        caption="Full workspace layout: phase dots (top), Excalidraw canvas, resizable phase editor with AI coach bar"
                    />
                    <Callout type="info">
                        Try the <strong>🤖 AI Coach → Am I on track?</strong> button now. It should quote your text
                        back and name one missing thing (e.g. &ldquo;rate limiting&rdquo; or &ldquo;URL validation&rdquo;).
                    </Callout>
                    <HowToImage
                        file="ds-sd-01-ai-coach.png"
                        alt="AI coach response panel with verdict pill, specific strength, and specific gap sections"
                        caption="AI coach Validate response — verdict pill + Strength + Gap sections"
                    />
                </StepCard>

                <StepCard num="2" {...BRAND} title="Capacity Estimation 🔢" sub="Back-of-envelope math that anchors later decisions">
                    <PasteBlock>{`Traffic:
- 100M new URLs/month ≈ 40 writes/sec avg, 400/sec peak
- Read:write = 100:1 → 4K reads/sec avg, 40K peak

Storage (5-year horizon):
- 100M URLs/month × 60 months = 6B URLs
- Per row: ~500 bytes (long URL + short code + metadata)
- Total: 6B × 500B = 3 TB

Cache sizing (80/20 rule):
- Top 10M hot URLs × 500B = 5 GB → fits Redis cluster`}</PasteBlock>
                    <Callout type="info">
                        Numbers feel shaky? Click <strong>I&apos;m stuck</strong> — AI will ask Socratic questions
                        like &ldquo;What read:write ratio are you assuming and why?&rdquo;
                    </Callout>
                </StepCard>

                <StepCard num="3" {...BRAND} title="API Design 🔌" sub="Endpoints with request/response shapes">
                    <PasteBlock>{`POST /api/v1/urls
  body: { longUrl, customAlias?, expiresAt? }
  returns: { shortCode, shortUrl, expiresAt }
  auth: API key
  idempotency: hash(longUrl + userId)

GET /:shortCode
  returns: 302 redirect
  side effect: increment click count (async)

GET /api/v1/urls/:shortCode/stats
  auth: owner only
  returns: { clicks, createdAt, topCountries, lastClickAt }`}</PasteBlock>
                </StepCard>

                <StepCard num="4" {...BRAND} title="Data Model 🗄️" sub="Tables, indexes, database choice">
                    <PasteBlock>{`urls
  short_code VARCHAR(10) PK
  long_url TEXT NOT NULL
  user_id UUID FK
  created_at TIMESTAMPTZ
  expires_at TIMESTAMPTZ

INDEX: (user_id, created_at DESC) — "my URLs" page
INDEX: expires_at — cleanup job

click_events (append-only, partitioned by day)
  short_code VARCHAR(10)
  clicked_at TIMESTAMPTZ
  country VARCHAR(2)

Choice: Postgres for urls (ACID on writes).
Cassandra/ClickHouse for click_events (append-only, massive volume).`}</PasteBlock>
                </StepCard>

                <StepCard num="5" {...BRAND} title="Architecture 🏗️" sub="Diagram + component annotations + data flow">
                    <p className="text-xs text-text-secondary leading-relaxed mb-2">
                        Draw on the <strong>Excalidraw canvas</strong> (top half of workspace): Client → CDN →
                        Load Balancer → API Server → Redis → Postgres, plus Kafka + Worker + ClickHouse for click events.
                    </p>
                    <HowToImage
                        file="ds-sd-05-canvas.png"
                        alt="Excalidraw canvas with URL shortener architecture: boxes for Client, CDN, LB, API, Redis, Postgres, Kafka, Worker, ClickHouse connected by arrows"
                        caption="Architecture drawn on the Excalidraw canvas"
                    />
                    <p className="text-xs text-text-secondary leading-relaxed mb-2">
                        The AI <strong>can&apos;t see the diagram</strong>. Two panels below translate it for the AI —
                        both are critical:
                    </p>
                    <PasteBlock label="🧩 Component Annotations (open the panel)">{`LoadBalancer — HTTP routing, SSL termination (AWS ALB)
API Server — Shorten + redirect logic (Node.js, stateless)
Redis — Hot URL cache, rate limiting (Redis Cluster 7.x)
Postgres — Source of truth for url mappings (RDS Postgres 15)
Kafka — Async click event stream (MSK)
ClickWorker — Consumes click events → analytics (Node.js consumer)
ClickHouse — Analytics storage`}</PasteBlock>
                    <HowToImage
                        file="ds-sd-05-annotations.png"
                        alt="Expanded Component Annotations panel showing component name, purpose, technology, and notes fields"
                        caption="🧩 Component Annotations panel expanded"
                    />
                    <PasteBlock label="🔀 Data Flow (open the panel)">{`Redirect (read path):
Client → CDN (5 min edge cache) → LB → API → Redis (90% hit) → redirect
  cache miss → API → Postgres → populate Redis → redirect
  every redirect → async ClickEvent → Kafka → Worker → ClickHouse

Shorten (write path):
Client → LB → API → validate → generate 7-char code (base62 of snowflake)
  → INSERT Postgres → populate Redis → return shortUrl`}</PasteBlock>
                    <HowToImage
                        file="ds-sd-05-data-flow.png"
                        alt="Expanded Data Flow panel with read-path and write-path traced through the components"
                        caption="🔀 Data Flow panel expanded — AI uses this text, not the diagram"
                    />
                </StepCard>

                <StepCard num="6" {...BRAND} title="Deep Dive 🔬" sub="Pick 2–3 components, go deep">
                    <PasteBlock>{`Redis cluster:
- Key: short_code, Value: long_url + expiry
- TTL: 24h sliding (reset on hit)
- 3 primary + 3 replica, 20 GB RAM each, allkeys-lru eviction

Code generator (7-char base62 = 62^7 = 3.5 trillion codes):
- Snowflake ID → base62 encode → take last 7 chars
- Snowflake = timestamp(41) + workerID(10) + seq(12) → unique
- Custom alias: check existence before INSERT, UNIQUE constraint as backstop`}</PasteBlock>
                </StepCard>

                <StepCard num="7" {...BRAND} title="Trade-offs ⚖️" sub="Decisions made + what breaks first at 10x">
                    <PasteBlock>{`Chose Postgres over DynamoDB:
- Strong consistency on shorten (no duplicate codes)
- Cost: sharding complexity if we outgrow one master

Chose eventual consistency on click counts:
- Kafka + async Worker = clicks may lag by 30s
- Acceptable because stats aren't user-blocking

What breaks first at 10x (400K RPS read):
- Redis cluster CPU — mitigation: 2-tier cache (local LRU in API)
- Postgres on cache miss storm — mitigation: request coalescing`}</PasteBlock>
                </StepCard>

                <StepCard num="8" {...SUCCESS} title="Validate Design →" sub="AI generates 6 scenarios tailored to your design">
                    <p className="text-xs text-text-secondary leading-relaxed mb-2">
                        Click <strong>Validate Design →</strong> in the top bar. Requires at least 3 phases filled.
                        AI generates scenarios like &ldquo;Redis cluster loses one primary&rdquo;, &ldquo;Viral URL
                        gets 1M hits/sec suddenly&rdquo;, &ldquo;User requests custom alias that was just taken&rdquo;.
                    </p>
                    <p className="text-xs text-text-secondary leading-relaxed">
                        For each scenario: write how your architecture handles it → <strong>Save Response</strong> →{' '}
                        <strong>🤖 Evaluate</strong>. Aim for PASS on at least 4/6.
                    </p>
                    <HowToImage
                        file="ds-sd-08-scenarios.png"
                        alt="Scenarios view with progress bar, scenario cards showing PASS/PARTIAL/FAIL verdicts, missed-points lists"
                        caption="Scenarios view — evaluated cards show verdict, missed points, suggestions"
                    />
                </StepCard>

                <StepCard num="9" {...SUCCESS} title="Scale Analysis + Flow Simulation" sub="Stress-test the design">
                    <p className="text-xs text-text-secondary leading-relaxed mb-2">
                        Navigate via <strong>Scale Analysis →</strong>. Fill in 1x / 10x / 100x / Failure-at-scale
                        (the placeholders guide what to write).
                    </p>
                    <p className="text-xs text-text-secondary leading-relaxed mb-2">
                        <strong>Flows →</strong> lets you trace request paths with latencies. Build one flow,
                        e.g. <K>Send redirect</K>:
                    </p>
                    <PasteBlock>{`1. Client → CDN       (5ms)
2. CDN → ALB          (20ms)
3. ALB → API          (1ms)
4. API → Redis        (2ms)
5. API → Client       (1ms)
Total: 29ms · Bottleneck: CDN → ALB`}</PasteBlock>
                    <HowToImage
                        file="ds-sd-09-scale.png"
                        alt="Scale Analysis view — four color-coded cards for 1x / 10x / 100x / Failure-at-scale with textareas"
                        caption="Scale Analysis — four scale levels with guided prompts"
                    />
                    <HowToImage
                        file="ds-sd-09-flows.png"
                        alt="Flow Simulation view with a saved flow card showing hops, total latency, and bottleneck"
                        caption="Flow Simulation — saved flows on top, builder for new flow below"
                    />
                </StepCard>

                <StepCard num="10" {...SUCCESS} title="Get Final Evaluation" sub="GPT-4o scored review across 10 dimensions">
                    <p className="text-xs text-text-secondary leading-relaxed mb-2">
                        Back in <strong>Scenarios</strong> view, once all are evaluated, click{' '}
                        <strong>Get Final Evaluation →</strong>. Auto-routes to the evaluation page with:
                    </p>
                    <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                        <li>Overall score (0–10) + readiness verdict</li>
                        <li>10 dimension bars (Requirements, Estimation, API, Data Model, Architecture, Deep Dive, Trade-offs, Resilience, Scale, Clarity)</li>
                        <li>Strengths / Critical Gaps / Improvements cards</li>
                        <li>Industry comparison, time analysis, next-step recommendations</li>
                    </ul>
                    <HowToImage
                        file="ds-sd-10-evaluation.png"
                        alt="Final evaluation page — overall score banner, ten dimension bars, strengths/gaps/improvements cards, industry comparison, time analysis, next steps"
                        caption="Final evaluation — scored dimensions, strengths, gaps, improvements, industry comparison"
                    />
                    <Callout type="success">
                        Expect overall 6.5–8.5 depending on depth. Session is marked <K>COMPLETED</K> and
                        becomes read-only. Re-open it anytime from the session list.
                    </Callout>
                </StepCard>
            </Section>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* DESIGN STUDIO — LOW-LEVEL DESIGN                               */}
            {/* ══════════════════════════════════════════════════════════════ */}
            <Section id="ds-lld">
                <SectionTitle icon="🔧">Design Studio — Low-Level Design</SectionTitle>
                <SectionDesc>
                    Example: <strong>Design a Parking Lot</strong>. Classic interview LLD — covers inheritance vs
                    composition, Strategy pattern, SRP, and OOP thinking.
                </SectionDesc>

                <StepCard num="0" {...BRAND} title="Create the session" sub="Same two entry points as System Design">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        <strong>From a problem:</strong> open an LLD problem from Problems → click <strong>🔧 Practice in Design Studio</strong>. Hub shows past attempts + <strong>Start Practice Session</strong>.
                    </p>
                    <p className="text-xs text-text-secondary leading-relaxed mt-2">
                        <strong>Freeform:</strong> sidebar <K>Design Studio</K> → <strong>+ New Session</strong> → <strong>🔧 Low-Level Design</strong>, title <K>Design Parking Lot</K>, difficulty <K>MEDIUM</K>.
                    </p>
                    <p className="text-xs text-text-secondary leading-relaxed mt-2">
                        Six phases instead of seven: Requirements → Entities → Hierarchy → Patterns → Methods → SOLID.
                    </p>
                    <HowToImage
                        file="ds-lld-00-create-session.png"
                        alt="Create-session screen with Low-Level Design type selected"
                        caption="Create-session screen with LLD selected — placeholder suggests classic LLD titles"
                    />
                </StepCard>

                <StepCard num="1" {...BRAND} title="Requirements 📋">
                    <PasteBlock>{`Functional:
- Multi-level parking lot with different spot sizes (compact, regular, large, motorcycle)
- Vehicle types: Car, Truck, Motorcycle — each needs matching spot
- Entry: issue ticket with entry time + assigned spot
- Exit: calculate fee based on duration + vehicle type
- Payment: cash or card (extensible to more types)
- Track free spots in real time; reject entry when full

Non-functional:
- Concurrent entries possible (multiple gates)
- Spot assignment must be thread-safe
- Fee calculation must be easy to change without touching core code`}</PasteBlock>
                </StepCard>

                <StepCard num="2" {...BRAND} title="Entities 📦" sub="Identify classes with single responsibilities">
                    <PasteBlock>{`ParkingLot — top-level, has Floors, handles entry/exit
Floor — has ParkingSpots
ParkingSpot (abstract) → CompactSpot, RegularSpot, LargeSpot, MotorcycleSpot
Vehicle (abstract) → Car, Truck, Motorcycle
Ticket — entryTime, spot, vehicle
PaymentStrategy (interface) → CashPayment, CardPayment
FeeStrategy (interface) → FlatRateFee, TieredByVehicleFee
SpotAssignmentStrategy (interface) → NearestFirst, FillByFloor

SRP check:
- ParkingLot orchestrates entry/exit; delegates pricing, assignment, payment
- Ticket is a pure data carrier (no logic)
- Each Strategy has exactly one responsibility`}</PasteBlock>
                </StepCard>

                <StepCard num="3" {...BRAND} title="Class Hierarchy 🗂️" sub="IS-A vs HAS-A decisions">
                    <PasteBlock>{`Vehicle (abstract):
  - licensePlate: String
  - type: VehicleType
  - getSpotSizeNeeded(): SpotSize   ← each subclass implements
Car → REGULAR, Truck → LARGE, Motorcycle → MOTORCYCLE

ParkingSpot (abstract):
  - id, size, isOccupied
  - canFit(Vehicle): boolean       ← template method
  - assign(Vehicle) / release()    ← synchronized

IS-A vs HAS-A:
- Car IS-A Vehicle (inheritance — shared behavior)
- ParkingLot HAS-A list of Floor (composition — lot isn't a floor)
- Floor HAS-A list of ParkingSpot

Avoided: making ParkingLot extend Floor.`}</PasteBlock>
                </StepCard>

                <StepCard num="4" {...BRAND} title="Design Patterns 🧩" sub="Which patterns, structurally justified">
                    <PasteBlock>{`Strategy (3 uses):
- FeeStrategy → swap pricing rules without changing ParkingLot
- PaymentStrategy → swap payment method
- SpotAssignmentStrategy → swap spot-finding algorithm
Why Strategy: pluggable algorithms with a common interface.

Factory:
- VehicleFactory.fromScanInput(scanData) → Car / Truck / Motorcycle
- Centralizes instantiation logic, keeps entry() clean

Observer:
- DisplayBoard observes ParkingLot for free-spot-count changes
- Decouples display from core logic

Singleton:
- ParkingLot itself — only one per app
- Prefer dependency injection over static getInstance() for testability`}</PasteBlock>
                </StepCard>

                <StepCard num="5" {...BRAND} title="Method Signatures 💻" sub="Core operations, method-level">
                    <PasteBlock>{`class ParkingLot {
    private final List<Floor> floors;
    private final SpotAssignmentStrategy assignStrategy;
    private final FeeStrategy feeStrategy;

    public synchronized Ticket enter(Vehicle v) throws LotFullException {
        ParkingSpot spot = assignStrategy.findSpot(floors, v);
        if (spot == null) throw new LotFullException();
        spot.assign(v);
        return new Ticket(v, spot, Instant.now());
    }

    public Receipt exit(Ticket t, PaymentStrategy payment) {
        Duration stay = Duration.between(t.entryTime, Instant.now());
        Money fee = feeStrategy.calculate(t.vehicle, stay);
        payment.charge(fee);
        t.spot.release();
        return new Receipt(t, fee, payment.method());
    }
}`}</PasteBlock>
                </StepCard>

                <StepCard num="6" {...BRAND} title="SOLID Analysis 🏛️" sub="Per-principle, honest about violations">
                    <PasteBlock>{`S — Single Responsibility
✅ ParkingLot orchestrates. Strategies handle one concern each. Ticket is pure data.

O — Open/Closed
✅ New vehicle type: subclass Vehicle, override getSpotSizeNeeded(). No change to ParkingLot.
✅ New pricing: implement FeeStrategy, inject. No change to exit().

L — Liskov Substitution
✅ Any Vehicle subclass works wherever Vehicle is expected.
⚠️ Motorcycle can fit a RegularSpot — intentional relaxation, documented.

I — Interface Segregation
✅ FeeStrategy, PaymentStrategy, SpotAssignmentStrategy are small (1 method each).

D — Dependency Inversion
✅ ParkingLot depends on FeeStrategy interface, not concrete class.
✅ Makes unit testing trivial: inject MockFeeStrategy.

Honest violation I admit:
- ParkingLot.enter() uses method-level synchronized — pessimistic.
  Better: CAS on individual spots. Acceptable V1, documented.`}</PasteBlock>
                </StepCard>

                <StepCard num="7" {...BRAND} title="Components + Data Flow" sub="Bottom panel, same as SD">
                    <PasteBlock label="🧩 Component Annotations">{`ParkingLot — Orchestrator (Java class)
FeeStrategy — Pricing abstraction (interface + impls)
SpotAssignmentStrategy — Finds free spot (interface + impls)
DisplayBoard — Shows free count, observes ParkingLot`}</PasteBlock>
                    <PasteBlock label="🔀 Data Flow">{`Entry: Scanner → VehicleFactory.fromScanInput() → ParkingLot.enter(vehicle)
  → SpotAssignmentStrategy.findSpot() → ParkingSpot.assign() → Ticket returned
  → DisplayBoard observer updated

Exit: Scanner reads ticket → ParkingLot.exit(ticket, payment)
  → FeeStrategy.calculate() → payment.charge() → spot.release() → Receipt returned`}</PasteBlock>
                </StepCard>

                <StepCard num="8" {...SUCCESS} title="Validate + Final Evaluation" sub="Scenarios probe OOP concerns">
                    <p className="text-xs text-text-secondary leading-relaxed mb-2">
                        <strong>Validate Design →</strong> will generate scenarios like: &ldquo;What if two entries happen at the
                        same instant for the last spot?&rdquo;, &ldquo;Add a new EV vehicle type that needs charging —
                        does the design break?&rdquo;, &ldquo;What if payment fails after the spot is released?&rdquo;
                    </p>
                    <p className="text-xs text-text-secondary leading-relaxed">
                        Answer each by tracing through your classes. Then <strong>Get Final Evaluation</strong> —
                        LLD evaluation scores different dimensions: entityIdentification, hierarchyCorrectness,
                        patternApplication, solidCompliance, implementationQuality, extensibilityScore, edgeCaseAwareness.
                    </p>
                    <HowToImage
                        file="ds-lld-08-evaluation.png"
                        alt="LLD final evaluation page with OOP-specific dimensions (Entities, Hierarchy, Patterns, SOLID, Implementation, Extensibility, Edge Cases)"
                        caption="LLD evaluation — note the OOP-specific dimension labels"
                    />
                </StepCard>

                <Callout type="info">
                    <strong>Tip for both tracks:</strong> don&apos;t skip the Data Flow panel — the AI can&apos;t see
                    your Excalidraw. Without it, scenario and evaluation quality drops a lot.
                </Callout>
            </Section>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* SOLVE A PROBLEM                                                */}
            {/* ══════════════════════════════════════════════════════════════ */}
            <Section id="solve">
                <SectionTitle icon="📝">Solve a Problem</SectionTitle>
                <SectionDesc>
                    Example: solving a CODING problem end-to-end. The flow is similar for BEHAVIORAL,
                    CS_FUNDAMENTALS, HR, and SQL — the workspace adapts per category.
                </SectionDesc>

                <Callout type="info">
                    <strong>System Design and Low-Level Design:</strong> these categories route to Design Studio
                    instead of the Submit Solution workspace. On any SD or LLD problem the primary CTA is{' '}
                    <strong>🏗️/🔧 Practice in Design Studio</strong> — see the Design Studio sections above for the full flow.
                </Callout>

                <StepCard num="1" {...BRAND} title="Find a problem" sub="Sidebar → Problems">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        Filter by category, difficulty, or pattern. Click any row to open the problem detail page.
                        You&apos;ll see the problem statement, follow-up questions, and (if admin added them) real-world
                        context + use cases.
                    </p>
                    <HowToImage
                        file="solve-01-list.png"
                        alt="Problems list page with filter chips for category/difficulty/pattern and problem rows"
                        caption="Problems list with filters applied"
                    />
                </StepCard>

                <StepCard num="2" {...BRAND} title="Click Submit Solution" sub="Problem detail → Submit Solution button">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        You land on a per-category workspace. For CODING you&apos;ll see a code editor + structured
                        sections (Approach, Brute Force, Optimized Approach, Key Insight, Feynman Explanation,
                        Real-World Connection).
                    </p>
                </StepCard>

                <StepCard num="3" {...BRAND} title="Fill in your solve context" sub="Pattern, confidence, solve method, time">
                    <p className="text-xs text-text-secondary leading-relaxed mb-2">
                        Above the workspace are four meta fields that heavily affect AI scoring:
                    </p>
                    <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                        <li><strong>Pattern(s):</strong> what algorithm/approach did you use? (Two Pointers, Sliding Window, DP, …) Select multiple if mixed.</li>
                        <li><strong>Confidence (1–5):</strong> how clearly do you understand this? 1 = forgot, 5 = crystal clear.</li>
                        <li><strong>Solve Method:</strong> <K>COLD</K> / <K>HINTS</K> / <K>SAW_APPROACH</K>. Be honest — AI uses this to calibrate confidence.</li>
                        <li><strong>Time Taken:</strong> Under 15 min / 15–30 / 30–60 / 1–2h / 2h+.</li>
                    </ul>
                </StepCard>

                <StepCard num="4" {...BRAND} title="Write your solution" sub="Code + structured explanation">
                    <HowToImage
                        file="solve-04-workspace.png"
                        alt="Submission workspace with Monaco code editor on one side and structured explanation fields (Approach, Brute Force, Optimized, Key Insight, Feynman Explanation, Real-World Connection) on the other"
                        caption="CODING submission workspace — code editor + structured explanation fields"
                    />
                    <p className="text-xs text-text-secondary leading-relaxed mb-2">
                        Fill the workspace. For CODING:
                    </p>
                    <PasteBlock>{`Approach: 2-3 sentence plan
Brute Force: what the naive solution is + complexity
Code: actual implementation (pick language in editor header)
Optimized Approach: key optimization + why
Key Insight: the "aha moment" — one sentence
Feynman Explanation: explain it to a beginner (2-3 sentences)
Real-World Connection: where this pattern shows up in production`}</PasteBlock>
                    <Callout type="warning">
                        Partial submissions get capped scores. Incomplete code, pseudocode, or missing
                        Feynman explanation triggers specific flags in AI review.
                    </Callout>
                </StepCard>

                <StepCard num="5" {...BRAND} title="Answer follow-ups (optional, bonus points)">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        Each problem has 3 follow-ups (EASY → MEDIUM → HARD) with hints. Answer as many
                        as you can. These are scored separately as a bonus — empty follow-ups won&apos;t hurt,
                        but strong answers lift your overall score.
                    </p>
                </StepCard>

                <StepCard num="6" {...SUCCESS} title="Submit → AI review" sub="~5–15s for GPT to review">
                    <p className="text-xs text-text-secondary leading-relaxed mb-2">
                        You&apos;ll get a review across 5 dimensions:
                    </p>
                    <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                        <li>Code Correctness (35%)</li>
                        <li>Pattern Accuracy (20%)</li>
                        <li>Understanding Depth (20%)</li>
                        <li>Explanation Quality (15%)</li>
                        <li>Confidence Calibration (10%)</li>
                    </ul>
                    <p className="text-xs text-text-secondary leading-relaxed mt-2">
                        Plus strengths, gaps, improvement advice, complexity check, interview tip,
                        and a readiness verdict. The solution gets a spaced-repetition review date
                        (SM-2 algorithm) based on your confidence rating.
                    </p>
                    <HowToImage
                        file="solve-06-review.png"
                        alt="Solution review page with five dimension scores, strengths, gaps, improvement, complexity check, interview tip"
                        caption="AI review result — five dimensions, next review date from SM-2"
                    />
                </StepCard>

                <StepCard num="7" {...INFO} title="Find it later" sub="Review Queue + Profile → Solutions">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        Your solution will resurface in <strong>Review Queue</strong> when SM-2 decides it&apos;s time
                        (could be tomorrow, 3 days, or 2 weeks depending on confidence). Rate your next
                        attempt and the interval adjusts automatically.
                    </p>
                </StepCard>
            </Section>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* EDIT YOUR SOLUTION                                             */}
            {/* ══════════════════════════════════════════════════════════════ */}
            <Section id="edit-solution">
                <SectionTitle icon="✏️">Edit Your Solution</SectionTitle>
                <SectionDesc>
                    Revise a solution after review — re-run AI scoring with a cleaner attempt.
                </SectionDesc>

                <StepCard num="1" {...BRAND} title="Find your solution" sub="Profile → Solutions tab, or Review Queue">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        Each row shows the problem title, overall score, pattern, last-reviewed date,
                        and next SM-2 review date. Click <strong>Edit</strong> on the row (or open it from the problem page).
                    </p>
                </StepCard>

                <StepCard num="2" {...BRAND} title="Update your content" sub="Same workspace, pre-filled with your previous answer">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        All fields load with your last submission. Edit the parts you want to improve —
                        typically the approach, code optimizations, or Feynman explanation after you&apos;ve
                        learned more. Update <strong>Confidence</strong> to reflect your current understanding.
                    </p>
                </StepCard>

                <StepCard num="3" {...SUCCESS} title="Re-submit → new AI review" sub="New scores overwrite the old">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        Scores, dimension breakdown, strengths, gaps — all replaced. Pattern baseline
                        tracking stays intact: the AI compares this attempt to your historical average
                        on this pattern and calls out improvement or regression explicitly in the review.
                    </p>
                    <Callout type="info">
                        SM-2 resets: the next review date is recomputed based on the new confidence rating.
                    </Callout>
                </StepCard>
            </Section>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* ADD PROBLEM — AI GENERATION                                    */}
            {/* ══════════════════════════════════════════════════════════════ */}
            <Section id="add-problem-ai">
                <SectionTitle icon="🤖">Add Problem (AI Generation)</SectionTitle>
                <SectionDesc>
                    <strong>Admin only.</strong> Fastest way to populate your team&apos;s problem bank —
                    AI generates 1–5 problems at a time with full teaching notes.
                </SectionDesc>

                <Callout type="info">
                    Accessible at <K>/admin/add-problem</K> or via sidebar → Admin → Add Problem.
                    Requires <K>TEAM_ADMIN</K> or <K>SUPER_ADMIN</K> role.
                </Callout>

                <StepCard num="1" {...BRAND} title="Pick AI Generation tab" sub="Default tab on the Add Problem page">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        You&apos;ll see a setup form and a live preview panel. Fill the setup, click Generate,
                        then approve or reject each generated problem individually.
                    </p>
                </StepCard>

                <StepCard num="2" {...BRAND} title="Category — pick one of seven">
                    <PasteBlock>{`CODING               — LeetCode-style algorithm problems
SYSTEM_DESIGN        — Distributed system design questions
LOW_LEVEL_DESIGN     — OOP / class design problems
BEHAVIORAL           — STAR story prompts
CS_FUNDAMENTALS      — Concept explanation (OS, networking, DB internals, …)
HR                   — Company-fit questions
SQL                  — Query or schema-design problems`}</PasteBlock>
                    <p className="text-xs text-text-secondary leading-relaxed">
                        The AI uses different prompts per category. CODING + SQL try to generate real LeetCode
                        URLs; all others are self-contained.
                    </p>
                </StepCard>

                <StepCard num="3" {...BRAND} title="Count + difficulty + team context">
                    <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                        <li><strong>Count:</strong> 1–5 problems per batch (hard cap — Railway timeout).</li>
                        <li><strong>Difficulty:</strong> <K>auto</K> (AI picks based on team context) or <K>custom: 2 EASY, 2 MEDIUM, 1 HARD</K>.</li>
                        <li><strong>Target Company</strong> (optional): tailors problem selection to that company&apos;s style (e.g. Goldman Sachs HR, Meta algorithmic).</li>
                        <li><strong>Focus Areas</strong> (optional): &ldquo;Graph traversal + DP&rdquo; narrows the AI&apos;s pick.</li>
                    </ul>
                </StepCard>

                <StepCard num="4" {...BRAND} title="Generate → Preview" sub="~10–30s depending on count">
                    <HowToImage
                        file="add-ai-04-preview.png"
                        alt="AI-generated problem preview cards with Approve/Reject buttons and expandable teaching notes"
                        caption="Generated problem previews — approve or reject individually"
                    />
                    <p className="text-xs text-text-secondary leading-relaxed mb-2">
                        Each generated problem appears as a card with:
                    </p>
                    <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                        <li>Title + difficulty + source (LeetCode link if confident, otherwise OTHER)</li>
                        <li>Description + tags + company tags</li>
                        <li>Real-world context + 5–6 use cases (except HR — empty for HR)</li>
                        <li>Admin teaching notes (numbered approaches, edge cases, interview tip)</li>
                        <li>3 follow-up questions (EASY → MEDIUM → HARD) with hints</li>
                    </ul>
                </StepCard>

                <StepCard num="5" {...SUCCESS} title="Approve or Reject each one" sub="Granular control — cherry-pick the good ones">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        Expand a card to review the admin notes and follow-ups in full. Click{' '}
                        <strong>Approve</strong> to publish it to your team, or <strong>Reject</strong> to
                        discard. Approved problems appear in your team&apos;s problem list immediately.
                    </p>
                    <Callout type="warning">
                        Check LeetCode URLs before approving — the AI reports <K>urlConfidence</K> per problem.
                        Low-confidence URLs should be verified manually (open in a new tab) or stripped.
                    </Callout>
                </StepCard>
            </Section>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* ADD PROBLEM — MANUAL                                           */}
            {/* ══════════════════════════════════════════════════════════════ */}
            <Section id="add-problem-manual">
                <SectionTitle icon="✍️">Add Problem (Manual)</SectionTitle>
                <SectionDesc>
                    For problems the AI wouldn&apos;t generate well — company-specific variants, in-house
                    puzzles, niche edge-case challenges.
                </SectionDesc>

                <StepCard num="1" {...BRAND} title="Switch to Manual tab" sub="Add Problem page → Manual Entry">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        A full ProblemForm appears with every field editable. Fields are grouped by section:
                        Basics, Source, Content, Admin Notes, Follow-ups.
                    </p>
                </StepCard>

                <StepCard num="2" {...BRAND} title="Fill the required fields">
                    <PasteBlock>{`Title:       "Find Longest Consecutive Run"
Category:    CODING
Difficulty:  MEDIUM
Source:      LEETCODE (or OTHER / INTERNAL)
Source URL:  https://leetcode.com/problems/longest-consecutive-sequence/
Tags:        ["array", "hashmap"]
Company Tags: ["Google", "Amazon"]`}</PasteBlock>
                </StepCard>

                <StepCard num="3" {...BRAND} title="Description + teaching notes" sub="Markdown supported">
                    <p className="text-xs text-text-secondary leading-relaxed mb-2">
                        <strong>Description:</strong> full problem statement with input/output format,
                        constraints, and 2 worked examples.
                    </p>
                    <p className="text-xs text-text-secondary leading-relaxed mb-2">
                        <strong>Admin Notes:</strong> teaching guide — brute force approach with complexity,
                        optimal approach + key insight, top 3 mistakes, how to explain in interviews.
                    </p>
                    <p className="text-xs text-text-secondary leading-relaxed">
                        <strong>Real-world context + use cases:</strong> where does this pattern show up?
                        Skip for HR / BEHAVIORAL (not applicable).
                    </p>
                </StepCard>

                <StepCard num="4" {...BRAND} title="Follow-up questions" sub="3 required: EASY, MEDIUM, HARD">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        Each follow-up probes deeper understanding. Include a hint that nudges without
                        giving the answer.
                    </p>
                    <PasteBlock>{`EASY:   "What's the time complexity of your approach?"
        hint: Count the operations per element.
MEDIUM: "How would you parallelize this across N workers?"
        hint: Think about data partitioning and result merging.
HARD:   "What changes if inputs can contain up to 10^18?"
        hint: Standard integer types won't cut it.`}</PasteBlock>
                </StepCard>

                <StepCard num="5" {...SUCCESS} title="Submit → live in team" sub="No approval step needed for manual entries">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        Once created, problems appear in your team&apos;s problem list. You can edit them
                        later via the admin problem list → <strong>Edit</strong>.
                    </p>
                </StepCard>
            </Section>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* QUIZ                                                           */}
            {/* ══════════════════════════════════════════════════════════════ */}
            <Section id="quiz">
                <SectionTitle icon="🎯">Attempt a Quiz</SectionTitle>
                <SectionDesc>
                    AI-generated multiple choice on any subject. 5–30 questions per quiz. Great for a
                    10-minute refresher on a specific topic.
                </SectionDesc>

                <StepCard num="1" {...BRAND} title="Go to Quizzes" sub="Sidebar → Quizzes">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        Setup screen on the left, past quizzes on the right. Retry any past quiz with the
                        same subject in one click, or start fresh.
                    </p>
                </StepCard>

                <StepCard num="2" {...BRAND} title="Configure the quiz">
                    <PasteBlock>{`Subject:     "TCP vs UDP — handshake, delivery guarantees, when to use which"
Difficulty:  MEDIUM
Count:       10 questions
Context:     "I'm preparing for an L5 systems interview at a FAANG."
             (optional — sharpens the question style)`}</PasteBlock>
                    <Callout type="info">
                        Be specific in the subject. <em>&ldquo;Networking&rdquo;</em> gets generic questions.{' '}
                        <em>&ldquo;TCP congestion control — slow start, fast retransmit, CUBIC vs BBR&rdquo;</em>{' '}
                        gets laser-focused ones.
                    </Callout>
                </StepCard>

                <StepCard num="3" {...BRAND} title="Click Generate Quiz" sub="~5–15s to generate">
                    <HowToImage
                        file="quiz-02-setup.png"
                        alt="Quiz setup screen — subject input, difficulty buttons, question count slider, optional context field"
                        caption="Quiz setup — subject, difficulty, count, optional context"
                    />
                    <p className="text-xs text-text-secondary leading-relaxed">
                        Each question has 4 options, all plausible (wrong ones are common misconceptions,
                        not obviously wrong). Code snippets render in syntax-highlighted blocks; math uses
                        Big-O notation.
                    </p>
                    <HowToImage
                        file="quiz-04-question.png"
                        alt="Quiz question card with code block, four options, timer, and scratchpad side panel"
                        caption="Quiz question view — timer + scratchpad for working through code problems"
                    />
                </StepCard>

                <StepCard num="4" {...BRAND} title="Take the quiz" sub="Timer runs, scratchpad available">
                    <p className="text-xs text-text-secondary leading-relaxed mb-2">
                        Select one option per question. Use the scratchpad on the right for working out
                        the answer. Timer counts up — no hard time limit, but your completion time is
                        shown in the result.
                    </p>
                </StepCard>

                <StepCard num="5" {...SUCCESS} title="Submit → score + AI analysis">
                    <p className="text-xs text-text-secondary leading-relaxed mb-2">
                        You&apos;ll see per-question explanations (why the correct answer is right AND why
                        each wrong option is wrong). Plus an overall analysis:
                    </p>
                    <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                        <li>Performance summary (1–2 sentences)</li>
                        <li>Weak topics pulled from your wrong answers</li>
                        <li>2–3 study recommendations</li>
                        <li>Encouragement line</li>
                    </ul>
                    <HowToImage
                        file="quiz-05-results.png"
                        alt="Quiz results page with score, per-question review with explanations for each option, weak topics, study recommendations"
                        caption="Quiz results — score + per-question explanations + AI analysis"
                    />
                </StepCard>

                <StepCard num="6" {...INFO} title="Flag bad questions" sub="Improves future generations">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        If a question was ambiguous, outdated, or had a bad distractor, flag it. The next
                        time you generate a quiz on a similar subject, the AI avoids that pattern.
                    </p>
                </StepCard>
            </Section>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* MOCK INTERVIEW                                                 */}
            {/* ══════════════════════════════════════════════════════════════ */}
            <Section id="mock">
                <SectionTitle icon="🎙️">Mock Interview</SectionTitle>
                <SectionDesc>
                    Live conversational AI interviewer over WebSocket. Text or voice mode. Phases match
                    real interviews — intro, problem probe, solution walkthrough, follow-ups, debrief.
                </SectionDesc>

                <StepCard num="1" {...BRAND} title="Go to Mock Interview" sub="Sidebar → Mock Interview">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        Setup screen asks for interview style, type, and mode. Takes ~30s to configure,
                        then the interview starts in real time.
                    </p>
                    <HowToImage
                        file="mock-02-setup.png"
                        alt="Mock interview setup screen with style cards, interview type tiles, target company field, mode selector (text/voice)"
                        caption="Mock interview setup — style + type + target company + mode"
                    />
                </StepCard>

                <StepCard num="2" {...BRAND} title="Pick an interview style">
                    <PasteBlock>{`"Tell me about yourself" opener + technical deep-dive   — standard interview
Rapid-fire drill — 8 quick probes at different depths  — stress test
Single deep-dive — one problem, 45 minutes             — simulation of real round`}</PasteBlock>
                </StepCard>

                <StepCard num="3" {...BRAND} title="Pick a type + target company">
                    <p className="text-xs text-text-secondary leading-relaxed mb-2">
                        <strong>Type:</strong> <K>CODING</K>, <K>SYSTEM_DESIGN</K>, <K>BEHAVIORAL</K>, or <K>HR</K>.
                    </p>
                    <p className="text-xs text-text-secondary leading-relaxed">
                        <strong>Target Company</strong> (optional): &ldquo;Google&rdquo;, &ldquo;Goldman Sachs&rdquo;,
                        &ldquo;my startup&rdquo;. Shapes the interviewer&apos;s tone and the problems they probe.
                    </p>
                </StepCard>

                <StepCard num="4" {...BRAND} title="Pick mode — text or voice">
                    <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                        <li><strong>Text mode:</strong> type responses, interviewer replies in a chat thread. Everything logged.</li>
                        <li><strong>Voice mode:</strong> speak into mic → speech-to-text → AI responds via TTS. Closest to a real phone screen. Needs browser mic permission.</li>
                    </ul>
                </StepCard>

                <StepCard num="5" {...SUCCESS} title="Run the interview" sub="Live conversation, AI adapts to your answers">
                    <p className="text-xs text-text-secondary leading-relaxed mb-2">
                        The AI interviewer:
                    </p>
                    <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                        <li>Opens with an intro appropriate to the style + company</li>
                        <li>Walks you through phases (problem statement → clarifying questions → solution → follow-ups)</li>
                        <li>Probes weak spots based on your answers</li>
                        <li>Offers hints if you&apos;re stuck (ask explicitly: &ldquo;Can I have a hint?&rdquo;)</li>
                        <li>Ends with a debrief — what went well, what to improve</li>
                    </ul>
                    <HowToImage
                        file="mock-05-chat.png"
                        alt="Mock interview chat view with interviewer messages on left, candidate responses on right, phase indicator, and mode toggle"
                        caption="Live interview — WebSocket-driven chat with phase indicator"
                    />
                </StepCard>

                <StepCard num="6" {...INFO} title="Review the transcript later" sub="Sidebar → Interview History">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        All sessions are saved. Re-read the full transcript, review the debrief, or start
                        a new session on the same type to compare.
                    </p>
                </StepCard>
            </Section>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* FEEDBACK & ISSUES                                              */}
            {/* ══════════════════════════════════════════════════════════════ */}
            <Section id="feedback">
                <SectionTitle icon="💬">Feedback & Issues</SectionTitle>
                <SectionDesc>
                    Report bugs, request features, or flag problems. Super admins triage from a shared inbox.
                </SectionDesc>

                <StepCard num="1" {...BRAND} title="Go to Feedback" sub="Sidebar → Feedback">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        Two tabs: <strong>Submit</strong> (file a new report) and <strong>All Reports</strong>{' '}
                        (browse your and others&apos; reports, filter by status/type).
                    </p>
                    <HowToImage
                        file="feedback-01-form.png"
                        alt="Feedback form with type picker, severity selector, title + description inputs, similar-reports panel above"
                        caption="Feedback form — type, severity, title, description, optional page URL"
                    />
                </StepCard>

                <StepCard num="2" {...BRAND} title="Pick a type">
                    <PasteBlock>{`🐛 BUG         — something broken (wrong output, crash, data loss)
💡 FEATURE     — a missing capability
⚡ IMPROVEMENT — existing thing works but could be better
❓ QUESTION    — clarification about how something works
📝 CONTENT     — a specific problem / quiz / prompt has an issue`}</PasteBlock>
                </StepCard>

                <StepCard num="3" {...BRAND} title="Fill in the report">
                    <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                        <li><strong>Title:</strong> one-line summary. <em>&ldquo;Final eval not rendering in LLD sessions&rdquo;</em> &gt; <em>&ldquo;Bug&rdquo;</em>.</li>
                        <li><strong>Severity:</strong> LOW / MEDIUM / HIGH / CRITICAL. Blocks your workflow? HIGH. Data loss? CRITICAL.</li>
                        <li><strong>Description:</strong> what happened, what you expected, reproduction steps. Paste console errors if relevant.</li>
                        <li><strong>Page URL</strong> (optional): the exact page where it happened — e.g. <K>/design-studio</K>.</li>
                    </ul>
                </StepCard>

                <StepCard num="4" {...INFO} title="Check similar reports" sub="Auto-surfaced above the form">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        If someone already filed a similar report, you&apos;ll see it in the &ldquo;Similar reports&rdquo;
                        panel. Check if yours is a duplicate before submitting — if it is, upvote the existing
                        one instead. If different, submit anyway.
                    </p>
                </StepCard>

                <StepCard num="5" {...SUCCESS} title="Submit → tracked to resolution">
                    <p className="text-xs text-text-secondary leading-relaxed">
                        Status pipeline: <K>OPEN</K> → <K>IN_PROGRESS</K> → <K>RESOLVED</K> / <K>WONT_FIX</K> /{' '}
                        <K>DUPLICATE</K>. Super admins update status from the inbox. You can follow your report
                        on the <strong>All Reports</strong> tab filtered by your reports.
                    </p>
                </StepCard>

                <Callout type="info">
                    <strong>Good bug reports get fixed faster.</strong> Include: exact steps to reproduce, expected vs actual,
                    browser + OS, screenshot or console log if visual. Low-context reports usually bounce back with
                    &ldquo;please add steps.&rdquo;
                </Callout>
            </Section>

            {/* Footer */}
            <div className="mt-16 mb-8 text-center text-xs text-text-disabled space-y-1">
                <div>
                    Found something unclear? File a Content-type report from the Feedback page —
                    this guide gets updated when patterns emerge.
                </div>
                <div>
                    Want to contribute a screenshot? Drop a PNG into{' '}
                    <code className="bg-surface-3 border border-border-default rounded px-1.5 py-0.5
                                     text-[10px] font-mono text-brand-fg-soft">
                        client/public/docs/how-to/
                    </code>{' '}
                    matching the filename shown in any placeholder above.
                </div>
            </div>
        </DocsLayout>
    )
}
