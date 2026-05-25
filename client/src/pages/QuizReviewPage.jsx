// ============================================================================
// Quiz Review — read-only render of a previously-submitted attempt
// ============================================================================
//
// Why this exists: QuizPage was an in-component state machine. Once a user
// submitted a quiz and refreshed/closed the tab, the ResultsScreen state
// (questions, graded answers, AI analysis) was unrecoverable through the UI
// even though the server persisted everything. This page is the missing
// surface — a deep-linkable URL the user can return to at any time to see
// their answers, the correct answers, the explanations, and the AI coaching
// they paid GPT-4o to generate.
//
// Reported by Jayshree (binary-thinkers team), 2026-05-25.
// ============================================================================

import { useNavigate, useParams } from 'react-router-dom'
import { useQuiz, useRetryQuiz } from '@hooks/useQuiz'
import { Spinner } from '@components/ui/Spinner'
import { Button } from '@components/ui/Button'
import { ResultsScreen } from './QuizPage'

export default function QuizReviewPage() {
    const { quizId } = useParams()
    const navigate = useNavigate()
    const { data: quiz, isLoading, isError, error } = useQuiz(quizId)
    const retryQuiz = useRetryQuiz()

    if (isLoading) {
        return (
            <div className="p-6 flex justify-center">
                <Spinner size="lg" />
            </div>
        )
    }

    if (isError || !quiz) {
        const status = error?.response?.status
        const message =
            status === 404
                ? "We couldn't find that quiz. It may have been deleted, or it belongs to a different account."
                : 'Failed to load this quiz. Please try again in a moment.'
        return (
            <div className="p-6 max-w-[600px] mx-auto text-center space-y-4">
                <p className="text-base font-bold text-text-primary">Quiz not available</p>
                <p className="text-sm text-text-tertiary leading-relaxed">{message}</p>
                <Button variant="primary" size="sm" onClick={() => navigate('/quizzes')}>
                    Back to Quizzes
                </Button>
            </div>
        )
    }

    // Pre-submit state — the server stamps `answers` only at submit time.
    // If a user navigates here for an in-progress quiz (shouldn't be normal,
    // but defend against it), surface that explicitly instead of crashing
    // ResultsScreen with empty gradedAnswers.
    if (!quiz.answers || !Array.isArray(quiz.answers) || quiz.answers.length === 0) {
        return (
            <div className="p-6 max-w-[600px] mx-auto text-center space-y-4">
                <p className="text-base font-bold text-text-primary">
                    This quiz hasn't been submitted yet.
                </p>
                <p className="text-sm text-text-tertiary leading-relaxed">
                    Finish the quiz from the home screen first; the review will be available
                    here once you submit.
                </p>
                <Button variant="primary" size="sm" onClick={() => navigate('/quizzes')}>
                    Back to Quizzes
                </Button>
            </div>
        )
    }

    // Map persisted shape → ResultsScreen props. The server already stores
    // `answers` in the graded shape ResultsScreen consumes (see
    // submitQuizAnswers in quiz.controller.js), so this is a passthrough.
    const quizData = {
        id: quiz.id,
        subject: quiz.subject,
        difficulty: quiz.difficulty,
        isRetry: quiz.isRetry,
        questions: quiz.questions,
        timerSecs: null,
    }

    return (
        <ResultsScreen
            quizData={quizData}
            gradedAnswers={quiz.answers}
            timeUsed={quiz.timeSpent ?? 0}
            quizId={quiz.id}
            onNewQuiz={() => navigate('/quizzes')}
            onRetry={async () => {
                try {
                    // Retry creates a fresh attempt server-side; navigate to
                    // /quizzes and pass the new id via location state so
                    // QuizPage can pick up the active session on mount.
                    const res = await retryQuiz.mutateAsync(quizId)
                    const newQuiz = res.data.data.quiz
                    navigate('/quizzes', { state: { resumeQuiz: newQuiz } })
                } catch {
                    navigate('/quizzes')
                }
            }}
        />
    )
}
