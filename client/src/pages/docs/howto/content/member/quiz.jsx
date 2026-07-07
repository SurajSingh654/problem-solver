// client/src/pages/docs/howto/content/member/quiz.jsx
//
// Ripped verbatim from HowToPage.jsx #quiz section.
import {
    SummaryBlock, PrereqList, StepCard, HowToImage, Callout, PasteBlock,
    BRAND, SUCCESS, INFO,
} from '../../components'

export default function QuizGuide() {
    return (
        <>
            <SummaryBlock>
                AI-generated multiple choice on any subject. 5–30 questions per quiz. Great for a
                10-minute refresher on a specific topic.
            </SummaryBlock>

            <PrereqList items={[
                'You are enrolled on a team (or on your personal auto-team).',
            ]} />

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
        </>
    )
}
