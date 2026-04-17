import prisma from "../lib/prisma.js";
import { aiComplete } from "../services/ai.service.js";
import {
  quizGenerationPrompt,
  quizAnalysisPrompt,
} from "../services/ai.prompts.js";
import {
  quizQuestionsSchema,
  quizAnalysisSchema,
  validateAIResponse,
} from "../services/ai.schemas.js";
import {
  successResponse,
  createdResponse,
  notFoundResponse,
  errorResponse,
} from "../utils/response.js";

// ── POST /api/quizzes/generate ─────────────────────────
// AI generates quiz questions live based on user input
export async function generateQuiz(req, res) {
  const userId = req.user.id;
  const { subject, difficulty, count, context } = req.body;

  if (!subject || !subject.trim()) {
    return errorResponse(res, "Subject is required", 400);
  }

  const questionCount = Math.min(Math.max(parseInt(count) || 5, 3), 25);

  const { system, user } = quizGenerationPrompt({
    subject: subject.trim(),
    difficulty: difficulty || "MEDIUM",
    count: questionCount,
    context: context || "",
  });

  const raw = await aiComplete({
    systemPrompt: system,
    userPrompt: user,
    userId,
    maxTokens: 4000,
    temperature: 0.8,
  });

  const validation = validateAIResponse(quizQuestionsSchema, raw);
  if (!validation.valid) {
    return errorResponse(
      res,
      "AI returned invalid quiz format. Try again.",
      500,
    );
  }

  return successResponse(
    res,
    {
      title: raw.title || `${subject} Quiz`,
      subject,
      difficulty,
      questions: validation.data.questions,
    },
    "Quiz generated",
  );
}

// ── POST /api/quizzes/submit ───────────────────────────
// Submit completed quiz attempt with answers
export async function submitQuizAttempt(req, res) {
  const userId = req.user.id;
  const { subject, difficulty, questions, answers, timeUsedSecs } = req.body;

  if (!questions?.length || !answers?.length) {
    return errorResponse(res, "Questions and answers are required", 400);
  }

  // Score the attempt
  let score = 0;
  const gradedQuestions = questions.map((q, i) => {
    const userAnswer = answers[i];
    const selected = userAnswer?.selected ?? -1;
    const isCorrect = selected === q.correctIndex;

    if (isCorrect) score++;

    return {
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      selected,
      correct: isCorrect,
      explanation: q.explanation,
      difficulty: q.difficulty,
    };
  });

  const total = questions.length;
  const percentage = Math.round((score / total) * 100);

  // Save attempt
  const attempt = await prisma.quizAttempt.create({
    data: {
      userId,
      subject: subject || "General",
      difficulty: difficulty || "MEDIUM",
      questionCount: total,
      score,
      total,
      percentage,
      timeUsedSecs: timeUsedSecs || null,
      questions: JSON.stringify(gradedQuestions),
    },
  });

  return createdResponse(
    res,
    {
      ...attempt,
      questions: gradedQuestions,
    },
    `Quiz completed — ${score}/${total} (${percentage}%)`,
  );
}

// ── POST /api/quizzes/:id/analyze ──────────────────────
// AI analyzes quiz performance and gives study advice
export async function analyzeQuizAttempt(req, res) {
  const { id } = req.params;
  const userId = req.user.id;

  const attempt = await prisma.quizAttempt.findUnique({ where: { id } });
  if (!attempt) return notFoundResponse(res, "Quiz attempt");
  if (attempt.userId !== userId) {
    return errorResponse(res, "Not your quiz attempt", 403);
  }

  const questions = JSON.parse(attempt.questions || "[]");
  const wrongAnswers = questions
    .filter((q) => !q.correct)
    .map((q) => ({
      question: q.question,
      selectedOption: q.options[q.selected] || "No answer",
      correctOption: q.options[q.correctIndex],
    }));

  if (wrongAnswers.length === 0) {
    const perfectAnalysis = {
      summary: `Perfect score on ${attempt.subject}! You got all ${attempt.total} questions correct.`,
      weakTopics: [],
      studyAdvice: ["Try harder difficulty to challenge yourself further."],
      encouragement: "Excellent work! You have strong command of this subject.",
    };

    await prisma.quizAttempt.update({
      where: { id },
      data: {
        aiAnalysis: JSON.stringify(perfectAnalysis),
        aiSuggestions: JSON.stringify(perfectAnalysis.studyAdvice),
      },
    });

    return successResponse(res, perfectAnalysis, "Analysis complete");
  }

  const { system, user } = quizAnalysisPrompt({
    category: attempt.subject,
    score: attempt.score,
    total: attempt.total,
    percentage: attempt.percentage,
    wrongAnswers,
  });

  const raw = await aiComplete({
    systemPrompt: system,
    userPrompt: user,
    userId,
    maxTokens: 1000,
  });

  const validation = validateAIResponse(quizAnalysisSchema, raw);
  if (!validation.valid) {
    return errorResponse(res, "AI analysis failed. Try again.", 500);
  }

  // Save analysis
  await prisma.quizAttempt.update({
    where: { id },
    data: {
      aiAnalysis: JSON.stringify(validation.data),
      aiSuggestions: JSON.stringify(validation.data.studyAdvice || []),
    },
  });

  return successResponse(res, validation.data, "Analysis complete");
}

// ── GET /api/quizzes/my-attempts ───────────────────────
export async function getMyAttempts(req, res) {
  const userId = req.user.id;

  const attempts = await prisma.quizAttempt.findMany({
    where: { userId },
    orderBy: { completedAt: "desc" },
    take: 50,
  });

  return successResponse(
    res,
    attempts.map((a) => ({
      ...a,
      questions: JSON.parse(a.questions || "[]"),
      aiAnalysis: a.aiAnalysis ? JSON.parse(a.aiAnalysis) : null,
      aiSuggestions: JSON.parse(a.aiSuggestions || "[]"),
    })),
  );
}

// ── GET /api/quizzes/attempt/:id ───────────────────────
export async function getAttemptById(req, res) {
  const { id } = req.params;
  const userId = req.user.id;

  const attempt = await prisma.quizAttempt.findUnique({ where: { id } });
  if (!attempt) return notFoundResponse(res, "Quiz attempt");
  if (attempt.userId !== userId) {
    return errorResponse(res, "Not your quiz attempt", 403);
  }

  return successResponse(res, {
    ...attempt,
    questions: JSON.parse(attempt.questions || "[]"),
    aiAnalysis: attempt.aiAnalysis ? JSON.parse(attempt.aiAnalysis) : null,
    aiSuggestions: JSON.parse(attempt.aiSuggestions || "[]"),
  });
}

// ── GET /api/quizzes/subjects ──────────────────────────
// Returns unique subjects from user's history for quick re-take
export async function getMySubjects(req, res) {
  const userId = req.user.id;

  const attempts = await prisma.quizAttempt.findMany({
    where: { userId },
    select: { subject: true, difficulty: true, percentage: true },
    orderBy: { completedAt: "desc" },
  });

  // Group by subject
  const subjectMap = {};
  attempts.forEach((a) => {
    if (!subjectMap[a.subject]) {
      subjectMap[a.subject] = {
        subject: a.subject,
        attempts: 0,
        bestScore: 0,
        lastDifficulty: a.difficulty,
      };
    }
    subjectMap[a.subject].attempts++;
    subjectMap[a.subject].bestScore = Math.max(
      subjectMap[a.subject].bestScore,
      a.percentage,
    );
  });

  return successResponse(res, Object.values(subjectMap));
}
