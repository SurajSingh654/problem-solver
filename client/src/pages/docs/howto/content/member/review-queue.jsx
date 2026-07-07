// client/src/pages/docs/howto/content/member/review-queue.jsx
//
// Ripped verbatim from HowToPage.jsx #review section.
import {
    SummaryBlock, PrereqList, StepCard, HowToImage, Callout, K,
    IfItFails,
    BRAND, SUCCESS, INFO,
} from '../../components'

export default function ReviewQueueGuide() {
    return (
        <>
            <SummaryBlock>
                Spaced repetition over your solved problems. The flow is
                <strong> recall → reveal → rate</strong> — type what you remember <em>before</em> seeing your stored
                answer. The gap between what you wrote and what was stored is the learning signal.
            </SummaryBlock>

            <PrereqList items={[
                'At least one solved problem with a confidence rating (SM-2 schedules from there).',
            ]} />

            <Callout type="info">
                <strong>Why recall first?</strong> Karpicke &amp; Roediger (2008): retrieval practice is among the most
                replicated findings in cognitive psychology. Reading your old solution feels productive but doesn&apos;t
                move retention. Typing what you remember <em>does</em>.
            </Callout>

            <StepCard num="1" {...BRAND} title="Open the queue" sub="Sidebar → Review Queue">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Top of the page: a stats bar (Due / Done this session / Coming 14d / Tracked total). Below it,
                    a collapsible <strong>Recall Quality Analytics</strong> panel — overall recall rate trend across
                    the last 12 weeks plus a per-pattern table of strongest / weakest patterns.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed">
                    Below that, due cards. Each card shows title, pattern, and a per-row{' '}
                    <strong>forgetting curve sparkline</strong>: filled past retention, dashed projection forward,
                    color bucket green &gt; 70% / yellow 40-70% / red &lt; 40%. A{' '}
                    <strong>✨ Updated</strong> pill appears when the problem statement changed since you solved it.
                </p>
                <HowToImage
                    file="review-01-queue.png"
                    alt="Review queue page with stats bar, collapsible Recall Quality Analytics panel, and due cards each with a forgetting-curve sparkline"
                    caption="Review queue — analytics panel + due cards with per-row forgetting curves"
                />
            </StepCard>

            <StepCard num="2" {...BRAND} title="Recall phase" sub="Type before you reveal — 90-second timer">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Click a due card → recall view. Empty textarea + 90-second timer. Don&apos;t aim for the
                    original word-for-word — aim for the <em>structure</em>: pattern, brute, optimized, complexity,
                    key insight. The timer is informational, not a hard cutoff.
                </p>
                <Callout type="warning">
                    Reveal without typing and the diff view will be unavailable on the next phase. Skip recall
                    once and you&apos;ve thrown away the highest-fidelity learning signal in the app.
                </Callout>
            </StepCard>

            <StepCard num="3" {...BRAND} title="Reveal phase — Side-by-Side / Diff toggle" sub="See the gap">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    Two views, toggle on top:
                </p>
                <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
                    <li><strong>Side-by-Side:</strong> your recall on the left, the stored solution on the right. Best for code.</li>
                    <li><strong>Diff:</strong> word-level coloring across recall vs stored — green = recalled, red = missed, yellow = invented. Coverage % at the top quantifies the gap.</li>
                </ul>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    AI recall hints render in both views — they&apos;re shaped by what you actually wrote, not
                    a generic prompt.
                </p>
                <HowToImage
                    file="review-03-diff.png"
                    alt="Reveal-phase Diff view with green/red/yellow word-level coloring and a coverage percentage banner"
                    caption="Diff view — green=recalled, red=missed, yellow=invented, plus coverage %"
                />
            </StepCard>

            <StepCard num="4" {...SUCCESS} title="Rate phase" sub="1-5 confidence → SM-2 reschedules">
                <p className="text-xs text-text-secondary leading-relaxed">
                    Pick 1 (forgot it) through 5 (crystal clear). The SM-2 scheduler — FSRS soon — uses this to
                    compute the next review date. Rate honestly: under-rating bunches your queue, over-rating
                    means you forget before the next review.
                </p>
            </StepCard>

            <StepCard num="5" {...INFO} title="🔀 Mixed Mode on Problems" sub="Interleaved practice across categories">
                <p className="text-xs text-text-secondary leading-relaxed">
                    On the <K>Problems</K> page there&apos;s a <strong>🔀 Mixed Mode</strong> toggle pill in the
                    filter row. Turning it on randomizes problem order across categories — a deterministic
                    shuffle (djb2 hash of problem id) that&apos;s stable within a session but interleaves patterns.
                    Rohrer &amp; Taylor (2007): interleaved practice produces ~43% better retention at test time.
                </p>
                <Callout type="info">
                    Blocked practice (all DP problems together) feels easier and produces better immediate
                    performance. Interleaved (DP / Graphs / Trees mixed) feels harder and produces dramatically
                    better long-term retention. Lean into the harder feel.
                </Callout>
            </StepCard>

            <IfItFails>
                <li><strong>Queue is empty</strong> — nothing is due right now. Solve more problems (each gets its first review date from SM-2) or wait for tomorrow.</li>
                <li><strong>Diff view says &quot;no recall recorded&quot;</strong> — you clicked Reveal without typing. Rate the card and the next review will offer a fresh recall.</li>
                <li><strong>&quot;✨ Updated&quot; pill on a card</strong> — the problem statement was edited since you solved it. Skim the new statement before recalling.</li>
            </IfItFails>
        </>
    )
}
