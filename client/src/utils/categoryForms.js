/**
 * CATEGORY FORM CONFIGURATIONS
 * Maps each problem category to its submission form structure.
 * Reuses existing Solution fields with different labels/placeholders.
 */

export const CATEGORY_FORMS = {
  CODING: {
    steps: [
      {
        id: 1,
        label: "Pattern",
        icon: "🧩",
        desc: "Identify the algorithm pattern",
      },
      {
        id: 2,
        label: "Solutions",
        icon: "💻",
        desc: "Your approaches with code and complexity",
      },
      {
        id: 3,
        label: "Reflection",
        icon: "🔬",
        desc: "Insights, explanations, and self-assessment",
      },
    ],
    fields: {
      patternIdentified: {
        label: "Pattern Identified",
        placeholder:
          "e.g. Two Pointers, Sliding Window, Dynamic Programming...",
        show: true,
      },
      patternReasoning: {
        label: "How did you identify this pattern?",
        placeholder: "What clues in the problem pointed you to this approach?",
        show: true,
      },
      keyInsight: {
        label: "Key Insight",
        placeholder: "The single thing that makes this problem click...",
        hint: 'In one sentence — what\'s the "aha!" moment?',
        show: true,
      },
      simpleExplanation: {
        label: "Explain It Simply",
        placeholder:
          "Explain to a non-programmer. Where does this appear in real software?",
        show: true,
      },
      challenges: {
        label: "What Was Challenging?",
        placeholder:
          "Where did you get stuck? What made this harder than expected?",
        show: true,
      },
    },
    showSolutionTabs: true,
    showFollowUps: true,
  },

  SYSTEM_DESIGN: {
    steps: [
      {
        id: 1,
        label: "Requirements",
        icon: "📋",
        desc: "Clarify what you're building",
      },
      {
        id: 2,
        label: "Design",
        icon: "🏗️",
        desc: "Architecture, components, and data flow",
      },
      {
        id: 3,
        label: "Depth",
        icon: "🔬",
        desc: "Scaling, trade-offs, and real-world comparisons",
      },
    ],
    fields: {
      patternIdentified: {
        label: "Design Pattern",
        placeholder: "e.g. Microservices, Event-driven, CQRS, Pub/Sub...",
        show: true,
      },
      patternReasoning: {
        label: "Requirements Clarification",
        placeholder:
          "Functional requirements, non-functional requirements, constraints, assumptions...",
        hint: "What questions would you ask the interviewer?",
        show: true,
      },
      keyInsight: {
        label: "Key Trade-off",
        placeholder:
          "The most important design decision and why you made it...",
        hint: "Every system design has a core trade-off — what's yours?",
        show: true,
      },
      simpleExplanation: {
        label: "Scaling Strategy",
        placeholder:
          "How does the system handle 10x, 100x load? What breaks first?",
        show: true,
      },
      challenges: {
        label: "Bottlenecks & Failure Modes",
        placeholder: "What are the weakest points? How do you handle failures?",
        show: true,
      },
    },
    showSolutionTabs: true,
    solutionTabConfig: {
      types: [
        { id: "HIGH_LEVEL", label: "High-Level Design", icon: "🏗️" },
        { id: "DEEP_DIVE", label: "Deep Dive Component", icon: "🔍" },
        { id: "ALTERNATIVE", label: "Alternative Design", icon: "🔄" },
      ],
      approachLabel: "Design Description",
      approachPlaceholder:
        "Describe the architecture — components, data flow, APIs, database schema...",
      complexityLabels: {
        time: "Estimated QPS / Throughput",
        space: "Estimated Storage",
      },
      codeLabel: "API Design / Schema",
      codePlaceholder:
        "// Define key APIs, database schema, or config\n\nPOST /api/messages\n  body: { senderId, receiverId, content }\n  response: { messageId, timestamp }",
      notesLabel: "Architecture Notes",
    },
    showFollowUps: true,
  },

  BEHAVIORAL: {
    steps: [
      {
        id: 1,
        label: "Context",
        icon: "📖",
        desc: "Set the scene — Situation and Task",
      },
      {
        id: 2,
        label: "Response",
        icon: "🎯",
        desc: "What you did — Action steps",
      },
      {
        id: 3,
        label: "Reflection",
        icon: "🔬",
        desc: "Impact, metrics, and learnings",
      },
    ],
    fields: {
      patternIdentified: {
        label: "Question Type",
        placeholder:
          "e.g. Leadership, Conflict Resolution, Failure, Initiative...",
        show: true,
        suggestions: [
          "Leadership",
          "Conflict Resolution",
          "Failure & Learning",
          "Initiative & Ownership",
          "Teamwork",
          "Time Management",
          "Technical Challenge",
          "Disagreement",
          "Ambiguity",
          "Customer Focus",
        ],
      },
      patternReasoning: {
        label: "STAR — Situation & Task",
        placeholder:
          "Set the context. What was the situation? What was your specific role and task?",
        hint: "Be specific — name the project, team size, timeline, stakes.",
        show: true,
      },
      keyInsight: {
        label: "Key Learning",
        placeholder:
          "What did you learn from this experience? How did it change your approach?",
        hint: "Interviewers want growth mindset — show what you'd do differently.",
        show: true,
      },
      simpleExplanation: {
        label: "STAR — Result & Impact",
        placeholder:
          "What was the outcome? Include metrics if possible (%, $, time saved).",
        hint: 'Quantify whenever you can — "reduced deploy time by 40%".',
        show: true,
      },
      challenges: {
        label: "What Would You Do Differently?",
        placeholder: "If you faced this again, what would you change?",
        show: true,
      },
    },
    showSolutionTabs: false,
    showActionSection: true,
    actionField: {
      label: "STAR — Action (Step by Step)",
      placeholder:
        "What specific steps did you take? Be detailed — this is the core of your answer.",
      hint: 'Use "I" not "we" — interviewers want YOUR actions.',
    },
    showFollowUps: true,
  },

  CS_FUNDAMENTALS: {
    steps: [
      {
        id: 1,
        label: "Concept",
        icon: "📚",
        desc: "Explain the concept in your own words",
      },
      {
        id: 2,
        label: "Details",
        icon: "🔍",
        desc: "Examples, edge cases, and misconceptions",
      },
      {
        id: 3,
        label: "Application",
        icon: "🌍",
        desc: "Real-world usage and interview talking points",
      },
    ],
    fields: {
      patternIdentified: {
        label: "Core Topic",
        placeholder: "e.g. Virtual Memory, TCP Handshake, B-Tree Indexing...",
        show: true,
      },
      patternReasoning: {
        label: "Concept Explanation",
        placeholder:
          "Explain this concept clearly in your own words. Imagine teaching it to a junior developer.",
        hint: 'Start with the "what", then the "why", then the "how".',
        show: true,
      },
      keyInsight: {
        label: "Key Distinction",
        placeholder:
          "What's the one thing that separates deep understanding from surface knowledge?",
        hint: "The subtle detail that interviewers test for.",
        show: true,
      },
      simpleExplanation: {
        label: "Real-World Examples",
        placeholder:
          "Where is this concept used in real systems? Give 2-3 concrete examples.",
        show: true,
      },
      challenges: {
        label: "Common Misconceptions",
        placeholder:
          "What do most people get wrong about this? What tripped you up?",
        show: true,
      },
    },
    showSolutionTabs: false,
    showDetailSection: true,
    detailField: {
      label: "Detailed Breakdown",
      placeholder:
        "Walk through the concept step by step. Include diagrams in text form if helpful.",
      hint: "Use examples, edge cases, and comparisons with related concepts.",
    },
    showFollowUps: true,
  },

  HR: {
    steps: [
      {
        id: 1,
        label: "Analysis",
        icon: "🔍",
        desc: "What is the interviewer really asking?",
      },
      {
        id: 2,
        label: "Response",
        icon: "💬",
        desc: "Your authentic, specific answer",
      },
      {
        id: 3,
        label: "Research",
        icon: "🏢",
        desc: "Company connection and preparation",
      },
    ],
    fields: {
      patternIdentified: {
        label: "Question Category",
        placeholder: "e.g. Motivation, Career Goals, Strengths, Culture Fit...",
        show: true,
        suggestions: [
          "Motivation & Why",
          "Career Goals",
          "Strengths & Weaknesses",
          "Culture Fit",
          "Salary Expectations",
          "Work Style",
          "Why Leaving",
          "Why This Role",
        ],
      },
      patternReasoning: {
        label: "What Are They Really Asking?",
        placeholder:
          "Behind every HR question is a real concern. What is the interviewer trying to assess?",
        hint: '"Why should we hire you?" = "Can you articulate your unique value?"',
        show: true,
      },
      keyInsight: {
        label: "Your Core Message",
        placeholder: "One sentence that captures the essence of your answer.",
        hint: "Every great HR answer has a clear, memorable takeaway.",
        show: true,
      },
      simpleExplanation: {
        label: "Your Answer",
        placeholder:
          "Write your complete, polished response. Be authentic and specific.",
        hint: "Avoid generic answers — mention specific projects, numbers, or experiences.",
        show: true,
      },
      challenges: {
        label: "Company Research Connection",
        placeholder:
          "How does your answer connect specifically to THIS company?",
        hint: "Mention their mission, recent news, product, or values.",
        show: true,
      },
    },
    showSolutionTabs: false,
    showFollowUps: false,
  },

  SQL: {
    steps: [
      {
        id: 1,
        label: "Understanding",
        icon: "📋",
        desc: "Analyze the schema and requirements",
      },
      {
        id: 2,
        label: "Solution",
        icon: "🗄️",
        desc: "Write and explain your query",
      },
      {
        id: 3,
        label: "Optimization",
        icon: "⚡",
        desc: "Index strategy, performance, edge cases",
      },
    ],
    fields: {
      patternIdentified: {
        label: "Query Pattern",
        placeholder:
          "e.g. JOIN, Subquery, Window Function, CTE, Aggregation...",
        show: true,
        suggestions: [
          "JOIN",
          "Subquery",
          "Window Function",
          "CTE",
          "Aggregation",
          "GROUP BY",
          "HAVING",
          "UNION",
          "EXISTS",
          "Recursive CTE",
        ],
      },
      patternReasoning: {
        label: "Schema Analysis",
        placeholder:
          "What tables are involved? What are the relationships? What does the query need to return?",
        hint: "Understanding the schema is 50% of writing the correct query.",
        show: true,
      },
      keyInsight: {
        label: "Key Optimization",
        placeholder:
          "What index would you add? What makes this query efficient or inefficient?",
        hint: "Think about: index strategy, query plan, N+1 problems.",
        show: true,
      },
      simpleExplanation: {
        label: "Query Explanation",
        placeholder:
          "Walk through your query step by step. Why each JOIN, WHERE, GROUP BY?",
        show: true,
      },
      challenges: {
        label: "Edge Cases",
        placeholder:
          "NULL values, empty tables, duplicate rows, large datasets...",
        show: true,
      },
    },
    showSolutionTabs: true,
    solutionTabConfig: {
      types: [
        { id: "BRUTE_FORCE", label: "Basic Query", icon: "🐌" },
        { id: "OPTIMIZED", label: "Optimized Query", icon: "⚡" },
        { id: "ALTERNATIVE", label: "Alternative", icon: "🔄" },
      ],
      approachLabel: "Query Approach",
      approachPlaceholder: "Describe what your query does at a high level...",
      complexityLabels: {
        time: "Time Complexity",
        space: "Space / Index Cost",
      },
      codeLabel: "SQL Query",
      codePlaceholder:
        "-- Write your SQL query here\n\nSELECT\n  u.name,\n  COUNT(o.id) AS order_count\nFROM users u\nLEFT JOIN orders o ON o.user_id = u.id\nGROUP BY u.id\nHAVING COUNT(o.id) > 5\nORDER BY order_count DESC;",
      defaultLanguage: "SQL",
      notesLabel: "Query Notes",
    },
    showFollowUps: true,
  },
};

/**
 * Get the form config for a given category
 */
export function getCategoryForm(category) {
  return CATEGORY_FORMS[category] || CATEGORY_FORMS.CODING;
}
