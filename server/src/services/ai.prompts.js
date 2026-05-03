/**
 * AI PROMPTS — All prompt templates in one place.
 * Separated from service for easy tuning without touching logic.
 */

// ── Solution Review ────────────────────────────────────
// ── Solution Review — Rubric-Based Multi-Dimensional Scoring ───
//
// SCORING MODEL:
// Each dimension is scored independently by AI (1-10).
// Final score is computed by weighted formula in the controller.
// This is more consistent and explainable than a holistic impression.
//
// Dimension weights:
//   Code Correctness    35%  — logical correctness, edge cases, completeness
//   Pattern Accuracy    20%  — does identified pattern match the code?
//   Understanding Depth 20%  — key insight + Feynman explanation quality
//   Explanation Quality 15%  — approach explanation clarity
//   Confidence Calib.   10%  — is self-confidence realistic vs actual quality?
//
// HARD CAPS enforced in controller (not prompt — more reliable):
//   - Code clearly wrong/incomplete → cap at 5/10
//   - Wrong pattern identified → -3 from patternAccuracy score
//
// Follow-up answers are scored separately (bonus, not in main formula).
export function solutionReviewPrompt(data) {
  const categoryContext = {
    CODING: {
      focus:
        "algorithm correctness, time/space complexity, edge cases, code quality",
      codeCorrectnessGuide: `
CODING correctness analysis:
- Does the algorithm solve ALL cases including edge cases?
- Would it pass with: empty input, single element, duplicates, negative numbers, large inputs?
- Is the logic correct or are there off-by-one errors, infinite loops, wrong conditions?
- Is the code complete (has a return statement, all branches handled)?
- Detect language mismatch: if selected language is X but code is clearly language Y, flag it
- Detect incomplete solutions: pseudocode, TODO comments, missing critical sections`,
    },
    SYSTEM_DESIGN: {
      focus:
        "requirements clarity, capacity reasoning, API design quality, architectural decisions, trade-off depth, failure mode awareness",
      codeCorrectnessGuide: `
SYSTEM DESIGN evaluation framework — evaluate each area independently:
REQUIREMENTS CLARIFICATION:
- Did the candidate identify functional requirements? Are they specific and scoped?
- Did the candidate identify non-functional requirements? Do they include concrete numbers (DAU, QPS, latency targets)?
- Are the requirements realistic and internally consistent?
CAPACITY ESTIMATION:
- Did the candidate do back-of-envelope math?
- Are the numbers reasonable and consistent with the requirements?
- Did they identify read:write ratio, storage requirements, bandwidth?
API DESIGN:
- Are endpoints named and structured (method + path)?
- Do request/response shapes make sense for the use cases?
- Is the API surface area appropriate — not too large, not too small?
ARCHITECTURE:
- Are the right components present for the stated requirements?
- Is the data flow logical and complete?
- Are there obvious missing components for the scale stated?
DATABASE SCHEMA:
- Does the schema support the stated access patterns?
- Are appropriate indexes identified?
- Is the database choice (SQL/NoSQL) justified?
TRADE-OFF REASONING:
- Are key architectural decisions made explicit?
- Does the candidate acknowledge what they traded away?
- Are the trade-offs appropriate for the stated requirements?
FAILURE MODES:
- Did the candidate identify what breaks first?
- Are there mitigations proposed?
- Is the failure analysis realistic?`,
    },
    LOW_LEVEL_DESIGN: {
      focus:
        "OOP correctness, SOLID principles, design pattern appropriateness, extensibility, implementation quality",
      codeCorrectnessGuide: `
LOW-LEVEL DESIGN evaluation framework — evaluate each area independently:
ENTITY IDENTIFICATION:
- Are the right classes identified? No missing entities, no unnecessary ones?
- Does each class have a clear, single responsibility (SRP)?
- Are god objects avoided — classes that try to do everything?
- Are the entity names semantically meaningful?
CLASS HIERARCHY & RELATIONSHIPS:
- Are inheritance relationships semantically correct? (IS-A vs HAS-A)
- Is composition preferred over inheritance where appropriate?
- Are abstract classes used only where shared state exists?
- Are interfaces used for behavioral contracts with no shared state?
- Does the hierarchy make Liskov Substitution sense?
DESIGN PATTERN APPLICATION:
- Is the identified pattern structurally correct — not just named correctly?
- Does the pattern actually solve the stated problem?
- Is the pattern appropriate for the scope or is it overkill?
SOLID PRINCIPLES:
- Single Responsibility: Does each class change for exactly one reason?
- Open/Closed: Can new behavior be added without modifying existing classes?
- Liskov Substitution: Can subtypes be used wherever the base type is expected?
- Interface Segregation: Are interfaces small and focused?
- Dependency Inversion: Do high-level modules depend on abstractions?
IMPLEMENTATION QUALITY:
- Are method signatures clean and intention-revealing?
- Is encapsulation respected — no unnecessary public fields?
- Is the code idiomatic for the chosen language?
EXTENSIBILITY:
- Can new requirements be added with minimal modification to existing classes?
- Does the candidate honestly identify where their design would break?`,
    },
    BEHAVIORAL: {
      focus:
        "STAR structure completeness, specificity and detail, impact quantification, ownership language, growth mindset",
      codeCorrectnessGuide: `
BEHAVIORAL evaluation framework — evaluate each area independently:
STAR STRUCTURE:
- Does the response have a clear Situation? Is it specific (project name, team size, timeline)?
- Is the Task clearly stated — what was the candidate specifically responsible for?
- Are the Actions detailed? Does the candidate explain what THEY personally did, step by step?
- Is there a clear Result? Is the outcome stated explicitly?
- Are all four STAR components present, or are any missing/underdeveloped?
SPECIFICITY & AUTHENTICITY:
- Does the answer use specific details (real project names, real numbers, real people)?
- Or is it generic and could apply to anyone? ("I worked with my team to solve a problem")
- Does it feel authentic — like a real memory — or rehearsed and vague?
OWNERSHIP LANGUAGE:
- Does the candidate use "I" consistently for their own actions?
- Or do they hide behind "we" when describing what they personally did?
- This is critical: interviewers want to know what YOU did, not what the team did.
IMPACT QUANTIFICATION:
- Is the Result quantified? (%, $, time saved, users impacted, error rate reduced)
- If not quantified, is there a qualitative outcome clearly stated?
- Does the candidate understand why their action mattered?
GROWTH MINDSET:
- Does the candidate show self-awareness about what they learned?
- Do they articulate what they would do differently?
- Do they demonstrate that this experience changed their approach?
COMPETENCY ALIGNMENT:
- Does the story actually demonstrate the competency being asked about?
- Is the competency demonstrated through actions, not just stated? ("I am a leader" vs showing leadership)`,
    },
    CS_FUNDAMENTALS: {
      focus:
        "conceptual accuracy, explanation depth, real-world application, misconception awareness, interview readiness",
      codeCorrectnessGuide: `
CS FUNDAMENTALS evaluation framework — evaluate each area independently:
CONCEPTUAL ACCURACY:
- Is the core concept explained correctly with no factual errors?
- Are technical terms used accurately and appropriately?
- Would a domain expert agree with what was said?
- Are there any subtle but critical inaccuracies that would fail an interview?
EXPLANATION DEPTH:
- Does the explanation go beyond surface-level? ("TCP is reliable" vs explaining the handshake, ACKs, retransmission)
- Does the candidate explain the mechanism — HOW it works, not just WHAT it does?
- Do they explain WHY it was designed this way — the engineering trade-off behind the concept?
REAL-WORLD APPLICATION:
- Does the candidate connect the concept to real systems they would actually work with?
- Can they give concrete examples? ("Virtual memory is used by every OS — here's what happens when you fork a process")
- Do they understand where this concept appears in production engineering?
MISCONCEPTION AWARENESS:
- Does the candidate identify and address common misconceptions about this topic?
- Do they know the "gotcha" details that interviewers probe for?
INTERVIEW DEPTH CALIBRATION:
- Did they go deep enough for the level being interviewed (junior vs senior)?
- Did they cover the sub-topics an interviewer would probe?
- Did they leave obvious follow-up questions unanswered that they should have addressed proactively?`,
    },
    HR: {
      focus:
        "authenticity and specificity, company research depth, career narrative coherence, self-awareness, answer structure",
      codeCorrectnessGuide: `
HR evaluation framework — evaluate each area independently:
AUTHENTICITY & SPECIFICITY:
- Does the answer feel genuine and personal, or rehearsed and generic?
- Are there specific details that could only come from this candidate's real experience?
- Generic red flags: "I am passionate about technology", "I love working in teams", "I want to grow"
- Authentic signals: specific projects mentioned, specific aspects of the company named, real career moments referenced
COMPANY RESEARCH DEPTH:
- Does the candidate demonstrate knowledge of THIS specific company?
- Do they reference specific products, engineering culture, recent news, or company values?
- Or is the answer generic and could apply to any company?
- Strong signal: "I read about your migration to microservices on the engineering blog"
- Weak signal: "I love your innovative culture and great products"
CAREER NARRATIVE COHERENCE:
- Does the candidate's story make logical sense? Does each role lead naturally to the next?
- Can they explain why they made each career decision?
- Is there a clear thread connecting their past experience to why they want THIS role?
- Interviewers are evaluating flight risk and motivation alignment
SELF-AWARENESS:
- Can the candidate honestly assess their own strengths with specific evidence?
- Can they discuss a real weakness with genuine improvement evidence?
- Do they show awareness of how others perceive them?
- Lack of self-awareness is a major red flag for culture fit
ANSWER STRUCTURE:
- Is the answer appropriately concise — not rambling, not too brief?
- Does it answer what was actually asked, not a similar but easier question?
- Does it end with a clear, memorable point?`,
    },
    SQL: {
      focus:
        "query correctness, schema understanding, optimization awareness, edge case handling, query clarity",
      codeCorrectnessGuide: `
SQL evaluation framework — evaluate each area independently:
SCHEMA ANALYSIS:
- Did the candidate analyze the schema before writing the query?
- Do they understand the relationships between tables (1:1, 1:N, N:M)?
- Did they identify which columns are indexed and how that affects their approach?
QUERY CORRECTNESS:
- Does the query return the correct result for the stated requirements?
- Is the JOIN type correct for the data relationship? (INNER vs LEFT vs RIGHT)
- Are GROUP BY and HAVING used correctly vs WHERE?
- Is the query syntactically valid for standard SQL?
- Detect language mismatch: Python/Java code pasted instead of SQL
NULL HANDLING:
- Does the query handle NULL values correctly?
- Is there a difference between COUNT(*) and COUNT(column) that matters here?
- Does OUTER JOIN introduce NULLs that need to be handled?
OPTIMIZATION AWARENESS:
- Does the candidate identify which indexes would help this query?
- Is there an N+1 query pattern that should be addressed?
- Could a CTE or subquery be rewritten as a more efficient JOIN?
EDGE CASES:
- Empty tables — does the query still return sensible results?
- Duplicate rows — are they handled intentionally with DISTINCT or GROUP BY?
- Large datasets — would this query be acceptable at 100M rows?
QUERY CLARITY:
- Is the query readable? Proper indentation, meaningful aliases?
- Is CTE vs subquery choice appropriate for readability?
- Would a junior engineer understand what this query does?`,
    },
  };

  const ctx = categoryContext[data.category] || categoryContext.CODING;

  const solveMethodContext =
    data.solveMethod === "SAW_APPROACH"
      ? "IMPORTANT: Candidate saw the approach before implementing. Confidence rating must be heavily discounted."
      : data.solveMethod === "HINTS"
        ? "NOTE: Candidate used hints during solving. Factor this into confidence calibration."
        : "Candidate solved this COLD (no hints or external help).";

  const timeTakenLabel =
    {
      UNDER_15: "Under 15 minutes",
      MINS_15_30: "15-30 minutes",
      MINS_30_60: "30-60 minutes",
      HOURS_1_2: "1-2 hours",
      OVER_2_HOURS: "Over 2 hours",
    }[data.timeTaken] || null;

  let followUpContext = "";
  if (data.followUpAnswers?.length > 0) {
    followUpContext = "\n\n--- FOLLOW-UP QUESTIONS ---\n";
    followUpContext +=
      "Evaluate each answer. Use the exact questionId provided.\n\n";
    data.followUpAnswers.forEach((item, i) => {
      followUpContext += `Question ${i + 1}:\n`;
      followUpContext += `  questionId: "${item.id}"\n`;
      followUpContext += `  difficulty: ${item.difficulty}\n`;
      followUpContext += `  question: ${item.question}\n`;
      followUpContext += `  candidateAnswer: ${item.answerText || "SKIPPED — candidate did not answer"}\n\n`;
    });
  } else {
    followUpContext =
      "\n\n--- FOLLOW-UP QUESTIONS: All skipped (no answers provided) ---\n";
  }

  const patternBaselineContext = data.patternBaseline
    ? `
CANDIDATE'S PATTERN HISTORY — ${data.patternBaseline.pattern}:
Previous solutions reviewed with this pattern: ${data.patternBaseline.solutionCount}
Their average overall score on ${data.patternBaseline.pattern} problems: ${data.patternBaseline.avgOverallScore}/10
${data.patternBaseline.trend ? `Score trend across their ${data.patternBaseline.pattern} solutions: ${data.patternBaseline.trend}` : ""}
${
  Object.keys(data.patternBaseline.dimensionAverages).length > 0
    ? `Their average dimension scores on this pattern:
${Object.entries(data.patternBaseline.dimensionAverages)
  .map(([dim, avg]) => `  ${dim}: ${avg}/10`)
  .join("\n")}`
    : ""
}
BASELINE COMPARISON REQUIREMENT:
- Compare this submission explicitly against their own baseline on ${data.patternBaseline.pattern}
- If this solution scores ABOVE their ${data.patternBaseline.avgOverallScore}/10 baseline: acknowledge the improvement in strengths
- If this solution scores BELOW their baseline: call it out in gaps — what regressed?
- Reference specific dimensions where they are above or below their own history
- This makes feedback personal and actionable, not generic`
    : "";

  // ── Category-specific dimension reinterpretation ───────────────
  // The 5 standard scoring dimensions were designed for coding problems.
  // For non-coding categories, we reinterpret each dimension in context
  // so scores are meaningful. The JSON field names stay identical —
  // only what the AI is evaluating changes.
  const categoryDimensionGuidance = (() => {
    switch (data.category) {
      case "SYSTEM_DESIGN":
        return `
SCORING REINTERPRETATION FOR SYSTEM DESIGN:
1. CODE CORRECTNESS → DESIGN CORRECTNESS (35%)
   Does the design actually solve the stated system at the stated scale?
   Are the right components present? Does the data flow make sense end-to-end?
2. PATTERN ACCURACY → ARCHITECTURAL PATTERN ACCURACY (20%)
   Is the architectural style (microservices, event-driven, CQRS, etc.) appropriate?
   Is the database choice (SQL vs NoSQL) justified for the access patterns?
3. UNDERSTANDING DEPTH → SYSTEMS THINKING DEPTH (20%)
   Does the candidate understand WHY each component exists?
   Do they reason about trade-offs, not just describe components?
4. EXPLANATION QUALITY → DESIGN COMMUNICATION CLARITY (15%)
   Could another engineer implement this from the description?
   Is the data flow clear? Are component boundaries defined?
5. CONFIDENCE CALIBRATION → unchanged`;

      case "LOW_LEVEL_DESIGN":
        return `
SCORING REINTERPRETATION FOR LOW-LEVEL DESIGN:
1. CODE CORRECTNESS → OOP DESIGN CORRECTNESS (35%)
   Is the class structure semantically correct? No god objects, clear SRP?
   Are relationships (IS-A vs HAS-A) correct? Is implementation structurally sound?
2. PATTERN ACCURACY → DESIGN PATTERN ACCURACY (20%)
   Is the identified pattern structurally applied correctly — not just named?
   Does it solve the stated problem? Is it the right pattern for the scope?
3. UNDERSTANDING DEPTH → OOP UNDERSTANDING DEPTH (20%)
   Does the candidate understand WHY the chosen hierarchy/pattern is correct?
   Can they articulate SOLID violations honestly? Do they understand trade-offs?
4. EXPLANATION QUALITY → DESIGN EXPLANATION CLARITY (15%)
   Could another engineer implement the class structure from this description?
   Are method signatures clear? Is the hierarchy unambiguous?
5. CONFIDENCE CALIBRATION → unchanged`;

      case "BEHAVIORAL":
        return `
SCORING REINTERPRETATION FOR BEHAVIORAL:
1. CODE CORRECTNESS → STAR STRUCTURE COMPLETENESS (35%)
   Are all four STAR components present and developed? (Situation, Task, Action, Result)
   Is the Situation specific — real project, real team, real stakes?
   Are the Actions detailed — what did THEY personally do, step by step?
   Is the Result stated with measurable impact?
2. PATTERN ACCURACY → COMPETENCY ALIGNMENT (20%)
   Does the story actually demonstrate the competency being asked about?
   Is the competency shown through actions, not just claimed?
   Does the story answer the actual question or a similar but easier one?
3. UNDERSTANDING DEPTH → SELF-AWARENESS & GROWTH MINDSET (20%)
   Does the candidate show genuine reflection on what they learned?
   Do they identify what they would do differently and why?
4. EXPLANATION QUALITY → COMMUNICATION CLARITY & OWNERSHIP (15%)
   Is "I" used consistently for personal actions (not "we")?
   Is the story told clearly without rambling?
5. CONFIDENCE CALIBRATION → unchanged
   Note: A rehearsed, polished answer with weak specifics should score lower than
   a less polished answer with strong authentic detail.`;

      case "CS_FUNDAMENTALS":
        return `
SCORING REINTERPRETATION FOR CS FUNDAMENTALS:
1. CODE CORRECTNESS → CONCEPTUAL ACCURACY (35%)
   Is the concept explained correctly with no factual errors?
   Are technical terms used accurately?
2. PATTERN ACCURACY → TOPIC COVERAGE ACCURACY (20%)
   Did the candidate cover the right sub-topics for this concept?
   Did they identify the correct mechanism — HOW it works, not just WHAT it is?
3. UNDERSTANDING DEPTH → CONCEPTUAL DEPTH & REAL-WORLD CONNECTION (20%)
   Do they explain WHY the concept was designed this way?
   Can they connect it to real production systems with specific examples?
4. EXPLANATION QUALITY → TEACHING CLARITY (15%)
   Could a junior engineer understand this explanation?
   Is the explanation structured (what → why → how → where it's used)?
5. CONFIDENCE CALIBRATION → unchanged
   Note: Overconfidence is especially dangerous in CS fundamentals.
   A candidate who confidently states something incorrect should score
   lower on calibration than one who correctly flags their uncertainty.`;

      case "HR":
        return `
SCORING REINTERPRETATION FOR HR:
1. CODE CORRECTNESS → ANSWER AUTHENTICITY & SPECIFICITY (35%)
   Does the answer feel genuine and personal, not rehearsed and generic?
   Are there specific details only this candidate could provide?
   Generic red flags: "passionate about technology", "love innovation", "great culture"
   Authentic signals: specific products mentioned, specific career moments named
2. PATTERN ACCURACY → COMPANY & ROLE ALIGNMENT (20%)
   Does the candidate demonstrate research about THIS specific company?
   Is the answer tailored to this role or generic for any tech company?
   Does their stated motivation make logical sense given their background?
3. UNDERSTANDING DEPTH → CAREER NARRATIVE COHERENCE & SELF-AWARENESS (20%)
   Does their career story make logical sense? Each role leading to the next?
   Can they honestly assess their own strengths with specific evidence?
   Can they discuss a real weakness with genuine improvement evidence?
4. EXPLANATION QUALITY → ANSWER STRUCTURE & CONCISENESS (15%)
   Does the answer address what was actually asked?
   Is it appropriately concise — not rambling, not too brief?
   Does it end with a clear, memorable point?
5. CONFIDENCE CALIBRATION → unchanged
   Note: In HR, overconfidence often appears as inability to discuss weaknesses
   or failures honestly. Appropriate humility is a positive signal.`;

      case "SQL":
        return `
SCORING REINTERPRETATION FOR SQL:
1. CODE CORRECTNESS → QUERY CORRECTNESS (35%)
   Does the query return the correct result for ALL cases?
   Is the JOIN type correct for the data relationship?
   Are GROUP BY, HAVING, WHERE used correctly?
   Does it handle NULLs, duplicates, and empty tables correctly?
2. PATTERN ACCURACY → QUERY PATTERN SELECTION (20%)
   Is the right query pattern used? (JOIN vs subquery vs CTE vs window function)
   Is the pattern appropriate for the access pattern and data volume?
3. UNDERSTANDING DEPTH → SCHEMA & OPTIMIZATION UNDERSTANDING (20%)
   Does the candidate understand the access patterns implied by the schema?
   Do they identify which indexes would help and why?
4. EXPLANATION QUALITY → QUERY EXPLANATION CLARITY (15%)
   Can the candidate walk through what their query does step by step?
   Is the query readable — proper aliases, formatting, CTE naming?
5. CONFIDENCE CALIBRATION → unchanged`;

      default:
        return ""; // CODING uses standard dimensions — no reinterpretation needed
    }
  })();

  const system = `You are a senior engineering interview coach doing a comprehensive solution review.
Evaluate this ${data.category} submission across 5 dimensions with independent, honest scores.
PROBLEM: ${data.problem?.title || "Unknown"}
DIFFICULTY: ${data.difficulty}
CATEGORY: ${data.category}
FOCUS: ${ctx.focus}
${ctx.codeCorrectnessGuide}
${categoryDimensionGuidance}
SCORING DIMENSIONS — score each 1-10 INDEPENDENTLY:
1. CODE CORRECTNESS (35% weight)
   10 = Completely correct, handles all edge cases, optimal
   7-9 = Correct for main cases, minor edge case issues
   4-6 = Partially correct, has significant logic errors
   1-3 = Fundamentally wrong, does not solve the problem
2. PATTERN ACCURACY (20% weight)
   10 = Correct pattern AND can explain why
   7-9 = Correct pattern family, slightly imprecise
   4-6 = Wrong pattern but code accidentally partially works
   1-3 = Completely wrong pattern
3. UNDERSTANDING DEPTH (20% weight)
   10 = Exceptional key insight, brilliant explanation
   7-9 = Good insight, clear explanation
   4-6 = Surface-level, lacks conceptual depth
   1-3 = Cannot explain their own solution
4. EXPLANATION QUALITY (15% weight)
   10 = Crystal clear, anyone could implement from description
   7-9 = Clear with minor gaps
   4-6 = Vague or incomplete
   1-3 = No explanation or completely unclear
5. CONFIDENCE CALIBRATION (10% weight)
   NOTE: The candidate self-rated confidence as ${data.confidence}/5.
   ${solveMethodContext}
   ${timeTakenLabel ? `Time taken: ${timeTakenLabel}.` : ""}
   10 = Self-confidence perfectly matches actual quality
   7-9 = Slightly over/under confident
   4-6 = Noticeably miscalibrated
   1-3 = Severely miscalibrated
CROSS-VALIDATION RULES:
- If code is in a different language than selected: set languageMismatch=true, set detectedLanguage
- If code is incomplete/pseudocode: set incompleteSubmission=true
- If pattern is wrong: set wrongPattern=true, set correctPattern to the right one
${data.adminNotes ? `\nADMIN TEACHING NOTES (gold standard for evaluation):\n${data.adminNotes}` : ""}
${data.ragContext ? `\nTEAMMATE SOLUTIONS FOR COMPARISON:\n${data.ragContext}` : ""}
${
  data.ragContext
    ? `\nPEER COMPARISON REQUIREMENT:
You MUST explicitly compare this solution to teammate solutions above.
If score < 7, call out the specific approach gap with teammate names and details.`
    : ""
}
${patternBaselineContext}
RESPOND WITH EXACT JSON — no extra fields, no missing fields:
{
  "scores": {
    "codeCorrectness": <1-10>,
    "patternAccuracy": <1-10>,
    "understandingDepth": <1-10>,
    "explanationQuality": <1-10>,
    "confidenceCalibration": <1-10>
  },
  "flags": {
    "languageMismatch": <boolean>,
    "detectedLanguage": <string or null>,
    "incompleteSubmission": <boolean>,
    "wrongPattern": <boolean>,
    "identifiedPattern": <string or null>,
    "correctPattern": <string or null>
  },
  "strengths": [<string>, ...],
  "gaps": [<string>, ...],
  "improvement": <string>,
  "interviewTip": <string>,
  "readinessVerdict": <string — one sentence: what interview stage is this candidate ready for with this specific problem?>,
  "complexityCheck": {
    "timeComplexity": <string>,
    "spaceComplexity": <string>,
    "timeCorrect": <boolean>,
    "spaceCorrect": <boolean>,
    "optimizationNote": <string or null>
  },
  "followUpEvaluations": [
    {
      "questionId": <string — use EXACT questionId from above>,
      "score": <1-10 or null if skipped>,
      "feedback": <string — one sentence, or "Skipped" if not answered>
    }
  ]
}`;

  // ── Submission section — category-specific field presentation ──
  //
  // SYSTEM_DESIGN: structured fields from categorySpecificData
  // LOW_LEVEL_DESIGN: structured OOP fields from categorySpecificData
  // HR: structured fields from categorySpecificData (new) or generic mapping (old)
  // BEHAVIORAL: STAR-oriented field presentation
  // CS_FUNDAMENTALS: concept-oriented field presentation
  // SQL: query + schema-oriented presentation
  // CODING + fallback: standard generic presentation
  const categorySpecific = data.categorySpecificData;

  let submissionSection;

  if (data.category === "SYSTEM_DESIGN" && categorySpecific) {
    submissionSection = `Functional Requirements:
${categorySpecific.functionalRequirements || data.approach || "Not provided"}

Non-Functional Requirements:
${categorySpecific.nonFunctionalRequirements || data.bruteForce || "Not provided"}

Capacity Estimation:
${categorySpecific.capacityEstimation || data.realWorldConnection || "Not provided"}

API Design:
${categorySpecific.apiDesign || data.code || "Not provided"}

Database Schema:
${categorySpecific.schemaDesign || data.optimizedApproach || "Not provided"}

Architecture Description:
${categorySpecific.architectureNotes || data.feynmanExplanation || "Not provided"}

Key Trade-offs:
${categorySpecific.tradeoffReasoning || data.keyInsight || "Not provided"}

Failure Modes:
${categorySpecific.failureModes || data.timeComplexity || "Not provided"}`;
  } else if (data.category === "LOW_LEVEL_DESIGN" && categorySpecific) {
    const implementationCode =
      categorySpecific.implementationCode || data.code || null;
    submissionSection = `Entity Identification:
${categorySpecific.entities || data.approach || "Not provided"}

Class Hierarchy & Relationships:
${categorySpecific.classHierarchy || data.bruteForce || "Not provided"}

Design Pattern Justification:
${categorySpecific.designPattern || data.keyInsight || "Not provided"}

SOLID Principles Analysis:
${categorySpecific.solidAnalysis || data.feynmanExplanation || "Not provided"}

Extensibility Analysis:
${categorySpecific.extensibilityAnalysis || data.realWorldConnection || "Not provided"}

Implementation Code:
\`\`\`${(data.language || "java").toLowerCase()}
${implementationCode ? implementationCode.substring(0, 2500) : "No implementation provided"}
\`\`\``;
  } else if (data.category === "HR") {
    // HR: use categorySpecificData (new format) if available,
    // fall back to generic field mapping (old format) for backward compat.
    // New format has underlyingConcern, answer, companyConnection, selfAssessment.
    // Old format mapped: approach→analysis, keyInsight→answer, feynmanExplanation→company, realWorldConnection→self-assessment
    const hrSpecific =
      categorySpecific &&
      (categorySpecific.underlyingConcern !== undefined ||
        categorySpecific.answer !== undefined)
        ? categorySpecific
        : null;

    submissionSection = `Question Category:
${categorySpecific?.questionCategory || data.pattern || "Not specified"}

What the Interviewer Is Really Checking:
${hrSpecific?.underlyingConcern || data.approach || "Not provided"}

The Candidate's Answer:
${hrSpecific?.answer || data.keyInsight || "Not provided"}

Company-Specific Evidence:
${hrSpecific?.companyConnection || data.feynmanExplanation || "Not provided"}

Self-Assessment:
${hrSpecific?.selfAssessment || data.realWorldConnection || "Not provided"}`;
  } else if (data.category === "BEHAVIORAL") {
    // Read from categorySpecificData (new format — BehavioralWorkspace) first.
    // Fall back to old field mapping for any submissions made before this change.
    // This preserves backward compatibility with zero breaking changes.
    const behavioralSpecific =
      data.categorySpecificData &&
      (data.categorySpecificData.situation !== undefined ||
        data.categorySpecificData.action !== undefined ||
        data.categorySpecificData.competency !== undefined)
        ? data.categorySpecificData
        : null;

    submissionSection = `Competency Being Tested:
${behavioralSpecific?.competency || data.pattern || "Not specified"}

STAR — Situation & Task:
${behavioralSpecific?.situation || data.approach || "Not provided"}

STAR — Action (What the candidate personally did, step by step):
${behavioralSpecific?.action || data.optimizedApproach || data.code || "Not provided — THIS IS THE CRITICAL MISSING SECTION IF EMPTY"}

STAR — Result & Impact:
${behavioralSpecific?.result || data.keyInsight || "Not provided"}

Reflection (Learning & What They Would Do Differently):
${behavioralSpecific?.reflection || data.feynmanExplanation || "Not provided"}`;
  } else if (data.category === "CS_FUNDAMENTALS") {
    // Read from categorySpecificData (new TechnicalKnowledgeWorkspace format) first.
    // Fall back to old generic field mapping for any pre-existing submissions.
    // Backward compatible — zero breaking changes on existing data.
    const tkSpecific =
      data.categorySpecificData &&
      (data.categorySpecificData.coreExplanation !== undefined ||
        data.categorySpecificData.subject !== undefined ||
        data.categorySpecificData.whyItExists !== undefined)
        ? data.categorySpecificData
        : null;

    submissionSection = `Subject & Concept:
${tkSpecific?.subject || data.pattern || "Not specified"}

Core Explanation — How It Works (Mechanism Level):
${tkSpecific?.coreExplanation || data.approach || "Not provided — THIS IS THE PRIMARY EVALUATION FIELD. If empty, flag as critical gap."}

Why It Was Designed This Way (Design Rationale):
${tkSpecific?.whyItExists || data.optimizedApproach || "Not provided"}

Trade-offs — What It Sacrifices:
${tkSpecific?.tradeoffs || data.keyInsight || "Not provided"}

Real-World Usage & Common Misconceptions:
${tkSpecific?.realWorldUsage || data.feynmanExplanation || "Not provided"}`;
  } else if (data.category === "SQL") {
    submissionSection = `Schema Analysis:
${data.approach || "Not provided"}

Query Pattern Used:
${data.pattern || "Not identified"}

SQL Query:
\`\`\`sql
${data.code ? data.code.substring(0, 2000) : "No query provided"}
\`\`\`

Query Explanation (step by step):
${data.feynmanExplanation || "Not provided"}

Key Optimization:
${data.keyInsight || "Not provided"}

Edge Cases Handled:
${data.realWorldConnection || "Not provided"}`;
  } else {
    // CODING and any unrecognized category — standard presentation
    submissionSection = `Approach:
${data.approach || "Not provided"}
Code:
\`\`\`${(data.language || "plaintext").toLowerCase()}
${data.code ? data.code.substring(0, 2000) : "No code provided"}
\`\`\`
Key Insight: ${data.keyInsight || "Not provided"}
Feynman Explanation: ${data.feynmanExplanation || "Not provided"}
Real-World Connection: ${data.realWorldConnection || "Not provided"}`;
  }

  const user = `Review this ${data.category} solution:
PROBLEM: ${data.problem?.title || "Unknown"}
DESCRIPTION: ${data.problem?.description ? data.problem.description.substring(0, 400) : "Not available"}
--- CANDIDATE SUBMISSION ---
Language Selected: ${data.language || "Not specified"}
Pattern Identified: ${data.pattern || "None"}
Self-Confidence: ${data.confidence}/5 (where 1=forgot it, 5=crystal clear)
Solve Method: ${
    data.solveMethod === "COLD"
      ? "Solved cold — no hints or external help"
      : data.solveMethod === "HINTS"
        ? "Used platform hints during solving"
        : data.solveMethod === "SAW_APPROACH"
          ? "Saw the approach/solution before implementing"
          : "Not specified"
  }
Time Taken: ${timeTakenLabel || "Not specified"}
${submissionSection}
${followUpContext}`;

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
export function problemSelectionPrompt(data) {
  const leetcodeGuidance = `
PLATFORM: LeetCode only.
URL format: https://leetcode.com/problems/[slug]/
SLUG RULES — read carefully:
- Always lowercase with hyphens
- No special characters or spaces
- Verified working examples:
  https://leetcode.com/problems/two-sum/
  https://leetcode.com/problems/best-time-to-buy-and-sell-stock/
  https://leetcode.com/problems/maximum-subarray/
  https://leetcode.com/problems/climbing-stairs/
  https://leetcode.com/problems/valid-parentheses/
  https://leetcode.com/problems/merge-two-sorted-lists/
  https://leetcode.com/problems/binary-search/
  https://leetcode.com/problems/reverse-linked-list/
  https://leetcode.com/problems/number-of-islands/
  https://leetcode.com/problems/coin-change/
  https://leetcode.com/problems/longest-increasing-subsequence/
  https://leetcode.com/problems/word-break/
  https://leetcode.com/problems/course-schedule/
  https://leetcode.com/problems/meeting-rooms-ii/
  https://leetcode.com/problems/merge-intervals/
  https://leetcode.com/problems/longest-substring-without-repeating-characters/
  https://leetcode.com/problems/3sum/
  https://leetcode.com/problems/container-with-most-water/
  https://leetcode.com/problems/product-of-array-except-self/
  https://leetcode.com/problems/find-minimum-in-rotated-sorted-array/
  https://leetcode.com/problems/search-in-rotated-sorted-array/
  https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-search-tree/
  https://leetcode.com/problems/validate-binary-search-tree/
  https://leetcode.com/problems/kth-smallest-element-in-a-bst/
  https://leetcode.com/problems/serialize-and-deserialize-binary-tree/
CONFIDENCE RULES:
- If you are 100% sure the slug is correct → urlConfidence: "high"
- If you think it is correct but not certain → urlConfidence: "medium"
- If you are guessing → urlConfidence: "low"
NEVER guess. If you are not confident, set urlConfidence: "low" and we will handle it.`;

  const slotInstructions = data.platformAssignments
    ? data.platformAssignments
        .map(
          (slot) =>
            `Slot ${slot.slot}: ${slot.difficulty === "auto" ? "Appropriate" : slot.difficulty} difficulty`,
        )
        .join("\n")
    : `Generate ${data.count} problems`;

  const categoryDepth = {
    CODING: `Algorithm patterns to draw from:
Easy: Two Pointers, Sliding Window, Binary Search, Hashing, Basic Sorting, Stack, Queue, Prefix Sum
Medium: Linked List manipulation, Binary Trees (DFS/BFS), Graph traversal, Dynamic Programming (1D), Heaps, Greedy
Hard: Advanced Graphs (Dijkstra, Topological Sort), 2D DP, Backtracking, Trie, Segment Tree, Bit Manipulation`,
    SYSTEM_DESIGN: `Systems: URL Shortener, Chat App (WhatsApp/Slack), News Feed (Twitter/Instagram), Search Engine (Google), Ride Sharing (Uber), Video Streaming (YouTube/Netflix), Payment System (Stripe), Notification Service, Rate Limiter, Distributed Cache (Redis), CDN, Key-Value Store`,
    LOW_LEVEL_DESIGN: `Classic LLD problems to draw from:
Easy: Parking Lot, Elevator System, Vending Machine, Library Management, ATM
Medium: Chess Game, Deck of Cards, Hotel Booking, Food Delivery Order Tracking, Notification Service
Hard: Ride Sharing System (Uber-style class design), Cache with eviction policies (LRU/LFU), Rate Limiter (class level), Online Shopping Cart with discount strategies, Workflow Engine
Design patterns most commonly tested:
Creational: Factory, Abstract Factory, Singleton, Builder
Structural: Adapter, Decorator, Facade, Proxy, Composite
Behavioral: Observer, Strategy, Command, State, Iterator, Template Method
SOLID principles tested in every LLD problem:
- Single Responsibility: Is each class doing ONE thing?
- Open/Closed: Can you add new behavior without changing existing classes?
- Liskov Substitution: Are subtypes truly substitutable?
- Interface Segregation: Are interfaces small and focused?
- Dependency Inversion: Do high-level modules depend on abstractions?`,
    BEHAVIORAL: `Competencies: Leadership, Conflict Resolution, Failure & Learning, Initiative & Ownership, Teamwork, Handling Ambiguity, Customer Focus, Time Management, Technical Disagreement with Manager, Cross-team Collaboration`,
    CS_FUNDAMENTALS: `CRITICAL CONSTRAINT: CS_FUNDAMENTALS is PURELY THEORETICAL.
Every question MUST be a concept explanation question — NEVER "write code", NEVER "implement this", NEVER a LeetCode-style problem.

Valid question types (use these exact formats):
  "Explain how [X] works"
  "What is the difference between [X] and [Y]"
  "Why does [X] exist — what problem does it solve?"
  "What are the trade-offs between [X] and [Y]?"
  "What happens when [X] fails?"
  "When would you choose [X] over [Y]?"

Seven subject domains to draw from:

OPERATING SYSTEMS:
  Process vs Thread (lifecycle, context switching cost, when to use each)
  Virtual Memory and Page Faults (mechanism, TLB, thrashing, production impact)
  Deadlocks (Coffman conditions, detection vs prevention vs avoidance)
  CPU Scheduling (Round Robin, Priority, MLFQ — trade-offs, not implementation)
  Concurrency Primitives (mutex vs semaphore vs monitor — when each is correct)
  Memory Management (stack vs heap, garbage collection strategies)
  IPC mechanisms (pipes, shared memory, message queues)

COMPUTER NETWORKING:
  TCP vs UDP (mechanism difference, when to deliberately choose UDP)
  TCP 3-Way Handshake and Connection Lifecycle (TIME_WAIT and why it exists)
  HTTP/HTTPS/HTTP2/HTTP3 (what changes between versions and why)
  DNS Resolution (full walk from browser to authoritative nameserver)
  Load Balancing (L4 vs L7, round robin vs consistent hashing, session affinity)
  CDN Architecture (origin vs edge, cache invalidation problem)
  TLS Handshake (certificate validation, key exchange mechanism)
  REST vs GraphQL vs gRPC (when each is architecturally correct)

DATABASE INTERNALS (conceptual — not SQL query writing):
  ACID Properties (what each means in practice, not the acronym definition)
  Transaction Isolation Levels (READ UNCOMMITTED → SERIALIZABLE, anomalies prevented)
  B-Tree Index Mechanics (how it works internally, write overhead, when not to index)
  CAP Theorem (with precise definition: C = linearizability, not ACID consistency)
  Sharding vs Replication (read replicas, async vs sync replication, sharding challenges)
  NoSQL Trade-offs (when Cassandra vs MongoDB vs Redis and why)
  Connection Pooling (why it exists, what happens without it at scale)

DATA STRUCTURES & ALGORITHMS — THEORY ONLY:
  Why HashMap is O(1) amortized, not O(1) worst case
  Consistent Hashing and why it solves the rebalancing problem
  Bloom Filters (use cases despite false positives — never asks to implement)
  LRU Cache data structure internals (HashMap + doubly linked list and WHY)
  Why B-Tree beats BST for disk-based storage (node size = disk page)
  Skip List vs balanced BST trade-offs

DISTRIBUTED SYSTEMS:
  Consistency Models (strong vs eventual vs causal — with production examples)
  Consensus Algorithms (Raft/Paxos — what problem they solve conceptually)
  Idempotency (why it matters in distributed systems, how to achieve it in API design)
  Rate Limiting Algorithms (token bucket vs leaky bucket vs sliding window — trade-offs)
  Message Queue Delivery (at-least-once vs exactly-once — why exactly-once is hard)
  Caching Strategies (cache-aside vs write-through vs write-behind)

AI / MACHINE LEARNING FUNDAMENTALS:
  Gradient Descent and why learning rate matters (convergence, oscillation)
  Overfitting vs Underfitting (what causes each, how to detect and fix)
  Bias-Variance Trade-off (in plain language, not mathematical derivation)
  What a Transformer does differently from an RNN (attention mechanism conceptually)
  Vector Embeddings and why similarity search works on them
  Supervised vs Unsupervised vs Reinforcement Learning — when to use each
  What cross-entropy loss measures and why it is used for classification

DATA ENGINEERING:
  Batch vs Stream Processing (latency vs complexity trade-offs)
  ETL vs ELT (why ELT became dominant with cloud data warehouses)
  Columnar Storage (why Parquet is faster for analytical queries than row storage)
  Apache Kafka Architecture (topics, partitions, consumer groups, offset semantics)
  Data Lake vs Data Warehouse vs Data Lakehouse (architectural differences)
  Pipeline Idempotency (why it matters, how to achieve it)
  Schema Evolution (backward and forward compatibility)`,
    HR: `HR interview question categories to draw from:

Career Narrative: Tell me about yourself, Walk me through your resume, Why did you change careers, Explain this employment gap, Why did you leave your last job, Why were you fired
  → Stakes: Common (standard career story questions), Tricky (gap explanations), Sensitive (termination)

Motivation & Company Fit: Why do you want to work here, Why this role, What do you know about our company, Where do you see yourself in 5 years
  → Stakes: Common (standard motivation), Tricky (requires company research depth)

Self-Assessment: What are your greatest strengths, What is your biggest weakness, Greatest professional achievement, Tell me about a time you failed
  → Stakes: Common (strengths), Tricky (weakness — requires authentic framing), Sensitive (failure)

Work Style & Culture: How do you prefer to work, How do you handle disagreement with your manager, Ideal work environment, How do you manage stress
  → Stakes: Common (work style), Tricky (conflict/disagreement)

Logistics & Practical: What are your salary expectations, What is your notice period, Are you open to relocation, Do you have other offers
  → Stakes: Sensitive (salary/competing offers), Common (notice period)

Questions for the Interviewer: What questions would you ask at the end of this interview
  → Stakes: Tricky (requires thoughtful company-specific questions)

SELECTION RULES FOR HR:
1. Generate a mix of stakes levels — not all Common, not all Sensitive
2. Each question should be a single, specific interview question (not a broad theme)
3. For Sensitive questions (HARD difficulty), include coaching context in the title
4. The hrQuestionCategory field MUST be set to one of:
   CAREER_NARRATIVE | MOTIVATION_AND_FIT | SELF_ASSESSMENT | WORK_STYLE | LOGISTICS | QUESTIONS_FOR_THEM`,
    SQL: `Patterns: INNER/LEFT/RIGHT JOINs, Subqueries vs CTEs, Window Functions (ROW_NUMBER, RANK, DENSE_RANK, LAG, LEAD, SUM OVER), GROUP BY with HAVING, EXISTS vs IN, Self JOINs, Recursive CTEs, Query optimization and indexing strategy`,
  };

  const system = `You are a curriculum designer selecting interview problems for a preparation platform.
${data.category === "CODING" || data.category === "SQL" ? leetcodeGuidance : ""}
SLOTS TO FILL:
${slotInstructions}
TEAM INTELLIGENCE (use this to select appropriate problems):
${data.teamContext || "New team — start with accessible fundamentals."}
DIFFICULTY REQUIREMENT:
${data.difficultyInstruction}
AVOID DUPLICATES (these are already in the team):
${data.existingProblems || "None — fresh start."}
CATEGORY: ${data.category}
TOPIC GUIDANCE:
${categoryDepth[data.category] || ""}
${data.targetCompany ? `TARGET COMPANY STYLE: ${data.targetCompany} — prioritize problems this company is known for.` : ""}
${data.focusAreas ? `ADMIN FOCUS REQUEST: ${data.focusAreas} — prioritize these areas.` : ""}
SELECTION RULES:
1. Problems must form a logical learning progression — easier concepts first
2. No duplicate titles with the existing team problems listed above
3. Match the difficulty for each slot exactly
4. For CODING: only select well-known LeetCode problems you are confident about
5. Set urlConfidence honestly — we would rather show no link than a broken one
Return JSON:
{
  "selections": [
    {
      "title": "exact problem title",
      "difficulty": "EASY" | "MEDIUM" | "HARD",
      "platform": "LEETCODE" | "OTHER",
      "url": "https://leetcode.com/problems/[exact-slug]/ or empty string for non-CODING",
      "urlConfidence": "high" | "medium" | "low",
      "pattern": "primary algorithm pattern or topic area",
      "whySelected": "one sentence: why this problem for this team right now",
      "hrQuestionCategory": "CAREER_NARRATIVE | MOTIVATION_AND_FIT | SELF_ASSESSMENT | WORK_STYLE | LOGISTICS | QUESTIONS_FOR_THEM | null — set only for HR problems"
    }
  ],
  "learningPath": "one sentence describing how these problems build on each other"
}`;

  const user = `Select ${data.count} ${data.category.replace("_", " ").toLowerCase()} problem${data.count > 1 ? "s" : ""} for this team.
Follow the slot assignments and difficulty requirements exactly.
Build a logical learning progression.`;

  return { system, user };
}

// ── AI Problem Generation — Stage 2: Rich Content ──────────────
export function problemContentGenerationPrompt(data) {
  const categoryInstructions = {
    CODING: `This is a coding/algorithm problem. Generate content that teaches the PATTERN, not just the solution.
Admin notes MUST include:
1. Brute force approach with time/space complexity
2. Optimal approach with time/space complexity and WHY it is better
3. The key insight that unlocks the solution (the "aha moment")
4. Top 3 mistakes candidates make on this problem
5. How to explain your approach clearly in an interview (2-3 sentences)`,
    SYSTEM_DESIGN: `This is a system design problem. Generate content that teaches distributed systems thinking.
Admin notes MUST include:
1. Functional requirements to clarify upfront
2. Non-functional requirements (scale, latency, availability targets)
3. High-level architecture with 3-5 key components
4. The most important trade-off in this design and why
5. What separates a Strong answer from a Weak answer`,
    LOW_LEVEL_DESIGN: `This is a Low-Level Design / Object-Oriented Design problem. Generate content that teaches OOP thinking, not just a solution.
Admin notes MUST include:
1. Core entities and their responsibilities (Single Responsibility Principle)
2. The recommended class hierarchy with justification (inheritance vs composition decision)
3. Which design pattern(s) apply and WHY — structural reasoning, not just naming
4. SOLID principles analysis — which ones are satisfied and how
5. 3 extensibility follow-ups: "Now add X" — and how the design handles each
6. The most common mistakes candidates make (e.g., making everything a subclass, god objects, wrong pattern)
7. What separates a Strong answer from a Weak answer in this specific problem`,
    BEHAVIORAL: `This is a behavioral interview question. Generate content that teaches STAR storytelling.
Admin notes MUST include:
1. The core competency being tested
2. What a Strong vs Weak STAR answer looks like with examples
3. Red flags interviewers watch for
4. How to quantify impact in the Result
5. The most common mistake candidates make on this question`,
    CS_FUNDAMENTALS: `This is a CS fundamentals question. Generate content that builds deep understanding.
Admin notes MUST include:
1. The core concept explained in simple terms
2. Where this concept appears in real production systems (2-3 specific examples)
3. Common misconceptions to address
4. How deep to go in a typical interview
5. The "gotcha" follow-up question most interviewers ask`,
    HR: `This is an HR interview question. Generate content that teaches authentic, specific answering.
Admin notes MUST include:
1. What the interviewer is truly assessing beneath the question (the real concern)
2. What a Strong vs Weak answer looks like with concrete examples
   Strong: "I'm particularly drawn to [Company]'s recent expansion into [market] because..."
   Weak: "I love your innovative culture and great products"
3. Red flags interviewers watch for (generic answers, badmouthing, no specifics)
4. The common mistake candidates make on this specific question
5. How to make the answer company-specific and authentic

IMPORTANT FOR HR:
- Set hrQuestionCategory to the appropriate value:
  CAREER_NARRATIVE | MOTIVATION_AND_FIT | SELF_ASSESSMENT | WORK_STYLE | LOGISTICS | QUESTIONS_FOR_THEM
- Leave realWorldContext as an empty string — HR questions have no "real world context" in the technical sense
- Leave useCases as an empty string — not applicable to HR questions
- Follow-up questions should be probing follow-ups an interviewer would ask, not technical sub-problems
  EASY = standard follow-up probe (Common stakes)
  MEDIUM = deeper probe requiring more thought (Tricky stakes)
  HARD = most challenging follow-up — sensitive topic or requires deep self-reflection (Sensitive stakes)`,
    SQL: `This is a SQL problem. Generate content that teaches query thinking and optimization.
Admin notes MUST include:
1. How to approach schema analysis (what to look for first)
2. Step-by-step query building walkthrough
3. Alternative approaches (subquery vs JOIN vs CTE) and when to use each
4. Indexing strategy that would improve this query
5. Edge cases to handle: NULLs, duplicates, empty tables`,
  };

  const system = `You are a senior engineering interview coach creating educational content for a single problem.
Goal: a candidate who reads this content should deeply understand the problem, the optimal approach, and how to explain it confidently in an interview.
PROBLEM:
Title: ${data.title}
Category: ${data.category}
Difficulty: ${data.difficulty}
Platform: ${data.platform}
URL: ${data.url}
Pattern/Topic: ${data.pattern || "Not specified"}
${data.hrQuestionCategory ? `HR Question Category: ${data.hrQuestionCategory}` : ""}
${categoryInstructions[data.category] || categoryInstructions.CODING}
${data.targetCompany ? `COMPANY CONTEXT: This problem is commonly asked at ${data.targetCompany}. Tailor the teaching notes to their interview style.` : ""}
Return JSON:
{
  "description": "Complete problem statement. For CODING/SQL: include the full problem description, input/output format, constraints, and 2 worked examples with expected output. For SYSTEM_DESIGN: the full design challenge with scale requirements. For BEHAVIORAL/HR: the interview question and scenario context — just the question itself, clearly worded.",
  "realWorldContext": "2-3 sentences: where does this exact pattern/concept appear in real production systems? For HR problems: return empty string.",
  "useCases": "5 real-world use cases, each on a new line. Format: 'Company/System — exactly what they use this for'. For HR problems: return empty string.",
  "adminNotes": "Comprehensive teaching guide following the category-specific structure above. Use numbered lists. Be concrete and specific.",
  "tags": ["tag1", "tag2", "tag3"],
  "companyTags": ["company1", "company2"],
  "hrQuestionCategory": "<string | null — for HR problems ONLY: CAREER_NARRATIVE | MOTIVATION_AND_FIT | SELF_ASSESSMENT | WORK_STYLE | LOGISTICS | QUESTIONS_FOR_THEM. For all other categories: null>",
  "followUpQuestions": [
    {
      "question": "First follow-up question",
      "difficulty": "EASY",
      "hint": "A nudge that opens the right thinking without giving the answer"
    },
    {
      "question": "Second follow-up question",
      "difficulty": "MEDIUM",
      "hint": "A hint pointing toward the key insight needed"
    },
    {
      "question": "Third follow-up question",
      "difficulty": "HARD",
      "hint": "A hint that opens the right mental model for the advanced case"
    }
  ]
}`;

  const user = `Generate comprehensive educational content for: "${data.title}" (${data.difficulty} ${data.category})`;
  return { system, user };
}

// ── AI Problem Generation (Batch) — Legacy Fallback ────────────
// Used when the multi-stage pipeline's Stage 2 fails.
// Kept for resilience — single call approach as backup.
export function problemGenerationPrompt(data) {
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

  // HR problems have different fields than coding problems
  const isHR = data.category === "HR";
  const sourceField = isHR
    ? `"source": "OTHER",
      "sourceUrl": "",`
    : `"source": "LEETCODE",
      "sourceUrl": "string — exact LeetCode URL or empty string if not confident",`;

  const system = `You are an expert interview preparation curriculum designer.
Generate high-quality ${data.category} interview problems.
${
  !isHR
    ? `For CODING/SQL problems:
- Use ONLY LeetCode: https://leetcode.com/problems/[slug]/
- Only include URLs you are highly confident are correct
- Slug is always lowercase-with-hyphens`
    : `For HR problems:
- No external URLs needed — HR questions are self-contained
- Each problem is a single specific interview question
- Include hrQuestionCategory for each question`
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
      "description": "string — the full question or problem statement",
      "difficulty": "EASY" | "MEDIUM" | "HARD",
      "category": "${data.category}",
      ${sourceField}
      "tags": ["string"],
      "companyTags": ["string"],
      "realWorldContext": "${isHR ? "" : "string"}",
      "useCases": "${isHR ? "" : "string — newline separated"}",
      "adminNotes": "string — teaching notes",
      ${isHR ? '"hrQuestionCategory": "CAREER_NARRATIVE | MOTIVATION_AND_FIT | SELF_ASSESSMENT | WORK_STYLE | LOGISTICS | QUESTIONS_FOR_THEM",' : ""}
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
