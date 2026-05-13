import { useState } from 'react'
import { Button } from '@components/ui/Button'
import { cn } from '@utils/cn'
import { toast } from '@store/useUIStore'
import api from '@services/api'
import { INTERVIEW_STYLES } from './interviewStyles'
import { useFocusTrap } from '@hooks/useFocusTrap'

// ══════════════════════════════════════════════════════════════════════════
// INTERVIEW MODE SETUP — modal that flips a self-paced DesignSession into
// INTERVIEW mode. POSTs to /design-studio/{id}/interview which creates the
// paired InterviewSession and returns both records.
// ══════════════════════════════════════════════════════════════════════════
export default function InterviewModeSetup({ sessionId, onStarted, onCancel }) {
    // Focus trap + Escape-to-close, identical pattern to ConfirmModal.
    const containerRef = useFocusTrap({ active: true, onEscape: onCancel })
    // SYSTEM_FOCUSED is the SD-friendly default per the existing persona list.
    const [interviewStyle, setInterviewStyle] = useState('SYSTEM_FOCUSED')
    const [acknowledged, setAcknowledged] = useState(false)
    const [loading, setLoading] = useState(false)

    async function handleSubmit() {
        if (!acknowledged || loading) return
        setLoading(true)
        try {
            const res = await api.post(`/design-studio/${sessionId}/interview`, {
                interviewStyle,
                interviewMode: 'text',
            })
            const payload = res?.data?.data
            if (!payload?.interviewSession) {
                throw new Error('Server did not return an interview session.')
            }
            onStarted(payload)
        } catch (err) {
            const message =
                err?.response?.data?.error?.message ||
                err?.message ||
                'Failed to start interview.'
            toast.error(message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div
            className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto p-4"
            onClick={onCancel}
            role="presentation"
        >
            <div
                ref={containerRef}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="interview-setup-title"
                className="bg-surface-1 border border-border-default rounded-2xl w-full max-w-2xl my-8 overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-border-default">
                    <div className="flex items-center gap-2">
                        <span className="text-base">🎤</span>
                        <h2 id="interview-setup-title" className="text-base font-bold text-text-primary">
                            Practice as Interview
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="text-text-disabled hover:text-text-primary"
                        aria-label="Close"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
                    <p className="text-xs text-text-tertiary leading-relaxed">
                        Flip this design session into a timed mock interview. The AI interviewer
                        sees your live canvas and notes — no need to re-explain. Pick a style that
                        matches the company culture you're targeting.
                    </p>

                    {/* Interview style selector */}
                    <section>
                        <p className="text-[11px] font-bold text-text-disabled uppercase tracking-widest mb-2">
                            Interviewer Style
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {INTERVIEW_STYLES.map((s) => (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => setInterviewStyle(s.id)}
                                    className={cn(
                                        'flex items-start gap-3 p-3 rounded-xl border text-left transition-all duration-150',
                                        interviewStyle === s.id
                                            ? 'bg-brand-soft border-brand-line'
                                            : 'bg-surface-2 border-border-default hover:border-border-strong',
                                    )}
                                >
                                    <span className="text-xl flex-shrink-0 mt-0.5">{s.icon}</span>
                                    <div className="min-w-0">
                                        <span
                                            className={cn(
                                                'text-xs font-bold block',
                                                interviewStyle === s.id ? 'text-brand-fg-soft' : 'text-text-primary',
                                            )}
                                        >
                                            {s.label}
                                        </span>
                                        <span className="text-[10px] text-text-tertiary block leading-relaxed">
                                            {s.desc}
                                        </span>
                                        <span className="text-[9px] text-text-disabled block mt-0.5">
                                            e.g. {s.examples}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Confirmation */}
                    <label
                        className={cn(
                            'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                            acknowledged
                                ? 'bg-warning-soft border-warning-line'
                                : 'bg-surface-2 border-border-default hover:border-border-strong',
                        )}
                    >
                        <input
                            type="checkbox"
                            checked={acknowledged}
                            onChange={(e) => setAcknowledged(e.target.checked)}
                            className="mt-0.5 w-4 h-4 flex-shrink-0 accent-warning"
                        />
                        <span className="text-xs text-text-secondary leading-relaxed">
                            I understand this is a timed interview — I cannot pause.
                        </span>
                    </label>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-default bg-surface-2">
                    <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        loading={loading}
                        disabled={!acknowledged || loading}
                        onClick={handleSubmit}
                    >
                        Start Interview
                    </Button>
                </div>
            </div>
        </div>
    )
}
