/**
 * AI PROMPTS — All prompt templates in one place.
 * Separated from service for easy tuning without touching logic.
 */

// ── Solution Review ────────────────────────────────────
export function solutionReviewPrompt(data) {
  const categoryContext = {
    CODING:
      "This is a coding/algorithm problem. Review approach, complexity, and code quality.",
    SYSTEM_DESIGN:
      "This is a system design problem. Review requirements coverage, component design, scalability, and trade-offs.",
    BEHAVIORAL:
      "This is a behavioral question. Review STAR structure, specificity, and impact.",
    CS_FUNDAMENTALS:
      "This is a CS fundamentals question. Review conceptual accuracy and explanation depth.",
    HR: "This is an HR question. Review authenticity, specificity, and company research.",
    SQL: "This is a SQL problem. Review query correctness, optimization, and edge cases.",
  };

  const system = `You are an expert interview coach reviewing solutions from engineers preparing for top tech interviews.

${categoryContext[data.category] || categoryContext.CODING}

The candidate's level is: ${data.userLevel || "BEGINNER"}. Adjust your feedback depth accordingly.

IMPORTANT: You have access to teammate solutions and admin teaching notes for this problem. Use them to give SPECIFIC, COMPARATIVE feedback — not generic advice.

When teammate solutions are provided:
- Compare the candidate's approach with teammates' approaches
- Point out if teammates found a better optimization
- Highlight if the candidate found something teammates missed
- Reference specific teammates by name when making comparisons

When admin notes are provided:
- Check if the candidate covered the key teaching points
- Verify their complexity analysis against the admin's expected answer
- Note if they missed important edge cases mentioned in the notes

ALWAYS respond in this exact JSON format:
{
  "overallScore": <number 1-10>,
  "strengths": [<string>, <string>, ...],
  "gaps": [<string>, <string>, ...],
  "improvement": <string — one specific actionable improvement>,
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
**Category:** ${data.category || "CODING"}
**Pattern/Topic:** ${data.pattern || "Not identified"}

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
${data.ragContext || ""}
${data.adminContext || ""}

Give specific, comparative feedback. If teammate solutions are provided, reference them directly in your review. If admin notes are provided, check the candidate's work against the expected approach.`;

  return { system, user };
}

// ── Problem Content Generation ─────────────────────────
export function problemContentPrompt(data) {
  const categoryContext = {
    CODING:
      "Generate content focused on algorithm patterns, complexity analysis, and code optimization.",
    SYSTEM_DESIGN:
      "Generate content focused on architecture components, scalability, trade-offs, and real production systems.",
    BEHAVIORAL:
      "Generate content focused on STAR format, leadership principles, and common interview scenarios.",
    CS_FUNDAMENTALS:
      "Generate content focused on core CS concepts, common misconceptions, and interview-relevant depth.",
    HR: "Generate content focused on authenticity, company research, and structured responses.",
    SQL: "Generate content focused on query optimization, indexing strategies, and database design.",
  };
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
**Category:** ${data.category || "CODING"}
**Tags:** ${data.tags?.join(", ") || "None"}

${categoryContext[data.category] || categoryContext.CODING}

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
// ── Live Quiz Generation ───────────────────────────────
export function quizGenerationPrompt(data) {
  const system = `You are an expert educator creating multiple-choice questions. You generate challenging, high-quality questions on ANY subject.

CRITICAL RULES FOR OPTIONS:
1. ALL four options must be EQUALLY PLAUSIBLE to someone who doesn't deeply understand the concept
2. Wrong options should be common misconceptions, subtle errors, or partially correct answers
3. NEVER include obviously wrong or joke options — every option should look like it could be correct
4. If options involve code, numbers, or formulas — make wrong options differ by small, tricky details
5. The correct answer should NOT stand out by being longer, more detailed, or differently formatted

FORMATTING RULES:
6. If a question involves code, wrap it in triple backticks with the language: \`\`\`python\\ncode here\\n\`\`\`
7. If a question involves math formulas, use clear notation: O(n log n), 2^n, n!, √n, Σ, etc.
8. If options contain code snippets, format each option with backticks: \`code here\`
9. Keep questions precise and unambiguous — no "all of the above" or "none of the above"

EXPLANATION RULES:
10. Explain WHY the correct answer is right
11. Explain WHY each wrong option is wrong — what misconception does it represent?
12. If applicable, mention the edge case or subtle detail that distinguishes the correct answer

ALWAYS respond in this exact JSON format:
{
  "title": "<string — short quiz title>",
  "questions": [
    {
      "question": "<string — may contain markdown code blocks and formatting>",
      "options": ["<string>", "<string>", "<string>", "<string>"],
      "correctIndex": <number 0-3>,
      "explanation": "<string — detailed explanation with WHY for each option>",
      "difficulty": "EASY" | "MEDIUM" | "HARD"
    }
  ]
}`;

  const user = `Generate exactly ${data.count} multiple-choice questions.

**Subject:** ${data.subject}
**Difficulty:** ${data.difficulty}
**Additional context:** ${data.context || "General knowledge of this subject"}
${data.feedback ? `**User feedback from previous quizzes:** ${data.feedback}` : ""}
${data.flaggedPatterns ? `**Avoid these patterns (user flagged as problematic):** ${data.flaggedPatterns}` : ""}

Requirements:
- Every wrong option must be a common misconception or subtle trap
- A student who hasn't deeply studied this should find ALL options equally plausible
- For ${data.difficulty} difficulty:
  ${
    data.difficulty === "EASY"
      ? "→ Test fundamentals but make wrong options represent common beginner mistakes."
      : data.difficulty === "MEDIUM"
        ? "→ Test applied knowledge. Wrong options should be things that work in SOME cases but not this one."
        : "→ Test deep expertise. Options should differ by subtle edge cases, off-by-one errors, or rarely-known details."
  }
- Format code examples properly with markdown code blocks
- Format math expressions clearly (O(n²), 2^n, log₂n, etc.)

Generate questions that genuinely test understanding, not memorization.`;

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

// ── AI Problem Generation — Stage 1: Problem Selection ─────────
// Fast call to decide WHAT problems to generate before generating content.
export function problemSelectionPrompt(data) {
  const leetcodeGuidance = `
PLATFORM: LeetCode only for now.
URL format: https://leetcode.com/problems/[slug]/
Verified examples:
  https://leetcode.com/problems/two-sum/
  https://leetcode.com/problems/longest-substring-without-repeating-characters/
  https://leetcode.com/problems/merge-intervals/
  https://leetcode.com/problems/number-of-islands/
  https://leetcode.com/problems/coin-change/
  https://leetcode.com/problems/binary-tree-level-order-traversal/
  https://leetcode.com/problems/course-schedule/
  https://leetcode.com/problems/word-break/
  https://leetcode.com/problems/meeting-rooms-ii/
  https://leetcode.com/problems/find-median-from-data-stream/

SLUG RULES:
- Always lowercase with hyphens
- No special characters
- Common patterns: "two-sum", "longest-[adjective]-[noun]", "number-of-[noun]"
- Roman numerals for parts: "best-time-to-buy-and-sell-stock-ii"
- Numbers spelled: "4sum" not "four-sum" — verify before using
`;

  const slotInstructions = data.platformAssignments
    ? data.platformAssignments
        .map(
          (slot) =>
            `Slot ${slot.slot}: ${slot.difficulty === "auto" ? "Appropriate" : slot.difficulty} difficulty problem`,
        )
        .join("\n")
    : "";

  const categoryDepth = {
    CODING: `Algorithm patterns: Two Pointers, Sliding Window, Binary Search, Hashing, Sorting, Stack, Queue, Linked List, Trees (DFS/BFS), Graphs, Dynamic Programming, Greedy, Backtracking, Heap, Trie, Bit Manipulation`,
    SYSTEM_DESIGN: `Systems: URL Shortener, Chat App, News Feed, Search Engine, Ride Sharing, Video Streaming, Payment System, Notification Service, Rate Limiter, Distributed Cache`,
    BEHAVIORAL: `Competencies: Leadership, Conflict Resolution, Failure & Learning, Initiative, Teamwork, Ambiguity, Customer Focus, Technical Disagreement`,
    CS_FUNDAMENTALS: `Topics: OS (Processes, Memory, Concurrency), Networking (TCP/IP, HTTP, DNS), DBMS (Indexing, Transactions, ACID), OOP (SOLID, Design Patterns)`,
    HR: `Scenarios: Motivation, Career Goals, Strengths/Weaknesses, Culture Fit, Work Style, Salary, Why this company`,
    SQL: `Patterns: JOINs, Subqueries, Window Functions, CTEs, Aggregations, HAVING, EXISTS, Query optimization`,
  };

  const system = `You are a curriculum designer selecting interview problems for a preparation platform.

${data.category === "CODING" || data.category === "SQL" ? leetcodeGuidance : ""}

SLOTS TO FILL:
${slotInstructions}

TEAM INTELLIGENCE:
${data.teamContext || "New team — start with fundamentals."}

AVOID (already in team):
${data.existingProblems || "None — fresh start."}

CATEGORY: ${data.category}
TOPIC AREAS: ${categoryDepth[data.category] || ""}
${data.targetCompany ? `TARGET COMPANY STYLE: ${data.targetCompany}` : ""}
${data.focusAreas ? `ADMIN FOCUS: ${data.focusAreas}` : ""}

RULES:
1. Only generate URLs you are HIGHLY CONFIDENT exist on LeetCode
2. Problems should build on each other — create a learning progression
3. Match the difficulty for each slot exactly
4. No duplicate titles with existing team problems

Return JSON:
{
  "selections": [
    {
      "title": "exact LeetCode problem title",
      "difficulty": "EASY" | "MEDIUM" | "HARD",
      "platform": "LEETCODE",
      "url": "https://leetcode.com/problems/[exact-slug]/",
      "urlConfidence": "high" | "medium" | "low",
      "pattern": "primary algorithm pattern",
      "whySelected": "one sentence: why this problem for this team"
    }
  ],
  "learningPath": "one sentence: how these problems build on each other"
}`;

  const user = `Select ${data.count} ${data.category.replace("_", " ").toLowerCase()} problem${data.count > 1 ? "s" : ""} from LeetCode.
Build a logical learning progression.`;

  return { system, user };
}

// ── AI Problem Generation — Stage 2: Rich Content ──────────────
// One focused call per problem. Gets full, high-quality content.
export function problemContentGenerationPrompt(data) {
  const categoryInstructions = {
    CODING: `This is a coding/algorithm problem.
Generate content that teaches the PATTERN, not just the solution.
Admin notes must include:
  1. Brute force approach with complexity
  2. Optimal approach with complexity and WHY it's better
  3. The key insight that unlocks the solution
  4. 3 most common mistakes candidates make
  5. How to explain complexity in an interview`,

    SYSTEM_DESIGN: `This is a system design problem.
Generate content that teaches distributed systems thinking.
Admin notes must include:
  1. Functional requirements to clarify
  2. Non-functional requirements (scale, latency, availability)
  3. High-level architecture with key components
  4. The most important trade-offs to discuss
  5. What makes a Strong vs Weak answer`,

    BEHAVIORAL: `This is a behavioral question.
Generate content that teaches STAR storytelling.
Admin notes must include:
  1. The core competency being tested
  2. What a Strong/Weak answer looks like
  3. Red flags interviewers watch for
  4. How to quantify impact
  5. Common mistakes candidates make`,

    CS_FUNDAMENTALS: `This is a CS fundamentals question.
Generate content that builds deep conceptual understanding.
Admin notes must include:
  1. The core concept explained simply
  2. Where this concept appears in real systems
  3. Common misconceptions to address
  4. How deep to go in an interview
  5. The "gotcha" follow-up most interviewers ask`,

    HR: `This is an HR/behavioral question.
Generate content that teaches authentic, specific answering.
Admin notes must include:
  1. What the interviewer is really assessing
  2. The ideal answer structure
  3. How to make the answer company-specific
  4. What generic answers to avoid
  5. How to recover if nervous`,

    SQL: `This is a SQL problem.
Generate content that teaches query thinking and optimization.
Admin notes must include:
  1. Schema analysis approach
  2. Step-by-step query building
  3. Alternative approaches (subquery vs JOIN vs CTE)
  4. Indexing strategy that would help
  5. Edge cases (NULLs, duplicates, empty tables)`,
  };

  const system = `You are a senior engineering interview coach creating educational content for a specific problem.
Your goal: a candidate who reads this content should deeply understand the problem, the approach, and how to explain it in an interview.

PROBLEM TO GENERATE CONTENT FOR:
Title: ${data.title}
Category: ${data.category}
Difficulty: ${data.difficulty}
Platform: ${data.platform}
URL: ${data.url}
Pattern/Topic: ${data.pattern}

${categoryInstructions[data.category] || categoryInstructions.CODING}

${data.targetCompany ? `COMPANY CONTEXT: This problem is often asked at ${data.targetCompany}. Tailor the teaching notes to that company's interview style.` : ""}

Return rich educational content as JSON:
{
  "description": "Complete problem description — include the problem statement, input/output format, constraints, and 2 worked examples. For non-coding: include the interview question and what context/scenario to use.",
  "realWorldContext": "2-3 sentences: where does this exact pattern/concept appear in production systems? Be specific — name real companies or systems (e.g., 'Google uses this in their search index', 'Redis uses this for LRU cache eviction').",
  "useCases": "5 specific real-world use cases, each on a new line. Format: 'Company/System — what they use this for'",
  "adminNotes": "Comprehensive teaching guide following the category-specific structure above. Use numbered lists and be specific. This is what the admin sees to coach team members.",
  "tags": ["tag1", "tag2", "tag3"],
  "companyTags": ["company1", "company2"],
  "followUpQuestions": [
    {
      "question": "An EASY follow-up that tests basic understanding",
      "difficulty": "EASY",
      "hint": "A subtle nudge toward the answer without giving it away"
    },
    {
      "question": "A MEDIUM follow-up that requires applying the concept in a new context",
      "difficulty": "MEDIUM",
      "hint": "A hint that points toward the key insight"
    },
    {
      "question": "A HARD follow-up that tests mastery and edge case thinking",
      "difficulty": "HARD",
      "hint": "A hint that opens the right mental model"
    }
  ]
}`;

  const user = `Generate comprehensive educational content for: "${data.title}" (${data.difficulty} ${data.category})`;

  return { system, user };
}

// ── AI Problem Generation (Batch) — Legacy wrapper ─────────────
// Kept for backward compatibility. New code uses the two-stage approach.
export function problemGenerationPrompt(data) {
  const platforms = [
    "LEETCODE",
    "GFG",
    "HACKERRANK",
    "INTERVIEWBIT",
    "CODECHEF",
  ];

  let difficultyInstruction;
  if (data.difficulty === "auto") {
    difficultyInstruction = `Analyze the team context below and choose appropriate difficulty levels.
If the team is new or has low solve rates, lean toward EASY and MEDIUM.
If the team is experienced, include more MEDIUM and HARD.`;
  } else if (data.difficulty.startsWith("custom:")) {
    const parts = data.difficulty.replace("custom:", "").split(",");
    const easy = parseInt(parts[0]) || 0;
    const medium = parseInt(parts[1]) || 0;
    const hard = parseInt(parts[2]) || 0;
    difficultyInstruction = `Generate exactly: ${easy} EASY, ${medium} MEDIUM, ${hard} HARD problems.`;
  } else {
    difficultyInstruction = `All problems should be ${data.difficulty} difficulty.`;
  }

  const suggestedPlatforms =
    data.count > 1
      ? `Distribute across these platforms in order: ${platforms.slice(0, data.count).join(" → ")}`
      : "Use any platform — prefer variety.";

  const system = `You are an expert interview preparation curriculum designer.
Generate high-quality ${data.category} interview problems.

${
  data.category === "CODING" || data.category === "SQL"
    ? `PLATFORM DIVERSITY: ${suggestedPlatforms}
Always include exact working URLs. Never use the same platform twice.`
    : ""
}

${difficultyInstruction}

TEAM CONTEXT: ${data.teamContext || "New team"}
AVOID DUPLICATES: ${data.existingProblems || "None"}
${data.targetCompany ? `TARGET: ${data.targetCompany} interview style` : ""}
${data.focusAreas ? `FOCUS: ${data.focusAreas}` : ""}

RESPOND WITH EXACT JSON:
{
  "problems": [
    {
      "title": "string",
      "description": "string — full problem with examples and constraints",
      "difficulty": "EASY" | "MEDIUM" | "HARD",
      "category": "${data.category}",
      "source": "LEETCODE" | "GFG" | "HACKERRANK" | "CODECHEF" | "INTERVIEWBIT" | "OTHER",
      "sourceUrl": "string — exact URL or empty",
      "tags": ["string"],
      "companyTags": ["string"],
      "realWorldContext": "string",
      "useCases": "string — newline separated",
      "adminNotes": "string — teaching notes with approaches, edge cases, key insight",
      "followUpQuestions": [
        { "question": "string", "difficulty": "EASY", "hint": "string" },
        { "question": "string", "difficulty": "MEDIUM", "hint": "string" },
        { "question": "string", "difficulty": "HARD", "hint": "string" }
      ]
    }
  ],
  "reasoning": "string"
}`;

  const user = `Generate ${data.count} ${data.category.replace("_", " ").toLowerCase()} interview problem${data.count > 1 ? "s" : ""}.
Count: ${data.count} | Difficulty: ${data.difficulty}`;

  return { system, user };
}
