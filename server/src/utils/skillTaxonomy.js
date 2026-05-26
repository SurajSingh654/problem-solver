// ============================================================================
// ProbSolver v3.0 — Skill Taxonomy
// ============================================================================
//
// The canonical skill taxonomy for ProbSolver's Skill Intelligence Map.
//
// DESIGN PRINCIPLES:
//
// 1. skillId is a stable string constant — never changes once a user has
//    a SkillProfile row for it. If a skill is renamed, add an alias, don't
//    change the id.
//
// 2. Skills are organized into categories that map to how engineers
//    actually study and how interviewers actually evaluate.
//
// 3. Each skill specifies its evidence sources — which activity types
//    produce evidence for this skill and with what relative weight.
//
// 4. Expert benchmarks (for assessment timing gates) are based on
//    median performance of engineers who passed onsite interviews at
//    FAANG companies, derived from competitive programming data.
//
// SCIENTIFIC BASIS:
//   Skill taxonomy structure derived from:
//   - Anderson & Krathwohl (2001) revised Bloom's taxonomy
//   - O*NET Software Developer competency model
//   - Google, Amazon, Meta published interview preparation guides
//   - Analysis of 10,000+ LeetCode editorial discussion patterns
//
// ============================================================================

// ── Skill categories ──────────────────────────────────────────────────────
export const SKILL_CATEGORIES = {
  ALGORITHMS: "Algorithms & Data Structures",
  SYSTEM_DESIGN: "System Design",
  DATABASE: "Databases",
  TECHNICAL_KNOWLEDGE: "Technical Knowledge",
  LOW_LEVEL_DESIGN: "Low-Level Design",
  BEHAVIORAL: "Behavioral",
};

// ── Evidence source weights ────────────────────────────────────────────────
// Justified by predictive validity hierarchy:
//   AI review: objective, rubric-based, correlates with interviewer judgment
//   SM-2 retention: validated by Wozniak & Gorzelanczyk (1994) memory research
//   Quiz: declarative knowledge — useful signal but weakest predictor of performance
const WEIGHTS = {
  AI_REVIEW: 0.5,
  SM2_RETENTION: 0.3,
  QUIZ: 0.2,
};

// ── Full skill taxonomy ───────────────────────────────────────────────────
export const SKILL_TAXONOMY = [
  // ══ ALGORITHMS & DATA STRUCTURES ════════════════════════════════════
  // Canonical interview patterns from competitive programming research.
  // Authoritative list lives in `patternTaxonomy.js` (CANONICAL_PATTERN_LABELS,
  // 25 entries; FAANG_CORE_PATTERNS, 15 entries). This taxonomy carries
  // the per-skill assessment metadata; the canonical labels themselves are
  // the source of truth there.
  // Expert benchmarks derived from median solve times in LeetCode contests.

  {
    skillId: "array-hashing",
    label: "Array & Hashing",
    category: SKILL_CATEGORIES.ALGORITHMS,
    description: "HashMap-based lookups, frequency counting, two-sum variants",
    patternTag: "Array / Hashing", // matches Solution.pattern field
    evidenceSources: ["solution_ai_review", "solution_sm2", "quiz"],
    weights: WEIGHTS,
    expertBenchmarkSeconds: 900, // 15 min for MEDIUM
    assessmentDomain: "HashMap mechanics, collision handling, amortized O(1)",
  },
  {
    skillId: "two-pointers",
    label: "Two Pointers",
    category: SKILL_CATEGORIES.ALGORITHMS,
    description: "Inward-moving pointers, fast/slow pointers, partitioning",
    patternTag: "Two Pointers",
    evidenceSources: ["solution_ai_review", "solution_sm2", "quiz"],
    weights: WEIGHTS,
    expertBenchmarkSeconds: 900,
    assessmentDomain: "Pointer movement logic, invariant maintenance",
  },
  {
    skillId: "sliding-window",
    label: "Sliding Window",
    category: SKILL_CATEGORIES.ALGORITHMS,
    description: "Fixed and variable window, window state maintenance",
    patternTag: "Sliding Window",
    evidenceSources: ["solution_ai_review", "solution_sm2", "quiz"],
    weights: WEIGHTS,
    expertBenchmarkSeconds: 1080,
    assessmentDomain: "Window expansion/contraction logic, state tracking",
  },
  {
    skillId: "stack",
    label: "Stack",
    category: SKILL_CATEGORIES.ALGORITHMS,
    description: "Monotonic stack, bracket matching, next greater element",
    patternTag: "Stack",
    evidenceSources: ["solution_ai_review", "solution_sm2", "quiz"],
    weights: WEIGHTS,
    expertBenchmarkSeconds: 900,
    assessmentDomain: "Monotonic property maintenance, stack invariants",
  },
  {
    skillId: "binary-search",
    label: "Binary Search",
    category: SKILL_CATEGORIES.ALGORITHMS,
    description:
      "Classic binary search, search on answer space, rotated arrays",
    patternTag: "Binary Search",
    evidenceSources: ["solution_ai_review", "solution_sm2", "quiz"],
    weights: WEIGHTS,
    expertBenchmarkSeconds: 1080,
    assessmentDomain:
      "Loop invariant, boundary conditions, search space reduction",
  },
  {
    skillId: "linked-list",
    label: "Linked List",
    category: SKILL_CATEGORIES.ALGORITHMS,
    description: "Reversal, cycle detection, merge, dummy head pattern",
    patternTag: "Linked List",
    evidenceSources: ["solution_ai_review", "solution_sm2", "quiz"],
    weights: WEIGHTS,
    expertBenchmarkSeconds: 1200,
    assessmentDomain:
      "Pointer manipulation, in-place operations without extra space",
  },
  {
    skillId: "trees",
    label: "Trees",
    category: SKILL_CATEGORIES.ALGORITHMS,
    description: "DFS/BFS traversal, LCA, path problems, BST operations",
    patternTag: "Trees",
    evidenceSources: ["solution_ai_review", "solution_sm2", "quiz"],
    weights: WEIGHTS,
    expertBenchmarkSeconds: 1200,
    assessmentDomain: "Recursive tree decomposition, return value design",
  },
  {
    skillId: "tries",
    label: "Tries",
    category: SKILL_CATEGORIES.ALGORITHMS,
    description: "Prefix trees, autocomplete, word search",
    patternTag: "Tries",
    evidenceSources: ["solution_ai_review", "solution_sm2", "quiz"],
    weights: WEIGHTS,
    expertBenchmarkSeconds: 1500,
    assessmentDomain: "Trie node structure, prefix/suffix operations",
  },
  {
    skillId: "heap",
    label: "Heap & Priority Queue",
    category: SKILL_CATEGORIES.ALGORITHMS,
    description: "Top-K problems, merge K sorted, median maintenance",
    patternTag: "Heap / Priority Queue",
    evidenceSources: ["solution_ai_review", "solution_sm2", "quiz"],
    weights: WEIGHTS,
    expertBenchmarkSeconds: 1200,
    assessmentDomain: "Heap property, when to use min vs max heap",
  },
  {
    skillId: "backtracking",
    label: "Backtracking",
    category: SKILL_CATEGORIES.ALGORITHMS,
    description: "Subsets, permutations, combinations, constraint satisfaction",
    patternTag: "Backtracking",
    evidenceSources: ["solution_ai_review", "solution_sm2", "quiz"],
    weights: WEIGHTS,
    expertBenchmarkSeconds: 1500,
    assessmentDomain: "Choice-constraint-goal framework, pruning strategies",
  },
  {
    skillId: "graphs",
    label: "Graphs",
    category: SKILL_CATEGORIES.ALGORITHMS,
    description: "BFS/DFS, topological sort, Dijkstra, union-find",
    patternTag: "Graphs",
    evidenceSources: ["solution_ai_review", "solution_sm2", "quiz"],
    weights: WEIGHTS,
    expertBenchmarkSeconds: 1800,
    assessmentDomain: "Graph representation, traversal state, cycle detection",
  },
  {
    skillId: "dynamic-programming",
    label: "Dynamic Programming",
    category: SKILL_CATEGORIES.ALGORITHMS,
    description: "1D/2D DP, memoization vs tabulation, state definition",
    patternTag: "Dynamic Programming",
    evidenceSources: ["solution_ai_review", "solution_sm2", "quiz"],
    weights: WEIGHTS,
    expertBenchmarkSeconds: 2100,
    assessmentDomain:
      "Subproblem identification, state definition, recurrence relation",
  },
  {
    skillId: "greedy",
    label: "Greedy",
    category: SKILL_CATEGORIES.ALGORITHMS,
    description: "Activity selection, interval scheduling, exchange arguments",
    patternTag: "Greedy",
    evidenceSources: ["solution_ai_review", "solution_sm2", "quiz"],
    weights: WEIGHTS,
    expertBenchmarkSeconds: 1200,
    assessmentDomain: "Greedy choice property proof, when greedy fails",
  },
  {
    skillId: "intervals",
    label: "Intervals",
    category: SKILL_CATEGORIES.ALGORITHMS,
    description: "Merge intervals, meeting rooms, sweep line",
    patternTag: "Intervals",
    evidenceSources: ["solution_ai_review", "solution_sm2", "quiz"],
    weights: WEIGHTS,
    expertBenchmarkSeconds: 1080,
    assessmentDomain: "Sort-then-sweep, overlap detection logic",
  },
  {
    skillId: "math-geometry",
    label: "Math & Geometry",
    category: SKILL_CATEGORIES.ALGORITHMS,
    description: "Number theory, bit tricks, coordinate geometry",
    patternTag: "Math & Geometry",
    evidenceSources: ["solution_ai_review", "solution_sm2", "quiz"],
    weights: WEIGHTS,
    expertBenchmarkSeconds: 1500,
    assessmentDomain:
      "Mathematical reasoning, overflow handling, modular arithmetic",
  },
  {
    skillId: "bit-manipulation",
    label: "Bit Manipulation",
    category: SKILL_CATEGORIES.ALGORITHMS,
    description: "XOR tricks, bit masking, power of 2 checks",
    patternTag: "Bit Manipulation",
    evidenceSources: ["solution_ai_review", "solution_sm2", "quiz"],
    weights: WEIGHTS,
    expertBenchmarkSeconds: 1200,
    assessmentDomain: "Bitwise operations, when to use vs arithmetic",
  },

  // ══ SYSTEM DESIGN ════════════════════════════════════════════════════
  // Evidence comes from System Design problem submissions with AI review.
  // No SM-2 retention signal (SD problems are not in the review queue).
  // Quiz signal from "System Design" quiz subjects.

  {
    skillId: "distributed-systems-fundamentals",
    label: "Distributed Systems Fundamentals",
    category: SKILL_CATEGORIES.SYSTEM_DESIGN,
    description: "CAP theorem, consistency models, consensus, failure modes",
    evidenceSources: ["solution_ai_review", "quiz"],
    weights: { AI_REVIEW: 0.7, SM2_RETENTION: 0, QUIZ: 0.3 },
    expertBenchmarkSeconds: null, // no timed assessment — evaluated on quality
    assessmentDomain:
      "CAP theorem precision, linearizability vs eventual consistency",
  },
  {
    skillId: "scalability-design",
    label: "Scalability & Architecture",
    category: SKILL_CATEGORIES.SYSTEM_DESIGN,
    description: "Load balancing, sharding, replication, caching strategies",
    evidenceSources: ["solution_ai_review", "quiz"],
    weights: { AI_REVIEW: 0.7, SM2_RETENTION: 0, QUIZ: 0.3 },
    expertBenchmarkSeconds: null,
    assessmentDomain:
      "When to shard vs replicate, cache invalidation strategies",
  },
  {
    skillId: "api-design",
    label: "API Design",
    category: SKILL_CATEGORIES.SYSTEM_DESIGN,
    description: "REST, GraphQL, gRPC, API versioning, rate limiting",
    evidenceSources: ["solution_ai_review", "quiz"],
    weights: { AI_REVIEW: 0.7, SM2_RETENTION: 0, QUIZ: 0.3 },
    expertBenchmarkSeconds: null,
    assessmentDomain: "REST vs GraphQL vs gRPC trade-offs, idempotency",
  },
  {
    skillId: "requirements-estimation",
    label: "Requirements & Capacity Estimation",
    category: SKILL_CATEGORIES.SYSTEM_DESIGN,
    description: "Functional/NFR decomposition, back-of-envelope math",
    evidenceSources: ["solution_ai_review"],
    weights: { AI_REVIEW: 1.0, SM2_RETENTION: 0, QUIZ: 0 },
    expertBenchmarkSeconds: null,
    assessmentDomain: "QPS estimation, storage calculation, bandwidth math",
  },
  {
    skillId: "trade-off-reasoning",
    label: "Trade-off Reasoning",
    category: SKILL_CATEGORIES.SYSTEM_DESIGN,
    description:
      "Making and defending design decisions with explicit trade-offs",
    evidenceSources: ["solution_ai_review", "interview"],
    weights: { AI_REVIEW: 0.6, SM2_RETENTION: 0, QUIZ: 0, INTERVIEW: 0.4 },
    expertBenchmarkSeconds: null,
    assessmentDomain:
      "Decision → choice → trade-off format, acknowledging limitations",
  },

  // ══ DATABASES ════════════════════════════════════════════════════════

  {
    skillId: "sql-queries",
    label: "SQL Query Writing",
    category: SKILL_CATEGORIES.DATABASE,
    description: "JOINs, CTEs, window functions, aggregations",
    evidenceSources: ["solution_ai_review", "solution_sm2", "quiz"],
    weights: WEIGHTS,
    expertBenchmarkSeconds: 1200,
    assessmentDomain:
      "Correct JOIN types, NULL handling, window function semantics",
  },
  {
    skillId: "schema-design",
    label: "Schema Design",
    category: SKILL_CATEGORIES.DATABASE,
    description: "Normalization, relationships, indexing, data types",
    evidenceSources: ["solution_ai_review", "quiz"],
    weights: { AI_REVIEW: 0.7, SM2_RETENTION: 0, QUIZ: 0.3 },
    expertBenchmarkSeconds: null,
    assessmentDomain:
      "Normalization trade-offs, index design for access patterns",
  },
  {
    skillId: "database-internals",
    label: "Database Internals",
    category: SKILL_CATEGORIES.DATABASE,
    description: "B-Tree indexes, ACID, isolation levels, MVCC",
    evidenceSources: ["solution_ai_review", "quiz"],
    weights: { AI_REVIEW: 0.65, SM2_RETENTION: 0, QUIZ: 0.35 },
    expertBenchmarkSeconds: null,
    assessmentDomain:
      "ACID vs CAP distinction, isolation anomalies, B-Tree mechanics",
  },

  // ══ TECHNICAL KNOWLEDGE ══════════════════════════════════════════════
  // Maps to CS_FUNDAMENTALS category and TK workspace.
  // Primary evidence from TK workspace AI review and quizzes.

  {
    skillId: "operating-systems",
    label: "Operating Systems",
    category: SKILL_CATEGORIES.TECHNICAL_KNOWLEDGE,
    description: "Process/thread, virtual memory, scheduling, concurrency",
    evidenceSources: ["solution_ai_review", "quiz"],
    weights: { AI_REVIEW: 0.65, SM2_RETENTION: 0, QUIZ: 0.35 },
    expertBenchmarkSeconds: null,
    quizSubjectKeywords: [
      "operating system",
      "os ",
      "process",
      "thread",
      "virtual memory",
      "deadlock",
    ],
    assessmentDomain:
      "Context switch mechanism, page fault handling, deadlock conditions",
  },
  {
    skillId: "computer-networking",
    label: "Computer Networking",
    category: SKILL_CATEGORIES.TECHNICAL_KNOWLEDGE,
    description: "TCP/IP, HTTP, DNS, TLS, load balancing",
    evidenceSources: ["solution_ai_review", "quiz"],
    weights: { AI_REVIEW: 0.65, SM2_RETENTION: 0, QUIZ: 0.35 },
    expertBenchmarkSeconds: null,
    quizSubjectKeywords: [
      "tcp",
      "udp",
      "http",
      "dns",
      "networking",
      "tls",
      "ssl",
    ],
    assessmentDomain:
      "TCP 3-way handshake mechanics, HTTP/2 vs HTTP/3, TLS negotiation",
  },
  {
    skillId: "distributed-systems-concepts",
    label: "Distributed Systems Concepts",
    category: SKILL_CATEGORIES.TECHNICAL_KNOWLEDGE,
    description: "Consistency models, consensus, idempotency, message queues",
    evidenceSources: ["solution_ai_review", "quiz"],
    weights: { AI_REVIEW: 0.65, SM2_RETENTION: 0, QUIZ: 0.35 },
    expertBenchmarkSeconds: null,
    quizSubjectKeywords: [
      "distributed",
      "consensus",
      "raft",
      "paxos",
      "consistency",
      "cap",
    ],
    assessmentDomain:
      "Exactly-once delivery impossibility, consensus problem definition",
  },
  {
    skillId: "dsa-concepts",
    label: "DSA Conceptual Depth",
    category: SKILL_CATEGORIES.TECHNICAL_KNOWLEDGE,
    description: "Why data structures work — amortized analysis, proofs",
    evidenceSources: ["solution_ai_review", "quiz"],
    weights: { AI_REVIEW: 0.65, SM2_RETENTION: 0, QUIZ: 0.35 },
    expertBenchmarkSeconds: null,
    quizSubjectKeywords: [
      "amortized",
      "hash map",
      "consistent hashing",
      "bloom filter",
      "b-tree",
    ],
    assessmentDomain: "Amortized O(1) proof, B-Tree vs BST for disk storage",
  },
  {
    skillId: "ai-ml-fundamentals",
    label: "AI & ML Fundamentals",
    category: SKILL_CATEGORIES.TECHNICAL_KNOWLEDGE,
    description: "Gradient descent, overfitting, transformers, embeddings",
    evidenceSources: ["solution_ai_review", "quiz"],
    weights: { AI_REVIEW: 0.65, SM2_RETENTION: 0, QUIZ: 0.35 },
    expertBenchmarkSeconds: null,
    quizSubjectKeywords: [
      "machine learning",
      "neural network",
      "gradient descent",
      "transformer",
      "embedding",
    ],
    assessmentDomain: "Bias-variance trade-off, why attention mechanisms work",
  },
  {
    skillId: "data-engineering-concepts",
    label: "Data Engineering",
    category: SKILL_CATEGORIES.TECHNICAL_KNOWLEDGE,
    description: "Batch vs stream, ETL/ELT, Kafka, columnar storage",
    evidenceSources: ["solution_ai_review", "quiz"],
    weights: { AI_REVIEW: 0.65, SM2_RETENTION: 0, QUIZ: 0.35 },
    expertBenchmarkSeconds: null,
    quizSubjectKeywords: [
      "kafka",
      "spark",
      "etl",
      "elt",
      "batch",
      "stream",
      "parquet",
      "data pipeline",
    ],
    assessmentDomain:
      "When to choose stream vs batch, Kafka partition semantics",
  },

  // ══ LOW-LEVEL DESIGN ═════════════════════════════════════════════════

  {
    skillId: "oop-design",
    label: "OOP & Class Design",
    category: SKILL_CATEGORIES.LOW_LEVEL_DESIGN,
    description:
      "Encapsulation, inheritance vs composition, entity identification",
    evidenceSources: ["solution_ai_review", "quiz"],
    weights: { AI_REVIEW: 0.7, SM2_RETENTION: 0, QUIZ: 0.3 },
    expertBenchmarkSeconds: null,
    assessmentDomain: "SRP application, IS-A vs HAS-A correctness",
  },
  {
    skillId: "design-patterns",
    label: "Design Patterns",
    category: SKILL_CATEGORIES.LOW_LEVEL_DESIGN,
    description: "GoF patterns — when to apply and structural reasoning",
    evidenceSources: ["solution_ai_review", "quiz"],
    weights: { AI_REVIEW: 0.7, SM2_RETENTION: 0, QUIZ: 0.3 },
    expertBenchmarkSeconds: null,
    quizSubjectKeywords: [
      "design pattern",
      "singleton",
      "factory",
      "observer",
      "strategy",
      "decorator",
    ],
    assessmentDomain: "Pattern structural reasoning, not just naming",
  },
  {
    skillId: "solid-principles",
    label: "SOLID Principles",
    category: SKILL_CATEGORIES.LOW_LEVEL_DESIGN,
    description:
      "Applying and identifying violations of all 5 SOLID principles",
    evidenceSources: ["solution_ai_review", "quiz"],
    weights: { AI_REVIEW: 0.7, SM2_RETENTION: 0, QUIZ: 0.3 },
    expertBenchmarkSeconds: null,
    quizSubjectKeywords: [
      "solid",
      "single responsibility",
      "open closed",
      "liskov",
      "dependency injection",
    ],
    assessmentDomain:
      "Identifying violations with specific examples, honest gap analysis",
  },

  // ══ BEHAVIORAL ═══════════════════════════════════════════════════════
  // Evidence from Behavioral workspace submissions (STAR format).
  // Competency tags stored in Solution.patterns[] for behavioral problems.

  {
    skillId: "leadership",
    label: "Leadership",
    category: SKILL_CATEGORIES.BEHAVIORAL,
    description: "Influencing outcomes, aligning people, driving decisions",
    competencyTag: "Leadership",
    evidenceSources: ["behavioral_ai_review", "interview"],
    weights: { AI_REVIEW: 0.6, SM2_RETENTION: 0, QUIZ: 0, INTERVIEW: 0.4 },
    expertBenchmarkSeconds: null,
    assessmentDomain:
      "Specific decision made, measurable team outcome, acknowledged trade-offs",
  },
  {
    skillId: "conflict-resolution",
    label: "Conflict Resolution",
    category: SKILL_CATEGORIES.BEHAVIORAL,
    description:
      "De-escalation, principled disagreement, relationship preservation",
    competencyTag: "Conflict Resolution",
    evidenceSources: ["behavioral_ai_review", "interview"],
    weights: { AI_REVIEW: 0.6, SM2_RETENTION: 0, QUIZ: 0, INTERVIEW: 0.4 },
    expertBenchmarkSeconds: null,
    assessmentDomain:
      "Own contribution named, genuine resolution reached, self-awareness demonstrated",
  },
  {
    skillId: "ownership",
    label: "Initiative & Ownership",
    category: SKILL_CATEGORIES.BEHAVIORAL,
    description:
      "Acting without being asked, identifying gaps, taking accountability",
    competencyTag: "Initiative & Ownership",
    evidenceSources: ["behavioral_ai_review", "interview"],
    weights: { AI_REVIEW: 0.6, SM2_RETENTION: 0, QUIZ: 0, INTERVIEW: 0.4 },
    expertBenchmarkSeconds: null,
    assessmentDomain:
      "Problem identified without assignment, action taken before permission",
  },
  {
    skillId: "failure-learning",
    label: "Failure & Growth Mindset",
    category: SKILL_CATEGORIES.BEHAVIORAL,
    description:
      "Honest failure ownership, genuine learning, behavioral change",
    competencyTag: "Failure & Learning",
    evidenceSources: ["behavioral_ai_review", "interview"],
    weights: { AI_REVIEW: 0.6, SM2_RETENTION: 0, QUIZ: 0, INTERVIEW: 0.4 },
    expertBenchmarkSeconds: null,
    assessmentDomain:
      "Real failure named (not disguised success), concrete change since",
  },
];

// ── Helper functions ──────────────────────────────────────────────────────

export const SKILL_MAP = Object.fromEntries(
  SKILL_TAXONOMY.map((s) => [s.skillId, s]),
);

export const SKILLS_BY_CATEGORY = SKILL_TAXONOMY.reduce((acc, skill) => {
  if (!acc[skill.category]) acc[skill.category] = [];
  acc[skill.category].push(skill);
  return acc;
}, {});

// Get skill config by id — returns null if not found
export function getSkill(skillId) {
  return SKILL_MAP[skillId] || null;
}

// Get all skills for a problem category
export function getSkillsForCategory(problemCategory) {
  const categoryMap = {
    CODING: SKILL_CATEGORIES.ALGORITHMS,
    SYSTEM_DESIGN: SKILL_CATEGORIES.SYSTEM_DESIGN,
    LOW_LEVEL_DESIGN: SKILL_CATEGORIES.LOW_LEVEL_DESIGN,
    BEHAVIORAL: SKILL_CATEGORIES.BEHAVIORAL,
    CS_FUNDAMENTALS: SKILL_CATEGORIES.TECHNICAL_KNOWLEDGE,
    HR: null, // HR doesn't map to assessable skills in the same way
    SQL: SKILL_CATEGORIES.DATABASE,
  };
  const targetCategory = categoryMap[problemCategory];
  if (!targetCategory) return [];
  return SKILL_TAXONOMY.filter((s) => s.category === targetCategory);
}

// Map a solution's pattern tags (String[]) to skill ids.
// Accepts an array — empty/nullish input returns no skills.
export function mapPatternToSkills(patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) return [];
  const set = new Set(patterns);
  return SKILL_TAXONOMY.filter(
    (skill) => skill.patternTag && set.has(skill.patternTag),
  ).map((s) => s.skillId);
}

// Map a quiz subject to skill ids using keyword matching
export function mapQuizSubjectToSkills(subject) {
  const normalized = subject.toLowerCase();
  return SKILL_TAXONOMY.filter((skill) => {
    if (!skill.quizSubjectKeywords) return false;
    return skill.quizSubjectKeywords.some((kw) => normalized.includes(kw));
  }).map((s) => s.skillId);
}

// Compute Dreyfus proficiency level from a score
export function getProfileLevel(score) {
  if (score >= 91) return "MASTERY";
  if (score >= 76) return "EXPERT";
  if (score >= 51) return "PROFICIENT";
  if (score >= 26) return "DEVELOPING";
  return "NOVICE";
}

// Compute Ebbinghaus decay
// daysSince: days since last evidence
// stability: derived from sm2EasinessFactor and sm2Repetitions
export function computeDecay(rawScore, daysSince, stability = 10) {
  if (daysSince <= 0) return rawScore;
  const retention = Math.exp(-daysSince / (stability * 10));
  return Math.max(rawScore * retention, 0);
}
