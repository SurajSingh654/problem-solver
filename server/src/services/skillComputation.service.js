// ============================================================================
// ProbSolver v3.0 — Skill Computation Service
// ============================================================================
//
// Computes and updates SkillProfile rows based on activity evidence.
//
// TRIGGER POINTS (called fire-and-forget after):
//   - Solution submission with AI review
//   - Quiz completion with score
//   - Mock interview debrief completion
//   - Spaced repetition review submission
//
// FORMULA:
//   rawScore = Σ(evidenceScore × weight) / Σ(weight)
//   decayedScore = rawScore × e^(-daysSinceLastEvidence / (stability × 10))
//   proficiencyLevel = getProfileLevel(decayedScore)
//
// SCIENTIFIC BASIS:
//   Evidence weighting: predictive validity hierarchy
//     AI review → objective rubric → highest validity
//     SM-2 retention → validated memory model → second highest
//     Quiz → declarative knowledge → useful but lowest validity
//   Decay formula: Ebbinghaus (1885), parameterized by SM-2 stability factor
//   Proficiency levels: Dreyfus & Dreyfus (1980) skill acquisition model
//
// ============================================================================
import prisma from "../lib/prisma.js";
import {
  mapPatternToSkills,
  mapQuizSubjectToSkills,
  getSkill,
  getProfileLevel,
  computeDecay,
  SKILL_TAXONOMY,
  getSkillsForCategory,
} from "../utils/skillTaxonomy.js";

// ── Recompute skills after solution AI review ─────────────────────────────
export async function recomputeSkillsFromSolution(solutionId) {
  try {
    const solution = await prisma.solution.findUnique({
      where: { id: solutionId },
      select: {
        userId: true,
        pattern: true,
        confidence: true,
        sm2EasinessFactor: true,
        sm2Repetitions: true,
        lastReviewedAt: true,
        createdAt: true,
        aiFeedback: true,
        problem: {
          select: { category: true },
        },
      },
    });

    if (!solution) return;

    // Get skill ids this solution contributes to
    const skillIds = mapPatternToSkills(solution.pattern);

    // Also add category-level skills for non-CODING categories
    if (solution.problem?.category && solution.problem.category !== "CODING") {
      const categorySkills = getSkillsForCategory(solution.problem.category);
      categorySkills.forEach((s) => {
        if (!skillIds.includes(s.skillId)) skillIds.push(s.skillId);
      });
    }

    if (skillIds.length === 0) return;

    // Extract AI review score
    let aiScore = null;
    if (solution.aiFeedback && Array.isArray(solution.aiFeedback)) {
      const latest = solution.aiFeedback[solution.aiFeedback.length - 1];
      if (latest?.overallScore) {
        aiScore = (latest.overallScore / 10) * 100; // normalize 1-10 → 0-100
      }
    }

    // Compute SM-2 retention signal
    const now = Date.now();
    const lastInteraction = solution.lastReviewedAt || solution.createdAt;
    const daysSince =
      (now - new Date(lastInteraction).getTime()) / (1000 * 60 * 60 * 24);
    const ef = solution.sm2EasinessFactor ?? 2.5;
    const reps = solution.sm2Repetitions ?? 0;
    const stability = Math.max(1, ef * Math.pow(reps + 1, 0.7));
    const sm2RetentionScore = Math.exp(-daysSince / (stability * 10)) * 100;

    // Confidence calibration (self-reported — lower weight)
    const confidenceScore = (solution.confidence / 5) * 100;

    for (const skillId of skillIds) {
      const skillConfig = getSkill(skillId);
      if (!skillConfig) continue;

      const weights = skillConfig.weights;

      // Weighted evidence combination
      let weightedSum = 0;
      let totalWeight = 0;

      if (aiScore !== null && weights.AI_REVIEW > 0) {
        weightedSum += aiScore * weights.AI_REVIEW;
        totalWeight += weights.AI_REVIEW;
      }

      if (weights.SM2_RETENTION > 0) {
        weightedSum += sm2RetentionScore * weights.SM2_RETENTION;
        totalWeight += weights.SM2_RETENTION;
      }

      if (totalWeight === 0) continue;

      const evidenceScore = weightedSum / totalWeight;

      await upsertSkillProfile(
        solution.userId,
        skillId,
        skillConfig,
        evidenceScore,
        daysSince,
        stability,
      );
    }
  } catch (err) {
    console.error(
      "[SkillComputation] recomputeSkillsFromSolution error:",
      err.message,
    );
  }
}

// ── Recompute skills after quiz completion ────────────────────────────────
export async function recomputeSkillsFromQuiz(quizAttemptId) {
  try {
    const quiz = await prisma.quizAttempt.findUnique({
      where: { id: quizAttemptId },
      select: {
        userId: true,
        subject: true,
        score: true,
        difficulty: true,
        completedAt: true,
      },
    });

    if (!quiz || quiz.score === null || !quiz.completedAt) return;

    const skillIds = mapQuizSubjectToSkills(quiz.subject);
    if (skillIds.length === 0) return;

    // Difficulty multiplier — harder quizzes are more reliable evidence
    const difficultyMultiplier =
      quiz.difficulty === "HARD"
        ? 1.2
        : quiz.difficulty === "MEDIUM"
          ? 1.0
          : 0.8;

    const quizEvidenceScore = Math.min(quiz.score * difficultyMultiplier, 100);

    const daysSince =
      (Date.now() - new Date(quiz.completedAt).getTime()) /
      (1000 * 60 * 60 * 24);

    for (const skillId of skillIds) {
      const skillConfig = getSkill(skillId);
      if (!skillConfig) continue;

      const weights = skillConfig.weights;
      if (!weights.QUIZ || weights.QUIZ === 0) continue;

      // For quiz-only evidence, use quiz weight as full contribution
      const evidenceScore = quizEvidenceScore;

      await upsertSkillProfile(
        quiz.userId,
        skillId,
        skillConfig,
        evidenceScore,
        daysSince,
        10,
      );
    }
  } catch (err) {
    console.error(
      "[SkillComputation] recomputeSkillsFromQuiz error:",
      err.message,
    );
  }
}

// ── Recompute skills after mock interview debrief ─────────────────────────
export async function recomputeSkillsFromInterview(interviewSessionId) {
  try {
    const session = await prisma.interviewSession.findUnique({
      where: { id: interviewSessionId },
      select: {
        userId: true,
        category: true,
        scores: true,
        status: true,
        completedAt: true,
      },
    });

    if (!session || session.status !== "COMPLETED" || !session.scores) return;

    const scores = session.scores;
    if (!scores || typeof scores !== "object") return;

    // Get skills relevant to this interview category
    const categorySkills = getSkillsForCategory(session.category);
    if (!categorySkills.length) return;

    const daysSince = session.completedAt
      ? (Date.now() - new Date(session.completedAt).getTime()) /
        (1000 * 60 * 60 * 24)
      : 0;

    // Normalize interview scores to 0-100
    const normalizedScores = [];
    const scale10Fields = [
      "problemDecomposition",
      "codeCorrectness",
      "communicationWhileCoding",
      "edgeCaseHandling",
      "optimizationAbility",
    ];
    scale10Fields.forEach((field) => {
      if (scores[field] != null && typeof scores[field] === "number") {
        normalizedScores.push((scores[field] / 10) * 100);
      }
    });

    if (normalizedScores.length === 0) return;
    const interviewEvidenceScore =
      normalizedScores.reduce((a, b) => a + b, 0) / normalizedScores.length;

    for (const skillConfig of categorySkills) {
      const weights = skillConfig.weights;
      if (!weights.INTERVIEW || weights.INTERVIEW === 0) continue;

      await upsertSkillProfile(
        session.userId,
        skillConfig.skillId,
        skillConfig,
        interviewEvidenceScore,
        daysSince,
        15,
      );
    }
  } catch (err) {
    console.error(
      "[SkillComputation] recomputeSkillsFromInterview error:",
      err.message,
    );
  }
}

// ── Core upsert function ──────────────────────────────────────────────────
// Called by all three trigger functions above.
// Merges new evidence with existing profile using exponential moving average.
async function upsertSkillProfile(
  userId,
  skillId,
  skillConfig,
  newEvidenceScore,
  daysSinceEvidence,
  stability,
) {
  const existing = await prisma.skillProfile.findUnique({
    where: { userId_skillId: { userId, skillId } },
  });

  let newRawScore;
  let newEvidenceCount;

  if (!existing) {
    // First evidence for this skill
    newRawScore = newEvidenceScore;
    newEvidenceCount = 1;
  } else {
    // Exponential moving average — recent evidence weighted more heavily
    // Alpha = 0.3: new evidence gets 30%, historical gets 70%
    // This prevents single outlier scores from dominating
    const alpha = 0.3;
    newRawScore = alpha * newEvidenceScore + (1 - alpha) * existing.rawScore;
    newEvidenceCount = existing.evidenceCount + 1;
  }

  // Apply Ebbinghaus decay to get displayed score
  const decayedScore = computeDecay(newRawScore, daysSinceEvidence, stability);
  const proficiencyLevel = getProfileLevel(decayedScore);

  // Compute trend from evidence history (simplified: compare to previous raw score)
  let trend = existing?.trend || null;
  if (existing && newEvidenceCount >= 3) {
    const delta = newRawScore - existing.rawScore;
    trend = delta > 3 ? "improving" : delta < -3 ? "declining" : "stable";
  }

  await prisma.skillProfile.upsert({
    where: { userId_skillId: { userId, skillId } },
    create: {
      userId,
      skillId,
      skillCategory: skillConfig.category,
      rawScore: Math.min(Math.round(newRawScore * 10) / 10, 100),
      decayedScore: Math.min(Math.round(decayedScore * 10) / 10, 100),
      proficiencyLevel,
      evidenceCount: 1,
      lastEvidenceAt: new Date(),
      trend: null,
    },
    update: {
      rawScore: Math.min(Math.round(newRawScore * 10) / 10, 100),
      decayedScore: Math.min(Math.round(decayedScore * 10) / 10, 100),
      proficiencyLevel,
      evidenceCount: newEvidenceCount,
      lastEvidenceAt: new Date(),
      trend,
      updatedAt: new Date(),
    },
  });
}

// ── Get full skill profile for a user ────────────────────────────────────
export async function getUserSkillProfile(userId) {
  const profiles = await prisma.skillProfile.findMany({
    where: { userId },
    orderBy: [{ skillCategory: "asc" }, { decayedScore: "desc" }],
  });

  // Enrich with taxonomy metadata
  return profiles.map((profile) => ({
    ...profile,
    skillConfig: getSkill(profile.skillId),
  }));
}

// ── Refresh decay scores (called by daily cron) ───────────────────────────
// Decay scores change daily even without new evidence.
// This job updates decayedScore and proficiencyLevel for all active profiles.
export async function refreshDecayScores() {
  const profiles = await prisma.skillProfile.findMany({
    where: {
      lastEvidenceAt: { not: null },
      rawScore: { gt: 0 },
    },
    select: {
      id: true,
      rawScore: true,
      lastEvidenceAt: true,
      skillId: true,
    },
  });

  const now = Date.now();
  const updates = [];

  for (const profile of profiles) {
    const skillConfig = getSkill(profile.skillId);
    if (!skillConfig) continue;

    const daysSince =
      (now - new Date(profile.lastEvidenceAt).getTime()) /
      (1000 * 60 * 60 * 24);
    const decayedScore = computeDecay(profile.rawScore, daysSince);
    const proficiencyLevel = getProfileLevel(decayedScore);

    updates.push(
      prisma.skillProfile.update({
        where: { id: profile.id },
        data: {
          decayedScore: Math.min(Math.round(decayedScore * 10) / 10, 100),
          proficiencyLevel,
        },
      }),
    );
  }

  // Batch in groups of 50 to avoid overwhelming the connection pool
  for (let i = 0; i < updates.length; i += 50) {
    await Promise.all(updates.slice(i, i + 50));
  }

  console.log(
    `[SkillComputation] Refreshed decay scores for ${updates.length} profiles`,
  );
}
