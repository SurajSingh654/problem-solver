import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useRecommendations } from '@hooks/useRecommendations'
import { Badge } from '@components/ui/Badge'
import { Spinner } from '@components/ui/Spinner'
import { cn } from '@utils/cn'
import { PROBLEM_CATEGORIES } from '@utils/constants'

const DIFF_VARIANT = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }

const TYPE_CONFIG = {
    company: { icon: '🏢', color: 'text-warning', label: 'Target Company' },
    pattern_gap: { icon: '🧩', color: 'text-brand-300', label: 'New Pattern' },
    low_confidence: { icon: '🔁', color: 'text-danger', label: 'Re-solve' },
    similar: { icon: '🔍', color: 'text-info', label: 'Similar' },
    category_gap: { icon: '📚', color: 'text-success', label: 'New Category' },
}

export function Recommendations({ limit = 5, compact = false }) {
    const navigate = useNavigate()
    const { data, isLoading } = useRecommendations()

    if (isLoading) {
        return (
            <div className="flex justify-center py-8">
                <Spinner size="md" />
            </div>
        )
    }

    const recommendations = data?.recommendations?.slice(0, limit) || []

    if (!recommendations.length) {
        return (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="text-3xl">🎉</div>
                <p className="text-sm font-semibold text-text-primary">
                    You've solved everything!
                </p>
                <p className="text-xs text-text-tertiary">
                    Ask your admin to add more problems.
                </p>
            </div>
        )
    }

    return (
        <div className="space-y-2">
            {recommendations.map((rec, i) => {
                const typeConfig = TYPE_CONFIG[rec.type] || TYPE_CONFIG.similar
                const cat = PROBLEM_CATEGORIES.find(c => c.id === rec.category)

                return (
                    <motion.div
                        key={rec.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        onClick={() => navigate(`/problems/${rec.id}`)}
                        className="flex items-start gap-3 p-3.5 rounded-xl border
                       bg-surface-2 border-border-default
                       hover:border-brand-400/30 hover:bg-surface-3
                       cursor-pointer transition-all duration-150
                       hover:-translate-y-0.5"
                    >
                        {/* Type icon */}
                        <div className={cn(
                            'w-9 h-9 rounded-xl flex items-center justify-center',
                            'text-base flex-shrink-0 border',
                            rec.type === 'company' ? 'bg-warning/10 border-warning/25' :
                                rec.type === 'pattern_gap' ? 'bg-brand-400/10 border-brand-400/25' :
                                    rec.type === 'low_confidence' ? 'bg-danger/10 border-danger/25' :
                                        rec.type === 'similar' ? 'bg-info/10 border-info/25' :
                                            'bg-success/10 border-success/25'
                        )}>
                            {typeConfig.icon}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                                <h3 className="text-sm font-semibold text-text-primary truncate">
                                    {rec.title}
                                </h3>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <Badge variant={DIFF_VARIANT[rec.difficulty] || 'brand'} size="xs">
                                        {rec.difficulty?.charAt(0) + rec.difficulty?.slice(1).toLowerCase()}
                                    </Badge>
                                </div>
                            </div>

                            {/* Reason */}
                            <p className={cn(
                                'text-xs leading-relaxed mb-1.5',
                                typeConfig.color
                            )}>
                                {rec.reason}
                            </p>

                            {/* Tags */}
                            {!compact && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {cat && (
                                        <span className={cn(
                                            'text-[10px] font-bold px-1.5 py-px rounded-full border',
                                            cat.bg
                                        )}>
                                            {cat.icon} {cat.label}
                                        </span>
                                    )}
                                    {rec.tags?.slice(0, 2).map(t => (
                                        <span key={t}
                                            className="text-[10px] text-text-disabled bg-surface-3
                                     border border-border-subtle rounded px-1.5 py-px">
                                            {t}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )
            })}
        </div>
    )
}