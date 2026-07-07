// client/src/pages/docs/howto/content/member/solve-problem.jsx
//
// Ripped verbatim from HowToPage.jsx #solve section. See CLAUDE.md
// spec §16 — no raw REST endpoint paths in visible prose, no validator
// rule numbers in visible content.
import {
    SummaryBlock, PrereqList, StepCard, HowToImage, Callout, PasteBlock, K,
    IfItFails,
    BRAND, SUCCESS, INFO,
} from '../../components'

export default function SolveProblemGuide() {
    return (
        <>
            <SummaryBlock>
                Pick a team-curated problem, fill the workspace (code + structured explanation),
                and submit for AI review across five dimensions with an SM-2-scheduled next review date.
            </SummaryBlock>

            <PrereqList items={[
                'You are enrolled on a team (or on your personal auto-team) with at least one published problem.',
                'For CODING problems: pick your language in the editor header.',
            ]} />

            <Callout type="info">
                <strong>System Design and Low-Level Design:</strong> these categories route to Design Studio
                instead of the Submit Solution workspace. On any SD or LLD problem the primary CTA is{' '}
                <strong>🏗️/🔧 Practice in Design Studio</strong> — see the Design Studio guides for the full flow.
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
                {/* per client/src/pages/problems/ProblemDetailPage.jsx:48 — label is category-specific but defaults to 'Submit Solution' */}
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
                    attempt and the interval adjusts automatically — see the Review Queue + Recall guide
                    for the full recall→reveal→rate flow.
                </p>
            </StepCard>

            <Callout type="info">
                Every submit appends an immutable snapshot — see the Attempt History guide.
                You can compare any two attempts side-by-side later, no matter how many times you&apos;ve edited.
            </Callout>

            <IfItFails>
                <li><strong>Submit button greyed out</strong> — required fields are missing. Pattern and Solve Method both must be selected before the button enables.</li>
                <li><strong>AI review times out</strong> — you&apos;ll see an error toast. The submission is saved as a draft; open Edit Solution and re-submit.</li>
                <li><strong>Daily AI limit hit</strong> — server enforces a per-day cap. Wait until tomorrow, or ask your team admin about limits.</li>
            </IfItFails>
        </>
    )
}
