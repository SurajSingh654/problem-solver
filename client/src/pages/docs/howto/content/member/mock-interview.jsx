// client/src/pages/docs/howto/content/member/mock-interview.jsx
//
// Ripped verbatim from HowToPage.jsx #mock section.
import {
    SummaryBlock, PrereqList, StepCard, HowToImage, Callout, PasteBlock, K,
    IfItFails,
    BRAND, SUCCESS, INFO,
} from '../../components'

export default function MockInterviewGuide() {
    return (
        <>
            <SummaryBlock>
                Live conversational AI interviewer over WebSocket. Text or voice mode. Phases match
                real interviews — intro, problem probe, solution walkthrough, follow-ups, debrief.
            </SummaryBlock>

            <PrereqList items={[
                'You are enrolled on a team (or on your personal auto-team).',
                'Voice mode: browser microphone permission.',
            ]} />

            <Callout type="info">
                <strong>SD &amp; LLD route to Design Studio.</strong> Picking <K>SYSTEM_DESIGN</K> or{' '}
                <K>LOW_LEVEL_DESIGN</K> launches the Design Studio <strong>Practice as Interview</strong> mode
                instead of the chat-only path — the AI can read your live diagram via tool calls.
                See the Design Studio — System Design guide, step 12.
            </Callout>

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

            <StepCard num="6" {...INFO} title="Connection drops? You'll see a banner." sub="Reconnect-and-resume, no lost messages">
                <p className="text-xs text-text-secondary leading-relaxed">
                    If the WebSocket drops mid-interview, a <strong>&ldquo;Connection lost — reconnecting…&rdquo;</strong>{' '}
                    banner appears at the top of the chat. Messages buffer locally; on reconnect the session
                    resumes where it left off. No need to refresh — refreshing actually loses the in-flight turn.
                </p>
            </StepCard>

            <StepCard num="7" {...INFO} title="Review the transcript later" sub="Sidebar → Interview History">
                <p className="text-xs text-text-secondary leading-relaxed">
                    All sessions are saved. Re-read the full transcript, review the debrief, or start
                    a new session on the same type to compare.
                </p>
            </StepCard>

            <IfItFails>
                <li><strong>Voice mode: mic permission denied</strong> — the browser blocked the request. Open your browser&apos;s site settings and allow the microphone, then reload.</li>
                <li><strong>&ldquo;Connection lost&rdquo; banner won&apos;t clear</strong> — the auth handshake failed. Refresh the whole page (you&apos;ll lose the in-flight turn) and start a new session.</li>
                <li><strong>Interview never starts / silent screen</strong> — server is at your daily AI limit. Wait until tomorrow or ask your team admin about limits.</li>
            </IfItFails>
        </>
    )
}
