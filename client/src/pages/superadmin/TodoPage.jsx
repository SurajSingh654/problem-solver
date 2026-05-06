// ============================================================================
// ProbSolver v3.0 — Product Roadmap (SUPER_ADMIN)
// ============================================================================
//
// Two views:
//   Roadmap View — visual timeline for communication and vision sharing
//   Detail View  — full technical depth for planning and development
//
// Data structure:
//   phase: 'NOW' | 'NEXT' | 'LATER' | 'SOMEDAY' | 'BACKLOG'
//   theme: strategic pillar this item belongs to
//   impact: what the user/team experiences — written from user perspective
//   researchBasis: scientific grounding where applicable
//
// ============================================================================
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@utils/cn'

// ══════════════════════════════════════════════════════════════════════════
// ROADMAP DATA
// All items from current TodoPage + 10 new suggestions + backlog items
// ══════════════════════════════════════════════════════════════════════════
const ROADMAP_ITEMS = [

    // ── PHASE: NOW (currently in progress or immediate) ──────────────────

    {
        id: 'url-confidence-indicator',
        phase: 'NOW',
        theme: 'Admin Experience',
        priority: 'HIGH',
        effort: 'Small',
        title: 'URL Confidence Indicator',
        impact: 'Admins see exactly which generated problem URLs need manual verification before approving — no more broken links reaching members.',
        description: 'The AI generation pipeline already tracks urlConfidence (high/medium/low) for each generated problem URL, but this information is never shown to the admin. Admins currently blindly approve problems with broken or guessed URLs.',
        why: 'Surfacing this at approval time costs nothing and prevents a poor member experience. An admin who knows a URL is low-confidence will edit it. One who doesn\'t will approve a broken link.',
        technicalNotes: `Location: client/src/pages/admin/AddProblemPage.jsx — GeneratedProblemCard
The urlConfidence field is already returned by the AI generation pipeline.
Add visual indicator next to the source URL link:
  {problem.urlConfidence === 'high' && <span className="text-[9px] text-success font-bold">✓ URL verified</span>}
  {problem.urlConfidence === 'medium' && <span className="text-[9px] text-warning font-bold">⚠ URL unverified</span>}
  {problem.urlConfidence === 'low' && <span className="text-[9px] text-danger font-bold">✗ URL likely wrong — edit before approving</span>}
No server changes needed — data is already there.`,
    },

    {
        id: 'ai-url-fallback',
        phase: 'NOW',
        theme: 'Admin Experience',
        priority: 'HIGH',
        effort: 'Small',
        title: 'Search URL Fallback for Low-Confidence Links',
        impact: 'Members always have something to click when looking up a problem — even when the exact URL is uncertain.',
        description: 'When AI marks a generated problem URL as low-confidence, the URL is currently cleared entirely. Users see a problem with no external link at all. Instead, fall back to a platform search URL.',
        why: 'A search URL gives the user a fighting chance to find the problem. Currently they have nothing to click.',
        technicalNotes: `Location: server/src/controllers/ai.controller.js — generateProblemsAI() Stage 3
Current: sourceUrl: selection.urlConfidence === "low" ? "" : selection.url || "",
Fix:
  sourceUrl: selection.urlConfidence === "low"
    ? getPlatformSearchUrl(selection.platform, selection.title)
    : selection.url || getPlatformSearchUrl(selection.platform, selection.title),
Create server/src/utils/platformSearch.js:
  export function getPlatformSearchUrl(platform, title) {
    const encoded = encodeURIComponent(title)
    const urls = {
      LEETCODE: \`https://leetcode.com/problemset/?search=\${encoded}\`,
      GFG: \`https://www.geeksforgeeks.org/explore?searchQuery=\${encoded}\`,
      HACKERRANK: \`https://www.hackerrank.com/domains/algorithms?searchQuery=\${encoded}\`,
    }
    return urls[platform] || null
  }`,
    },

    {
        id: 'duplicate-problem-detection',
        phase: 'NOW',
        theme: 'Admin Experience',
        priority: 'HIGH',
        effort: 'Small',
        title: 'Duplicate Problem Detection',
        impact: 'Members never see "Two Sum" twice in their problem list. Team stats remain accurate.',
        description: 'Admins who generate problems multiple times can create duplicate titles in the same team. The server has no uniqueness constraint on (teamId, title).',
        why: 'Duplicates confuse members, waste embedding storage, and distort leaderboard stats.',
        technicalNotes: `Two-layer fix:
1. Server: Add @@unique([teamId, title]) to Problem model
   Migration: dedup first → DELETE FROM problems WHERE id NOT IN (SELECT MIN(id)...)
2. Client: Before createProblem.mutateAsync in handleApprove,
   check against existing titles via useProblems()
   Show warning toast: "Two Sum already exists in your team — skipped"`,
    },

    {
        id: 'pre-session-confidence',
        phase: 'NOW',
        theme: 'Learning Science',
        priority: 'HIGH',
        effort: 'Small',
        title: 'Pre-Session Confidence Calibration',
        impact: 'Users get an honest accuracy score on their self-assessment — the D2 (Solution Depth) dimension becomes significantly more meaningful.',
        description: 'Before a user starts a problem, ask one question: "How confident are you that you can solve this?" (1-5). After submission, compare to actual confidence rating. The gap between predicted and actual performance is one of the strongest predictors of learning efficiency.',
        why: 'Research on Dunning-Kruger and metacognitive accuracy shows that candidates who think they know something they cannot execute under pressure are the most at-risk interview failures. This generates calibration data that is genuinely novel.',
        researchBasis: 'Dunning & Kruger (1999), Dunlosky & Metcalfe (2013) — metacognitive monitoring accuracy predicts learning efficiency and long-term retention.',
        technicalNotes: `Add preSessionConfidence field to Solution model (nullable Int)
In SubmitSolutionPage: add a single confidence picker before the form renders
  "Before you start — how confident are you about this?" (1-5)
  Store as preSessionConfidence on submission
In stats.controller.js get6DReport():
  calibrationDelta = |preSessionConfidence - postSessionConfidence| / 4
  metacognitiveAccuracy = 1 - avgCalibrationDelta
  Feed into D2 (Solution Depth) dimension alongside existing signals`,
    },

    // ── PHASE: NEXT (committed, building soon) ─────────────────────────

    {
        id: 'oauth-social-login',
        phase: 'NEXT',
        theme: 'Growth & Onboarding',
        priority: 'HIGH',
        effort: 'Medium',
        title: 'Google + GitHub OAuth',
        impact: 'New users can start practicing in under 30 seconds — no email verification friction.',
        description: 'Add "Sign in with Google" and "Sign in with GitHub" to login and registration pages. Eliminates email verification drop-off for new users.',
        why: 'Registration drop-off is highest at email verification. GitHub login is especially relevant for engineering candidates — they already have accounts.',
        technicalNotes: `Server: passport.js with Google and GitHub strategies
  → First OAuth login: create user, skip verification, go to onboarding
  → Subsequent: find by email, log in directly
Client: OAuth buttons in Login.jsx and Register.jsx
  → Redirect to /auth/google or /auth/github
  → Callback stores JWT + redirects
Env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET`,
    },

    {
        id: 'email-notifications',
        phase: 'NEXT',
        theme: 'Retention & Engagement',
        priority: 'HIGH',
        effort: 'Small',
        title: 'Email Notification System',
        impact: 'Members return to practice 3x more consistently when they receive review reminders. Streak retention increases measurably.',
        description: 'Daily review reminders, weekly progress digest, new problem alerts, streak reminders. Resend integration is already set up — this is purely implementation.',
        why: 'Notifications are the single highest-impact retention mechanism available. The infrastructure exists. This is a leverage play.',
        researchBasis: 'Lally et al. (2010) — habit formation requires consistent environmental cues. Review reminders serve as the external cue that triggers the practice loop.',
        technicalNotes: `Create server/src/services/notification.service.js
  → sendReviewReminderEmail(user, dueCount)
  → sendWeeklyDigestEmail(user, stats)
  → sendNewProblemsEmail(teamMembers, problems)
Trigger points:
  - Daily cron (node-cron): check nextReviewDate, send if dueCount > 0
  - On problem creation: notify team members
  - Weekly Sunday: digest of progress, streak, upcoming reviews
Add notificationPrefs JSON to User model (user can opt out per type)`,
    },

    {
        id: 'forgetting-curve-visualization',
        phase: 'NEXT',
        theme: 'Learning Science',
        priority: 'HIGH',
        effort: 'Small',
        title: 'Forgetting Curve Visualization on Review Queue',
        impact: 'Users can see exactly how much they stand to forget if they skip a review — making the cost of inaction visceral and concrete.',
        description: 'The SM-2 algorithm is fully implemented with sm2EasinessFactor, sm2Interval, sm2Repetitions, nextReviewDate already stored. Show each review item as a retention curve — a line decaying from 100% toward the due date. The calculation already happens in the 6D report.',
        why: 'Making forgetting tangible significantly increases review completion rates. The data exists — this is a visualization change only.',
        researchBasis: 'Ebbinghaus (1885) forgetting curve, Cepeda et al. (2006) — visualizing retention probability increases motivation to review by making the cost of delay concrete.',
        technicalNotes: `In ReviewQueuePage.jsx, for each due item compute:
  const daysSince = (now - lastReviewedAt) / (1000 * 60 * 60 * 24)
  const stability = Math.max(1, ef * Math.pow(reps + 1, 0.7))
  const retention = Math.exp(-daysSince / (stability * 10)) * 100
Render a mini SVG curve per item showing decay from 100% to current retention%.
Color: green > 70%, yellow 40-70%, red < 40%
No server changes — all data is already on the Solution model.`,
    },

    {
        id: 'multi-platform-search',
        phase: 'NEXT',
        theme: 'Content & Problems',
        priority: 'HIGH',
        effort: 'Medium',
        title: 'Multi-Platform Problem URL Resolution',
        impact: 'Team admins can generate problems from GFG, HackerRank, and InterviewBit — not just LeetCode — with verified, working links.',
        description: 'Integrate Serper.dev to resolve real URLs from GFG, HackerRank, InterviewBit, and CodeChef. Search query: "[problem title] site:[platform domain]" — takes the first result URL.',
        why: 'GFG is better for Indian company interviews. HackerRank has unique problem sets. Platform diversity directly improves preparation quality.',
        technicalNotes: `Create server/src/services/search.service.js
  searchProblemUrl(title, platform) → verified URL via Serper.dev API
  Falls back to platform search URL if API fails
Integration: ai.controller.js generateProblemsAI() Stage 2
  After problem selection, call searchProblemUrl() for each
  Replace AI-generated URL with verified search result
  Cache resolved URLs in ProblemCatalog table for reuse
Env: SERPER_API_KEY (simple, one key, $50/month for 50k searches)`,
    },

    {
        id: 'interview-stage-selector',
        phase: 'NEXT',
        theme: 'Content & Problems',
        priority: 'MEDIUM',
        effort: 'Small',
        title: 'Interview Stage-Aware Problem Generation',
        impact: 'A team admin preparing members for Google onsites gets Hard optimization problems — not Easy pattern recognition warmups.',
        description: 'Add Interview Stage selector (Phone Screen / Technical Screen / Onsite / Final Round) to AI generation config. AI calibrates problem difficulty, depth, and follow-up expectations to match the actual stage.',
        why: 'Real interview preparation is stage-aware. Generic difficulty selection ignores the most important context variable.',
        technicalNotes: `Client: Add interviewStage field to AIGenerateScreen in AddProblemPage.jsx
Server: Add to req.body destructuring in generateProblemsAI()
AI Prompt: problemSelectionPrompt() — add stage calibration:
  PHONE_SCREEN: EASY-MEDIUM, pattern recognition speed
  TECHNICAL_SCREEN: MEDIUM, correctness + communication
  ONSITE: MEDIUM-HARD, optimization + edge cases
  FINAL_ROUND: HARD, system thinking + multiple approaches`,
    },

    {
        id: 'inline-followup-editing',
        phase: 'NEXT',
        theme: 'Admin Experience',
        priority: 'MEDIUM',
        effort: 'Medium',
        title: 'Inline Follow-Up Editing at Generation Time',
        impact: 'Admins curate the complete problem — including follow-up questions — in a single step before it reaches team members.',
        description: 'When AI generates a problem, admins can see follow-up questions but cannot edit them in the preview. They must approve first, then go to Edit Problem. Unnecessary two-step workflow.',
        why: 'The preview card is the natural curation moment. Follow-up quality directly affects AI review scoring and member learning.',
        technicalNotes: `Location: client/src/pages/admin/AddProblemPage.jsx — GeneratedProblemCard
Add local state: const [editingFollowUps, setEditingFollowUps] = useState(problem.followUpQuestions || [])
Replace read-only display with editable rows (question textarea, difficulty select, hint input, remove button)
Add "+ Add follow-up" button
Pass editingFollowUps to onApprove instead of problem.followUpQuestions`,
    },

    {
        id: 'interleaved-practice',
        phase: 'NEXT',
        theme: 'Learning Science',
        priority: 'HIGH',
        effort: 'Small',
        title: 'Interleaved Practice Mode',
        impact: 'Members who use Mixed Mode remember patterns 43% better at interview time compared to blocked category practice.',
        description: 'A "Mixed Mode" button on the Problems page that serves problems in randomized order across categories. The cognitive discomfort of switching is exactly what produces superior long-term retention.',
        why: 'Blocked practice feels easier and produces better immediate performance — which is why candidates prefer it. Interleaved practice feels harder and produces dramatically better long-term retention and transfer to novel problems.',
        researchBasis: 'Rohrer & Taylor (2007) — interleaved practice produces 43% better retention at test time vs blocked practice. Kornell & Bjork (2008) — despite feeling harder, interleaving produces superior discrimination learning.',
        technicalNotes: `Client: ProblemsPage.jsx — add "Mixed Mode" toggle
When active: randomize problem order across all categories in the current filtered set
No backend changes needed — this is client-side ordering
Add a brief explanation in the UI: "Harder in the moment. Better at interview time."
Track mixed mode sessions separately in analytics for efficacy measurement`,
    },

    {
        id: 'commitment-contracts',
        phase: 'NEXT',
        theme: 'Retention & Engagement',
        priority: 'HIGH',
        effort: 'Small',
        title: 'Daily Practice Commitment Contracts',
        impact: 'Members who commit to a daily goal return 2-3x more consistently than those who just track streaks passively.',
        description: 'Let users set a daily commitment ("I will solve 1 problem every day until my interview"). Send a single evening reminder if they haven\'t practiced. The mechanism is loss aversion — breaking a commitment feels worse than missing a casual streak.',
        why: 'Passive streak tracking (what ProbSolver currently has) produces mild motivation. Active commitment contracts produce significantly stronger behavioral change.',
        researchBasis: 'Ariely & Wertenbroch (2002) — commitment devices significantly increase task completion. Gollwitzer (1999) — implementation intentions (if-then plans) double goal achievement rates vs simple goal-setting.',
        technicalNotes: `Add commitmentGoal JSON to User model: { dailyCount: 1, message: "1 problem/day", startDate, endDate }
In SettingsPage: add commitment contract UI — set goal, set end date
In email.service.js: sendCommitmentReminderEmail() — fires at 8pm if dailyGoal not met
In Dashboard: show commitment progress, days kept vs missed
Key: make the commitment public within the team (opt-in social accountability)`,
    },

    // ── PHASE: LATER (planned, not yet committed) ─────────────────────

    {
        id: 'spaced-retrieval-before-review',
        phase: 'LATER',
        theme: 'Learning Science',
        priority: 'HIGH',
        effort: 'Medium',
        title: 'Pre-Review Recall Attempt',
        impact: 'Members who attempt recall before reviewing their solution retain it 50% longer than those who immediately re-read their answer.',
        description: 'Change the review flow: first show only the problem title and ask the user to write their recall ("What was your approach? What was the key insight?") before revealing their previous solution. The gap between recalled and actual solution is the most accurate retention measure.',
        why: 'The generation effect — attempting to retrieve information before seeing it — is one of the most replicated findings in cognitive psychology. ProbSolver currently skips the retrieval attempt entirely.',
        researchBasis: 'Karpicke & Blunt (2011, Science) — retrieval practice produces 50% better long-term retention than elaborative studying. Roediger & Butler (2011) — the testing effect is robust across subjects and age groups.',
        technicalNotes: `Modify ReviewQueuePage: two-step flow
Step 1: Show problem title only + "What do you remember?" textarea
         → User writes their recall (can be brief)
         → "Show My Solution" button
Step 2: Show full solution + recall comparison side-by-side
         → Confidence rating (feeds SM-2 as always)
Store recall attempt as reviewRecall text on Solution
This data enables future AI analysis: "your recall matched 60% of your original solution"`,
    },

    {
        id: 'competition-system',
        phase: 'LATER',
        theme: 'Team & Community',
        priority: 'MEDIUM',
        effort: 'Large',
        title: 'Timed Team Competitions',
        impact: 'Teams experience the real pressure of timed problem-solving together — the closest simulation of an actual interview environment the platform can offer.',
        description: 'Timed competition events where team members solve the same problem set simultaneously. Live leaderboard. Competition and CompetitionEntry models already exist in schema.prisma.',
        why: 'Competitions create urgency that regular practice lacks. The D5 (Pressure Performance) dimension gets the richest data signal from timed competitive events.',
        technicalNotes: `Schema: Competition and CompetitionEntry models already exist
Server:
  POST /api/competitions — SuperAdmin creates
  POST /api/competitions/:id/join
  WebSocket: real-time leaderboard during competition
  POST /api/competitions/:id/submit
Client: Competition lobby, live problem view, real-time leaderboard`,
    },

    {
        id: 'peer-learning-pairs',
        phase: 'LATER',
        theme: 'Team & Community',
        priority: 'MEDIUM',
        effort: 'Medium',
        title: 'Weekly Peer Learning Pairs',
        impact: 'Members who explain their solution to a peer show significantly better retention and deeper understanding than those who only self-review.',
        description: 'Match members into weekly pairs where one person explains their solution to the other and receives a clarity rating. This is a structured explanation session, not just the existing peer rating feature.',
        why: 'Explaining a concept to someone slightly less advanced consolidates your own understanding more than additional solo practice. The Protégé Effect is well-documented.',
        researchBasis: 'Chase et al. (2009) — the protégé effect: teaching others is one of the most effective learning strategies. Roscoe & Chi (2007) — peer tutoring benefits both tutor and tutee through knowledge elaboration.',
        technicalNotes: `Add WeeklyPairingSession model: id, week, userId1, userId2, teamId, status
Server: Pairing algorithm runs Sunday evening — match by similarity of 6D weakness areas
Client: Dashboard shows "this week's pair" + structured prompt "Explain your solution to X"
After explanation session: both members rate it (feeds D3 Communication dimension)
Track pair completion rate in Team Analytics`,
    },

    {
        id: 'voice-interviews',
        phase: 'LATER',
        theme: 'AI Intelligence',
        priority: 'MEDIUM',
        effort: 'Large',
        title: 'Voice-Based Mock Interviews',
        impact: 'Members practice the actual modality of a real interview — speaking their answer — not just typing it.',
        description: 'User speaks their answer, Whisper STT transcribes it, AI responds. Behavioral and HR rounds especially require verbal fluency that text practice cannot build.',
        why: 'Most real interviews are spoken. Voice practice builds confidence that text practice structurally cannot.',
        technicalNotes: `Server: POST /api/interview-v2/voice/transcribe
  Receives audio blob → OpenAI Whisper → returns transcript
  Feed transcript into existing interview engine (no changes needed there)
Client: MediaRecorder API to capture audio in MockInterviewPage
  Send blob to transcribe endpoint → populate chat input
  Optional: AI response via browser SpeechSynthesis API
Cost: Whisper API $0.006/minute — 10 interviews = $0.06`,
    },

    {
        id: 'problem-catalog',
        phase: 'LATER',
        theme: 'Content & Problems',
        priority: 'HIGH',
        effort: 'Large',
        title: 'Curated Problem Catalog with Verified URLs',
        impact: 'AI generates problems from a pre-verified library — 100% reliable links, zero broken URLs, dramatically faster generation.',
        description: 'Internal database of 500+ verified interview problems. AI selects from catalog instead of generating free-form. Catalog grows automatically via search API resolution.',
        why: 'Verified URLs are a strategic asset that compounds over time. Every resolved URL improves the catalog permanently.',
        technicalNotes: `Schema: Add ProblemCatalog model
  id, title, platform, url, difficulty, category, tags[], companyTags[],
  pattern, verifiedAt, addedById, sourceType (manual | auto-resolved)
Seed: 500 well-known problems as initial dataset
Auto-grow: Every search API resolution → save to catalog
Admin UI: Super Admin browse, add, verify, deprecate
Integration: generateProblemsAI() checks catalog first`,
    },

    {
        id: 'cohort-benchmarking',
        phase: 'LATER',
        theme: 'AI Intelligence',
        priority: 'MEDIUM',
        effort: 'Medium',
        title: 'Role-Appropriate Cohort Benchmarking',
        impact: 'Instead of "your Pattern Recognition score is 62", members see "62 — 71st percentile for backend engineers targeting mid-level roles at FAANG."',
        description: 'Add meaningful comparison to similar users in the 6D report. Social comparison to relevant peers is a stronger motivator than comparison to abstract ideals.',
        why: 'Context transforms an honest number into an actionable signal. "62/100" is ambiguous. "71st percentile for your target role" drives specific behavior.',
        researchBasis: 'Festinger (1954) social comparison theory — people evaluate themselves against similar others, not abstract ideals. Bandura (1977) — self-efficacy beliefs are most powerfully influenced by comparison to similar peers.',
        technicalNotes: `Add role/experience level fields to User model (from onboarding)
In stats.controller.js get6DReport():
  Query aggregate 6D scores for users with same targetCompany type + experience level
  Compute percentile rank for each dimension
  Return benchmarks alongside absolute scores
Client: ReportPage shows "You vs peers targeting [company type]" comparison`,
    },

    {
        id: 'anxiety-calibration',
        phase: 'LATER',
        theme: 'Learning Science',
        priority: 'MEDIUM',
        effort: 'Small',
        title: 'Pre-Interview Anxiety Calibration',
        impact: 'The D5 (Pressure Performance) dimension accurately distinguishes between "performs poorly under pressure" and "performs well despite high anxiety" — a critical difference for coaching.',
        description: '3-question anxiety self-report before each mock interview. AI calibrates evaluation accordingly. Based on Yerkes-Dodson law — moderate arousal improves performance, high anxiety degrades it.',
        why: 'A candidate scoring 9/10 while reporting high anxiety deserves different feedback than one scoring 9/10 calmly. Current D5 cannot make this distinction.',
        researchBasis: 'Yerkes & Dodson (1908) — inverted-U relationship between arousal and performance. Eysenck et al. (2007) Attentional Control Theory — anxiety impairs performance through working memory interference.',
        technicalNotes: `Add preInterviewAnxiety Int (1-10) to InterviewSession model
In MockInterviewPage: 3-question pre-interview form
  "How nervous do you feel right now?" (1-10)
  "How prepared do you feel?" (1-10)
  "How well did you sleep last night?" (1-5)
Store composite anxiety score on session
In interview debrief: include anxiety context in scoring interpretation
In D5 computation: create anxiety-adjusted performance metric`,
    },

    {
        id: 'process-tracking',
        phase: 'LATER',
        theme: 'AI Intelligence',
        priority: 'MEDIUM',
        effort: 'Large',
        title: 'Problem-Solving Process Tracking',
        impact: 'AI feedback can comment on HOW you solved the problem — not just WHAT you submitted. Did you clarify requirements first? Did you try brute force before optimizing?',
        description: 'Optional session timer and timestamped "thinking log" scratchpad during problem solving. AI review then has behavioral signal data about process, not just outcome.',
        why: 'Research on deliberate practice shows process matters more than outcome for learning. The existing AI can only see the final submission — it misses all the behavioral signals.',
        researchBasis: 'Ericsson et al. (1993) deliberate practice — the quality of practice matters more than quantity. Process-level feedback is the foundation of expert skill development.',
        technicalNotes: `Add to Solution model: thinkingLog JSON (array of {timestamp, note})
In SubmitSolutionPage: optional "Thinking Log" expandable panel
  Auto-timestamps each note entry
  Captures: "identified pattern", "tried brute force", "realized edge case"
In ai.prompts.js solutionReviewPrompt():
  Add thinkingLog to submission context
  Evaluate: did they clarify requirements? try brute force first? self-correct?
  Feed behavioral signals into D1 (Pattern Recognition) and D2 (Solution Depth)`,
    },

    // ── PHASE: SOMEDAY (validated ideas, no committed timeline) ──────────

    {
        id: 'learning-paths',
        phase: 'SOMEDAY',
        theme: 'Learning Science',
        priority: 'HIGH',
        effort: 'XLarge',
        title: 'Structured Learning Paths',
        impact: 'A user who wants to learn Spring Boot, AI/ML, or Computer Networking gets a structured path — not just a list of problems, but a knowledge graph with dependency ordering, forgetting curves per concept, and three practice modes matched to knowledge type.',
        description: 'Topic → AI-generated concept dependency graph → daily adaptive practice queue combining Explain It (Technical Knowledge workspace), Quiz It (existing quiz), and Build It (coding problems). Seven subject domains with mechanism-depth evaluation.',
        why: 'Interview preparation is reactive (practice problems). Learning is proactive (build knowledge). ProbSolver currently only does the former.',
        researchBasis: 'Bloom (1956) taxonomy — deep learning requires progression through recognition, recall, application, and explanation. Vygotsky ZPD — structured paths scaffold learning through zones of proximal development.',
        technicalNotes: `New models: LearningPath, LearningPathConcept, ConceptEdge, ConceptMastery
Five knowledge states per concept: Unfamiliar → Recognizing → Recalling → Applying → Explaining
Three practice modes: Explain It (TK workspace) | Quiz It (existing quiz) | Build It (coding)
Daily adaptive queue based on: forgetting curve urgency + readiness to advance + prerequisite coverage
Full design document in previous conversation context — ready to build when prioritized`,
    },

    {
        id: 'pricing-subscriptions',
        phase: 'SOMEDAY',
        theme: 'Growth & Onboarding',
        priority: 'HIGH',
        effort: 'Large',
        title: 'Pricing & Subscription Model',
        impact: 'ProbSolver becomes a sustainable business. Free tier drives discovery. Pro tier removes limits. Team tier unlocks everything for groups.',
        description: 'Individual Free (10 AI reviews/month) + Individual Pro ($12-15/month, unlimited) + Team ($8-10/seat/month). Stripe integration, usage tracking, feature gating middleware, Customer Portal.',
        why: 'Without monetization there is no sustainability. The feature set justifies a Pro tier — no comparable platform offers this combination.',
        technicalNotes: `New models: Subscription, UsageTracking
Backend: Stripe integration, webhook handler, /api/v1/billing routes
Frontend: Pricing page, upgrade prompts at feature limits, billing settings
Middleware: subscription check on AI endpoints
See full design brief in previous conversation context`,
    },

    {
        id: 'interview-pipeline-tracker',
        phase: 'SOMEDAY',
        theme: 'Growth & Onboarding',
        priority: 'MEDIUM',
        effort: 'Medium',
        title: 'Real Interview Pipeline Tracker',
        impact: 'Users see the direct connection between their practice and real interview outcomes — the most powerful motivation signal possible.',
        description: 'Track real applications: company, role, stage (applied/screen/onsite/offer), date, outcome. AI weekly plan reads upcoming interviews and adjusts recommendations.',
        why: 'The connection between preparation and outcome is what sustains motivation long-term. Currently there is no way to close this loop.',
        technicalNotes: `Add InterviewApplication model: id, userId, company, role, stage, dates, outcome, notes
Client: /interview-tracker with kanban or list view
Integration: AI weekly plan reads nextInterviewAt and targetCompany to prioritize recommendations`,
    },

    {
        id: 'ai-problem-scheduling',
        phase: 'SOMEDAY',
        theme: 'Content & Problems',
        priority: 'MEDIUM',
        effort: 'Medium',
        title: 'Automated Problem Generation (Auto-Pilot)',
        impact: 'Teams always have fresh, calibrated content without admin manual effort — the prep program runs itself.',
        description: 'Team Admins configure daily/weekly AI problem generation. AI adds N problems automatically based on team performance, without manual action.',
        why: 'Removes admin burden. Teams stay engaged with fresh content. Mirrors how structured interview prep programs work.',
        technicalNotes: `Add aiScheduleConfig JSON to Team model
  { enabled: true, dailyCount: 2, categories: ["CODING"], frequency: "daily" }
Server: node-cron daily job → checks team schedule configs → calls generateProblemsAI()
UI: Team Admin settings → "AI Auto-generate" toggle with config options`,
    },

    {
        id: 'mobile-app',
        phase: 'SOMEDAY',
        theme: 'Growth & Onboarding',
        priority: 'LOW',
        effort: 'XLarge',
        title: 'Mobile App (Review + Quiz)',
        impact: 'Members can do their daily reviews and quizzes during commute, lunch, or any 5-10 minute window — dramatically increasing daily engagement frequency.',
        description: 'React Native app focused on the two highest-frequency, low-friction activities: spaced repetition reviews and AI quizzes. Full platform stays on web.',
        why: 'Reviews and quizzes are the activities most suitable for mobile. They take 5-10 minutes and don\'t require a keyboard.',
        technicalNotes: `React Native + Expo — shares component logic with web where possible
Auth: Same JWT system, no server changes needed
API: All existing endpoints work
Scope: Review Queue + Quiz only (not problems, not mock interview)`,
    },

    // ── PHASE: BACKLOG (valid ideas, not yet prioritized) ─────────────

    {
        id: 'shared-problem-definitions',
        phase: 'BACKLOG',
        theme: 'Infrastructure',
        priority: 'MEDIUM',
        effort: 'Large',
        title: 'Shared Problem Definitions Across Teams',
        impact: 'At 50+ teams, duplicate problem storage is eliminated. Team A\'s admin notes on Two Sum benefit Team B.',
        description: 'Refactor Problem model into ProblemDefinition (shared) + TeamProblem (team-specific). Embeddings computed once per definition. Trigger: 50+ teams or when duplicates show in analytics.',
        why: 'Strategic refactor. High effort for current scale. Critical at scale.',
        technicalNotes: `Schema: ProblemDefinition (shared) + TeamProblem (team assignment)
Migration: dedup existing problems → create TeamProblem rows
Update all FKs on Solution, InterviewSession
TRIGGER: when you have 50+ teams or embedding storage becomes measurable`,
    },

    {
        id: 'screenshot-attachment-feedback',
        phase: 'BACKLOG',
        theme: 'Admin Experience',
        priority: 'LOW',
        effort: 'Medium',
        title: 'Screenshot Attachment in Feedback Reports',
        impact: 'Members can show exactly what they\'re seeing when reporting a bug — cutting back-and-forth debugging time significantly.',
        description: 'Multi-image upload in FeedbackPage. Compressed before upload. Stored as URLs or base64 depending on infrastructure decision.',
        why: 'Bug reports without screenshots are often ambiguous. Screenshots eliminate the "can you describe what you\'re seeing?" back-and-forth.',
        technicalNotes: `Storage decision needed: base64 in DB (quick) vs object storage URL (production-correct)
Migration: add screenshots JSON column to FeedbackReport
Frontend: file picker with preview + compression in FeedbackPage
Admin view: render attachments in FeedbackInboxPage`,
    },

    {
        id: 'redis-caching',
        phase: 'BACKLOG',
        theme: 'Infrastructure',
        priority: 'LOW',
        effort: 'Medium',
        title: 'Redis Caching for Expensive Endpoints',
        impact: 'At 500+ active users, leaderboard and 6D report load times drop from 2-3s to under 100ms.',
        description: 'Cache platform analytics, leaderboard, 6D report. Cache invalidation on data changes. Currently not a bottleneck — relevant at scale.',
        why: 'Platform analytics pulls entire tables into memory. Redis with 5-minute TTL eliminates 90% of these queries. Do this when it becomes measurable.',
        technicalNotes: `redis npm package + REDIS_URL env var
server/src/lib/cache.js — get/set/invalidate helpers
Cache keys: "platform:health:30d", "leaderboard:teamId", "report:userId:teamId"
TTL: 5min analytics, 1min leaderboard
Invalidation: on solution submit → invalidate leaderboard + report`,
    },

    {
        id: 'typescript-migration',
        phase: 'BACKLOG',
        theme: 'Infrastructure',
        priority: 'LOW',
        effort: 'XLarge',
        title: 'TypeScript Migration',
        impact: 'Entire class of runtime bugs caught at compile time. Onboarding new developers becomes dramatically faster.',
        description: 'Incremental JS → TS migration. Start with server utils, then controllers, then client hooks and stores.',
        why: 'The right move long-term. High effort. No user-facing impact. Do after the product is more stable.',
        technicalNotes: `Incremental: rename .js → .ts one file at a time
Start: server/src/utils/response.ts
Then: controllers → services → middleware
Client: hooks → store → pages
Target: 100% TS in 3-6 months of incremental work`,
    },

    {
        id: 'bulk-problem-import',
        phase: 'BACKLOG',
        theme: 'Admin Experience',
        priority: 'LOW',
        effort: 'Medium',
        title: 'Bulk Problem Import from Title List',
        impact: 'Coaches and senior engineers can bring years of curated problem sets into ProbSolver in minutes instead of hours.',
        description: '"Paste titles, one per line" → AI generates content for each → admin reviews and approves. Cap at 10 per session.',
        why: 'Serious team admins have existing problem sets. Import removes a significant onboarding barrier.',
        technicalNotes: `UI: Third tab in AddProblemPage — "Import List"
Flow: parse → generateProblemContent per title → GeneratedProblemCard preview → batch approve
No new server endpoints — uses existing generateProblemContent and batchCreateProblems
Cap at 10 titles to prevent timeout`,
    },

    {
        id: 'custom-difficulty-format',
        phase: 'BACKLOG',
        theme: 'Infrastructure',
        priority: 'LOW',
        effort: 'Small',
        title: 'Harden Custom Difficulty Format Parsing',
        impact: 'Future developers cannot accidentally break the custom difficulty parsing by changing the format.',
        description: 'Document and validate the "custom:2,2,1" format contract on the server. Add explicit error for malformed input.',
        why: 'Low effort, prevents silent breakage during future refactors.',
        technicalNotes: `Location: server/src/controllers/ai.controller.js — generateProblemsAI()
Add validation: if (isNaN(easy) || isNaN(medium) || isNaN(hard)) return error(res, "Invalid format", 400)
Add comment block documenting the format contract`,
    },

    {
        id: 'company-interview-pattern-tagging',
        phase: 'BACKLOG',
        theme: 'Content & Problems',
        priority: 'LOW',
        effort: 'Small',
        title: 'Company Interview Pattern Tagging with Stage Context',
        impact: 'AI coaching plans can say "this pattern appears in 80% of Google onsite rounds" instead of generic advice.',
        description: 'Add company+stage+frequency metadata to problem categoryData JSON. No migration needed — categoryData is already a JSON column.',
        why: 'Company-specific pattern knowledge is high-value. Encoding it in problem metadata makes AI coaching dramatically more targeted.',
        technicalNotes: `Add to categoryData JSON: { companyPatterns: [{ company: "Google", stage: "ONSITE", frequency: "HIGH" }] }
UI: ProblemForm.jsx — "Company Stage Context" section below company tags
AI prompt: read companyPatterns in solutionReviewPrompt and problemSelectionPrompt`,
    },
]

// ══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════

const PHASE_CONFIG = {
    NOW: {
        label: 'Now',
        sublabel: 'In progress',
        color: 'border-success text-success',
        bg: 'bg-success/5',
        badge: 'bg-success/12 text-success border-success/25',
        dot: 'bg-success',
        borderLeft: 'border-l-success',
        description: 'Currently building or immediately queued',
        icon: '⚡',
    },
    NEXT: {
        label: 'Next',
        sublabel: '1-3 months',
        color: 'border-brand-400 text-brand-300',
        bg: 'bg-brand-400/5',
        badge: 'bg-brand-400/12 text-brand-300 border-brand-400/25',
        dot: 'bg-brand-400',
        borderLeft: 'border-l-brand-400',
        description: 'Committed for the next development cycle',
        icon: '🎯',
    },
    LATER: {
        label: 'Later',
        sublabel: '3-9 months',
        color: 'border-warning text-warning',
        bg: 'bg-warning/5',
        badge: 'bg-warning/12 text-warning border-warning/25',
        dot: 'bg-warning',
        borderLeft: 'border-l-warning',
        description: 'Planned with clear design and justification',
        icon: '🗺️',
    },
    SOMEDAY: {
        label: 'Someday',
        sublabel: '9+ months',
        color: 'border-info text-info',
        bg: 'bg-info/5',
        badge: 'bg-info/12 text-info border-info/25',
        dot: 'bg-info',
        borderLeft: 'border-l-info',
        description: 'Validated ideas awaiting the right moment',
        icon: '🔭',
    },
    BACKLOG: {
        label: 'Backlog',
        sublabel: 'No timeline',
        color: 'border-border-strong text-text-disabled',
        bg: 'bg-surface-2',
        badge: 'bg-surface-3 text-text-disabled border-border-default',
        dot: 'bg-text-disabled',
        borderLeft: 'border-l-border-strong',
        description: 'Valid, no committed timeline',
        icon: '📦',
    },
}

const THEME_CONFIG = {
    'Learning Science': { icon: '🧠', color: 'text-purple-400', bg: 'bg-purple-400/10 border-purple-400/25' },
    'AI Intelligence': { icon: '🤖', color: 'text-brand-300', bg: 'bg-brand-400/10 border-brand-400/25' },
    'Retention & Engagement': { icon: '🔥', color: 'text-warning', bg: 'bg-warning/10 border-warning/25' },
    'Admin Experience': { icon: '👑', color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/25' },
    'Content & Problems': { icon: '📋', color: 'text-info', bg: 'bg-info/10 border-info/25' },
    'Team & Community': { icon: '👥', color: 'text-success', bg: 'bg-success/10 border-success/25' },
    'Growth & Onboarding': { icon: '🚀', color: 'text-danger', bg: 'bg-danger/10 border-danger/25' },
    'Infrastructure': { icon: '⚙️', color: 'text-text-secondary', bg: 'bg-surface-3 border-border-default' },
}

const PRIORITY_CONFIG = {
    HIGH: { color: 'bg-danger/10 text-danger border-danger/25', dot: 'bg-danger' },
    MEDIUM: { color: 'bg-warning/10 text-warning border-warning/25', dot: 'bg-warning' },
    LOW: { color: 'bg-info/10 text-info border-info/25', dot: 'bg-info' },
}

const EFFORT_CONFIG = {
    Small: { color: 'bg-success/10 text-success border-success/25', label: 'Small' },
    Medium: { color: 'bg-brand-400/10 text-brand-300 border-brand-400/25', label: 'Medium' },
    Large: { color: 'bg-warning/10 text-warning border-warning/25', label: 'Large' },
    XLarge: { color: 'bg-danger/10 text-danger border-danger/25', label: 'X-Large' },
}

const PHASES_ORDER = ['NOW', 'NEXT', 'LATER', 'SOMEDAY', 'BACKLOG']
const THEMES = [...new Set(ROADMAP_ITEMS.map(i => i.theme))]

// ══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ══════════════════════════════════════════════════════════════════════════

function ThemeBadge({ theme }) {
    const config = THEME_CONFIG[theme] || THEME_CONFIG['Infrastructure']
    return (
        <span className={cn(
            'text-[9px] font-bold px-1.5 py-px rounded-full border flex items-center gap-1 flex-shrink-0',
            config.bg
        )}>
            <span>{config.icon}</span>
            <span className={config.color}>{theme}</span>
        </span>
    )
}

// ── Roadmap card (compact, for the visual timeline view) ──────────────────
function RoadmapCard({ item, index }) {
    const [expanded, setExpanded] = useState(false)
    const phaseConfig = PHASE_CONFIG[item.phase]
    const priorityConfig = PRIORITY_CONFIG[item.priority]
    const effortConfig = EFFORT_CONFIG[item.effort]

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            className={cn(
                'bg-surface-1 border border-border-default rounded-xl overflow-hidden',
                'border-l-2 transition-all',
                `border-l-[${phaseConfig.dot.replace('bg-', '')}]`
            )}
            style={{ borderLeftColor: item.phase === 'NOW' ? '#22c55e' : item.phase === 'NEXT' ? '#7c6ff7' : item.phase === 'LATER' ? '#eab308' : item.phase === 'SOMEDAY' ? '#3b82f6' : '#4b5563' }}
        >
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-start gap-3 p-4 text-left hover:bg-surface-2/50 transition-colors"
            >
                <div className="flex-1 min-w-0">
                    {/* Badges row */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                        <ThemeBadge theme={item.theme} />
                        <span className={cn('text-[9px] font-bold px-1.5 py-px rounded-full border', priorityConfig.color)}>
                            {item.priority}
                        </span>
                        <span className={cn('text-[9px] font-bold px-1.5 py-px rounded-full border', effortConfig.color)}>
                            {effortConfig.label}
                        </span>
                        {item.researchBasis && (
                            <span className="text-[9px] font-bold px-1.5 py-px rounded-full border bg-purple-400/10 text-purple-400 border-purple-400/25">
                                🔬 Research-backed
                            </span>
                        )}
                    </div>
                    {/* Title */}
                    <h4 className="text-sm font-bold text-text-primary mb-1">{item.title}</h4>
                    {/* Impact — the most important line */}
                    <p className="text-xs text-text-secondary leading-relaxed">
                        {item.impact}
                    </p>
                </div>
                <motion.div
                    animate={{ rotate: expanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-text-disabled flex-shrink-0 mt-0.5"
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </motion.div>
            </button>

            {/* Expanded content */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 pt-3 border-t border-border-subtle space-y-3">
                            {/* Why */}
                            <div>
                                <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                                    Why This Matters
                                </p>
                                <p className="text-xs text-text-secondary leading-relaxed">{item.why}</p>
                            </div>

                            {/* Research basis */}
                            {item.researchBasis && (
                                <div className="bg-purple-400/5 border border-purple-400/20 rounded-lg p-3">
                                    <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-1">
                                        🔬 Research Basis
                                    </p>
                                    <p className="text-[11px] text-text-tertiary leading-relaxed">{item.researchBasis}</p>
                                </div>
                            )}

                            {/* Technical notes */}
                            {item.technicalNotes && (
                                <div>
                                    <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-1">
                                        Technical Notes
                                    </p>
                                    <pre className="text-[11px] text-text-tertiary leading-relaxed bg-surface-0 border border-border-subtle rounded-lg p-3 overflow-x-auto whitespace-pre-wrap font-mono">
                                        {item.technicalNotes}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}

// ── Phase column for roadmap view ─────────────────────────────────────────
function PhaseColumn({ phase, items }) {
    const config = PHASE_CONFIG[phase]

    return (
        <div className="min-w-[280px] flex-1">
            {/* Phase header */}
            <div className={cn('rounded-xl border p-4 mb-3', config.bg, config.color.split(' ')[0])}>
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{config.icon}</span>
                    <span className={cn('text-sm font-extrabold', config.color.split(' ')[1])}>{config.label}</span>
                    <span className={cn('text-[9px] font-bold px-1.5 py-px rounded-full border ml-auto', config.badge)}>
                        {items.length} items
                    </span>
                </div>
                <p className="text-[10px] text-text-disabled">{config.sublabel} · {config.description}</p>
            </div>

            {/* Items */}
            <div className="space-y-2">
                {items.length === 0 ? (
                    <div className="border border-dashed border-border-default rounded-xl p-6 text-center">
                        <p className="text-xs text-text-disabled">Nothing here yet</p>
                    </div>
                ) : (
                    items.map((item, i) => (
                        <RoadmapCard key={item.id} item={item} index={i} />
                    ))
                )}
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════

export default function TodoPage() {
    const [viewMode, setViewMode] = useState('roadmap') // 'roadmap' | 'list'
    const [activePhase, setActivePhase] = useState('All')
    const [activeTheme, setActiveTheme] = useState('All')
    const [activePriority, setActivePriority] = useState('All')
    const [searchQuery, setSearchQuery] = useState('')

    // Computed stats
    const stats = useMemo(() => {
        const byPhase = {}
        PHASES_ORDER.forEach(p => { byPhase[p] = ROADMAP_ITEMS.filter(i => i.phase === p).length })
        const byPriority = {
            HIGH: ROADMAP_ITEMS.filter(i => i.priority === 'HIGH').length,
            MEDIUM: ROADMAP_ITEMS.filter(i => i.priority === 'MEDIUM').length,
            LOW: ROADMAP_ITEMS.filter(i => i.priority === 'LOW').length,
        }
        const researchBacked = ROADMAP_ITEMS.filter(i => i.researchBasis).length
        return { byPhase, byPriority, total: ROADMAP_ITEMS.length, researchBacked }
    }, [])

    // Filtered items for list view
    const filteredItems = useMemo(() => {
        return ROADMAP_ITEMS.filter(item => {
            if (activePhase !== 'All' && item.phase !== activePhase) return false
            if (activeTheme !== 'All' && item.theme !== activeTheme) return false
            if (activePriority !== 'All' && item.priority !== activePriority) return false
            if (searchQuery && !item.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
                !item.impact.toLowerCase().includes(searchQuery.toLowerCase())) return false
            return true
        })
    }, [activePhase, activeTheme, activePriority, searchQuery])

    // Items grouped by phase for roadmap view
    const itemsByPhase = useMemo(() => {
        const grouped = {}
        PHASES_ORDER.forEach(phase => {
            grouped[phase] = ROADMAP_ITEMS.filter(i => i.phase === phase)
        })
        return grouped
    }, [])

    return (
        <div className="p-6 max-w-[1400px] mx-auto">

            {/* ── Header ──────────────────────────────────── */}
            <div className="mb-8">
                <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-extrabold text-text-primary mb-1">
                            Product Roadmap
                        </h1>
                        <p className="text-sm text-text-tertiary max-w-xl leading-relaxed">
                            The complete vision for ProbSolver — what we're building, what's coming,
                            and why every decision is grounded in how engineers actually learn and perform
                            under pressure.
                        </p>
                    </div>
                    {/* View mode toggle */}
                    <div className="flex bg-surface-2 border border-border-default rounded-xl p-1 flex-shrink-0">
                        {[
                            { id: 'roadmap', label: 'Roadmap', icon: '🗺️' },
                            { id: 'list', label: 'Detailed List', icon: '📋' },
                        ].map(v => (
                            <button key={v.id} onClick={() => setViewMode(v.id)}
                                className={cn(
                                    'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all',
                                    viewMode === v.id
                                        ? 'bg-brand-400/15 text-brand-300'
                                        : 'text-text-tertiary hover:text-text-primary'
                                )}>
                                <span>{v.icon}</span>{v.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Summary stats */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                    {PHASES_ORDER.map(phase => {
                        const config = PHASE_CONFIG[phase]
                        const count = stats.byPhase[phase]
                        return (
                            <motion.div
                                key={phase}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => {
                                    setViewMode('list')
                                    setActivePhase(phase)
                                }}
                                className={cn(
                                    'rounded-xl border p-3 text-center cursor-pointer transition-all',
                                    'hover:border-border-strong',
                                    config.bg
                                )}
                            >
                                <div className="text-lg mb-0.5">{config.icon}</div>
                                <div className={cn('text-xl font-extrabold font-mono', config.color.split(' ')[1])}>
                                    {count}
                                </div>
                                <div className="text-[10px] text-text-disabled uppercase tracking-wider">
                                    {config.label}
                                </div>
                            </motion.div>
                        )
                    })}
                </div>

                {/* Vision statement */}
                <div className="bg-gradient-to-r from-brand-400/5 to-purple-400/5 border border-brand-400/20 rounded-2xl p-5">
                    <p className="text-[10px] font-bold text-brand-300 uppercase tracking-widest mb-2">
                        Platform Vision
                    </p>
                    <p className="text-sm text-text-secondary leading-relaxed">
                        ProbSolver is becoming the first interview preparation platform where every feature
                        is grounded in how humans actually learn under pressure. Not just practice — mastery.
                        Not just feedback — behavioral science. Not just a product — a preparation intelligence
                        system that knows you, adapts to you, and tells you honestly when you're ready.
                    </p>
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-brand-400/15">
                        <div className="text-center">
                            <div className="text-lg font-extrabold font-mono text-brand-300">{stats.total}</div>
                            <div className="text-[9px] text-text-disabled uppercase tracking-wider">Total items</div>
                        </div>
                        <div className="text-center">
                            <div className="text-lg font-extrabold font-mono text-purple-400">{stats.researchBacked}</div>
                            <div className="text-[9px] text-text-disabled uppercase tracking-wider">Research-backed</div>
                        </div>
                        <div className="text-center">
                            <div className="text-lg font-extrabold font-mono text-danger">{stats.byPriority.HIGH}</div>
                            <div className="text-[9px] text-text-disabled uppercase tracking-wider">High priority</div>
                        </div>
                        <div className="text-center">
                            <div className="text-lg font-extrabold font-mono text-success">{stats.byPhase.NOW}</div>
                            <div className="text-[9px] text-text-disabled uppercase tracking-wider">In progress</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ══ ROADMAP VIEW ══════════════════════════════ */}
            {viewMode === 'roadmap' && (
                <div>
                    {/* Strategic themes legend */}
                    <div className="mb-6">
                        <p className="text-[10px] font-bold text-text-disabled uppercase tracking-widest mb-3">
                            Strategic Themes
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(THEME_CONFIG).map(([theme, config]) => {
                                const count = ROADMAP_ITEMS.filter(i => i.theme === theme).length
                                if (count === 0) return null
                                return (
                                    <span key={theme}
                                        className={cn('text-[10px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5', config.bg)}>
                                        <span>{config.icon}</span>
                                        <span className={config.color}>{theme}</span>
                                        <span className="text-text-disabled">({count})</span>
                                    </span>
                                )
                            })}
                        </div>
                    </div>

                    {/* Horizontal scrollable phase columns */}
                    <div className="overflow-x-auto pb-4">
                        <div className="flex gap-4 min-w-max">
                            {PHASES_ORDER.map(phase => (
                                <PhaseColumn
                                    key={phase}
                                    phase={phase}
                                    items={itemsByPhase[phase] || []}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ══ LIST VIEW ═════════════════════════════════ */}
            {viewMode === 'list' && (
                <div>
                    {/* Filters */}
                    <div className="space-y-3 mb-6">
                        {/* Search */}
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search by title or impact..."
                            className="w-full sm:w-80 bg-surface-2 border border-border-default rounded-xl
                                       text-sm text-text-primary placeholder:text-text-tertiary
                                       px-4 py-2.5 outline-none
                                       focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20"
                        />

                        {/* Phase filter */}
                        <div className="flex flex-wrap gap-1.5">
                            <span className="text-[10px] text-text-disabled self-center mr-1">Phase:</span>
                            {['All', ...PHASES_ORDER].map(phase => {
                                const config = phase !== 'All' ? PHASE_CONFIG[phase] : null
                                return (
                                    <button key={phase} onClick={() => setActivePhase(phase)}
                                        className={cn(
                                            'px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border',
                                            activePhase === phase
                                                ? (config ? config.badge : 'bg-brand-400/15 border-brand-400/30 text-brand-300')
                                                : 'bg-surface-2 border-border-default text-text-tertiary hover:text-text-primary'
                                        )}>
                                        {phase !== 'All' && <span className="mr-1">{PHASE_CONFIG[phase].icon}</span>}
                                        {phase === 'All' ? 'All Phases' : PHASE_CONFIG[phase].label}
                                        <span className="ml-1 text-text-disabled">
                                            ({phase === 'All' ? ROADMAP_ITEMS.length : stats.byPhase[phase]})
                                        </span>
                                    </button>
                                )
                            })}
                        </div>

                        {/* Theme + Priority filters */}
                        <div className="flex flex-wrap gap-1.5">
                            <span className="text-[10px] text-text-disabled self-center mr-1">Theme:</span>
                            {['All', ...THEMES].map(theme => (
                                <button key={theme} onClick={() => setActiveTheme(theme)}
                                    className={cn(
                                        'px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border',
                                        activeTheme === theme
                                            ? 'bg-brand-400/15 border-brand-400/30 text-brand-300'
                                            : 'bg-surface-2 border-border-default text-text-tertiary hover:text-text-primary'
                                    )}>
                                    {theme !== 'All' && <span className="mr-1">{THEME_CONFIG[theme]?.icon}</span>}
                                    {theme === 'All' ? 'All Themes' : theme}
                                </button>
                            ))}
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                            <span className="text-[10px] text-text-disabled self-center mr-1">Priority:</span>
                            {['All', 'HIGH', 'MEDIUM', 'LOW'].map(p => (
                                <button key={p} onClick={() => setActivePriority(p)}
                                    className={cn(
                                        'px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border',
                                        activePriority === p
                                            ? (p !== 'All' ? PRIORITY_CONFIG[p].color : 'bg-brand-400/15 border-brand-400/30 text-brand-300')
                                            : 'bg-surface-2 border-border-default text-text-tertiary hover:text-text-primary'
                                    )}>
                                    {p === 'All' ? `All (${ROADMAP_ITEMS.length})` : `${p} (${stats.byPriority[p]})`}
                                </button>
                            ))}
                        </div>

                        {/* Active filter summary */}
                        {filteredItems.length !== ROADMAP_ITEMS.length && (
                            <p className="text-xs text-text-disabled">
                                Showing {filteredItems.length} of {ROADMAP_ITEMS.length} items
                                <button onClick={() => { setActivePhase('All'); setActiveTheme('All'); setActivePriority('All'); setSearchQuery('') }}
                                    className="ml-2 text-danger hover:text-danger/80 transition-colors font-semibold">
                                    Clear filters
                                </button>
                            </p>
                        )}
                    </div>

                    {/* Grouped by phase */}
                    {activePhase === 'All' ? (
                        <div className="space-y-8">
                            {PHASES_ORDER.map(phase => {
                                const phaseItems = filteredItems.filter(i => i.phase === phase)
                                if (phaseItems.length === 0) return null
                                const config = PHASE_CONFIG[phase]
                                return (
                                    <div key={phase}>
                                        <div className="flex items-center gap-3 mb-3">
                                            <span className="text-lg">{config.icon}</span>
                                            <div>
                                                <h2 className={cn('text-sm font-extrabold', config.color.split(' ')[1])}>
                                                    {config.label}
                                                </h2>
                                                <p className="text-[10px] text-text-disabled">{config.description}</p>
                                            </div>
                                            <span className={cn('text-[9px] font-bold px-1.5 py-px rounded-full border ml-auto', config.badge)}>
                                                {phaseItems.length}
                                            </span>
                                        </div>
                                        <div className="space-y-2 pl-2 border-l-2"
                                            style={{ borderLeftColor: phase === 'NOW' ? '#22c55e' : phase === 'NEXT' ? '#7c6ff7' : phase === 'LATER' ? '#eab308' : phase === 'SOMEDAY' ? '#3b82f6' : '#4b5563' }}>
                                            {phaseItems.map((item, i) => (
                                                <RoadmapCard key={item.id} item={item} index={i} />
                                            ))}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredItems.map((item, i) => (
                                <RoadmapCard key={item.id} item={item} index={i} />
                            ))}
                            {filteredItems.length === 0 && (
                                <div className="text-center py-16">
                                    <p className="text-text-disabled text-sm">No items match the current filters.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Footer */}
            <div className="mt-10 p-4 bg-surface-1 border border-border-default rounded-xl">
                <p className="text-xs text-text-tertiary leading-relaxed">
                    <span className="font-bold text-text-secondary">How this roadmap works: </span>
                    Items move left to right through phases as they get prioritized. When an item is completed,
                    remove it from <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-[11px]">ROADMAP_ITEMS</code> in{' '}
                    <code className="text-brand-300 bg-brand-400/10 px-1 rounded text-[11px]">TodoPage.jsx</code>.
                    Items marked 🔬 are grounded in published behavioral science research.
                    The <strong>impact</strong> field describes what users experience — always written from the user perspective,
                    never from a technical perspective.
                </p>
            </div>
        </div>
    )
}