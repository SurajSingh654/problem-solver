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
