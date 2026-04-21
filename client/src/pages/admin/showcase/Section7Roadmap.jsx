import { Section, SectionBadge, SectionTitle, SectionDesc, TimelinePhase } from './components'

const TIMELINE = [
    {
        phase: 'Delivered',
        title: 'Complete Interview Intelligence Platform',
        color: 'border-success',
        dotColor: 'bg-success',
        badge: { text: 'LIVE', color: 'bg-success/12 text-success border-success/25' },
        items: [
            '6-category problem system (Coding, System Design, Behavioral, CS Fundamentals, HR, SQL) with category-specific submission forms',
            'AI Mock Interviewer — GPT-4o with WebSocket streaming, 8 interview culture styles, function calling, phase management, and structured debrief',
            'RAG-enhanced AI Solution Review — pgvector cosine similarity finds teammate solutions + admin notes for comparative feedback',
            'AI Quiz Generation — type any subject, any difficulty → instant MCQ with post-quiz AI analysis of weak areas',
            'Smart Recommendations — 5 strategies: company-targeted, pattern gaps, low confidence, vector similarity, category balance',
            'Spaced repetition review queue with confidence-based adaptive rescheduling',
            '6D Intelligence Report with radar chart, action items, strengths/weaknesses, and AI weekly coaching plans',
            'Email verification on registration, self-service password reset, admin password management, secure email change — all via Resend',
            'Separate admin/member experiences — different dashboards, sidebars, and feature access based on role',
            'AI Product Health Analytics — comprehensive platform metrics analyzed by AI with insights, trends, risks, and recommendations',
            'Interview session history with full transcript replay, debrief review, and score tracking across sessions',
            'pgvector embeddings (1536-dim) on solutions and problems with IVFFlat indexing for semantic search',
            'Leaderboard with podium, member profiles, peer clarity ratings, command palette (⌘K)',
            'Deployed on Railway — PostgreSQL + pgvector, Docker containers, auto-deploy on git push',
        ],
    },
    {
        phase: 'Next',
        title: 'Enhanced Interview & Learning Experience',
        color: 'border-brand-400',
        dotColor: 'bg-brand-400',
        badge: { text: 'NEXT', color: 'bg-brand-400/12 text-brand-300 border-brand-400/25' },
        items: [
            'Excalidraw whiteboard integration — real-time diagramming canvas for system design interviews',
            'Light mode polish — verify all components across dark and light themes',
            'Google + GitHub OAuth social login for frictionless onboarding',
            'Voice-based mock interviews — Whisper speech-to-text + TTS for spoken conversation',
            'LangGraph Interview Readiness Agent — multi-step "Am I ready for my interview?" assessment',
            'Email notifications — review reminders, new problems, weekly digest via Resend',
        ],
    },
    {
        phase: 'Future',
        title: 'Advanced Intelligence & Scale',
        color: 'border-warning',
        dotColor: 'bg-warning',
        badge: { text: 'PLANNED', color: 'bg-warning/12 text-warning border-warning/25' },
        items: [
            'Fine-tuned solution scoring model — instant quality assessment without GPT API calls',
            'Cross-category learning connections — "this hash map pattern also appears in System Design (caching) and DBMS (indexes)"',
            'Interview pipeline tracker — track real applications: company, stage, date, outcome, conversion funnel',
            'Team-wide analytics dashboard for engineering managers with per-member progress cards',
            'Mobile app (React Native) for reviews and quizzes on the go',
            'Adaptive quiz difficulty — AI adjusts question difficulty based on real-time performance',
        ],
    },
]

export default function Section7Roadmap() {
    return (
        <Section id="roadmap" className="py-20 px-8">
            <div className="max-w-[1000px] mx-auto">
                <SectionBadge label="Product Roadmap" color="brand" />

                <SectionTitle
                    line1="Where we are and"
                    line2="where we're going."
                    gradient="from-brand-300 to-success"
                />

                <SectionDesc>
                    ProbSolver is architecturally designed for continuous evolution.
                    The foundation supports every planned feature — no rewrites needed.
                    What you see in "Delivered" is live in production right now.
                </SectionDesc>

                <div className="space-y-4">
                    {TIMELINE.map((phase, i) => (
                        <TimelinePhase key={phase.phase} phase={phase} index={i} />
                    ))}
                </div>
            </div>
        </Section>
    )
}