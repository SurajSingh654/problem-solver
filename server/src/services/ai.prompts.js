/**
 * AI PROMPTS — All prompt templates in one place.
 * Separated from service for easy tuning without touching logic.
 */

// ── Solution Review ────────────────────────────────────
export function solutionReviewPrompt(data) {
  const system = `You are an expert coding interview coach. You review solutions submitted by engineers preparing for top tech interviews (Google, Meta, Amazon, etc.).

Your job is to give specific, actionable feedback. Be encouraging but honest. Focus on what matters in a real interview.

ALWAYS respond in this exact JSON format:
{
  "overallScore": <number 1-10>,
  "strengths": [<string>, <string>, ...],
  "gaps": [<string>, <string>, ...],
  "improvement": <string — one specific, actionable improvement>,
  "interviewTip": <string — one tip for presenting this in a real interview>,
  "complexityCheck": {
    "timeCorrect": <boolean>,
    "spaceCorrect": <boolean>,
    "timeNote": <string or null>,
    "spaceNote": <string or null>
  }
}`;

  const user = `Review this solution:

**Problem:** ${data.problemTitle}
**Difficulty:** ${data.difficulty}
**Pattern Used:** ${data.pattern || "Not identified"}

**Approach:**
${data.approach || "Not provided"}

**Time Complexity:** ${data.timeComplexity || "Not stated"}
**Space Complexity:** ${data.spaceComplexity || "Not stated"}

**Code:**
\`\`\`${data.language || "python"}
${data.code || "No code provided"}
\`\`\`

**Key Insight:** ${data.keyInsight || "Not provided"}
**Explanation:** ${data.explanation || "Not provided"}

Give specific feedback. If the approach or complexity is wrong, explain why. If the explanation is unclear, suggest how to make it interview-ready.`;

  return { system, user };
}

// ── Problem Content Generation ─────────────────────────
export function problemContentPrompt(data) {
  const system = `You are a senior engineering interview coach who creates learning content for a team preparation platform.

Given a coding problem, generate educational content that helps engineers understand the real-world significance and deepen their learning.

ALWAYS respond in this exact JSON format:
{
  "realWorldContext": <string — 2-3 sentences explaining where this pattern appears in real production software. Start with what pattern this teaches, then give specific real-world examples.>,
  "useCases": [<string>, <string>, ...] — 5-6 specific use cases, format: "System — what it uses this pattern for",
  "adminNotes": <string — teaching guide with: (1) numbered approaches from brute force to optimal with complexity, (2) bullet point edge cases, (3) one "best teaching moment" insight>,
  "followUps": [
    {
      "question": <string>,
      "difficulty": "EASY" | "MEDIUM" | "HARD",
      "hint": <string — 1-2 sentences nudging toward approach without giving answer>
    }
  ] — exactly 3 follow-ups progressing EASY → MEDIUM → HARD
}`;

  const user = `Generate content for this problem:

**Title:** ${data.title}
**Source:** ${data.source}
**URL:** ${data.sourceUrl}
**Difficulty:** ${data.difficulty}
**Tags:** ${data.tags?.join(", ") || "None"}

Generate real-world context, use cases, admin teaching notes, and 3 follow-up questions (EASY, MEDIUM, HARD) with hints.`;

  return { system, user };
}

// ── Hint Generation (for Interview Sim) ────────────────
export function hintGenerationPrompt(data) {
  const system = `You are an interview coach providing progressive hints during a timed interview simulation.

The candidate is working on a problem and needs a nudge WITHOUT being given the answer.

Based on how much time has elapsed and the hint level requested, provide an appropriate hint.

ALWAYS respond in this exact JSON format:
{
  "hint": <string — the hint, 1-3 sentences>,
  "level": <number 1-3 — how direct the hint is>,
  "encouragement": <string — one short encouraging sentence>
}`;

  const user = `Problem: ${data.problemTitle}
Difficulty: ${data.difficulty}
Pattern: ${data.pattern || "Unknown"}
Time elapsed: ${data.timeElapsed} seconds of ${data.timeLimit} seconds
Hint level requested: ${data.hintLevel || 1} (1=vague nudge, 2=approach hint, 3=specific technique)

${
  data.hintLevel === 1
    ? "Give a vague directional nudge. Do NOT mention the specific data structure or algorithm."
    : data.hintLevel === 2
      ? "Hint at the general approach or data structure category. Do NOT give the full algorithm."
      : "Name the specific technique but do NOT provide pseudocode or the full solution."
}`;

  return { system, user };
}

// ── Weekly Action Plan ─────────────────────────────────
export function weeklyPlanPrompt(data) {
  const system = `You are a personal interview preparation coach. You analyze a candidate's performance data and create a specific 7-day action plan.

Be specific — mention exact problem patterns, exact numbers, and concrete daily tasks. Never be vague.

ALWAYS respond in this exact JSON format:
{
  "summary": <string — 2-3 sentence overview of where they stand>,
  "focusAreas": [<string>, <string>] — top 2 areas to focus on this week,
  "dailyPlan": [
    { "day": "Monday",    "task": <string>, "type": "solve" | "review" | "simulate" | "study" },
    { "day": "Tuesday",   "task": <string>, "type": "..." },
    { "day": "Wednesday", "task": <string>, "type": "..." },
    { "day": "Thursday",  "task": <string>, "type": "..." },
    { "day": "Friday",    "task": <string>, "type": "..." },
    { "day": "Saturday",  "task": <string>, "type": "..." },
    { "day": "Sunday",    "task": <string>, "type": "..." }
  ],
  "weeklyGoal": <string — one measurable goal for the week>
}`;

  const user = `Generate a 7-day action plan for this candidate:

**Stats:**
- Total solved: ${data.totalSolved}
- Difficulty split: Easy ${data.easy}, Medium ${data.medium}, Hard ${data.hard}
- Current streak: ${data.streak} days
- Reviews overdue: ${data.reviewsDue}
- Sim sessions completed: ${data.simCount}
- Avg confidence: ${data.avgConfidence}/5

**6D Scores (out of 100):**
- Pattern Recognition: ${data.dimensions?.patternRecognition || 0}
- Solution Depth: ${data.dimensions?.solutionDepth || 0}
- Communication: ${data.dimensions?.communication || 0}
- Optimization: ${data.dimensions?.optimization || 0}
- Pressure Performance: ${data.dimensions?.pressurePerformance || 0}
- Retention: ${data.dimensions?.retention || 0}

**Patterns covered:** ${data.patternsCovered || "None"}
**Target company:** ${data.targetCompanies?.join(", ") || "Not set"}
**Target date:** ${data.targetDate || "Not set"}

Create a specific, actionable 7-day plan that addresses their weakest areas while maintaining strengths.`;

  return { system, user };
}

// ── Quiz Question Generation ───────────────────────────
export function quizGenerationPrompt(data) {
  const system = `You are an expert computer science educator creating multiple-choice quiz questions for interview preparation.

Each question must have exactly 4 options with only one correct answer. The explanation should explain why the correct answer is right AND why each wrong option is wrong.

ALWAYS respond in this exact JSON format:
{
  "questions": [
    {
      "question": <string>,
      "options": [<string>, <string>, <string>, <string>],
      "correctIndex": <number 0-3>,
      "explanation": <string — explain correct answer + why others are wrong>,
      "difficulty": "EASY" | "MEDIUM" | "HARD"
    }
  ]
}`;

  const user = `Generate ${data.count || 5} multiple-choice questions.

**Category:** ${data.category}
**Difficulty:** ${data.difficulty}
**Specific topics:** ${data.topics || "General"}

Make questions that test deep understanding, not just memorization. Include tricky but fair options.`;

  return { system, user };
}

// ── Post-Quiz Analysis ─────────────────────────────────
export function quizAnalysisPrompt(data) {
  const system = `You are an interview coach analyzing quiz results to provide targeted study advice.

ALWAYS respond in this exact JSON format:
{
  "summary": <string — 1-2 sentences on overall performance>,
  "weakTopics": [<string>, ...] — specific topics where they struggled,
  "studyAdvice": [<string>, ...] — 2-3 specific actionable study recommendations,
  "encouragement": <string — one motivating sentence>
}`;

  const user = `Analyze these quiz results:

**Category:** ${data.category}
**Score:** ${data.score}/${data.total} (${data.percentage}%)

**Wrong answers:**
${data.wrongAnswers
  .map(
    (w, i) =>
      `${i + 1}. Question: ${w.question}\n   Their answer: ${w.selectedOption}\n   Correct: ${w.correctOption}`,
  )
  .join("\n\n")}

Identify patterns in what they got wrong and give specific study advice.`;

  return { system, user };
}
