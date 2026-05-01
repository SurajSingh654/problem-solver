// ============================================================================
// ProbSolver v3.0 — Quiz Controller (Team-Aware)
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { AI_ENABLED, AI_MODEL_FAST } from "../config/env.js";

// ============================================================================
// GENERATE QUIZ
// ============================================================================
export async function generateQuiz(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, "AI features are not enabled.", 503);
    }

    const userId = req.user.id;
    const teamId = req.teamId || null;

    const { subject, difficulty, context } = req.body;

    // Bug 1 fix: accept both 'count' (client sends this) and
    // 'questionCount' (legacy) so neither breaks
    const { count: countRaw, questionCount } = req.body;
    const count = Math.min(countRaw || questionCount || 10, 20);

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI();

    const response = await openai.chat.completions.create({
      model: AI_MODEL_FAST,
      temperature: 0.8,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an expert quiz generator for interview preparation.
Generate exactly ${count} multiple-choice questions on the given subject.
Each question must have exactly 4 options labeled A, B, C, D.
Difficulty level: ${difficulty || "MEDIUM"}.
${context ? `Focus specifically on: ${context}` : ""}
Make ALL four options plausible — wrong options should represent common misconceptions or subtle errors, not obvious wrong answers.
Return JSON:
{
  "questions": [
    {
      "id": <number 1 to ${count}>,
      "question": "...",
      "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "correctAnswer": "A",
      "explanation": "Brief explanation of why this is correct and why the other options are wrong.",
      "difficulty": "EASY" | "MEDIUM" | "HARD"
    }
  ]
}`,
        },
        {
          role: "user",
          content: `Generate a ${difficulty || "MEDIUM"} difficulty quiz on: ${subject}`,
        },
      ],
    });

    let questions;
    try {
      const parsed = JSON.parse(response.choices[0].message.content);
      questions = parsed.questions;
    } catch {
      return error(res, "Failed to parse AI response. Please try again.", 500);
    }

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return error(
        res,
        "AI failed to generate questions. Please try again.",
        500,
      );
    }

    // Create quiz attempt record
    const quiz = await prisma.quizAttempt.create({
      data: {
        userId,
        teamId,
        subject,
        difficulty: difficulty || "MEDIUM",
        questions,
      },
      select: {
        id: true,
        subject: true,
        difficulty: true,
        questions: true,
        createdAt: true,
      },
    });

    // Strip correct answers and explanations before sending to client
    const clientQuestions = questions.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      difficulty: q.difficulty,
      // correctAnswer and explanation intentionally omitted
    }));

    return success(
      res,
      {
        quiz: {
          id: quiz.id,
          subject: quiz.subject,
          difficulty: quiz.difficulty,
          questionCount: clientQuestions.length,
          questions: clientQuestions,
        },
      },
      201,
    );
  } catch (err) {
    console.error("Generate quiz error:", err);
    return error(res, "Failed to generate quiz.", 500);
  }
}

// ============================================================================
// SUBMIT QUIZ ANSWERS
// ============================================================================
export async function submitQuizAnswers(req, res) {
  try {
    const { quizId } = req.params;
    const userId = req.user.id;
    const { answers, timeSpent } = req.body;

    // answers expected format: { [questionId]: "A" | "B" | "C" | "D" }
    // This is the authoritative grading — client sends raw selections,
    // server grades against stored correct answers

    const quiz = await prisma.quizAttempt.findFirst({
      where: { id: quizId, userId },
      select: { id: true, questions: true, answers: true, teamId: true },
    });

    if (!quiz) {
      return error(res, "Quiz not found.", 404);
    }

    if (quiz.answers) {
      return error(res, "Quiz already submitted.", 400);
    }

    const questions = quiz.questions;
    let correct = 0;

    const graded = questions.map((q) => {
      // Support both numeric and string keys for robustness
      const userAnswer = answers[q.id] ?? answers[String(q.id)] ?? null;
      const isCorrect = userAnswer !== null && userAnswer === q.correctAnswer;
      if (isCorrect) correct++;
      return {
        id: q.id,
        question: q.question,
        userAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect,
        explanation: q.explanation,
        options: q.options,
      };
    });

    const score = Math.round((correct / questions.length) * 100);

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
    });

    // Generate AI analysis in background
    if (AI_ENABLED) {
      generateQuizAnalysis(quizId).catch(() => {});
    }

    return success(res, {
      result: {
        quizId: updated.id,
        subject: updated.subject,
        score: updated.score,
        correct,
        total: questions.length,
        timeSpent: updated.timeSpent,
        graded, // Full graded array — client uses this for results screen
      },
    });
  } catch (err) {
    console.error("Submit quiz error:", err);
    return error(res, "Failed to submit quiz.", 500);
  }
}

// ============================================================================
// GET QUIZ ANALYSIS
// ============================================================================
// Bug 3 fix: dedicated endpoint to fetch aiAnalysis from the quiz record.
// generateQuizAnalysis runs in background after submit. This endpoint
// returns it once ready, or null if still processing.
export async function getQuizAnalysis(req, res) {
  try {
    const { quizId } = req.params;
    const userId = req.user.id;

    const quiz = await prisma.quizAttempt.findFirst({
      where: { id: quizId, userId },
      select: {
        id: true,
        aiAnalysis: true,
        score: true,
        completedAt: true,
      },
    });

    if (!quiz) {
      return error(res, "Quiz not found.", 404);
    }

    return success(res, {
      analysis: quiz.aiAnalysis || null,
      ready: !!quiz.aiAnalysis,
    });
  } catch (err) {
    console.error("Get quiz analysis error:", err);
    return error(res, "Failed to fetch quiz analysis.", 500);
  }
}

// ============================================================================
// SAVE QUIZ FEEDBACK
// ============================================================================
// Bug 4 fix: actually persist user feedback and flagged questions.
// Previously the UI showed a feedback form but submitted nothing.
export async function saveQuizFeedback(req, res) {
  try {
    const { quizId } = req.params;
    const userId = req.user.id;
    const { feedback, flaggedQuestions } = req.body;

    const quiz = await prisma.quizAttempt.findFirst({
      where: { id: quizId, userId },
      select: { id: true, aiAnalysis: true },
    });

    if (!quiz) {
      return error(res, "Quiz not found.", 404);
    }

    // Merge feedback into aiAnalysis JSON — no schema change needed
    const existingAnalysis = quiz.aiAnalysis || {};
    const updatedAnalysis = {
      ...existingAnalysis,
      userFeedback: feedback || null,
      flaggedQuestions: flaggedQuestions || [],
      feedbackSubmittedAt: new Date().toISOString(),
    };

    await prisma.quizAttempt.update({
      where: { id: quizId },
      data: { aiAnalysis: updatedAnalysis },
    });

    return success(res, { message: "Feedback saved." });
  } catch (err) {
    console.error("Save quiz feedback error:", err);
    return error(res, "Failed to save feedback.", 500);
  }
}

// ============================================================================
// GET QUIZ HISTORY (team-scoped)
// ============================================================================
export async function getQuizHistory(req, res) {
  try {
    const userId = req.user.id;
    const teamId = req.teamId || null;
    const { page = 1, limit = 20 } = req.query;

    const where = { userId };
    if (teamId) where.teamId = teamId;

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
        orderBy: { createdAt: "desc" },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.quizAttempt.count({ where }),
    ]);

    return success(res, {
      quizzes,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Quiz history error:", err);
    return error(res, "Failed to fetch quiz history.", 500);
  }
}

// ============================================================================
// GET SINGLE QUIZ (with answers — for review)
// ============================================================================
export async function getQuiz(req, res) {
  try {
    const { quizId } = req.params;
    const userId = req.user.id;

    const quiz = await prisma.quizAttempt.findFirst({
      where: { id: quizId, userId },
    });

    if (!quiz) {
      return error(res, "Quiz not found.", 404);
    }

    return success(res, { quiz });
  } catch (err) {
    console.error("Get quiz error:", err);
    return error(res, "Failed to fetch quiz.", 500);
  }
}

// ============================================================================
// BACKGROUND: Generate AI analysis after submit
// ============================================================================
async function generateQuizAnalysis(quizId) {
  try {
    const quiz = await prisma.quizAttempt.findUnique({
      where: { id: quizId },
      select: { subject: true, score: true, answers: true, difficulty: true },
    });

    if (!quiz || !quiz.answers) return;

    const wrongAnswers = quiz.answers.filter((a) => !a.isCorrect);
    if (wrongAnswers.length === 0) {
      // Perfect score — save a congratulatory analysis
      await prisma.quizAttempt.update({
        where: { id: quizId },
        data: {
          aiAnalysis: {
            summary: `Perfect score on ${quiz.subject}! Outstanding mastery of this topic.`,
            weakTopics: [],
            studyAdvice: [
              "Challenge yourself with a harder difficulty next time.",
            ],
            encouragement:
              "Excellent work — you clearly understand this subject deeply.",
          },
        },
      });
      return;
    }

    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI();

    const response = await openai.chat.completions.create({
      model: AI_MODEL_FAST,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an interview coach analyzing quiz results to give targeted study advice.
Identify specific knowledge gaps from the wrong answers.
Return JSON:
{
  "summary": "2-3 sentence overview of performance and main gaps",
  "weakTopics": ["specific topic 1", "specific topic 2"],
  "studyAdvice": ["specific actionable advice 1", "specific actionable advice 2", "specific actionable advice 3"],
  "encouragement": "one motivating sentence"
}`,
        },
        {
          role: "user",
          content: `Subject: ${quiz.subject}. Difficulty: ${quiz.difficulty}. Score: ${quiz.score}%.
Wrong answers (${wrongAnswers.length} of ${quiz.answers.length}):
${wrongAnswers
  .map(
    (a) =>
      `Q: ${a.question}\nSelected: ${a.userAnswer}, Correct: ${a.correctAnswer}\nExplanation: ${a.explanation || "N/A"}`,
  )
  .join("\n\n")}`,
        },
      ],
    });

    const analysis = JSON.parse(response.choices[0].message.content);

    await prisma.quizAttempt.update({
      where: { id: quizId },
      data: { aiAnalysis: analysis },
    });
  } catch (err) {
    console.error("Quiz analysis error:", err.message);
  }
}
