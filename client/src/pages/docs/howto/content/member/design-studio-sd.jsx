// client/src/pages/docs/howto/content/member/design-studio-sd.jsx
//
// Ripped verbatim from HowToPage.jsx #ds-sd section.
import {
    SummaryBlock, PrereqList, StepCard, HowToImage, Callout, PasteBlock, K,
    BRAND, SUCCESS, WARN, INFO,
} from '../../components'

export default function DesignStudioSdGuide() {
    return (
        <>
            <SummaryBlock>
                End-to-end walkthrough for a System Design session in Design Studio. Example: designing a URL
                shortener — covers scale, cache, DB choice, consistency, and failure modes in ~30–40 min.
            </SummaryBlock>

            <PrereqList items={[
                'You are enrolled on a team (or on your personal auto-team).',
                'A SYSTEM_DESIGN problem in your team’s problem bank if you want the coached entry path.',
            ]} />

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
                    <strong>Workspace layout:</strong> two columns. <strong>Left</strong> is the Excalidraw canvas on top with a horizontal resize handle, phase-text editor below. <strong>Right rail (pinned, ~360px)</strong>: AI Coach always visible at the top with <strong>Coach / History</strong> tabs, then collapsible <strong>🔀 Data Flow</strong> and <strong>🧩 Component Annotations</strong> panels. Seven phases are dots in the top bar: Requirements → Estimation → API → Data Model → Architecture → Deep Dive → Trade-offs.
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
                    file="ds-sd-01-rail-layout.png"
                    alt="Design workspace — phase dots top, canvas + textarea left column, AI Coach + Data Flow + Annotations rail on the right"
                    caption="Full workspace: phase dots (top), canvas + phase editor (left), pinned right rail with Coach + collapsible panels"
                />
                <Callout type="info">
                    In the right rail&apos;s <strong>Coach</strong> tab, click <strong>Am I on track?</strong> now. It should quote your text
                    back and name one missing thing (e.g. &ldquo;rate limiting&rdquo; or &ldquo;URL validation&rdquo;).
                    The response stays pinned until you ask again or dismiss it — no more scrolling away from the canvas to find feedback.
                </Callout>
                <HowToImage
                    file="ds-sd-01-coach-tab.png"
                    alt="AI Coach tab pinned in the right rail showing verdict pill, Strength and Gap sections"
                    caption="AI Coach response pinned in the right rail — verdict pill + Strength + Gap"
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
                    Draw on the <strong>Excalidraw canvas</strong> (left column, top): Client → CDN →
                    Load Balancer → API Server → Redis → Postgres, plus Kafka + Worker + ClickHouse for click events.
                </p>
                <HowToImage
                    file="ds-sd-05-canvas.png"
                    alt="Excalidraw canvas with URL shortener architecture: boxes for Client, CDN, LB, API, Redis, Postgres, Kafka, Worker, ClickHouse connected by arrows"
                    caption="Architecture drawn on the Excalidraw canvas"
                />
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    The AI <strong>can&apos;t see the diagram</strong>. Two panels in the <strong>right rail</strong>
                    (collapsed by default — click to expand) translate it into text for the AI. Both are critical:
                </p>
                <PasteBlock label="🧩 Component Annotations (right rail, expand)">{`LoadBalancer — HTTP routing, SSL termination (AWS ALB)
API Server — Shorten + redirect logic (Node.js, stateless)
Redis — Hot URL cache, rate limiting (Redis Cluster 7.x)
Postgres — Source of truth for url mappings (RDS Postgres 15)
Kafka — Async click event stream (MSK)
ClickWorker — Consumes click events → analytics (Node.js consumer)
ClickHouse — Analytics storage`}</PasteBlock>
                <HowToImage
                    file="ds-sd-05-rail-annotations.png"
                    alt="Right-rail Component Annotations panel expanded showing per-row component name, purpose, technology, notes"
                    caption="🧩 Component Annotations panel expanded in the right rail"
                />
                <PasteBlock label="🔀 Data Flow (right rail, expand)">{`Redirect (read path):
Client → CDN (5 min edge cache) → LB → API → Redis (90% hit) → redirect
  cache miss → API → Postgres → populate Redis → redirect
  every redirect → async ClickEvent → Kafka → Worker → ClickHouse

Shorten (write path):
Client → LB → API → validate → generate 7-char code (base62 of snowflake)
  → INSERT Postgres → populate Redis → return shortUrl`}</PasteBlock>
                <HowToImage
                    file="ds-sd-05-rail-data-flow.png"
                    alt="Right-rail Data Flow panel expanded with read-path and write-path traced through the components"
                    caption="🔀 Data Flow panel expanded in the right rail — AI uses this text, not the diagram"
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

            <StepCard num="7a" {...INFO} title="Use the Coach + History tabs" sub="Right-rail AI Coach, two tabs">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    The <strong>Coach</strong> tab is where you ask. Three buttons — <strong>Am I on track?</strong>,
                    <strong> I&apos;m stuck</strong>, <strong>Teach me…</strong> — plus a free-text follow-up.
                    Each response stays pinned until you ask again.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    The <strong>History</strong> tab shows every coaching response from this session (capped at 50,
                    persisted on the server). Filter to <K>Current phase</K> or <K>All phases</K>. Click
                    <strong> Show in Coach</strong> on a past response to pin it back into the Coach tab — useful for
                    comparing your earlier feedback against your current work without losing context.
                </p>
                <HowToImage
                    file="ds-sd-coach-history.png"
                    alt="Right-rail AI Coach with History tab active — list of past responses, phase filter, Show in Coach button per row"
                    caption="History tab — past responses with per-phase filter and Show in Coach pin-back"
                />
            </StepCard>

            <StepCard num="7b" {...INFO} title="Stuck Detector — proactive nudges" sub="The rail nudges you when you've been idle too long">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    After ~3 minutes of idle (no canvas edits, no textarea typing) on a phase with empty or thin
                    content, a <strong>Stuck Nudge</strong> card surfaces in the right rail. One click runs an
                    <strong> Ask for hint</strong> request shaped by the current phase&apos;s rubric — so the hint is
                    Architecture-flavoured on Architecture, Trade-offs-flavoured on Trade-offs.
                </p>
                <Callout type="info">
                    Dismiss the nudge to ignore it; the detector resets after activity. Designed to break thrash, not nag.
                </Callout>
                <HowToImage
                    file="ds-sd-stuck-nudge.png"
                    alt="Stuck Nudge card in the right rail with idle reason and Ask for hint button"
                    caption="Stuck Nudge — appears after idle, one-click hint shaped by phase rubric"
                />
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

            <StepCard num="11" {...INFO} title="🧭 Reference Architectures (post-eval)" sub="Compare your attempt to a curated worked example">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    After your final evaluation, a <strong>🧭 Reference</strong> button appears in the top bar.
                    Opens a side-by-side <strong>ReferenceCompareView</strong>: your attempt on the left, a curated
                    reference on the right, with a <strong>key-term diff</strong> highlighting concepts you used,
                    missed, or used differently.
                </p>
                <Callout type="info">
                    <strong>Why post-eval, not before?</strong> Worked examples accelerate learning <em>after</em> retrieval —
                    peeking before you&apos;ve attempted short-circuits the practice (Sweller, Karpicke). The gate
                    is intentional.
                </Callout>
                <HowToImage
                    file="ds-sd-reference-compare.png"
                    alt="Reference compare side-by-side view with user attempt left, curated reference right, key-term diff highlights"
                    caption="Reference Compare — side-by-side with key-term diff, gated until after final evaluation"
                />
            </StepCard>

            <StepCard num="12" {...WARN} title="🎤 Practice as Interview" sub="Same canvas, AI plays interviewer, can read your diagram">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    The <strong>🎤 Practice as Interview</strong> button (top bar) pairs the design workspace
                    with an AI interviewer. Same canvas, same phases, but now the AI drives the conversation,
                    probes weak spots, and can <strong>read your live diagram via tool calls</strong> — the
                    canvas-aware path that text-only Mock Interview can&apos;t do.
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li>Best run after one self-paced pass — it&apos;s a stress test, not a tutorial.</li>
                    <li>SD/LLD Mock Interviews now route here automatically; the chat-only path is gone.</li>
                    <li>Setup modal lets you pick interview style + target company, same as Mock Interview.</li>
                </ul>
                <HowToImage
                    file="ds-sd-interview-mode.png"
                    alt="Design Studio Interview mode with chat panel beside the canvas and a phase-stage indicator"
                    caption="Practice as Interview — AI interviewer runs alongside the same canvas + phase rail"
                />
            </StepCard>
        </>
    )
}
