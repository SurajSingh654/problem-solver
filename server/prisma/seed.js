/**
 * SEED — Populates the database with initial data for development.
 * Run with: npm run db:seed (from server/)
 *
 * Creates:
 * - 1 Admin user
 * - 3 Member users
 * - 5 Sample problems with full content
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // ── Clear existing data ──────────────────────────
  await prisma.clarityRating.deleteMany()
  await prisma.simSession.deleteMany()
  await prisma.solution.deleteMany()
  await prisma.followUpQuestion.deleteMany()
  await prisma.problem.deleteMany()
  await prisma.user.deleteMany()

  console.log('✓ Cleared existing data')

  // ── Create Admin ─────────────────────────────────
  const adminHash = await bcrypt.hash('admin123', 12)
  const admin = await prisma.user.create({
    data: {
      username:    'admin',
      email:       'admin@probsolver.dev',
      passwordHash: adminHash,
      role:         'ADMIN',
      avatarColor:  '#7c6ff7',
      currentLevel: 'ADVANCED',
      targetCompanies: JSON.stringify(['Google', 'Meta']),
      targetRole:   'Staff Engineer',
    },
  })

  // ── Create Member users ───────────────────────────
  const memberData = [
    {
      username: 'alex',
      email: 'alex@example.com',
      avatarColor: '#22c55e',
      currentLevel: 'INTERMEDIATE',
      targetCompanies: JSON.stringify(['Google', 'Meta', 'Amazon']),
      targetRole: 'SDE-2',
      streak: 7,
      longestStreak: 14,
    },
    {
      username: 'sarah',
      email: 'sarah@example.com',
      avatarColor: '#3b82f6',
      currentLevel: 'INTERMEDIATE',
      targetCompanies: JSON.stringify(['Microsoft', 'Amazon']),
      targetRole: 'SDE-2',
      streak: 3,
      longestStreak: 21,
    },
    {
      username: 'mike',
      email: 'mike@example.com',
      avatarColor: '#ef4444',
      currentLevel: 'BEGINNER',
      targetCompanies: JSON.stringify(['Amazon']),
      targetRole: 'SDE-1',
      streak: 1,
      longestStreak: 5,
    },
  ]

  const memberHash = await bcrypt.hash('member123', 12)
  const members = []

  for (const data of memberData) {
    const member = await prisma.user.create({
      data: { ...data, passwordHash: memberHash, role: 'MEMBER' },
    })
    members.push(member)
  }

  console.log('✓ Created', members.length, 'members')

  // ── Create Problems ───────────────────────────────
  const problems = []

  // Problem 1 — Two Sum
  const p1 = await prisma.problem.create({
    data: {
      title:      'Two Sum',
      source:     'LEETCODE',
      sourceUrl:  'https://leetcode.com/problems/two-sum/',
      difficulty: 'EASY',
      tags:       JSON.stringify(['Array / Hashing', 'Array']),
      companyTags:JSON.stringify(['Google', 'Amazon', 'Meta', 'Microsoft']),
      isPinned:   true,
      addedById:  admin.id,

      realWorldContext: 'This exact pattern — storing seen values in a hash map while scanning once — is how banks detect duplicate transactions in real time. As transactions stream in, the system checks a hash map of recent transaction IDs to flag duplicates in O(1) without scanning history.',

      useCases: JSON.stringify([
        'Fraud detection: find duplicate transaction IDs in real-time payment streams',
        'DNS resolution: hash domain names to IP addresses for O(1) lookup',
        'Compiler symbol tables: variable names hashed to memory locations',
        'Database indexing: hash indexes for constant-time row lookups',
        'Caching (Redis): fundamentally a distributed hash map',
      ]),

      adminNotes: 'Focus on the core insight: trading O(n) space for O(n) time. The brute force O(n²) nested loop solution is obvious — the interesting question is WHY the hash map solution works and WHEN this trade-off makes sense in production.',

      followUps: {
        create: [
          { question: 'What if the array is sorted? Can we do better than O(n) space?', difficulty: 'EASY', hint: 'Two pointers on a sorted array', order: 1 },
          { question: 'What if there could be multiple valid pairs?', difficulty: 'EASY', hint: 'Store all matches, not just the first', order: 2 },
          { question: 'What if the input is a stream (you cannot store all elements)?', difficulty: 'HARD', hint: 'Consider sliding window + bounded hash map', order: 3 },
        ],
      },
    },
  })
  problems.push(p1)

  // Problem 2 — Best Time to Buy and Sell Stock
  const p2 = await prisma.problem.create({
    data: {
      title:      'Best Time to Buy and Sell Stock',
      source:     'LEETCODE',
      sourceUrl:  'https://leetcode.com/problems/best-time-to-buy-and-sell-stock/',
      difficulty: 'EASY',
      tags:       JSON.stringify(['Sliding Window', 'Array']),
      companyTags:JSON.stringify(['Amazon', 'Google', 'Goldman Sachs', 'Bloomberg']),
      addedById:  admin.id,

      realWorldContext: 'This sliding window pattern is how financial analytics platforms compute rolling maximum profit windows across historical price data. Bloomberg terminals use this exact approach on streaming tick data to identify optimal entry/exit points.',

      useCases: JSON.stringify([
        'Trading algorithms: optimal buy/sell window identification',
        'Financial analytics: rolling max/min across time series',
        'Sensor monitoring: detect peak-to-trough anomalies',
        'A/B testing: find the highest performing window in time-series metrics',
      ]),

      adminNotes: 'Classic sliding window with two variables (min price seen, max profit). The key insight is that you never need to look backwards once you track the running minimum.',

      followUps: {
        create: [
          { question: 'What if you could make at most 2 transactions?', difficulty: 'HARD', hint: 'State machine DP or two-pass', order: 1 },
          { question: 'What if there is a cooldown period of 1 day after selling?', difficulty: 'MEDIUM', hint: 'State machine with 3 states', order: 2 },
        ],
      },
    },
  })
  problems.push(p2)

  // Problem 3 — Valid Parentheses
  const p3 = await prisma.problem.create({
    data: {
      title:      'Valid Parentheses',
      source:     'LEETCODE',
      sourceUrl:  'https://leetcode.com/problems/valid-parentheses/',
      difficulty: 'EASY',
      tags:       JSON.stringify(['Stack']),
      companyTags:JSON.stringify(['Google', 'Meta', 'Amazon', 'Microsoft']),
      addedById:  admin.id,

      realWorldContext: 'Every compiler and IDE uses this exact stack approach to validate nested syntax — balanced braces in code, HTML tag matching in browsers, JSON/XML parsing, expression evaluation in calculators.',

      useCases: JSON.stringify([
        'Compilers: validate syntactic structure of source code',
        'IDEs: real-time bracket matching and highlighting',
        'HTML/XML parsers: validate nested tag structure',
        'Math expression evaluators: validate balanced operations',
        'JSON/YAML validators: structural validation before parsing',
      ]),

      adminNotes: 'The stack pattern here is textbook. Push on open, pop and compare on close. The interesting discussion is about edge cases: empty stack when you try to pop, leftover items at the end.',

      followUps: {
        create: [
          { question: 'What if the string also contained numbers and operators like "({2+3})"?', difficulty: 'MEDIUM', hint: 'Stack-based expression evaluator', order: 1 },
          { question: 'Generate all valid combinations of n pairs of parentheses', difficulty: 'MEDIUM', hint: 'Backtracking', order: 2 },
        ],
      },
    },
  })
  problems.push(p3)

  // Problem 4 — Binary Search
  const p4 = await prisma.problem.create({
    data: {
      title:      'Binary Search',
      source:     'LEETCODE',
      sourceUrl:  'https://leetcode.com/problems/binary-search/',
      difficulty: 'EASY',
      tags:       JSON.stringify(['Binary Search']),
      companyTags:JSON.stringify(['Google', 'Amazon', 'Facebook']),
      addedById:  admin.id,

      realWorldContext: 'Binary search is not just a CS exercise — it is one of the most deployed algorithms in production systems. Git bisect uses it to find bug-introducing commits in O(log n) steps. Every database B-Tree index uses it. Every DNS prefix lookup uses it.',

      useCases: JSON.stringify([
        'Git bisect: find bug-introducing commit in O(log n) steps',
        'Database B-Tree indexes: O(log n) row lookup',
        'Package version resolution: find compatible version in sorted range',
        'IP routing: longest prefix match in sorted routing table',
        'Search engines: binary search over sorted index blocks',
      ]),

      adminNotes: 'Emphasize the left + (right - left) / 2 formula to prevent integer overflow. Also emphasize: binary search is not just for arrays — "binary search on the answer" (search on the answer space) is a powerful technique for optimization problems.',

      followUps: {
        create: [
          { question: 'Search in a rotated sorted array', difficulty: 'MEDIUM', hint: 'Determine which half is sorted first', order: 1 },
          { question: 'Find minimum in rotated sorted array', difficulty: 'MEDIUM', hint: 'Binary search on the pivot', order: 2 },
          { question: 'Koko eating bananas — apply binary search on the answer', difficulty: 'MEDIUM', hint: 'Binary search on speed, not the array', order: 3 },
        ],
      },
    },
  })
  problems.push(p4)

  // Problem 5 — Linked List Cycle
  const p5 = await prisma.problem.create({
    data: {
      title:      'Linked List Cycle',
      source:     'LEETCODE',
      sourceUrl:  'https://leetcode.com/problems/linked-list-cycle/',
      difficulty: 'EASY',
      tags:       JSON.stringify(['Linked List', 'Two Pointers']),
      companyTags:JSON.stringify(['Amazon', 'Microsoft', 'Google']),
      addedById:  admin.id,

      realWorldContext: "Floyd's cycle detection algorithm (fast/slow pointers) is used in OS memory leak detection, deadlock detection in database transaction managers, and cryptocurrency blockchain validation to detect circular transaction references.",

      useCases: JSON.stringify([
        'OS memory management: detect circular references causing leaks',
        'Database deadlock detection: find cycles in transaction wait graphs',
        'Network routing: detect routing loops in distributed systems',
        'Blockchain: validate transaction chains have no circular dependencies',
        'File systems: detect circular symlinks',
      ]),

      adminNotes: "Floyd's algorithm is elegant because it uses O(1) space. The key insight: if there's a cycle, fast and slow MUST meet. Force students to prove WHY they meet — it's not obvious without thinking through the modular arithmetic.",

      followUps: {
        create: [
          { question: 'Find the node where the cycle begins', difficulty: 'MEDIUM', hint: 'After detection, move one pointer to head, advance both at same speed', order: 1 },
          { question: 'Find the length of the cycle', difficulty: 'EASY', hint: 'Count steps after detection until they meet again', order: 2 },
        ],
      },
    },
  })
  problems.push(p5)

  console.log('✓ Created', problems.length, 'problems with follow-up questions')

  // ── Create sample solutions for Alex ──────────────
  const alex = members[0]

  await prisma.solution.create({
    data: {
      problemId: p1.id,
      userId:    alex.id,
      solvedAt:  new Date(Date.now() - 2 * 86400000),

      patternIdentified: 'Array / Hashing',
      firstInstinct:     'First thought was nested loops to check every pair',
      whyThisPattern:    'Need O(1) lookup to avoid the O(n²) brute force. Hash map stores what we\'ve seen so far.',
      timeToPatternSecs: 90,

      bruteForceApproach: 'Use two nested loops. For each element i, scan all elements j > i to find a pair that sums to target. O(n²) time, O(1) space.',
      bruteForceTime:     'O(n²)',
      bruteForceSpace:    'O(1)',

      optimizedApproach: 'Single pass hash map. For each element x, check if (target - x) exists in the map. If yes, return both indices. If no, add x to the map.',
      optimizedTime:     'O(n)',
      optimizedSpace:    'O(n)',
      predictedTime:     'O(n)',
      predictedSpace:    'O(n)',

      code: `def twoSum(self, nums, target):
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i
    return []`,
      language: 'PYTHON',

      keyInsight:          'Trade O(n) space for O(n) time by storing complements in a hash map as you scan once.',
      feynmanExplanation:  "Imagine you're looking for two people in a room whose heights add up to 10 feet. Instead of comparing everyone with everyone (O(n²)), as you walk past each person, you write their height on a notepad and check if the 'missing' height is already on the notepad. One walk through the room is all you need.",
      realWorldConnection: 'Exactly how fraud detection systems work — as transactions come in, they check a hash map of recent transactions for duplicates in O(1) without scanning history.',
      followUpAnswers:     JSON.stringify([
        'Yes! If sorted, use two pointers from both ends. Move left pointer right if sum < target, right pointer left if sum > target. O(n) time, O(1) space.',
        'Return all pairs: instead of returning immediately, collect all pairs in a list. Continue scanning after finding a match.',
      ]),

      confidenceLevel: 5,
      difficultyFelt:  'EASY',

      reviewDates: JSON.stringify([
        new Date(Date.now() + 1 * 86400000).toISOString(),
        new Date(Date.now() + 7 * 86400000).toISOString(),
        new Date(Date.now() + 14 * 86400000).toISOString(),
        new Date(Date.now() + 30 * 86400000).toISOString(),
      ]),
    },
  })

  await prisma.solution.create({
    data: {
      problemId: p3.id,
      userId:    alex.id,
      solvedAt:  new Date(Date.now() - 1 * 86400000),

      patternIdentified: 'Stack',
      firstInstinct:     'Need to match brackets — stack is perfect for LIFO matching',
      whyThisPattern:    'When we see a close bracket, we need the most recently seen open bracket. That\'s LIFO = stack.',
      timeToPatternSecs: 45,

      bruteForceApproach: 'Check if string has equal counts of each bracket type. But this fails for ")(" — counts match but not valid.',
      bruteForceTime:     'O(n)',
      bruteForceSpace:    'O(1)',

      optimizedApproach: 'Use a stack. Push open brackets. When we see a close bracket, check if top of stack is the matching open bracket. If stack is empty or mismatch, invalid. At end, stack must be empty.',
      optimizedTime:     'O(n)',
      optimizedSpace:    'O(n)',
      predictedTime:     'O(n)',
      predictedSpace:    'O(n)',

      code: `def isValid(self, s):
    stack = []
    pairs = {')': '(', '}': '{', ']': '['}
    for char in s:
        if char in '({[':
            stack.append(char)
        elif char in pairs:
            if not stack or stack[-1] != pairs[char]:
                return False
            stack.pop()
    return len(stack) == 0`,
      language: 'PYTHON',

      keyInsight:          'Stack is perfect for any nested/matching structure because it gives you the most recent unmatched element in O(1).',
      feynmanExplanation:  'Imagine you\'re reading code and keeping a plate stack of "open things I haven\'t closed yet." When you see a closing bracket, you check the top plate — if it matches, great, remove it. If it doesn\'t match, something\'s wrong.',
      realWorldConnection: 'This is exactly what every compiler does to validate syntax — the call stack in your CPU IS a stack, and function calls are just a more complex version of bracket matching.',

      confidenceLevel: 4,
      difficultyFelt:  'EASY',

      reviewDates: JSON.stringify([
        new Date(Date.now() + 3 * 86400000).toISOString(),
        new Date(Date.now() + 10 * 86400000).toISOString(),
      ]),
    },
  })

  // ── Create a sim session for Alex ─────────────────
  await prisma.simSession.create({
    data: {
      userId:       alex.id,
      problemId:    p2.id,
      timeLimitSecs: 2700,
      timeUsedSecs: 1240,
      completed:    true,
      hintUsed:     false,
      approachScore: 4,
      communicationScore: 4,
      overallScore: 4,
      whatWentWell:    'Identified the sliding window pattern quickly. Clean implementation.',
      whatToImprove:   'Spent too long on edge cases. Should have stated assumptions upfront.',
    },
  })
}

main()
  .catch(e => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())