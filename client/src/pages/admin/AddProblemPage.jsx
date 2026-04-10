import { useNavigate } from 'react-router-dom'
import { ProblemForm } from '@components/features/admin/ProblemForm'
import { useCreateProblem } from '@hooks/useProblems'
import { Button } from '@components/ui/Button'

export default function AddProblemPage() {
    const navigate = useNavigate()
    const createProblem = useCreateProblem()

    async function handleSubmit(data) {
        await createProblem.mutateAsync(data)
        navigate('/admin')
    }

    return (
        <div className="p-6 max-w-[720px] mx-auto">
            <button
                onClick={() => navigate('/admin')}
                className="flex items-center gap-1.5 text-sm text-text-tertiary
                   hover:text-text-primary transition-colors mb-6"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12" />
                    <polyline points="12 19 5 12 12 5" />
                </svg>
                Back to Admin
            </button>

            <div className="mb-6">
                <h1 className="text-2xl font-extrabold text-text-primary mb-1">
                    Add Problem
                </h1>
                <p className="text-sm text-text-tertiary">
                    Create a new problem for your team to solve
                </p>
            </div>

            <ProblemForm
                onSubmit={handleSubmit}
                isSubmitting={createProblem.isPending}
                submitLabel="Create Problem"
            />
        </div>
    )
}