// ============================================================================
// ProbSolver v3.0 — Quiz Controller (Team-Aware)
// ============================================================================
//
// SCOPING: Quizzes use optionalTeamContext. The quiz itself is personal
// (user types a subject, AI generates questions), but the teamId is
// stored for team stats aggregation. Individual-mode users store their
// personalTeamId.
//
// The quiz generation prompt doesn't change between team/individual mode.
// Team context only affects where the quiz attempt is counted in stats.
//
// ============================================================================

import prisma from '../lib/prisma.js'
import { success, error } from '../utils/response.js'
import { AI_ENABLED, AI_MODEL_FAST } from '../config/env.js'

// ============================================================================
// GENERATE QUIZ
// ============================================================================

export async function generateQuiz(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, 'AI features are not enabled.', 503)
    }

    const userId = req.user.id
    const teamId = req.teamId || null // nullable — works in both modes
    const { subject, difficulty, questionCount } = req.body

    const count = Math.min(questionCount || 10, 20)

    // ── Generate questions via GPT ─────────────────────
    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI()

    const response = await openai.chat.completions.create({
      model: AI_MODEL_FAST,
      temperature: 0.8,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are an expert quiz generator for interview preparation.
Generate exactly ${count} multiple-choice questions on the given subject.
Each question must have exactly 4 options labeled A, B, C, D.
Difficulty level: ${difficulty || 'MEDIUM'}.

Return JSON: {
  "questions": [
    {
      "id": 1,
      "question": "...",
      "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "correctAnswer": "A",
      "explanation": "Brief explanation of why this is correct."
    }
  ]
}`
        },
        {
          role: 'user',
          content: `Generate a ${difficulty || 'medium'} difficulty quiz on: ${subject}`,
        },
      ],
    })

    let questions
    try {
      const parsed = JSON.parse(response.choices[0].message.content)
      questions = parsed.questions
    } catch {
      return error(res, 'Failed to parse AI response. Please try again.', 500)
    }

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return error(res, 'AI failed to generate questions. Please try again.', 500)
    }

    // ── Create quiz attempt record ─────────────────────
    const quiz = await prisma.quizAttempt.create({
      data: {
        userId,
        teamId, // SCOPING: nullable for individual mode
        subject,
        difficulty: difficulty || 'MEDIUM',
        questions, // Store full questions JSON
      },
      select: {
        id: true,
        subject: true,
        difficulty: true,
        questions: true,
        createdAt: true,
      },
    })

    // ── Strip correct answers before sending to client ─
    const clientQuestions = questions.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      // correctAnswer and explanation omitted
    }))

    return success(res, {
      quiz: {
        id: quiz.id,
        subject: quiz.subject,
        difficulty: quiz.difficulty,
        questionCount: clientQuestions.length,
        questions: clientQuestions,
      },
    }, 201)
  } catch (err) {
    console.error('Generate quiz error:', err)
    return error(res, 'Failed to generate quiz.', 500)
  }
}

// ============================================================================
// SUBMIT QUIZ ANSWERS
// ============================================================================

export async function submitQuizAnswers(req, res) {
  try {
    const { quizId } = req.params
    const userId = req.user.id
    const { answers, timeSpent } = req.body

    // ── Find quiz and verify ownership ─────────────────
    const quiz = await prisma.quizAttempt.findFirst({
      where: { id: quizId, userId },
      select: { id: true, questions: true, answers: true, teamId: true },
    })

    if (!quiz) {
      return error(res, 'Quiz not found.', 404)
    }

    if (quiz.answers) {
      return error(res, 'Quiz already submitted.', 400)
    }

    // ── Grade the quiz ─────────────────────────────────
    const questions = quiz.questions
    let correct = 0
    const graded = questions.map((q) => {
      const userAnswer = answers[q.id] || answers[String(q.id)] || null
      const isCorrect = userAnswer === q.correctAnswer
      if (isCorrect) correct++

      return {
        id: q.id,
        question: q.question,
        userAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect,
        explanation: q.explanation,
      }
    })

    const score = Math.round((correct / questions.length) * 100)

    // ── Update quiz attempt ────────────────────────────
    const updated = await prisma.quizAttempt.update({
      where: { id: quizId },
      data: {
        answers: graded,
        score,
        timeSpent: timeSpent || null,
        completedAt: new Date(),
      },
      select: {
        id: true,
        subject: true,
        score: true,
        answers: true,
        timeSpent: true,
        completedAt: true,
      },
    })

    // ── Generate AI analysis in background ─────────────
    if (AI_ENABLED) {
      generateQuizAnalysis(quizId).catch(() => {})
    }

    return success(res, {
      result: {
        quizId: updated.id,
        subject: updated.subject,
        score: updated.score,
        correct,
        total: questions.length,
        timeSpent: updated.timeSpent,
        answers: graded,
      },
    })
  } catch (err) {
    console.error('Submit quiz error:', err)
    return error(res, 'Failed to submit quiz.', 500)
  }
}

// ============================================================================
// GET QUIZ HISTORY (team-scoped)
// ============================================================================

export async function getQuizHistory(req, res) {
  try {
    const userId = req.user.id
    const teamId = req.teamId || null
    const { page = 1, limit = 20 } = req.query

    const where = { userId }
    if (teamId) where.teamId = teamId // SCOPING: filter by team if available

    const [quizzes, total] = await Promise.all([
      prisma.quizAttempt.findMany({
        where,
        select: {
          id: true,
          subject: true,
          difficulty: true,
          score: true,
          timeSpent: true,
          completedAt: true,
          createdAt: true,
          aiAnalysis: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.quizAttempt.count({ where }),
    ])

    return success(res, {
      quizzes,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    })
  } catch (err) {
    console.error('Quiz history error:', err)
    return error(res, 'Failed to fetch quiz history.', 500)
  }
}

// ============================================================================
// GET SINGLE QUIZ (with answers)
// ============================================================================

export async function getQuiz(req, res) {
  try {
    const { quizId } = req.params
    const userId = req.user.id

    const quiz = await prisma.quizAttempt.findFirst({
      where: { id: quizId, userId },
    })

    if (!quiz) {
      return error(res, 'Quiz not found.', 404)
    }

    return success(res, { quiz })
  } catch (err) {
    console.error('Get quiz error:', err)
    return error(res, 'Failed to fetch quiz.', 500)
  }
}

// ============================================================================
// BACKGROUND: AI quiz analysis
// ============================================================================

async function generateQuizAnalysis(quizId) {
  try {
    const quiz = await prisma.quizAttempt.findUnique({
      where: { id: quizId },
      select: { subject: true, score: true, answers: true },
    })

    if (!quiz || !quiz.answers) return

    const wrongAnswers = quiz.answers.filter((a) => !a.isCorrect)
    if (wrongAnswers.length === 0) return

    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI()

    const response = await openai.chat.completions.create({
      model: AI_MODEL_FAST,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Analyze quiz results and identify patterns in wrong answers.
Return JSON: { "weakAreas": ["area1", ...], "advice": "specific study advice", "encouragement": "brief encouragement" }`,
        },
        {
          role: 'user',
          content: `Subject: ${quiz.subject}. Score: ${quiz.score}%.
Wrong answers:\n${wrongAnswers.map((a) => `Q: ${a.question}\nUser: ${a.userAnswer}, Correct: ${a.correctAnswer}`).join('\n\n')}`,
        },
      ],
    })

    const analysis = JSON.parse(response.choices[0].message.content)

    await prisma.quizAttempt.update({
      where: { id: quizId },
      data: { aiAnalysis: analysis },
    })
  } catch (err) {
    console.error('Quiz analysis error:', err.message)
  }
}