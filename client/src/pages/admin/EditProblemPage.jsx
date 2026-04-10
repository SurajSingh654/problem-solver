import { useParams, useNavigate } from 'react-router-dom'
import { ProblemForm } from '@components/features/admin/ProblemForm'
import { useProblem, useUpdateProblem } from '@hooks/useProblems'
import { useDeleteProblem } from '@hooks/useProblems'
import { Button } from '@components/ui/Button'
import { PageSpinner } from '@components/ui/Spinner'
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

export default function EditProblemPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [showDelete, setShowDelete] = useState(false)

    const { data: problem, isLoading } = useProblem(id)
    const updateProblem = useUpdateProblem()
    const deleteProblem = useDeleteProblem()

    async function handleSubmit(data) {
        await updateProblem.mutateAsync({ id, data })
        navigate('/admin')
    }

    async function handleDelete() {
        await deleteProblem.mutateAsync(id)
        navigate('/admin')
    }

    if (isLoading) return <PageSpinner />

    if (!problem) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <p className="text-text-secondary">Problem not found.</p>
                <Button variant="secondary" onClick={() => navigate('/admin')}>
                    Back to Admin
                </Button>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-[720px] mx-auto">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <button
                    onClick={() => navigate('/admin')}
                    className="flex items-center gap-1.5 text-sm text-text-tertiary
                     hover:text-text-primary transition-colors"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round">
                        <line x1="19" y1="12" x2="5" y2="12" />
                        <polyline points="12 19 5 12 12 5" />
                    </svg>
                    Back to Admin
                </button>

                <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setShowDelete(true)}
                >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                    Delete Problem
                </Button>
            </div>

            <div className="mb-6">
                <h1 className="text-2xl font-extrabold text-text-primary mb-1">
                    Edit Problem
                </h1>
                <p className="text-sm text-text-tertiary truncate">
                    {problem.title}
                </p>
            </div>

            <ProblemForm
                initialData={problem}
                onSubmit={handleSubmit}
                isSubmitting={updateProblem.isPending}
                submitLabel="Save Changes"
            />

            {/* Delete confirm */}
            <AnimatePresence>
                {showDelete && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-overlay bg-black/65 backdrop-blur-sm"
                            onClick={() => setShowDelete(false)}
                        />
                        <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: -12 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-surface-2 border border-border-strong rounded-2xl p-6
                           w-full max-w-sm shadow-xl"
                            >
                                <div className="text-3xl mb-3 text-center">🗑️</div>
                                <h3 className="text-base font-bold text-text-primary text-center mb-2">
                                    Delete this problem?
                                </h3>
                                <p className="text-sm text-text-tertiary text-center mb-5">
                                    All solutions submitted for this problem will also be deleted.
                                    This cannot be undone.
                                </p>
                                <div className="flex gap-3">
                                    <Button variant="ghost" size="md" fullWidth
                                        onClick={() => setShowDelete(false)}>
                                        Cancel
                                    </Button>
                                    <Button variant="danger" size="md" fullWidth
                                        loading={deleteProblem.isPending}
                                        onClick={handleDelete}>
                                        Delete
                                    </Button>
                                </div>
                            </motion.div>
                        </div>
                    </>
                )}
            </AnimatePresence>
        </div>
    )
}