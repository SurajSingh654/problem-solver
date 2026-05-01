// ============================================================================
// ProbSolver v3.0 — Quiz Controller (Team-Aware)
// ============================================================================
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { AI_ENABLED, AI_MODEL_FAST } from "../config/env.js";

// ============================================================================
// GENERATE QUIZ — with past-attempt intelligence
// ============================================================================
export async function generateQuiz(req, res) {
  try {
    if (!AI_ENABLED) {
      return error(res, "AI features are not enabled.", 503);
    }

    const userId = req.user.id;
    const teamId = req.teamId || null;
    const { subject, difficulty, context } = req.body;
    const { count: countRaw, questionCount } = req.body;
    const count = Math.min(countRaw || questionCount || 10, 20);

    // ── Stage 1: Gather past-attempt intelligence ──────
    // Fetch last 5 COMPLETED attempts on this subject for this user.
    // Only completed attempts have graded answers we can analyze.
    let pastIntelligence = null;
    try {
      const pastAttempts = await prisma.quizAttempt.findMany({
        where: {
          userId,
          subject: {
            // Case-insensitive match — "data structures" == "Data Structures"
            contains: subject.trim(),
            mode: "insensitive",
          },
          answers: { not: null }, // Only completed quizzes
        },
        select: {
          id: true,
          score: true,
          questions: true,
          answers: true,
          aiAnalysis: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      });

      if (pastAttempts.length > 0) {
        // ── Extract questions already asked ──────────────
        // Collect all question texts across all past attempts.
        // Deduplicated so the same question doesn't appear multiple times.
        const askedQuestionsSet = new Set();
        pastAttempts.forEach((attempt) => {
          const qs = attempt.questions;
          if (Array.isArray(qs)) {
            qs.forEach((q) => {
              if (q.question) askedQuestionsSet.add(q.question.trim());
            });
          }
        });
        const askedQuestions = [...askedQuestionsSet];

        // ── Identify persistent weak areas ───────────────
        // A question is "persistently weak" if the user got it wrong
        // in 2 or more separate attempts.
        const wrongCounts = {};
        pastAttempts.forEach((attempt) => {
          const ans = attempt.answers;
          if (Array.isArray(ans)) {
            ans.forEach((a) => {
              if (!a.isCorrect && a.question) {
                const key = a.question.trim();
                wrongCounts[key] = (wrongCounts[key] || 0) + 1;
              }
            });
          }
        });
        const persistentlyWeak = Object.entries(wrongCounts)
          .filter(([, count]) => count >= 2)
          .map(([question]) => question)
          .slice(0, 5); // Top 5 most frequently wrong

        // ── Compute score trend ───────────────────────────
        const scores = pastAttempts
          .map((a) => a.score)
          .filter((s) => s !== null)
          .reverse(); // Oldest first for trend direction

        const avgScore =
          scores.length > 0
            ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
            : null;

        const improving =
          scores.length >= 2 ? scores[scores.length - 1] > scores[0] : null;

        // ── Collect weak topics from AI analysis ─────────
        const allWeakTopics = new Set();
        pastAttempts.forEach((attempt) => {
          if (attempt.aiAnalysis?.weakTopics) {
            attempt.aiAnalysis.weakTopics.forEach((t) => allWeakTopics.add(t));
          }
        });

        pastIntelligence = {
          attemptCount: pastAttempts.length,
          avgScore,
          improving,
          scores,
          askedQuestions,
          persistentlyWeak,
          weakTopics: [...allWeakTopics],
        };
      }
    } catch (err) {
      // Non-fatal — continue with standard generation if intelligence fails
      console.error("Past intelligence gathering failed:", err.message);
    }

    // ── Stage 2: Build intelligent prompt ─────────────
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI();

    // Build the deduplication instruction
    let deduplicationInstruction = "";
    if (pastIntelligence && pastIntelligence.askedQuestions.length > 0) {
      const sampleAsked = pastIntelligence.askedQuestions.slice(0, 30);
      deduplicationInstruction = `
QUESTIONS ALREADY ASKED — do not repeat these or ask questions that test the same concept from the same angle:
${sampleAsked.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Generate questions that cover DIFFERENT concepts or test the SAME concepts from completely different angles.`;
    }

    // Build the weakness targeting instruction
    let weaknessInstruction = "";
    if (
      pastIntelligence &&
      (pastIntelligence.persistentlyWeak.length > 0 ||
        pastIntelligence.weakTopics.length > 0)
    ) {
      const weakAreas = [
        ...pastIntelligence.persistentlyWeak.slice(0, 3),
        ...pastIntelligence.weakTopics.slice(0, 3),
      ].slice(0, 4);

      if (weakAreas.length > 0) {
        weaknessInstruction = `
WEAK AREAS TO TARGET — the user has struggled with these concepts. Include ${Math.min(Math.ceil(count * 0.4), 4)} questions that probe these areas from fresh angles:
${weakAreas.map((a, i) => `${i + 1}. ${a}`).join("\n")}
Do NOT reuse the exact same question text — test the same concept differently.`;
      }
    }

    // Build the progression instruction
    let progressionInstruction = "";
    if (pastIntelligence) {
      if (
        pastIntelligence.improving === true &&
        pastIntelligence.avgScore >= 70
      ) {
        progressionInstruction =
          "PROGRESSION: User is improving and performing well. Include more challenging questions — push toward harder edge cases and less common scenarios.";
      } else if (
        pastIntelligence.improving === false &&
        pastIntelligence.avgScore < 50
      ) {
        progressionInstruction =
          "PROGRESSION: User is struggling. Vary the question angles significantly — try explaining the same concepts through different scenarios and contexts.";
      } else if (pastIntelligence.attemptCount >= 3) {
        progressionInstruction =
          "PROGRESSION: User has taken this quiz multiple times. Focus on depth over breadth — fewer topics but more nuanced questions.";
      }
    }

    const systemPrompt = `You are an expert quiz generator for interview preparation.
Generate exactly ${count} multiple-choice questions on the given subject.
Each question must have exactly 4 options labeled A, B, C, D.
Difficulty level: ${difficulty || "MEDIUM"}.
${context ? `Focus specifically on: ${context}` : ""}
Make ALL four options plausible — wrong options should represent common misconceptions or subtle errors, not obvious wrong answers.
${deduplicationInstruction}
${weaknessInstruction}
${progressionInstruction}
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
}`;

    const response = await openai.chat.completions.create({
      model: AI_MODEL_FAST,
      temperature: 0.8,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Generate a ${difficulty || "MEDIUM"} difficulty quiz on: ${subject}${
            pastIntelligence
              ? ` (Attempt #${pastIntelligence.attemptCount + 1} for this user)`
              : ""
          }`,
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
          // Send back intelligence summary for client display
          pastAttempts: pastIntelligence
            ? {
                count: pastIntelligence.attemptCount,
                avgScore: pastIntelligence.avgScore,
                improving: pastIntelligence.improving,
                weakTopics: pastIntelligence.weakTopics.slice(0, 3),
              }
            : null,
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

    const quiz = await prisma.quizAttempt.findFirst({
      where: { id: quizId, userId },
      select: { id: true, questions: true, answers: true, teamId: true },
    });

    if (!quiz) return error(res, "Quiz not found.", 404);
    if (quiz.answers) return error(res, "Quiz already submitted.", 400);

    const questions = quiz.questions;
    let correct = 0;

    const graded = questions.map((q) => {
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
        graded,
      },
    });
  } catch (err) {
    console.error("Submit quiz error:", err);
    return error(res, "Failed to submit quiz.", 500);
  }
}

// ============================================================================
// SAVE QUIZ FEEDBACK
// ============================================================================
export async function saveQuizFeedback(req, res) {
  try {
    const { quizId } = req.params;
    const userId = req.user.id;
    const { feedback, flaggedQuestions } = req.body;

    const quiz = await prisma.quizAttempt.findFirst({
      where: { id: quizId, userId },
      select: { id: true, aiAnalysis: true },
    });

    if (!quiz) return error(res, "Quiz not found.", 404);

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
// GET QUIZ HISTORY
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
// GET SINGLE QUIZ
// ============================================================================
export async function getQuiz(req, res) {
  try {
    const { quizId } = req.params;
    const userId = req.user.id;

    const quiz = await prisma.quizAttempt.findFirst({
      where: { id: quizId, userId },
    });

    if (!quiz) return error(res, "Quiz not found.", 404);

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
