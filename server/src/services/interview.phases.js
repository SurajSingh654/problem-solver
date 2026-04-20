/**
 * INTERVIEW PHASE CONFIGURATIONS
 * Defines the time-boxed phases for each interview category.
 * The AI interviewer uses these to guide the conversation.
 */

export const INTERVIEW_PHASES = {
  CODING: {
    defaultDuration: 2700, // 45 minutes
    phases: [
      {
        name: "Requirements",
        duration: 300, // 5 minutes
        description:
          "Clarify the problem requirements, constraints, and edge cases.",
        aiPrompt:
          'Start by asking the candidate to clarify the requirements. If they jump straight to coding, gently redirect: "Before we start coding, let\'s make sure we understand the problem. What questions do you have?"',
      },
      {
        name: "Approach",
        duration: 600, // 10 minutes
        description: "Discuss the approach — brute force first, then optimize.",
        aiPrompt:
          "Ask the candidate to describe their approach before coding. Evaluate: \"What's your initial approach? What's the time complexity?\" If they go straight to optimal, ask about brute force first.",
      },
      {
        name: "Implementation",
        duration: 1200, // 20 minutes
        description: "Write the code. The candidate should be coding now.",
        aiPrompt:
          "The candidate should be writing code now. Watch their code editor. If they're stuck for more than 3 minutes, offer a gentle hint. Ask about their variable naming and approach as they code.",
      },
      {
        name: "Testing",
        duration: 600, // 10 minutes
        description:
          "Test the solution with examples, edge cases, and discuss optimization.",
        aiPrompt:
          'Ask the candidate to walk through their code with a test case. Then ask about edge cases: "What happens with an empty input? What about duplicates?" Discuss if there\'s a way to optimize further.',
      },
    ],
  },

  SYSTEM_DESIGN: {
    defaultDuration: 2700,
    phases: [
      {
        name: "Requirements",
        duration: 300,
        description: "Clarify functional and non-functional requirements.",
        aiPrompt:
          'Ask: "Before we design, what are the key requirements?" Push for: functional requirements, non-functional requirements (scale, latency, availability), and constraints. If they skip non-functional, ask specifically.',
      },
      {
        name: "High-Level Design",
        duration: 600,
        description: "Draw the overall architecture with major components.",
        aiPrompt:
          "Ask the candidate to draw the high-level architecture. They should use the diagram tool. Ask about: major components, how they communicate, and data flow. Check their diagram as they draw.",
      },
      {
        name: "Deep Dive",
        duration: 900,
        description: "Dive deep into 2-3 critical components.",
        aiPrompt:
          'Pick the most interesting or critical component from their design and ask them to go deeper: database schema, API design, data partitioning. Challenge their choices: "Why this database? What are the trade-offs?"',
      },
      {
        name: "Scaling & Trade-offs",
        duration: 600,
        description: "Discuss scaling, failure modes, and trade-offs.",
        aiPrompt:
          'Ask about scale: "What happens at 10x traffic?" Ask about failures: "What if this service goes down?" Push for trade-offs: "You chose consistency over availability — when might you choose differently?"',
      },
      {
        name: "Wrap Up",
        duration: 300,
        description: "Summarize the design and discuss improvements.",
        aiPrompt:
          'Ask the candidate to summarize their design in 2-3 sentences. Then ask: "If you had more time, what would you improve?" This reveals self-awareness and prioritization skills.',
      },
    ],
  },

  BEHAVIORAL: {
    defaultDuration: 1800, // 30 minutes
    phases: [
      {
        name: "Question",
        duration: 60,
        description: "AI presents the behavioral question.",
        aiPrompt:
          'Present the behavioral question clearly. Give the candidate a moment to think. Say: "Take a moment to think of a specific example, then walk me through it."',
      },
      {
        name: "STAR Response",
        duration: 600,
        description: "Candidate tells their story using STAR format.",
        aiPrompt:
          'Listen to their full response. Don\'t interrupt unless they\'re going off track. Evaluate: Is it a SPECIFIC story or generic? Do they use "I" or "we"? Are there concrete details?',
      },
      {
        name: "Follow-ups",
        duration: 600,
        description: "AI asks probing follow-up questions.",
        aiPrompt:
          'Ask 3-4 follow-up questions that probe deeper: "What specifically did YOU do?" "How did you measure success?" "What would you do differently?" "How did others react?"',
      },
      {
        name: "Reflection",
        duration: 300,
        description: "Discuss learnings and how the experience shaped them.",
        aiPrompt:
          'Ask: "What did you learn from this experience?" and "How has it changed your approach since then?" Evaluate growth mindset and self-awareness.',
      },
    ],
  },

  CS_FUNDAMENTALS: {
    defaultDuration: 1800,
    phases: [
      {
        name: "Core Explanation",
        duration: 600,
        description: "Candidate explains the concept from scratch.",
        aiPrompt:
          'Ask the candidate to explain the concept as if teaching it. Evaluate: accuracy, completeness, clarity. If they miss key parts, ask: "Can you tell me more about [specific aspect]?"',
      },
      {
        name: "Deep Dive",
        duration: 600,
        description: "Probe deeper into implementation details and edge cases.",
        aiPrompt:
          'Ask specific technical questions that test deep understanding. For example: "What happens when...?" "How does the OS handle...?" "What\'s the difference between X and Y?"',
      },
      {
        name: "Real-World Application",
        duration: 300,
        description: "Connect the concept to real-world systems.",
        aiPrompt:
          'Ask: "Where is this concept used in real production systems?" and "How would you apply this knowledge in your daily work?" Evaluate practical understanding.',
      },
      {
        name: "Common Misconceptions",
        duration: 300,
        description:
          "Test if the candidate knows what people commonly get wrong.",
        aiPrompt:
          'Present a common misconception and ask if it\'s correct. For example: "Some people say [wrong thing]. Is that correct?" Tests depth beyond textbook knowledge.',
      },
    ],
  },

  SQL: {
    defaultDuration: 1800,
    phases: [
      {
        name: "Schema Analysis",
        duration: 300,
        description: "Understand the schema and requirements.",
        aiPrompt:
          'Present the schema and ask the candidate to analyze it. Ask: "What are the relationships between these tables?" "What indexes would you expect?" Make sure they understand the data before writing queries.',
      },
      {
        name: "Query Writing",
        duration: 600,
        description: "Write the SQL query.",
        aiPrompt:
          "Ask the candidate to write the query. Watch their SQL editor. If they're stuck, hint at the approach: \"Have you considered using a JOIN here?\" Don't give the answer, guide them.",
      },
      {
        name: "Optimization",
        duration: 300,
        description: "Discuss query optimization and indexing.",
        aiPrompt:
          'Ask: "How would you optimize this query?" "What indexes would help?" "What\'s the query execution plan?" Test if they understand WHY their query works, not just THAT it works.',
      },
      {
        name: "Edge Cases",
        duration: 300,
        description: "Test with edge cases — NULLs, empty tables, duplicates.",
        aiPrompt:
          'Ask about edge cases: "What if this column has NULL values?" "What if the table is empty?" "What about duplicates?" See if their query handles these correctly.',
      },
    ],
  },

  HR: {
    defaultDuration: 1200, // 20 minutes
    phases: [
      {
        name: "Question",
        duration: 60,
        description: "AI presents the HR question.",
        aiPrompt:
          'Present the HR question. Be warm and conversational. Say: "I\'d like to learn more about you. [question]"',
      },
      {
        name: "Response",
        duration: 480,
        description: "Candidate gives their prepared answer.",
        aiPrompt:
          "Listen to their full response. Evaluate: Is it authentic or rehearsed? Is it specific to THIS company or generic? Does it show genuine motivation?",
      },
      {
        name: "Follow-ups",
        duration: 360,
        description: "AI asks follow-up questions to test depth.",
        aiPrompt:
          'Ask 2-3 follow-ups that test authenticity: "You mentioned [specific thing] — can you elaborate?" "How does this connect to your long-term goals?" "What specifically about our company excites you?"',
      },
      {
        name: "Closing",
        duration: 300,
        description: "Candidate asks questions to the interviewer.",
        aiPrompt:
          'Say: "Do you have any questions for me about the role or the company?" Evaluate: Are their questions thoughtful and specific? Or generic like "What\'s the work-life balance?"',
      },
    ],
  },
};

/**
 * Get phase config for a category with time allocations
 */
export function getPhaseConfig(category, customDuration) {
  const config = INTERVIEW_PHASES[category] || INTERVIEW_PHASES.CODING;
  const totalDefault = config.defaultDuration;
  const totalActual = customDuration || totalDefault;
  const ratio = totalActual / totalDefault;

  return {
    category,
    totalDuration: totalActual,
    phases: config.phases.map((phase) => ({
      ...phase,
      duration: Math.round(phase.duration * ratio),
      started: false,
      completedAt: null,
    })),
  };
}

/**
 * Get the company-specific interviewer persona prompt
 */
export function getCompanyPersona(company) {
  const personas = {
    Google: {
      name: "Alex",
      style: "collaborative and encouraging",
      focus: "algorithmic thinking, code quality, and scalability",
      intro:
        "Hi! I'm Alex, and I'll be your interviewer today. At Google, we care about how you think through problems, not just getting the right answer. Feel free to think out loud — I'm here to help if you get stuck.",
    },
    Meta: {
      name: "Sarah",
      style: "direct and practical",
      focus: "scale, simplicity, and practical trade-offs",
      intro:
        "Hey! I'm Sarah. At Meta, we value engineers who can ship at scale. I'll give you a problem and we'll work through it together. I care more about your reasoning than perfect code.",
    },
    Amazon: {
      name: "James",
      style: "probing and principle-driven",
      focus: "Leadership Principles, ownership, and customer obsession",
      intro:
        "Hello, I'm James. At Amazon, we evaluate candidates against our Leadership Principles. I'll be asking you about your experiences — please be as specific as possible with real examples.",
    },
    Microsoft: {
      name: "Priya",
      style: "thorough and methodical",
      focus: "problem decomposition, testing, and design",
      intro:
        "Hi there! I'm Priya. At Microsoft, we look for engineers who can break down complex problems and think about reliability. Let's work through this together.",
    },
    Startup: {
      name: "Chris",
      style: "fast-paced and pragmatic",
      focus: "breadth, speed, and practical impact",
      intro:
        "Hey! I'm Chris, the engineering lead. We're a fast-moving team, so I want to see how you think on your feet. Don't worry about perfection — I care about good trade-offs and practical solutions.",
    },
  };

  // Extract company name from strings like "Google L5", "Meta E4"
  const companyName = company?.split(" ")[0] || "Google";
  return personas[companyName] || personas["Google"];
}
