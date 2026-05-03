/**
 * CONSTANTS — App-wide constant values
 * Single source of truth for all enum-like values.
 * Matches the Prisma schema enums exactly.
 */

// ── Difficulty ─────────────────────────────────────
export const DIFFICULTY = {
  EASY: "EASY",
  MEDIUM: "MEDIUM",
  HARD: "HARD",
};

export const DIFFICULTY_LABELS = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
};

export const DIFFICULTY_COLORS = {
  EASY: "text-easy   bg-success/10 border-success/25",
  MEDIUM: "text-medium bg-warning/10 border-warning/25",
  HARD: "text-hard   bg-danger/10  border-danger/25",
};

// ── Source platforms ───────────────────────────────
export const SOURCE = {
  LEETCODE: "LEETCODE",
  GFG: "GFG",
  CODECHEF: "CODECHEF",
  INTERVIEWBIT: "INTERVIEWBIT",
  HACKERRANK: "HACKERRANK",
  CODEFORCES: "CODEFORCES",
  OTHER: "OTHER",
};

export const SOURCE_LABELS = {
  LEETCODE: "LeetCode",
  GFG: "GeeksForGeeks",
  CODECHEF: "CodeChef",
  INTERVIEWBIT: "InterviewBit",
  HACKERRANK: "HackerRank",
  CODEFORCES: "Codeforces",
  OTHER: "Other",
};

export const SOURCE_COLORS = {
  LEETCODE: "bg-leetcode/10    text-leetcode    border-leetcode/25",
  GFG: "bg-gfg/10         text-gfg         border-gfg/25",
  CODECHEF: "bg-codechef/10    text-codechef    border-codechef/25",
  INTERVIEWBIT: "bg-interviewbit/10 text-interviewbit border-interviewbit/25",
  HACKERRANK: "bg-hackerrank/10  text-hackerrank  border-hackerrank/25",
  CODEFORCES: "bg-codeforces/10  text-codeforces  border-codeforces/25",
  OTHER: "bg-surface-3      text-text-secondary border-border-default",
};

// ── Languages ──────────────────────────────────────
export const LANGUAGE = {
  PYTHON: "PYTHON",
  JAVASCRIPT: "JAVASCRIPT",
  JAVA: "JAVA",
  CPP: "CPP",
  C: "C",
  GO: "GO",
  RUST: "RUST",
  TYPESCRIPT: "TYPESCRIPT",
  GROOVY: "GROOVY",
  SWIFT: "SWIFT",
  KOTLIN: "KOTLIN",
  OTHER: "OTHER",
};

export const LANGUAGE_LABELS = {
  PYTHON: "Python",
  JAVASCRIPT: "JavaScript",
  JAVA: "Java",
  CPP: "C++",
  C: "C",
  GO: "Go",
  RUST: "Rust",
  TYPESCRIPT: "TypeScript",
  SWIFT: "Swift",
  KOTLIN: "Kotlin",
  GROOVY: "Groovy",
  OTHER: "Other",
};

// Maps to highlight.js language identifiers
export const LANGUAGE_HLJS = {
  PYTHON: "python",
  JAVASCRIPT: "javascript",
  JAVA: "java",
  CPP: "cpp",
  C: "c",
  GO: "go",
  RUST: "rust",
  TYPESCRIPT: "typescript",
  GROOVY: "groovy",
  SWIFT: "swift",
  KOTLIN: "kotlin",
  OTHER: "plaintext",
};

// ── Algorithm patterns ─────────────────────────────
export const PATTERNS = [
  { id: "array-hashing", label: "Array / Hashing", icon: "Hash" },
  { id: "two-pointers", label: "Two Pointers", icon: "GitMerge" },
  { id: "sliding-window", label: "Sliding Window", icon: "Maximize2" },
  { id: "stack", label: "Stack", icon: "Layers" },
  { id: "binary-search", label: "Binary Search", icon: "Search" },
  { id: "linked-list", label: "Linked List", icon: "Link" },
  { id: "trees", label: "Trees", icon: "GitBranch" },
  { id: "tries", label: "Tries", icon: "Network" },
  { id: "heap", label: "Heap / Priority Queue", icon: "Triangle" },
  { id: "backtracking", label: "Backtracking", icon: "CornerUpLeft" },
  { id: "graphs", label: "Graphs", icon: "Share2" },
  { id: "dynamic-programming", label: "Dynamic Programming", icon: "Cpu" },
  { id: "greedy", label: "Greedy", icon: "Zap" },
  { id: "intervals", label: "Intervals", icon: "AlignJustify" },
  { id: "math-geometry", label: "Math & Geometry", icon: "Calculator" },
  { id: "bit-manipulation", label: "Bit Manipulation", icon: "Binary" },
];

// ── Companies ──────────────────────────────────────
export const COMPANIES = [
  "Google",
  "Meta",
  "Amazon",
  "Microsoft",
  "Apple",
  "Netflix",
  "Uber",
  "Airbnb",
  "Stripe",
  "Dropbox",
  "Twitter",
  "LinkedIn",
  "Salesforce",
  "Adobe",
  "Oracle",
  "Jane Street",
  "Two Sigma",
  "Citadel",
  "Goldman Sachs",
  "JPMorgan",
  "Bloomberg",
  "Palantir",
  "ByteDance",
  "Atlassian",
  "Shopify",
  "Spotify",
  "Snap",
  "Pinterest",
];

// ── Confidence levels ──────────────────────────────
export const CONFIDENCE_LEVELS = [
  { value: 1, emoji: "😰", label: "Forgot it", color: "text-danger" },
  { value: 2, emoji: "🤔", label: "Very hazy", color: "text-warning" },
  { value: 3, emoji: "😐", label: "Somewhat clear", color: "text-info" },
  { value: 4, emoji: "😊", label: "Pretty solid", color: "text-brand-300" },
  { value: 5, emoji: "🔥", label: "Crystal clear", color: "text-success" },
];

// ── Spaced repetition intervals (days) ────────────
export const REVIEW_INTERVALS = [1, 3, 7, 14, 30];

// ── Interview simulation defaults ─────────────────
export const SIM_DEFAULT_DURATION_MINS = 45;

// ── Roles ──────────────────────────────────────────
export const ROLE = {
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
};

// ── User levels ────────────────────────────────────
export const LEVEL = {
  BEGINNER: "BEGINNER",
  INTERMEDIATE: "INTERMEDIATE",
  ADVANCED: "ADVANCED",
};

// ── 6D Intelligence dimensions ────────────────────
export const DIMENSIONS = [
  {
    id: "patternRecognition",
    label: "Pattern Recognition",
    short: "Pattern",
    color: "#7c6ff7",
    desc: "Speed and accuracy at identifying the right algorithm pattern",
  },
  {
    id: "solutionDepth",
    label: "Solution Depth",
    short: "Depth",
    color: "#22c55e",
    desc: "Quality of explanations, insights, and real-world connections",
  },
  {
    id: "communication",
    label: "Communication",
    short: "Comms",
    color: "#3b82f6",
    desc: "Clarity of written explanations as rated by teammates",
  },
  {
    id: "optimization",
    label: "Optimization",
    short: "Optimize",
    color: "#eab308",
    desc: "Ability to improve from brute force to optimal solutions",
  },
  {
    id: "pressurePerformance",
    label: "Pressure Performance",
    short: "Pressure",
    color: "#ef4444",
    desc: "Solution quality under timed interview simulation conditions",
  },
  {
    id: "retention",
    label: "Knowledge Retention",
    short: "Retention",
    color: "#a855f7",
    desc: "How well you recall solutions during spaced repetition reviews",
  },
];

// ── AI features config (ready for later integration) ──
export const AI_CONFIG = {
  enabled: false, // flip to true when API key added
  features: {
    hintGeneration: false, // generate hints for stuck users
    approachFeedback: false, // AI feedback on written approach
    realWorldSuggestion: false, // suggest real-world analogies
    actionPlanGen: false, // AI-powered weekly action plans
    interviewCoach: false, // AI interviewer during sim mode
  },
};

// ── API config ────────────────────────────────────
export const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

// ── Query keys (TanStack Query) ───────────────────
export const QUERY_KEYS = {
  ME: ["me"],
  PROBLEMS: ["problems"],
  PROBLEM: (id) => ["problems", id],
  SOLUTIONS: ["solutions"],
  PROBLEM_SOLUTIONS: (id) => ["solutions", "problem", id],
  MY_SOLUTIONS: ["solutions", "mine"],
  LEADERBOARD: ["leaderboard"],
  REPORT: ["report"],
  TEAM_STATS: ["stats", "team"],
  USERS: ["users"],
  USER: (username) => ["users", username],
};

// ── Quiz suggested subjects ────────────────────────
export const QUIZ_SUGGESTED_SUBJECTS = [
  { label: "Data Structures", icon: "🧩" },
  { label: "Algorithms", icon: "⚙️" },
  { label: "System Design", icon: "🏗️" },
  { label: "Operating Systems", icon: "🖥️" },
  { label: "Computer Networks", icon: "🌐" },
  { label: "DBMS & SQL", icon: "🗄️" },
  { label: "OOP Concepts", icon: "📦" },
  { label: "JavaScript", icon: "💛" },
  { label: "Python", icon: "🐍" },
  { label: "Java", icon: "☕" },
  { label: "React", icon: "⚛️" },
  { label: "Node.js", icon: "🟢" },
  { label: "AI / Machine Learning", icon: "🤖" },
  { label: "Cloud Computing", icon: "☁️" },
  { label: "Docker & Kubernetes", icon: "🐳" },
  { label: "Git & Version Control", icon: "🔀" },
  { label: "REST APIs", icon: "🔌" },
  { label: "GraphQL", icon: "📊" },
  { label: "Cybersecurity", icon: "🔒" },
  { label: "Mathematics", icon: "📐" },
  { label: "Probability & Statistics", icon: "🎲" },
  { label: "Physics", icon: "⚡" },
  { label: "Aptitude & Reasoning", icon: "🧠" },
  { label: "Behavioral Interview", icon: "🗣️" },
];

// ── Problem categories ─────────────────────────────
//
// CATEGORY RESEARCH BASIS:
// 7 categories covering every distinct SWE interview round type:
// - CODING: Universal. Every company. Algorithmic thinking under pressure.
// - SYSTEM_DESIGN: Mid/Senior+. Distributed systems, scale, trade-offs.
// - LOW_LEVEL_DESIGN: Backend/All companies (Amazon, Atlassian, Adobe, Salesforce).
//   OOP, design patterns, SOLID principles. Distinct from System Design.
// - BEHAVIORAL: Universal. BEI methodology. STAR format. Competency assessment.
// - CS_FUNDAMENTALS: Backend/Infra roles. OS, Networking, DB internals.
//   Display label "Technical Knowledge" — more accurate than "CS Fundamentals".
// - SQL: Data/Backend roles. Query writing, optimization, schema design.
// - HR: Universal final round. Motivation, culture fit, expectations.
//
export const PROBLEM_CATEGORIES = [
  {
    id: "CODING",
    label: "Coding",
    icon: "💻",
    color: "text-brand-300",
    bg: "bg-brand-400/12 border-brand-400/25",
    desc: "Algorithms & data structures",
    sources: [
      "LEETCODE",
      "GFG",
      "CODECHEF",
      "INTERVIEWBIT",
      "HACKERRANK",
      "CODEFORCES",
      "OTHER",
    ],
  },
  {
    id: "SYSTEM_DESIGN",
    label: "System Design",
    icon: "🏗️",
    color: "text-info",
    bg: "bg-info/12 border-info/25",
    desc: "Distributed systems & architecture",
    sources: ["OTHER"],
  },
  {
    id: "LOW_LEVEL_DESIGN",
    label: "Low-Level Design",
    icon: "🔧",
    color: "text-purple-400",
    bg: "bg-purple-400/12 border-purple-400/25",
    desc: "OOP, design patterns, SOLID",
    sources: ["OTHER"],
  },
  {
    id: "BEHAVIORAL",
    label: "Behavioral",
    icon: "🗣️",
    color: "text-success",
    bg: "bg-success/12 border-success/25",
    desc: "STAR format competency questions",
    sources: ["OTHER"],
  },
  {
    id: "CS_FUNDAMENTALS",
    label: "Technical Knowledge",
    icon: "🧠",
    color: "text-warning",
    bg: "bg-warning/12 border-warning/25",
    desc: "OS, networking, DB internals",
    sources: ["OTHER"],
  },
  {
    id: "HR",
    label: "HR Round",
    icon: "🤝",
    color: "text-danger",
    bg: "bg-danger/12 border-danger/25",
    desc: "Motivation, culture fit, career narrative",
    sources: ["OTHER"],
  },
  {
    id: "SQL",
    label: "Databases",
    icon: "🗄️",
    color: "text-brand-300",
    bg: "bg-brand-400/12 border-brand-400/25",
    desc: "SQL queries, schema design, indexing, database internals",
    sources: ["LEETCODE", "GFG", "HACKERRANK", "OTHER"],
  },
];

export const PROBLEM_CATEGORY_LABELS = Object.fromEntries(
  PROBLEM_CATEGORIES.map((c) => [c.id, c.label]),
);

// ── HR Question Stakes ─────────────────────────────────
//
// HR questions do not have difficulty in the algorithmic sense.
// The relevant dimension is STAKES — how much damage a poor answer can do
// and how much preparation the question requires.
//
// Stored in the existing `difficulty` DB field for backward compatibility:
//   EASY   → Common   (standard questions every candidate gets)
//   MEDIUM → Tricky   (no obvious right answer, requires careful framing)
//   HARD   → Sensitive (difficult topics, high emotional/professional risk)
//
// Displayed with completely different labels, colors, and icons on HR views.
export const HR_STAKES = {
  EASY: {
    id: "EASY",
    label: "Common",
    icon: "🟢",
    color: "text-success",
    bg: "bg-success/10 border-success/25",
    desc: "Standard questions asked in almost every HR interview",
  },
  MEDIUM: {
    id: "MEDIUM",
    label: "Tricky",
    icon: "🟡",
    color: "text-warning",
    bg: "bg-warning/10 border-warning/25",
    desc: "No obvious right answer — requires careful framing and self-awareness",
  },
  HARD: {
    id: "HARD",
    label: "Sensitive",
    icon: "🔴",
    color: "text-danger",
    bg: "bg-danger/10 border-danger/25",
    desc: "Difficult topics — gaps, terminations, salary, failure — highest stakes",
  },
};

// ── HR Question Categories ─────────────────────────────
//
// Six categories covering every HR question type in SWE interviews.
// Research basis: HR questions map to six underlying interviewer concerns:
//   1. Career Narrative   → flight risk, self-direction, trajectory coherence
//   2. Motivation & Fit   → retention probability, research depth, culture alignment
//   3. Self-Assessment    → self-awareness, coachability, honest self-knowledge
//   4. Work Style         → team compatibility, communication, conflict response
//   5. Logistics          → compensation alignment, timeline, competing offers
//   6. Questions for Them → engagement level, research depth, critical thinking
//
export const HR_QUESTION_CATEGORIES = [
  {
    id: "CAREER_NARRATIVE",
    label: "Career Narrative",
    icon: "📖",
    color: "text-brand-300",
    bg: "bg-brand-400/10 border-brand-400/25",
    desc: "Tell your story — resume walkthrough, career changes, gaps, departures",
    realConcern: "Is this person's career trajectory coherent? Will they stay?",
    examples: [
      "Tell me about yourself",
      "Walk me through your resume",
      "Why did you change careers?",
      "Can you explain this employment gap?",
      "Why did you leave your last job?",
      "Why were you fired/laid off?",
    ],
  },
  {
    id: "MOTIVATION_AND_FIT",
    label: "Motivation & Company Fit",
    icon: "🎯",
    color: "text-info",
    bg: "bg-info/10 border-info/25",
    desc: "Why this company, why this role, what you know about them",
    realConcern:
      "Did they research us? Do they actually want THIS job or just any job?",
    examples: [
      "Why do you want to work here?",
      "Why this role specifically?",
      "What do you know about our company?",
      "Where do you see yourself in 5 years?",
      "What excites you about this opportunity?",
    ],
  },
  {
    id: "SELF_ASSESSMENT",
    label: "Self-Assessment",
    icon: "🪞",
    color: "text-warning",
    bg: "bg-warning/10 border-warning/25",
    desc: "Strengths, weaknesses, achievements, failures — honest self-knowledge",
    realConcern:
      "Are they self-aware? Can they take feedback? Are they honest under pressure?",
    examples: [
      "What are your greatest strengths?",
      "What is your biggest weakness?",
      "What is your greatest professional achievement?",
      "Tell me about a time you failed",
      "How would your colleagues describe you?",
      "What would your manager say you need to work on?",
    ],
  },
  {
    id: "WORK_STYLE",
    label: "Work Style & Culture",
    icon: "🤝",
    color: "text-success",
    bg: "bg-success/10 border-success/25",
    desc: "How you work, handle pressure, collaborate, and fit the team culture",
    realConcern:
      "Will they mesh with the team? How do they handle conflict and stress?",
    examples: [
      "How do you prefer to work — independently or collaboratively?",
      "How do you handle disagreement with your manager?",
      "Describe your ideal work environment",
      "How do you manage stress and pressure?",
      "Are you comfortable with remote/hybrid work?",
      "How do you prioritize when you have competing deadlines?",
    ],
  },
  {
    id: "LOGISTICS",
    label: "Logistics & Practical",
    icon: "📋",
    color: "text-purple-400",
    bg: "bg-purple-400/10 border-purple-400/25",
    desc: "Salary, notice period, start date, relocation, other offers",
    realConcern:
      "Can we close this candidate? Is there a practical blocker to making an offer?",
    examples: [
      "What are your salary expectations?",
      "What is your notice period?",
      "Are you open to relocation?",
      "Do you have other offers you're considering?",
      "When can you start?",
      "Are you comfortable with the travel requirements?",
    ],
  },
  {
    id: "QUESTIONS_FOR_THEM",
    label: "Questions for the Interviewer",
    icon: "💬",
    color: "text-danger",
    bg: "bg-danger/10 border-danger/25",
    desc: "The questions YOU ask at the end — interviewers actively evaluate these",
    realConcern:
      "Is this person genuinely engaged? Did they research us? Do they think critically?",
    examples: [
      "What does success look like in the first 90 days?",
      "What is the biggest challenge the team is facing right now?",
      "How does the team handle performance feedback?",
      "What does the engineering culture value most?",
      "How has this role evolved over the past year?",
      "What do you enjoy most about working here?",
    ],
  },
];

export const HR_QUESTION_CATEGORY_MAP = Object.fromEntries(
  HR_QUESTION_CATEGORIES.map((c) => [c.id, c]),
);
// ── Category visibility config for AI generation UI ───
//
// Research basis:
// TARGET COMPANY STYLE:
//   Relevant when company culture genuinely changes what "correct" looks like.
//   CODING: Google values elegant O(n) over brute-force. Amazon values speed.
//   SYSTEM_DESIGN: Scale requirements differ fundamentally by company type.
//   LOW_LEVEL_DESIGN: Amazon demands strict SOLID. Startups want working code.
//   BEHAVIORAL: Amazon LP framing vs Google Googleyness vs Meta — completely different.
//   Not relevant for SQL (SQL is SQL), CS_FUNDAMENTALS (topics are universal), HR (personal).
//
// FOCUS AREAS:
//   Relevant when sub-topic selection meaningfully changes preparation strategy.
//   CODING: "DP problems" vs "Graph problems" = completely different prep.
//   SYSTEM_DESIGN: "Messaging systems" vs "Storage systems" = different knowledge domains.
//   LOW_LEVEL_DESIGN: "Design patterns" vs "Concurrency" vs "Domain systems" = distinct.
//   CS_FUNDAMENTALS: "OS" vs "Networking" vs "DB internals" = separate study areas.
//   Not relevant for BEHAVIORAL (prepare all competencies), HR (personal), SQL (cover all).
//
export const CATEGORY_GENERATION_CONFIG = {
  CODING: {
    showTargetCompanyStyle: true,
    showFocusAreas: true,
    focusAreaPlaceholder:
      "e.g. Dynamic Programming, Graph algorithms, Sliding Window...",
    companyStylePlaceholder: "e.g. Google, Amazon, Stripe...",
  },
  SYSTEM_DESIGN: {
    showTargetCompanyStyle: true,
    showFocusAreas: true,
    focusAreaPlaceholder:
      "e.g. Messaging systems, Storage systems, Real-time feeds...",
    companyStylePlaceholder: "e.g. Google, Uber, Cloudflare...",
  },
  LOW_LEVEL_DESIGN: {
    showTargetCompanyStyle: true,
    showFocusAreas: true,
    focusAreaPlaceholder:
      "e.g. Design patterns, Parking systems, Notification service...",
    companyStylePlaceholder: "e.g. Amazon, Atlassian, Adobe...",
  },
  BEHAVIORAL: {
    showTargetCompanyStyle: true,
    showFocusAreas: false,
    companyStylePlaceholder: "e.g. Amazon, Google, Meta...",
  },
  CS_FUNDAMENTALS: {
    showTargetCompanyStyle: false,
    showFocusAreas: true,
    focusAreaPlaceholder:
      "e.g. Operating Systems, Networking, Database internals...",
  },
  HR: {
    showTargetCompanyStyle: false,
    showFocusAreas: false,
  },
  SQL: {
    showTargetCompanyStyle: false,
    showFocusAreas: false,
  },
};
