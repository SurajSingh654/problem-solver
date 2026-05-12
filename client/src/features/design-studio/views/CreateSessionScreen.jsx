import { useState } from 'react'
import { Button } from '@components/ui/Button'
import { cn } from '@utils/cn'
import { useCreateDesignSession } from '@hooks/useDesignStudio'
import { toast } from '@store/useUIStore'

// ══════════════════════════════════════════════════════════════════════════
// SESSION CREATION SCREEN
// ══════════════════════════════════════════════════════════════════════════
export default function CreateSessionScreen({ onCreated, onBack }) {
    const createSession = useCreateDesignSession()
    const [designType, setDesignType] = useState('SYSTEM_DESIGN')
    const [title, setTitle] = useState('')
    const [difficulty, setDifficulty] = useState('MEDIUM')

    async function handleCreate() {
        if (!title.trim()) { toast.error('Enter a title'); return }
        try {
            const res = await createSession.mutateAsync({ designType, title: title.trim(), difficulty })
            onCreated(res.data.data.session.id)
        } catch { /* handled */ }
    }

    return (
        <div className="space-y-6">
            {onBack && (
                <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-primary transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
                    Back to sessions
                </button>
            )}
            <div className="bg-surface-1 border border-border-default rounded-2xl p-6 space-y-5">
                <div>
                    <label className="block text-sm font-semibold text-text-primary mb-3">What are you designing?</label>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { id: 'SYSTEM_DESIGN', label: 'System Design', icon: '🏗️', desc: 'Scalable distributed systems' },
                            { id: 'LOW_LEVEL_DESIGN', label: 'Low-Level Design', icon: '🔧', desc: 'OOP, classes, patterns' },
                        ].map(t => (
                            <button key={t.id} type="button" onClick={() => setDesignType(t.id)}
                                className={cn('flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-all',
                                    designType === t.id ? 'bg-brand-soft border-brand-line text-brand-fg-soft' : 'bg-surface-3 border-border-default hover:border-border-strong text-text-tertiary')}>
                                <span className="text-2xl">{t.icon}</span>
                                <span className="text-xs font-bold">{t.label}</span>
                                <span className="text-[10px] text-text-disabled">{t.desc}</span>
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-semibold text-text-primary mb-1.5">Design Title</label>
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && title.trim()) handleCreate() }}
                        placeholder={designType === 'SYSTEM_DESIGN' ? 'e.g. Design WhatsApp, Design YouTube' : 'e.g. Parking Lot, Chess Game'}
                        className="w-full bg-surface-3 border border-border-strong rounded-xl text-sm text-text-primary placeholder:text-text-tertiary px-3.5 py-2.5 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20" />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-text-primary mb-2">Difficulty</label>
                    <div className="flex gap-2">
                        {['EASY', 'MEDIUM', 'HARD'].map(d => (
                            <button key={d} type="button" onClick={() => setDifficulty(d)}
                                className={cn('flex-1 py-2.5 rounded-xl border text-xs font-bold transition-all',
                                    difficulty === d ? d === 'EASY' ? 'bg-success-soft border-success-line text-success-fg' : d === 'MEDIUM' ? 'bg-warning-soft border-warning-line text-warning-fg' : 'bg-danger-soft border-danger-line text-danger-fg'
                                        : 'bg-surface-3 border-border-default text-text-tertiary hover:border-border-strong')}>{d}</button>
                        ))}
                    </div>
                </div>
                <Button variant="primary" size="lg" fullWidth loading={createSession.isPending} onClick={handleCreate} disabled={!title.trim()}>
                    Start Design Session
                </Button>
            </div>
        </div>
    )
}
