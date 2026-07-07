// client/src/pages/docs/howto/content/member/feedback.jsx
//
// Ripped verbatim from HowToPage.jsx #feedback section. This guide is
// role='*' (visible to all roles).
import {
    SummaryBlock, PrereqList, StepCard, HowToImage, Callout, PasteBlock, K,
    BRAND, SUCCESS, INFO,
} from '../../components'

export default function FeedbackGuide() {
    return (
        <>
            <SummaryBlock>
                Report bugs, request features, or flag problems. Super admins triage from a shared inbox
                and track your report to resolution.
            </SummaryBlock>

            <PrereqList items={[
                'You are signed in.',
            ]} />

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
        </>
    )
}
